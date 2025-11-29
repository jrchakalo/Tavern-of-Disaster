import type { FullConfig } from '@playwright/test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import waitOn from 'wait-on';
import { spawn, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const backendDir = path.join(repoRoot, 'backend');
const frontendDir = path.join(repoRoot, 'frontend');

async function waitForResource(resource: string) {
  await waitOn({
    resources: [resource],
    timeout: 60_000,
    interval: 500,
    reverse: false,
    tcpTimeout: 10_000,
    window: 1_000,
  });
}

function spawnProcess(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, label: string): ChildProcess {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('exit', (code: number | null) => {
    if (code !== 0) {
      console.error(`[e2e] Processo ${label} finalizado com código ${code}`);
    }
  });
  return child;
}

export default async function globalSetup(_config: FullConfig) {
  const backendPort = Number(process.env.E2E_BACKEND_PORT ?? 3100);
  const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 4173);
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const baseUrl = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${frontendPort}`;

  const mongo = await MongoMemoryServer.create();
  const mongoUri = mongo.getUri();

  const processes: ChildProcess[] = [];

  const backendEnv = {
    ...process.env,
    PORT: String(backendPort),
    NODE_ENV: 'test',
    JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-secret',
    MONGO_URI: mongoUri,
  };
  processes.push(spawnProcess('npm', ['run', 'start:test'], backendDir, backendEnv, 'backend'));
  await waitForResource(`tcp:127.0.0.1:${backendPort}`);

  const frontendEnv = {
    ...process.env,
    VITE_API_URL: backendUrl,
    VITE_SOCKET_URL: backendUrl,
    NODE_ENV: 'development',
  };
  processes.push(spawnProcess('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(frontendPort)], frontendDir, frontendEnv, 'frontend'));
  await waitForResource(`http-get://127.0.0.1:${frontendPort}`);

  process.env.E2E_BASE_URL = baseUrl;
  process.env.E2E_BACKEND_URL = backendUrl;

  return async () => {
    await mongo.stop();
    await Promise.all(
      processes.map(async (child) => {
        if (!child.killed) {
          await new Promise((resolve) => {
            child.once('exit', resolve);
            child.kill('SIGTERM');
            setTimeout(() => {
              if (!child.killed) child.kill('SIGKILL');
            }, 5_000);
          });
        }
      })
    );
  };
}
