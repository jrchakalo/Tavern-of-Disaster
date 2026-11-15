/**
 * P3-QA-2 — Fase 3 online-aware: dois clientes remotos, sem TV.
 *
 * Contrato de referência: `docs/SHEETS_DICE.md` §1 (funciona presencial e
 * online) e §9 "E2E" item 7, sobre `docs/ONLINE_MODE.md` (o jogo remoto usa as
 * mesmas rotas `/table/:id` e `/play/:id`). Voz/vídeo é Fase 5 e não entra aqui.
 *
 * Fluxo:
 *   1. DM e jogador entram em contextos de navegador separados; o jogador usa
 *      o link de convite `/play/:id?invite=...`.
 *   2. Ficha/PV convergem entre os dois clientes pela rede.
 *   3. Rolagem do DM chega ao jogador e o log persiste.
 *   4. Reconectar o contexto do jogador converge sem estado divergente.
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
const PROBE_TIMEOUT_MS = 1_200;
const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret';
const JWT_TTL_SECONDS = 6 * 60 * 60;

const CHARACTER_NAME = 'Vex';
const TOKEN_NAME = 'Vex token';
const INITIAL = { currentHP: 16, maxHP: 16, defense: 14 };
const HP_AFTER = 9;
const DICE_EXPRESSION = '2d6+4';

type AckOk = { ok: true; revision: number; serverNowMs: number; [key: string]: unknown };
type AckErr = {
  ok: false;
  error: { code: string; message: string };
  revision: number;
  serverNowMs: number;
};
type Ack = AckOk | AckErr;

type TestUser = { id: string; username: string; email: string; password: string; token: string };
type TableInfo = { _id: string; name: string; inviteCode: string; activeScene?: string; scenes: string[] };
type SceneInfo = { _id: string; name: string };

type CharacterSummary = {
  _id: string;
  name: string;
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  tokenId?: string | null;
};

type TokenDto = {
  _id: string;
  name: string;
  character?: { _id: string; name: string; currentHP?: number; maxHP?: number; defense?: number } | null;
};

type Snapshot = {
  tableId: string;
  revision: number;
  table: { _id: string; players: Array<{ _id: string; username: string }> };
  tokens: TokenDto[];
  characters?: CharacterSummary[];
};

type RollPayload = {
  tableId: string;
  expression: string;
  rolls: Array<{ die: number; value: number; kept: 'kept' | 'dropped' }>;
  modifier: number;
  total: number;
  revision: number;
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

async function createCharacter(
  api: APIRequestContext,
  user: TestUser,
  tableId: string,
): Promise<{ _id: string; name: string; systemKey?: string }> {
  const response = await api.post(`${getBackendUrl()}/api/tables/${tableId}/characters`, {
    headers: { ...headers(user), 'Content-Type': 'application/json' },
    data: {
      name: CHARACTER_NAME,
      systemKey: 'dnd5e',
      profile: { className: 'Solo', level: 4, race: 'Humano' },
      attributes: { STR: 11, DEX: 15, CON: 13, INT: 12, WIS: 10, CHA: 14 },
      stats: { ...INITIAL, baseInitiative: 2 },
      skills: { Stealth: 6, Perception: 4 },
    },
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a ficha online: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as { _id: string; name: string; systemKey?: string };
}

async function fetchRolls(api: APIRequestContext, user: TestUser, tableId: string) {
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

async function expectCard(page: Page, hp: number) {
  const card = page.locator('.token-card').first();
  await expect(card).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(card.locator('.token-card__name')).toContainText(CHARACTER_NAME, { timeout: UI_TIMEOUT_MS });
  await expect
    .poll(async () => (await card.locator('.token-card__hp').textContent()) ?? '', { timeout: UI_TIMEOUT_MS })
    .toMatch(new RegExp(`(PV|HP).*${hp}.*${INITIAL.maxHP}|${hp}\\s*\\/\\s*${INITIAL.maxHP}`, 'i'));
  await expect
    .poll(async () => (await card.locator('.token-card__defense').textContent()) ?? '', { timeout: UI_TIMEOUT_MS })
    .toContain(String(INITIAL.defense));
}

async function openDmSheet(page: Page): Promise<ReturnType<Page['locator']>> {
  const sheet = page.locator('.character-sheet');
  if (await sheet.isVisible().catch(() => false)) return sheet;
  const link = page.locator('.dm-panel .initiative-panel .character-link', { hasText: TOKEN_NAME }).first();
  if ((await link.count()) === 0) {
    const toggle = page.locator('.dm-panel .toggle-button').first();
    if (await toggle.count()) await toggle.click().catch(() => undefined);
  }
  const target =
    (await link.count()) > 0
      ? link
      : page.locator('.dm-panel .initiative-panel').getByText(TOKEN_NAME, { exact: false }).first();
  await expect(
    target,
    'docs/SHEETS_DICE.md §8.2 exige abrir a ficha pelo token/iniciativa no /table.',
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await target.click();
  await expect(sheet).toBeVisible({ timeout: UI_TIMEOUT_MS });
  return sheet;
}

async function readHp(sheet: ReturnType<Page['locator']>): Promise<number> {
  return Number(await sheet.getByLabel(/HP Atual|PV Atual|Pontos de Vida Atuais/i).first().inputValue());
}

async function setHp(page: Page, sheet: ReturnType<Page['locator']>, hp: number) {
  await sheet.getByLabel(/HP Atual|PV Atual|Pontos de Vida Atuais/i).first().fill(String(hp));
  await sheet.getByRole('button', { name: /Salvar/i }).first().click();
}

async function closeSheet(page: Page): Promise<void> {
  const close = page.locator('.character-sheet button[aria-label="Fechar"]');
  if (await close.count()) {
    await close.first().click().catch(() => undefined);
    await expect(page.locator('.character-sheet')).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
  }
}

async function openDmDiceRoller(page: Page): Promise<ReturnType<Page['locator']>> {
  const roller = page.locator('.dm-panel .dice-roller').first();
  if (await roller.isVisible().catch(() => false)) return roller;
  const toggle = page.getByRole('button', { name: /Dados|Rolagem/ }).first();
  if (await toggle.count()) {
    await toggle.click().catch(() => undefined);
  }
  await expect(roller, 'docs/SHEETS_DICE.md §8.3 exige o DiceRoller do DM.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  return roller;
}

async function openDmLog(page: Page): Promise<void> {
  const panel = page.locator('.action-log');
  if ((await panel.count()) > 0 && (await panel.first().isVisible().catch(() => false))) return;
  const toggle = page.locator('.log-toggle-btn').first();
  if (await toggle.count()) {
    await toggle.click();
    await expect(page.locator('.action-log').first()).toBeVisible({ timeout: UI_TIMEOUT_MS });
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
let dmPage: Page | null = null;
let playerPage: Page | null = null;
let playerContext: BrowserContext | null = null;
let hpShapeIndex = -1;

const HP_SHAPES: Array<(tableId: string, characterId: string, hp: number) => Record<string, unknown>> = [
  (tableId, characterId, currentHP) => ({ tableId, characterId, currentHP }),
  (tableId, characterId, hp) => ({ tableId, characterId, hp }),
  (tableId, characterId, value) => ({ tableId, characterId, value }),
  (tableId, characterId, newHP) => ({ tableId, characterId, newHP }),
  (tableId, characterId, currentHP) => ({ tableId, characterId, patch: { currentHP } }),
  (tableId, characterId, currentHP) => ({ tableId, characterId, stats: { currentHP } }),
  (tableId, characterId, currentHP) => ({ tableId, characterId, patch: { stats: { currentHP } } }),
  (tableId, characterId, newCurrentHP) => ({ tableId, characterId, newCurrentHP }),
];

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

function requirePhase3(): void {
  const reason = world?.contractError;
  test.skip(Boolean(reason), reason ? `Bloqueado: ${reason}` : 'Contrato da Fase 3 ausente nesta branch.');
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const dm = await registerUser(api, 'dm-online', suffix);
  const player = await registerUser(api, 'player-online', suffix);

  const tableResponse = await api.post(`${getBackendUrl()}/api/tables/create`, {
    headers: headers(dm),
    data: { name: `Mesa Online ${suffix}` },
  });
  if (tableResponse.status() !== 201) {
    throw new Error(`Falha ao criar a mesa online: ${tableResponse.status()} ${await tableResponse.text()}`);
  }
  const table = (await tableResponse.json()) as TableInfo;

  await api.put(`${getBackendUrl()}/api/tables/${table._id}/system`, {
    headers: { ...headers(dm), 'Content-Type': 'application/json' },
    data: { systemKey: 'dnd5e' },
  });

  const sceneResponse = await api.post(`${getBackendUrl()}/api/tables/${table._id}/scenes`, {
    headers: { ...headers(dm), 'Content-Type': 'application/json' },
    data: { name: `Cena Online ${suffix}`, gridWidth: 12, gridHeight: 8 },
  });
  if (sceneResponse.status() !== 201) {
    throw new Error(`Falha ao criar a cena online: ${sceneResponse.status()} ${await sceneResponse.text()}`);
  }
  const scene = (await sceneResponse.json()) as SceneInfo;

  const dmSocket = await connectSocket(dm.token, 'dm-online');
  await joinTable(dmSocket, table._id);
  expectAckOk(
    await emitWithAck(dmSocket, 'requestSetActiveScene', { tableId: table._id, sceneId: scene._id }),
    'requestSetActiveScene',
  );
  expectAckOk(
    await emitWithAck(dmSocket, 'requestUpdateSessionStatus', { tableId: table._id, newStatus: 'LIVE' }),
    'requestUpdateSessionStatus',
  );

  // Ficha criada pelo DM (dono: DM). O jogador a vê pelo resumo no token
  // (docs/SHEETS_DICE.md §3.1/§3.2), sem receber a ficha completa.
  const character = await createCharacter(api, dm, table._id);
  const characterId = character._id;

  // DM entra primeiro (rota /table). O jogador entra pelo link de convite e
  // ainda não é membro neste ponto.
  const dmSession = await openContext(browser, dm, { width: 1440, height: 900 });
  dmPage = dmSession.page;
  await dmPage.goto(`${getBaseUrl()}/table/${table._id}`);

  const playerSession = await openContext(browser, player, { width: 390, height: 844 });
  playerContext = playerSession.context;
  playerPage = playerSession.page;
  await playerPage.goto(`${getBaseUrl()}/play/${table._id}?invite=${table.inviteCode}`);

  let contractError: string | null = null;
  const addError = (message: string) => {
    contractError = contractError ? `${contractError} | ${message}` : message;
  };

  // O convite precisa efetivamente adicionar o jogador (Fase 2/§4.1).
  const joined = await expect
    .poll(async () => (await resync(dmSocket, table._id)).table.players.some((entry) => entry._id === player.id), {
      timeout: UI_TIMEOUT_MS,
    })
    .toBe(true)
    .then(() => true)
    .catch(() => false);
  if (!joined) {
    addError('O link /play/:id?invite=... não adicionou o jogador à mesa (Fase 2 §4.1).');
  }

  if (character.systemKey !== 'dnd5e') {
    addError(
      `Character.systemKey não foi copiado do Table.systemId (veio ${String(character.systemKey)}); ` +
        'docs/SHEETS_DICE.md §2 exige "dnd5e".',
    );
  }

  let tokenId = '';
  const placed = await emitWithAck(dmSocket, 'requestPlaceToken', {
    tableId: table._id,
    sceneId: scene._id,
    squareId: 'sq-14',
    name: TOKEN_NAME,
    size: 'Pequeno/Médio',
    movement: 9,
    ownerId: player.id,
    characterId,
  });
  if (!placed?.ok) {
    addError(`requestPlaceToken falhou: ${placed ? JSON.stringify(placed) : 'sem ack'}.`);
  }

  const playerSocket = await connectSocket(player.token, 'player-online');
  await joinTable(playerSocket, table._id);

  const snapshot = await resync(dmSocket, table._id);
  if (!Array.isArray(snapshot.characters)) {
    addError('sessionSnapshot.characters ausente no modo online; docs/SHEETS_DICE.md §3.1.');
  } else {
    const summary = snapshot.characters.find((entry) => entry._id === characterId);
    if (!summary) {
      addError('sessionSnapshot.characters não inclui a ficha online (§3.1).');
    } else if (summary.currentHP !== INITIAL.currentHP || summary.defense !== INITIAL.defense) {
      addError('CharacterSummaryDTO online sem currentHP/defense corretos (§3.1).');
    }
  }

  const token = snapshot.tokens.find((entry) => entry.name === TOKEN_NAME);
  if (!token) {
    addError('O token do jogador não apareceu no snapshot online.');
  } else {
    tokenId = token._id;
    if (!token.character || token.character.currentHP !== INITIAL.currentHP) {
      addError('TokenDTO.character ausente/sem currentHP no modo online; docs/SHEETS_DICE.md §3.2.');
    }
  }

  // Sonda do atalho de PV (formas usuais; o contrato não fixa o payload).
  for (let index = 0; index < HP_SHAPES.length; index += 1) {
    // A ficha online é do DM; o contrato §3.2 permite dono ou DM, não o
    // jogador que apenas controla o token. Probe com o socket do DM.
    const ack = await emitWithAck(
      dmSocket,
      'requestUpdateCharacterHp',
      HP_SHAPES[index](table._id, characterId, INITIAL.currentHP),
      PROBE_TIMEOUT_MS,
    );
    if (ack?.ok) {
      hpShapeIndex = index;
      break;
    }
  }
  if (hpShapeIndex < 0) {
    addError('requestUpdateCharacterHp não respondeu ok; docs/SHEETS_DICE.md §3.2 exige o atalho de PV.');
  }

  world = {
    dm,
    player,
    table,
    scene,
    characterId,
    tokenId,
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

test('P3-QA-2 · dois clientes remotos entram por convite e recebem a ficha', async () => {
  expect(world, 'O setup online não foi criado.').not.toBeNull();
  expect(world!.contractError, `Fase 3 online incompleta: ${world!.contractError ?? ''}`).toBeNull();

  await expect(playerPage!.locator('.token-card')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.play-header__title')).toHaveText(world!.table.name, {
    timeout: UI_TIMEOUT_MS,
  });
  expect(playerPage!.url()).toContain(`/play/${world!.table._id}`);
  await expectCard(playerPage!, INITIAL.currentHP);
  await expect(dmPage!.locator('.dm-panel')).toBeVisible({ timeout: UI_TIMEOUT_MS });
});

test('PV alterado pelo DM converge no celular remoto pela rede', async () => {
  requirePhase3();
  const w = world!;
  const before = await resync(w.dmSocket, w.table._id);

  const sheet = await openDmSheet(dmPage!);
  await setHp(dmPage!, sheet, HP_AFTER);

  await expect
    .poll(
      async () => (await resync(w.dmSocket, w.table._id)).characters?.find((c) => c._id === w.characterId)?.currentHP,
      { timeout: UI_TIMEOUT_MS },
    )
    .toBe(HP_AFTER);

  const after = await resync(w.dmSocket, w.table._id);
  expect(after.revision, 'PV via socket precisa incrementar a revisão (§3.2).').toBeGreaterThan(before.revision);
  await expectCard(playerPage!, HP_AFTER);

  const dmSheet = await openDmSheet(dmPage!);
  await expect
    .poll(async () => readHp(dmSheet), { timeout: UI_TIMEOUT_MS })
    .toBe(HP_AFTER);

  await expect
    .poll(() => readRevision(playerPage!), { timeout: UI_TIMEOUT_MS })
    .toBe(after.revision);
});

test('rolagem do DM chega ao jogador remoto e o log persiste', async () => {
  requirePhase3();
  const w = world!;

  await closeSheet(dmPage!);
  await openDmLog(dmPage!);
  const roller = await openDmDiceRoller(dmPage!);
  const input = roller.locator('#dice-expression');
  await expect(input).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await input.fill(DICE_EXPRESSION);

  const received = waitForEvent<RollPayload>(
    w.playerSocket,
    'diceRolled',
    (payload) => payload?.tableId === w.table._id && payload?.expression === DICE_EXPRESSION,
  );
  await roller.getByRole('button', { name: 'Rolar', exact: true }).first().click();
  const payload = await received;

  const kept = payload.rolls.filter((roll) => roll.kept === 'kept').reduce((sum, roll) => sum + roll.value, 0);
  expect(payload.total).toBe(kept + payload.modifier);
  expect(payload.modifier).toBe(4);

  await expect(
    dmPage!.locator('.log-entry[data-type="roll"]', { hasText: DICE_EXPRESSION }).first(),
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });

  const history = await fetchRolls(api, w.player, w.table._id);
  expect(
    history.some((roll) => roll.expression === DICE_EXPRESSION),
    'O jogador remoto precisa recuperar a rolagem via REST (§6.3).',
  ).toBe(true);
});

test('reconectar o jogador remoto converge ficha resumida, PV e log', async ({ browser }) => {
  requirePhase3();
  const w = world!;

  const expected = await resync(w.dmSocket, w.table._id);

  await playerContext!.close();
  const session = await openContext(browser, w.player, { width: 390, height: 844 });
  playerContext = session.context;
  playerPage = session.page;
  await playerPage.goto(`${getBaseUrl()}/play/${w.table._id}`);

  // A ficha completa é do DM (§2); o jogador recebe o resumo pelo token, que
  // precisa sobreviver à reconexão com o PV atual.
  await expectCard(playerPage, HP_AFTER);
  await expect
    .poll(() => readRevision(playerPage!), { timeout: UI_TIMEOUT_MS })
    .toBe(expected.revision);

  const history = await fetchRolls(api, w.player, w.table._id);
  expect(history.some((roll) => roll.expression === DICE_EXPRESSION)).toBe(true);
});
