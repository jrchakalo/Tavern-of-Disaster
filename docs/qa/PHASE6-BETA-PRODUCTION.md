# Beta em produção — evidências

> Deploy de 2026-11-16. Backend Render, frontend Vercel, Mongo Atlas, storage
> Supabase e TURN Metered.

## URLs

- App: https://tavernofdisaster.vercel.app
- API: https://tavern-of-disaster-api.onrender.com
- Health: https://tavern-of-disaster-api.onrender.com/health
- Ready: https://tavern-of-disaster-api.onrender.com/ready

## Configuração

- Render service: `srv-dbtoqd5ckfvc7392cin0`, branch `deploy/beta`.
- Atlas M0: `ping` OK; `MONGO_URI` configurado no Render.
- Supabase: bucket público `tavern-assets` (vazio no início); upload de mapa
  real via API validado.
- TURN Metered: `turnConfigured: true` no endpoint `/ice-servers`.
- CORS: origem `https://tavernofdisaster.vercel.app`.
- `PUBLIC_APP_URL`: mesma origem.
- Vercel: Node 26.x, root `frontend`, `VITE_API_URL` apontando para o Render.

## Smoke de produção

- `/health` → 200 `{status:'ok'}`.
- `/ready` → 200 `{status:'ready', db:'connected'}`.
- `/metrics` sem token → 401; com `METRICS_TOKEN` → 200 (8 contadores).
- API: registro/login, mesa/convite, upload Supabase (webp 200), chat ao vivo,
  rolagem `1d20` e `mediaJoin` com sucesso.
- Vercel: página carrega e o bundle referencia a API do Render.
- E2E `online-call.spec.ts` contra produção (HTTPS, fake media): **10/10** —
  áudio, mute/deafen, câmera, tela, chat, kick, reconexão, loop e authz.

## Observações

- O push Git normal continuou retornando HTTP 408 nesta rede; o branch
  `deploy/beta` foi publicado via API (snapshot do `main`, sem workflows) para
  destravar o Render. O histórico completo permanece local.
- O token fine-grained não tem permissão **Workflows**; por isso o snapshot não
  inclui `.github/workflows`. Para publicar o `main` completo/CI, adicionar
  `Workflows: Read and write` e repetir o push quando a rede estabilizar.
- Render free dorme após ~15 min; keep-alive externo ainda precisa ser apontado
  para `/health` (o workflow do GitHub não está no snapshot).
- Rate limit de criação/registro protege o beta; testes de mídia adicionais
  podem exigir esperar a janela de 5 min.
