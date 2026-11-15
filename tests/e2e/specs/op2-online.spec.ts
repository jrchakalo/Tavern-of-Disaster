/**
 * P3.1-QA-2 — One-shot OP2 online: dois clientes remotos, sem TV.
 *
 * Contrato de referência: `docs/ORDEM_PARANORMAL.md` §7 (E2E online com 2
 * contextos remotos) sobre `docs/ONLINE_MODE.md` (o jogo remoto usa as mesmas
 * rotas `/table/:id` e `/play/:id`) e `docs/REALTIME_PROTOCOL.md`.
 *
 * Fluxo:
 *   1. DM e jogador entram em contextos separados; o jogador entra pelo link
 *      de convite `/play/:id?invite=...`.
 *   2. O jogador abre a própria ficha OP2 e rola Percepção (passo).
 *   3. O DM recebe `diceRolled` com `kind:'step'` + `step`.
 *   4. PD converge nos dois sentidos (jogador → DM, DM → jogador).
 *   5. Reconectar o jogador mantém PD e a rolagem de passo recente.
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

const getBackendUrl = () => process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3100';
const getBaseUrl = () => process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

const ACK_TIMEOUT_MS = 6_000;
const EVENT_TIMEOUT_MS = 8_000;
const UI_TIMEOUT_MS = 25_000;

const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret';
const JWT_TTL_SECONDS = 6 * 60 * 60;

const OP2_KEY = 'ordem-paranormal-2';
const CHARACTER_NAME = 'Íris';
const TOKEN_NAME = 'Íris token';
const INITIAL = {
  currentHP: 16,
  maxHP: 16,
  currentPD: 10,
  maxPD: 10,
  armorPoints: 1,
  armorPointsMax: 1,
};
const PD_PLAYER = 7;
const PD_DM = 4;

type AckOk = { ok: true; revision: number; serverNowMs: number; [key: string]: unknown };
type AckErr = {
  ok: false;
  error: { code: string; message: string };
  revision: number;
  serverNowMs: number;
};
type Ack = AckOk | AckErr;

type TestUser = { id: string; username: string; email: string; password: string; token: string };
type TableInfo = { _id: string; name: string; inviteCode: string; scenes: string[] };
type SceneInfo = { _id: string; name: string };

type CharacterSummary = {
  _id: string;
  name: string;
  currentHP?: number;
  maxHP?: number;
  currentPD?: number;
  maxPD?: number;
  armorPoints?: number;
  tokenId?: string | null;
};

type TokenDto = {
  _id: string;
  name: string;
  character?: {
    _id: string;
    name: string;
    currentHP?: number;
    maxHP?: number;
    currentPD?: number;
    maxPD?: number;
    armorPoints?: number;
  } | null;
};

type Snapshot = {
  tableId: string;
  revision: number;
  table: { _id: string; players: Array<{ _id: string; username: string }> };
  tokens: TokenDto[];
  characters?: CharacterSummary[];
};

type StepDetails = {
  attribute: { key: string; die: number; value: number };
  skill: { key: string; die: number; value: number };
  difficulty: number;
  success: boolean;
  critical: boolean;
  fumble: boolean;
  summedDice: number[];
  high: number;
  low: number;
};

type RollPayload = {
  tableId: string;
  kind?: 'expression' | 'step' | 'table';
  expression: string;
  characterId?: string;
  total: number;
  revision: number;
  step?: StepDetails;
  rolls: Array<{ die: number; value: number; kept: 'kept' | 'dropped'; role?: string }>;
};

type World = {
  dm: TestUser;
  player: TestUser;
  table: TableInfo;
  scene: SceneInfo;
  characterId: string;
  tokenId: string;
  dmSocket: Socket;
  playerSocket: Socket;
  contractError: string | null;
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

async function fetchRolls(api: APIRequestContext, user: TestUser, tableId: string): Promise<RollPayload[]> {
  const response = await api.get(`${getBackendUrl()}/api/tables/${tableId}/rolls?limit=50`, {
    headers: headers(user),
  });
  if (!response.ok()) {
    throw new Error(`Falha ao ler o log online: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as RollPayload[];
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

function waitForEvent<T>(socket: Socket, event: string, predicate: (payload: T) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Evento "${event}" não recebido em ${EVENT_TIMEOUT_MS}ms.`));
    }, EVENT_TIMEOUT_MS);
    const listener = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

async function readRevision(page: Page): Promise<number> {
  const text = (await page.locator('.play-header__revision').first().textContent()) ?? '';
  const match = /(\d+)/.exec(text);
  if (!match) throw new Error(`Revisão não encontrada no /play (texto: "${text}").`);
  return Number(match[1]);
}

async function readPd(sheet: ReturnType<Page['locator']>): Promise<number> {
  const input = sheet.getByLabel(/^PD atual$/i).first();
  await expect(input, 'Campo "PD atual" não encontrado na ficha OP2.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  return Number(await input.inputValue());
}

async function openPlayerSheet(page: Page) {
  const sheet = page.locator('.character-sheet');
  if (await sheet.isVisible().catch(() => false)) return sheet;
  const card = page.locator('.token-card').first();
  await expect(card, 'O /play remoto precisa exibir o token card.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  await card.click();
  await expect(sheet, 'O card remoto precisa abrir a própria ficha OP2.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  return sheet;
}

async function openPdTab(page: Page) {
  const sheet = await openPlayerSheet(page);
  const op2 = sheet.locator('.op2-sheet');
  await expect(op2).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await op2.getByRole('tab', { name: 'Recursos' }).click();
  return { sheet, op2 };
}

async function closeSheet(page: Page): Promise<void> {
  const close = page.locator('.character-sheet button[aria-label="Fechar"]');
  if (await close.count()) {
    await close.first().click().catch(() => undefined);
    await expect(page.locator('.character-sheet')).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(180_000);

let api: APIRequestContext;
let world: World | null = null;
const contexts: BrowserContext[] = [];
let playerContext: BrowserContext | null = null;
let dmPage: Page | null = null;
let playerPage: Page | null = null;

function requireContract(): void {
  const reason = world?.contractError;
  test.skip(Boolean(reason), reason ? `Bloqueado: ${reason}` : 'Contrato da Fase 3.1 ausente nesta branch.');
}

async function openContext(
  browser: Browser,
  user: TestUser,
  viewport: { width: number; height: number },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  contexts.push(context);
  await context.addInitScript((token: string) => {
    window.localStorage.setItem('authToken', token);
  }, user.token);
  const page = await context.newPage();
  return { context, page };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const dm = await registerUser(api, 'dm-op2-online', suffix);
  const player = await registerUser(api, 'player-op2-online', suffix);

  const tableResponse = await api.post(`${getBackendUrl()}/api/tables/create`, {
    headers: headers(dm),
    data: { name: `Mesa OP2 Online ${suffix}` },
  });
  if (tableResponse.status() !== 201) {
    throw new Error(`Falha ao criar a mesa online: ${tableResponse.status()} ${await tableResponse.text()}`);
  }
  const table = (await tableResponse.json()) as TableInfo;

  const systemResponse = await api.put(`${getBackendUrl()}/api/tables/${table._id}/system`, {
    headers: { ...headers(dm), 'Content-Type': 'application/json' },
    data: { systemKey: OP2_KEY },
  });

  const joinResponse = await api.post(`${getBackendUrl()}/api/tables/join`, {
    headers: headers(player),
    data: { inviteCode: table.inviteCode },
  });

  const sceneResponse = await api.post(`${getBackendUrl()}/api/tables/${table._id}/scenes`, {
    headers: { ...headers(dm), 'Content-Type': 'application/json' },
    data: { name: `Cena OP2 Online ${suffix}`, gridWidth: 12, gridHeight: 8 },
  });
  if (sceneResponse.status() !== 201) {
    throw new Error(`Falha ao criar a cena online: ${sceneResponse.status()} ${await sceneResponse.text()}`);
  }
  const scene = (await sceneResponse.json()) as SceneInfo;

  // Ficha do próprio jogador (ele abre e rola pelo /play).
  const characterResponse = await api.post(`${getBackendUrl()}/api/tables/${table._id}/characters`, {
    headers: { ...headers(player), 'Content-Type': 'application/json' },
    data: {
      name: CHARACTER_NAME,
      systemKey: OP2_KEY,
      attributes: { fisico: 8, mente: 10, emocao: 6 },
      skills: { luta: 8, percepcao: 10, disciplina: 6 },
      profile: { perfil: 'vigilante', vocacao: 'Jornalista', level: 2, idade: 31 },
      stats: { ...INITIAL },
      fear: { active: false, dreadDie: 6 },
    },
  });
  if (characterResponse.status() !== 201) {
    throw new Error(
      `Falha ao criar a ficha OP2 online: ${characterResponse.status()} ${await characterResponse.text()}`,
    );
  }
  const character = (await characterResponse.json()) as { _id: string };

  const dmSocket = await connectSocket(dm.token, 'dm-op2-online');
  await joinTable(dmSocket, table._id);
  expectAckOk(
    await emitWithAck(dmSocket, 'requestSetActiveScene', { tableId: table._id, sceneId: scene._id }),
    'requestSetActiveScene',
  );

  const placed = await emitWithAck(dmSocket, 'requestPlaceToken', {
    tableId: table._id,
    sceneId: scene._id,
    squareId: 'sq-14',
    name: TOKEN_NAME,
    size: 'Pequeno/Médio',
    movement: 9,
    ownerId: player.id,
    characterId: character._id,
  });

  expectAckOk(
    await emitWithAck(dmSocket, 'requestUpdateSessionStatus', { tableId: table._id, newStatus: 'LIVE' }),
    'requestUpdateSessionStatus',
  );

  const playerSocket = await connectSocket(player.token, 'player-op2-online');
  await joinTable(playerSocket, table._id);

  let contractError: string | null = null;
  const addError = (message: string) => {
    contractError = contractError ? `${contractError} | ${message}` : message;
  };

  if (systemResponse.status() !== 200) {
    addError(`PUT /tables/:id/system respondeu ${systemResponse.status()} para "${OP2_KEY}".`);
  }
  if (!joinResponse.ok()) {
    addError(`POST /tables/join respondeu ${joinResponse.status()} para o convite.`);
  }
  if (!placed?.ok) {
    addError(`requestPlaceToken falhou: ${placed ? JSON.stringify(placed) : 'sem ack'}.`);
  }

  // DM entra primeiro (rota /table). O jogador entra pelo link de convite.
  const dmSession = await openContext(browser, dm, { width: 1440, height: 900 });
  dmPage = dmSession.page;
  await dmPage.goto(`${getBaseUrl()}/table/${table._id}`);

  const playerSession = await openContext(browser, player, { width: 390, height: 844 });
  playerContext = playerSession.context;
  playerPage = playerSession.page;
  await playerPage.goto(`${getBaseUrl()}/play/${table._id}?invite=${table.inviteCode}`);

  const snapshot = await resync(dmSocket, table._id);
  if (!snapshot.table.players.some((entry) => entry._id === player.id)) {
    addError('O link /play/:id?invite=... não adicionou o jogador remoto à mesa.');
  }
  if (!Array.isArray(snapshot.characters)) {
    addError('sessionSnapshot.characters ausente no modo online (§3.1).');
  } else {
    const summary = snapshot.characters.find((entry) => entry._id === character._id);
    if (!summary) {
      addError('sessionSnapshot.characters não inclui a ficha OP2 online.');
    } else {
      if (summary.currentPD !== INITIAL.currentPD || summary.maxPD !== INITIAL.maxPD) {
        addError('CharacterSummaryDTO online sem currentPD/maxPD corretos.');
      }
      if (summary.tokenId !== snapshot.tokens.find((token) => token.name === TOKEN_NAME)?._id) {
        addError('CharacterSummaryDTO.tokenId não aponta para o token online.');
      }
    }
  }

  const token = snapshot.tokens.find((entry) => entry.name === TOKEN_NAME);
  if (!token) {
    addError('O token do jogador não apareceu no snapshot online.');
  } else if (!token.character || token.character.currentPD !== INITIAL.currentPD) {
    addError('TokenDTO.character online ausente/sem PD.');
  }

  world = {
    dm,
    player,
    table,
    scene,
    characterId: character._id,
    tokenId: token?._id ?? '',
    dmSocket,
    playerSocket,
    contractError,
  };
});

test.afterAll(async () => {
  for (const socket of [world?.dmSocket, world?.playerSocket]) {
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

test('P3.1-QA-2 · dois clientes remotos abrem a mesa OP2 e veem o PD', async () => {
  expect(world, 'O setup online não foi criado.').not.toBeNull();
  expect(world!.contractError, `Fase 3.1 online incompleta: ${world!.contractError ?? ''}`).toBeNull();

  await expect(dmPage!.locator('.dm-panel')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.token-card')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.play-header__title')).toHaveText(world!.table.name, {
    timeout: UI_TIMEOUT_MS,
  });
  expect(playerPage!.url()).toContain(`/play/${world!.table._id}`);
  await expect(
    playerPage!.locator('.token-card').first().locator('.token-card__resource--pd'),
    'O card remoto precisa mostrar o PD.',
  ).toContainText(`PD ${INITIAL.currentPD}`, { timeout: UI_TIMEOUT_MS });
});

test('jogador remoto rola Percepção e o DM recebe o passo', async () => {
  requireContract();
  const w = world!;

  const sheet = await openPlayerSheet(playerPage!);
  const op2 = sheet.locator('.op2-sheet');
  await expect(op2, 'O jogador remoto precisa abrir a própria ficha OP2.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  await op2.getByRole('tab', { name: 'Atributos & Perícias' }).click();

  const received = waitForEvent<RollPayload>(
    w.dmSocket,
    'diceRolled',
    (payload) =>
      payload?.tableId === w.table._id &&
      payload?.kind === 'step' &&
      payload?.characterId === w.characterId,
  );
  await op2.getByRole('button', { name: 'Rolar Percepção' }).click();
  const payload = await received;

  expect(payload.kind).toBe('step');
  expect(payload.step?.skill.key).toBe('percepcao');
  expect(payload.step?.attribute.key).toBe('mente');
  expect(payload.step?.difficulty).toBe(7);
  expect(payload.total).toBe(payload.step!.summedDice.reduce((sum, value) => sum + value, 0));
  expect(payload.step!.high).toBeGreaterThanOrEqual(payload.step!.low);
  expect(payload.rolls.some((roll) => roll.role === 'attribute')).toBe(true);
  expect(payload.rolls.some((roll) => roll.role === 'skill')).toBe(true);

  const history = await fetchRolls(api, w.player, w.table._id);
  expect(
    history.some((roll) => roll.kind === 'step' && roll.step?.skill.key === 'percepcao'),
    'A rolagem remota precisa persistir no log.',
  ).toBe(true);

  await closeSheet(playerPage!);
});

test('PD converge nos dois sentidos e a reconexão remota preserva PD e o passo', async ({ browser }) => {
  requireContract();
  const w = world!;

  // Jogador → DM.
  const before = await resync(w.dmSocket, w.table._id);
  expectAckOk(
    await emitWithAck(w.playerSocket, 'requestUpdateCharacter', {
      tableId: w.table._id,
      characterId: w.characterId,
      patch: { stats: { currentPD: PD_PLAYER } },
    }),
    'requestUpdateCharacter(PD jogador)',
  );
  await expect
    .poll(
      async () =>
        (await resync(w.dmSocket, w.table._id)).characters?.find((entry) => entry._id === w.characterId)
          ?.currentPD,
      { timeout: UI_TIMEOUT_MS },
    )
    .toBe(PD_PLAYER);

  const afterPlayer = await resync(w.dmSocket, w.table._id);
  expect(afterPlayer.revision).toBeGreaterThan(before.revision);
  await expect
    .poll(() => readRevision(playerPage!), { timeout: UI_TIMEOUT_MS })
    .toBe(afterPlayer.revision);

  const { op2, sheet } = await openPdTab(playerPage!);
  await expect.poll(async () => readPd(sheet), { timeout: UI_TIMEOUT_MS }).toBe(PD_PLAYER);
  await closeSheet(playerPage!);

  // DM → jogador (o Mestre pode editar a ficha do jogador).
  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestUpdateCharacter', {
      tableId: w.table._id,
      characterId: w.characterId,
      patch: { stats: { currentPD: PD_DM } },
    }),
    'requestUpdateCharacter(PD DM)',
  );
  await expect(
    playerPage!.locator('.token-card').first().locator('.token-card__resource--pd'),
    'O PD alterado pelo DM precisa convergir no celular remoto.',
  ).toContainText(`PD ${PD_DM}`, { timeout: UI_TIMEOUT_MS });

  const afterDm = await resync(w.dmSocket, w.table._id);
  expect(afterDm.revision).toBeGreaterThan(afterPlayer.revision);
  await expect
    .poll(() => readRevision(playerPage!), { timeout: UI_TIMEOUT_MS })
    .toBe(afterDm.revision);

  // Reconexão total do contexto remoto.
  await playerContext!.close();
  const session = await openContext(browser, w.player, { width: 390, height: 844 });
  playerContext = session.context;
  playerPage = session.page;
  await playerPage.goto(`${getBaseUrl()}/play/${w.table._id}?invite=${w.table.inviteCode}`);

  const card = playerPage.locator('.token-card').first();
  await expect(card).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(card.locator('.token-card__name')).toContainText(CHARACTER_NAME, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect
    .poll(async () => (await card.locator('.token-card__hp').textContent()) ?? '', {
      timeout: UI_TIMEOUT_MS,
    })
    .toMatch(new RegExp(`${INITIAL.currentHP}\\s*\\/\\s*${INITIAL.maxHP}`));
  await expect(card.locator('.token-card__resource--pd')).toContainText(`PD ${PD_DM}`, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect
    .poll(() => readRevision(playerPage!), { timeout: UI_TIMEOUT_MS })
    .toBe(afterDm.revision);

  const reconnectedSheet = await openPdTab(playerPage);
  await expect
    .poll(async () => readPd(reconnectedSheet.sheet), { timeout: UI_TIMEOUT_MS })
    .toBe(PD_DM);
  await expect(
    reconnectedSheet.op2.locator('.op2-last-result'),
    'O último teste de passo precisa sobreviver ao resync.',
  ).toContainText('Percepção', { timeout: UI_TIMEOUT_MS });
  await closeSheet(playerPage);

  const history = await fetchRolls(api, w.player, w.table._id);
  expect(
    history.some((roll) => roll.kind === 'step' && roll.step?.skill.key === 'percepcao'),
    'O passo recente precisa sobreviver à reconexão remota.',
  ).toBe(true);
});
