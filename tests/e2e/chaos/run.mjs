#!/usr/bin/env node
/**
 * P1-QA-2 — Harness de caos com 6 clientes (1 DM + 5 jogadores).
 *
 * Contrato testado: `docs/REALTIME_PROTOCOL.md` (protocolVersion 1).
 *   §5 envelope de ack · §6 `sessionSnapshot` · §7 `sessionPatch`
 *   §11 turnos (CAS por revisão) · §12 reconexão/resync · §14 caos (6 clientes)
 *
 * O harness é headless: sobe um MongoDB em memória, sobe o backend real
 * (`npm run start:test`) em porta livre e fala com ele por REST + Socket.IO.
 * Nenhum frontend é necessário.
 *
 * Uso:  cd tests/e2e && node chaos/run.mjs
 */
import { spawn } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { io } from 'socket.io-client';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(E2E_DIR, '..', '..');
/** Backend sob teste. Pode ser apontado para outro checkout com
 * `CHAOS_BACKEND_DIR` (útil para validar uma branch específica). */
const BACKEND_DIR = process.env.CHAOS_BACKEND_DIR
  ? path.resolve(process.env.CHAOS_BACKEND_DIR)
  : path.join(REPO_ROOT, 'backend');

const JWT_SECRET = process.env.CHAOS_JWT_SECRET ?? 'chaos-secret';
const ACK_TIMEOUT_MS = 5_000;
const EVENT_TIMEOUT_MS = 12_000;
const CLIENT_COUNT = 6;

// ---------------------------------------------------------------------------
// Infraestrutura de log e utilidades
// ---------------------------------------------------------------------------

const log = (...args) => console.log('[chaos]', ...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mintJwt(userId, username, secret = JWT_SECRET) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ user: { id: userId, username }, iat: now, exp: now + 6 * 60 * 60 });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function httpJson(url, { method = 'GET', body, token, timeoutMs = 20_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, ok: response.ok, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function findFreePort(base = 3210) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = base + Math.floor(Math.random() * 600);
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => server.close(() => resolve(true)));
      server.listen(candidate, '127.0.0.1');
    });
    if (free) return candidate;
  }
  throw new Error('Não foi possível encontrar uma porta livre para o backend.');
}

function hashTokens(tokens) {
  const list = [...tokens.values()]
    .map((token) => ({
      id: String(token._id),
      name: token.name ?? null,
      squareId: token.squareId ?? null,
      remainingMovement: token.remainingMovement ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify(list)).digest('hex').slice(0, 16);
}

function hashInitiative(initiative) {
  const list = initiative.map((entry) => ({
    id: String(entry._id ?? ''),
    tokenId: entry.tokenId ? String(entry.tokenId) : null,
    name: entry.characterName ?? null,
    current: !!entry.isCurrentTurn,
  }));
  return createHash('sha256').update(JSON.stringify(list)).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Estado por cliente
// ---------------------------------------------------------------------------

function createClientState(label, userId) {
  return {
    label,
    userId,
    socket: null,
    revision: -1,
    tokens: new Map(),
    initiative: [],
    sceneId: null,
    snapshots: 0,
    patches: 0,
    legacyEvents: 0,
    actionErrors: [],
    events: [],
    reconnects: 0,
  };
}

function applySnapshot(state, snapshot) {
  if (!snapshot) return;
  state.snapshots += 1;
  state.revision = typeof snapshot.revision === 'number' ? snapshot.revision : state.revision;
  state.tokens = new Map((snapshot.tokens ?? []).map((token) => [String(token._id), token]));
  state.initiative = snapshot.initiative ?? [];
  state.sceneId = snapshot.activeScene?._id ? String(snapshot.activeScene._id) : state.sceneId;
}

function applyPatch(state, patch) {
  if (!patch) return;
  state.patches += 1;
  const revision = typeof patch.revision === 'number' ? patch.revision : state.revision;
  if (revision <= state.revision) return; // evento atrasado/duplicado é ignorado (§7.1)
  state.revision = revision;
  const changes = patch.changes ?? {};
  if (Array.isArray(changes.tokens)) {
    state.tokens = new Map(changes.tokens.map((token) => [String(token._id), token]));
  }
  for (const update of changes.tokenUpdates ?? []) {
    const current = state.tokens.get(String(update.tokenId));
    if (current) state.tokens.set(String(update.tokenId), { ...current, ...update.patch });
  }
  for (const removed of changes.tokensRemoved ?? []) {
    state.tokens.delete(String(removed));
  }
  if (Array.isArray(changes.initiative)) {
    state.initiative = changes.initiative;
  }
  if (changes.activeScene !== undefined) {
    state.sceneId = changes.activeScene?._id ? String(changes.activeScene._id) : null;
  }
}

/** Estado legado (`initialSessionState`/`sessionStateUpdated`) — compatibilidade §15. */
function applyLegacyState(state, payload) {
  if (!payload) return;
  state.legacyEvents += 1;
  if (Array.isArray(payload.tokens)) {
    state.tokens = new Map(payload.tokens.map((token) => [String(token._id), token]));
  }
  if (Array.isArray(payload.initiative)) {
    state.initiative = payload.initiative;
  }
  if (payload.activeScene?._id) {
    state.sceneId = String(payload.activeScene._id);
  }
}

function rebuildInitiative(entriesById, order, currentTurnId) {
  const list = [];
  for (const id of order ?? []) {
    const entry = entriesById.get(String(id));
    if (entry) list.push(entry);
  }
  for (const entry of entriesById.values()) {
    if (!list.some((item) => String(item._id) === String(entry._id))) list.push(entry);
  }
  for (const entry of list) {
    entry.isCurrentTurn = currentTurnId ? String(entry._id) === String(currentTurnId) : !!entry.isCurrentTurn;
  }
  return list;
}

function applyLegacyInitiative(state, payload) {
  state.legacyEvents += 1;
  const byId = new Map(state.initiative.map((entry) => [String(entry._id), entry]));
  if (payload.entry) byId.set(String(payload.entry._id), payload.entry);
  if (payload.order) {
    state.initiative = rebuildInitiative(byId, payload.order, payload.currentTurnId ?? null);
    return;
  }
  if (payload.currentEntryId) {
    state.initiative = state.initiative.map((entry) => ({
      ...entry,
      isCurrentTurn: String(entry._id) === String(payload.currentEntryId),
    }));
    return;
  }
  if (payload.currentTurnId !== undefined) {
    state.initiative = rebuildInitiative(byId, null, payload.currentTurnId ?? null);
    return;
  }
  if (payload.entryId) {
    byId.delete(String(payload.entryId));
    state.initiative = [...byId.values()];
  }
}

function attachClient(state, socket) {
  state.socket = socket;
  socket.onAny((event, ...args) => {
    const payload = args[0];
    state.events.push({ event, payload, at: Date.now() });
    if (state.events.length > 800) state.events.shift();

    switch (event) {
      case 'sessionSnapshot':
        applySnapshot(state, payload);
        break;
      case 'sessionPatch':
        applyPatch(state, payload);
        break;
      case 'initialSessionState':
      case 'sessionStateUpdated':
        applyLegacyState(state, payload);
        break;
      case 'tokenPlaced': {
        state.legacyEvents += 1;
        if (payload?._id) state.tokens.set(String(payload._id), payload);
        break;
      }
      case 'tokenMoved':
      case 'tokenUpdated': {
        state.legacyEvents += 1;
        const tokenId = String(payload?.tokenId ?? payload?._id ?? '');
        const current = state.tokens.get(tokenId);
        if (current) {
          const patch = payload?.patch ?? payload;
          state.tokens.set(tokenId, {
            ...current,
            squareId: patch.squareId ?? current.squareId,
            remainingMovement: patch.remainingMovement ?? current.remainingMovement,
            name: patch.name ?? current.name,
          });
        }
        break;
      }
      case 'tokenRemoved': {
        state.legacyEvents += 1;
        state.tokens.delete(String(payload?.tokenId ?? ''));
        break;
      }
      case 'initiativeEntryAdded':
      case 'initiativeEntryUpdated':
      case 'initiativeEntryRemoved':
      case 'initiativeOrderUpdated':
      case 'initiativeTurnAdvanced':
      case 'initiativeReset':
        applyLegacyInitiative(state, payload);
        break;
      case 'actionError':
        state.actionErrors.push(payload);
        break;
      default:
        break;
    }
  });
}

function waitForEvent(state, eventName, predicate = () => true, timeoutMs = EVENT_TIMEOUT_MS) {
  const existing = state.events.find((entry) => entry.event === eventName && predicate(entry.payload));
  if (existing) return Promise.resolve(existing.payload);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.socket?.off(eventName, listener);
      reject(
        new Error(
          `Evento "${eventName}" não recebido em ${timeoutMs}ms (cliente ${state.label}). ` +
            `Recebidos: ${[...new Set(state.events.map((entry) => entry.event))].join(', ') || '(nenhum)'}.`,
        ),
      );
    }, timeoutMs);
    const listener = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      state.socket?.off(eventName, listener);
      resolve(payload);
    };
    state.socket?.on(eventName, listener);
  });
}

function emitWithAck(socket, event, payload, timeoutMs = ACK_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    socket.emit(event, payload, (ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

/**
 * `joinTable` responde ack (§8). O contrato não fixa o formato do payload:
 * tentamos `{ tableId }` e, sem ack, o formato legado `tableId` (string).
 * O formato que funciona é memorizado para não repetir a sondagem em todos os
 * clientes. Se a primeira sondagem falhar nos dois formatos, o timeout é
 * reduzido para os clientes seguintes (o backend provavelmente ainda não
 * implementa acks) e o relatório continua blaming o item de contrato certo.
 */
let joinPayloadShape = null;
let joinProbeTimeout = ACK_TIMEOUT_MS;

async function joinTable(socket, tableId) {
  if (joinPayloadShape === 'object') {
    return { ack: await emitWithAck(socket, 'joinTable', { tableId }, joinProbeTimeout), payloadShape: 'object' };
  }
  if (joinPayloadShape === 'string') {
    return { ack: await emitWithAck(socket, 'joinTable', tableId, joinProbeTimeout), payloadShape: 'string' };
  }
  const objectAck = await emitWithAck(socket, 'joinTable', { tableId }, joinProbeTimeout);
  if (objectAck) {
    joinPayloadShape = 'object';
    return { ack: objectAck, payloadShape: 'object' };
  }
  const stringAck = await emitWithAck(socket, 'joinTable', tableId, joinProbeTimeout);
  if (stringAck) {
    joinPayloadShape = 'string';
  } else {
    joinProbeTimeout = 1_500;
  }
  return { ack: stringAck, payloadShape: 'string' };
}

function connectSocket(url, token, label) {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      reconnection: false,
      timeout: 10_000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Socket "${label}" não conectou em 12s.`));
    }, 12_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Socket "${label}" falhou no handshake: ${error.message}`));
    });
  });
}

async function waitForRevision(state, minRevision, timeoutMs = EVENT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.revision >= minRevision) return state.revision;
    await sleep(50);
  }
  return state.revision;
}

// ---------------------------------------------------------------------------
// Coleta de resultados
// ---------------------------------------------------------------------------

const checks = [];
const errors = [];

function record(id, name, status, detail, evidence = {}) {
  checks.push({ id, name, status, detail: detail ?? null, evidence });
  log(`${status === 'PASS' ? '✓' : '✗'} ${id} ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(id, name, detail, evidence = {}) {
  record(id, name, 'FAIL', detail, evidence);
  errors.push({ id, name, detail });
}

function pass(id, name, detail, evidence = {}) {
  record(id, name, 'PASS', detail, evidence);
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();
  const clients = [];
  let mongo = null;
  let backend = null;
  let backendLog = [];
  let tmpDir = null;
  let baseUrl = null;
  let table = null;
  let sceneId = null;
  let report = null;

  const cleanup = async () => {
    for (const client of clients) {
      try {
        client.socket?.close();
      } catch {
        // socket já encerrado
      }
    }
    if (backend && backend.pid) {
      try {
        process.kill(-backend.pid, 'SIGTERM');
      } catch {
        try {
          backend.kill('SIGTERM');
        } catch {
          // processo já encerrado
        }
      }
      await sleep(1_500);
      try {
        process.kill(-backend.pid, 'SIGKILL');
      } catch {
        // processo já encerrado
      }
    }
    if (mongo) {
      try {
        await mongo.stop();
      } catch {
        // mongo já encerrado
      }
    }
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true });
      } catch {
        // diretório temporário já removido
      }
    }
  };

  try {
    // ---------------------------------------------------------------------
    // 1. Infraestrutura
    // ---------------------------------------------------------------------
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tavern-chaos-'));
    const uploadDir = path.join(tmpDir, 'uploads');
    const port = await findFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    log(`porta do backend: ${port}`);

    mongo = await MongoMemoryServer.create();
    const mongoUri = mongo.getUri();
    log(`mongo em memória: ${mongoUri}`);

    backend = spawn('npm', ['run', 'start:test'], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        JWT_SECRET,
        MONGO_URI: mongoUri,
        STORAGE_DRIVER: 'local',
        LOCAL_UPLOAD_DIR: uploadDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    const capture = (chunk) => {
      backendLog.push(chunk.toString());
      if (backendLog.length > 200) backendLog.shift();
    };
    backend.stdout?.on('data', capture);
    backend.stderr?.on('data', capture);

    let backendExited = null;
    backend.on('exit', (code, signal) => {
      backendExited = { code, signal };
    });

    // ---------------------------------------------------------------------
    // 2. Backend pronto
    // ---------------------------------------------------------------------
    const readyDeadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      if (backendExited) {
        throw new Error(
          `Backend encerrou antes de ficar pronto (code=${backendExited.code}, signal=${backendExited.signal}).\n` +
            `--- saída do backend ---\n${backendLog.join('').slice(-4000)}`,
        );
      }
      try {
        const response = await fetch(`${baseUrl}/metrics`, { signal: AbortSignal.timeout(2_000) });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        // ainda subindo
      }
      await sleep(500);
    }
    if (!ready) {
      throw new Error(
        `Backend não respondeu GET /metrics em 90s.\n--- saída do backend ---\n${backendLog.join('').slice(-4000)}`,
      );
    }
    pass('C0', 'backend no ar com /metrics', `${baseUrl}`);

    // ---------------------------------------------------------------------
    // 3. Elenco: 1 DM + 5 jogadores
    // ---------------------------------------------------------------------
    const users = [];
    for (let index = 0; index < CLIENT_COUNT; index += 1) {
      const role = index === 0 ? 'dm' : `player${index}`;
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const username = `${role}-${unique}`.slice(0, 50);
      const email = `${role}-${unique}@test.dev`;
      const password = 'Test123!';
      const response = await httpJson(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        body: { username, email, password },
      });
      if (response.status !== 201) {
        throw new Error(`Falha ao registrar ${email}: ${response.status} ${response.text}`);
      }
      const id = String(response.json?.user?.id ?? '');
      if (!id) throw new Error(`Resposta de registro sem user.id: ${response.text}`);
      // O login REST é limitado a 5 por 5 min por IP; o harness assina o token
      // de teste localmente com o mesmo segredo/payload do backend.
      users.push({ role, id, username, email, token: mintJwt(id, username) });
    }

    const tokenProbe = await httpJson(`${baseUrl}/api/tables/mytables`, { token: users[0].token });
    if (tokenProbe.status === 401) {
      throw new Error(
        'Token assinado localmente foi recusado (401). O payload/segredo do JWT mudou no backend.',
      );
    }
    pass('C1', 'elenco registrado (1 DM + 5 jogadores)', `${users.length} usuários`, {
      users: users.map((user) => ({ role: user.role, id: user.id })),
    });

    // ---------------------------------------------------------------------
    // 4. Mesa, cena e jogadores
    // ---------------------------------------------------------------------
    const tableResponse = await httpJson(`${baseUrl}/api/tables/create`, {
      method: 'POST',
      token: users[0].token,
      body: { name: `Mesa Caos ${Date.now()}` },
    });
    if (tableResponse.status !== 201) {
      throw new Error(`Falha ao criar mesa: ${tableResponse.status} ${tableResponse.text}`);
    }
    table = tableResponse.json;
    const tableId = String(table._id);

    const sceneResponse = await httpJson(`${baseUrl}/api/tables/${tableId}/scenes`, {
      method: 'POST',
      token: users[0].token,
      body: { name: 'Cena Caos', gridWidth: 30, gridHeight: 30, type: 'battlemap' },
    });
    if (sceneResponse.status !== 201) {
      throw new Error(`Falha ao criar cena: ${sceneResponse.status} ${sceneResponse.text}`);
    }
    const createdSceneId = String(sceneResponse.json?._id ?? '');

    for (const user of users.slice(1)) {
      const joinResponse = await httpJson(`${baseUrl}/api/tables/join`, {
        method: 'POST',
        token: user.token,
        body: { inviteCode: table.inviteCode },
      });
      if (!joinResponse.ok) {
        throw new Error(`Falha ao adicionar ${user.role} na mesa: ${joinResponse.status} ${joinResponse.text}`);
      }
    }
    sceneId = table.activeScene ? String(table.activeScene) : createdSceneId;
    pass('C2', 'mesa, cena e jogadores criados via REST', `table=${tableId} scene=${sceneId}`, {
      tableId,
      inviteCode: table.inviteCode,
      createdSceneId,
      activeSceneId: String(table.activeScene ?? ''),
    });

    // ---------------------------------------------------------------------
    // 5. Conexões e snapshot inicial
    // ---------------------------------------------------------------------
    for (const user of users) {
      const state = createClientState(user.role, user.id);
      const socket = await connectSocket(baseUrl, user.token, user.role);
      attachClient(state, socket);
      clients.push(state);
    }

    const joinResults = [];
    for (const client of clients) {
      const { ack, payloadShape } = await joinTable(client.socket, tableId);
      joinResults.push({ label: client.label, ack, payloadShape });
      client.joinPayloadShape = payloadShape;
      client.joinAck = ack;
    }

    const withoutAck = joinResults.filter((entry) => !entry.ack);
    const notOk = joinResults.filter((entry) => entry.ack && entry.ack.ok !== true);
    if (withoutAck.length === 0 && notOk.length === 0) {
      pass(
        'C3',
        'joinTable responde ack para os 6 clientes',
        `payload=${joinResults[0]?.payloadShape} revision=${joinResults[0]?.ack?.revision}`,
        { acks: joinResults.map((entry) => ({ label: entry.label, revision: entry.ack?.revision })) },
      );
    } else {
      fail(
        'C3',
        'joinTable responde ack para os 6 clientes',
        `sem ack: ${withoutAck.map((entry) => entry.label).join(', ') || 'nenhum'}; ` +
          `com erro: ${notOk.map((entry) => `${entry.label}=${entry.ack?.error?.code}`).join(', ') || 'nenhum'} ` +
          '— falta o envelope de ack do protocolo realtime (§5).',
        { withoutAck: withoutAck.map((entry) => entry.label), notOk: notOk.map((entry) => entry.label) },
      );
    }

    const authorized = joinResults.filter((entry) => entry.ack && entry.ack.ok === true);
    const snapshotResults = await Promise.all(
      authorized.map(async (entry) => {
        const client = clients.find((candidate) => candidate.label === entry.label);
        try {
          const snapshot = await waitForEvent(
            client,
            'sessionSnapshot',
            (payload) => payload?.tableId === tableId,
          );
          return { label: entry.label, snapshot, error: null };
        } catch (error) {
          return { label: entry.label, snapshot: null, error: error.message };
        }
      }),
    );
    const snapshots = snapshotResults.filter((result) => result.snapshot).map((result) => result.snapshot);
    const snapshotFailures = snapshotResults.filter((result) => result.error);

    if (authorized.length !== clients.length) {
      fail(
        'C4',
        '6 clientes recebem o mesmo snapshot',
        `não avaliado: ${clients.length - authorized.length} cliente(s) não obtiveram ack em joinTable (ver C3).`,
      );
    } else if (snapshotFailures.length > 0) {
      fail(
        'C4',
        '6 clientes recebem o mesmo snapshot',
        snapshotFailures.map((result) => `${result.label}: ${result.error}`).join(' | '),
      );
    } else {
      const revisions = [...new Set(snapshots.map((snapshot) => snapshot.revision))];
      const tableIds = [...new Set(snapshots.map((snapshot) => snapshot.tableId))];
      const roles = snapshots.map((snapshot) => snapshot.you?.role);
      if (tableIds.length === 1 && tableIds[0] === tableId) {
        if (revisions.length === 1) {
          pass('C4', '6 clientes recebem o mesmo snapshot', `revision=${revisions[0]} roles=${roles.join(',')}`, {
            revision: revisions[0],
            roles,
          });
        } else {
          fail(
            'C4',
            '6 clientes recebem o mesmo snapshot',
            `revisões divergentes: ${revisions.join(', ')}`,
            { revisions },
          );
        }
      } else {
        fail('C4', '6 clientes recebem o mesmo snapshot', `tableIds divergentes: ${tableIds.join(', ')}`, {
          tableIds,
        });
      }
    }

    // ---------------------------------------------------------------------
    // 6. DM coloca tokens
    // ---------------------------------------------------------------------
    const dm = clients[0];
    const tokenNames = [];
    let placementAck = null;
    for (let index = 0; index < 2; index += 1) {
      const name = `Token Caos ${index + 1}`;
      tokenNames.push(name);
      const ack = await emitWithAck(dm.socket, 'requestPlaceToken', {
        tableId,
        sceneId,
        squareId: `sq-${index}`,
        name,
        size: 'Pequeno/Médio',
        movement: 30,
      });
      if (!ack) {
        fail(
          'C5',
          'DM coloca token com ack',
          `requestPlaceToken sem ack — falta o envelope de ack (§5).`,
        );
        break;
      }
      if (ack.ok !== true) {
        fail('C5', 'DM coloca token com ack', `requestPlaceToken respondeu ${JSON.stringify(ack)}`);
        break;
      }
      placementAck = ack;
    }
    if (placementAck) {
      pass(
        'C5',
        'DM coloca token com ack',
        `${tokenNames.length} token(s), revision=${placementAck.revision}`,
        { tokens: tokenNames, revision: placementAck.revision },
      );
    }

    const propagation = await Promise.all(
      clients.map(async (client) => {
        const patch = await waitForEvent(
          client,
          'sessionPatch',
          (payload) =>
            payload?.tableId === tableId &&
            (payload?.changes?.tokens?.length > 0 || (payload?.changes?.tokenUpdates?.length ?? 0) > 0),
          5_000,
        ).catch(() => null);
        if (patch) return { label: client.label, via: 'sessionPatch' };
        const legacy = client.events.find((entry) => entry.event === 'tokenPlaced');
        return { label: client.label, via: legacy ? 'legacy' : 'none' };
      }),
    );

    const withPatches = propagation.filter((entry) => entry.via === 'sessionPatch');
    const withLegacy = propagation.filter((entry) => entry.via === 'legacy');
    const withoutState = propagation.filter((entry) => entry.via === 'none');
    if (withPatches.length === clients.length) {
      pass(
        'C6',
        'estado do token chega a todos os clientes (sessionPatch)',
        `sessionPatch em ${withPatches.length}/${clients.length}`,
        { withPatches: withPatches.length, withLegacy: withLegacy.length },
      );
    } else {
      fail(
        'C6',
        'estado do token chega a todos os clientes (sessionPatch)',
        `sessionPatch em ${withPatches.length}/${clients.length}; ` +
          `evento legado em ${withLegacy.length}/${clients.length}; ` +
          `sem estado em ${withoutState.length}/${clients.length} — ` +
          'o caminho canônico §7 (`sessionPatch`) não está implementado.',
        {
          withPatches: withPatches.length,
          withLegacy: withLegacy.length,
          withoutState: withoutState.map((entry) => entry.label),
        },
      );
      if (withoutState.length > 0) {
        errors.push({
          id: 'C6',
          name: 'estado do token chega a todos os clientes (sessionPatch)',
          detail: `clientes sem qualquer estado do token: ${withoutState.map((entry) => entry.label).join(', ')}.`,
        });
      }
    }

    // ---------------------------------------------------------------------
    // 7. Iniciativa: o DM avança o turno
    // ---------------------------------------------------------------------
    const turnAck = await emitWithAck(dm.socket, 'requestNextTurn', { tableId, sceneId });
    if (!turnAck) {
      fail('C7', 'DM avança o turno com ack', 'requestNextTurn sem ack — falta o envelope de ack (§5).');
    } else if (turnAck.ok !== true) {
      fail('C7', 'DM avança o turno com ack', `requestNextTurn respondeu ${JSON.stringify(turnAck)}`);
    } else {
      await sleep(1_000);
      pass('C7', 'DM avança o turno com ack', `revision=${turnAck.revision}`, {
        revision: turnAck.revision,
      });
      const currentEntries = clients.map((client) => {
        const current = client.initiative.find((entry) => entry.isCurrentTurn);
        return current ? String(current._id) : null;
      });
      const unique = [...new Set(currentEntries)];
      if (unique.length === 1 && unique[0]) {
        pass('C8', 'turno convergente em todos os clientes', `entrada atual=${unique[0]}`, {
          currentEntries,
        });
      } else {
        fail(
          'C8',
          'turno convergente em todos os clientes',
          `entradas atuais divergentes: ${currentEntries.join(', ')}`,
          { currentEntries },
        );
      }
    }

    // ---------------------------------------------------------------------
    // 8. Queda de 2 sockets, reconexão e resync
    // ---------------------------------------------------------------------
    const dropped = clients.slice(2, 4);
    const referenceRevision = Math.max(...clients.map((client) => client.revision));
    for (const client of dropped) {
      client.socket?.close();
      client.socket = null;
      client.tokens = new Map();
      client.initiative = [];
      client.revision = -1;
      client.events = [];
    }

    for (const client of dropped) {
      const user = users.find((candidate) => candidate.id === client.userId);
      const socket = await connectSocket(baseUrl, user.token, `${client.label}-reconnect`);
      attachClient(client, socket);
      client.reconnects += 1;
      const { ack } = await joinTable(socket, tableId);
      if (!ack) {
        fail('C9', 'reconexão responde ack em joinTable', `${client.label} sem ack após reconectar`);
        continue;
      }
      const resyncAck = await emitWithAck(socket, 'requestResync', { tableId });
      if (!resyncAck) {
        fail('C9', 'requestResync responde ack', `${client.label} sem ack — falta o envelope de ack (§5).`);
        continue;
      }
      try {
        const snapshot = await waitForEvent(
          client,
          'sessionSnapshot',
          (payload) => payload?.tableId === tableId,
        );
        if (snapshot.revision >= referenceRevision) {
          pass(
            'C9',
            'clientes reconectados recuperam a revisão',
            `${client.label} recuperou revision=${snapshot.revision} (referência ${referenceRevision})`,
            { recovered: snapshot.revision, reference: referenceRevision },
          );
        } else {
          fail(
            'C9',
            'clientes reconectados recuperam a revisão',
            `${client.label} recuperou revision=${snapshot.revision}, referência ${referenceRevision}`,
            { recovered: snapshot.revision, reference: referenceRevision },
          );
        }
      } catch (error) {
        fail('C9', 'clientes reconectados recuperam a revisão', error.message);
      }
    }

    // ---------------------------------------------------------------------
    // 9. Dois requestNextTurn concorrentes com o mesmo expectedRevision
    // ---------------------------------------------------------------------
    const dmSecondSocket = await connectSocket(baseUrl, users[0].token, 'dm-second');
    const dmSecondState = createClientState('dm-second', users[0].id);
    attachClient(dmSecondState, dmSecondSocket);
    clients.push(dmSecondState);
    await joinTable(dmSecondSocket, tableId);

    const expectedRevision = Math.max(...clients.map((client) => client.revision));
    // Antes da corrida, deixa todos os clientes alcançarem a revisão mais alta
    // conhecida: um `expectedRevision` obsoleto causaria dois CONFLICT em vez
    // de 1 ok + 1 CONFLICT e mascararia o defeito real.
    for (const client of clients) {
      await waitForRevision(client, expectedRevision, 5_000);
    }
    const concurrent = await Promise.all([
      emitWithAck(dm.socket, 'requestNextTurn', { tableId, sceneId, expectedRevision }),
      emitWithAck(dmSecondSocket, 'requestNextTurn', { tableId, sceneId, expectedRevision }),
    ]);
    const oks = concurrent.filter((ack) => ack && ack.ok === true);
    const conflicts = concurrent.filter(
      (ack) => ack && ack.ok === false && ack.error?.code === 'CONFLICT',
    );
    const otherErrors = concurrent
      .filter((ack) => ack && ack.ok === false && ack.error?.code !== 'CONFLICT')
      .map((ack) => ack.error?.code);

    if (oks.length === 1 && conflicts.length === 1) {
      pass(
        'C10',
        'requestNextTurn concorrente: 1 ok + 1 CONFLICT',
        `expectedRevision=${expectedRevision}`,
        { expectedRevision, acks: concurrent },
      );
    } else {
      fail(
        'C10',
        'requestNextTurn concorrente: 1 ok + 1 CONFLICT',
        `ok=${oks.length} conflict=${conflicts.length} outros=${otherErrors.join(',') || 'nenhum'} ` +
          '(§11 exige CAS por revisão)',
        { expectedRevision, acks: concurrent },
      );
    }

    // ---------------------------------------------------------------------
    // 10. Convergência final
    // ---------------------------------------------------------------------
    const finalRevision = Math.max(...clients.map((client) => client.revision));
    for (const client of clients) {
      await waitForRevision(client, finalRevision, 5_000);
    }
    await sleep(1_000);

    const perClient = clients.map((client) => ({
      label: client.label,
      userId: client.userId,
      revision: client.revision,
      tokenHash: hashTokens(client.tokens),
      initiativeHash: hashInitiative(client.initiative),
      tokens: client.tokens.size,
      initiative: client.initiative.length,
      snapshots: client.snapshots,
      patches: client.patches,
      legacyEvents: client.legacyEvents,
      actionErrors: client.actionErrors.length,
      reconnects: client.reconnects,
    }));

    const tokenHashes = [...new Set(perClient.map((client) => client.tokenHash))];
    const initiativeHashes = [...new Set(perClient.map((client) => client.initiativeHash))];
    const revisions = [...new Set(perClient.map((client) => client.revision))];
    const totalTokens = perClient.reduce((sum, client) => sum + client.tokens, 0);
    const totalInitiative = perClient.reduce((sum, client) => sum + client.initiative, 0);

    const converged =
      revisions.length === 1 &&
      revisions[0] >= 0 &&
      tokenHashes.length === 1 &&
      initiativeHashes.length === 1 &&
      totalTokens > 0 &&
      totalInitiative > 0;

    if (converged) {
      pass(
        'C11',
        'convergência final (revisão, tokens e iniciativa)',
        `revision=${revisions[0]} tokens=${tokenHashes[0]} iniciativa=${initiativeHashes[0]}`,
        { revisions, tokenHashes, initiativeHashes },
      );
    } else {
      fail(
        'C11',
        'convergência final (revisão, tokens e iniciativa)',
        `revisões=${revisions.join(',')} tokens=${tokenHashes.join(',')} ` +
          `iniciativa=${initiativeHashes.join(',')} ` +
          `(tokens=${totalTokens} iniciativa=${totalInitiative}) — ` +
          'sem estado compartilhado a convergência não pode ser declarada.',
        { revisions, tokenHashes, initiativeHashes, totalTokens, totalInitiative },
      );
    }

    const unexpectedActionErrors = perClient.filter((client) => client.actionErrors > 0);
    if (unexpectedActionErrors.length === 0) {
      pass('C12', 'nenhum actionError inesperado', '0 actionError recebidos');
    } else {
      fail(
        'C12',
        'nenhum actionError inesperado',
        `actionError em: ${unexpectedActionErrors.map((client) => client.label).join(', ')}`,
      );
    }

    report = {
      generatedAt: new Date().toISOString(),
      protocolVersion: 1,
      durationMs: Date.now() - startedAt,
      backend: { url: baseUrl, port: Number(new URL(baseUrl).port) },
      table: { id: tableId, inviteCode: table.inviteCode, sceneId },
      clients: perClient,
      revision: converged ? revisions[0] : null,
      tokenHash: converged ? tokenHashes[0] : null,
      initiativeHash: converged ? initiativeHashes[0] : null,
      errors,
      checks,
      result: checks.every((check) => check.status === 'PASS') ? 'PASS' : 'FAIL',
    };
  } catch (error) {
    fail('FATAL', 'execução do harness', error instanceof Error ? error.message : String(error));
    if (error?.stack) console.error(error.stack);
    report = {
      generatedAt: new Date().toISOString(),
      protocolVersion: 1,
      durationMs: Date.now() - startedAt,
      backend: baseUrl ? { url: baseUrl } : null,
      table: table ? { id: String(table._id), inviteCode: table.inviteCode, sceneId } : null,
      clients: clients.map((client) => ({
        label: client.label,
        userId: client.userId,
        revision: client.revision,
        tokenHash: hashTokens(client.tokens),
        initiativeHash: hashInitiative(client.initiative),
        snapshots: client.snapshots,
        patches: client.patches,
        legacyEvents: client.legacyEvents,
        actionErrors: client.actionErrors.length,
      })),
      revision: null,
      tokenHash: null,
      initiativeHash: null,
      errors,
      checks,
      result: 'FAIL',
    };
  } finally {
    await cleanup();
  }

  console.log('');
  console.log('===== RELATÓRIO DE CAOS (JSON) =====');
  console.log(JSON.stringify(report, null, 2));
  console.log('===== FIM DO RELATÓRIO =====');

  const failed = checks.filter((check) => check.status !== 'PASS');
  if (failed.length > 0) {
    console.error('');
    console.error('[chaos] FALHOU. Itens de contrato ausentes:');
    for (const check of failed) {
      console.error(`  - ${check.id} ${check.name}: ${check.detail ?? ''}`);
    }
    console.error('[chaos] Veja docs/REALTIME_PROTOCOL.md §5, §6, §7, §11 e §14.');
    process.exitCode = 1;
    return;
  }
  log('PASS: todos os itens do contrato de caos foram satisfeitos.');
}

await main();
