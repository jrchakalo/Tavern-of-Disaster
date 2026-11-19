/**
 * P3-QA-1 — Fichas, PV, dados e sistemas (presencial: DM + 2 jogadores + TV).
 *
 * Contrato de referência: `docs/SHEETS_DICE.md` §1, §3, §4, §5, §6, §7, §8 e §9
 * (E2E 1–7), sobre `docs/REALTIME_PROTOCOL.md` e `docs/TABLE_MODE.md`.
 *
 * Roteiro:
 *   1. DM + 2 jogadores; mesa/cena com sistema D&D 5e.
 *   2. DM cria Kael via API; jogador cria Nyx via API (a API REST é caminho
 *      permitido pelo contrato §3.2; os eventos de socket são exercitados na
 *      alteração de PV).
 *   3. DM vincula Kael a um token; card do jogador e TV mostram nome/PV/CA.
 *   4. Jogador altera PV na ficha; DM/TV convergem no mesmo PV e revisão.
 *   5. PV > maxHP e < 0 são rejeitados com erro visível e sem mudar estado.
 *   6. `2d6+3` aparece no log do DM e da TV e sobrevive a reload (REST).
 *   7. Troca para Cyberpunk RED, preset `1d10!` rola, explosão é comprovada.
 *   8. Reconexão do jogador recupera ficha, PV e log.
 *   9. Jogador da mesa A não altera ficha da mesa B (socket + REST).
 *
 * Semântica de bloqueio: quando a Fase 3 ainda não está integrada, o primeiro
 * teste falha listando as superfícies ausentes e os demais não executam por
 * causa do modo serial. Nunca há "pass" falso.
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
const PROBE_TIMEOUT_MS = 1_200;
const EVENT_TIMEOUT_MS = 8_000;
const UI_TIMEOUT_MS = 25_000;

/** Mesmo segredo usado por `tests/e2e/global-setup.ts`. */
const JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-secret';
const JWT_TTL_SECONDS = 6 * 60 * 60;

const DM_CHARACTER = 'Kael';
const PLAYER_CHARACTER = 'Nyx';
const DM_TOKEN_NAME = 'Kael token';
const PLAYER_TOKEN_NAME = 'Nyx token';

const DM_CHARACTER_INITIAL = { currentHP: 24, maxHP: 24, defense: 15 };
const PLAYER_CHARACTER_INITIAL = { currentHP: 18, maxHP: 18, defense: 13 };
const PLAYER_HP_AFTER_UPDATE = 12;

// ---------------------------------------------------------------------------
// Tipos do contrato (docs/SHEETS_DICE.md)
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

type CharacterStats = { currentHP?: number; maxHP?: number; defense?: number; baseInitiative?: number };

type CharacterDto = {
  _id: string;
  ownerId: string;
  tableId: string;
  name: string;
  systemKey?: string;
  profile?: { className?: string; level?: number; race?: string };
  attributes?: Record<string, number>;
  stats?: CharacterStats;
  skills?: Record<string, number | string>;
  notes?: string;
};

type CharacterSummary = {
  _id: string;
  name: string;
  ownerId: string;
  systemKey?: string;
  level?: number;
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  tokenId?: string | null;
};

type TokenCharacterSummary = {
  _id: string;
  name: string;
  currentHP?: number;
  maxHP?: number;
  defense?: number;
};

type TokenDto = {
  _id: string;
  squareId: string;
  name: string;
  characterId?: string | null;
  character?: TokenCharacterSummary | null;
  owner?: { _id: string; username: string } | null;
};

type InitiativeDto = {
  _id: string;
  characterName: string;
  characterId?: string;
  tokenId?: string;
  isCurrentTurn: boolean;
};

type RollPayload = {
  id?: string;
  tableId: string;
  expression: string;
  rolls: Array<{ die: number; value: number; kept: 'kept' | 'dropped' }>;
  modifier: number;
  total: number;
  userId: string;
  username: string;
  createdAt: string;
  revision: number;
  metadata?: string;
  tags?: string[];
  characterId?: string;
  tokenId?: string;
};

type Snapshot = {
  protocolVersion: number;
  tableId: string;
  revision: number;
  you: { userId: string; username: string; role: string; permissions: string[] };
  table: { _id: string; name: string; players: Array<{ _id: string; username: string }> };
  activeScene: { _id: string; name: string } | null;
  tokens: TokenDto[];
  initiative: InitiativeDto[];
  characters?: CharacterSummary[];
  recentRolls?: RollPayload[];
};

type SystemDto = {
  _id: string;
  key: string;
  name: string;
  dicePresets?: Array<{ key: string; label: string; expression: string }>;
};

type DisplayTokenResponse = { token: string; displayUrl: string };

type World = {
  suffix: string;
  dm: TestUser;
  players: TestUser[];
  table: TableInfo;
  scene: SceneInfo;
  dmCharacter: CharacterDto;
  playerCharacter: CharacterDto;
  dmTokenId: string;
  playerTokenId: string;
  displayToken: string;
  displayUrl: string;
  dmSocket: Socket;
  playerSocket: Socket;
  tableB: TableInfo;
  tableBCharacter: CharacterDto;
  dmBSocket: Socket;
  tableBRevision: number;
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
  payload: { name: string; gridWidth: number; gridHeight: number },
): Promise<SceneInfo> {
  const response = await api.post(`${getBackendUrl()}/api/tables/${tableId}/scenes`, {
    headers: authHeaders(dm),
    data: payload,
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar a cena "${payload.name}": ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as SceneInfo;
}

async function setTableSystem(
  api: APIRequestContext,
  dm: TestUser,
  tableId: string,
  systemKey: string,
): Promise<number> {
  const response = await api.put(`${getBackendUrl()}/api/tables/${tableId}/system`, {
    headers: authHeaders(dm),
    data: { systemKey },
  });
  return response.status();
}

async function fetchSystem(api: APIRequestContext, key: string): Promise<SystemDto | null> {
  const response = await api.get(`${getBackendUrl()}/api/systems/key/${key}`);
  if (!response.ok()) return null;
  return (await response.json()) as SystemDto;
}

async function createCharacter(
  api: APIRequestContext,
  user: TestUser,
  tableId: string,
  payload: Record<string, unknown>,
): Promise<CharacterDto> {
  const response = await api.post(`${getBackendUrl()}/api/tables/${tableId}/characters`, {
    headers: { ...authHeaders(user), 'Content-Type': 'application/json' },
    data: payload,
  });
  if (response.status() !== 201) {
    throw new Error(`Falha ao criar ficha "${String(payload.name)}": ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as CharacterDto;
}

async function fetchTableCharacters(
  api: APIRequestContext,
  user: TestUser,
  tableId: string,
): Promise<CharacterDto[]> {
  const response = await api.get(`${getBackendUrl()}/api/tables/${tableId}/characters`, {
    headers: authHeaders(user),
  });
  if (!response.ok()) {
    throw new Error(`Falha ao listar fichas da mesa: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as CharacterDto[];
}

async function fetchMyCharacters(
  api: APIRequestContext,
  user: TestUser,
  tableId: string,
): Promise<CharacterDto[]> {
  const response = await api.get(`${getBackendUrl()}/api/tables/${tableId}/characters/my`, {
    headers: authHeaders(user),
  });
  if (!response.ok()) {
    throw new Error(`Falha ao listar minhas fichas: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as CharacterDto[];
}

async function fetchRolls(api: APIRequestContext, user: TestUser, tableId: string): Promise<RollPayload[]> {
  const response = await api.get(`${getBackendUrl()}/api/tables/${tableId}/rolls?limit=50`, {
    headers: authHeaders(user),
  });
  if (!response.ok()) {
    throw new Error(`Falha ao ler o log de rolagens: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as RollPayload[];
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
  expect(
    ack,
    `O evento "${event}" não respondeu ack. A Fase 3 exige o envelope de ` +
      'docs/REALTIME_PROTOCOL.md §5 e o evento em docs/SHEETS_DICE.md §3.2.',
  ).not.toBeNull();
  const value = ack as Ack;
  expect(value.ok, `Esperava ok:true em "${event}", veio ${JSON.stringify(value)}.`).toBe(true);
  return value as AckOk;
}

function expectAckError(ack: Ack | null, event: string): AckErr {
  expect(
    ack,
    `O evento "${event}" não respondeu ack. A Fase 3 exige o envelope de ` +
      'docs/REALTIME_PROTOCOL.md §5 e o evento em docs/SHEETS_DICE.md §3.2.',
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

function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs = EVENT_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Evento "${event}" não recebido em ${timeoutMs}ms.`));
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

// ---------------------------------------------------------------------------
// Utilidades de DOM / asserção
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cssText(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

async function readRevision(page: Page, selector: string): Promise<number> {
  const text = (await page.locator(selector).first().textContent()) ?? '';
  const match = /(\d+)/.exec(text);
  if (!match) throw new Error(`Revisão não encontrada em "${selector}" (texto: "${text}").`);
  return Number(match[1]);
}

async function expectPlayerCard(page: Page, name: string, hp: number, maxHP: number, defense: number) {
  const card = page.locator('.token-card').first();
  await expect(card, 'docs/SHEETS_DICE.md §8.2 exige o token card em /play.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  await expect(card.locator('.token-card__name')).toContainText(name, { timeout: UI_TIMEOUT_MS });
  await expect
    .poll(async () => (await card.locator('.token-card__hp').textContent()) ?? '', { timeout: UI_TIMEOUT_MS })
    .toMatch(new RegExp(`(PV|HP).*${hp}.*${maxHP}|${hp}\\s*\\/\\s*${maxHP}`, 'i'));
  await expect
    .poll(async () => (await card.locator('.token-card__defense').textContent()) ?? '', { timeout: UI_TIMEOUT_MS })
    .toContain(String(defense));
}

/**
 * A TV pode mostrar PV/CA no próprio token ou no rail de iniciativa.
 * O contrato §8.2 aceita as duas superfícies; procuramos nas duas.
 */
async function displayVitals(page: Page, tokenName: string): Promise<string> {
  const escaped = cssText(tokenName);
  const token = page.locator(`.display-board__token[title="${escaped}"]`);
  const rail = page.locator('.display-rail .initiative-item', { hasText: tokenName });
  const parts: string[] = [];
  if (await token.count()) parts.push((await token.first().textContent()) ?? '');
  if (await rail.count()) parts.push((await rail.first().textContent()) ?? '');
  return parts.join(' | ');
}

async function expectDisplayVitals(
  page: Page,
  tokenName: string,
  hp: number,
  maxHP: number,
  defense: number,
): Promise<void> {
  const token = page.locator(`.display-board__token[title="${cssText(tokenName)}"]`);
  await expect(token, `A TV precisa renderizar o token "${tokenName}".`).toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  await expect
    .poll(() => displayVitals(page, tokenName), { timeout: UI_TIMEOUT_MS })
    .toMatch(new RegExp(`(PV|HP)[^\\d]{0,4}${hp}(\\D|$)|${hp}\\s*\\/\\s*${maxHP}`, 'i'));
  await expect
    .poll(() => displayVitals(page, tokenName), { timeout: UI_TIMEOUT_MS })
    .toMatch(new RegExp(`(CA|Def|Defesa)[^\\d]{0,6}${defense}(\\D|$)`, 'i'));
}

async function ensureDmInitiativeTab(page: Page): Promise<void> {
  const tab = page.locator('.dm-panel .dm-panel__tab', { hasText: 'Iniciativa' }).first();
  if (await tab.count()) await tab.click().catch(() => undefined);
}

async function openDmCharacterSheet(page: Page, tokenName: string) {
  const sheet = page.locator('.character-sheet');
  if (await sheet.isVisible().catch(() => false)) return sheet;

  await ensureDmInitiativeTab(page);
  const link = page
    .locator('.dm-panel .initiative-panel .character-link', { hasText: tokenName })
    .first();
  if ((await link.count()) === 0) {
    // Painel do Mestre pode estar colapsado; abre antes de desistir.
    const toggle = page.locator('.dm-panel .toggle-button').first();
    if (await toggle.count()) await toggle.click().catch(() => undefined);
  }
  const target =
    (await link.count()) > 0
      ? link
      : page.locator('.dm-panel .initiative-panel').getByText(tokenName, { exact: false }).first();
  await expect(
    target,
    `docs/SHEETS_DICE.md §8.2 exige abrir a ficha a partir do token/iniciativa no /table ` +
      `(não encontrei link para "${tokenName}").`,
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await target.click();
  await expect(sheet, 'A ficha (CharacterSheet) precisa abrir no /table.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  return sheet;
}

/**
 * Abre a ficha do jogador a partir do token card (caminho principal) ou da
 * iniciativa. Se a UX ainda não expôs nenhum caminho, falha com mensagem clara.
 */
async function openPlayerCharacterSheet(page: Page, characterName: string) {
  const sheet = page.locator('.character-sheet');
  if (await sheet.isVisible().catch(() => false)) return sheet;

  const candidates = [
    page.locator('.token-card').first(),
    page.locator('.play-initiative .character-link', { hasText: characterName }).first(),
    page.locator('.play-initiative').getByText(characterName, { exact: false }).first(),
    page.getByRole('button', { name: /Ficha|Personagem|Abrir ficha/i }).first(),
  ];

  for (const candidate of candidates) {
    if ((await candidate.count()) === 0) continue;
    await candidate.click({ timeout: 3_000 }).catch(() => undefined);
    const opened = await expect(sheet)
      .toBeVisible({ timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) return sheet;
  }

  throw new Error(
    `docs/SHEETS_DICE.md §8.1/§8.2 exige que o jogador abra a própria ficha em /play ` +
      `(token card clicável ou link na iniciativa). Nenhum caminho abriu a ficha de "${characterName}".`,
  );
}

async function closeSheet(page: Page): Promise<void> {
  const sheet = page.locator('.character-sheet');
  if (!(await sheet.isVisible().catch(() => false))) return;
  const close = sheet.locator('button[aria-label="Fechar"]').first();
  if (await close.count()) await close.click().catch(() => undefined);
  const discard = page.getByRole('button', { name: 'Descartar e fechar' });
  if (await discard.isVisible().catch(() => false)) await discard.click().catch(() => undefined);
  await expect(sheet).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
}

async function readSheetNumber(sheet: ReturnType<Page['locator']>, label: RegExp): Promise<number> {
  const input = sheet.getByLabel(label).first();
  const raw = await input.inputValue();
  return Number(raw);
}

async function updateHpInSheet(page: Page, hp: number): Promise<void> {
  const sheet = page.locator('.character-sheet');
  await expect(sheet).toBeVisible({ timeout: UI_TIMEOUT_MS });
  const input = sheet.getByLabel(/HP Atual|PV Atual|Pontos de Vida Atuais/i).first();
  await expect(
    input,
    'docs/SHEETS_DICE.md §8.1 exige campo de PV editável na ficha.',
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await input.fill(String(hp));
  const save = sheet.getByRole('button', { name: /Salvar/i }).first();
  await expect(save, 'A ficha precisa de um botão de salvar.').toBeVisible({ timeout: UI_TIMEOUT_MS });
  await save.click();
}

async function openDiceRoller(page: Page): Promise<void> {
  await ensureDmInitiativeTab(page);
  const rollers = page.locator('.dice-roller:visible');
  if ((await rollers.count()) > 0) return;
  const openButton = page
    .getByRole('button', { name: /Dados|Rolagem|Abrir rolagem de dados/i })
    .first();
  await expect(openButton, 'docs/SHEETS_DICE.md §8.3 exige acesso ao DiceRoller.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  await openButton.click();
  await expect(rollers.first()).toBeVisible({ timeout: UI_TIMEOUT_MS });
}

async function rollExpression(page: Page, expression: string): Promise<void> {
  const roller = page.locator('.dice-roller').first();
  const input = roller.locator('#dice-expression');
  await expect(input).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await input.fill(expression);
  await roller.getByRole('button', { name: 'Rolar', exact: true }).first().click();
}

async function openLog(page: Page): Promise<void> {
  const panel = page.locator('.action-log, .roll-log');
  if ((await panel.count()) > 0 && (await panel.first().isVisible().catch(() => false))) return;
  const toggle = page.locator('.log-toggle-btn').first();
  if ((await toggle.count()) > 0) {
    await toggle.click();
    await sleep(250);
    return;
  }
  const fallback = page.getByRole('button', { name: /Log|Rolagens|Histórico/i }).first();
  if ((await fallback.count()) > 0) {
    await fallback.click().catch(() => undefined);
    await sleep(250);
  }
}

async function expectRollInLog(page: Page, expression: string, selector: string): Promise<void> {
  const scoped = selector.includes('roll-ticker') ? selector : `${selector}[data-type="roll"]`;
  await expect(
    page.locator(scoped, { hasText: expression }).first(),
    `docs/SHEETS_DICE.md §8.3: a rolagem "${expression}" precisa aparecer no log.`,
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
}

// ---------------------------------------------------------------------------
// PV via socket: o payload exato do atalho não está fixado no contrato §3.2.
// Sondamos as formas usuais e memorizamos a que o backend aceitou.
// ---------------------------------------------------------------------------

type HpPayloadShape = {
  build: (tableId: string, characterId: string, hp: number) => Record<string, unknown>;
  probe: AckErr | null;
};

const HP_PAYLOAD_SHAPES: HpPayloadShape[] = [
  { build: (tableId, characterId, currentHP) => ({ tableId, characterId, currentHP }), probe: null },
  { build: (tableId, characterId, hp) => ({ tableId, characterId, hp }), probe: null },
  { build: (tableId, characterId, value) => ({ tableId, characterId, value }), probe: null },
  { build: (tableId, characterId, newHP) => ({ tableId, characterId, newHP }), probe: null },
  {
    build: (tableId, characterId, currentHP) => ({ tableId, characterId, patch: { currentHP } }),
    probe: null,
  },
  {
    build: (tableId, characterId, currentHP) => ({ tableId, characterId, stats: { currentHP } }),
    probe: null,
  },
  {
    build: (tableId, characterId, currentHP) => ({
      tableId,
      characterId,
      patch: { stats: { currentHP } },
    }),
    probe: null,
  },
  {
    build: (tableId, characterId, newCurrentHP) => ({ tableId, characterId, newCurrentHP }),
    probe: null,
  },
];

let hpShapeIndex = -1;

function hpPayload(tableId: string, characterId: string, hp: number): Record<string, unknown> | null {
  if (hpShapeIndex < 0) return null;
  return HP_PAYLOAD_SHAPES[hpShapeIndex].build(tableId, characterId, hp);
}

async function probeHpEvent(socket: Socket, tableId: string, characterId: string, hp: number): Promise<Ack | null> {
  for (let index = 0; index < HP_PAYLOAD_SHAPES.length; index += 1) {
    const shape = HP_PAYLOAD_SHAPES[index];
    const payload = shape.build(tableId, characterId, hp);
    const ack = await emitWithAck(socket, 'requestUpdateCharacterHp', payload, PROBE_TIMEOUT_MS);
    if (ack?.ok) {
      hpShapeIndex = index;
      return ack;
    }
    if (ack && !ack.ok) shape.probe = ack;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Estado do arquivo
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(180_000);

let api: APIRequestContext;
let world: World | null = null;

const openContexts: BrowserContext[] = [];
let dmContext: BrowserContext | null = null;
let playerContext: BrowserContext | null = null;
let dmPage: Page | null = null;
let playerPage: Page | null = null;
let tvPage: Page | null = null;

function requirePhase3(): void {
  const reason = world?.contractError;
  test.skip(Boolean(reason), reason ? `Bloqueado: ${reason}` : 'Contrato da Fase 3 ausente nesta branch.');
}

function addContractError(message: string): void {
  if (!world) return;
  world.contractError = world.contractError ? `${world.contractError} | ${message}` : message;
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const dm = await registerUser(api, 'dm-p3', suffix);
  const player1 = await registerUser(api, 'p1-p3', suffix);
  const player2 = await registerUser(api, 'p2-p3', suffix);
  const dmB = await registerUser(api, 'dmb-p3', suffix);

  const table = await createTable(api, dm, `Mesa Fichas ${suffix}`);
  await joinTableByInvite(api, player1, table.inviteCode);
  await joinTableByInvite(api, player2, table.inviteCode);

  const systemStatus = await setTableSystem(api, dm, table._id, 'dnd5e');
  const scene = await createScene(api, dm, table._id, {
    name: `Cena Fichas ${suffix}`,
    gridWidth: 12,
    gridHeight: 8,
  });

  const dmSocket = await connectSocket({ token: dm.token }, 'dm');
  await joinTable(dmSocket, table._id);
  expectAckOk(
    await emitWithAck(dmSocket, 'requestSetActiveScene', { tableId: table._id, sceneId: scene._id }),
    'requestSetActiveScene',
  );

  const dmCharacter = await createCharacter(api, dm, table._id, {
    name: DM_CHARACTER,
    systemKey: 'dnd5e',
    avatarUrl: 'https://example.com/kael.png',
    profile: { className: 'Guerreiro', level: 3, race: 'Humano' },
    attributes: { STR: 16, DEX: 12, CON: 14, INT: 8, WIS: 10, CHA: 11 },
    stats: { ...DM_CHARACTER_INITIAL, baseInitiative: 1 },
    skills: { Athletics: 5, Perception: 3 },
    notes: 'Ficha criada pelo DM no E2E da Fase 3.',
  });

  const playerCharacter = await createCharacter(api, player1, table._id, {
    name: PLAYER_CHARACTER,
    systemKey: 'dnd5e',
    avatarUrl: 'https://example.com/nyx.png',
    profile: { className: 'Ladino', level: 2, race: 'Elfo' },
    attributes: { STR: 10, DEX: 17, CON: 12, INT: 14, WIS: 11, CHA: 13 },
    stats: { ...PLAYER_CHARACTER_INITIAL, baseInitiative: 3 },
    skills: { Stealth: 7, Investigation: 4 },
    notes: 'Ficha criada pelo jogador no E2E da Fase 3.',
  });

  expectAckOk(
    await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: table._id,
      sceneId: scene._id,
      squareId: 'sq-14',
      name: DM_TOKEN_NAME,
      size: 'Pequeno/Médio',
      movement: 9,
      characterId: dmCharacter._id,
    }),
    'requestPlaceToken(dmCharacter)',
  );
  expectAckOk(
    await emitWithAck(dmSocket, 'requestPlaceToken', {
      tableId: table._id,
      sceneId: scene._id,
      squareId: 'sq-29',
      name: PLAYER_TOKEN_NAME,
      size: 'Pequeno/Médio',
      movement: 9,
      ownerId: player1.id,
      characterId: playerCharacter._id,
    }),
    'requestPlaceToken(playerCharacter)',
  );

  expectAckOk(
    await emitWithAck(dmSocket, 'requestUpdateSessionStatus', { tableId: table._id, newStatus: 'LIVE' }),
    'requestUpdateSessionStatus',
  );

  const playerSocket = await connectSocket({ token: player1.token }, 'player');
  await joinTable(playerSocket, table._id);

  // Token de display (pré-requisito da Fase 2 para a TV).
  let displayToken = '';
  let displayUrl = '';
  const displayResponse = await api.post(`${getBackendUrl()}/api/tables/${table._id}/display-token`, {
    headers: authHeaders(dm),
  });

  // Mesa B para o teste de autorização cross-table.
  const tableB = await createTable(api, dmB, `Mesa B ${suffix}`);
  await setTableSystem(api, dmB, tableB._id, 'dnd5e');
  const tableBCharacter = await createCharacter(api, dmB, tableB._id, {
    name: `Alvo ${suffix}`,
    systemKey: 'dnd5e',
    stats: { currentHP: 10, maxHP: 10, defense: 10 },
  });
  const dmBSocket = await connectSocket({ token: dmB.token }, 'dm-b');
  const tableBSnapshot = await joinTable(dmBSocket, tableB._id);

  world = {
    suffix,
    dm,
    players: [player1, player2],
    table,
    scene,
    dmCharacter,
    playerCharacter,
    dmTokenId: '',
    playerTokenId: '',
    displayToken,
    displayUrl,
    dmSocket,
    playerSocket,
    tableB,
    tableBCharacter,
    dmBSocket,
    tableBRevision: tableBSnapshot.revision,
    contractError: null,
  };

  // -------------------------------------------------------------------------
  // Detecção do contrato da Fase 3 (nunca "pass" falso)
  // -------------------------------------------------------------------------

  if (systemStatus !== 200) {
    addContractError(
      `PUT /api/tables/:id/system respondeu ${systemStatus}; a mesa não conseguiu usar ` +
        '"dnd5e" (docs/SHEETS_DICE.md §7).',
    );
  }

  const dnd = await fetchSystem(api, 'dnd5e');
  const cyberpunk = await fetchSystem(api, 'cyberpunk-red');
  if (!dnd) {
    addContractError('GET /api/systems/key/dnd5e não encontrou o seed de D&D 5e (§7).');
  } else {
    const expressions = new Set((dnd.dicePresets ?? []).map((preset) => preset.expression));
    for (const required of ['d20', '2d6+3', '4d6kh3']) {
      if (!expressions.has(required)) {
        addContractError(`Preset D&D 5e "${required}" ausente no seed (§7).`);
      }
    }
  }
  if (!cyberpunk) {
    addContractError('GET /api/systems/key/cyberpunk-red não encontrou o seed de Cyberpunk RED (§7).');
  } else {
    const expressions = new Set((cyberpunk.dicePresets ?? []).map((preset) => preset.expression));
    for (const required of ['1d10!', '2d6', '3d6']) {
      if (!expressions.has(required)) {
        addContractError(`Preset Cyberpunk RED "${required}" ausente no seed (§7).`);
      }
    }
  }

  const tableCharacters = await fetchTableCharacters(api, dm, table._id);
  const kael = tableCharacters.find((character) => character._id === dmCharacter._id);
  const nyx = tableCharacters.find((character) => character._id === playerCharacter._id);
  if (!kael || !nyx) {
    addContractError('As fichas criadas via REST não aparecem em GET /tables/:id/characters (§3.2).');
  } else {
    if (kael.systemKey !== 'dnd5e' || nyx.systemKey !== 'dnd5e') {
      addContractError(
        `Character.systemKey não foi copiado do Table.systemId (Kael=${String(kael.systemKey)}, ` +
          `Nyx=${String(nyx.systemKey)}); docs/SHEETS_DICE.md §2 exige 'dnd5e'.`,
      );
    }
    if (kael.profile?.level !== 3 || kael.profile?.className !== 'Guerreiro') {
      addContractError('Character.profile (classe/nível) não persistiu; contrato §2/§4.');
    }
    if (kael.stats?.currentHP !== DM_CHARACTER_INITIAL.currentHP) {
      addContractError('Character.stats.currentHP do DM não persistiu; contrato §2.');
    }
  }

  const myCharacters = await fetchMyCharacters(api, player1, table._id);
  if (!myCharacters.some((character) => character._id === playerCharacter._id)) {
    addContractError('GET /tables/:id/characters/my não devolve a ficha do jogador (§3.2).');
  }

  const snapshot = await resync(dmSocket, table._id);
  if (!Array.isArray(snapshot.characters)) {
    addContractError('sessionSnapshot.characters ausente; docs/SHEETS_DICE.md §3.1.');
  } else {
    const summary = snapshot.characters.find((character) => character._id === dmCharacter._id);
    if (!summary) {
      addContractError('sessionSnapshot.characters não inclui a ficha do DM (§3.1).');
    } else {
      if (summary.currentHP !== DM_CHARACTER_INITIAL.currentHP || summary.defense !== DM_CHARACTER_INITIAL.defense) {
        addContractError('CharacterSummaryDTO sem currentHP/defense corretos (§3.1).');
      }
      if (summary.tokenId !== snapshot.tokens.find((token) => token.name === DM_TOKEN_NAME)?._id) {
        addContractError('CharacterSummaryDTO.tokenId não aponta para o token vinculado (§3.1).');
      }
    }
  }

  const dmToken = snapshot.tokens.find((token) => token.name === DM_TOKEN_NAME);
  const playerToken = snapshot.tokens.find((token) => token.name === PLAYER_TOKEN_NAME);
  if (!dmToken || !playerToken) {
    throw new Error('Os tokens do cenário não apareceram no snapshot; o setup não pode continuar.');
  }
  world.dmTokenId = dmToken._id;
  world.playerTokenId = playerToken._id;

  if (!playerToken.character || playerToken.character.currentHP !== PLAYER_CHARACTER_INITIAL.currentHP) {
    addContractError(
      'TokenDTO.character ausente ou sem currentHP; docs/SHEETS_DICE.md §3.2 exige o resumo da ficha no token.',
    );
  } else if (playerToken.character.defense !== PLAYER_CHARACTER_INITIAL.defense) {
    addContractError('TokenDTO.character.defense não reflete a ficha (§3.2).');
  }

  if (!displayResponse.ok()) {
    addContractError(
      `POST /api/tables/:id/display-token respondeu ${displayResponse.status()} ` +
        `(${(await displayResponse.text()).slice(0, 120)}); a TV da Fase 2 é pré-requisito.`,
    );
  } else {
    const body = (await displayResponse.json()) as DisplayTokenResponse;
    world.displayToken = body.token;
    world.displayUrl = body.displayUrl;
    if (!body.token || !body.displayUrl?.includes(`/display/${table._id}#token=${body.token}`)) {
      addContractError(`display-token devolveu ${JSON.stringify(body)}; esperado { token, displayUrl }.`);
    }
  }

  // Sonda do atalho de PV (payload não fixado no contrato §3.2).
  const hpProbe = await probeHpEvent(playerSocket, table._id, playerCharacter._id, PLAYER_CHARACTER_INITIAL.currentHP);
  if (!hpProbe) {
    const last = HP_PAYLOAD_SHAPES.map((shape) => shape.probe).find(Boolean);
    addContractError(
      'requestUpdateCharacterHp não respondeu ok em nenhuma forma de payload ' +
        `(último erro: ${last ? JSON.stringify(last) : 'sem ack'}); docs/SHEETS_DICE.md §3.2.`,
    );
  }

  // Páginas do cenário presencial.
  const dmSession = await openAuthenticatedContext(browser, dm, { width: 1440, height: 900 });
  dmContext = dmSession.context;
  dmPage = dmSession.page;
  await dmPage.goto(`${getBaseUrl()}/table/${table._id}`);

  const playerSession = await openAuthenticatedContext(browser, player1, { width: 390, height: 844 });
  playerContext = playerSession.context;
  playerPage = playerSession.page;
  await playerPage.goto(`${getBaseUrl()}/play/${table._id}?invite=${table.inviteCode}`);

  const tvSession = await openAuthenticatedContext(browser, dm, { width: 1920, height: 1080 });
  tvPage = tvSession.page;
  if (world.displayUrl) {
    const displayUrl = new URL(world.displayUrl, getBaseUrl());
    await tvPage.goto(`${displayUrl.pathname}${displayUrl.hash}`);
  }
});

test.afterAll(async () => {
  for (const socket of [world?.dmSocket, world?.playerSocket, world?.dmBSocket]) {
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

test('P3-QA-1 · contrato da Fase 3 está disponível', async () => {
  expect(world, 'O setup compartilhado não foi criado.').not.toBeNull();
  expect(
    world!.contractError,
    `Fase 3 incompleta — superfícies ausentes: ${world!.contractError ?? ''}`,
  ).toBeNull();
  expect(world!.dmCharacter.systemKey).toBe('dnd5e');
  expect(world!.playerCharacter.systemKey).toBe('dnd5e');
  expect(world!.displayToken.length).toBeGreaterThan(20);
});

test('DM e jogador criam fichas D&D; token, card e TV mostram nome/PV/CA', async () => {
  requirePhase3();
  const w = world!;

  await expect(dmPage!.locator('.dm-panel')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(playerPage!.locator('.token-card')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(tvPage!.locator('.display-header__title')).toHaveText(w.table.name, {
    timeout: UI_TIMEOUT_MS,
  });

  // Card do jogador: nome da ficha (não do token), PV e CA.
  await expectPlayerCard(
    playerPage!,
    PLAYER_CHARACTER,
    PLAYER_CHARACTER_INITIAL.currentHP,
    PLAYER_CHARACTER_INITIAL.maxHP,
    PLAYER_CHARACTER_INITIAL.defense,
  );

  // TV: token de Kael com PV/CA no token ou no rail.
  await expectDisplayVitals(
    tvPage!,
    DM_TOKEN_NAME,
    DM_CHARACTER_INITIAL.currentHP,
    DM_CHARACTER_INITIAL.maxHP,
    DM_CHARACTER_INITIAL.defense,
  );

  // DM abre a ficha pelo link da iniciativa, provando o vínculo token↔ficha.
  const sheet = await openDmCharacterSheet(dmPage!, DM_TOKEN_NAME);
  await expect(sheet.locator('h2')).toHaveText(DM_CHARACTER);
  expect(await readSheetNumber(sheet, /HP Atual|PV Atual|Pontos de Vida Atuais/i)).toBe(
    DM_CHARACTER_INITIAL.currentHP,
  );
  expect(await readSheetNumber(sheet, /Defesa|CA/i)).toBe(DM_CHARACTER_INITIAL.defense);
});

test('jogador altera PV na ficha e DM/TV convergem no mesmo PV e revisão', async () => {
  requirePhase3();
  const w = world!;

  await closeSheet(dmPage!);
  const before = await resync(w.dmSocket, w.table._id);
  expect(before.characters?.find((character) => character._id === w.playerCharacter._id)?.currentHP).toBe(
    PLAYER_CHARACTER_INITIAL.currentHP,
  );

  const sheet = await openPlayerCharacterSheet(playerPage!, PLAYER_CHARACTER);
  await updateHpInSheet(playerPage!, PLAYER_HP_AFTER_UPDATE);

  await expect
    .poll(
      async () => {
        const state = await resync(w.dmSocket, w.table._id);
        return state.characters?.find((character) => character._id === w.playerCharacter._id)?.currentHP;
      },
      { timeout: UI_TIMEOUT_MS },
    )
    .toBe(PLAYER_HP_AFTER_UPDATE);

  const after = await resync(w.dmSocket, w.table._id);
  expect(after.revision, 'Alterar PV precisa incrementar a revisão (§3.2).').toBeGreaterThan(before.revision);

  // Jogador: card e ficha refletem o novo PV.
  await expectPlayerCard(
    playerPage!,
    PLAYER_CHARACTER,
    PLAYER_HP_AFTER_UPDATE,
    PLAYER_CHARACTER_INITIAL.maxHP,
    PLAYER_CHARACTER_INITIAL.defense,
  );
  let playerSheet = playerPage!.locator('.character-sheet');
  if (!(await playerSheet.isVisible().catch(() => false))) {
    playerSheet = await openPlayerCharacterSheet(playerPage!, PLAYER_CHARACTER);
  }
  expect(await readSheetNumber(playerSheet, /HP Atual|PV Atual/i)).toBe(PLAYER_HP_AFTER_UPDATE);

  // DM: a ficha aberta em /table também converge (store aplica characterUpdates).
  await closeSheet(playerPage!);
  const dmSheet = await openDmCharacterSheet(dmPage!, PLAYER_TOKEN_NAME);
  await expect
    .poll(async () => readSheetNumber(dmSheet, /HP Atual|PV Atual/i), { timeout: UI_TIMEOUT_MS })
    .toBe(PLAYER_HP_AFTER_UPDATE);

  // TV: token/rail de Nyx mostra o PV novo.
  await expectDisplayVitals(
    tvPage!,
    PLAYER_TOKEN_NAME,
    PLAYER_HP_AFTER_UPDATE,
    PLAYER_CHARACTER_INITIAL.maxHP,
    PLAYER_CHARACTER_INITIAL.defense,
  );

  // Convergência de revisão no cliente do jogador e na TV.
  await expect
    .poll(() => readRevision(playerPage!, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(after.revision);
  await expect
    .poll(() => readRevision(tvPage!, '.display-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(after.revision);
});

test('PV > maxHP ou < 0 é rejeitado com erro visível e estado/revisão intactos', async () => {
  requirePhase3();
  const w = world!;

  const before = await resync(w.dmSocket, w.table._id);
  const revisionBefore = before.revision;
  const hpBefore = before.characters?.find((character) => character._id === w.playerCharacter._id)?.currentHP;
  expect(hpBefore).toBe(PLAYER_HP_AFTER_UPDATE);

  // Caminho canônico: atalho de PV via socket.
  const overPayload = hpPayload(w.table._id, w.playerCharacter._id, PLAYER_CHARACTER_INITIAL.maxHP + 1);
  expect(
    overPayload,
    'O evento requestUpdateCharacterHp não aceitou nenhuma forma de payload; contrato §3.2.',
  ).not.toBeNull();
  const overAck = await emitWithAck(w.playerSocket, 'requestUpdateCharacterHp', overPayload);
  const overError = expectAckError(overAck, 'requestUpdateCharacterHp');
  expect(overError.error.code, 'PV acima do máximo precisa ser VALIDATION (§2/§3.2).').toBe('VALIDATION');

  const negativePayload = hpPayload(w.table._id, w.playerCharacter._id, -1);
  const negativeAck = await emitWithAck(w.playerSocket, 'requestUpdateCharacterHp', negativePayload);
  const negativeError = expectAckError(negativeAck, 'requestUpdateCharacterHp');
  expect(negativeError.error.code, 'PV negativo precisa ser VALIDATION (§2/§3.2).').toBe('VALIDATION');

  const after = await resync(w.dmSocket, w.table._id);
  expect(after.revision, 'Ação rejeitada não pode incrementar a revisão.').toBe(revisionBefore);
  expect(after.characters?.find((character) => character._id === w.playerCharacter._id)?.currentHP).toBe(
    hpBefore,
  );

  // Caminho de UI: a ficha mostra erro e não muda o estado.
  await closeSheet(dmPage!);
  const sheet = await openPlayerCharacterSheet(playerPage!, PLAYER_CHARACTER);
  await updateHpInSheet(playerPage!, PLAYER_CHARACTER_INITIAL.maxHP + 50);

  const toast = playerPage!.locator('.toast-host .toast, .toast').filter({
    hasText: /PV|HP|máximo|maior|inválid|negativ/i,
  });
  await expect(
    toast.first(),
    'A ficha precisa mostrar o erro de PV (toast) — DoD e docs/SHEETS_DICE.md §8.1.',
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });

  const afterUi = await resync(w.dmSocket, w.table._id);
  expect(afterUi.revision, 'UI inválida não pode incrementar a revisão.').toBe(revisionBefore);
  expect(afterUi.characters?.find((character) => character._id === w.playerCharacter._id)?.currentHP).toBe(
    hpBefore,
  );
});

test('rolagem 2d6+3 aparece no log do DM e da TV e sobrevive a reload', async () => {
  requirePhase3();
  const w = world!;
  const expression = '2d6+3';

  await closeSheet(playerPage!);
  await closeSheet(dmPage!);
  await openLog(dmPage!);

  await openDiceRoller(playerPage!);
  const rolled = waitForEvent<RollPayload>(
    w.playerSocket,
    'diceRolled',
    (payload) => payload?.tableId === w.table._id && payload?.expression === expression,
  );
  await rollExpression(playerPage!, expression);
  const payload = await rolled;

  const kept = payload.rolls.filter((roll) => roll.kept === 'kept').reduce((sum, roll) => sum + roll.value, 0);
  expect(payload.total, 'Total da rolagem precisa ser a soma dos dados mantidos + modificador.').toBe(
    kept + payload.modifier,
  );
  expect(payload.modifier).toBe(3);
  expect(typeof payload.revision).toBe('number');

  await expectRollInLog(dmPage!, expression, '.log-entry');
  await expectRollInLog(tvPage!, expression, '.roll-ticker__item');

  // Log persistido: REST devolve a rolagem e a TV a recupera após reload.
  const history = await fetchRolls(api, w.players[0], w.table._id);
  const persisted = history.find((roll) => roll.expression === expression && roll.userId === w.players[0].id);
  expect(persisted, 'GET /api/tables/:id/rolls precisa persistir a rolagem (§6.3).').toBeTruthy();
  expect(persisted!.total).toBe(payload.total);

  await tvPage!.reload({ waitUntil: 'domcontentloaded' });
  await expect(tvPage!.locator('.display-header__title')).toHaveText(w.table.name, {
    timeout: UI_TIMEOUT_MS,
  });
  await expectRollInLog(tvPage!, expression, '.roll-ticker__item');

  // Reload do jogador: card continua e o REST devolve o mesmo log.
  await playerPage!.reload({ waitUntil: 'domcontentloaded' });
  await expect(playerPage!.locator('.token-card')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  const historyAfterReload = await fetchRolls(api, w.players[0], w.table._id);
  expect(historyAfterReload.some((roll) => roll.expression === expression)).toBe(true);
});

test('troca para Cyberpunk RED: preset 1d10! rola e explosão é comprovada', async () => {
  requirePhase3();
  const w = world!;

  // O sistema só pode ser trocado em PREPARING; a mesa está LIVE desde o setup.
  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestUpdateSessionStatus', {
      tableId: w.table._id,
      newStatus: 'PREPARING',
    }),
    'requestUpdateSessionStatus(PREPARING)',
  );
  const switchStatus = await setTableSystem(api, w.dm, w.table._id, 'cyberpunk-red');
  expect(switchStatus, 'PUT /api/tables/:id/system precisa aceitar "cyberpunk-red".').toBe(200);
  expectAckOk(
    await emitWithAck(w.dmSocket, 'requestUpdateSessionStatus', {
      tableId: w.table._id,
      newStatus: 'LIVE',
    }),
    'requestUpdateSessionStatus(LIVE)',
  );

  const cyberpunk = await fetchSystem(api, 'cyberpunk-red');
  expect(cyberpunk?.dicePresets?.some((preset) => preset.expression === '1d10!')).toBe(true);

  await playerPage!.reload({ waitUntil: 'domcontentloaded' });
  await expect(playerPage!.locator('.token-card')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await openDiceRoller(playerPage!);

  const preset = playerPage!
    .locator('.dice-roller')
    .getByRole('button', { name: /1d10!/ })
    .first();
  await expect(
    preset,
    'docs/SHEETS_DICE.md §7/§8.3 exige o preset "1d10!" do sistema no DiceRoller.',
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await preset.click();

  const input = playerPage!.locator('.dice-roller #dice-expression');
  await expect(input).toHaveValue('1d10!');

  await openLog(dmPage!);
  const presetRoll = waitForEvent<RollPayload>(
    w.playerSocket,
    'diceRolled',
    (payload) => payload?.tableId === w.table._id && payload?.expression === '1d10!',
  );
  await playerPage!.locator('.dice-roller').getByRole('button', { name: 'Rolar', exact: true }).click();
  const presetPayload = await presetRoll;
  expect(presetPayload.rolls.length, '1d10! precisa rolar pelo menos um d10.').toBeGreaterThanOrEqual(1);
  expect(Number.isFinite(presetPayload.total)).toBe(true);

  await expectRollInLog(dmPage!, '1d10!', '.log-entry');
  await expectRollInLog(tvPage!, '1d10!', '.roll-ticker__item');

  // Prova determinística da explosão: 100d2! quase certamente encadeia
  // (P(sem explosão) = 2^-100). Aceita tanto dados extras quanto valor > face.
  const explosion = waitForEvent<RollPayload>(
    w.playerSocket,
    'diceRolled',
    (payload) => payload?.tableId === w.table._id && payload?.expression === '100d2!',
  );
  expectAckOk(
    await emitWithAck(w.playerSocket, 'requestRollDice', {
      tableId: w.table._id,
      expression: '100d2!',
    }),
    'requestRollDice(100d2!)',
  );
  const explosionPayload = await explosion;
  const exploded =
    explosionPayload.rolls.length > 100 || explosionPayload.rolls.some((roll) => roll.value > 2);
  expect(
    exploded,
    'A sintaxe "!" precisa explodir dados (dado extra ou valor acima da face) — docs/SHEETS_DICE.md §6.2.',
  ).toBe(true);
  expect(Number.isFinite(explosionPayload.total)).toBe(true);
});

test('reconectar o jogador recupera ficha, PV e log de rolagens', async ({ browser }) => {
  requirePhase3();
  const w = world!;

  const expected = await resync(w.dmSocket, w.table._id);

  // Fecha o contexto antigo por completo e entra de novo, como um celular que
  // perdeu a conexão e reabriu o app.
  await playerContext!.close();
  const session = await openAuthenticatedContext(browser, w.players[0], { width: 390, height: 844 });
  playerContext = session.context;
  playerPage = session.page;
  await playerPage.goto(`${getBaseUrl()}/play/${w.table._id}?invite=${w.table.inviteCode}`);

  await expect(playerPage.locator('.token-card')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expectPlayerCard(
    playerPage,
    PLAYER_CHARACTER,
    PLAYER_HP_AFTER_UPDATE,
    PLAYER_CHARACTER_INITIAL.maxHP,
    PLAYER_CHARACTER_INITIAL.defense,
  );

  const sheet = await openPlayerCharacterSheet(playerPage, PLAYER_CHARACTER);
  await expect
    .poll(async () => readSheetNumber(sheet, /HP Atual|PV Atual/i), { timeout: UI_TIMEOUT_MS })
    .toBe(PLAYER_HP_AFTER_UPDATE);

  await expect
    .poll(() => readRevision(playerPage!, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(expected.revision);

  // Log recuperado pela rota REST de membro (§6.3) depois da reconexão.
  const history = await fetchRolls(api, w.players[0], w.table._id);
  const expressions = new Set(history.map((roll) => roll.expression));
  for (const required of ['2d6+3', '1d10!']) {
    expect(expressions, `O log recuperado após reconexão precisa conter "${required}".`).toContain(required);
  }
});

test('jogador da mesa A não altera ficha da mesa B (socket + REST)', async () => {
  requirePhase3();
  const w = world!;

  const beforeB = await resync(w.dmBSocket, w.tableB._id);
  const target = beforeB.characters?.find((character) => character._id === w.tableBCharacter._id);
  expect(target, 'A ficha da mesa B precisa estar no snapshot do DM B.').toBeTruthy();

  const patch = { stats: { currentHP: 1 } };

  const ackA = await emitWithAck(w.playerSocket, 'requestUpdateCharacter', {
    tableId: w.table._id,
    characterId: w.tableBCharacter._id,
    patch,
  });
  const errorA = expectAckError(ackA, 'requestUpdateCharacter');
  expect(
    ['FORBIDDEN', 'VALIDATION'],
    'IDOR cross-table precisa ser rejeitado com FORBIDDEN ou VALIDATION (REALTIME_PROTOCOL §10).',
  ).toContain(errorA.error.code);

  const ackB = await emitWithAck(w.playerSocket, 'requestUpdateCharacter', {
    tableId: w.tableB._id,
    characterId: w.tableBCharacter._id,
    patch,
  });
  const errorB = expectAckError(ackB, 'requestUpdateCharacter');
  expect(errorB.error.code, 'Não-membro não pode editar ficha de outra mesa (§10).').toBe('FORBIDDEN');

  const overPayload = hpPayload(w.tableB._id, w.tableBCharacter._id, 1);
  if (overPayload) {
    const hpAck = await emitWithAck(w.playerSocket, 'requestUpdateCharacterHp', overPayload);
    const hpError = expectAckError(hpAck, 'requestUpdateCharacterHp');
    expect(hpError.error.code, 'Atalho de PV cross-table precisa ser FORBIDDEN (§10).').toBe('FORBIDDEN');
  }

  const restResponse = await api.put(
    `${getBackendUrl()}/api/tables/${w.tableB._id}/characters/${w.tableBCharacter._id}`,
    {
      headers: { ...authHeaders(w.players[0]), 'Content-Type': 'application/json' },
      data: patch,
    },
  );
  expect(restResponse.status(), 'REST de ficha cross-table precisa ser 403.').toBe(403);

  const afterB = await resync(w.dmBSocket, w.tableB._id);
  expect(afterB.revision, 'Tentativa de IDOR não pode alterar a revisão da mesa B.').toBe(beforeB.revision);
  expect(afterB.characters?.find((character) => character._id === w.tableBCharacter._id)?.currentHP).toBe(
    target!.currentHP,
  );
});
