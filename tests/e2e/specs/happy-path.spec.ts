import { test, expect, type APIRequestContext } from '@playwright/test';

const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:3100';
const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';

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

test('DM e jogador percorrem fluxo colaborativo principal', async ({ browser, request }) => {
  test.skip(!backendUrl || !baseUrl, 'Variáveis de ambiente E2E_BASE_URL/E2E_BACKEND_URL não configuradas');

  const uid = Date.now();
  const dm = { username: `dm-e2e-${uid}`, email: `dm-e2e-${uid}@test.dev`, password: 'Test123!' };
  const player = { username: `player-e2e-${uid}`, email: `player-e2e-${uid}@test.dev`, password: 'Test123!' };
  const tableName = `Mesa E2E ${uid}`;
  const sceneName = `Cena E2E ${uid}`;
  const sceneImageUrl = `https://picsum.photos/seed/${uid}/1200/800`;
  const tokenName = `Herói ${uid}`;
  const diceExpression = '2d6+1';

  await registerUser(request, dm);
  await registerUser(request, player);

  const dmContext = await browser.newContext();
  const dmPage = await dmContext.newPage();
  dmPage.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[DM][console] ${msg.text()}`);
    }
  });
  dmPage.on('pageerror', (error) => {
    console.error(`[DM][pageerror] ${error.message}`);
  });
  await dmPage.goto(`${baseUrl}/login`);
  await dmPage.fill('#email', dm.email);
  await dmPage.fill('#password', dm.password);
  await dmPage.getByRole('button', { name: 'Entrar' }).click();
  await dmPage.waitForURL('**/');

  await dmPage.goto(`${baseUrl}/tables`);
  await dmPage.getByPlaceholder('Nome da nova mesa').fill(tableName);
  await dmPage.getByRole('button', { name: 'Criar Nova Mesa' }).click();
  const dmTableListItem = dmPage.locator('.tables-list li', { hasText: tableName }).first();
  await expect(dmTableListItem).toBeVisible();

  const dmToken = await dmPage.evaluate(() => window.localStorage.getItem('authToken'));
  if (!dmToken) {
    throw new Error('Token do mestre não encontrado no localStorage.');
  }
  const tablesResponse = await request.get(`${backendUrl}/api/tables/mytables`, {
    headers: { Authorization: `Bearer ${dmToken}` },
  });
  if (!tablesResponse.ok()) {
    throw new Error(`Falha ao buscar mesas via API: ${tablesResponse.status()} ${await tablesResponse.text()}`);
  }
  const tables = await tablesResponse.json();
  const createdTable = tables.find((table: any) => table.name === tableName);
  if (!createdTable) {
    throw new Error('Mesa recém-criada não encontrada na API do mestre.');
  }
  const inviteCode = createdTable.inviteCode as string;
  const tableId = createdTable._id as string;

  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  await playerPage.goto(`${baseUrl}/login`);
  await playerPage.fill('#email', player.email);
  await playerPage.fill('#password', player.password);
  await playerPage.getByRole('button', { name: 'Entrar' }).click();
  await playerPage.waitForURL('**/');
  await playerPage.goto(`${baseUrl}/tables`);
  await playerPage.getByPlaceholder('Código de convite da mesa').fill(inviteCode);
  await playerPage.getByRole('button', { name: 'Entrar na Mesa' }).click();
  const playerTableListItem = playerPage.locator('.tables-list li', { hasText: tableName }).first();
  await expect(playerTableListItem).toBeVisible();

  await dmTableListItem.click();
  await dmPage.waitForURL(`**/table/${tableId}`);
  await playerTableListItem.click();
  await playerPage.waitForURL(`**/table/${tableId}`);

  await dmPage.waitForTimeout(2_000);
  const sceneManagerExists = await dmPage.evaluate(() => Boolean(document.querySelector('.scene-manager')));
  console.log('Scene manager present:', sceneManagerExists);

  const sceneForm = dmPage.locator('.create-scene-form');
  await expect(sceneForm).toBeVisible({ timeout: 60_000 });
  await sceneForm.locator('input[placeholder="Nome da Cena"]').fill(sceneName);
  await sceneForm.locator('input[placeholder="URL da Imagem (Opcional)"]').fill(sceneImageUrl);
  await sceneForm.getByRole('button', { name: 'Adicionar Cena' }).click();
  const sceneEntry = dmPage.locator('.scene-list li', { hasText: sceneName }).first();
  await expect(sceneEntry).toBeVisible({ timeout: 20_000 });
  await sceneEntry.getByRole('button', { name: 'Ativar' }).click();
  await expect(sceneEntry).toHaveClass(/active-scene/);

  await expect(dmPage.locator('.grid-square').first()).toBeVisible({ timeout: 30_000 });

  const startSessionButton = dmPage.getByRole('button', { name: 'Iniciar Sessão' });
  const startSessionButtonCount = await startSessionButton.count();
  if (startSessionButtonCount > 0) {
    await startSessionButton.click();
    const dmTransitionOverlay = dmPage.locator('.transition-overlay');
    const dmTransitionOverlayCount = await dmTransitionOverlay.count();
    if (dmTransitionOverlayCount > 0) {
      await dmTransitionOverlay.waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
    }
  }

  const playerSessionOverlay = playerPage.locator('.session-overlay');
  const playerSessionOverlayCount = await playerSessionOverlay.count();
  if (playerSessionOverlayCount > 0) {
    await expect(playerSessionOverlay).toBeHidden({ timeout: 40_000 });
  }
  const playerTransitionOverlay = playerPage.locator('.transition-overlay');
  const playerTransitionOverlayCount = await playerTransitionOverlay.count();
  if (playerTransitionOverlayCount > 0) {
    await playerTransitionOverlay.waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
  }

  await expect(playerPage.locator('.grid-square').first()).toBeVisible({ timeout: 30_000 });

  await dmPage.locator('.grid-square').nth(5).click({ button: 'right' });
  await dmPage.fill('#token-name', tokenName);
  await dmPage.fill('#token-movement', '9');
  await dmPage.locator('.token-form button', { hasText: 'Criar' }).click();

  const dmTokenLocator = dmPage.locator('.token').first();
  await expect(dmTokenLocator).toBeVisible();
  await expect(dmPage.locator('.initiative-panel .entry', { hasText: tokenName })).toBeVisible();

  const playerTokenLocator = playerPage.locator('.token').first();
  await expect(playerTokenLocator).toBeVisible();
  await expect(playerPage.locator('.initiative-panel .entry', { hasText: tokenName })).toBeVisible();

  await dmPage.evaluate(() => {
    const panel = document.querySelector('.dm-panel') as HTMLElement | null;
    if (panel) {
      panel.style.pointerEvents = 'none';
    }
  });

  const dmInitialBox = await dmTokenLocator.boundingBox();
  const targetSquare = dmPage.locator('.grid-square').nth(25);
  await dmTokenLocator.dragTo(targetSquare);

  await expect
    .poll(async () => {
      const box = await dmTokenLocator.boundingBox();
      return box?.x ?? 0;
    }, { timeout: 25_000 })
    .not.toBe(dmInitialBox?.x ?? 0);

  await dmPage.evaluate(() => {
    const panel = document.querySelector('.dm-panel') as HTMLElement | null;
    if (panel) {
      panel.style.pointerEvents = '';
    }
  });

  const nextTurnButton = dmPage.locator('.dm-panel .initiative-panel .next-btn').first();
  await expect(nextTurnButton).toBeVisible({ timeout: 20_000 });
  await nextTurnButton.click();

  const dmDiceRoller = dmPage.locator('.dm-panel .dice-roller').first();
  await expect(dmDiceRoller).toBeVisible({ timeout: 10_000 });
  await dmDiceRoller.getByLabel('Expressão').fill(diceExpression);
  await dmDiceRoller.getByRole('button', { name: 'Rolar' }).first().click();

  await dmPage.locator('.log-toggle-btn').click();
  const dmRollLog = dmPage.locator('.log-entry[data-type="roll"]', { hasText: diceExpression });
  await expect(dmRollLog).toBeVisible();

  await playerPage.locator('.log-toggle-btn').click();
  const playerRollLog = playerPage.locator('.log-entry[data-type="roll"]', { hasText: diceExpression });
  await expect(playerRollLog).toBeVisible();

  await dmContext.close();
  await playerContext.close();
});
