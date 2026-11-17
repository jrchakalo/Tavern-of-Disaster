#!/usr/bin/env node
/**
 * Valida `.env.deploy` sem imprimir segredos.
 *
 * Uso:
 *   node scripts/check-deploy-env.mjs
 *   node scripts/check-deploy-env.mjs --partial   # só lista o que falta
 *
 * Saída: OK por chave presente; lista de pendências; exit 1 se faltar algo
 * obrigatório (com --partial, exit 0).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, '.env.deploy');
const partial = process.argv.includes('--partial');

function parseEnv(text) {
  const values = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

let text = '';
try {
  text = readFileSync(FILE, 'utf8');
} catch {
  console.error('Arquivo .env.deploy não encontrado. Copie .env.deploy.example e preencha.');
  process.exit(1);
}

const env = parseEnv(text);
const required = [
  ['GITHUB_TOKEN', /^[A-Za-z0-9_]{20,}$/],
  ['MONGO_URI', /^mongodb(\+srv)?:\/\//],
  ['SUPABASE_URL', /^https:\/\/[^\s]+\.supabase\.co$/],
  ['SUPABASE_SERVICE_ROLE_KEY', /^.{20,}$/],
  ['SUPABASE_BUCKET', /^[A-Za-z0-9._-]{1,63}$/],
  ['RENDER_API_KEY', /^.{10,}$/],
  ['VERCEL_TOKEN', /^.{10,}$/],
  ['TURN_URLS', /^turn:/m],
  ['TURN_USERNAME', /^.{1,}$/],
  ['TURN_CREDENTIAL', /^.{1,}$/],
];
const optional = [
  ['RENDER_SERVICE_ID', /^\S+$/],
  ['RENDER_URL', /^https:\/\//],
  ['RENDER_HEALTH_URL', /^https:\/\//],
  ['SUPABASE_ACCESS_TOKEN', /^.{10,}$/],
  ['SUPABASE_PROJECT_REF', /^[a-z0-9]{10,}$/],
  ['JWT_SECRET', /^.{32,}$/],
  ['METRICS_TOKEN', /^.{32,}$/],
];

function check([key, pattern]) {
  const value = env.get(key) ?? '';
  if (!value) return 'ausente';
  if (!pattern.test(value)) return 'formato inválido';
  return null;
}

const missing = [];
for (const [key] of required) {
  const problem = check([key, required.find(([k]) => k === key)[1]]);
  if (problem) missing.push(`${key}: ${problem}`);
  else console.log(`ok   ${key}`);
}
for (const [key] of optional) {
  const problem = check([key, optional.find(([k]) => k === key)[1]]);
  if (problem) console.log(`pend ${key}: ${problem}`);
  else console.log(`ok   ${key}`);
}

if (missing.length === 0) {
  console.log('\nConfiguração mínima de deploy completa.');
  process.exit(0);
}
console.log(`\nPendências obrigatórias (${missing.length}):`);
for (const item of missing) console.log(`- ${item}`);
process.exit(partial ? 0 : 1);
