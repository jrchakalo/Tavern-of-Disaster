#!/usr/bin/env node
/**
 * Harness de release do beta: roda o playtest simulado completo, sem pessoas e
 * sem segredos externos.
 *
 *   1. Playwright E2E mono-worker (presencial + online, mídia falsa)
 *   2. Caos headless de 6 clientes
 *
 * Uso:
 *   node scripts/beta-playtest.mjs
 *
 * Resumo JSON: test-results/beta-playtest.json (ignorado pelo Git).
 * Código de saída: 0 se tudo passou; 1 se qualquer etapa falhou.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const E2E_DIR = path.join(REPO_ROOT, 'tests', 'e2e');
const RESULTS_DIR = path.join(REPO_ROOT, 'test-results');
const SUMMARY_PATH = path.join(RESULTS_DIR, 'beta-playtest.json');

const isWindows = process.platform === 'win32';
const playwrightBin = path.join(E2E_DIR, 'node_modules', '.bin', isWindows ? 'playwright.cmd' : 'playwright');
const hasLocalPlaywright = existsSync(playwrightBin);

const steps = [
  {
    name: 'playwright-e2e',
    command: hasLocalPlaywright ? playwrightBin : isWindows ? 'npx.cmd' : 'npx',
    args: hasLocalPlaywright ? ['test', '--workers=1'] : ['playwright', 'test', '--workers=1'],
    cwd: E2E_DIR,
  },
  {
    name: 'chaos',
    command: process.execPath,
    args: ['chaos/run.mjs'],
    cwd: E2E_DIR,
  },
];

const startedAt = new Date();
const results = [];

for (const step of steps) {
  const stepStartedAt = Date.now();
  console.log(`\n[beta-playtest] === ${step.name} ===`);
  console.log(`[beta-playtest] $ ${step.command} ${step.args.join(' ')}`);

  const outcome = spawnSync(step.command, step.args, {
    cwd: step.cwd,
    env: process.env,
    stdio: 'inherit',
  });

  const durationMs = Date.now() - stepStartedAt;
  const exitCode = typeof outcome.status === 'number' ? outcome.status : 1;
  const error = outcome.error ? outcome.error.message : null;

  if (outcome.signal) {
    console.error(`[beta-playtest] ${step.name}: encerrado por sinal ${outcome.signal}.`);
  }
  if (error) {
    console.error(`[beta-playtest] ${step.name}: ${error}`);
  }

  results.push({
    name: step.name,
    command: [step.command, ...step.args].join(' '),
    cwd: path.relative(REPO_ROOT, step.cwd) || '.',
    exitCode,
    signal: outcome.signal ?? null,
    durationMs,
    error,
  });

  console.log(
    `[beta-playtest] ${step.name}: exit=${exitCode} (${(durationMs / 1000).toFixed(1)}s)`,
  );
}

const finishedAt = new Date();
const failed = results.filter((step) => step.exitCode !== 0);
const summary = {
  generatedAt: finishedAt.toISOString(),
  startedAt: startedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  result: failed.length === 0 ? 'PASS' : 'FAIL',
  steps: results,
};

try {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`\n[beta-playtest] resumo: ${SUMMARY_PATH}`);
} catch (error) {
  console.error(
    `[beta-playtest] falha ao escrever o resumo: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

if (failed.length > 0) {
  console.error(
    `[beta-playtest] FALHOU (${failed.map((step) => step.name).join(', ')}). ` +
      'Veja o resumo JSON e os relatórios do Playwright/caos.',
  );
  process.exitCode = 1;
} else {
  console.log('[beta-playtest] PASS: E2E + caos verdes.');
}
