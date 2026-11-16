# Fase 6 — Operação e beta simulado

> Status: **pré-beta local concluído** (2026-11-16); deploy externo e smoke
> online pendentes de contas/credenciais. Branch: `restore/phase-6-beta-ops`.
> Objetivo: operar o beta 100% grátis com saúde observável, deploy reproduzível,
> backup, CI e um playtest simulado que substitui a mesa real.

## 1. Decisões

| Tema | Decisão |
|---|---|
| Frontend | Vercel Hobby (build Vite, rewrite SPA) |
| Backend | Render free web service + keep-alive; Docker também funciona |
| Banco | MongoDB Atlas M0 (512 MB) com TTL de rolagens/chat |
| Storage | Supabase free (1 GB) ou `local` para Docker/VPS |
| TURN | Metered Open Relay free (20 GB/mês), env estático no beta |
| CI | GitHub Actions: backend, frontend, E2E (fake media) e caos |
| Release | `v1.0.0-beta` **somente após** deploy externo + smoke online |

O deploy externo real depende de contas/credenciais do usuário. Tudo abaixo pode
ser preparado e testado localmente antes disso.

## 2. Health e observabilidade

- `GET /health` → `200 {status:'ok', uptimeSeconds, version}`; não toca o banco.
- `GET /ready` → `200` só quando o Mongo responde a `ping`; `503` caso contrário.
- `GET /metrics` → JSON de métricas; em produção exige
  `Authorization: Bearer $METRICS_TOKEN` ou `?token=`. Sem token configurado,
  responde `404` em produção e fica aberto em desenvolvimento/teste.
- Logs JSON (pino) com `LOG_LEVEL`; nunca logar SDP/ICE, JWT, senhas, credenciais
  TURN ou tokens de display.
- Shutdown gracioso: `SIGTERM`/`SIGINT` fecha HTTP/Socket.IO/Mongoose.
- Docker: healthcheck em `/health`.
- Render: health check em `/health`; keep-alive externo a cada 10 min.

## 3. Variáveis de ambiente

### Backend (mínimo)

```text
NODE_ENV=production
PORT=3001
MONGO_URI=<Atlas M0>
JWT_SECRET=<segredo forte>
CORS_ORIGIN=https://<app>.vercel.app
PUBLIC_APP_URL=https://<app>.vercel.app
STORAGE_DRIVER=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=...
ASSET_BASE_URL=            # vazio = /uploads no proxy; bucket = URL pública
TABLE_STORAGE_QUOTA_BYTES=209715200
LOG_LEVEL=info
METRICS_TOKEN=<segredo>
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_URLS=turn:<host>:443?transport=tcp,turn:<host>:443?transport=udp
TURN_USERNAME=...
TURN_CREDENTIAL=...
MEDIA_MAX_PEERS=8
```

### Frontend (Vercel)

```text
# Produção na Vercel: origem absoluta do backend Render.
# Sem isso, /api, /socket.io e /uploads cairiam na Vercel e retornariam index.html.
VITE_API_URL=https://<servico>.onrender.com
VITE_PROXY_TARGET=         # usado só no Vite dev (mesma origem)
```

Em Docker/Nginx a mesma origem funciona e `VITE_API_URL` pode ficar vazio.

### Docker local

`docker compose up --build` sobe Mongo + backend + frontend em `:8080`, com
storage local persistido em volume. Para expor à internet, usar Cloudflare
Tunnel ou um VPS; Render não hospeda TURN/coturn.

## 4. Deploy passo a passo (quando houver contas)

1. **Atlas M0**: criar cluster, usuário de aplicação, liberar `0.0.0.0/0` (beta)
   e copiar a URI `mongodb+srv://.../tavern_of_disaster`.
2. **Supabase**: criar projeto, bucket público `tavern-assets`, copiar URL,
   service role key e bucket. Definir `ASSET_BASE_URL` com a URL pública do
   bucket ou deixar vazio se usar o proxy do backend.
3. **Render**: criar Web Service a partir do `render.yaml`, definir os secrets
   do backend, health check `/health`, região mais próxima. O free tier dorme;
   configurar keep-alive externo (cron-job.org/UptimeRobot) em `/health`.
4. **Vercel**: importar o repositório, root `frontend`, build `npm run build`,
   output `dist`; definir **`VITE_API_URL=https://<servico>.onrender.com`** no
   build (o `vercel.json` é só SPA fallback; não há proxy de `/api`/`/socket.io`
   na Vercel). Configurar `CORS_ORIGIN`/`PUBLIC_APP_URL` no Render com a origem
   da Vercel. HTTPS é obrigatório para mídia.
5. **TURN**: criar conta Metered Open Relay, copiar URL/username/credential para
   o Render. Sem TURN o app funciona em LAN/STUN e avisa o usuário.
6. **Smoke online**: abrir mesa, TV, 2 celulares, chamada de áudio, chat,
   upload de mapa e reconexão. Só então criar `v1.0.0-beta`.

## 5. Backup e restauração (Atlas M0)

- Backup manual diário/semanal com `mongodump` (MongoDB Database Tools):
  `scripts/backup-mongo.sh` lê `MONGO_URI` e grava um arquivo `.gz`.
- Guardar fora do repositório (drive pessoal/S3 free). Nunca commitar dump.
- Restauração: `mongorestore --gzip --archive=<arquivo>` com o cluster vazio.
- Testar restauração em um cluster descartável antes do beta.
- TTLs: `Roll` 7 dias e `ChatMessage` 7 dias reduzem o tamanho do M0.

## 6. CI

`.github/workflows/ci.yml` roda backend (test/build), frontend
(test/type-check/build) e E2E com Playwright/Chromium e fake media. O job de
caos roda `node chaos/run.mjs`. Nenhum segredo é necessário para CI; Atlas,
Supabase e TURN ficam só no deploy.

## 7. Playtest simulado

O harness de release roda, sem pessoas:

```bash
cd tests/e2e
E2E_CHANNEL=chrome npx playwright test --workers=1
node chaos/run.mjs
```

Cenários cobertos pelas specs existentes:

- presencial: DM + 5 celulares + TV, QR, turnos, reconexão, loop de 60 min;
- fichas/dados D&D, OP2 e OPSH;
- mídia/cenas: upload mobile, quota, overlays persistidos, troca de cena;
- online: DM + jogadores remotos com fake mic/câmera, mute/deafen, vídeo, tela,
  chat, kick, reconexão e loop acelerado;
- caos headless de 6 clientes.

Critérios de release: suíte completa verde, caos 14/14, zero erro de console
não tratado, convergência de revisão/hash, reconexão <2 s e nenhum segredo em
log. O relatório final fica em `docs/qa/PHASE6-BETA-REPORT.md`.

## 8. Runbook rápido

| Sintoma | Ação |
|---|---|
| `/ready` 503 | verificar Atlas/IP allowlist/MONGO_URI |
| backend dormiu | abrir `/health`, keep-alive, avisar mesa |
| upload 413 | quota da mesa/limite por arquivo; limpar assets órfãos |
| chamada sem áudio | conferir HTTPS, permissões, TURN; ICE restart/rejoin |
| métricas 404 | `METRICS_TOKEN` ausente em produção (proposital) |
| roll/chat sumindo | TTL de 7 dias é esperado |
| estado divergente | `requestResync`; caos/E2E antes de release |

## 9. Critérios de aceite

- [x] `/health`, `/ready` e `/metrics` protegido funcionando; Docker healthcheck.
- [x] `render.yaml`, keep-alive e docs de deploy/Vercel/Atlas/Supabase/TURN.
- [x] Backup/restore documentado e script testável.
- [x] CI com backend, frontend, E2E fake media e caos.
- [x] Playtest simulado completo verde + relatório com evidências.
- [x] Nenhum segredo/credencial em log ou no repositório.
- [ ] `v1.0.0-beta` só após smoke externo (depende das contas do usuário).
