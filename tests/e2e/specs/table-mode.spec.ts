/**
 * P2-QA-1 — Modo mesa presencial: 1 TV + 5 celulares.
 *
 * Contrato de referência: `docs/TABLE_MODE.md` §7/§8 e `docs/RESTORATION.md`
 * (Fase 2). O roteiro segue o §8 "E2E / caos":
 *   1. DM cria mesa/cena/token via REST/Socket.IO e gera o token da TV.
 *   2. TV 1920×1080 abre `/display/:id#token=...` e nunca recebe controles de
 *      escrita.
 *   3. 5 celulares 390×844 entram por `/play/:id?invite=...`.
 *   4. Todos convergem para a mesma revisão e o mesmo tabuleiro.
 *   5. DM move um token; todos os clientes atualizam.
 *   6. Iniciativa: cada jogador move no próprio turno; fora do turno recebe
 *      erro e o estado não muda.
 *   7. Rolagem de dados aparece no log da TV.
 *   8. Recarregar 2 jogadores + TV recupera a mesma revisão.
 *   9. Loop acelerado de 60 "minutos" sem divergência de revisão, tokens e
 *      iniciativa.
 *
 * Semântica de bloqueio: quando a Fase 2 ainda não está integrada, o primeiro
 * teste falha com a lista de superfícies ausentes e os demais são marcados como
 * `skipped` com o mesmo motivo. Nunca há "pass" falso.
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { createHash, createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const getBackendUrl = () => process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3100';
const getBaseUrl = () => process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

const ACK_TIMEOUT_MS = 6_000;
const EVENT_TIMEOUT_MS = 8_000;
const UI_TIMEOUT_MS = 20_000;
const NEGATIVE_WINDOW_MS = 1_200;

/** Mesmo segredo usado por `tests/e2e/global-setup.ts`. */
const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret';
const JWT_TTL_SECONDS = 6 * 60 * 60;

const GRID_WIDTH = 12;
const GRID_HEIGHT = 8;
const PLAYER_COUNT = 5;
const TOKEN_MOVEMENT = 12; // metros; 8 quadrados com metersPerSquare = 1.5

// ---------------------------------------------------------------------------
// Tipos do contrato
// ---------------------------------------------------------------------------

type AckOk = { ok: true; revision: number; serverNowMs: number; [key: string]: unknown };
type AckErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  revision: number;
  serverNowMs: number;
};
type Ack = AckOk | AckErr;

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

type SceneInfo = { _id: string; name: string };

type TokenDto = {
  _id: string;
  squareId: string;
  name: string;
  owner: { _id: string; username: string } | null;
  movement: number;
  remainingMovement: number;
};

type InitiativeDto = {
  _id: string;
  characterName: string;
  tokenId?: string;
  isCurrentTurn: boolean;
};

type Snapshot = {
  protocolVersion: number;
  tableId: string;
  revision: number;
  you: { userId: string; username: string; role: string; permissions: string[] };
  presence: Array<{ userId: string; username: string; role: string; socketCount: number }>;
  table: { _id: string; name: string; players: Array<{ _id: string; username: string }> };
  activeScene: { _id: string; name: string } | null;
  tokens: TokenDto[];
  initiative: InitiativeDto[];
};

type DisplayTokenResponse = { token: string; displayUrl: string };

type World = {
  suffix: string;
  dm: TestUser;
  players: TestUser[];
  table: TableInfo;
  scene: SceneInfo;
  tokenNames: string[];
  displayToken: string;
  displayUrl: string;
  dmSocket: Socket;
  playerSockets: Socket[];
  contractError: string | null;
};

// ---------------------------------------------------------------------------
// Utilidades REST
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

async function createScene(
  api: APIRequestContext,
  dm: TestUser,
  tableId: string,
  payload: { name: string; gridWidth: number; gridHeight: number },
): Promise<SceneInfo> {
  const response = await api.post(`${getBackendUrl()}/api/tables/${tableId}/scenes`, {
    headers: { Authorization: `Bearer ${dm.token}` },
    data: payload,
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a cena "${payload.name}": ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as SceneInfo;
}

// ---------------------------------------------------------------------------
// Utilidades Socket.IO
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
    socket.on('connect_error', (error: Error) => {
      clearTimeout(timer);
      reject(new Error(`Socket "${label}" falhou no handshake: ${error.message}`));
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
  const ack = await emitWithAck(socket, 'joinTable', { tableId });
  expectAckOk(ack, 'joinTable');
  return snapshot;
}

async function resync(socket: Socket, tableId: string): Promise<Snapshot> {
  const snapshot = waitForSnapshot(socket, tableId);
  const ack = await emitWithAck(socket, 'requestResync', { tableId });
  expectAckOk(ack, 'requestResync');
  return snapshot;
}

// ---------------------------------------------------------------------------
// Utilidades de tabuleiro / DOM
// ---------------------------------------------------------------------------

function squareIndex(squareId: string): number {
  const value = Number(squareId.replace(/^sq-/, ''));
  if (!Number.isInteger(value)) throw new Error(`squareId inválido: ${squareId}`);
  return value;
}

function nextFreeSquare(snapshot: Snapshot, squareId: string): string {
  const index = squareIndex(squareId);
  const total = GRID_WIDTH * GRID_HEIGHT;
  const occupied = new Set(snapshot.tokens.map((token) => token.squareId));
  const candidates = [index + GRID_WIDTH, index - GRID_WIDTH, index + 1, index - 1];
  for (const candidate of candidates) {
    if (candidate < 0 || candidate >= total) continue;
    const id = `sq-${candidate}`;
    if (!occupied.has(id)) return id;
  }
  throw new Error(`Não há quadrado livre vizinho a ${squareId}.`);
}

function hashBoard(snapshot: Snapshot): { tokenHash: string; initiativeHash: string } {
  const tokens = [...snapshot.tokens]
    .map((token) => `${token._id}:${token.squareId}:${token.remainingMovement}`)
    .sort()
    .join('|');
  const initiative = snapshot.initiative
    .map((entry) => `${entry._id}:${entry.characterName}:${entry.isCurrentTurn ? 1 : 0}`)
    .join('|');
  const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);
  return { tokenHash: digest(tokens), initiativeHash: digest(initiative) };
}

async function readRevision(page: Page, selector: string): Promise<number> {
  const text = (await page.locator(selector).first().textContent()) ?? '';
  const match = /(\d+)/.exec(text);
  if (!match) throw new Error(`Revisão não encontrada em "${selector}" (texto: "${text}").`);
  return Number(match[1]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Estado do arquivo
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(180_000);

let api: APIRequestContext;
let world: World | null = null;

const openContexts: BrowserContext[] = [];
const playerPages: Page[] = [];
let tvPage: Page | null = null;

function requirePhase2(): void {
  const reason = world?.contractError;
  test.skip(Boolean(reason), reason ? `Bloqueado: ${reason}` : 'Contrato da Fase 2 ausente nesta branch.');
}

async function expectAllPlayerRevisions(revision: number): Promise<void> {
  expect(tvPage, 'A TV precisa ter sido aberta no teste anterior.').not.toBeNull();
  await expect
    .poll(() => readRevision(tvPage!, '.display-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(revision);
  for (const [index, page] of playerPages.entries()) {
    expect(page, `O celular ${index + 1} precisa ter sido aberto no teste anterior.`).toBeTruthy();
    await expect
      .poll(() => readRevision(page, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
      .toBe(revision);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const dm = await registerUser(api, 'dm-p2', suffix);
  const players: TestUser[] = [];
  for (let i = 1; i <= PLAYER_COUNT; i += 1) {
    players.push(await registerUser(api, `p${i}-p2`, suffix));
  }

  const tableName = `Mesa TV ${suffix}`;
  const sceneName = `Cena TV ${suffix}`;
  const table = await createTable(api, dm, tableName);
  const scene = await createScene(api, dm, table._id, {
    name: sceneName,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
  });

  const dmSocket = await connectSocket({ token: dm.token }, 'dm');
  await joinTable(dmSocket, table._id);

  expectAckOk(
    await emitWithAck(dmSocket, 'requestSetActiveScene', { tableId: table._id, sceneId: scene._id }),
    'requestSetActiveScene',
  );

  const tokenNames: string[] = [];
  const tokenSquares = ['sq-14', 'sq-29', 'sq-44', 'sq-59', 'sq-74'];
  for (let i = 0; i < PLAYER_COUNT; i += 1) {
    tokenNames.push(`Herói ${i + 1}`);
    expectAckOk(
      await emitWithAck(dmSocket, 'requestPlaceToken', {
        tableId: table._id,
        sceneId: scene._id,
        squareId: tokenSquares[i],
        name: tokenNames[i],
        size: 'Pequeno/Médio',
        movement: TOKEN_MOVEMENT,
      }),
      'requestPlaceToken',
    );
  }

  expectAckOk(
    await emitWithAck(dmSocket, 'requestUpdateSessionStatus', { tableId: table._id, newStatus: 'LIVE' }),
    'requestUpdateSessionStatus',
  );

  // Token de display: P2-BE-1. A ausência é registrada, não mascarada.
  let contractError: string | null = null;
  let displayToken = '';
  let displayUrl = '';
  const displayResponse = await api.post(`${getBackendUrl()}/api/tables/${table._id}/display-token`, {
    headers: { Authorization: `Bearer ${dm.token}` },
  });
  if (!displayResponse.ok()) {
    const body = await displayResponse.text();
    contractError =
      `P2-BE-1 ausente: POST /api/tables/:tableId/display-token respondeu ` +
      `${displayResponse.status()} (${body.slice(0, 160)}). ` +
      'docs/TABLE_MODE.md §3.2 exige { token, displayUrl }.';
  } else {
    const body = (await displayResponse.json()) as DisplayTokenResponse;
    displayToken = body.token;
    displayUrl = body.displayUrl;
    if (!displayToken || !displayUrl?.includes(`/display/${table._id}#token=${displayToken}`)) {
      contractError =
        `P2-BE-1 incompleto: POST /display-token devolveu ${JSON.stringify(body)}; ` +
        `esperado token + displayUrl terminando em /display/${table._id}#token=<token>.`;
    }
  }

  if (!contractError) {
    try {
      const displaySocket = await connectSocket({ displayToken }, 'display-probe');
      displaySocket.close();
    } catch (error) {
      contractError =
        `P2-BE-2 ausente: o handshake com auth.displayToken falhou (${(error as Error).message}). ` +
        'docs/TABLE_MODE.md §3.3 exige socket DISPLAY somente leitura.';
    }
  }

  world = {
    suffix,
    dm,
    players,
    table,
    scene,
    tokenNames,
    displayToken,
    displayUrl,
    dmSocket,
    playerSockets: [],
    contractError,
  };
});

test.afterAll(async () => {
  for (const socket of world?.playerSockets ?? []) {
    try {
      socket.close();
    } catch {
      // socket já encerrado
    }
  }
  try {
    world?.dmSocket.close();
  } catch {
    // socket já encerrado
  }
  for (const context of openContexts) {
    await context.close().catch(() => undefined);
  }
  await api?.dispose();
});

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

test('P2-QA-1 · contrato da Fase 2 está disponível', async () => {
  expect(world, 'O setup compartilhado não foi criado.').not.toBeNull();
  expect(world!.contractError, world!.contractError ?? '').toBeNull();
  expect(world!.displayToken.length, 'O token da TV deve ter entropia suficiente (32 bytes).').toBeGreaterThan(20);
  expect(world!.displayUrl).toContain(`/display/${world!.table._id}#token=${world!.displayToken}`);
});

test('TV 1920×1080 entra por token, renderiza mesa/cena/iniciativa e não escreve', async ({ browser }) => {
  requirePhase2();
  const w = world!;
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  openContexts.push(context);
  tvPage = await context.newPage();

  // O backend pode devolver `displayUrl` relativo (`/display/:id#token=...`)
  // quando PUBLIC_APP_URL/CORS_ORIGIN não estão definidos; aceitamos os dois.
  const displayUrl = new URL(w.displayUrl, getBaseUrl());
  await tvPage.goto(`${displayUrl.pathname}${displayUrl.hash}`);

  await expect(tvPage.locator('.display-header__title')).toHaveText(w.table.name, { timeout: UI_TIMEOUT_MS });
  await expect(tvPage.locator('.display-header__scene')).toContainText(w.scene.name);
  await expect(tvPage.locator('.display-header__role')).toHaveText('TV');
  await expect(tvPage.getByRole('status', { name: /Conexão:/ })).toContainText('Conectado', {
    timeout: UI_TIMEOUT_MS,
  });

  // Iniciativa e tokens presentes no rail/tabuleiro.
  await expect(tvPage.locator('.display-rail .initiative-item')).toHaveCount(PLAYER_COUNT, {
    timeout: UI_TIMEOUT_MS,
  });
  for (const name of w.tokenNames) {
    await expect(tvPage.locator('.display-rail .initiative-item', { hasText: name })).toBeVisible();
    await expect(tvPage.locator(`.display-board__token[title="${name}"]`)).toBeVisible();
  }

  // Nenhum controle de escrita na TV.
  for (const label of ['Mover', 'Encerrar turno', 'Rolar']) {
    await expect(tvPage.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  }
  await expect(tvPage.locator('.play-controls')).toHaveCount(0);
  await expect(tvPage.locator('[draggable="true"]')).toHaveCount(0);

  // Nada muda durante a janela de observação.
  const serverBefore = await resync(w.dmSocket, w.table._id);
  const uiBefore = await readRevision(tvPage, '.display-header__revision');
  await sleep(NEGATIVE_WINDOW_MS);
  const uiAfter = await readRevision(tvPage, '.display-header__revision');
  const serverAfter = await resync(w.dmSocket, w.table._id);
  expect(uiAfter, 'A TV não pode disparar mutação: a revisão mudou sem ação do Mestre.').toBe(uiBefore);
  expect(serverAfter.revision).toBe(serverBefore.revision);
});

test('5 celulares 390×844 entram por /play/:id?invite= e veem o tabuleiro', async ({ browser }) => {
  const w = world!;

  for (let i = 0; i < PLAYER_COUNT; i += 1) {
    const player = w.players[i];
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    openContexts.push(context);
    await context.addInitScript((token: string) => {
      window.localStorage.setItem('authToken', token);
    }, player.token);

    const page = await context.newPage();
    playerPages.push(page);
    await page.goto(`${getBaseUrl()}/play/${w.table._id}?invite=${w.table.inviteCode}`);

    expect(page.url(), `O jogador ${i + 1} foi redirecionado para fora de /play.`).toContain(
      `/play/${w.table._id}`,
    );
  }

  // O convite precisa ter efetivamente adicionado os 5 jogadores (P2-FE-3).
  let snapshot = await resync(w.dmSocket, w.table._id);
  const deadline = Date.now() + UI_TIMEOUT_MS;
  let missing = w.players.filter(
    (player) => !snapshot.table.players.some((entry) => entry._id === player.id),
  );
  while (missing.length > 0 && Date.now() < deadline) {
    await sleep(500);
    snapshot = await resync(w.dmSocket, w.table._id);
    missing = w.players.filter(
      (player) => !snapshot.table.players.some((entry) => entry._id === player.id),
    );
  }
  expect(
    missing.map((player) => player.username),
    'P2-FE-3 ausente: /play/:tableId?invite=<code> não adicionou os jogadores à mesa ' +
      '(docs/TABLE_MODE.md §4.1).',
  ).toEqual([]);

  for (const page of playerPages) {
    await expect(page.locator('.play-header__title')).toHaveText(w.table.name, { timeout: UI_TIMEOUT_MS });
    await expect(page.locator('.play-header__role')).toHaveText('Jogador');
    await expect(page.getByRole('status', { name: /Conexão:/ })).toContainText('Conectado', {
      timeout: UI_TIMEOUT_MS,
    });
    await expect(page.locator('.player-board')).toBeVisible();
    await expect(page.locator('.token-card')).toBeVisible();
  }

  // O Mestre vincula cada token ao jogador correspondente.
  for (let i = 0; i < PLAYER_COUNT; i += 1) {
    const token = snapshot.tokens.find((entry) => entry.name === w.tokenNames[i]);
    expect(token, `Token ${w.tokenNames[i]} não encontrado no snapshot.`).toBeTruthy();
    expectAckOk(
      await emitWithAck(w.dmSocket, 'requestAssignToken', {
        tableId: w.table._id,
        tokenId: token!._id,
        newOwnerId: w.players[i].id,
      }),
      'requestAssignToken',
    );
  }

  // Sockets de controle dos jogadores (para turnos, movimento e rolagens).
  for (let i = 0; i < PLAYER_COUNT; i += 1) {
    const socket = await connectSocket({ token: w.players[i].token }, `player-${i + 1}`);
    await joinTable(socket, w.table._id);
    w.playerSockets.push(socket);
  }
});

test('TV e os 5 celulares convergem na mesma revisão e no mesmo tabuleiro', async () => {
  requirePhase2();
  const w = world!;
  const snapshot = await resync(w.dmSocket, w.table._id);

  await expectAllPlayerRevisions(snapshot.revision);

  for (const page of playerPages) {
    const boardTokens = page.locator('.board-token');
    await expect(boardTokens).toHaveCount(PLAYER_COUNT);
    for (const name of w.tokenNames) {
      await expect(page.locator(`.board-token[title="${name}"]`)).toBeVisible();
    }
    const names = await page.locator('.board-token__label').allTextContents();
    expect(names.sort()).toEqual([...w.tokenNames].sort());
  }

  await expect(tvPage!.locator('.display-board__token')).toHaveCount(PLAYER_COUNT);
});

test('movimento do Mestre atualiza todos os clientes', async () => {
  requirePhase2();
  const w = world!;
  const before = await resync(w.dmSocket, w.table._id);
  const token = before.tokens.find((entry) => entry.name === w.tokenNames[0]);
  expect(token, 'Token do jogador 1 não encontrado.').toBeTruthy();

  const tvToken = tvPage!.locator(`.display-board__token[title="${w.tokenNames[0]}"]`);
  const styleBefore = await tvToken.getAttribute('style');

  const target = nextFreeSquare(before, token!.squareId);
  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestMoveToken', {
      tableId: w.table._id,
      tokenId: token!._id,
      targetSquareId: target,
      expectedRevision: before.revision,
    }),
    'requestMoveToken',
  );

  const after = await resync(w.dmSocket, w.table._id);
  expect(after.revision).toBeGreaterThan(before.revision);
  expect(after.tokens.find((entry) => entry._id === token!._id)?.squareId).toBe(target);

  await expectAllPlayerRevisions(after.revision);
  await expect
    .poll(() => tvToken.getAttribute('style'), { timeout: UI_TIMEOUT_MS })
    .not.toBe(styleBefore);
});

test('iniciativa: cada jogador move no próprio turno; fora do turno é rejeitado', async () => {
  requirePhase2();
  const w = world!;

  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestNextTurn', { tableId: w.table._id, sceneId: w.scene._id }),
    'requestNextTurn',
  );

  for (let i = 0; i < PLAYER_COUNT; i += 1) {
    const page = playerPages[i];
    const playerSocket = w.playerSockets[i];
    const snapshot = await resync(w.dmSocket, w.table._id);
    const current = snapshot.initiative.find((entry) => entry.isCurrentTurn);
    expect(current, `Nenhuma entrada de iniciativa está no turno do jogador ${i + 1}.`).toBeTruthy();
    const currentToken = snapshot.tokens.find((token) => token._id === current!.tokenId);
    expect(currentToken?.owner?._id, `O turno atual não pertence ao jogador ${i + 1}.`).toBe(w.players[i].id);

    await expect(page.locator('.token-card__status')).toHaveText('Seu turno', { timeout: UI_TIMEOUT_MS });
    await expect(page.getByRole('button', { name: 'Mover', exact: true })).toBeEnabled();
    await expect(page.locator('.token-card__name')).toHaveText(w.tokenNames[i]);

    // Fora do turno: o próximo jogador não pode mover o próprio token.
    const nextIndex = (i + 1) % PLAYER_COUNT;
    const nextSocket = w.playerSockets[nextIndex];
    await expect(
      playerPages[nextIndex].getByRole('button', { name: 'Mover', exact: true }),
      `O celular do jogador ${nextIndex + 1} não deve armar movimento fora do turno.`,
    ).toBeDisabled();
    const nextToken = snapshot.tokens.find((token) => token.name === w.tokenNames[nextIndex]);
    expect(nextToken).toBeTruthy();
    const revisionBeforeReject = snapshot.revision;
    const outOfTurnAck = await emitWithAck(nextSocket, 'requestMoveToken', {
      tableId: w.table._id,
      tokenId: nextToken!._id,
      targetSquareId: nextFreeSquare(snapshot, nextToken!.squareId),
    });
    const rejection = expectAckError(outOfTurnAck, 'requestMoveToken');
    expect(rejection.error.code, 'Movimento fora do turno deve ser FORBIDDEN.').toBe('FORBIDDEN');
    expect(rejection.error.message.length).toBeGreaterThan(0);
    const afterReject = await resync(w.dmSocket, w.table._id);
    expect(afterReject.revision, 'Ação rejeitada não pode incrementar a revisão.').toBe(revisionBeforeReject);
    expect(afterReject.tokens.find((token) => token._id === nextToken!._id)?.squareId).toBe(nextToken!.squareId);

    // No turno: UI arma o movimento e o servidor confirma.
    const target = nextFreeSquare(snapshot, currentToken!.squareId);
    await page.getByRole('button', { name: 'Mover', exact: true }).click();
    await page.locator('.grid-square').nth(squareIndex(target)).click();

    await expect
      .poll(
        async () => {
          const state = await resync(w.dmSocket, w.table._id);
          return state.tokens.find((token) => token._id === currentToken!._id)?.squareId;
        },
        { timeout: UI_TIMEOUT_MS },
      )
      .toBe(target);

    await page.getByRole('button', { name: 'Encerrar turno', exact: true }).click();
    await expect
      .poll(
        async () => {
          const state = await resync(w.dmSocket, w.table._id);
          return state.initiative.find((entry) => entry.isCurrentTurn)?.tokenId ?? null;
        },
        { timeout: UI_TIMEOUT_MS },
      )
      .not.toBe(currentToken!._id);
  }
});

test('rolagem de dados aparece no log da TV', async () => {
  requirePhase2();
  const w = world!;
  const expression = '2d6+1';
  expectAckOk(
    await emitWithAck(w.playerSockets[0], 'requestRollDice', { tableId: w.table._id, expression }),
    'requestRollDice',
  );

  await expect(
    tvPage!.locator('.roll-log__item[data-type="roll"]', { hasText: expression }).first(),
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
});

test('recarregar 2 celulares e a TV recupera a mesma revisão', async () => {
  requirePhase2();
  const w = world!;
  const expected = await resync(w.dmSocket, w.table._id);

  await Promise.all([
    playerPages[0].reload({ waitUntil: 'domcontentloaded' }),
    playerPages[1].reload({ waitUntil: 'domcontentloaded' }),
    tvPage!.reload({ waitUntil: 'domcontentloaded' }),
  ]);

  await expect(playerPages[0].locator('.play-header__title')).toHaveText(w.table.name, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPages[1].locator('.play-header__title')).toHaveText(w.table.name, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(tvPage!.locator('.display-header__title')).toHaveText(w.table.name, {
    timeout: UI_TIMEOUT_MS,
  });

  await expectAllPlayerRevisions(expected.revision);
  await expect(tvPage!.locator('.display-rail .initiative-item')).toHaveCount(PLAYER_COUNT);
});

test('loop acelerado de 60 minutos (24 iterações) termina com revisão e hashes iguais', async () => {
  requirePhase2();
  const w = world!;

  for (let iteration = 0; iteration < 24; iteration += 1) {
    expectAckOk(
      await emitWithAck(w.dmSocket, 'requestNextTurn', { tableId: w.table._id, sceneId: w.scene._id }),
      'requestNextTurn',
    );

    const snapshot = await resync(w.dmSocket, w.table._id);
    const current = snapshot.initiative.find((entry) => entry.isCurrentTurn);
    expect(current, `Iteração ${iteration}: nenhuma entrada no turno.`).toBeTruthy();
    const token = snapshot.tokens.find((entry) => entry._id === current!.tokenId);
    expect(token, `Iteração ${iteration}: token do turno não encontrado.`).toBeTruthy();

    const ownerIndex = w.players.findIndex((player) => player.id === token!.owner?._id);
    const ownerSocket = ownerIndex >= 0 ? w.playerSockets[ownerIndex] : w.dmSocket;
    const target = nextFreeSquare(snapshot, token!.squareId);

    expectAckOk(
      await emitWithAck(ownerSocket, 'requestMoveToken', {
        tableId: w.table._id,
        tokenId: token!._id,
        targetSquareId: target,
        expectedRevision: snapshot.revision,
      }),
      'requestMoveToken',
    );

    expectAckOk(
      await emitWithAck(ownerSocket, 'requestRollDice', {
        tableId: w.table._id,
        expression: iteration % 2 === 0 ? '1d20' : '1d8+2',
      }),
      'requestRollDice',
    );
  }

  const dmSnapshot = await resync(w.dmSocket, w.table._id);
  const reference = hashBoard(dmSnapshot);

  for (let i = 0; i < w.playerSockets.length; i += 1) {
    const snapshot = await resync(w.playerSockets[i], w.table._id);
    expect(snapshot.revision, `Jogador ${i + 1} divergiu na revisão final.`).toBe(dmSnapshot.revision);
    const hash = hashBoard(snapshot);
    expect(hash.tokenHash, `Jogador ${i + 1} divergiu no hash de tokens.`).toBe(reference.tokenHash);
    expect(hash.initiativeHash, `Jogador ${i + 1} divergiu no hash de iniciativa.`).toBe(
      reference.initiativeHash,
    );
  }

  await expectAllPlayerRevisions(dmSnapshot.revision);
});
