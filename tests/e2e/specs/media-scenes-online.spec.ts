/**
 * F4-QA-2 — Fase 4 (mídia e cenas) online: 2 contextos remotos, sem TV.
 *
 * Contrato: `docs/MEDIA_SCENES.md` §5/§6 ("Troca de cena funciona online"),
 * `docs/ONLINE_MODE.md` (mesmas rotas `/table/:id` e `/play/:id`, sem HTTP
 * local) e `docs/REALTIME_PROTOCOL.md`.
 *
 * Fluxo:
 *   1. DM e jogador em contextos separados; o jogador entra pelo convite.
 *   2. O DM sobe um mapa pela UI e o jogador vê a URL nova sem reload.
 *   3. O DM ativa uma segunda cena; o jogador converge.
 *   4. O jogador reconecta e continua na cena/mapa atuais.
 *   5. A URL da imagem não tem `localhost` fixo (é relativa ou da base).
 */
import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const getBackendUrl = () => process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3100';
const getBaseUrl = () => process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

const ACK_TIMEOUT_MS = 6_000;
const EVENT_TIMEOUT_MS = 8_000;
const UI_TIMEOUT_MS = 25_000;

const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret';
const JWT_TTL_SECONDS = 6 * 60 * 60;

const SCENE_ONE_NAME = 'Cena Online A';
const SCENE_TWO_NAME = 'Cena Online B';
const TOKEN_NAME = 'Herói Online';
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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
type TableInfo = { _id: string; name: string; inviteCode: string; scenes: string[] };
type SceneInfo = { _id: string; name: string; imageUrl?: string };
type UploadResponse = {
  publicUrl: string;
  assetId: string;
  bytes: number;
};

type Snapshot = {
  tableId: string;
  revision: number;
  table: { _id: string; name: string; players: Array<{ _id: string; username: string }> };
  activeScene: { _id: string; name: string; imageUrl?: string } | null;
  scenes: SceneInfo[];
  tokens: Array<{ _id: string; name: string }>;
};

type World = {
  dm: TestUser;
  player: TestUser;
  table: TableInfo;
  sceneOne: SceneInfo;
  dmSocket: Socket;
  playerSocket: Socket;
  firstMapUrl: string;
  secondMapUrl: string;
};

// ---------------------------------------------------------------------------
// REST / JWT / socket
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

const headers = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

async function createTable(api: APIRequestContext, dm: TestUser, name: string): Promise<TableInfo> {
  const response = await api.post(`${getBackendUrl()}/api/tables/create`, {
    headers: headers(dm),
    data: { name },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a mesa: ${response.status()} ${await response.text()}`);
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
    headers: { ...headers(dm), 'Content-Type': 'application/json' },
    data: payload,
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a cena: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as SceneInfo;
}

async function uploadMapViaApi(
  api: APIRequestContext,
  dm: TestUser,
  tableId: string,
  filename: string,
): Promise<UploadResponse> {
  const response = await api.post(`${getBackendUrl()}/api/assets/maps/${tableId}`, {
    headers: headers(dm),
    multipart: {
      file: { name: filename, mimeType: 'image/png', buffer: TINY_PNG },
    },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha no upload de mapa via API: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as UploadResponse;
}

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

function expectAckOk(ack: Ack | null, event: string): AckOk {
  expect(ack, `O evento "${event}" não respondeu ack (docs/REALTIME_PROTOCOL.md §5).`).not.toBeNull();
  const value = ack as Ack;
  expect(value.ok, `Esperava ok:true em "${event}", veio ${JSON.stringify(value)}.`).toBe(true);
  return value as AckOk;
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

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

async function readRevision(page: Page, selector: string): Promise<number> {
  const text = (await page.locator(selector).first().textContent()) ?? '';
  const match = /(\d+)/.exec(text);
  if (!match) throw new Error(`Revisão não encontrada em "${selector}" (texto: "${text}").`);
  return Number(match[1]);
}

async function openAuthenticatedContext(
  browser: Browser,
  user: TestUser,
  viewport: { width: number; height: number },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  openContexts.push(context);
  await context.addInitScript((token: string) => {
    window.localStorage.setItem('authToken', token);
  }, user.token);
  const page = await context.newPage();
  return { context, page };
}

function sceneRow(page: Page, sceneName: string) {
  return page.locator('.scene-manager .scene-list li', { hasText: sceneName }).first();
}

async function activateSceneFromUi(page: Page, sceneName: string): Promise<void> {
  const row = sceneRow(page, sceneName);
  await expect(row, `A cena "${sceneName}" precisa estar no painel do Mestre.`).toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  const button = row.getByRole('button', { name: 'Ativar', exact: true });
  await expect(button).toBeEnabled({ timeout: UI_TIMEOUT_MS });
  await button.click();
}

/** A URL deve ser portátil: relativa `/uploads/...` ou da base configurada. */
function assertPortableAssetUrl(rawUrl: string | null): void {
  expect(rawUrl, 'A imagem ativa precisa existir.').toBeTruthy();
  const value = rawUrl as string;
  expect(value, 'Nenhuma URL de asset pode ter "localhost" fixo (docs/MEDIA_SCENES.md §5).').not.toMatch(
    /localhost/i,
  );
  if (value.startsWith('/')) {
    expect(value).toMatch(/^\/uploads\/.+\.webp$/);
    return;
  }
  expect(value.startsWith(`${new URL(getBaseUrl()).origin}/uploads/`)).toBe(true);
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(180_000);

let api: APIRequestContext;
let world: World | null = null;

const openContexts: BrowserContext[] = [];
let dmPage: Page | null = null;
let playerContext: BrowserContext | null = null;
let playerPage: Page | null = null;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const dm = await registerUser(api, 'dm-f4o', suffix);
  const player = await registerUser(api, 'p1-f4o', suffix);

  const table = await createTable(api, dm, `Mesa Online Mídia ${suffix}`);
  const sceneOne = await createScene(api, dm, table._id, {
    name: SCENE_ONE_NAME,
    gridWidth: 12,
    gridHeight: 8,
  });

  const dmSocket = await connectSocket(dm.token, 'dm-f4-online');
  await joinTable(dmSocket, table._id);
  expectAckOk(
    await emitWithAck(dmSocket, 'requestSetActiveScene', { tableId: table._id, sceneId: sceneOne._id }),
    'requestSetActiveScene',
  );
  expectAckOk(
    await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: table._id,
      sceneId: sceneOne._id,
      squareId: 'sq-14',
      name: TOKEN_NAME,
      size: 'Pequeno/Médio',
      movement: 9,
    }),
    'requestPlaceToken',
  );
  expectAckOk(
    await emitWithAck(dmSocket, 'requestUpdateSessionStatus', { tableId: table._id, newStatus: 'LIVE' }),
    'requestUpdateSessionStatus',
  );

  const playerSocket = await connectSocket(player.token, 'player-f4-online');

  world = {
    dm,
    player,
    table,
    sceneOne,
    dmSocket,
    playerSocket,
    firstMapUrl: '',
    secondMapUrl: '',
  };

  const dmSession = await openAuthenticatedContext(browser, dm, { width: 1440, height: 900 });
  dmPage = dmSession.page;
  await dmPage.goto(`${getBaseUrl()}/table/${table._id}`);

  const playerSession = await openAuthenticatedContext(browser, player, { width: 390, height: 844 });
  playerContext = playerSession.context;
  playerPage = playerSession.page;
  await playerPage.goto(`${getBaseUrl()}/play/${table._id}?invite=${table.inviteCode}`);
});

test.afterAll(async () => {
  for (const socket of [world?.dmSocket, world?.playerSocket]) {
    try {
      socket?.close();
    } catch {
      // socket já encerrado
    }
  }
  for (const context of openContexts) {
    await context.close().catch(() => undefined);
  }
  await api?.dispose();
});

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

test('F4-QA-2 · DM e jogador entram em contextos remotos e o convite adiciona o jogador', async () => {
  const w = world!;

  await expect(dmPage!.locator('.dm-panel')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.play-header__title')).toHaveText(w.table.name, { timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.play-header__role')).toHaveText('Jogador');

  await expect
    .poll(
      async () => {
        const snapshot = await resync(w.dmSocket, w.table._id);
        return snapshot.table.players.some((entry) => entry._id === w.player.id);
      },
      {
        timeout: UI_TIMEOUT_MS,
        message: 'O link /play/:id?invite=... precisa adicionar o jogador como membro.',
      },
    )
    .toBe(true);

  await joinTable(w.playerSocket, w.table._id);
});

test('DM sobe o mapa pela UI e o jogador vê a URL nova sem reload', async () => {
  const w = world!;

  const input = dmPage!.locator('.scene-manager input[type=file]');
  await expect(input).toHaveCount(1);
  const responsePromise = dmPage!.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(`/api/assets/maps/${w.table._id}`),
    { timeout: UI_TIMEOUT_MS },
  );
  await input.setInputFiles({ name: 'online-one.png', mimeType: 'image/png', buffer: TINY_PNG });
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const uploaded = (await response.json()) as UploadResponse;
  w.firstMapUrl = uploaded.publicUrl;

  await expect(
    dmPage!.locator('.toast.success').filter({ hasText: 'Mapa atualizado com sucesso.' }).last(),
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });

  // Nenhum reload no contexto do jogador: o evento realtime atualiza o tabuleiro.
  await expect(playerPage!.locator('.board-map')).toHaveAttribute('src', uploaded.publicUrl, {
    timeout: UI_TIMEOUT_MS,
  });
  assertPortableAssetUrl(await playerPage!.locator('.board-map').getAttribute('src'));
});

test('DM troca para a segunda cena e o jogador converge na imagem e na revisão', async () => {
  const w = world!;

  const second = await uploadMapViaApi(api, w.dm, w.table._id, 'online-two.png');
  w.secondMapUrl = second.publicUrl;
  expect(second.publicUrl).not.toBe(w.firstMapUrl);

  const form = dmPage!.locator('.scene-manager .create-scene-form');
  await expect(form).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await form.locator('input[placeholder="Nome da Cena"]').fill(SCENE_TWO_NAME);
  await form.locator('input[placeholder="URL da Imagem (Opcional)"]').fill(second.publicUrl);
  await form.getByRole('button', { name: 'Adicionar Cena', exact: true }).click();
  await expect(sceneRow(dmPage!, SCENE_TWO_NAME)).toBeVisible({ timeout: UI_TIMEOUT_MS });

  const before = await resync(w.dmSocket, w.table._id);
  await activateSceneFromUi(dmPage!, SCENE_TWO_NAME);

  await expect
    .poll(async () => (await resync(w.dmSocket, w.table._id)).activeScene?._id, { timeout: UI_TIMEOUT_MS })
    .not.toBe(w.sceneOne._id);
  const after = await resync(w.dmSocket, w.table._id);
  expect(after.revision, 'Trocar de cena precisa incrementar a revisão.').toBeGreaterThan(before.revision);
  expect(after.activeScene?.imageUrl).toBe(second.publicUrl);

  await expect(playerPage!.locator('.play-header__scene')).toContainText(SCENE_TWO_NAME, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage!.locator('.board-map')).toHaveAttribute('src', second.publicUrl, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect
    .poll(() => readRevision(playerPage!, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(after.revision);

  const mapSrc = await playerPage!.locator('.board-map').getAttribute('src');
  assertPortableAssetUrl(mapSrc);
});

test('jogador reconecta e continua na cena/mapa atuais, sem localhost fixo', async ({ browser }) => {
  const w = world!;
  const expected = await resync(w.dmSocket, w.table._id);

  await playerContext!.close();
  const session = await openAuthenticatedContext(browser, w.player, { width: 390, height: 844 });
  playerContext = session.context;
  playerPage = session.page;
  await playerPage.goto(`${getBaseUrl()}/play/${w.table._id}`);

  await expect(playerPage.locator('.play-header__title')).toHaveText(w.table.name, { timeout: UI_TIMEOUT_MS });
  await expect(playerPage.locator('.play-header__scene')).toContainText(SCENE_TWO_NAME, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage.locator('.board-map')).toHaveAttribute('src', w.secondMapUrl, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect
    .poll(() => readRevision(playerPage!, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(expected.revision);

  const mapSrc = await playerPage.locator('.board-map').getAttribute('src');
  assertPortableAssetUrl(mapSrc);

  const snapshot = await resync(w.playerSocket, w.table._id);
  expect(snapshot.revision).toBe(expected.revision);
  expect(snapshot.activeScene?._id).toBe(expected.activeScene?._id);
  expect(snapshot.activeScene?.imageUrl).toBe(w.secondMapUrl);
});
