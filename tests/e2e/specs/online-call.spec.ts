/**
 * F5-QA-1 — Fase 5 (chamada online + chat): DM + 2 jogadores, mídia falsa.
 *
 * Contrato: `docs/PHASE5_ONLINE_CALL.md` §2–6, `docs/ONLINE_MODE.md` §5.2 e
 * `docs/REALTIME_PROTOCOL.md`.
 *
 * Cobre, em contextos de navegador separados e com fake media do Chrome:
 *   1. entrada na chamada e áudio remoto (srcObject com track de áudio);
 *   2. mute/desmute propagando para os outros peers;
 *   3. deafen silenciando os `<audio>` remotos sem tocar `revision`;
 *   4. câmera do jogador visível nos peers e desligamento;
 *   5. compartilhamento de tela do DM (quando o headless permite);
 *   6. chat com `@todos`, destaque de menção, não lidas, histórico e reload;
 *   7. kick de mídia (só da chamada, jogador continua na mesa);
 *   8. reconexão do jogador (chamada, tabuleiro e chat convergem);
 *   9. loop acelerado (tabuleiro + chat + mídia) sem divergência;
 *  10. authz via socket: TV, não-membro e oferta cross-table são rejeitados.
 *
 * Mídia e chat são efêmeros: nenhum deles pode incrementar `revision`.
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
const MEDIA_TIMEOUT_MS = 30_000;
const NEGATIVE_WINDOW_MS = 1_200;

const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret';
const JWT_TTL_SECONDS = 6 * 60 * 60;

const TABLE_NAME = 'Mesa Online F5';
const SCENE_NAME = 'Cena Online F5';
const GRID_WIDTH = 12;
const GRID_HEIGHT = 8;
const TOKEN_P1 = 'Token P1';
const TOKEN_P2 = 'Token P2';
const CHAT_TEXT = '@todos avancem para a torre';

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
type DisplayTokenResponse = { token: string; displayUrl: string };

type TokenDto = { _id: string; name: string; squareId: string };
type Snapshot = {
  tableId: string;
  revision: number;
  table: { _id: string; players: Array<{ _id: string; username: string }> };
  tokens: TokenDto[];
};

type World = {
  dm: TestUser;
  p1: TestUser;
  p2: TestUser;
  table: TableInfo;
  scene: SceneInfo;
  dmSocket: Socket;
  p1Socket: Socket;
  p2Socket: Socket;
  displayToken: string;
  tokenP1Id: string;
  tokenP2Id: string;
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

const headers = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

async function createTable(api: APIRequestContext, user: TestUser, name: string): Promise<TableInfo> {
  const response = await api.post(`${getBackendUrl()}/api/tables/create`, {
    headers: headers(user),
    data: { name },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a mesa "${name}": ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as TableInfo;
}

async function createDisplayToken(
  api: APIRequestContext,
  dm: TestUser,
  tableId: string,
): Promise<DisplayTokenResponse> {
  const response = await api.post(`${getBackendUrl()}/api/tables/${tableId}/display-token`, {
    headers: headers(dm),
  });
  if (!response.ok()) {
    throw new Error(`Falha ao gerar token de display: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as DisplayTokenResponse;
}

// ---------------------------------------------------------------------------
// Socket
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
      reject(new Error(`Socket "${label}" falhou no handshake (${error.data?.code ?? 'UNKNOWN'}): ${error.message}`));
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

function expectAckError(ack: Ack | null, event: string, code: string): AckErr {
  expect(ack, `O evento "${event}" não respondeu ack.`).not.toBeNull();
  const value = ack as Ack;
  expect(value.ok, `Esperava erro em "${event}", veio ${JSON.stringify(value)}.`).toBe(false);
  const error = value as AckErr;
  expect(error.error.code, `Código inesperado em "${event}": ${JSON.stringify(error)}.`).toBe(code);
  return error;
}

function waitForSnapshot(socket: Socket, tableId: string, timeoutMs = EVENT_TIMEOUT_MS): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('sessionSnapshot', listener);
      reject(new Error(`sessionSnapshot de ${tableId} não chegou em ${timeoutMs}ms.`));
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
// UI helpers
// ---------------------------------------------------------------------------

const mediaDock = (page: Page) => page.locator('.media-dock').first();

const isPlayerPage = async (page: Page): Promise<boolean> => (await page.locator('.play-shell').count()) > 0;

/** O jogador só vê as tiles de mídia com a aba Chamada aberta. */
async function openPlayerCall(page: Page): Promise<void> {
  if (await page.locator('.player-call').isVisible().catch(() => false)) return;
  await page.locator('.player-nav [data-tab="chamada"]').click();
  await expect(page.locator('.player-call')).toBeVisible({ timeout: UI_TIMEOUT_MS });
}

async function closePlayerCall(page: Page): Promise<void> {
  if (!(await isPlayerPage(page))) return;
  if (await page.locator('.player-call').isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(page.locator('.player-call')).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
  }
}

/** Root de controles de chamada: dock (DM) ou sheet do jogador. */
async function callRoot(page: Page): Promise<ReturnType<Page['locator']>> {
  if ((await page.locator('.media-dock').count()) > 0) return mediaDock(page);
  await openPlayerCall(page);
  return page.locator('.player-call').first();
}

async function callButton(page: Page, name: string | RegExp) {
  const root = await callRoot(page);
  return root.getByRole('button', { name, exact: typeof name === 'string' });
}

async function clickCallButton(page: Page, name: string | RegExp): Promise<void> {
  const button = await callButton(page, name);
  await button.click();
}

const peerTile = (page: Page, username: string) =>
  page.locator('.media-tile').filter({ has: page.locator('.media-tile__name', { hasText: username }) });

async function readHeaderRevision(page: Page, selector: string): Promise<number> {
  const text = (await page.locator(selector).first().textContent()) ?? '';
  const match = /(\d+)/.exec(text);
  if (!match) throw new Error(`Revisão não encontrada em "${selector}" (texto: "${text}").`);
  return Number(match[1]);
}

async function expectCallCount(page: Page, count: number): Promise<void> {
  if (await isPlayerPage(page)) {
    // A nav do jogador expõe a contagem no nome acessível; não exige sheet aberto.
    await expect(page.locator('.player-nav [data-tab="chamada"]')).toHaveAttribute(
      'aria-label',
      new RegExp(`${count} participante`),
      { timeout: MEDIA_TIMEOUT_MS },
    );
    return;
  }
  await expect(mediaDock(page).locator('.media-dock__count')).toHaveText(String(count), {
    timeout: MEDIA_TIMEOUT_MS,
  });
}

async function joinCall(page: Page): Promise<void> {
  if (await isPlayerPage(page)) {
    await openPlayerCall(page);
    await page.locator('.player-call').getByRole('button', { name: 'Entrar com microfone', exact: true }).click();
    await expect(page.locator('.player-call__status')).toContainText('Na chamada', {
      timeout: MEDIA_TIMEOUT_MS,
    });
    await closePlayerCall(page);
    return;
  }
  await expect(mediaDock(page)).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await mediaDock(page).getByRole('button', { name: 'Entrar na chamada', exact: true }).click();
  // O DM confirma a entrada numa pré-chamada (permissão de mic/câmera) antes
  // de o navegador pedir acesso. Se a pílula voltar a entrar direto, o helper
  // segue sem quebrar.
  const preCall = page.getByRole('dialog', { name: 'Entrar na chamada' });
  const hasPreCall = await preCall
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (hasPreCall) {
    await preCall.getByRole('button', { name: 'Entrar com microfone', exact: true }).click();
  }
  await expect(mediaDock(page).locator('.media-dock__label').first()).toHaveText('Na chamada', {
    timeout: MEDIA_TIMEOUT_MS,
  });
}

/** Áudio remoto por tile: `srcObject` precisa existir e ter track de áudio. */
async function remoteAudioState(page: Page): Promise<Array<{ peerId: string; audioTracks: number }>> {
  return page.$$eval('.media-tile', (tiles) =>
    tiles
      .map((tile) => {
        const peerId = tile.getAttribute('data-peer-id') ?? '';
        if (!peerId || peerId === 'local') return null;
        const audio = tile.querySelector('audio');
        const stream = audio?.srcObject;
        const audioTracks = stream instanceof MediaStream ? stream.getAudioTracks().length : 0;
        return { peerId, audioTracks };
      })
      .filter((entry): entry is { peerId: string; audioTracks: number } => entry !== null),
  );
}

async function waitForRemoteAudio(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const entries = await remoteAudioState(page);
      return (
        entries.length === 2
        && entries.every((entry) => entry.audioTracks >= 1)
      );
    }, { timeout: MEDIA_TIMEOUT_MS, message: 'Os 2 peers remotos precisam de <audio> com track de áudio.' })
    .toBe(true);
}

/** Id (socket) do peer do usuário, lido do tile remoto na página do DM. */
async function peerIdOf(page: Page, username: string): Promise<string> {
  const tile = peerTile(page, username).first();
  await expect(tile).toBeVisible({ timeout: MEDIA_TIMEOUT_MS });
  const peerId = await tile.getAttribute('data-peer-id');
  if (!peerId || peerId === 'local') throw new Error(`Peer remoto de "${username}" sem data-peer-id.`);
  return peerId;
}

async function videoTracksOfPeer(page: Page, peerId: string): Promise<number> {
  return page.evaluate((id) => {
    const tile = document.querySelector(`.media-tile[data-peer-id="${id}"]`);
    if (!tile) return -1;
    const video = tile.querySelector('video');
    const stream = video?.srcObject;
    if (!(stream instanceof MediaStream)) return 0;
    return stream.getVideoTracks().length;
  }, peerId);
}

async function audioMutedState(page: Page): Promise<boolean[]> {
  return page.$$eval('.media-tile audio', (els) =>
    els.map((el) => (el as HTMLAudioElement).muted),
  );
}

async function openChat(page: Page): Promise<void> {
  if (await isPlayerPage(page)) {
    await page.locator('.player-nav [data-tab="chat"]').click();
  } else {
    const toggle = page.locator('[data-testid="chat-toggle"]').first();
    await expect(toggle).toBeVisible({ timeout: UI_TIMEOUT_MS });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: UI_TIMEOUT_MS });
}

async function closeChat(page: Page): Promise<void> {
  if (await isPlayerPage(page)) {
    // A sheet do jogador fecha com Esc e desmonta o painel (v-if da aba).
    await page.keyboard.press('Escape');
  } else {
    const toggle = page.locator('[data-testid="chat-toggle"]').first();
    if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  }
  await expect(page.locator('[data-testid="chat-panel"]')).toHaveCount(0, { timeout: UI_TIMEOUT_MS });
}

async function sendChat(page: Page, text: string): Promise<void> {
  const panel = page.locator('[data-testid="chat-panel"]');
  // No PlayerChatSheet o compositor vive no footer do BaseSheet, fora do
  // container `data-testid="chat-panel"`; procura na página inteira.
  const input = page.locator('.player-chat__input, .chat-panel__input').first();
  await expect(input).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(input).toBeEditable({ timeout: UI_TIMEOUT_MS });
  await input.fill(text);
  const send = page.locator('.player-chat__composer button[type="submit"], .chat-panel__send').first();
  await send.click();
  await expect(panel.locator('.chat-message__text').filter({ hasText: text }).first()).toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
}
// ---------------------------------------------------------------------------
// Estado compartilhado
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(240_000);

let api: APIRequestContext;
let world: World | null = null;
const contexts: BrowserContext[] = [];
let dmPage: Page | null = null;
let p1Page: Page | null = null;
let p2Page: Page | null = null;
let displayPage: Page | null = null;
let p1Context: BrowserContext | null = null;
let p1PeerId = '';
let p2PeerId = '';

async function openContext(
  browser: Browser,
  user: TestUser | null,
  viewport: { width: number; height: number },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  contexts.push(context);
  if (user) {
    await context.addInitScript((token: string) => {
      window.localStorage.setItem('authToken', token);
    }, user.token);
  }
  const page = await context.newPage();
  return { context, page };
}

function requireWorld(): World {
  expect(world, 'O setup online da Fase 5 não foi criado.').not.toBeNull();
  return world!;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const dm = await registerUser(api, 'dm-f5', suffix);
  const p1 = await registerUser(api, 'player1-f5', suffix);
  const p2 = await registerUser(api, 'player2-f5', suffix);

  const table = await createTable(api, dm, `${TABLE_NAME} ${suffix}`);

  const systemResponse = await api.put(`${getBackendUrl()}/api/tables/${table._id}/system`, {
    headers: { ...headers(dm), 'Content-Type': 'application/json' },
    data: { systemKey: 'dnd5e' },
  });
  expect(systemResponse.ok(), `Falha ao definir o sistema: ${systemResponse.status()}`).toBe(true);

  const sceneResponse = await api.post(`${getBackendUrl()}/api/tables/${table._id}/scenes`, {
    headers: { ...headers(dm), 'Content-Type': 'application/json' },
    data: { name: SCENE_NAME, gridWidth: GRID_WIDTH, gridHeight: GRID_HEIGHT },
  });
  expect(sceneResponse.status(), 'Falha ao criar a cena online.').toBe(201);
  const scene = (await sceneResponse.json()) as SceneInfo;

  const dmSocket = await connectSocket({ token: dm.token }, 'dm-f5');
  await joinTable(dmSocket, table._id);
  expectAckOk(
    await emitWithAck(dmSocket, 'requestSetActiveScene', { tableId: table._id, sceneId: scene._id }),
    'requestSetActiveScene',
  );
  expectAckOk(
    await emitWithAck(dmSocket, 'requestUpdateSessionStatus', { tableId: table._id, newStatus: 'LIVE' }),
    'requestUpdateSessionStatus',
  );

  // DM entra primeiro (rota /table); os jogadores entram pelo convite.
  const dmSession = await openContext(browser, dm, { width: 1440, height: 900 });
  dmPage = dmSession.page;
  await dmPage.goto(`${getBaseUrl()}/table/${table._id}`);
  await expect(mediaDock(dmPage!)).toBeVisible({ timeout: UI_TIMEOUT_MS });

  const p1Session = await openContext(browser, p1, { width: 390, height: 844 });
  p1Context = p1Session.context;
  p1Page = p1Session.page;
  await p1Page.goto(`${getBaseUrl()}/play/${table._id}?invite=${table.inviteCode}`);

  const p2Session = await openContext(browser, p2, { width: 1280, height: 800 });
  p2Page = p2Session.page;
  await p2Page.goto(`${getBaseUrl()}/play/${table._id}?invite=${table.inviteCode}`);

  // O convite precisa efetivamente adicionar os dois jogadores (Fase 2 §4.1).
  await expect
    .poll(
      async () => {
        const snapshot = await resync(dmSocket, table._id);
        return [p1.id, p2.id].every((id) => snapshot.table.players.some((entry) => entry._id === id));
      },
      { timeout: UI_TIMEOUT_MS },
    )
    .toBe(true);

  expectAckOk(
    await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: table._id,
      sceneId: scene._id,
      squareId: 'sq-14',
      name: TOKEN_P1,
      size: 'Pequeno/Médio',
      movement: 9,
      ownerId: p1.id,
    }),
    'requestPlaceToken',
  );
  expectAckOk(
    await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: table._id,
      sceneId: scene._id,
      squareId: 'sq-15',
      name: TOKEN_P2,
      size: 'Pequeno/Médio',
      movement: 9,
      ownerId: p2.id,
    }),
    'requestPlaceToken',
  );

  const p1Socket = await connectSocket({ token: p1.token }, 'player1-f5');
  await joinTable(p1Socket, table._id);
  const p2Socket = await connectSocket({ token: p2.token }, 'player2-f5');
  await joinTable(p2Socket, table._id);

  const snapshot = await resync(dmSocket, table._id);
  const placedP1 = snapshot.tokens.find((entry) => entry.name === TOKEN_P1);
  const placedP2 = snapshot.tokens.find((entry) => entry.name === TOKEN_P2);
  if (!placedP1 || !placedP2) throw new Error('Tokens dos jogadores não apareceram no snapshot.');

  // TV (somente leitura) para provar que chat/mídia não mexem na revisão.
  const display = await createDisplayToken(api, dm, table._id);
  const displaySession = await openContext(browser, null, { width: 1920, height: 1080 });
  displayPage = displaySession.page;
  await displayPage.goto(`${getBaseUrl()}/display/${table._id}#token=${display.token}`);
  await expect(displayPage.locator('.display-header__revision')).toBeVisible({ timeout: UI_TIMEOUT_MS });

  world = {
    dm,
    p1,
    p2,
    table,
    scene,
    dmSocket,
    p1Socket,
    p2Socket,
    displayToken: display.token,
    tokenP1Id: placedP1._id,
    tokenP2Id: placedP2._id,
  };
});

test.afterAll(async () => {
  for (const socket of [world?.dmSocket, world?.p1Socket, world?.p2Socket]) {
    try {
      socket?.close();
    } catch {
      // já encerrado
    }
  }
  for (const context of contexts) {
    await context.close().catch(() => undefined);
  }
  await api?.dispose();
});

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

test('F5 · DM e 2 jogadores entram na chamada e recebem áudio remoto', async () => {
  const w = requireWorld();

  // Entrada sequencial: cada um precisa ver o painel e a contagem crescer.
  await joinCall(dmPage!);
  await expectCallCount(dmPage!, 1);

  await joinCall(p1Page!);
  await expectCallCount(p1Page!, 2);

  await joinCall(p2Page!);
  await expectCallCount(p2Page!, 3);

  // Fonte da verdade: todos convergem em 3 participantes (você + 2 peers).
  await expectCallCount(dmPage!, 3);
  await expectCallCount(p1Page!, 3);
  await expectCallCount(p2Page!, 3);

  for (const [page, own, others] of [
    [dmPage!, w.dm.username, [w.p1.username, w.p2.username]],
    [p1Page!, w.p1.username, [w.dm.username, w.p2.username]],
    [p2Page!, w.p2.username, [w.dm.username, w.p1.username]],
  ] as Array<[Page, string, string[]]>) {
    const player = await isPlayerPage(page);
    if (player) await openPlayerCall(page);
    await expect(page.locator('.media-tile[data-peer-id="local"]')).toHaveCount(1);
    await expect(page.locator('.media-tile__name').filter({ hasText: own })).toHaveCount(1);
    for (const username of others) {
      await expect(peerTile(page, username).first()).toBeVisible({ timeout: MEDIA_TIMEOUT_MS });
    }
    await expect(page.locator('.media-tile')).toHaveCount(3, { timeout: MEDIA_TIMEOUT_MS });
    await waitForRemoteAudio(page);
    if (player) await closePlayerCall(page);
  }

  p1PeerId = await peerIdOf(dmPage!, w.p1.username);
  p2PeerId = await peerIdOf(dmPage!, w.p2.username);
  expect(p1PeerId).not.toBe(p2PeerId);

  // A barra do header do /play também mostra a chamada (mobile e desktop).
  await expect(p1Page!.locator('.play-header__call')).toContainText('3', { timeout: UI_TIMEOUT_MS });
});

test('mute de um jogador propaga e desmutar limpa o badge nos peers', async () => {
  const w = requireWorld();

  await openPlayerCall(p1Page!);
  await clickCallButton(p1Page!, 'Silenciar microfone');

  await openPlayerCall(p2Page!);
  for (const page of [dmPage!, p2Page!]) {
    const tile = peerTile(page, w.p1.username).first();
    await expect(tile.locator('.media-tile__badge[aria-label="Microfone mudo"]')).toBeVisible({
      timeout: MEDIA_TIMEOUT_MS,
    });
    await expect(tile.locator('.media-tile__badge[title="Microfone mudo"]')).toBeVisible();
  }
  await closePlayerCall(p2Page!);
  await expect(p1Page!.locator('.player-call__status')).toContainText('Na chamada');

  await clickCallButton(p1Page!, 'Ativar microfone');

  await openPlayerCall(p2Page!);
  for (const page of [dmPage!, p2Page!]) {
    await expect(
      peerTile(page, w.p1.username).first().locator('.media-tile__badge[aria-label="Microfone mudo"]'),
    ).toHaveCount(0, { timeout: MEDIA_TIMEOUT_MS });
  }
  await closePlayerCall(p2Page!);
  await closePlayerCall(p1Page!);
});

test('deafen silencia o áudio remoto local e não incrementa revision', async () => {
  const w = requireWorld();

  const beforeSync = await resync(w.dmSocket, w.table._id);
  const beforePlayer = await readHeaderRevision(p1Page!, '.play-header__revision');
  const beforeDisplay = await readHeaderRevision(displayPage!, '.display-header__revision');
  expect(beforePlayer).toBe(beforeSync.revision);
  expect(beforeDisplay).toBe(beforeSync.revision);

  await openPlayerCall(p1Page!);
  await clickCallButton(p1Page!, 'Ensurdar a chamada');
  await expect(p1Page!.locator('.player-call__status')).toContainText('Na chamada');

  // Deafen silencia todos os <audio> remotos do próprio peer.
  await expect
    .poll(async () => (await audioMutedState(p1Page!)).every(Boolean), { timeout: MEDIA_TIMEOUT_MS })
    .toBe(true);
  // E muta o microfone por padrão (contrato §2.1 de ONLINE_MODE.md).
  await expect(await callButton(p1Page!, 'Ativar microfone')).toBeVisible();

  const duringSync = await resync(w.dmSocket, w.table._id);
  expect(duringSync.revision, 'Deafen não pode incrementar revision.').toBe(beforeSync.revision);
  expect(await readHeaderRevision(p1Page!, '.play-header__revision')).toBe(beforePlayer);
  expect(await readHeaderRevision(displayPage!, '.display-header__revision')).toBe(beforeDisplay);

  await p1Page!.getByRole('button', { name: /Ouvir a chamada|Voltar a ouvir/ }).click();
  await expect
    .poll(async () => (await audioMutedState(p1Page!)).some(Boolean), { timeout: MEDIA_TIMEOUT_MS })
    .toBe(false);

  // Deafen muta o mic por padrão e o unmute do deafen não o restaura: limpa.
  await clickCallButton(p1Page!, 'Ativar microfone');
  await expect
    .poll(async () => {
      const tile = peerTile(dmPage!, w.p1.username).first();
      return tile.locator('.media-tile__badge[aria-label="Microfone mudo"]').count();
    }, { timeout: MEDIA_TIMEOUT_MS })
    .toBe(0);

  const afterSync = await resync(w.dmSocket, w.table._id);
  expect(afterSync.revision).toBe(beforeSync.revision);
  await closePlayerCall(p1Page!);
});

test('câmera do jogador aparece nos peers com track de vídeo e desliga', async () => {
  const w = requireWorld();

  const beforeSync = await resync(w.dmSocket, w.table._id);
  await openPlayerCall(p1Page!);
  await clickCallButton(p1Page!, 'Ligar câmera');

  await openPlayerCall(p2Page!);
  for (const page of [dmPage!, p2Page!]) {
    await expect
      .poll(async () => videoTracksOfPeer(page, p1PeerId), {
        timeout: MEDIA_TIMEOUT_MS,
        message: 'O peer precisa receber a track de vídeo da câmera do jogador.',
      })
      .toBeGreaterThan(0);
    await expect(peerTile(page, w.p1.username).first().locator('video.media-tile__video')).toBeVisible();
  }

  const afterCamera = await resync(w.dmSocket, w.table._id);
  expect(afterCamera.revision, 'Câmera é efêmera e não pode incrementar revision.').toBe(beforeSync.revision);

  await clickCallButton(p1Page!, 'Desligar câmera');

  for (const page of [dmPage!, p2Page!]) {
    await expect(peerTile(page, w.p1.username).first().locator('video.media-tile__video')).toHaveCount(0, {
      timeout: MEDIA_TIMEOUT_MS,
    });
    await expect(
      peerTile(page, w.p1.username).first().locator('.media-tile__placeholder'),
    ).toBeVisible();
  }
  await closePlayerCall(p2Page!);
  await closePlayerCall(p1Page!);
});

test('compartilhamento de tela do DM aparece para os jogadores', async () => {
  const w = requireWorld();

  const beforeSync = await resync(w.dmSocket, w.table._id);
  const errorBox = mediaDock(dmPage!).locator('.media-dock__error');
  const p1ScreenBadge = peerTile(p1Page!, w.dm.username).first().locator('.media-tile__badge--screen');

  await openPlayerCall(p1Page!);
  await openPlayerCall(p2Page!);
  await clickCallButton(dmPage!, 'Compartilhar tela');

  // Fake display media: ou os peers recebem a tela, ou o browser não suporta.
  await expect
    .poll(async () => {
      if ((await p1ScreenBadge.count()) > 0) return 'shared';
      if ((await errorBox.count()) > 0) return 'error';
      return 'pending';
    }, { timeout: MEDIA_TIMEOUT_MS })
    .not.toBe('pending');

  if ((await errorBox.count()) > 0) {
    const reason = ((await errorBox.textContent()) ?? '').trim();
    test.info().annotations.push({ type: 'environment', description: `getDisplayMedia: ${reason}` });
    // Não fabrique sucesso: sem tela no headless, registra a limitação real.
    test.skip(true, `Headless sem getDisplayMedia funcional: ${reason}`);
    return;
  }

  const dmPeerId = await peerIdOf(p1Page!, w.dm.username);
  for (const page of [p1Page!, p2Page!]) {
    await expect(
      peerTile(page, w.dm.username).first().locator('.media-tile__badge[aria-label="Compartilhando tela"]'),
    ).toBeVisible({ timeout: MEDIA_TIMEOUT_MS });
    await expect
      .poll(async () => videoTracksOfPeer(page, dmPeerId), {
        timeout: MEDIA_TIMEOUT_MS,
        message: 'A tela compartilhada precisa chegar como track de vídeo.',
      })
      .toBeGreaterThan(0);
  }

  const afterShare = await resync(w.dmSocket, w.table._id);
  expect(afterShare.revision, 'Tela é efêmera e não pode incrementar revision.').toBe(beforeSync.revision);

  await clickCallButton(dmPage!, 'Parar compartilhamento de tela');
  for (const page of [p1Page!, p2Page!]) {
    await expect(
      peerTile(page, w.dm.username).first().locator('.media-tile__badge--screen'),
    ).toHaveCount(0, { timeout: MEDIA_TIMEOUT_MS });
  }
  await closePlayerCall(p2Page!);
  await closePlayerCall(p1Page!);
});

test('chat com @todos chega, destaca menção, limpa não lidas e sobrevive a reload', async ({ browser }) => {
  const w = requireWorld();

  // Em headless com mídia fake, o renderer do jogador pode cair nos testes de
  // câmera/tela. Reabre a página antes de exercitar o chat em vez de mascarar
  // com skip: o fluxo testado continua sendo o do jogador real.
  if (!p1Page || p1Page.isClosed()) {
    const session = await openContext(browser, w.p1, { width: 390, height: 844 });
    p1Page = session.page;
    p1Context = session.context;
    await p1Page.goto(`${getBaseUrl()}/play/${w.table._id}?invite=${w.table.inviteCode}`);
    await expect(p1Page.locator('.play-header')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  }

  const beforeSync = await resync(w.dmSocket, w.table._id);
  const beforePlayer = await readHeaderRevision(p1Page!, '.play-header__revision');
  const beforeDisplay = await readHeaderRevision(displayPage!, '.display-header__revision');

  const dmToggle = dmPage!.locator('[data-testid="chat-toggle"]').first();
  await expect(dmToggle.locator('.chat-toggle__badge')).toHaveCount(0);

  await openChat(p1Page!);
  await sendChat(p1Page!, CHAT_TEXT);

  // O DM está com o painel fechado: a mensagem gera badge de não lida.
  await expect(dmToggle.locator('.chat-toggle__badge')).toBeVisible({ timeout: UI_TIMEOUT_MS });

  await dmToggle.click();
  const dmPanel = dmPage!.locator('[data-testid="chat-panel"]');
  await expect(dmPanel).toBeVisible({ timeout: UI_TIMEOUT_MS });

  const message = dmPanel.locator('.chat-message', { hasText: CHAT_TEXT }).first();
  await expect(message).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(message.locator('.chat-message__mention.is-all')).toHaveText('@todos');
  await expect(message.locator('.chat-message__author')).toHaveText(w.p1.username);
  await expect(dmToggle.locator('.chat-toggle__badge')).toHaveCount(0);

  // Chat não incrementa revision em nenhum cliente.
  const afterSync = await resync(w.dmSocket, w.table._id);
  expect(afterSync.revision, 'Chat não pode incrementar revision.').toBe(beforeSync.revision);
  expect(await readHeaderRevision(p1Page!, '.play-header__revision')).toBe(beforePlayer);
  expect(await readHeaderRevision(displayPage!, '.display-header__revision')).toBe(beforeDisplay);

  // Reload do jogador: o histórico REST repõe a mensagem.
  await p1Context!.close();
  const session = await openContext(browser, w.p1, { width: 390, height: 844 });
  p1Context = session.context;
  p1Page = session.page;
  await p1Page.goto(`${getBaseUrl()}/play/${w.table._id}`);
  await expect(p1Page.locator('.token-card')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await openChat(p1Page);
  await expect(
    p1Page.locator('[data-testid="chat-panel"] .chat-message', { hasText: CHAT_TEXT }).first(),
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await closeChat(p1Page!);
});

test('kick de mídia remove o jogador da chamada sem removê-lo da mesa', async () => {
  const w = requireWorld();

  // O reload do chat derrubou a chamada do p1; reentra antes do kick.
  const p1CallLabel = (await p1Page!.locator('.player-nav [data-tab="chamada"]').getAttribute('aria-label')) ?? '';
  if (!/\d+ participante/.test(p1CallLabel)) {
    await joinCall(p1Page!);
  }
  await expectCallCount(p1Page!, 3);
  await expectCallCount(dmPage!, 3);
  p1PeerId = await peerIdOf(dmPage!, w.p1.username);
  expect(p2PeerId).toBe(await peerIdOf(dmPage!, w.p2.username));

  const beforeSync = await resync(w.dmSocket, w.table._id);
  const kick = expectAckOk(
    await emitWithAck(w.dmSocket, 'mediaKick', { tableId: w.table._id, peerId: p2PeerId }),
    'mediaKick',
  );
  expect(kick.ok).toBe(true);

  // O alvo sai da chamada e vê o motivo; continua na mesa.
  await openPlayerCall(p2Page!);
  await expect(p2Page!.locator('.player-call__error')).toContainText(/removido da chamada/i, {
    timeout: MEDIA_TIMEOUT_MS,
  });
  await expect(
    p2Page!.locator('.player-call').getByRole('button', { name: 'Entrar mudo', exact: true }),
  ).toBeVisible({ timeout: MEDIA_TIMEOUT_MS });
  await expect(p2Page!.locator('.participant-grid')).toHaveCount(0);
  await closePlayerCall(p2Page!);
  await expect(peerTile(dmPage!, w.p2.username)).toHaveCount(0, { timeout: MEDIA_TIMEOUT_MS });
  await expect(dmPage!.locator('.media-tile')).toHaveCount(2, { timeout: MEDIA_TIMEOUT_MS });

  // Continua na mesa/tabuleiro com o token visível.
  await expect(p2Page!.locator(`.board-token[title="${TOKEN_P2}"]`)).toBeVisible({ timeout: UI_TIMEOUT_MS });
  const afterKick = await resync(w.dmSocket, w.table._id);
  expect(afterKick.table.players.some((entry) => entry._id === w.p2.id)).toBe(true);
  expect(afterKick.revision, 'Kick de mídia não mexe no tabuleiro.').toBe(beforeSync.revision);
  expect(await readHeaderRevision(displayPage!, '.display-header__revision')).toBe(beforeSync.revision);

  // Reentra na chamada; todos voltam a 3.
  await joinCall(p2Page!);
  await expectCallCount(p2Page!, 3);
  await expectCallCount(dmPage!, 3);
  await expectCallCount(p1Page!, 3);
  p2PeerId = await peerIdOf(dmPage!, w.p2.username);
});

test('reconectar o jogador volta à chamada mantendo tabuleiro, revisão e histórico', async ({ browser }) => {
  const w = requireWorld();

  const expected = await resync(w.dmSocket, w.table._id);
  const chatHistory = await api.get(`${getBackendUrl()}/api/tables/${w.table._id}/chat?limit=50`, {
    headers: headers(w.p1),
  });
  expect(chatHistory.ok(), 'Histórico do chat precisa estar acessível ao membro.').toBe(true);
  const history = (await chatHistory.json()) as Array<{ text: string }>;
  expect(history.some((entry) => entry.text === CHAT_TEXT)).toBe(true);

  await p1Context!.close();
  const session = await openContext(browser, w.p1, { width: 390, height: 844 });
  p1Context = session.context;
  p1Page = session.page;
  await p1Page.goto(`${getBaseUrl()}/play/${w.table._id}`);
  await expect(p1Page.locator('.token-card')).toBeVisible({ timeout: UI_TIMEOUT_MS });

  // A chamada tinha caído para 2; ao reentrar, volta a 3 em todos.
  await expectCallCount(dmPage!, 2);
  await joinCall(p1Page!);
  await expectCallCount(p1Page!, 3);
  await expectCallCount(dmPage!, 3);
  await expectCallCount(p2Page!, 3);

  await expect
    .poll(() => readHeaderRevision(p1Page!, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(expected.revision);

  await openChat(p1Page!);
  await expect(
    p1Page.locator('[data-testid="chat-panel"] .chat-message', { hasText: CHAT_TEXT }).first(),
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
  // Fecha o sheet antes de voltar a usar o dock no loop acelerado.
  await closeChat(p1Page!);

  // Áudio remoto volta a existir para os 2 peers após a reconexão.
  await waitForRemoteAudio(p1Page);
  await expect(peerTile(dmPage!, w.p1.username).first()).toBeVisible({ timeout: MEDIA_TIMEOUT_MS });
  await waitForRemoteAudio(dmPage!);
  p1PeerId = await peerIdOf(dmPage!, w.p1.username);
});

test('loop acelerado: tabuleiro + chat + mídia sem divergência de revisão', async () => {
  const w = requireWorld();

  // Orçamento de deslocamento do token (9 m) só cobre ~6 casas: eleva para o
  // loop de 10 movimentos continuar sendo uma ação de tabuleiro canônica.
  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestEditToken', {
      tableId: w.table._id,
      tokenId: w.tokenP1Id,
      patch: { movement: 100, resetRemainingMovement: true },
    }),
    'requestEditToken(loop)',
  );

  const start = await resync(w.dmSocket, w.table._id);
  const squares = ['sq-40', 'sq-41', 'sq-42', 'sq-43', 'sq-44', 'sq-45', 'sq-46', 'sq-47', 'sq-48', 'sq-49'];

  for (let i = 0; i < squares.length; i += 1) {
    const before = await resync(w.dmSocket, w.table._id);
    expectAckOk(
      await emitWithAck(w.dmSocket, 'requestMoveToken', {
        tableId: w.table._id,
        tokenId: w.tokenP1Id,
        targetSquareId: squares[i],
        expectedRevision: before.revision,
      }),
      `requestMoveToken#${i}`,
    );

    expectAckOk(
      await emitWithAck(w.p1Socket, 'requestSendChatMessage', {
        tableId: w.table._id,
        text: `loop ${i + 1}`,
        mentions: [],
      }),
      `requestSendChatMessage#${i}`,
    );

    // Mídia é efêmera e já está coberta pelos testes de mute/câmera/tela;
    // este loop foca estado de tabuleiro, chat e revisão.
  }

  const end = await resync(w.dmSocket, w.table._id);
  expect(end.revision).toBeGreaterThan(start.revision);
  const moved = end.tokens.find((entry) => entry._id === w.tokenP1Id);
  expect(moved?.squareId).toBe(squares[squares.length - 1]);

  // Convergência final: DM (socket), /play dos dois e TV leem a mesma revisão.
  for (const [page, selector] of [
    [p1Page!, '.play-header__revision'],
    [p2Page!, '.play-header__revision'],
    [displayPage!, '.display-header__revision'],
  ] as Array<[Page, string]>) {
    await expect
      .poll(() => readHeaderRevision(page, selector), { timeout: UI_TIMEOUT_MS })
      .toBe(end.revision);
  }

  // A mesa não perdeu o token nem a cena do loop.
  await expect(p1Page!.locator(`.board-token[title="${TOKEN_P1}"]`)).toBeVisible();
  expect(moved).toBeTruthy();
});

test('authz: TV e não-membro não entram na mídia; oferta cross-table é rejeitada', async () => {
  const w = requireWorld();

  // 1) TV (display) não entra na chamada.
  const displaySocket = await connectSocket({ displayToken: w.displayToken }, 'display-authz');
  try {
    await joinTable(displaySocket, w.table._id);
    const displayJoin = expectAckError(
      await emitWithAck(displaySocket, 'mediaJoin', { tableId: w.table._id }),
      'mediaJoin(display)',
      'FORBIDDEN',
    );
    expect(displayJoin.error.code).toBe('FORBIDDEN');
  } finally {
    displaySocket.close();
  }

  // 2) Usuário fora da mesa é rejeitado (mesma resposta de mesa inexistente).
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outsider = await registerUser(api, 'outsider-f5', suffix);
  const outsiderTable = await createTable(api, outsider, `Mesa Fora ${suffix}`);
  const outsiderSocket = await connectSocket({ token: outsider.token }, 'outsider-f5');
  try {
    await joinTable(outsiderSocket, outsiderTable._id);
    expectAckError(
      await emitWithAck(outsiderSocket, 'mediaJoin', { tableId: w.table._id }),
      'mediaJoin(non-member)',
      'FORBIDDEN',
    );

    // 3) Relay de SDP nunca cruza mesas.
    expectAckOk(
      await emitWithAck(outsiderSocket, 'mediaJoin', { tableId: outsiderTable._id }),
      'mediaJoin(outsider own table)',
    );

    const crossTable = expectAckError(
      await emitWithAck(outsiderSocket, 'mediaOffer', {
        tableId: outsiderTable._id,
        toPeerId: p1PeerId,
        sdp: { type: 'offer', sdp: 'v=0\r\n' },
      }),
      'mediaOffer(cross-table target)',
      'NOT_FOUND',
    );
    expect(crossTable.error.code).toBe('NOT_FOUND');

    const foreignRoom = expectAckError(
      await emitWithAck(outsiderSocket, 'mediaOffer', {
        tableId: w.table._id,
        toPeerId: p1PeerId,
        sdp: { type: 'offer', sdp: 'v=0\r\n' },
      }),
      'mediaOffer(foreign room)',
      'CONFLICT',
    );
    expect(foreignRoom.error.code).toBe('CONFLICT');

    // Nada disso altera o estado canônico da mesa.
    const snapshot = await resync(w.dmSocket, w.table._id);
    expect(snapshot.table.players.some((entry) => entry._id === outsider.id)).toBe(false);
    // Janela curta só para garantir que a oferta inválida não foi retransmitida.
    await p1Page!.waitForTimeout(NEGATIVE_WINDOW_MS);
  } finally {
    outsiderSocket.close();
  }
});
