# Fase 6 — Operação e beta simulado: relatório

> Branch: `restore/phase-6-beta-ops`. Contrato: `docs/OPERATIONS.md`.
> Data: 2026-11-16. Veredito do PO: **pré-beta local aprovado**; deploy externo
> e smoke online pendentes de contas/credenciais.

## 1. Escopo validado localmente

- `/health`, `/ready` (ping Mongo) e `/metrics` protegido em produção
  (`METRICS_TOKEN`; 404 sem token em produção, 401 com token errado).
- Shutdown gracioso, healthcheck do Docker e do Render.
- `render.yaml` (Render free), keep-alive agendado, backup/restore, CI com
  backend, frontend, E2E fake media, caos e Docker build.
- Playtest simulado completo: E2E presencial + online + caos.
- Nenhum PDF/segredo versionado; configs YAML válidas.

## 2. Evidência de execução

| Gate | Resultado |
|---|---|
| Backend (`npm test`) | **29 suites, 238/238** |
| Backend (`npm run build`) | `tsc` limpo |
| Frontend (`npm run test:unit`) | **40 arquivos, 308/308** |
| Frontend (`npm run type-check` / build) | verdes |
| `ops-health.spec.ts` | **5/5** |
| E2E completo (12 specs) | **72/72**, 0 falhas/flaky/skips |
| Caos | **14/14 PASS**, `result: PASS` |
| Harness `scripts/beta-playtest.mjs` | **PASS**, dois passos exit 0, ~195.7 s |
| `docker compose config` + builds | OK (validado no coder ops) |

Comando do harness:

```bash
cd tests/e2e
MONGOMS_SYSTEM_BINARY=<...>/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome node scripts/beta-playtest.mjs
```

Checks operacionais:

- `bash -n scripts/backup-mongo.sh scripts/restore-mongo.sh` OK.
- `node --check scripts/keepalive.mjs scripts/beta-playtest.mjs` OK.
- `render.yaml`, `ci.yml`, `keepalive.yml` parseados com `yaml.safe_load`.
- `git ls-files references` contém apenas `references/README.md`.
- Grep de segredos: apenas placeholders/nomes de env.
- Docker: backend healthcheck `/health`; frontend depende de `service_healthy`.

## 3. Cobertura do playtest simulado

- Presencial: DM + 5 celulares + TV, QR, turnos, reconexão, loop de 60 min.
- Fichas/dados D&D 5e, OP2 e OPSH (one-shot).
- Mídia/cenas: upload mobile, quota, assets órfãos, overlays persistidos,
  troca de cena presencial/online.
- Online: DM + jogadores remotos com fake mic/câmera, mute/deafen, vídeo,
  tela, chat, kick, reconexão e loop acelerado.
- Caos headless de 6 clientes.

## 4. Correções/observações

- Gap de deploy Vercel corrigido na documentação: **`VITE_API_URL` deve apontar
  para o Render**; o `vercel.json` é apenas SPA fallback e não faz proxy de
  `/api`/`/socket.io`/`/uploads`.
- `/health` não é exposto pela origem da Vercel; monitores/keep-alive apontam
  direto para o Render, como documentado.
- Backup real (`mongodump`/`mongorestore`) não foi executado por falta das
  MongoDB Database Tools neste ambiente; scripts e caminhos de erro validados.

## 5. Pendências para `v1.0.0-beta`

1. Criar contas/credenciais: Atlas M0, Supabase (bucket + service role), Render,
   Vercel e Metered TURN.
2. Preencher os secrets no Render (ver `render.yaml` e `docs/OPERATIONS.md`).
3. Configurar `VITE_API_URL=https://<servico>.onrender.com` na Vercel.
4. Configurar keep-alive externo apontando para `/health` do Render.
5. Rodar o smoke online real: mesa + TV + 2 celulares + chamada + chat + upload
   + reconexão em HTTPS.
6. Só então criar/tag `v1.0.0-beta`.

## 6. Veredito

O beta está **pronto localmente e no CI simulado**. A única etapa não executada
é o deploy externo/smoke em produção, que depende de contas do usuário.
**Pré-beta local aprovado.**
