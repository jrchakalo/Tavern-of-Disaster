/**
 * Gate de acessibilidade (axe) das rotas do redesign.
 *
 * Independe dos outros mundos: registra usuários via REST, cria mesa/cena/token
 * com Socket.IO e roda `@axe-core/playwright` com as tags WCAG 2.1 A/AA.
 * Falha somente em `critical`/`serious`; imprime todas as violações para o log.
 */
import { test, expect, request as playwrightRequest, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { io } from 'socket.io-client';

const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3100';
const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['critical', 'serious']);

type TestUser = { username: string; email: string; password: string; token: string };

type World = {
  dm: TestUser;
  player: TestUser;
  tableId: string;
  inviteCode: string;
  displayToken: string;
};

let api: APIRequestContext;
let world: World;

async function register(api2: APIRequestContext, prefix: string, suffix: string): Promise<TestUser> {
  const username = `${prefix}-${suffix}`.slice(0, 50);
  const email = `${prefix}-${suffix}@a11y.test`;
  const password = 'Test123!';
  const registerResponse = await api2.post(`${backendUrl}/api/auth/register`, {
    data: { username, email, password },
  });
  if (registerResponse.status() !== 201) {
    throw new Error(`register ${email}: ${registerResponse.status()} ${await registerResponse.text()}`);
  }
  const login = await api2.post(`${backendUrl}/api/auth/login`, {
    data: { identifier: username, password },
  });
  if (!login.ok()) throw new Error(`login ${username}: ${login.status()} ${await login.text()}`);
  const body = (await login.json()) as { token?: string };
  if (!body.token) throw new Error(`login ${username} sem token.`);
  return { username, email, password, token: body.token };
}

function connectSocket(token: string): Promise<Awaited<ReturnType<typeof io>>> {
  return new Promise((resolve, reject) => {
    const socket = io(backendUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => reject(new Error('socket timeout')), 10_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test.beforeAll(async () => {
  api = await playwrightRequest.newContext();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const dm = await register(api, 'a11y-dm', suffix);
  const player = await register(api, 'a11y-p', suffix);

  const tableResponse = await api.post(`${backendUrl}/api/tables/create`, {
    headers: { Authorization: `Bearer ${dm.token}` },
    data: { name: `Mesa A11y ${suffix}` },
  });
  if (tableResponse.status() !== 201) {
    throw new Error(`create table: ${tableResponse.status()} ${await tableResponse.text()}`);
  }
  const table = (await tableResponse.json()) as { _id: string; inviteCode: string; activeScene?: string };

  const join = await api.post(`${backendUrl}/api/tables/join`, {
    headers: { Authorization: `Bearer ${player.token}` },
    data: { inviteCode: table.inviteCode },
  });
  if (!join.ok()) throw new Error(`join: ${join.status()} ${await join.text()}`);

  const socket = await connectSocket(dm.token);
  await new Promise<void>((resolve) => socket.emit('joinTable', { tableId: table._id }, () => resolve()));
  await new Promise<void>((resolve) =>
    socket.emit(
      'requestPlaceToken',
      {
        tableId: table._id,
        sceneId: table.activeScene,
        squareId: 'sq-5',
        name: 'Herói A11y',
        size: 'Pequeno/Médio',
        movement: 9,
      },
      () => resolve(),
    ),
  );
  await new Promise<void>((resolve) =>
    socket.emit('requestUpdateSessionStatus', { tableId: table._id, newStatus: 'LIVE' }, () => resolve()),
  );
  socket.close();

  const display = await api.post(`${backendUrl}/api/tables/${table._id}/display-token`, {
    headers: { Authorization: `Bearer ${dm.token}` },
  });
  if (!display.ok()) throw new Error(`display-token: ${display.status()} ${await display.text()}`);
  const displayBody = (await display.json()) as { token: string };

  world = {
    dm,
    player,
    tableId: table._id,
    inviteCode: table.inviteCode,
    displayToken: displayBody.token,
  };
});

test.afterAll(async () => {
  await api?.dispose();
});

async function analyze(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
  if (summary.length) {
    console.log(`[axe] ${label}: ${summary.length} violação(ões)`);
    for (const violation of summary) {
      console.log(`  - ${violation.impact} ${violation.id}: ${violation.help} :: ${violation.targets.join(' | ')}`);
    }
  }
  const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ''));
  expect(
    blocking.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((n) => n.target) })),
    `axe ${label} não pode ter violações critical/serious (${results.violations.length} no total).`,
  ).toEqual([]);
}

async function newPage(
  browser: Browser,
  user: TestUser | null,
  viewport: { width: number; height: number },
): Promise<Page> {
  const context = await browser.newContext({ viewport });
  if (user) {
    await context.addInitScript((token: string) => window.localStorage.setItem('authToken', token), user.token);
  }
  return context.newPage();
}

async function gotoReady(page: Page, path: string, readySelector?: string): Promise<void> {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
  if (readySelector) await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(400);
}

async function audit(
  browser: Browser,
  label: string,
  path: string,
  readySelector: string,
  options: { user?: TestUser | null; viewport?: { width: number; height: number } } = {},
): Promise<void> {
  const page = await newPage(browser, options.user ?? null, options.viewport ?? { width: 1440, height: 900 });
  try {
    await gotoReady(page, path, readySelector);
    await analyze(page, label);
  } finally {
    await page.context().close();
  }
}

for (const route of [
  { label: '/ (landing)', path: '/', ready: '.landing-hero' },
  { label: '/login', path: '/login', ready: '#identifier' },
  { label: '/register', path: '/register', ready: '#username' },
  { label: '/systems', path: '/systems', ready: 'main#conteudo' },
] as const) {
  test(`axe: ${route.label}`, async ({ browser }) => {
    await audit(browser, route.label, route.path, route.ready);
  });
}

for (const route of [
  { label: '/tables (lobby)', path: '/tables', ready: '.tables-page' },
] as const) {
  test(`axe: ${route.label} autenticado`, async ({ browser }) => {
    await audit(browser, route.label, route.path, route.ready, { user: world.dm });
  });
}

test('axe: /table/:id (Mestre)', async ({ browser }) => {
  await audit(browser, '/table/:id', `/table/${world.tableId}`, '.cockpit-topbar', {
    user: world.dm,
  });
});

test('axe: /play/:id (Jogador)', async ({ browser }) => {
  await audit(browser, '/play/:id', `/play/${world.tableId}`, '.play-header', {
    user: world.player,
    viewport: { width: 390, height: 844 },
  });
});

test('axe: /display/:id (TV)', async ({ browser }) => {
  const page = await newPage(browser, null, { width: 1920, height: 1080 });
  try {
    await page.goto(`${baseUrl}/display/${world.tableId}#token=${world.displayToken}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('.display-header').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(600);
    const exposedRev = await page.evaluate(
      () => document.querySelectorAll('.display-header__revision:not(.sr-only)').length,
    );
    expect(exposedRev, 'rev da TV não pode ficar visível.').toBe(0);
    await analyze(page, '/display/:id');
  } finally {
    await page.context().close();
  }
});
