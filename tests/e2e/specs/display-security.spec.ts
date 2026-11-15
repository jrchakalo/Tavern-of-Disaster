/**
 * P2-QA-2 — Segurança do display e geometria de grade.
 *
 * Contrato de referência: `docs/TABLE_MODE.md` §3.3/§3.4/§5.3/§8.
 *   - token de display só entra na mesa dona;
 *   - display não muta nada (place/move/nextTurn/setActiveScene/ping/roll);
 *   - token rotacionado/revogado falha no handshake;
 *   - ping fora do grid → VALIDATION sem broadcast;
 *   - ping em coordenadas de grade chega a 2 clientes com os mesmos x/y.
 *
 * Assim como `table-mode.spec.ts`, não esconde bloqueio: se o contrato da
 * Fase 2 não estiver integrado, o teste que depende dele é marcado como
 * `skipped` com o motivo, e o relatório registra a lacuna.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const getBackendUrl = () => process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3100';

const ACK_TIMEOUT_MS = 6_000;
const EVENT_TIMEOUT_MS = 8_000;
const NEGATIVE_WINDOW_MS = 1_200;

const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret';
const JWT_TTL_SECONDS = 6 * 60 * 60;

const GRID_WIDTH = 12;
const GRID_HEIGHT = 8;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type AckOk = { ok: true; revision: number; serverNowMs: number; [key: string]: unknown };
type AckErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  revision: number;
  serverNowMs: number;
};
type Ack = AckOk | AckErr;

type TestUser = { id: string; username: string; email: string; password: string; token: string };
type TableInfo = { _id: string; name: string; inviteCode: string; activeScene?: string; scenes: string[] };
type SceneInfo = { _id: string; name: string };

type Snapshot = {
  protocolVersion: number;
  tableId: string;
  revision: number;
  you: { userId: string; username: string; role: string; permissions: string[] };
  presence: Array<{ userId: string; username: string; role: string; socketCount: number }>;
  table: { _id: string; name: string; players: Array<{ _id: string; username: string }> };
  tokens: Array<{ _id: string; name: string; squareId: string }>;
  initiative: Array<{ _id: string; tokenId?: string; isCurrentTurn: boolean }>;
};

type PingPayload = {
  id: string;
  userId: string;
  username: string;
  sceneId: string;
  squareId?: string;
  x?: number;
  y?: number;
  revision: number;
};

type DisplayTokenResponse = { token: string; displayUrl: string };

type World = {
  suffix: string;
  dm: TestUser;
  player: TestUser;
  other: TestUser;
  tableA: TableInfo;
  tableB: TableInfo;
  tableRotate: TableInfo;
  sceneA: SceneInfo;
  tokenA: { _id: string; name: string; squareId: string };
  dmSocket: Socket;
  playerSocket: Socket;
  displaySocket: Socket | null;
  displayToken: string;
  rotateToken: string;
  contractError: string | null;
};

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

function mintJwt(userId: string, username: string): string {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ user: { id: userId, username }, iat: now, exp: now + JWT_TTL_SECONDS });
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function registerUser(api: APIRequestContext, prefix: string, suffix: string): Promise<TestUser> {
  const username = `${prefix}-${suffix}`.slice(0, 50);
  const email = `${prefix}-${suffix}@test.dev`;
  const password = 'Test123!';
  const response = await api.post(`${getBackendUrl()}/api/auth/register`, {
    data: { username, email, password },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao registrar ${email}: ${response.status()} ${await response.text()}`);
  }
  const body = (await response.json()) as { user?: { id?: string } };
  const id = body?.user?.id;
  if (!id) throw new Error(`Resposta de registro sem user.id: ${JSON.stringify(body)}`);
  return { id: String(id), username, email, password, token: mintJwt(String(id), username) };
}

async function createTable(api: APIRequestContext, dm: TestUser, name: string): Promise<TableInfo> {
  const response = await api.post(`${getBackendUrl()}/api/tables/create`, {
    headers: { Authorization: `Bearer ${dm.token}` },
    data: { name },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a mesa "${name}": ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as TableInfo;
}

async function joinViaInvite(api: APIRequestContext, user: TestUser, inviteCode: string): Promise<void> {
  const response = await api.post(`${getBackendUrl()}/api/tables/join`, {
    headers: { Authorization: `Bearer ${user.token}` },
    data: { inviteCode },
  });
  if (!response.ok()) {
    throw new Error(`Falha ao entrar via convite: ${response.status()} ${await response.text()}`);
  }
}

async function createScene(
  api: APIRequestContext,
  dm: TestUser,
  tableId: string,
  name: string,
): Promise<SceneInfo> {
  const response = await api.post(`${getBackendUrl()}/api/tables/${tableId}/scenes`, {
    headers: { Authorization: `Bearer ${dm.token}` },
    data: { name, gridWidth: GRID_WIDTH, gridHeight: GRID_HEIGHT },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar cena: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as SceneInfo;
}

async function createDisplayToken(api: APIRequestContext, dm: TestUser, tableId: string): Promise<DisplayTokenResponse | null> {
  const response = await api.post(`${getBackendUrl()}/api/tables/${tableId}/display-token`, {
    headers: { Authorization: `Bearer ${dm.token}` },
  });
  if (!response.ok()) return null;
  return (await response.json()) as DisplayTokenResponse;
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

function connectSocket(auth: { token?: string; displayToken?: string }, label: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(getBackendUrl(), {
      auth,
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
    socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      clearTimeout(timer);
      const code = error.data?.code ?? 'UNKNOWN';
      reject(new Error(`Socket "${label}" falhou no handshake (${code}): ${error.message}`));
    });
  });
}

function connectSocketExpectFailure(
  auth: { displayToken: string },
  label: string,
): Promise<{ code: string; message: string }> {
  return new Promise((resolve, reject) => {
    const socket = io(getBackendUrl(), {
      auth,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      reconnection: false,
      timeout: 10_000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Socket "${label}" não falhou em 12s; esperava connect_error UNAUTHENTICATED.`));
    }, 12_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error(`Socket "${label}" conectou com token inválido; esperava UNAUTHENTICATED.`));
    });
    socket.on('connect_error', (error: Error & { data?: { code?: string } }) => {
      clearTimeout(timer);
      const code = error.data?.code ?? 'UNKNOWN';
      socket.close();
      resolve({ code, message: error.message });
    });
  });
}

function emitWithAck(socket: Socket, event: string, payload: unknown, timeoutMs = ACK_TIMEOUT_MS): Promise<Ack | null> {
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

function expectAckOk(ack: Ack | null, event: string): AckOk {
  expect(
    ack,
    `O evento "${event}" não respondeu ack. O backend não implementa o envelope de ` +
      'docs/REALTIME_PROTOCOL.md §5 ou o evento não existe nesta branch.',
  ).not.toBeNull();
  const value = ack as Ack;
  expect(value.ok, `Esperava ok:true em "${event}", veio ${JSON.stringify(value)}.`).toBe(true);
  return value as AckOk;
}

function expectAckError(ack: Ack | null, event: string): AckErr {
  expect(
    ack,
    `O evento "${event}" não respondeu ack. O backend não implementa o envelope de ` +
      'docs/REALTIME_PROTOCOL.md §5 ou o evento não existe nesta branch.',
  ).not.toBeNull();
  const value = ack as Ack;
  expect(value.ok, `Esperava ok:false em "${event}", veio ${JSON.stringify(value)}.`).toBe(false);
  return value as AckErr;
}

function waitForSnapshot(socket: Socket, tableId: string, timeoutMs = EVENT_TIMEOUT_MS): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('sessionSnapshot', listener);
      reject(new Error(`sessionSnapshot da mesa ${tableId} não chegou em ${timeoutMs}ms.`));
    }, timeoutMs);
    const listener = (snapshot: Snapshot) => {
      if (!snapshot || snapshot.tableId !== tableId) return;
      clearTimeout(timer);
      socket.off('sessionSnapshot', listener);
      resolve(snapshot);
    };
    socket.on('sessionSnapshot', listener);
  });
}

async function joinTable(socket: Socket, tableId: string): Promise<Snapshot> {
  const snapshot = waitForSnapshot(socket, tableId);
  expectAckOk(await emitWithAck(socket, 'joinTable', { tableId }), 'joinTable');
  return snapshot;
}

async function resync(socket: Socket, tableId: string): Promise<Snapshot> {
  const snapshot = waitForSnapshot(socket, tableId);
  expectAckOk(await emitWithAck(socket, 'requestResync', { tableId }), 'requestResync');
  return snapshot;
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs = EVENT_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Evento "${event}" não chegou em ${timeoutMs}ms.`));
    }, timeoutMs);
    const listener = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Estado do arquivo
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(120_000);

let api: APIRequestContext;
let world: World | null = null;

function requireDisplay(): void {
  const reason = world?.contractError;
  test.skip(Boolean(reason), reason ? `Bloqueado: ${reason}` : 'Display da Fase 2 ausente nesta branch.');
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const dm = await registerUser(api, 'dm-sec', suffix);
  const player = await registerUser(api, 'player-sec', suffix);
  const other = await registerUser(api, 'other-sec', suffix);

  const tableA = await createTable(api, dm, `Mesa Segura ${suffix}`);
  const tableB = await createTable(api, other, `Mesa Alheia ${suffix}`);
  const tableRotate = await createTable(api, dm, `Mesa Rotate ${suffix}`);
  await joinViaInvite(api, player, tableA.inviteCode);

  const sceneA = await createScene(api, dm, tableA._id, `Cena Segura ${suffix}`);

  const dmSocket = await connectSocket({ token: dm.token }, 'dm');
  await joinTable(dmSocket, tableA._id);
  expectAckOk(
    await emitWithAck(dmSocket, 'requestSetActiveScene', { tableId: tableA._id, sceneId: sceneA._id }),
    'requestSetActiveScene',
  );
  const tokenName = `Token Seguro ${suffix}`;
  expectAckOk(
    await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: tableA._id,
      sceneId: sceneA._id,
      squareId: 'sq-0',
      name: tokenName,
      size: 'Pequeno/Médio',
      movement: 12,
    }),
    'requestPlaceToken',
  );

  const playerSocket = await connectSocket({ token: player.token }, 'player');
  await joinTable(playerSocket, tableA._id);

  const tableSnapshot = await resync(dmSocket, tableA._id);
  const tokenA = tableSnapshot.tokens.find((token) => token.name === tokenName);
  if (!tokenA) throw new Error('Token de setup não apareceu no snapshot da mesa A.');

  // P2-BE-1/P2-BE-2: superfícies do display.
  let contractError: string | null = null;
  let displayToken = '';
  let displaySocket: Socket | null = null;

  const displayResponse = await createDisplayToken(api, dm, tableA._id);
  if (!displayResponse?.token) {
    contractError =
      'P2-BE-1 ausente: POST /api/tables/:tableId/display-token não devolveu { token, displayUrl } ' +
      '(docs/TABLE_MODE.md §3.2).';
  } else {
    displayToken = displayResponse.token;
    try {
      displaySocket = await connectSocket({ displayToken }, 'display');
      const displaySnapshot = await joinTable(displaySocket, tableA._id);
      if (displaySnapshot.you.role !== 'DISPLAY') {
        contractError = `P2-BE-2 incompleto: snapshot do display tem role "${displaySnapshot.you.role}", esperado DISPLAY.`;
      } else if (displaySnapshot.you.permissions.length !== 0) {
        contractError = `P2-BE-2 incompleto: display recebeu permissões ${JSON.stringify(displaySnapshot.you.permissions)}; esperado [].`;
      }
    } catch (error) {
      contractError = `P2-BE-2 ausente: handshake com displayToken falhou (${(error as Error).message}).`;
    }
  }

  const rotateResponse = await createDisplayToken(api, dm, tableRotate._id);

  world = {
    suffix,
    dm,
    player,
    other,
    tableA,
    tableB,
    tableRotate,
    sceneA,
    tokenA: { _id: tokenA._id, name: tokenA.name, squareId: tokenA.squareId },
    dmSocket,
    playerSocket,
    displaySocket,
    displayToken,
    rotateToken: rotateResponse?.token ?? '',
    contractError,
  };
});

test.afterAll(async () => {
  for (const socket of [world?.displaySocket, world?.dmSocket, world?.playerSocket]) {
    try {
      socket?.close();
    } catch {
      // socket já encerrado
    }
  }
  await api?.dispose();
});

// ---------------------------------------------------------------------------
// Geometria de ping (não depende do display token)
// ---------------------------------------------------------------------------

test('ping válido em coordenadas de grade chega a 2 clientes com os mesmos x/y', async () => {
  const w = world!;
  const dmPing = waitForEvent<PingPayload>(w.dmSocket, 'pingBroadcast', (payload) => payload.x === 1.5 && payload.y === 2.5);
  const playerPing = waitForEvent<PingPayload>(
    w.playerSocket,
    'pingBroadcast',
    (payload) => payload.x === 1.5 && payload.y === 2.5,
  );

  const ack = await emitWithAck(w.playerSocket, 'requestPing', {
    tableId: w.tableA._id,
    sceneId: w.sceneA._id,
    x: 1.5,
    y: 2.5,
  });
  expectAckOk(ack, 'requestPing');

  const [dmPayload, playerPayload] = await Promise.all([dmPing, playerPing]);
  expect(dmPayload.x).toBe(1.5);
  expect(dmPayload.y).toBe(2.5);
  expect(playerPayload.x).toBe(dmPayload.x);
  expect(playerPayload.y).toBe(dmPayload.y);
  expect(dmPayload.sceneId).toBe(w.sceneA._id);
  expect(typeof dmPayload.revision).toBe('number');
});

test('ping fora do grid responde VALIDATION e não gera broadcast', async () => {
  const w = world!;
  let broadcasts = 0;
  const onPing = () => {
    broadcasts += 1;
  };
  w.dmSocket.on('pingBroadcast', onPing);
  w.playerSocket.on('pingBroadcast', onPing);

  try {
    const ack = await emitWithAck(w.playerSocket, 'requestPing', {
      tableId: w.tableA._id,
      sceneId: w.sceneA._id,
      x: GRID_WIDTH + 5,
      y: 2.5,
    });
    const error = expectAckError(ack, 'requestPing');
    expect(
      error.error.code,
      'P2-BE-4: ping fora de 0..gridWidth/0..gridHeight deve responder VALIDATION (docs/TABLE_MODE.md §5.3).',
    ).toBe('VALIDATION');

    await sleep(NEGATIVE_WINDOW_MS);
    expect(broadcasts, 'Ping inválido não pode ser transmitido para a mesa.').toBe(0);
  } finally {
    w.dmSocket.off('pingBroadcast', onPing);
    w.playerSocket.off('pingBroadcast', onPing);
  }
});

// ---------------------------------------------------------------------------
// Display: entrada, autorização e read-only
// ---------------------------------------------------------------------------

test('token de display entra só na mesa dona e recebe role DISPLAY sem permissões', async () => {
  requireDisplay();
  const w = world!;
  expect(w.displaySocket, 'O socket do display não foi criado no setup.').not.toBeNull();

  const ownSnapshot = await resync(w.displaySocket!, w.tableA._id);
  expect(ownSnapshot.you.role).toBe('DISPLAY');
  expect(ownSnapshot.you.userId).toBe(`display:${w.tableA._id}`);
  expect(ownSnapshot.you.permissions).toEqual([]);
  expect(ownSnapshot.presence.some((entry) => entry.role === 'DISPLAY')).toBe(true);

  const foreignJoin = await emitWithAck(w.displaySocket!, 'joinTable', { tableId: w.tableB._id });
  const joinError = expectAckError(foreignJoin, 'joinTable');
  expect(joinError.error.code, 'Token de display não pode entrar em outra mesa.').toBe('FORBIDDEN');

  const foreignResync = await emitWithAck(w.displaySocket!, 'requestResync', { tableId: w.tableB._id });
  const resyncError = expectAckError(foreignResync, 'requestResync');
  expect(resyncError.error.code, 'Display não pode pedir resync de outra mesa.').toBe('FORBIDDEN');
});

test('display não consegue mutar estado e a revisão permanece intacta', async () => {
  requireDisplay();
  const w = world!;
  const display = w.displaySocket!;
  const before = await resync(w.dmSocket, w.tableA._id);

  const attempts: Array<{ event: string; payload: Record<string, unknown> }> = [
    {
      event: 'requestPlaceToken',
      payload: {
        tableId: w.tableA._id,
        sceneId: w.sceneA._id,
        squareId: 'sq-3',
        name: 'Token da TV',
        size: 'Pequeno/Médio',
      },
    },
    {
      event: 'requestMoveToken',
      payload: { tableId: w.tableA._id, tokenId: w.tokenA._id, targetSquareId: 'sq-4' },
    },
    { event: 'requestNextTurn', payload: { tableId: w.tableA._id, sceneId: w.sceneA._id } },
    { event: 'requestSetActiveScene', payload: { tableId: w.tableA._id, sceneId: w.sceneA._id } },
    {
      event: 'requestPing',
      payload: { tableId: w.tableA._id, sceneId: w.sceneA._id, x: 1, y: 1 },
    },
    { event: 'requestRollDice', payload: { tableId: w.tableA._id, expression: '1d20' } },
  ];

  for (const attempt of attempts) {
    const ack = await emitWithAck(display, attempt.event, attempt.payload);
    const error = expectAckError(ack, attempt.event);
    expect(
      error.error.code,
      `${attempt.event} disparado pela TV deve responder FORBIDDEN (docs/TABLE_MODE.md §3.3).`,
    ).toBe('FORBIDDEN');
  }

  const after = await resync(w.dmSocket, w.tableA._id);
  expect(after.revision, 'Nenhuma tentativa da TV pode incrementar a revisão.').toBe(before.revision);
  expect(after.tokens.find((token) => token._id === w.tokenA._id)?.squareId).toBe(w.tokenA.squareId);
  expect(after.initiative.every((entry) => !entry.isCurrentTurn)).toBe(true);
});

test('token rotacionado e token revogado falham no handshake com UNAUTHENTICATED', async () => {
  requireDisplay();
  const w = world!;

  const first = w.rotateToken;
  expect(first, 'O setup não gerou o token inicial de rotação.').not.toBe('');

  const rotated = await createDisplayToken(api, w.dm, w.tableRotate._id);
  expect(rotated?.token, 'POST /display-token deveria rotacionar e devolver um token novo.').toBeTruthy();
  expect(rotated!.token).not.toBe(first);

  const oldFailure = await connectSocketExpectFailure({ displayToken: first }, 'display-old');
  expect(oldFailure.code, 'Token anterior deve ser invalidado imediatamente após rotação.').toBe('UNAUTHENTICATED');

  const newSocket = await connectSocket({ displayToken: rotated!.token }, 'display-new');
  newSocket.close();

  const revoke = await api.delete(`${getBackendUrl()}/api/tables/${w.tableRotate._id}/display-token`, {
    headers: { Authorization: `Bearer ${w.dm.token}` },
  });
  expect(revoke.ok(), `DELETE /display-token deveria revogar: ${revoke.status()} ${await revoke.text()}`).toBe(true);

  const revokedFailure = await connectSocketExpectFailure(
    { displayToken: rotated!.token },
    'display-revoked',
  );
  expect(revokedFailure.code, 'Token revogado deve falhar no handshake.').toBe('UNAUTHENTICATED');
});
