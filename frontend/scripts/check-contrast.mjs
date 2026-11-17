#!/usr/bin/env node
/**
 * Guarda de contraste dos tokens do design system.
 *
 * Lê os tokens hex de `src/assets/main.css` e valida os pares que carregam
 * informação (texto, controles, foco) contra WCAG 2.1 AA:
 *   - texto normal: >= 4.5:1
 *   - texto grande (>= 24px ou 18.66px bold): >= 3:1
 *   - bordas de controle / ícones informativos: >= 3:1
 *
 * Uso: `npm run check:contrast` (falha com exit 1 e lista os pares reprovados).
 * Sem dependências; roda em Node 18+.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'src/assets/main.css'), 'utf8');

/** Extrai `--token: #rrggbb;` do primeiro bloco :root. */
function readTokens(source) {
  const tokens = new Map();
  const re = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g;
  for (const match of source.matchAll(re)) {
    if (!tokens.has(match[1])) tokens.set(match[1], match[2].toLowerCase());
  }
  return tokens;
}

function luminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const tokens = readTokens(css);
if (tokens.size < 20) {
  console.error(`Não encontrei os tokens em main.css (${tokens.size} encontrados).`);
  process.exit(1);
}

/**
 * Pares obrigatórios. `min` segue WCAG: 4.5 texto, 3.0 UI/controle/foco.
 * Superfícies escuras usadas no produto: ink, panel, raised, raised-2.
 */
const SURFACES = ['ink-0', 'panel', 'raised', 'raised-2', 'paper'];
const TEXT = ['text', 'text-muted', 'accent-ink', 'danger-ink', 'success-ink', 'manila'];

const checks = [];
for (const surface of SURFACES) {
  for (const text of TEXT) {
    // Sobre paper, o texto legível é tinta escura; a tinta clara é um realce
    // decorativo que não deve ser usado em corpo de texto.
    if (surface === 'paper' && !['ink-0', 'accent', 'danger', 'success'].includes(text)) continue;
    checks.push({ fg: text, bg: surface, min: 4.5, label: 'texto' });
  }
  // Bordas de controle e foco precisam de 3:1 nas superfícies escuras.
  if (surface === 'paper') continue;
  for (const ui of ['line-strong', 'focus']) {
    checks.push({ fg: ui, bg: surface, min: 3, label: 'UI' });
  }
  // Cores de preenchimento (accent/danger/success) são validadas no par
  // preenchido + `on-*`; como traço fino, só precisam de 3:1 nas superfícies
  // base (ink/panel), não sobre painéis elevados.
  for (const ui of ['accent', 'danger', 'success']) {
    if (!['ink-0', 'panel'].includes(surface)) continue;
    checks.push({ fg: ui, bg: surface, min: 3, label: 'UI' });
  }
}

let failures = 0;
const rows = [];
for (const { fg, bg, min, label } of checks) {
  const fgHex = tokens.get(fg);
  const bgHex = tokens.get(bg);
  if (!fgHex || !bgHex) continue;
  // Texto claro só é exigido sobre superfícies escuras; sobre paper o par
  // correto é ink-0, validado abaixo.
  if (bg === 'paper' && !['ink-0', 'accent', 'danger', 'success'].includes(fg)) continue;
  const value = contrast(fgHex, bgHex);
  const ok = value >= min;
  if (!ok) failures += 1;
  rows.push({ pair: `${fg} sobre ${bg}`, value, min, ok, label });
}

// Texto escuro sobre paper (handout/QR) e sobre os botões preenchidos.
const filled = [
  ['ink-0', 'paper'],
  ['ink-0', 'manila'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
  ['on-danger', 'danger'],
  ['on-success', 'success'],
  ['on-manila', 'manila'],
];
for (const [fg, bg] of filled) {
  const fgHex = tokens.get(fg);
  const bgHex = tokens.get(bg);
  if (!fgHex || !bgHex) continue;
  const value = contrast(fgHex, bgHex);
  const ok = value >= 4.5;
  if (!ok) failures += 1;
  rows.push({ pair: `${fg} sobre ${bg}`, value, min: 4.5, ok, label: 'texto em botão' });
}

rows.sort((a, b) => a.value - b.value);
for (const row of rows) {
  const status = row.ok ? 'ok  ' : 'FAIL';
  console.log(`${status} ${row.value.toFixed(2)}:1  ${row.pair}  (mín ${row.min}, ${row.label})`);
}

if (failures > 0) {
  console.error(`\n${failures} par(es) abaixo do mínimo WCAG AA.`);
  process.exit(1);
}
console.log(`\nTodos os ${rows.length} pares passam WCAG AA.`);
