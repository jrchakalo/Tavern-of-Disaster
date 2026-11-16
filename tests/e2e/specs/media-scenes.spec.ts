/**
 * F4-QA-1 — Fase 4 (mídia e cenas) presencial: DM desktop + DM mobile +
 * jogador mobile + TV.
 *
 * Contrato de referência: `docs/MEDIA_SCENES.md` §2–6 (assets, quota, troca de
 * mapa, overlays persistentes, UI mobile e critérios de aceite), sobre
 * `docs/TABLE_MODE.md` (TV + celulares) e `docs/REALTIME_PROTOCOL.md`.
 *
 * Roteiro:
 *   1. DM + 2 jogadores + mesa/cena/tokens + LIVE + token de display/TV.
 *   2. Seed de sistema e uso de assets: membro lê, não-membro recebe 403.
 *   3. Upload de mapa pelo DM mobile (390×844), progresso/uso visíveis e
 *      TV/jogador convergindo para a nova URL.
 *   4. Troca de mapa apaga o asset antigo (URL velha = 404, uso continua 1);
 *      arquivo não-imagem mostra erro e não muda a cena.
 *   5. Troca de cena (segunda cena com outra imagem) converge na TV e no
 *      jogador; voltar restaura a primeira.
 *   6. Medição persistente + aura entram no `requestResync` e somem ao remover.
 *   7. Autorização de assets: jogador não sobe/apaga mapa, não-membro não lê uso.
 *   8. Reconexão do jogador mantém mapa, cena e overlays.
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

/** Mesmo segredo usado por `tests/e2e/global-setup.ts`. */
const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret';
const JWT_TTL_SECONDS = 6 * 60 * 60;

const GRID_WIDTH = 12;
const GRID_HEIGHT = 8;
const SCENE_ONE_NAME = 'Cena Mídia A';
const SCENE_TWO_NAME = 'Cena Mídia B';
const TOKEN_ONE = 'Herói Mídia 1';
const TOKEN_TWO = 'Herói Mídia 2';

/**
 * PNG 1×1 válido (transparente). O `sharp` do backend converte para WebP; o
 * conteúdo exato não importa, apenas a URL/asset resultante.
 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// ---------------------------------------------------------------------------
// Tipos do contrato
// ---------------------------------------------------------------------------

type AckOk = { ok: true; revision: number; serverNowMs: number; changes?: Record<string, unknown>; [key: string]: unknown };
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

type SceneInfo = { _id: string; name: string; imageUrl?: string };

type TokenDto = {
  _id: string;
  squareId: string;
  name: string;
  owner?: { _id: string; username: string } | null;
};

type MeasurementDto = {
  id?: string;
  userId: string;
  username: string;
  sceneId: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  type?: string;
  color: string;
};

type AuraDto = {
  id: string;
  tokenId: string;
  tableId: string;
  sceneId: string;
  name: string;
  color: string;
  radiusMeters: number;
};

type Snapshot = {
  protocolVersion: number;
  tableId: string;
  revision: number;
  you: { userId: string; username: string; role: string; permissions: string[] };
  table: { _id: string; name: string; status: string; players: Array<{ _id: string; username: string }> };
  activeScene: { _id: string; name: string; imageUrl?: string } | null;
  scenes: SceneInfo[];
  tokens: TokenDto[];
  measurements: MeasurementDto[];
  auras: AuraDto[];
};

type AssetUsage = {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  count: number;
  byKind: { map: number; token: number; avatar: number };
};

type UploadResponse = {
  publicUrl: string;
  assetId: string;
  bytes: number;
  usage: { usedBytes: number; quotaBytes: number; remainingBytes: number };
};

type DisplayTokenResponse = { token: string; displayUrl: string };

type World = {
  suffix: string;
  dm: TestUser;
  playerOne: TestUser;
  playerTwo: TestUser;
  outsider: TestUser;
  table: TableInfo;
  sceneOne: SceneInfo;
  tokenOneId: string;
  displayToken: string;
  displayUrl: string;
  dmSocket: Socket;
  playerSocket: Socket;
  mapOneUrl: string;
  mapOneAssetId: string;
  mapTwoUrl: string;
  mapTwoAssetId: string;
  sceneTwoMapUrl: string;
};

// ---------------------------------------------------------------------------
// REST / JWT
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

function authHeaders(user: TestUser): Record<string, string> {
  return { Authorization: `Bearer ${user.token}` };
}

async function createTable(api: APIRequestContext, dm: TestUser, name: string): Promise<TableInfo> {
  const response = await api.post(`${getBackendUrl()}/api/tables/create`, {
    headers: authHeaders(dm),
    data: { name },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a mesa "${name}": ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as TableInfo;
}

async function joinTableByInvite(api: APIRequestContext, user: TestUser, inviteCode: string): Promise<void> {
  const response = await api.post(`${getBackendUrl()}/api/tables/join`, {
    headers: authHeaders(user),
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
  payload: { name: string; gridWidth: number; gridHeight: number; imageUrl?: string },
): Promise<SceneInfo> {
  const response = await api.post(`${getBackendUrl()}/api/tables/${tableId}/scenes`, {
    headers: { ...authHeaders(dm), 'Content-Type': 'application/json' },
    data: payload,
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a cena "${payload.name}": ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as SceneInfo;
}

async function fetchUsage(api: APIRequestContext, user: TestUser, tableId: string): Promise<AssetUsage> {
  const response = await api.get(`${getBackendUrl()}/api/assets/tables/${tableId}/usage`, {
    headers: authHeaders(user),
  });
  if (!response.ok()) {
    throw new Error(`Falha ao ler o uso de assets: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as AssetUsage;
}

async function uploadMapViaApi(
  api: APIRequestContext,
  dm: TestUser,
  tableId: string,
  filename: string,
): Promise<UploadResponse> {
  const response = await api.post(`${getBackendUrl()}/api/assets/maps/${tableId}`, {
    headers: authHeaders(dm),
    multipart: {
      file: { name: filename, mimeType: 'image/png', buffer: TINY_PNG },
    },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha no upload de mapa via API: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as UploadResponse;
}

/** URL relativa (`/uploads/...`) ou absoluta, resolvida para o backend. */
function toBackendUrl(assetUrl: string): string {
  return /^https?:\/\//i.test(assetUrl) ? assetUrl : `${getBackendUrl()}${assetUrl}`;
}

// ---------------------------------------------------------------------------
// Socket.IO
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

async function setActiveScene(socket: Socket, tableId: string, sceneId: string): Promise<AckOk> {
  return expectAckOk(
    await emitWithAck(socket, 'requestSetActiveScene', { tableId, sceneId }),
    'requestSetActiveScene',
  );
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * Observador opcional do progresso. O arquivo é minúsculo e o upload pode
 * terminar antes de um frame; a ausência não é falha (o teste unitário cobre a
 * barra). Registramos como anotação para evidência.
 */
async function startUploadProgressObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as unknown as { __f4SawUploadProgress?: boolean };
    state.__f4SawUploadProgress = false;
    const observer = new MutationObserver(() => {
      if (document.querySelector('.upload-progress')) state.__f4SawUploadProgress = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function uploadProgressObserved(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean((window as unknown as { __f4SawUploadProgress?: boolean }).__f4SawUploadProgress));
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

// ---------------------------------------------------------------------------
// Estado do arquivo
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(180_000);

let api: APIRequestContext;
let world: World | null = null;

const openContexts: BrowserContext[] = [];
let dmDesktopPage: Page | null = null;
let dmMobilePage: Page | null = null;
let playerContext: BrowserContext | null = null;
let playerPage: Page | null = null;
let tvPage: Page | null = null;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const dm = await registerUser(api, 'dm-f4', suffix);
  const playerOne = await registerUser(api, 'p1-f4', suffix);
  const playerTwo = await registerUser(api, 'p2-f4', suffix);
  const outsider = await registerUser(api, 'out-f4', suffix);

  const table = await createTable(api, dm, `Mesa Mídia ${suffix}`);
  await joinTableByInvite(api, playerOne, table.inviteCode);
  await joinTableByInvite(api, playerTwo, table.inviteCode);

  const systemResponse = await api.put(`${getBackendUrl()}/api/tables/${table._id}/system`, {
    headers: { ...authHeaders(dm), 'Content-Type': 'application/json' },
    data: { systemKey: 'dnd5e' },
  });
  if (systemResponse.status() !== 200) {
    throw new Error(`PUT /api/tables/:id/system falhou: ${systemResponse.status()} ${await systemResponse.text()}`);
  }

  const sceneOne = await createScene(api, dm, table._id, {
    name: SCENE_ONE_NAME,
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
  });

  const dmSocket = await connectSocket(dm.token, 'dm-f4');
  await joinTable(dmSocket, table._id);
  await setActiveScene(dmSocket, table._id, sceneOne._id);

  expectAckOk(
    await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: table._id,
      sceneId: sceneOne._id,
      squareId: 'sq-14',
      name: TOKEN_ONE,
      size: 'Pequeno/Médio',
      movement: 9,
      ownerId: playerOne.id,
    }),
    'requestPlaceToken(token1)',
  );
  expectAckOk(
    await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: table._id,
      sceneId: sceneOne._id,
      squareId: 'sq-29',
      name: TOKEN_TWO,
      size: 'Pequeno/Médio',
      movement: 9,
      ownerId: playerTwo.id,
    }),
    'requestPlaceToken(token2)',
  );

  expectAckOk(
    await emitWithAck(dmSocket, 'requestUpdateSessionStatus', { tableId: table._id, newStatus: 'LIVE' }),
    'requestUpdateSessionStatus',
  );

  const playerSocket = await connectSocket(playerOne.token, 'player-f4');
  await joinTable(playerSocket, table._id);

  const displayResponse = await api.post(`${getBackendUrl()}/api/tables/${table._id}/display-token`, {
    headers: authHeaders(dm),
  });
  if (!displayResponse.ok()) {
    throw new Error(
      `POST /api/tables/:id/display-token respondeu ${displayResponse.status()} ` +
        `(${await displayResponse.text()}); a TV é pré-requisito da Fase 2.`,
    );
  }
  const display = (await displayResponse.json()) as DisplayTokenResponse;
  if (!display.token || !display.displayUrl?.includes(`/display/${table._id}#token=${display.token}`)) {
    throw new Error(`display-token devolveu ${JSON.stringify(display)}; esperado { token, displayUrl }.`);
  }

  const snapshot = await resync(dmSocket, table._id);
  const tokenOne = snapshot.tokens.find((token) => token.name === TOKEN_ONE);
  if (!tokenOne) throw new Error('Token do jogador 1 não apareceu no snapshot da mesa.');

  world = {
    suffix,
    dm,
    playerOne,
    playerTwo,
    outsider,
    table,
    sceneOne,
    tokenOneId: tokenOne._id,
    displayToken: display.token,
    displayUrl: display.displayUrl,
    dmSocket,
    playerSocket,
    mapOneUrl: '',
    mapOneAssetId: '',
    mapTwoUrl: '',
    mapTwoAssetId: '',
    sceneTwoMapUrl: '',
  };

  // Páginas do cenário presencial.
  const dmDesktop = await openAuthenticatedContext(browser, dm, { width: 1440, height: 900 });
  dmDesktopPage = dmDesktop.page;
  await dmDesktopPage.goto(`${getBaseUrl()}/table/${table._id}`);

  const dmMobile = await openAuthenticatedContext(browser, dm, { width: 390, height: 844 });
  dmMobilePage = dmMobile.page;
  await dmMobilePage.goto(`${getBaseUrl()}/table/${table._id}`);

  const playerSession = await openAuthenticatedContext(browser, playerOne, { width: 390, height: 844 });
  playerContext = playerSession.context;
  playerPage = playerSession.page;
  await playerPage.goto(`${getBaseUrl()}/play/${table._id}?invite=${table.inviteCode}`);

  const tvSession = await openAuthenticatedContext(browser, dm, { width: 1920, height: 1080 });
  tvPage = tvSession.page;
  const displayUrl = new URL(display.displayUrl, getBaseUrl());
  await tvPage.goto(`${displayUrl.pathname}${displayUrl.hash}`);
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

test('F4-QA-1 · setup presencial está LIVE com DM, 2 jogadores, tokens e TV', async () => {
  const w = world!;

  await expect(dmDesktopPage!.locator('.dm-panel')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.play-header__title')).toHaveText(w.table.name, { timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.play-header__role')).toHaveText('Jogador');
  await expect(tvPage!.locator('.display-header__title')).toHaveText(w.table.name, { timeout: UI_TIMEOUT_MS });
  await expect(tvPage!.locator('.display-header__role')).toHaveText('TV');

  const snapshot = await resync(w.dmSocket, w.table._id);
  expect(snapshot.table.status).toBe('LIVE');
  expect(snapshot.activeScene?._id).toBe(w.sceneOne._id);
  expect(snapshot.scenes.map((scene) => scene.name)).toContain(SCENE_ONE_NAME);
  expect(snapshot.tokens.map((token) => token.name).sort()).toEqual([TOKEN_ONE, TOKEN_TWO].sort());
  const memberIds = snapshot.table.players.map((player) => player._id);
  for (const player of [w.playerOne, w.playerTwo]) {
    expect(memberIds, `O jogador ${player.username} precisa ser membro da mesa.`).toContain(player.id);
  }
});

test('sistemas e uso de assets: membro lê o uso, não-membro recebe 403', async () => {
  const w = world!;

  const systemResponse = await api.get(`${getBackendUrl()}/api/systems/key/dnd5e`);
  expect(systemResponse.status(), 'GET /api/systems/key/dnd5e precisa funcionar (seed D&D 5e).').toBe(200);
  const system = (await systemResponse.json()) as { key?: string; dicePresets?: Array<{ expression: string }> };
  expect(system.key).toBe('dnd5e');
  expect(system.dicePresets?.some((preset) => preset.expression === 'd20')).toBe(true);

  const usage = await fetchUsage(api, w.playerOne, w.table._id);
  expect(usage.usedBytes, 'A mesa começa sem assets de mapa/token.').toBe(0);
  expect(usage.quotaBytes).toBeGreaterThan(0);
  expect(usage.remainingBytes).toBe(usage.quotaBytes);
  expect(usage.count).toBe(0);
  expect(usage.byKind).toMatchObject({ map: 0, token: 0, avatar: 0 });

  const outsiderResponse = await api.get(`${getBackendUrl()}/api/assets/tables/${w.table._id}/usage`, {
    headers: authHeaders(w.outsider),
  });
  expect(outsiderResponse.status(), 'Não-membro não pode ler o uso de armazenamento.').toBe(403);
});

test('DM mobile 390×844 envia mapa; uso aparece e TV/jogador convergem para a URL nova', async () => {
  const w = world!;
  const page = dmMobilePage!;

  await page.goto(`${getBaseUrl()}/table/${w.table._id}`);
  const openPanel = page.getByRole('button', { name: 'Abrir painel do Mestre' });
  await expect(openPanel, 'O DM mobile precisa do botão do painel do Mestre.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  await openPanel.click();
  await expect(page.locator('.scene-manager')).toBeVisible({ timeout: UI_TIMEOUT_MS });

  const input = page.locator('.scene-manager input[type=file]');
  await expect(input, 'SceneManager precisa do input de arquivo (docs/MEDIA_SCENES.md §5).').toHaveCount(1);

  await startUploadProgressObserver(page);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(`/api/assets/maps/${w.table._id}`),
    { timeout: UI_TIMEOUT_MS },
  );
  await input.setInputFiles({ name: 'map-one.png', mimeType: 'image/png', buffer: TINY_PNG });
  const response = await responsePromise;
  expect(response.status(), 'POST /api/assets/maps/:tableId precisa responder 201.').toBe(201);
  const uploaded = (await response.json()) as UploadResponse;
  expect(uploaded.publicUrl, 'A URL pública do mapa precisa ser /uploads/*.webp.').toMatch(
    /\/uploads\/.+\.webp$/,
  );
  expect(uploaded.assetId).toBeTruthy();

  w.mapOneUrl = uploaded.publicUrl;
  w.mapOneAssetId = uploaded.assetId;

  await expect(page.locator('#map-url')).toHaveValue(uploaded.publicUrl, { timeout: UI_TIMEOUT_MS });
  await expect(page.locator('.usage-summary')).toContainText('Armazenamento:', { timeout: UI_TIMEOUT_MS });
  await expect(
    page.locator('.toast.success').filter({ hasText: 'Mapa atualizado com sucesso.' }).last(),
    'Upload bem-sucedido precisa de toast (DoD: erro/sucesso visível).',
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });

  await expect(tvPage!.locator('.display-board__map')).toHaveAttribute('src', uploaded.publicUrl, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage!.locator('.board-map')).toHaveAttribute('src', uploaded.publicUrl, {
    timeout: UI_TIMEOUT_MS,
  });

  const usage = await fetchUsage(api, w.playerOne, w.table._id);
  expect(usage.count).toBeGreaterThanOrEqual(1);
  expect(usage.byKind.map).toBeGreaterThan(0);

  const sawProgress = await uploadProgressObserved(page);
  test.info().annotations.push({
    type: 'upload-progress',
    description: sawProgress
      ? '.upload-progress apareceu durante o upload mobile.'
      : '.upload-progress não foi observado (upload rápido); o teste unitário cobre a barra.',
  });
});

test('trocar o mapa apaga o asset antigo; arquivo não-imagem mostra erro e não muda a cena', async () => {
  const w = world!;
  const page = dmMobilePage!;
  const previousUrl = w.mapOneUrl;

  const input = page.locator('.scene-manager input[type=file]');
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(`/api/assets/maps/${w.table._id}`),
    { timeout: UI_TIMEOUT_MS },
  );
  await input.setInputFiles({ name: 'map-two.png', mimeType: 'image/png', buffer: TINY_PNG });
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const uploaded = (await response.json()) as UploadResponse;
  expect(uploaded.publicUrl).not.toBe(previousUrl);

  w.mapTwoUrl = uploaded.publicUrl;
  w.mapTwoAssetId = uploaded.assetId;

  await expect(page.locator('#map-url')).toHaveValue(uploaded.publicUrl, { timeout: UI_TIMEOUT_MS });
  await expect(tvPage!.locator('.display-board__map')).toHaveAttribute('src', uploaded.publicUrl, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage!.locator('.board-map')).toHaveAttribute('src', uploaded.publicUrl, {
    timeout: UI_TIMEOUT_MS,
  });

  const oldAssetResponse = await api.get(toBackendUrl(previousUrl));
  expect(
    oldAssetResponse.status(),
    `O asset antigo (${previousUrl}) precisa ser removido ao trocar o mapa (docs/MEDIA_SCENES.md §3.5).`,
  ).toBe(404);

  const usageAfterReplace = await fetchUsage(api, w.playerOne, w.table._id);
  expect(usageAfterReplace.count, 'A troca de mapa não pode acumular assets: o antigo é apagado.').toBe(1);

  // Arquivo não-imagem: o input aceita qualquer arquivo via automação; o
  // backend precisa rejeitar com erro visível e a cena não muda.
  const badResponsePromise = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      candidate.url().includes(`/api/assets/maps/${w.table._id}`),
    { timeout: UI_TIMEOUT_MS },
  );
  await input.setInputFiles({
    name: 'not-an-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('isto não é uma imagem', 'utf8'),
  });
  const badResponse = await badResponsePromise;
  expect(badResponse.status(), 'Arquivo não-imagem precisa ser 400 (docs/MEDIA_SCENES.md §3.1).').toBe(400);

  await expect(page.locator('.upload-error')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(page.locator('.upload-error')).toContainText(/imagem|inválid|arquivo/i);
  await expect(
    page.locator('.toast.error').filter({ hasText: /imagem|inválid|arquivo/i }).last(),
    'O erro de upload precisa aparecer também no toast.',
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });

  await expect(page.locator('#map-url')).toHaveValue(uploaded.publicUrl);
  await expect(tvPage!.locator('.display-board__map')).toHaveAttribute('src', uploaded.publicUrl);
  await expect(playerPage!.locator('.board-map')).toHaveAttribute('src', uploaded.publicUrl);

  const usageAfterFailure = await fetchUsage(api, w.playerOne, w.table._id);
  expect(usageAfterFailure).toEqual(usageAfterReplace);
});

test('troca de cena: DM ativa a segunda cena, TV/jogador convergem; voltar restaura', async () => {
  const w = world!;
  const page = dmDesktopPage!;

  const third = await uploadMapViaApi(api, w.dm, w.table._id, 'scene-two.png');
  w.sceneTwoMapUrl = third.publicUrl;
  expect(third.publicUrl).not.toBe(w.mapTwoUrl);

  const form = page.locator('.scene-manager .create-scene-form');
  await expect(form).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await form.locator('input[placeholder="Nome da Cena"]').fill(SCENE_TWO_NAME);
  await form.locator('input[placeholder="URL da Imagem (Opcional)"]').fill(third.publicUrl);
  await form.getByRole('button', { name: 'Adicionar Cena', exact: true }).click();
  await expect(sceneRow(page, SCENE_TWO_NAME), 'A segunda cena precisa aparecer na lista.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });

  const before = await resync(w.dmSocket, w.table._id);
  await activateSceneFromUi(page, SCENE_TWO_NAME);

  await expect
    .poll(async () => (await resync(w.dmSocket, w.table._id)).activeScene?.name, { timeout: UI_TIMEOUT_MS })
    .toBe(SCENE_TWO_NAME);
  const afterSwitch = await resync(w.dmSocket, w.table._id);
  expect(afterSwitch.revision, 'Trocar a cena precisa incrementar a revisão.').toBeGreaterThan(before.revision);
  expect(afterSwitch.activeScene?.imageUrl).toBe(third.publicUrl);

  await expect(tvPage!.locator('.display-header__scene')).toContainText(SCENE_TWO_NAME, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(tvPage!.locator('.display-board__map')).toHaveAttribute('src', third.publicUrl, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage!.locator('.play-header__scene')).toContainText(SCENE_TWO_NAME, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage!.locator('.board-map')).toHaveAttribute('src', third.publicUrl, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect
    .poll(() => readRevision(tvPage!, '.display-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(afterSwitch.revision);
  await expect
    .poll(() => readRevision(playerPage!, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(afterSwitch.revision);

  // Voltar para a primeira cena (mapa trocado no teste anterior).
  await activateSceneFromUi(page, SCENE_ONE_NAME);
  await expect
    .poll(async () => (await resync(w.dmSocket, w.table._id)).activeScene?.name, { timeout: UI_TIMEOUT_MS })
    .toBe(SCENE_ONE_NAME);
  const afterReturn = await resync(w.dmSocket, w.table._id);
  expect(afterReturn.revision).toBeGreaterThan(afterSwitch.revision);
  expect(afterReturn.activeScene?.imageUrl).toBe(w.mapTwoUrl);

  await expect(tvPage!.locator('.display-header__scene')).toContainText(SCENE_ONE_NAME, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(tvPage!.locator('.display-board__map')).toHaveAttribute('src', w.mapTwoUrl, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage!.locator('.play-header__scene')).toContainText(SCENE_ONE_NAME, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage!.locator('.board-map')).toHaveAttribute('src', w.mapTwoUrl, {
    timeout: UI_TIMEOUT_MS,
  });
});

test('medição persistente e aura entram no resync e somem quando removidas', async () => {
  const w = world!;
  const sceneId = w.sceneOne._id;

  const startedAt = Date.now();
  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestAddPersistentMeasurement', {
      tableId: w.table._id,
      sceneId,
      payload: {
        start: { x: 0.5, y: 0.5 },
        end: { x: 3.5, y: 2.5 },
        distance: '4,5 m',
        type: 'ruler',
        color: '#ff8c00',
      },
    }),
    'requestAddPersistentMeasurement',
  );

  let snapshot = await resync(w.dmSocket, w.table._id);
  const measurement = snapshot.measurements.find(
    (item) => item.sceneId === sceneId && item.start.x === 0.5 && item.end.x === 3.5,
  );
  expect(
    measurement,
    'A medição persistente precisa aparecer em requestResync (docs/MEDIA_SCENES.md §4).',
  ).toBeTruthy();

  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestUpsertAura', {
      tableId: w.table._id,
      sceneId,
      tokenId: w.tokenOneId,
      name: 'Aura de teste',
      color: '#00ff88',
      radiusMeters: 3,
      difficultTerrain: true,
    }),
    'requestUpsertAura',
  );

  snapshot = await resync(w.dmSocket, w.table._id);
  expect(
    snapshot.auras.find((aura) => aura.tokenId === w.tokenOneId),
    'A aura precisa aparecer em requestResync (docs/MEDIA_SCENES.md §4).',
  ).toBeTruthy();

  await expect(tvPage!.locator('.display-board__aura')).toHaveCount(1, { timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.board-aura')).toHaveCount(1, { timeout: UI_TIMEOUT_MS });

  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestRemovePersistentMeasurement', {
      tableId: w.table._id,
      sceneId,
      id: measurement!.id,
    }),
    'requestRemovePersistentMeasurement',
  );
  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestRemoveAura', {
      tableId: w.table._id,
      sceneId,
      tokenId: w.tokenOneId,
    }),
    'requestRemoveAura',
  );

  await expect
    .poll(
      async () => {
        const state = await resync(w.dmSocket, w.table._id);
        return {
          measurements: state.measurements.filter((item) => item.sceneId === sceneId).length,
          auras: state.auras.filter((aura) => aura.tokenId === w.tokenOneId).length,
        };
      },
      {
        timeout: UI_TIMEOUT_MS,
        message: 'Remover overlays precisa refletir no requestResync.',
      },
    )
    .toEqual({ measurements: 0, auras: 0 });

  await expect(tvPage!.locator('.display-board__aura')).toHaveCount(0, { timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.board-aura')).toHaveCount(0, { timeout: UI_TIMEOUT_MS });

  // Evidência de que o fluxo não foi instantâneo a ponto de esconder falha.
  expect(Date.now() - startedAt).toBeGreaterThan(0);
});

test('autorização de assets: jogador não sobe/apaga mapa; não-membro não lê uso', async () => {
  const w = world!;

  const usageBefore = await fetchUsage(api, w.playerOne, w.table._id);
  const snapshotBefore = await resync(w.dmSocket, w.table._id);

  const uploadAsPlayer = await api.post(`${getBackendUrl()}/api/assets/maps/${w.table._id}`, {
    headers: authHeaders(w.playerOne),
    multipart: {
      file: { name: 'player-map.png', mimeType: 'image/png', buffer: TINY_PNG },
    },
  });
  expect(uploadAsPlayer.status(), 'Jogador não pode subir mapa (docs/MEDIA_SCENES.md §3.1).').toBe(403);

  const deleteAsPlayer = await api.delete(`${getBackendUrl()}/api/assets/${w.mapTwoAssetId}`, {
    headers: authHeaders(w.playerOne),
  });
  expect(deleteAsPlayer.status(), 'Jogador não pode apagar o asset de mapa da mesa.').toBe(403);

  const usageAsOutsider = await api.get(`${getBackendUrl()}/api/assets/tables/${w.table._id}/usage`, {
    headers: authHeaders(w.outsider),
  });
  expect(usageAsOutsider.status(), 'Não-membro não pode ler o uso de armazenamento.').toBe(403);

  const usageAfter = await fetchUsage(api, w.playerOne, w.table._id);
  expect(usageAfter, 'Ações rejeitadas não podem alterar o uso de assets.').toEqual(usageBefore);

  const snapshotAfter = await resync(w.dmSocket, w.table._id);
  expect(snapshotAfter.revision, 'Ações rejeitadas não podem incrementar a revisão.').toBe(
    snapshotBefore.revision,
  );
  expect(snapshotAfter.activeScene?._id).toBe(snapshotBefore.activeScene?._id);
  expect(snapshotAfter.activeScene?.imageUrl).toBe(snapshotBefore.activeScene?.imageUrl);

  // O asset continua lá e referenciado.
  const assetStillServed = await api.get(toBackendUrl(w.mapTwoUrl));
  expect(assetStillServed.status()).toBe(200);
});

test('reconectar o jogador mantém mapa, cena e overlays convergentes', async ({ browser }) => {
  const w = world!;
  const sceneId = w.sceneOne._id;

  // Deixa overlays vivos para provar que a reconexão hidrata o Mongo.
  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestAddPersistentMeasurement', {
      tableId: w.table._id,
      sceneId,
      payload: {
        start: { x: 1.5, y: 1.5 },
        end: { x: 5.5, y: 4.5 },
        distance: '6 m',
        type: 'line',
        color: '#3c096c',
      },
    }),
    'requestAddPersistentMeasurement(reconnect)',
  );
  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestUpsertAura', {
      tableId: w.table._id,
      sceneId,
      tokenId: w.tokenOneId,
      name: 'Aura de reconexão',
      color: '#ff8c00',
      radiusMeters: 3,
    }),
    'requestUpsertAura(reconnect)',
  );

  const expected = await resync(w.dmSocket, w.table._id);
  await sleep(200);

  await playerContext!.close();
  const session = await openAuthenticatedContext(browser, w.playerOne, { width: 390, height: 844 });
  playerContext = session.context;
  playerPage = session.page;
  await playerPage.goto(`${getBaseUrl()}/play/${w.table._id}`);

  await expect(playerPage.locator('.play-header__title')).toHaveText(w.table.name, { timeout: UI_TIMEOUT_MS });
  await expect(playerPage.locator('.play-header__scene')).toContainText(SCENE_ONE_NAME, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage.locator('.board-map')).toHaveAttribute('src', w.mapTwoUrl, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect(playerPage.locator('.board-aura')).toHaveCount(1, { timeout: UI_TIMEOUT_MS });
  await expect
    .poll(() => readRevision(playerPage!, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(expected.revision);

  const playerSnapshot = await resync(w.playerSocket, w.table._id);
  expect(playerSnapshot.revision).toBe(expected.revision);
  expect(playerSnapshot.activeScene?._id).toBe(w.sceneOne._id);
  expect(playerSnapshot.activeScene?.imageUrl).toBe(w.mapTwoUrl);
  expect(playerSnapshot.measurements.map((item) => item.id)).toEqual(
    expected.measurements.map((item) => item.id),
  );
  expect(playerSnapshot.auras.map((aura) => aura.tokenId)).toEqual(
    expected.auras.map((aura) => aura.tokenId),
  );
});
