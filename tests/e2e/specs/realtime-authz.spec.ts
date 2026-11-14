/**
 * P1-QA-1 — Autorização, acks e revisão monotônica do protocolo realtime.
 *
 * Contrato testado: `docs/REALTIME_PROTOCOL.md` (protocolVersion 1).
 *   §3  papéis e permissões      §5  envelope de ack e `actionError`
 *   §6  `sessionSnapshot`         §8  eventos cliente→servidor
 *   §10 autorização por entidade §14 testes obrigatórios de backend.
 *
 * O arquivo não depende de navegador: usa o fixture `request` do Playwright
 * para o REST e `socket.io-client` para o canal realtime.
 *
 * Duas decisões de infraestrutura, explicadas aqui para a revisão:
 *
 * 1. **JWT assinado localmente.** O login REST é limitado a 5 requisições a
 *    cada 5 min por IP (`backend/src/middleware/rateLimit.ts`) e esse bucket é
 *    compartilhado com `happy-path.spec.ts`. Para não competir por essa cota,
 *    o harness assina os tokens de teste localmente (HS256, mesmo segredo e
 *    mesmo payload do backend: `{ user: { id, username } }`) e valida o token
 *    contra um endpoint protegido antes de usá-lo. O caminho de login real
 *    segue coberto por `happy-path.spec.ts`.
 *
 * 2. **Setup compartilhado entre workers.** O Playwright distribui os testes
 *    deste arquivo entre vários workers (config com `fullyParallel: true`), e
 *    cada worker executaria o `beforeAll` — o que estouraria o limitador de
 *    criação (`limitCreate`, 20 por 5 min por IP). O setup é feito uma única
 *    vez por execução, com lock em disco, e compartilhado pelos workers.
 */
import { test, expect, request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { createHmac } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const getBackendUrl = () => process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3100';

const ACK_TIMEOUT_MS = 6_000;
const EVENT_TIMEOUT_MS = 8_000;
const NEGATIVE_WINDOW_MS = 1_500;

/** Mesmo segredo padrão aplicado por `tests/e2e/global-setup.ts`. */
const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret';
const JWT_TTL_SECONDS = 6 * 60 * 60;

// ---------------------------------------------------------------------------
// Tipos do contrato (docs/REALTIME_PROTOCOL.md)
// ---------------------------------------------------------------------------

type AckErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

type AckOk = { ok: true; revision: number; serverNowMs: number; [key: string]: unknown };
type AckErr = {
  ok: false;
  error: { code: AckErrorCode; message: string; details?: unknown };
  revision: number;
  serverNowMs: number;
};
type Ack = AckOk | AckErr;

type TokenDto = {
  _id: string;
  tableId?: string;
  sceneId?: string;
  squareId: string;
  name: string;
  owner?: { _id: string; username: string } | null;
  movement?: number;
  remainingMovement?: number;
};

type InitiativeEntryDto = {
  _id: string;
  characterName: string;
  tokenId?: string;
  isCurrentTurn: boolean;
};

type SessionSnapshot = {
  protocolVersion: number;
  tableId: string;
  revision: number;
  serverNowMs: number;
  you: { userId: string; username: string; role: string; permissions: string[] };
  presence: Array<{ userId: string; username: string; role: string; socketCount: number }>;
  table: { _id: string; name: string; activeSceneId?: string | null };
  activeScene: { _id: string; name?: string } | null;
  scenes: Array<{ _id: string }>;
  tokens: TokenDto[];
  initiative: InitiativeEntryDto[];
  measurements: unknown[];
  auras: unknown[];
};

type SessionPatch = {
  protocolVersion: number;
  tableId: string;
  revision: number;
  baseRevision: number;
  serverNowMs: number;
  changes: {
    tokens?: TokenDto[];
    tokenUpdates?: Array<{ tokenId: string; patch: Partial<TokenDto> }>;
    tokensRemoved?: string[];
    initiative?: InitiativeEntryDto[];
    activeScene?: { _id: string } | null;
    sessionStatus?: { status: string; pauseUntil: string | null; serverNowMs: number };
  };
};

type ActionError = {
  event: string;
  error: { code: AckErrorCode; message: string; details?: unknown };
  revision: number;
  serverNowMs: number;
};

type TestUser = {
  id: string;
  username: string;
  email: string;
  password: string;
  token: string;
};

type TableInfo = {
  _id: string;
  name: string;
  inviteCode: string;
  activeScene?: string;
  scenes: string[];
  status: string;
};

/** Cenário compartilhado entre os workers da execução. */
type SharedSetup = {
  createdAt: string;
  dm: TestUser;
  player: TestUser;
  other: TestUser;
  /** Mesa do DM usada pelos testes de entrada/autorização. */
  tableA: TableInfo;
  /** Mesa de outro DM, alvo do teste de IDOR. */
  tableB: TableInfo;
  /** Mesa dedicada ao teste de mutação de DM rejeitada (revisão não pode mudar). */
  tableC: TableInfo;
  /** Mesa dedicada ao teste de revisões monotônicas. */
  tableD: TableInfo;
  /** Mesa dedicada ao teste de broadcast de `sessionPatch`. */
  tableE: TableInfo;
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function mintJwt(userId: string, username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ user: { id: userId, username }, iat: now, exp: now + JWT_TTL_SECONDS });
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function createUser(api: APIRequestContext, prefix: string): Promise<TestUser> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const username = `${prefix}-${unique}`.slice(0, 50);
  const email = `${prefix}-${unique}@test.dev`;
  const password = 'Test123!';

  const response = await api.post(`${getBackendUrl()}/api/auth/register`, {
    data: { username, email, password },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao registrar ${email}: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  const id = body?.user?.id;
  if (!id) {
    throw new Error(`Resposta de registro sem user.id: ${JSON.stringify(body)}`);
  }
  return { id: String(id), username, email, password, token: mintJwt(String(id), username) };
}

async function createTable(api: APIRequestContext, token: string, name: string): Promise<TableInfo> {
  const response = await api.post(`${getBackendUrl()}/api/tables/create`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a mesa "${name}": ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as TableInfo;
}

async function joinViaInvite(api: APIRequestContext, token: string, inviteCode: string): Promise<void> {
  const response = await api.post(`${getBackendUrl()}/api/tables/join`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { inviteCode },
  });
  if (!response.ok()) {
    throw new Error(`Falha ao entrar na mesa via convite: ${response.status()} ${await response.text()}`);
  }
}

async function fetchMyTables(api: APIRequestContext, token: string): Promise<TableInfo[]> {
  const response = await api.get(`${getBackendUrl()}/api/tables/mytables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(`Falha ao listar mesas: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as TableInfo[];
}

/**
 * Confere que o token assinado localmente é aceito pelo backend. Se o backend
 * mudar o payload do JWT ou o segredo, isso falha aqui com mensagem clara em
 * vez de mascarar um 401 como falha de autorização.
 */
async function assertTokenAccepted(api: APIRequestContext, user: TestUser): Promise<void> {
  const response = await api.get(`${getBackendUrl()}/api/tables/mytables`, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  if (response.status() === 401) {
    throw new Error(
      `Token assinado localmente foi recusado (401) para ${user.email}. ` +
        'O payload/segredo do JWT mudou no backend ou JWT_SECRET difere do esperado.',
    );
  }
  if (!response.ok()) {
    throw new Error(`Endpoint protegido respondeu ${response.status()} para ${user.email}.`);
  }
}

// ---------------------------------------------------------------------------
// Setup compartilhado entre workers (lock em disco)
// ---------------------------------------------------------------------------

const SETUP_DIR = path.join(os.tmpdir(), 'tavern-qa-setup');
const SETUP_FILE = path.join(SETUP_DIR, 'realtime-authz.json');
const LOCK_FILE = path.join(SETUP_DIR, 'realtime-authz.lock');
const LOCK_STALE_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readSharedSetup(): Promise<SharedSetup | null> {
  try {
    const raw = await readFile(SETUP_FILE, 'utf8');
    return JSON.parse(raw) as SharedSetup;
  } catch {
    return null;
  }
}

async function writeSharedSetup(setup: SharedSetup): Promise<void> {
  await mkdir(SETUP_DIR, { recursive: true });
  const tmpFile = `${SETUP_FILE}.${process.pid}.tmp`;
  await writeFile(tmpFile, JSON.stringify(setup), 'utf8');
  await rename(tmpFile, SETUP_FILE);
}

async function acquireLock(): Promise<boolean> {
  await mkdir(SETUP_DIR, { recursive: true });
  try {
    const handle = await open(LOCK_FILE, 'wx');
    await handle.close();
    return true;
  } catch {
    try {
      const info = await stat(LOCK_FILE);
      if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
        await unlink(LOCK_FILE).catch(() => undefined);
        return acquireLock();
      }
    } catch {
      // o lock já foi liberado pelo outro worker
    }
    return false;
  }
}

async function releaseLock(): Promise<void> {
  await unlink(LOCK_FILE).catch(() => undefined);
}

/** O setup só vale se as mesas existirem no banco da execução corrente. */
async function isSharedSetupValid(api: APIRequestContext, setup: SharedSetup): Promise<boolean> {
  try {
    const dmTables = await fetchMyTables(api, setup.dm.token);
    if (!dmTables.some((table) => table._id === setup.tableA._id)) return false;
    const playerTables = await fetchMyTables(api, setup.player.token);
    if (!playerTables.some((table) => table._id === setup.tableA._id)) return false;
    if (!playerTables.some((table) => table._id === setup.tableC._id)) return false;
    if (!playerTables.some((table) => table._id === setup.tableD._id)) return false;
    if (!playerTables.some((table) => table._id === setup.tableE._id)) return false;
    const otherTables = await fetchMyTables(api, setup.other.token);
    if (!otherTables.some((table) => table._id === setup.tableB._id)) return false;
    return true;
  } catch {
    return false;
  }
}

async function buildSharedSetup(api: APIRequestContext): Promise<SharedSetup> {
  const dm = await createUser(api, 'dm');
  const player = await createUser(api, 'player');
  const other = await createUser(api, 'other');

  await assertTokenAccepted(api, dm);
  await assertTokenAccepted(api, player);
  await assertTokenAccepted(api, other);

  const stamp = Date.now();
  const tableA = await createTable(api, dm.token, `Mesa A ${stamp}`);
  const tableB = await createTable(api, other.token, `Mesa B ${stamp}`);
  const tableC = await createTable(api, dm.token, `Mesa C ${stamp}`);
  const tableD = await createTable(api, dm.token, `Mesa D ${stamp}`);
  const tableE = await createTable(api, dm.token, `Mesa E ${stamp}`);

  await joinViaInvite(api, player.token, tableA.inviteCode);
  await joinViaInvite(api, player.token, tableC.inviteCode);
  await joinViaInvite(api, player.token, tableD.inviteCode);
  await joinViaInvite(api, player.token, tableE.inviteCode);

  return {
    createdAt: new Date().toISOString(),
    dm,
    player,
    other,
    tableA,
    tableB,
    tableC,
    tableD,
    tableE,
  };
}

async function resolveSharedSetup(api: APIRequestContext): Promise<SharedSetup> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const existing = await readSharedSetup();
    if (existing && (await isSharedSetupValid(api, existing))) return existing;

    if (await acquireLock()) {
      try {
        // Outro worker pode ter criado o setup enquanto esperávamos o lock.
        const afterLock = await readSharedSetup();
        if (afterLock && (await isSharedSetupValid(api, afterLock))) return afterLock;
        const created = await buildSharedSetup(api);
        await writeSharedSetup(created);
        return created;
      } finally {
        await releaseLock();
      }
    }
    await sleep(250);
  }
  throw new Error('Não foi possível obter o setup compartilhado da execução.');
}

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------

function connectSocket(token: string, label: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(getBackendUrl(), {
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
    socket.on('connect_error', (error: Error) => {
      clearTimeout(timer);
      reject(new Error(`Socket "${label}" falhou no handshake: ${error.message}`));
    });
  });
}

/** Registra todos os eventos recebidos para permitir asserções negativas. */
class EventRecorder {
  private readonly listeners = new Map<string, Set<(payload: any) => void>>();
  readonly received: Array<{ event: string; payload: any; at: number }> = [];

  constructor(socket: Socket) {
    socket.onAny((event: string, ...args: any[]) => {
      const payload = args[0];
      this.received.push({ event, payload, at: Date.now() });
      for (const listener of [...(this.listeners.get(event) ?? [])]) {
        try {
          listener(payload);
        } catch {
          // listeners de espera nunca devem derrubar o socket
        }
      }
    });
  }

  on(event: string, listener: (payload: any) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: (payload: any) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  eventNames(): string[] {
    return [...new Set(this.received.map((entry) => entry.event))];
  }

  find(event: string): any | undefined {
    const entry = this.received.find((item) => item.event === event);
    return entry ? entry.payload : undefined;
  }

  /** Último payload recebido do evento (o mais recente). */
  last(event: string): any | undefined {
    const entries = this.received.filter((item) => item.event === event);
    return entries.length ? entries[entries.length - 1].payload : undefined;
  }

  waitFor(
    event: string,
    predicate: (payload: any) => boolean = () => true,
    timeoutMs = EVENT_TIMEOUT_MS,
  ): Promise<any> {
    const existing = this.received.find((item) => item.event === event && predicate(item.payload));
    if (existing) return Promise.resolve(existing.payload);

    return new Promise<any>((resolve, reject) => {
      let timer: NodeJS.Timeout;
      const listener = (payload: any) => {
        if (!predicate(payload)) return;
        clearTimeout(timer);
        this.off(event, listener);
        resolve(payload);
      };
      timer = setTimeout(() => {
        this.off(event, listener);
        reject(
          new Error(
            `Evento "${event}" não recebido em ${timeoutMs}ms. ` +
              `Eventos recebidos: ${this.eventNames().join(', ') || '(nenhum)'}.`,
          ),
        );
      }, timeoutMs);
      this.on(event, listener);
    });
  }
}

function emitWithAck(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = ACK_TIMEOUT_MS,
): Promise<Ack | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    socket.emit(event, payload, (ack: Ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

/**
 * `joinTable` responde ack (protocolo §8). O formato do payload não está
 * fixado no contrato: tentamos primeiro `{ tableId }` e, se o servidor não
 * responder ack, o formato legado `tableId` (string). O formato que funciona é
 * memorizado para não repetir a sondagem.
 */
let joinPayloadShape: 'object' | 'string' | null = null;
let joinProbeTimeout = ACK_TIMEOUT_MS;

async function joinTable(
  socket: Socket,
  tableId: string,
): Promise<{ ack: Ack | null; payloadShape: 'object' | 'string' }> {
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
    joinProbeTimeout = 2_000;
  }
  return { ack: stringAck, payloadShape: 'string' };
}

function expectAckOk(ack: Ack | null, event: string): AckOk {
  expect(
    ack,
    `O evento "${event}" não respondeu ack. O backend ainda não implementa o envelope ` +
      '`{ ok, revision }` / `{ ok: false, error }` exigido por docs/REALTIME_PROTOCOL.md §5.',
  ).not.toBeNull();
  const value = ack as Ack;
  expect(value.ok, `Esperava ok:true em "${event}", veio ${JSON.stringify(value)}.`).toBe(true);
  return value as AckOk;
}

function expectAckError(ack: Ack | null, event: string): AckErr {
  expect(
    ack,
    `O evento "${event}" não respondeu ack. O backend ainda não implementa o envelope ` +
      '`{ ok, revision }` / `{ ok: false, error }` exigido por docs/REALTIME_PROTOCOL.md §5.',
  ).not.toBeNull();
  const value = ack as Ack;
  expect(value.ok, `Esperava ok:false em "${event}", veio ${JSON.stringify(value)}.`).toBe(false);
  return value as AckErr;
}

async function waitForEventWindow(recorder: EventRecorder, event: string, ms: number): Promise<boolean> {
  await sleep(ms);
  return recorder.received.some((entry) => entry.event === event);
}

// ---------------------------------------------------------------------------
// Suíte
// ---------------------------------------------------------------------------

test.describe('P1-QA-1 · autorização e acks do protocolo realtime', () => {
  let api: APIRequestContext;
  let setup: SharedSetup;
  const openSockets: Socket[] = [];

  const track = (socket: Socket) => {
    openSockets.push(socket);
    return socket;
  };

  test.beforeAll(async () => {
    api = await playwrightRequest.newContext();
    setup = await resolveSharedSetup(api);
  });

  test.afterAll(async () => {
    for (const socket of openSockets) {
      try {
        socket.close();
      } catch {
        // socket já encerrado
      }
    }
    await api?.dispose();
  });

  test('não-membro é rejeitado em joinTable e não recebe snapshot', async () => {
    const socket = track(await connectSocket(setup.other.token, 'other'));
    const recorder = new EventRecorder(socket);

    const { ack } = await joinTable(socket, setup.tableA._id);
    const error = expectAckError(ack, 'joinTable');
    expect(error.error.code, 'joinTable de não-membro deve responder FORBIDDEN (§3/§10).').toBe('FORBIDDEN');
    expect(typeof error.error.message).toBe('string');
    expect(error.error.message.length).toBeGreaterThan(0);

    const gotSnapshot = await waitForEventWindow(recorder, 'sessionSnapshot', NEGATIVE_WINDOW_MS);
    expect(gotSnapshot, 'Não-membro não pode receber sessionSnapshot.').toBe(false);

    const tables = await fetchMyTables(api, setup.other.token);
    expect(
      tables.some((table) => table._id === setup.tableA._id),
      'Não-membro não deve constar como membro da mesa alheia.',
    ).toBe(false);
  });

  test('membro entra na mesa e recebe snapshot com revisão e papel', async () => {
    const playerSocket = track(await connectSocket(setup.player.token, 'player'));
    const playerRecorder = new EventRecorder(playerSocket);

    const { ack } = await joinTable(playerSocket, setup.tableA._id);
    const ok = expectAckOk(ack, 'joinTable');
    expect(typeof ok.revision, 'joinTable deve devolver a revisão atual.').toBe('number');
    expect(ok.revision).toBeGreaterThanOrEqual(0);

    const snapshot = (await playerRecorder.waitFor(
      'sessionSnapshot',
      (payload: SessionSnapshot) => payload?.tableId === setup.tableA._id,
    )) as SessionSnapshot;

    expect(snapshot.protocolVersion).toBe(1);
    expect(snapshot.tableId).toBe(setup.tableA._id);
    expect(snapshot.revision).toBe(ok.revision);
    expect(snapshot.you.role, 'Jogador deve receber role PLAYER (§3).').toBe('PLAYER');
    expect(snapshot.you.userId).toBe(setup.player.id);
    expect(Array.isArray(snapshot.presence)).toBe(true);
    expect(Array.isArray(snapshot.tokens)).toBe(true);
    expect(Array.isArray(snapshot.initiative)).toBe(true);

    const dmSocket = track(await connectSocket(setup.dm.token, 'dm'));
    const dmRecorder = new EventRecorder(dmSocket);
    const dmJoin = await joinTable(dmSocket, setup.tableA._id);
    expectAckOk(dmJoin.ack, 'joinTable');
    const dmSnapshot = (await dmRecorder.waitFor(
      'sessionSnapshot',
      (payload: SessionSnapshot) => payload?.tableId === setup.tableA._id,
    )) as SessionSnapshot;
    expect(dmSnapshot.you.role, 'Mestre deve receber role DM (§3).').toBe('DM');
    expect(dmSnapshot.you.userId).toBe(setup.dm.id);
  });

  test('jogador não executa mutação de DM e o estado não muda', async () => {
    const table = setup.tableC;

    const playerSocket = track(await connectSocket(setup.player.token, 'player'));
    await joinTable(playerSocket, table._id);

    const dmSocket = track(await connectSocket(setup.dm.token, 'dm'));
    const dmRecorder = new EventRecorder(dmSocket);
    await joinTable(dmSocket, table._id);

    const before = (await dmRecorder.waitFor(
      'sessionSnapshot',
      (payload: SessionSnapshot) => payload?.tableId === table._id,
    )) as SessionSnapshot;

    const ack = await emitWithAck(playerSocket, 'requestSetActiveScene', {
      tableId: table._id,
      sceneId: table.activeScene,
    });
    const error = expectAckError(ack, 'requestSetActiveScene');
    expect(error.error.code, 'Mutação de DM por jogador deve responder FORBIDDEN (§8).').toBe('FORBIDDEN');

    // O estado da mesa não pode ter mudado (checagem independente do protocolo).
    const tables = await fetchMyTables(api, setup.dm.token);
    const tableAfter = tables.find((item) => item._id === table._id);
    expect(tableAfter, 'A mesa do DM deve continuar visível.').toBeTruthy();
    expect(tableAfter!.activeScene, 'A cena ativa não pode mudar com uma ação rejeitada.').toBe(
      table.activeScene,
    );

    // A revisão também não pode ter advancedo.
    const resyncAck = await emitWithAck(dmSocket, 'requestResync', { tableId: table._id });
    const resync = expectAckOk(resyncAck, 'requestResync');
    expect(resync.revision, 'Ação rejeitada não pode incrementar a revisão.').toBe(before.revision);

    const after = dmRecorder.last('sessionSnapshot') as SessionSnapshot | undefined;
    expect(after, 'O resync deve devolver um snapshot completo.').toBeTruthy();
    expect(after!.revision).toBe(before.revision);
    expect(after!.activeScene?._id).toBe(table.activeScene);
  });

  test('token de outra mesa não pode ser movido (IDOR cross-table)', async () => {
    const tableB = setup.tableB;

    // O mestre da mesa B cria um token na cena da mesa B.
    const otherSocket = track(await connectSocket(setup.other.token, 'other'));
    const otherRecorder = new EventRecorder(otherSocket);
    await joinTable(otherSocket, tableB._id);

    const placeAck = await emitWithAck(otherSocket, 'requestPlaceToken', {
      tableId: tableB._id,
      sceneId: tableB.activeScene,
      squareId: 'sq-0',
      name: `Token B ${Date.now()}`,
      size: 'Pequeno/Médio',
      movement: 30,
    });
    expectAckOk(placeAck, 'requestPlaceToken');

    // O token novo chega por `sessionPatch`; o snapshot completo vem do resync.
    const resyncAfterPlace = await emitWithAck(otherSocket, 'requestResync', { tableId: tableB._id });
    expectAckOk(resyncAfterPlace, 'requestResync');

    const tokenB = (await otherRecorder.waitFor(
      'sessionSnapshot',
      (payload: SessionSnapshot) => payload?.tableId === tableB._id && payload?.tokens?.length > 0,
    )) as SessionSnapshot;
    const token = tokenB.tokens[0];
    expect(token.squareId, 'Token da mesa B deve nascer em sq-0.').toBe('sq-0');
    const revisionBefore = tokenB.revision;

    // O jogador da mesa A tenta mover o token da mesa B.
    const playerSocket = track(await connectSocket(setup.player.token, 'player'));
    await joinTable(playerSocket, setup.tableA._id);

    // (a) payload mente sobre a mesa: token de B com tableId de A.
    const ackA = await emitWithAck(playerSocket, 'requestMoveToken', {
      tableId: setup.tableA._id,
      tokenId: token._id,
      targetSquareId: 'sq-5',
    });
    const errorA = expectAckError(ackA, 'requestMoveToken');
    expect(errorA.error.code, 'IDOR cross-table deve responder FORBIDDEN (§10/§14).').toBe('FORBIDDEN');

    // (b) payload denuncia a mesa de B: também precisa ser rejeitado.
    const ackB = await emitWithAck(playerSocket, 'requestMoveToken', {
      tableId: tableB._id,
      tokenId: token._id,
      targetSquareId: 'sq-5',
    });
    const errorB = expectAckError(ackB, 'requestMoveToken');
    expect(errorB.error.code, 'IDOR cross-table deve responder FORBIDDEN (§10/§14).').toBe('FORBIDDEN');

    // O token da mesa B continua intacto depois do ressincronismo.
    const resyncAck = await emitWithAck(otherSocket, 'requestResync', { tableId: tableB._id });
    expectAckOk(resyncAck, 'requestResync');
    const after = (await otherRecorder.waitFor(
      'sessionSnapshot',
      (payload: SessionSnapshot) => payload?.tableId === tableB._id && payload?.revision >= revisionBefore,
    )) as SessionSnapshot;
    const tokenAfter = after.tokens.find((item) => item._id === token._id);
    expect(tokenAfter, 'Token da mesa B deve continuar existindo.').toBeTruthy();
    expect(tokenAfter!.squareId, 'Token da mesa B não pode ter sido movido.').toBe('sq-0');
    expect(after.revision, 'Tentativa de IDOR não pode alterar a revisão da mesa B.').toBe(revisionBefore);
  });

  test('mutação sem callback de ack devolve actionError no socket', async () => {
    const table = setup.tableA;

    const dmSocket = track(await connectSocket(setup.dm.token, 'dm'));
    const dmRecorder = new EventRecorder(dmSocket);
    await joinTable(dmSocket, table._id);

    const placeAck = await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: table._id,
      sceneId: table.activeScene,
      squareId: 'sq-2',
      name: `Token A ${Date.now()}`,
      size: 'Pequeno/Médio',
      movement: 30,
    });
    expectAckOk(placeAck, 'requestPlaceToken');

    // O token novo chega por `sessionPatch`; o snapshot completo vem do resync.
    const resyncAfterPlace = await emitWithAck(dmSocket, 'requestResync', { tableId: table._id });
    expectAckOk(resyncAfterPlace, 'requestResync');

    const dmSnapshot = (await dmRecorder.waitFor(
      'sessionSnapshot',
      (payload: SessionSnapshot) => payload?.tableId === table._id && payload?.tokens?.length > 0,
    )) as SessionSnapshot;
    const dmToken = dmSnapshot.tokens[0];

    const playerSocket = track(await connectSocket(setup.player.token, 'player'));
    const playerRecorder = new EventRecorder(playerSocket);
    await joinTable(playerSocket, table._id);

    // Sem callback de ack: o servidor precisa emitir `actionError` (§5/§14).
    playerSocket.emit('requestMoveToken', {
      tableId: table._id,
      tokenId: dmToken._id,
      targetSquareId: 'sq-7',
    });

    const actionError = (await playerRecorder.waitFor(
      'actionError',
      (payload: ActionError) => payload?.event === 'requestMoveToken',
    )) as ActionError;

    expect(actionError.event).toBe('requestMoveToken');
    expect(actionError.error.code, 'Jogador movendo token do DM deve receber FORBIDDEN.').toBe('FORBIDDEN');
    expect(typeof actionError.error.message).toBe('string');
    expect(typeof actionError.revision).toBe('number');
    expect(typeof actionError.serverNowMs).toBe('number');
  });

  test('duas mutações seguidas incrementam a revisão de forma monotônica', async () => {
    const table = setup.tableD;

    const dmSocket = track(await connectSocket(setup.dm.token, 'dm'));
    const dmRecorder = new EventRecorder(dmSocket);
    await joinTable(dmSocket, table._id);

    const before = (await dmRecorder.waitFor(
      'sessionSnapshot',
      (payload: SessionSnapshot) => payload?.tableId === table._id,
    )) as SessionSnapshot;

    const first = await emitWithAck(dmSocket, 'requestUpdateSessionStatus', {
      tableId: table._id,
      newStatus: 'LIVE',
    });
    const firstOk = expectAckOk(first, 'requestUpdateSessionStatus');
    expect(firstOk.revision, 'A primeira mutação deve incrementar a revisão.').toBeGreaterThan(
      before.revision,
    );

    const second = await emitWithAck(dmSocket, 'requestUpdateSessionStatus', {
      tableId: table._id,
      newStatus: 'ENDED',
    });
    const secondOk = expectAckOk(second, 'requestUpdateSessionStatus');
    expect(secondOk.revision, 'A segunda mutação deve incrementar a revisão.').toBeGreaterThan(
      firstOk.revision,
    );

    const after = (await dmRecorder.waitFor(
      'sessionPatch',
      (payload: SessionPatch) => payload?.tableId === table._id && payload?.revision >= secondOk.revision,
    )) as SessionPatch;
    expect(after.revision).toBeGreaterThanOrEqual(secondOk.revision);
  });

  test('mutação do DM é propagada ao jogador via sessionPatch', async () => {
    const table = setup.tableE;

    const playerSocket = track(await connectSocket(setup.player.token, 'player'));
    const playerRecorder = new EventRecorder(playerSocket);
    await joinTable(playerSocket, table._id);

    const dmSocket = track(await connectSocket(setup.dm.token, 'dm'));
    await joinTable(dmSocket, table._id);

    const tokenName = `Token broadcast ${Date.now()}`;
    const ack = await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: table._id,
      sceneId: table.activeScene,
      squareId: 'sq-4',
      name: tokenName,
      size: 'Pequeno/Médio',
      movement: 30,
    });
    const ok = expectAckOk(ack, 'requestPlaceToken');

    // Caminho canônico: sessionPatch. Aceitamos também o evento legado
    // `tokenPlaced` enquanto a compatibilidade existir (§7/§15).
    const patch = (await playerRecorder.waitFor(
      'sessionPatch',
      (payload: SessionPatch) => {
        const tokens = payload?.changes?.tokens ?? [];
        const updates = payload?.changes?.tokenUpdates ?? [];
        return (
          payload?.tableId === table._id &&
          (tokens.some((token) => token.name === tokenName) || updates.length > 0)
        );
      },
    )) as SessionPatch;

    expect(patch.tableId).toBe(table._id);
    expect(patch.revision).toBe(ok.revision);
    expect(patch.baseRevision).toBeLessThan(patch.revision);
    expect(typeof patch.serverNowMs).toBe('number');

    const tokenFromPatch = patch.changes.tokens?.find((token) => token.name === tokenName);
    const legacy = playerRecorder.find('tokenPlaced') as TokenDto | undefined;
    const token = tokenFromPatch ?? legacy;
    expect(token, 'O jogador deve receber o token colocado pelo DM.').toBeTruthy();
    expect(token!.squareId).toBe('sq-4');
  });
});
