import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3100';
const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

/** Imagem local do `public/` — determinística e sem dependência de rede. */
const SCENE_IMAGE_URL = `${baseUrl}/media/paused.jpg`;

async function registerUser(api: APIRequestContext, user: { username: string; email: string; password: string }) {
  const response = await api.post(`${backendUrl}/api/auth/register`, {
    data: {
      username: user.username,
      email: user.email,
      password: user.password,
    },
  });
  const allowedCodes = [201, 400]; // 400 caso o usuário já exista de execuções anteriores
  if (!allowedCodes.includes(response.status())) {
    throw new Error(`Falha ao registrar ${user.email}: ${response.status()} ${await response.text()}`);
  }
}

/** Login pela UI nova: um único campo `#identifier` aceita usuário ou e-mail. */
async function loginByUi(page: Page, identifier: string, password: string) {
  await page.goto(`${baseUrl}/login`);
  await page.fill('#identifier', identifier);
  await page.fill('#password', password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/tables', { timeout: 30_000 });
}

interface TableDto {
  _id: string;
  name: string;
  inviteCode: string;
  dm: { _id: string; username?: string } | string;
}

async function fetchTableByName(api: APIRequestContext, token: string, tableName: string): Promise<TableDto> {
  const response = await api.get(`${backendUrl}/api/tables/mytables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    throw new Error(`Falha ao buscar mesas via API: ${response.status()} ${await response.text()}`);
  }
  const tables = (await response.json()) as TableDto[];
  const table = tables.find((entry) => entry.name === tableName);
  if (!table) throw new Error(`Mesa "${tableName}" não encontrada na API do Mestre.`);
  return table;
}

test('DM e jogador percorrem o fluxo principal no redesign', async ({ browser, request }) => {
  test.skip(!backendUrl || !baseUrl, 'Variáveis de ambiente E2E_BASE_URL/E2E_BACKEND_URL não configuradas');

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const dm = { username: `dm-e2e-${uid}`.slice(0, 40), email: `dm-e2e-${uid}@test.dev`, password: 'Test123!' };
  const player = {
    username: `player-e2e-${uid}`.slice(0, 40),
    email: `player-e2e-${uid}@test.dev`,
    password: 'Test123!',
  };
  const tableName = `Mesa E2E ${uid}`;
  const sceneName = `Cena E2E ${uid}`;
  const tokenName = `Herói ${uid}`;
  const dmExpression = '2d6+1';
  const playerExpression = '1d20';

  await registerUser(request, dm);
  await registerUser(request, player);

  const dmContext = await browser.newContext();
  const dmPage = await dmContext.newPage();
  dmPage.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[DM][console] ${msg.text()}`);
  });
  dmPage.on('pageerror', (error) => console.error(`[DM][pageerror] ${error.message}`));

  await loginByUi(dmPage, dm.email, dm.password);

  // Lobby logado: criar mesa abre diálogo e leva o Mestre ao cockpit.
  await expect(dmPage.getByRole('heading', { name: 'Suas mesas' })).toBeVisible();
  await dmPage.getByRole('button', { name: 'Criar mesa' }).first().click();
  const createDialog = dmPage.getByRole('dialog', { name: 'Criar mesa' });
  await expect(createDialog).toBeVisible();
  await createDialog.locator('#create-table-name').fill(tableName);
  await expect(createDialog.locator('#create-table-system')).toBeVisible();
  await createDialog.getByRole('button', { name: 'Criar e abrir' }).click();
  await dmPage.waitForURL(/\/table\/[a-f0-9]{24}$/i);
  const tableId = dmPage.url().split('/').pop();
  if (!tableId) throw new Error('A URL do cockpit não trouxe o id da mesa.');

  const dmToken = await dmPage.evaluate(() => window.localStorage.getItem('authToken'));
  if (!dmToken) throw new Error('Token do Mestre não encontrado no localStorage.');

  const table = await fetchTableByName(request, dmToken, tableName);
  expect(table._id).toBe(tableId);
  const inviteLink = `${baseUrl}/play/${table._id}?invite=${table.inviteCode}`;

  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  await loginByUi(playerPage, player.username, player.password);

  // Jogador entra colando o link completo (não só o código) e cai em /play.
  await expect(playerPage.getByRole('heading', { name: 'Suas mesas' })).toBeVisible();
  await playerPage.getByRole('button', { name: 'Entrar com código' }).first().click();
  const joinDialog = playerPage.getByRole('dialog', { name: 'Entrar com código' });
  await expect(joinDialog).toBeVisible();
  await joinDialog.locator('#join-table-code').fill(inviteLink);
  await joinDialog.getByRole('button', { name: 'Entrar na mesa' }).click();
  await playerPage.waitForURL(`**/play/${table._id}`);

  // Cena em um passo: imagem, grade e "Ativar ao criar" (marcado por padrão).
  const sceneForm = dmPage.locator('.create-scene-form');
  await expect(sceneForm).toBeVisible({ timeout: 60_000 });
  await sceneForm.locator('#scene-name').fill(sceneName);
  await sceneForm.locator('#scene-image-url').fill(SCENE_IMAGE_URL);
  await sceneForm.locator('#scene-columns').fill('12');
  await sceneForm.locator('#scene-rows').fill('8');
  await sceneForm.locator('#scene-scale').fill('1.5');
  const activateOnCreate = sceneForm.locator('.scene-check input[type="checkbox"]');
  await expect(activateOnCreate, 'A cena nova precisa entrar ativa por padrão.').toBeChecked();

  const createSceneResponse = dmPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(`/api/tables/${table._id}/scenes`),
    { timeout: 30_000 },
  );
  await sceneForm.getByRole('button', { name: 'Criar cena' }).click();
  expect((await createSceneResponse).status()).toBe(201);

  const sceneEntry = dmPage.locator('.scene-list li', { hasText: sceneName }).first();
  await expect(sceneEntry).toBeVisible({ timeout: 20_000 });
  await expect(sceneEntry, 'A cena criada já é ativa: não há segundo clique em "Ativar".').toHaveClass(
    /active-scene/,
  );
  await expect(dmPage.locator('.scene-switch__name')).toContainText(sceneName);

  await expect(dmPage.locator('.grid-square').first()).toBeVisible({ timeout: 30_000 });

  // Sessão no menu do cockpit.
  await dmPage.locator('.session-menu__summary').click();
  await dmPage.getByRole('menuitem', { name: 'Iniciar sessão' }).click();
  const dmTransitionOverlay = dmPage.locator('.transition-overlay');
  if ((await dmTransitionOverlay.count()) > 0) {
    await dmTransitionOverlay.waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
  }

  await expect(playerPage.locator('.play-header__title')).toHaveText(tableName, { timeout: 30_000 });
  await expect(playerPage.locator('.grid-square').first()).toBeVisible({ timeout: 30_000 });

  // Antes do vínculo: o jogador vê o estado vazio com CTAs, nunca tela morta
  // (o overlay de "personagem no tabuleiro" cobre o board até existir token).
  await expect(playerPage.locator('.session-overlay .player-empty')).toBeVisible({ timeout: 20_000 });

  // DM coloca o token pelo botão do rail e clicando num quadrado do mapa
  // (o clique não pode ser engolido pelo pan do viewport).
  await dmPage.locator('.rail-add').click();
  await expect(dmPage.locator('.placement-banner')).toBeVisible();
  await dmPage.locator('.grid-square').nth(20).click();
  const tokenForm = dmPage.locator('.token-form');
  await expect(tokenForm).toBeVisible();
  await tokenForm.locator('#token-name').fill(tokenName);
  await tokenForm.locator('#token-movement').fill('60');
  await tokenForm.locator('#token-owner').selectOption({ label: player.username });
  await tokenForm.getByRole('button', { name: 'Criar', exact: true }).click();

  const dmTokenLocator = dmPage.locator('.token').first();
  await expect(dmTokenLocator).toBeVisible({ timeout: 20_000 });

  // Jogador: some o vazio, aparece o card e a linha de iniciativa.
  await expect(playerPage.locator('.player-empty')).toBeHidden({ timeout: 20_000 });
  await expect(playerPage.locator('.token-card')).toBeVisible({ timeout: 20_000 });
  await expect(playerPage.locator('.initiative-line')).toBeVisible({ timeout: 20_000 });

  // Aba Iniciativa do painel dockado lista o token.
  await dmPage.locator('.rail-tab', { hasText: 'Iniciativa' }).click();
  await expect(dmPage.locator('.dm-panel .initiative-panel .entry', { hasText: tokenName })).toBeVisible({
    timeout: 20_000,
  });

  await dmPage.evaluate(() => {
    const panel = document.querySelector('.dm-panel') as HTMLElement | null;
    if (panel) panel.style.pointerEvents = 'none';
  });

  const dmInitialBox = await dmTokenLocator.boundingBox();
  const targetSquare = dmPage.locator('.grid-square').nth(25);
  await dmTokenLocator.dragTo(targetSquare);

  await expect
    .poll(async () => (await dmTokenLocator.boundingBox())?.x ?? 0, { timeout: 25_000 })
    .not.toBe(dmInitialBox?.x ?? 0);

  await dmPage.evaluate(() => {
    const panel = document.querySelector('.dm-panel') as HTMLElement | null;
    if (panel) panel.style.pointerEvents = '';
  });

  const nextTurnButton = dmPage.locator('.dm-panel .initiative-panel .next-btn').first();
  await expect(nextTurnButton).toBeVisible({ timeout: 20_000 });
  await nextTurnButton.click();

  const dmDiceRoller = dmPage.locator('.dm-panel .dice-roller').first();
  await expect(dmDiceRoller).toBeVisible({ timeout: 10_000 });
  await dmDiceRoller.getByLabel('Expressão').fill(dmExpression);
  await dmDiceRoller.getByRole('button', { name: 'Rolar', exact: true }).first().click();

  // O overlay assinatura do dado bloqueia o board; fecha antes de seguir.
  await dmPage
    .locator('.dice-slip__close')
    .click({ timeout: 3_000 })
    .catch(() => undefined);

  await dmPage.locator('.log-toggle-btn').click();
  await expect(dmPage.locator('.log-entry[data-type="roll"]', { hasText: dmExpression })).toBeVisible({
    timeout: 20_000,
  });

  // Jogador rola pela aba Dados; o histórico recente aparece no próprio painel
  // e o /play não usa o toggle antigo de histórico.
  await expect(playerPage.locator('.log-toggle-btn')).toHaveCount(0);
  await playerPage.locator('.player-nav [data-tab="dados"]').click();
  const diceTray = playerPage.locator('.dice-tray');
  await expect(diceTray).toBeVisible({ timeout: 20_000 });
  await diceTray.locator('#dice-expression').fill(playerExpression);
  await diceTray.locator('.dice-tray__roll').click();
  await expect(diceTray.locator('.dice-tray__recent')).toContainText(playerExpression, {
    timeout: 20_000,
  });
  // O momento assinatura fecha a aba Dados para ficar acionável sobre o board;
  // o resultado continua no histórico recente quando a aba reabrir.
  await expect(playerPage.locator('.dice-moment')).toBeVisible({ timeout: 20_000 });
  await expect(playerPage.locator('.dice-slip__total-value')).not.toBeEmpty();

  await dmContext.close();
  await playerContext.close();
});
