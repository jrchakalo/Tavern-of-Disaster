/**
 * P3.1-QA-1 — One-shot presencial de Ordem Paranormal 2 (+ smoke OPSH).
 *
 * Contrato de referência: `docs/ORDEM_PARANORMAL.md` §3 (regras mecânicas),
 * §4 (API de dados/step/tabelas), §5 (OPSH) e §7 (critérios de aceite), sobre
 * `docs/REALTIME_PROTOCOL.md` (ack/patch/revisão) e `docs/SHEETS_DICE.md`.
 *
 * Cenário: DM desktop + 2 celulares + TV, mesa com sistema `ordem-paranormal-2`.
 *
 * Roteiro:
 *   1. Seeds OP2/OPSH (atributos + presets); mesa aceita o sistema; cena,
 *      tokens vinculados, cena ativa e sessão LIVE.
 *   2. Duas fichas OP2 completas via REST (ficha inteira preservada; lesões
 *      normalizadas; alcance do ataque persistido) e merge de PD/armadura.
 *   3. Snapshot e `token.character` carregam PD/armadura e o vínculo da ficha.
 *   4. Ficha OP2 no /table: abas, PV/PD/armadura e teste de Luta (passo) com
 *      RA/RB, crítico/falha crítica e log persistido.
 *   5. Tabelas de lesão/trauma/falha crítica rolam, persistem e resumem na ficha.
 *   6. /play mobile: PD no token/TV, atualização via socket, revisão e
 *      reconexão sem divergência.
 *   7. Authz: ficha de outro jogador/outra mesa não rola e não cria log.
 *   8. Smoke OPSH: ficha, Profissão, PE/SAN e teste `Nd20kh1`.
 *
 * Semântica de bloqueio: quando uma superfície do contrato não existe, o
 * primeiro teste falha listando o que falta e os demais são pulados. Nunca há
 * "pass" falso.
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

const OP2_KEY = 'ordem-paranormal-2';
const OPSH_KEY = 'ordem-paranormal-sobrevivendo-ao-horror';

const DM_CHARACTER = 'Ferreira';
const PLAYER_CHARACTER = 'Rowan';
const OTHER_CHARACTER = 'Alvo';
const OPSH_CHARACTER = 'Psicólogo';

const DM_TOKEN_NAME = 'Ferreira token';
const PLAYER_TOKEN_NAME = 'Rowan token';
const OTHER_TOKEN_NAME = 'Alvo token';
const OPSH_TOKEN_NAME = 'OPSH token';

const OP2_ATTRIBUTES = { fisico: 10, mente: 6, emocao: 8 };
const OP2_SKILLS = { luta: 10, pontaria: 8, percepcao: 6, disciplina: 6, vigor: 8 };
const OP2_PROFILE = { perfil: 'analista', vocacao: 'Ferreira', level: 3, idade: 23 };
const OP2_STATS = {
  currentHP: 22,
  maxHP: 22,
  currentPD: 12,
  maxPD: 12,
  armorPoints: 2,
  armorPointsMax: 2,
};
const PD_AFTER_UPDATE = 5;
const PD_AFTER_PLAYER_UPDATE = 3;

const OP2_LESAO_KEYS = new Set([
  'morte-subita',
  'morte-lenta',
  'laceracao-profunda',
  'sem-olho',
  'sem-mao',
  'sem-pe',
  'tendao-comprometido',
  'musculo-comprometido',
  'orgao-interno-comprometido',
  'orgao-sensorial-comprometido',
  'cicatriz-assustadora',
  'contusao',
  'surto-adrenalina',
]);
const OP2_TRAUMA_KEYS = new Set([
  'colapso-total',
  'tept',
  'degradacao-cognitiva',
  'macula-psiquica',
  'chaga-da-alma',
  'retracao-defensiva',
  'panico',
  'estupor',
  'injecao-animo',
]);
const OP2_FALHA_KEYS = new Set([
  'vexame',
  'fisico-1-passo',
  'mente-1-passo',
  'emocao-1-passo',
  'perde-1d4-pv',
  'perde-1d4-pd',
  'perde-item',
  'sem-efeito',
]);

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

type TestUser = { id: string; username: string; email: string; password: string; token: string };

type TableInfo = {
  _id: string;
  name: string;
  inviteCode: string;
  activeScene?: string;
  scenes: string[];
  status: string;
};

type SceneInfo = { _id: string; name: string };

type CharacterStats = {
  currentHP?: number;
  maxHP?: number;
  currentPD?: number;
  maxPD?: number;
  armorPoints?: number;
  armorPointsMax?: number;
  currentPE?: number;
  maxPE?: number;
  currentSAN?: number;
  maxSAN?: number;
  defense?: number;
};

type CharacterDto = {
  _id: string;
  ownerId: string;
  tableId: string;
  name: string;
  systemKey?: string;
  attributes?: Record<string, number>;
  skills?: Record<string, number | string>;
  profile?: Record<string, unknown>;
  stats?: CharacterStats;
  fear?: { active?: boolean; dreadDie?: number | null; notes?: string };
  relations?: Array<{ name: string; grade: number; note?: string }>;
  rituals?: Array<{ name: string; cost?: string; description?: string; circle?: string }>;
  conditions?: string[];
  traumas?: string[];
  injuries?: Array<{ attribute: string; penalty: number; note?: string }>;
  attacks?: Array<{ name: string; damage?: string; range?: string; notes?: string }>;
  sanityMode?: 'san' | 'pd';
  progressionMode?: string;
};

type CharacterSummary = {
  _id: string;
  name: string;
  ownerId: string;
  systemKey?: string;
  currentHP?: number;
  maxHP?: number;
  currentPD?: number;
  maxPD?: number;
  armorPoints?: number;
  armorPointsMax?: number;
  defense?: number;
  tokenId?: string | null;
};

type TokenCharacterSummary = {
  _id: string;
  name: string;
  currentHP?: number;
  maxHP?: number;
  currentPD?: number;
  maxPD?: number;
  armorPoints?: number;
  armorPointsMax?: number;
};

type TokenDto = {
  _id: string;
  squareId: string;
  name: string;
  characterId?: string | null;
  character?: TokenCharacterSummary | null;
  owner?: { _id: string; username: string } | null;
};

type StepDetails = {
  attribute: { key: string; die: number; value: number };
  skill: { key: string; die: number; value: number };
  bonusDice: Array<{ die: number; value: number }>;
  dread?: { die: number; value: number };
  canceledValues: number[];
  high: number;
  low: number;
  difficulty: number;
  success: boolean;
  critical: boolean;
  fumble: boolean;
  dreadEnds: boolean;
  summedDice: number[];
  damageBase?: number;
  label?: string;
};

type TableRollResult = {
  kind: 'table';
  table: 'lesao' | 'trauma' | 'falha-critica';
  die: number;
  roll: number;
  key: string;
  summary: string;
  expression: string;
  modifier: number;
};

type RollPayload = {
  id?: string;
  tableId: string;
  kind?: 'expression' | 'step' | 'table';
  expression: string;
  rolls: Array<{ die: number; value: number; kept: 'kept' | 'dropped'; role?: string }>;
  modifier: number;
  total: number;
  metadata?: string;
  characterId?: string;
  tokenId?: string;
  userId: string;
  revision: number;
  createdAt: string;
  step?: StepDetails;
  tableResult?: TableRollResult;
};

type Snapshot = {
  tableId: string;
  revision: number;
  table: { _id: string; name: string; players: Array<{ _id: string; username: string }> };
  activeScene: { _id: string; name: string } | null;
  tokens: TokenDto[];
  characters?: CharacterSummary[];
  recentRolls?: RollPayload[];
};

type SystemDto = {
  _id: string;
  key: string;
  name: string;
  defaultAttributes?: Array<{ key: string; label: string }>;
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
  otherCharacter: CharacterDto;
  opshCharacter: CharacterDto;
  dmTokenId: string;
  playerTokenId: string;
  dmSocket: Socket;
  playerSocket: Socket;
  player2Socket: Socket;
  dmBSocket: Socket;
  tableB: TableInfo;
  tableBCharacterId: string;
  displayToken: string;
  displayUrl: string;
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

async function fetchRolls(api: APIRequestContext, user: TestUser, tableId: string): Promise<RollPayload[]> {
  const response = await api.get(`${getBackendUrl()}/api/tables/${tableId}/rolls?limit=50`, {
    headers: authHeaders(user),
  });
  if (!response.ok()) {
    throw new Error(`Falha ao ler o log de rolagens: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as RollPayload[];
}

async function createDisplayToken(
  api: APIRequestContext,
  dm: TestUser,
  tableId: string,
): Promise<{ status: number; body: DisplayTokenResponse | null }> {
  const response = await api.post(`${getBackendUrl()}/api/tables/${tableId}/display-token`, {
    headers: authHeaders(dm),
  });
  if (!response.ok()) return { status: response.status(), body: null };
  return { status: response.status(), body: (await response.json()) as DisplayTokenResponse };
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
    `O evento "${event}" não respondeu ack (docs/REALTIME_PROTOCOL.md §5).`,
  ).not.toBeNull();
  const value = ack as Ack;
  expect(value.ok, `Esperava ok:true em "${event}", veio ${JSON.stringify(value)}.`).toBe(true);
  return value as AckOk;
}

function expectAckError(ack: Ack | null, event: string): AckErr {
  expect(
    ack,
    `O evento "${event}" não respondeu ack (docs/REALTIME_PROTOCOL.md §5).`,
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

function cssText(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

async function readRevision(page: Page, selector: string): Promise<number> {
  const text = (await page.locator(selector).first().textContent()) ?? '';
  const match = /(\d+)/.exec(text);
  if (!match) throw new Error(`Revisão não encontrada em "${selector}" (texto: "${text}").`);
  return Number(match[1]);
}

async function readSheetNumber(sheet: ReturnType<Page['locator']>, label: RegExp): Promise<number> {
  const input = sheet.getByLabel(label).first();
  await expect(input, `Campo "${String(label)}" não encontrado na ficha.`).toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  return Number(await input.inputValue());
}

async function ensureDmInitiativeTab(page: Page): Promise<void> {
  const tab = page.locator('.dm-panel .dm-panel__tab', { hasText: 'Iniciativa' }).first();
  if (await tab.count()) await tab.click().catch(() => undefined);
}

async function openDmCharacterSheet(page: Page, tokenName: string) {
  const sheet = page.locator('.character-sheet');
  if (await sheet.isVisible().catch(() => false)) {
    const close = sheet.locator('button[aria-label="Fechar"]');
    if (await close.count()) await close.first().click().catch(() => undefined);
    await expect(sheet).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
  }

  await ensureDmInitiativeTab(page);
  const link = page.locator('.dm-panel .initiative-panel .character-link', { hasText: tokenName }).first();
  if ((await link.count()) === 0) {
    const toggle = page.locator('.dm-panel .toggle-button').first();
    if (await toggle.count()) await toggle.click().catch(() => undefined);
  }
  const target =
    (await link.count()) > 0
      ? link
      : page.locator('.dm-panel .initiative-panel').getByText(tokenName, { exact: false }).first();
  await expect(
    target,
    `docs/ORDEM_PARANORMAL.md §6 exige abrir a ficha a partir da iniciativa no /table ` +
      `(não encontrei link para "${tokenName}").`,
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await target.click();
  await expect(sheet, 'A ficha (CharacterSheet) precisa abrir no /table.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  return sheet;
}

async function closeSheet(page: Page): Promise<void> {
  const close = page.locator('.character-sheet button[aria-label="Fechar"]');
  if (await close.count()) {
    await close.first().click().catch(() => undefined);
    await expect(page.locator('.character-sheet')).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
  }
}

async function openPlayerCharacterSheet(page: Page) {
  const sheet = page.locator('.character-sheet');
  if (await sheet.isVisible().catch(() => false)) return sheet;

  const card = page.locator('.token-card').first();
  await expect(card, 'docs/ORDEM_PARANORMAL.md §6 exige o token card em /play.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  await card.click();
  await expect(sheet, 'O card do jogador precisa abrir a própria ficha OP2.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  return sheet;
}

async function displayVitals(page: Page, tokenName: string): Promise<string> {
  const escaped = cssText(tokenName);
  const token = page.locator(`.display-board__token[title="${escaped}"]`);
  const rail = page.locator('.display-rail .initiative-item', { hasText: tokenName });
  const parts: string[] = [];
  if (await token.count()) parts.push((await token.first().textContent()) ?? '');
  if (await rail.count()) parts.push((await rail.first().textContent()) ?? '');
  return parts.join(' | ');
}

/**
 * Invariantes do teste de passo (docs/ORDEM_PARANORMAL.md §3.2/§3.3/§3.4).
 * Reconstrói os sobreviventes da anulação do pavor pelo valor do dado.
 */
function expectStepInvariants(payload: RollPayload): void {
  const step = payload.step;
  expect(step, 'A rolagem de passo precisa trazer `step` (§4).').toBeTruthy();
  const details = step!;

  const testDice = payload.rolls.filter((roll) => roll.role !== 'dread');
  const dreadValue = details.dread?.value;
  const survivors = testDice.filter((roll) => dreadValue === undefined || roll.value >= dreadValue);
  const canceled = testDice.filter((roll) => !survivors.includes(roll));

  expect(details.attribute.key).toMatch(/^(fisico|mente|emocao)$/);
  expect(testDice.some((roll) => roll.role === 'attribute')).toBe(true);
  expect(testDice.some((roll) => roll.role === 'skill')).toBe(true);

  // Total = soma dos até 3 maiores dados sobreviventes.
  const summed = [...survivors]
    .map((roll) => roll.value)
    .sort((a, b) => b - a)
    .slice(0, 3);
  expect(details.summedDice).toEqual(summed);
  expect(details.summedDice.length).toBeLessThanOrEqual(3);
  expect(payload.total).toBe(details.summedDice.reduce((sum, value) => sum + value, 0) + payload.modifier);

  // Pavor anula dados de teste menores que o resultado (não os bônus).
  expect(details.canceledValues).toEqual(canceled.map((roll) => roll.value));
  expect(details.dreadEnds).toBe(dreadValue === 1);

  // RA/RB são maior/menor dado de teste não anulado.
  const max = survivors.length ? Math.max(...survivors.map((roll) => roll.value)) : 0;
  const min = survivors.length ? Math.min(...survivors.map((roll) => roll.value)) : 0;
  expect(details.high).toBe(max);
  expect(details.low).toBe(min);
  expect(details.high).toBeGreaterThanOrEqual(details.low);

  // Crítico: dois dados de teste sobreviventes com o mesmo valor >= 6.
  const counts = new Map<number, number>();
  survivors.forEach((roll) => counts.set(roll.value, (counts.get(roll.value) ?? 0) + 1));
  const criticalByContract = [...counts.entries()].some(([value, count]) => value >= 6 && count >= 2);
  expect(details.critical, `crítico inconsistente: sobreviventes ${survivors.map((r) => r.value)}`).toBe(
    criticalByContract,
  );

  // Falha crítica: todos os sobreviventes valem 1, ou todos foram anulados.
  const fumbleByContract = survivors.length === 0 || survivors.every((roll) => roll.value === 1);
  expect(details.fumble, `falha crítica inconsistente: sobreviventes ${survivors.map((r) => r.value)}`).toBe(
    fumbleByContract,
  );

  expect(details.success).toBe(
    details.critical || (!details.fumble && payload.total >= details.difficulty),
  );
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

test.describe.configure({ mode: 'serial', retries: 0 });
test.setTimeout(240_000);

let api: APIRequestContext;
let world: World | null = null;

const openContexts: BrowserContext[] = [];
let dmContext: BrowserContext | null = null;
let playerContext: BrowserContext | null = null;
let dmPage: Page | null = null;
let playerPage: Page | null = null;
let tvPage: Page | null = null;

function addContractError(message: string): void {
  if (!world) return;
  world.contractError = world.contractError ? `${world.contractError} | ${message}` : message;
}

function requireContract(): void {
  const reason = world?.contractError;
  test.skip(Boolean(reason), reason ? `Bloqueado: ${reason}` : 'Contrato da Fase 3.1 ausente nesta branch.');
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
// Payloads
// ---------------------------------------------------------------------------

function op2CharacterPayload(name: string): Record<string, unknown> {
  return {
    name,
    systemKey: OP2_KEY,
    attributes: { ...OP2_ATTRIBUTES },
    skills: { ...OP2_SKILLS },
    profile: { ...OP2_PROFILE },
    stats: { ...OP2_STATS },
    fear: { active: true, dreadDie: 6 },
    relations: [{ name: 'Rowan', grade: 2, note: 'confiança' }],
    rituals: [{ name: 'Bálsamo', cost: '2 PD', description: 'cura 2d4 PV' }],
    conditions: ['abalado'],
    traumas: ['TEPT'],
    injuries: ['Sem olho'],
    attacks: [{ name: 'Martelo', damage: 'RA+3', range: 'corpo a corpo', notes: 'forja' }],
  };
}

const OPSH_SKILLS = {
  acrobacia: 5,
  atletismo: 5,
  atualidades: 0,
  ciencias: 5,
  crime: 0,
  diplomacia: 5,
  fortitude: 5,
  furtividade: 0,
  iniciativa: 5,
  intimidacao: 5,
  intuicao: 5,
  investigacao: 5,
  luta: 5,
  medicina: 10,
  ocultismo: 5,
  percepcao: 10,
  pilotagem: 0,
  pontaria: 5,
  profissao: 10,
  reflexos: 5,
  religiao: 5,
  sobrevivencia: 5,
  tatica: 0,
  tecnologia: 5,
  vontade: 10,
  adestramento: 0,
  artes: 0,
  enganacao: 0,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test.beforeAll(async ({ browser }) => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const dm = await registerUser(api, 'dm-op2', suffix);
  const player1 = await registerUser(api, 'p1-op2', suffix);
  const player2 = await registerUser(api, 'p2-op2', suffix);
  const dmB = await registerUser(api, 'dmb-op2', suffix);

  const table = await createTable(api, dm, `Mesa OP2 ${suffix}`);
  await joinTableByInvite(api, player1, table.inviteCode);
  await joinTableByInvite(api, player2, table.inviteCode);

  const systemStatus = await setTableSystem(api, dm, table._id, OP2_KEY);
  const scene = await createScene(api, dm, table._id, {
    name: `Cena OP2 ${suffix}`,
    gridWidth: 12,
    gridHeight: 8,
  });

  const dmCharacter = await createCharacter(api, dm, table._id, op2CharacterPayload(DM_CHARACTER));
  const playerCharacter = await createCharacter(api, player1, table._id, op2CharacterPayload(PLAYER_CHARACTER));
  const otherCharacter = await createCharacter(api, player2, table._id, {
    name: OTHER_CHARACTER,
    systemKey: OP2_KEY,
    attributes: { fisico: 6, mente: 6, emocao: 6 },
    skills: { luta: 6 },
    stats: { currentHP: 10, maxHP: 10, currentPD: 6, maxPD: 6 },
  });
  const opshCharacter = await createCharacter(api, dm, table._id, {
    name: OPSH_CHARACTER,
    systemKey: OPSH_KEY,
    attributes: { agilidade: 2, forca: 3, intelecto: 2, presenca: 2, vigor: 1 },
    skills: { ...OPSH_SKILLS },
    profile: {
      classe: 'especialista',
      origem: 'Acadêmico',
      nex: '45%',
      profissao: 'psicólogo',
      trilha: 'Médico',
    },
    stats: {
      currentHP: 18,
      maxHP: 18,
      defense: 12,
      currentPE: 7,
      maxPE: 7,
      currentSAN: 16,
      maxSAN: 20,
    },
    sanityMode: 'san',
    progressionMode: 'nex',
    injuries: [{ attribute: 'agilidade', penalty: -1, note: 'Sem pé' }],
    rituals: [{ name: 'Oração', circle: '1º', cost: '2 PE', description: '' }],
  });

  const dmSocket = await connectSocket({ token: dm.token }, 'dm-op2');
  await joinTable(dmSocket, table._id);
  const playerSocket = await connectSocket({ token: player1.token }, 'p1-op2');
  await joinTable(playerSocket, table._id);
  const player2Socket = await connectSocket({ token: player2.token }, 'p2-op2');
  await joinTable(player2Socket, table._id);

  expectAckOk(
    await emitWithAck(dmSocket, 'requestSetActiveScene', { tableId: table._id, sceneId: scene._id }),
    'requestSetActiveScene',
  );

  const placements: Array<[string, string, string, string]> = [
    ['sq-14', DM_TOKEN_NAME, dm.id, dmCharacter._id],
    ['sq-29', PLAYER_TOKEN_NAME, player1.id, playerCharacter._id],
    ['sq-34', OTHER_TOKEN_NAME, player2.id, otherCharacter._id],
    ['sq-45', OPSH_TOKEN_NAME, dm.id, opshCharacter._id],
  ];
  for (const [squareId, tokenName, ownerId, characterId] of placements) {
    expectAckOk(
      await emitWithAck(dmSocket, 'requestPlaceToken', {
        tableId: table._id,
        sceneId: scene._id,
        squareId,
        name: tokenName,
        size: 'Pequeno/Médio',
        movement: 9,
        ownerId,
        characterId,
      }),
      `requestPlaceToken(${tokenName})`,
    );
  }

  expectAckOk(
    await emitWithAck(dmSocket, 'requestUpdateSessionStatus', { tableId: table._id, newStatus: 'LIVE' }),
    'requestUpdateSessionStatus',
  );

  const display = await createDisplayToken(api, dm, table._id);

  // Mesa B para o teste de autorização cross-table.
  const tableB = await createTable(api, dmB, `Mesa B OP2 ${suffix}`);
  await setTableSystem(api, dmB, tableB._id, OP2_KEY);
  const tableBCharacter = await createCharacter(api, dmB, tableB._id, {
    name: `Alvo B ${suffix}`,
    systemKey: OP2_KEY,
    attributes: { fisico: 6, mente: 6, emocao: 6 },
    stats: { currentHP: 8, maxHP: 8, currentPD: 4, maxPD: 4 },
  });
  const dmBSocket = await connectSocket({ token: dmB.token }, 'dmb-op2');
  await joinTable(dmBSocket, tableB._id);

  world = {
    suffix,
    dm,
    players: [player1, player2],
    table,
    scene,
    dmCharacter,
    playerCharacter,
    otherCharacter,
    opshCharacter,
    dmTokenId: '',
    playerTokenId: '',
    dmSocket,
    playerSocket,
    player2Socket,
    dmBSocket,
    tableB,
    tableBCharacterId: tableBCharacter._id,
    displayToken: display.body?.token ?? '',
    displayUrl: display.body?.displayUrl ?? '',
    contractError: null,
  };

  // --- Detecção do contrato (nunca "pass" falso) ---------------------------

  if (systemStatus !== 200) {
    addContractError(
      `PUT /api/tables/:id/system respondeu ${systemStatus} ao aceitar "${OP2_KEY}" ` +
        '(docs/ORDEM_PARANORMAL.md §2/§7).',
    );
  }

  const op2 = await fetchSystem(api, OP2_KEY);
  if (!op2) {
    addContractError(`GET /api/systems/key/${OP2_KEY} não encontrou o seed (§2/§7).`);
  } else {
    const attrKeys = (op2.defaultAttributes ?? []).map((entry) => entry.key).sort();
    if (attrKeys.join(',') !== 'emocao,fisico,mente') {
      addContractError(
        `Seed OP2 precisa de defaultAttributes fisico/mente/emocao (veio ${JSON.stringify(attrKeys)}).`,
      );
    }
    const expressions = new Set((op2.dicePresets ?? []).map((preset) => preset.expression));
    for (const required of ['1d4', '1d6', '1d8', '1d10', '1d12']) {
      if (!expressions.has(required)) {
        addContractError(`Preset OP2 "${required}" ausente no seed (§2).`);
      }
    }
  }

  const opsh = await fetchSystem(api, OPSH_KEY);
  if (!opsh) {
    addContractError(`GET /api/systems/key/${OPSH_KEY} não encontrou o seed (§5/§7).`);
  } else {
    const attrKeys = (opsh.defaultAttributes ?? []).map((entry) => entry.key).sort();
    const expected = ['agilidade', 'forca', 'intelecto', 'presenca', 'vigor'].sort();
    if (attrKeys.join(',') !== expected.join(',')) {
      addContractError(
        `Seed OPSH precisa dos 5 atributos do OP1 (veio ${JSON.stringify(attrKeys)}).`,
      );
    }
    const expressions = new Set((opsh.dicePresets ?? []).map((preset) => preset.expression));
    for (const required of ['1d20', '2d20kh1']) {
      if (!expressions.has(required)) {
        addContractError(`Preset OPSH "${required}" ausente no seed (§5).`);
      }
    }
  }

  if (!display.body) {
    addContractError(
      `POST /api/tables/:id/display-token respondeu ${display.status}; a TV é superfície do one-shot.`,
    );
  }

  const snapshot = await resync(dmSocket, table._id);
  if (!snapshot.activeScene || snapshot.activeScene._id !== scene._id) {
    addContractError('A cena criada não ficou ativa no snapshot (§2).');
  }
  if (snapshot.table.name !== table.name) {
    addContractError('sessionSnapshot.table não corresponde à mesa criada.');
  }

  for (const tokenName of [DM_TOKEN_NAME, PLAYER_TOKEN_NAME, OTHER_TOKEN_NAME, OPSH_TOKEN_NAME]) {
    if (!snapshot.tokens.some((token) => token.name === tokenName)) {
      addContractError(`O token "${tokenName}" não apareceu no snapshot.`);
    }
  }

  const dmToken = snapshot.tokens.find((token) => token.name === DM_TOKEN_NAME);
  const playerToken = snapshot.tokens.find((token) => token.name === PLAYER_TOKEN_NAME);
  if (dmToken) world.dmTokenId = dmToken._id;
  if (playerToken) world.playerTokenId = playerToken._id;

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
  for (const socket of [world?.dmSocket, world?.playerSocket, world?.player2Socket, world?.dmBSocket]) {
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

test('P3.1-QA-1 · seeds OP2/OPSH, sistema da mesa, cena, tokens e LIVE', async () => {
  expect(world, 'O setup compartilhado não foi criado.').not.toBeNull();
  expect(
    world!.contractError,
    `Fase 3.1 incompleta — superfícies ausentes: ${world!.contractError ?? ''}`,
  ).toBeNull();

  const op2 = await fetchSystem(api, OP2_KEY);
  expect(op2?.key).toBe(OP2_KEY);
  expect(op2?.defaultAttributes?.map((entry) => entry.key).sort()).toEqual([
    'emocao',
    'fisico',
    'mente',
  ]);
  expect(op2?.dicePresets?.some((preset) => preset.expression === '1d12')).toBe(true);

  const opsh = await fetchSystem(api, OPSH_KEY);
  expect(opsh?.key).toBe(OPSH_KEY);
  expect(opsh?.defaultAttributes?.length).toBe(5);
  expect(opsh?.dicePresets?.some((preset) => preset.expression === '2d20kh1')).toBe(true);

  expect(world!.dmTokenId, 'O token do DM precisa existir.').not.toBe('');
  expect(world!.playerTokenId, 'O token do jogador precisa existir.').not.toBe('');

  const snapshot = await resync(world!.dmSocket, world!.table._id);
  expect(snapshot.activeScene?._id).toBe(world!.scene._id);
  expect(snapshot.table.players.map((entry) => entry._id).sort()).toEqual(
    [world!.dm.id, ...world!.players.map((entry) => entry.id)].sort(),
  );
});

test('duas fichas OP2 persistem a ficha completa e o merge preserva PD/armadura', async () => {
  requireContract();
  const w = world!;

  const assertFullSheet = (character: CharacterDto, name: string) => {
    expect(character.name).toBe(name);
    expect(character.systemKey, 'Character.systemKey precisa ser OP2.').toBe(OP2_KEY);
    expect(character.attributes).toMatchObject(OP2_ATTRIBUTES);
    expect(character.skills).toMatchObject(OP2_SKILLS);
    expect(character.profile).toMatchObject(OP2_PROFILE);
    expect(character.stats).toMatchObject(OP2_STATS);
    expect(character.fear?.active).toBe(true);
    expect(character.fear?.dreadDie).toBe(6);
    expect(character.relations?.[0]).toMatchObject({ name: 'Rowan', grade: 2, note: 'confiança' });
    expect(character.rituals?.[0]).toMatchObject({
      name: 'Bálsamo',
      cost: '2 PD',
      description: 'cura 2d4 PV',
    });
    expect(character.conditions).toContain('abalado');
    expect(character.traumas).toContain('TEPT');
    // Texto livre normalizado para a estrutura de ferimento (note guarda o texto).
    expect(character.injuries?.[0]).toMatchObject({ attribute: 'ferimento', penalty: 0, note: 'Sem olho' });
    expect(character.attacks?.[0]).toMatchObject({
      name: 'Martelo',
      damage: 'RA+3',
      range: 'corpo a corpo',
      notes: 'forja',
    });
  };

  assertFullSheet(w.dmCharacter, DM_CHARACTER);
  assertFullSheet(w.playerCharacter, PLAYER_CHARACTER);

  // Releitura via REST (a resposta de criação não é a única fonte).
  const fromRest = await fetchTableCharacters(api, w.dm, w.table._id);
  const playerFromRest = fromRest.find((character) => character._id === w.playerCharacter._id);
  expect(playerFromRest, 'A ficha do jogador precisa estar em GET /tables/:id/characters.').toBeTruthy();
  assertFullSheet(playerFromRest!, PLAYER_CHARACTER);

  // Merge de stats: patch só com currentPD + profile completo.
  const ack = await emitWithAck(w.playerSocket, 'requestUpdateCharacter', {
    tableId: w.table._id,
    characterId: w.playerCharacter._id,
    patch: {
      stats: { currentPD: PD_AFTER_UPDATE },
      profile: { ...OP2_PROFILE },
    },
  });
  expectAckOk(ack, 'requestUpdateCharacter');

  const updatedList = await fetchTableCharacters(api, w.dm, w.table._id);
  const updated = updatedList.find((character) => character._id === w.playerCharacter._id);
  expect(updated, 'A ficha atualizada precisa continuar listada.').toBeTruthy();
  expect(updated!.stats?.currentPD).toBe(PD_AFTER_UPDATE);
  expect(updated!.stats?.maxPD, 'O merge não pode perder maxPD.').toBe(OP2_STATS.maxPD);
  expect(updated!.stats?.armorPoints, 'O merge não pode perder armorPoints.').toBe(
    OP2_STATS.armorPoints,
  );
  expect(updated!.stats?.armorPointsMax).toBe(OP2_STATS.armorPointsMax);
  expect(updated!.profile).toMatchObject(OP2_PROFILE);
  expect(updated!.attacks?.[0]?.range, 'O merge não pode perder o alcance do ataque.').toBe(
    'corpo a corpo',
  );

  // Espelha o PD novo no mundo em memória para as asserções seguintes.
  w.playerCharacter = { ...w.playerCharacter, ...updated! };
});

test('snapshot e token carregam PD/armadura e o vínculo tokenId', async () => {
  requireContract();
  const w = world!;

  const snapshot = await resync(w.dmSocket, w.table._id);
  expect(Array.isArray(snapshot.characters), 'sessionSnapshot.characters ausente (§3.1).').toBe(true);

  for (const character of [w.dmCharacter, w.playerCharacter]) {
    const summary = snapshot.characters!.find((entry) => entry._id === character._id);
    expect(summary, `Resumo da ficha "${character.name}" ausente no snapshot.`).toBeTruthy();
    expect(summary!.currentPD).toBe(character._id === w.playerCharacter._id ? PD_AFTER_UPDATE : OP2_STATS.currentPD);
    expect(summary!.maxPD).toBe(OP2_STATS.maxPD);
    expect(summary!.armorPoints).toBe(OP2_STATS.armorPoints);
    expect(summary!.armorPointsMax).toBe(OP2_STATS.armorPointsMax);
  }

  const playerSummary = snapshot.characters!.find((entry) => entry._id === w.playerCharacter._id);
  expect(playerSummary!.tokenId, 'CharacterSummaryDTO.tokenId precisa apontar para o token.').toBe(
    w.playerTokenId,
  );

  const playerToken = snapshot.tokens.find((token) => token._id === w.playerTokenId);
  expect(playerToken, 'O token do jogador precisa estar no snapshot.').toBeTruthy();
  expect(playerToken!.characterId).toBe(w.playerCharacter._id);
  expect(playerToken!.character?.currentPD).toBe(PD_AFTER_UPDATE);
  expect(playerToken!.character?.maxPD).toBe(OP2_STATS.maxPD);
  expect(playerToken!.character?.armorPoints).toBe(OP2_STATS.armorPoints);

  const dmToken = snapshot.tokens.find((token) => token._id === w.dmTokenId);
  expect(dmToken!.character?.currentPD).toBe(OP2_STATS.currentPD);
  expect(dmToken!.character?.armorPoints).toBe(OP2_STATS.armorPoints);
});

test('ficha OP2 no /table rola Luta (passo) e o log persiste', async () => {
  requireContract();
  const w = world!;

  await expect(dmPage!.locator('.dm-panel')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  const sheet = await openDmCharacterSheet(dmPage!, PLAYER_TOKEN_NAME);
  const op2 = sheet.locator('.op2-sheet');
  await expect(
    op2,
    'A ficha OP2 precisa renderizar `.op2-sheet` (docs/ORDEM_PARANORMAL.md §6).',
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });

  for (const tab of [
    'Identidade',
    'Atributos & Perícias',
    'Recursos',
    'Combate',
    'Rituais',
    'Relações',
    'Condições',
  ]) {
    await expect(op2.getByRole('tab', { name: tab }), `Aba "${tab}" ausente na ficha OP2.`).toBeVisible();
  }

  await op2.getByRole('tab', { name: 'Recursos' }).click();
  expect(await readSheetNumber(op2, /^PV atual$/i)).toBe(OP2_STATS.currentHP);
  expect(await readSheetNumber(op2, /^PD atual$/i)).toBe(PD_AFTER_UPDATE);
  expect(await readSheetNumber(op2, /^PD máximo$/i)).toBe(OP2_STATS.maxPD);
  expect(await readSheetNumber(op2, /^Armadura atual$/i)).toBe(OP2_STATS.armorPoints);

  await op2.getByRole('tab', { name: 'Atributos & Perícias' }).click();
  const rolled = waitForEvent<RollPayload>(
    w.dmSocket,
    'diceRolled',
    (payload) =>
      payload?.tableId === w.table._id &&
      payload?.kind === 'step' &&
      payload?.characterId === w.playerCharacter._id,
  );
  await op2.getByRole('button', { name: 'Rolar Luta' }).click();
  const payload = await rolled;

  expect(payload.kind).toBe('step');
  expect(payload.step?.skill.key).toBe('luta');
  expect(payload.step?.attribute.key).toBe('fisico');
  expect(payload.step?.difficulty, 'DT padrão do teste de passo é 7 (§3.2).').toBe(7);
  expect(payload.step?.dread?.die, 'Medo ativo precisa rolar o dado de pavor d6 (§3.4).').toBe(6);
  expect(payload.rolls.some((roll) => roll.role === 'attribute')).toBe(true);
  expect(payload.rolls.some((roll) => roll.role === 'skill')).toBe(true);
  expectStepInvariants(payload);

  // "Último teste" da ficha reflete o resultado canônico.
  await expect(op2.locator('.op2-last-result')).toContainText(/Sucesso|Falha|Crítico/, {
    timeout: UI_TIMEOUT_MS,
  });

  const history = await fetchRolls(api, w.players[0], w.table._id);
  const persisted = history.find(
    (roll) => roll.kind === 'step' && roll.characterId === w.playerCharacter._id,
  );
  expect(persisted, 'GET /api/tables/:id/rolls precisa persistir o teste de passo (§4).').toBeTruthy();
  expect(persisted!.step?.skill.key).toBe('luta');
  expect(persisted!.step?.summedDice).toEqual(payload.step!.summedDice);
  expect(persisted!.total).toBe(payload.total);

  // Reload do /table: o log continua persistido no REST.
  await dmPage!.reload({ waitUntil: 'domcontentloaded' });
  await expect(dmPage!.locator('.dm-panel')).toBeVisible({ timeout: UI_TIMEOUT_MS });
  const afterReload = await fetchRolls(api, w.dm, w.table._id);
  expect(afterReload.some((roll) => roll.kind === 'step' && roll.step?.skill.key === 'luta')).toBe(true);
});

test('tabelas de lesão, trauma e falha crítica rolam, persistem e resumem na ficha', async () => {
  requireContract();
  const w = world!;

  const cases: Array<{
    table: 'lesao' | 'trauma' | 'falha-critica';
    die: number;
    keys: Set<string>;
  }> = [
    { table: 'lesao', die: 20, keys: OP2_LESAO_KEYS },
    { table: 'trauma', die: 20, keys: OP2_TRAUMA_KEYS },
    { table: 'falha-critica', die: 8, keys: OP2_FALHA_KEYS },
  ];

  let lastPayload: RollPayload | null = null;

  for (const entry of cases) {
    const rolled = waitForEvent<RollPayload>(
      w.playerSocket,
      'diceRolled',
      (payload) =>
        payload?.tableId === w.table._id &&
        payload?.kind === 'table' &&
        payload?.tableResult?.table === entry.table,
    );
    const ack = await emitWithAck(w.playerSocket, 'requestRollDice', {
      tableId: w.table._id,
      table: entry.table,
      characterId: w.playerCharacter._id,
    });
    expectAckOk(ack, `requestRollDice(${entry.table})`);
    const payload = await rolled;

    expect(payload.kind).toBe('table');
    const result = payload.tableResult!;
    expect(result).toBeTruthy();
    expect(result.die).toBe(entry.die);
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(entry.die);
    expect(entry.keys.has(result.key), `Chave "${result.key}" não pertence à tabela ${entry.table}.`).toBe(
      true,
    );
    expect(result.summary.length, 'O resumo da tabela não pode vir vazio.').toBeGreaterThan(0);
    expect(payload.total).toBe(result.roll);
    lastPayload = payload;
  }

  // Persistência no mesmo Roll (histórico/TV).
  const history = await fetchRolls(api, w.dm, w.table._id);
  for (const entry of cases) {
    const persisted = history.find(
      (roll) =>
        roll.kind === 'table' &&
        roll.tableResult?.table === entry.table &&
        roll.characterId === w.playerCharacter._id,
    );
    expect(persisted, `A rolagem de ${entry.table} precisa persistir em GET /rolls.`).toBeTruthy();
    expect(persisted!.tableResult?.key).toBeTruthy();
  }

  // A aba Condições da ficha OP2 mostra o resumo da última tabela rolada.
  const sheet = await openDmCharacterSheet(dmPage!, PLAYER_TOKEN_NAME);
  const op2 = sheet.locator('.op2-sheet');
  await op2.getByRole('tab', { name: 'Condições' }).click();
  const summary = op2.locator('.op2-table-result');
  await expect(
    summary,
    'A seção "Tabelas" da ficha precisa exibir o resumo da rolagem (docs/ORDEM_PARANORMAL.md §6).',
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(summary).toContainText('Falha crítica');
  expect((await summary.textContent()) ?? '').toContain(lastPayload!.tableResult!.summary.slice(0, 20));

  await closeSheet(dmPage!);
});

test('jogador vê PD no card/TV, atualiza por socket e reconecta sem divergência', async ({ browser }) => {
  requireContract();
  const w = world!;

  // Card e TV do jogador mostram o PD canônico.
  const card = playerPage!.locator('.token-card').first();
  await expect(card).toBeVisible({ timeout: UI_TIMEOUT_MS });
  const pdBadge = card.locator('.token-card__resource--pd');
  await expect(pdBadge, 'O token card precisa expor o PD (`.token-card__resource--pd`).').toContainText(
    `PD ${PD_AFTER_UPDATE}`,
    { timeout: UI_TIMEOUT_MS },
  );

  await expect(tvPage!.locator('.display-header__title')).toHaveText(w.table.name, {
    timeout: UI_TIMEOUT_MS,
  });
  const tvToken = tvPage!.locator(`.display-board__token[title="${cssText(PLAYER_TOKEN_NAME)}"]`);
  await expect(tvToken, 'A TV precisa renderizar o token do jogador.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  await expect
    .poll(() => displayVitals(tvPage!, PLAYER_TOKEN_NAME), { timeout: UI_TIMEOUT_MS })
    .toMatch(new RegExp(`PD[^\\d]*${PD_AFTER_UPDATE}`, 'i'));

  const before = await resync(w.dmSocket, w.table._id);
  const ack = await emitWithAck(w.playerSocket, 'requestUpdateCharacter', {
    tableId: w.table._id,
    characterId: w.playerCharacter._id,
    patch: { stats: { currentPD: PD_AFTER_PLAYER_UPDATE } },
  });
  expectAckOk(ack, 'requestUpdateCharacter(PD)');

  await expect
    .poll(
      async () =>
        (await resync(w.dmSocket, w.table._id)).characters?.find(
          (entry) => entry._id === w.playerCharacter._id,
        )?.currentPD,
      { timeout: UI_TIMEOUT_MS },
    )
    .toBe(PD_AFTER_PLAYER_UPDATE);

  const after = await resync(w.dmSocket, w.table._id);
  expect(after.revision, 'Alterar PD precisa incrementar a revisão.').toBeGreaterThan(before.revision);

  await expect
    .poll(() => readRevision(playerPage!, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(after.revision);
  await expect(pdBadge).toContainText(`PD ${PD_AFTER_PLAYER_UPDATE}`, { timeout: UI_TIMEOUT_MS });
  await expect
    .poll(() => displayVitals(tvPage!, PLAYER_TOKEN_NAME), { timeout: UI_TIMEOUT_MS })
    .toMatch(new RegExp(`PD[^\\d]*${PD_AFTER_PLAYER_UPDATE}`, 'i'));

  // Ficha completa do próprio jogador: PD atual.
  const sheet = await openPlayerCharacterSheet(playerPage!);
  const op2 = sheet.locator('.op2-sheet');
  await expect(op2, 'O jogador precisa abrir a própria ficha OP2 pelo token card.').toBeVisible({
    timeout: UI_TIMEOUT_MS,
  });
  await op2.getByRole('tab', { name: 'Recursos' }).click();
  await expect
    .poll(async () => readSheetNumber(op2, /^PD atual$/i), { timeout: UI_TIMEOUT_MS })
    .toBe(PD_AFTER_PLAYER_UPDATE);
  await closeSheet(playerPage!);

  // Reconexão total do celular: card, ficha e log de passo continuam corretos.
  await playerContext!.close();
  const session = await openAuthenticatedContext(browser, w.players[0], {
    width: 390,
    height: 844,
  });
  playerContext = session.context;
  playerPage = session.page;
  await playerPage.goto(`${getBaseUrl()}/play/${w.table._id}?invite=${w.table.inviteCode}`);

  const reconnectedCard = playerPage.locator('.token-card').first();
  await expect(reconnectedCard).toBeVisible({ timeout: UI_TIMEOUT_MS });
  await expect(reconnectedCard.locator('.token-card__name')).toContainText(PLAYER_CHARACTER, {
    timeout: UI_TIMEOUT_MS,
  });
  await expect
    .poll(async () => (await reconnectedCard.locator('.token-card__hp').textContent()) ?? '', {
      timeout: UI_TIMEOUT_MS,
    })
    .toMatch(new RegExp(`${OP2_STATS.currentHP}\\s*\\/\\s*${OP2_STATS.maxHP}`));
  await expect(
    reconnectedCard.locator('.token-card__resource--pd'),
    'Após reconectar, o PD atualizado precisa sobreviver ao resync.',
  ).toContainText(`PD ${PD_AFTER_PLAYER_UPDATE}`, { timeout: UI_TIMEOUT_MS });
  await expect
    .poll(() => readRevision(playerPage!, '.play-header__revision'), { timeout: UI_TIMEOUT_MS })
    .toBe(after.revision);

  const reconnectedSheet = await openPlayerCharacterSheet(playerPage);
  const reconnectedOp2 = reconnectedSheet.locator('.op2-sheet');
  await reconnectedOp2.getByRole('tab', { name: 'Recursos' }).click();
  await expect
    .poll(async () => readSheetNumber(reconnectedOp2, /^PD atual$/i), { timeout: UI_TIMEOUT_MS })
    .toBe(PD_AFTER_PLAYER_UPDATE);

  const history = await fetchRolls(api, w.players[0], w.table._id);
  expect(
    history.some((roll) => roll.kind === 'step' && roll.step?.skill.key === 'luta'),
    'O histórico de passo precisa sobreviver à reconexão (§7).',
  ).toBe(true);
  await closeSheet(playerPage);
});

test('authz: ficha de outro jogador/outra mesa não rola e não cria log', async () => {
  requireContract();
  const w = world!;

  const before = await resync(w.dmSocket, w.table._id);
  const rollsBefore = await fetchRolls(api, w.dm, w.table._id);

  // Ficha do outro jogador da MESMA mesa.
  const ackOtherPlayer = await emitWithAck(w.playerSocket, 'requestRollDice', {
    tableId: w.table._id,
    table: 'lesao',
    characterId: w.otherCharacter._id,
  });
  const errorOtherPlayer = expectAckError(ackOtherPlayer, 'requestRollDice(outro jogador)');
  expect(
    errorOtherPlayer.error.code,
    'Rolar a ficha de outro jogador precisa ser FORBIDDEN (REALTIME_PROTOCOL §10).',
  ).toBe('FORBIDDEN');

  // Ficha de OUTRA mesa.
  const ackOtherTable = await emitWithAck(w.playerSocket, 'requestRollDice', {
    tableId: w.table._id,
    table: 'trauma',
    characterId: w.tableBCharacterId,
  });
  const errorOtherTable = expectAckError(ackOtherTable, 'requestRollDice(outra mesa)');
  expect(
    errorOtherTable.error.code,
    'Rolar ficha de outra mesa precisa ser FORBIDDEN (REALTIME_PROTOCOL §10).',
  ).toBe('FORBIDDEN');

  const after = await resync(w.dmSocket, w.table._id);
  expect(after.revision, 'Ação rejeitada não pode incrementar a revisão.').toBe(before.revision);

  const rollsAfter = await fetchRolls(api, w.dm, w.table._id);
  expect(rollsAfter.length, 'Ação rejeitada não pode criar Roll.').toBe(rollsBefore.length);
  expect(
    rollsAfter.some((roll) => roll.tableResult?.table === 'lesao' && roll.characterId === w.otherCharacter._id),
  ).toBe(false);
});

test('smoke OPSH: ficha, Profissão, recursos PE/SAN e teste Nd20kh1', async () => {
  requireContract();
  const w = world!;

  const fromRest = await fetchTableCharacters(api, w.dm, w.table._id);
  const persisted = fromRest.find((character) => character._id === w.opshCharacter._id);
  expect(persisted, 'A ficha OPSH precisa persistir na mesa.').toBeTruthy();
  expect(persisted!.systemKey).toBe(OPSH_KEY);
  expect(persisted!.attributes).toMatchObject({
    agilidade: 2,
    forca: 3,
    intelecto: 2,
    presenca: 2,
    vigor: 1,
  });
  expect(Object.keys(persisted!.skills ?? {}).length).toBeGreaterThanOrEqual(25);
  expect(persisted!.profile).toMatchObject({
    classe: 'especialista',
    origem: 'Acadêmico',
    nex: '45%',
    profissao: 'psicólogo',
    trilha: 'Médico',
  });
  expect(persisted!.stats).toMatchObject({
    currentHP: 18,
    maxHP: 18,
    defense: 12,
    currentPE: 7,
    maxPE: 7,
    currentSAN: 16,
    maxSAN: 20,
  });
  expect(persisted!.sanityMode).toBe('san');
  expect(persisted!.progressionMode).toBe('nex');
  expect(persisted!.injuries?.[0]).toMatchObject({
    attribute: 'agilidade',
    penalty: -1,
    note: 'Sem pé',
  });
  expect(persisted!.rituals?.[0]).toMatchObject({ name: 'Oração', circle: '1º', cost: '2 PE' });

  const sheet = await openDmCharacterSheet(dmPage!, OPSH_TOKEN_NAME);
  const opsh = sheet.locator('.opsh-sheet');
  await expect(
    opsh,
    'A ficha OPSH precisa renderizar `.opsh-sheet` (docs/ORDEM_PARANORMAL.md §5/§6).',
  ).toBeVisible({ timeout: UI_TIMEOUT_MS });

  await expect(opsh.getByLabel('Profissão (perícia)')).toHaveValue('psicólogo');
  await expect(opsh.getByLabel(/^NEX$/i)).toHaveValue('45%');

  await opsh.getByRole('tab', { name: 'Recursos' }).click();
  expect(await readSheetNumber(opsh, /^PE atual$/i)).toBe(7);
  expect(await readSheetNumber(opsh, /^SAN atual$/i)).toBe(16);
  // O `hint` da Defesa entra no nome acessível do campo; ancoramos só no início.
  expect(await readSheetNumber(opsh, /^Defesa/i)).toBe(12);

  await opsh.getByRole('tab', { name: 'Atributos & Perícias' }).click();
  const rolled = waitForEvent<RollPayload>(
    w.dmSocket,
    'diceRolled',
    (payload) => payload?.tableId === w.table._id && payload?.characterId === w.opshCharacter._id,
  );
  await opsh.getByRole('button', { name: 'Rolar Luta' }).click();
  const payload = await rolled;

  expect(payload.kind, 'Testes do OPSH usam o motor de expressão livre.').toBe('expression');
  expect(payload.expression, 'OPSH rola Nd20kh1 + bônus de treino (§5.4).').toMatch(/^\d+d20kh1\+\d+$/);
  expect(payload.expression, 'Força 3 precisa virar pool de 3d20.').toMatch(/^3d20kh1\+/);
  expect(payload.rolls.filter((roll) => roll.kept === 'kept').length).toBeGreaterThanOrEqual(1);

  const history = await fetchRolls(api, w.dm, w.table._id);
  expect(
    history.some(
      (roll) => roll.expression === payload.expression && roll.characterId === w.opshCharacter._id,
    ),
    'O teste OPSH precisa persistir no log.',
  ).toBe(true);

  await closeSheet(dmPage!);
});
