# Contas e credenciais para o beta

> Objetivo: destravar o deploy externo com o mínimo de cliques. Você cria as
> contas/segredos; o agente faz push, deploy, configuração e smoke via CLI/API.
>
> **Nunca cole segredos no chat.** Preencha `/home/jr/Projetos/Tavern-of-Disaster/.env.deploy`
> (já criado a partir de `.env.deploy.example`, ignorado pelo Git) e avise
> “pode seguir”. O agente lê o arquivo localmente e valida com
> `node scripts/check-deploy-env.mjs`.

## 0. Ordem recomendada

1. GitHub (push do código)
2. MongoDB Atlas (banco)
3. Supabase (storage)
4. Render (backend)
5. Metered TURN (chamada)
6. Vercel (frontend)
7. Smoke online

As etapas 2–5 podem ser feitas em paralelo; Vercel depende da URL do Render.

## 1. GitHub — token de push

1. Abra https://github.com/settings/tokens?type=beta (Fine-grained tokens).
2. **Generate new token**:
   - Name: `tavern-beta-deploy`
   - Expiration: 7 days (ou 30)
   - Repository access: **Only select repositories** →
     `jrchakalo/Tavern-of-Disaster`
   - Permissions: **Contents = Read and write**, **Metadata = Read**
3. Gere e copie o token para `GITHUB_TOKEN=` no `.env.deploy`.
4. O agente fará `git push origin main` e o Render/Vercel poderão ler o repo.

> Se preferir classic token: escopo `repo` e `workflow` (para Actions).

## 2. MongoDB Atlas — M0 grátis

1. Crie conta em https://www.mongodb.com/cloud/atlas/register.
2. **Create** → **M0 Free**:
   - Provider: AWS
   - Region: `sa-east-1` (São Paulo) se disponível; senão `us-east-1`.
3. **Database Access** → **Add New Database User**:
   - Username: `tavern_app`
   - Password: gere uma senha forte (sem `@ : / ? # [ ] %` para evitar
     URL-encode; ou use uma senha simples longa).
   - Role: `Read and write to any database`.
4. **Network Access** → **Add IP Address** → `0.0.0.0/0`
   (beta; o Render free não tem IP fixo. Use senha forte.)
5. **Connect** → **Drivers** → copie a URI:
   `mongodb+srv://tavern_app:<senha>@<cluster>.mongodb.net/tavern_of_disaster?retryWrites=true&w=majority`
6. Cole em `MONGO_URI=` no `.env.deploy` (com a senha real).

## 3. Supabase — storage grátis

1. Crie conta/projeto em https://supabase.com/dashboard.
2. Escolha a região mais próxima (South America/São Paulo, se disponível).
3. **Project Settings → API**:
   - copie **Project URL** → `SUPABASE_URL=`
   - copie **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY=`
   - (a anon key não é usada pelo backend)
4. **Storage → New bucket**:
   - Name: `tavern-assets`
   - **Public bucket: ON**
   - (o agente também pode criar via API se você fornecer
     `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`)
5. `SUPABASE_BUCKET=tavern-assets`.

> O bucket público serve mapas/tokens; não coloque dados sensíveis nele.

## 4. Render — backend grátis

1. Crie conta em https://render.com (login com GitHub).
2. Autorize o Render a acessar o repositório `Tavern-of-Disaster`.
3. **New +** → **Blueprint** → selecione o repo/branch `main`.
   O Render lê `render.yaml` e cria o serviço Docker `tavern-of-disaster-api`.
4. Preencha os secrets marcados `sync: false` quando o painel pedir
   (ou deixe o agente preencher via API):
   `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGIN`, `PUBLIC_APP_URL`,
   `SUPABASE_*`, `ASSET_BASE_URL`, `METRICS_TOKEN`, `TURN_*`.
   - `JWT_SECRET` e `METRICS_TOKEN`: o agente gera e grava no Render.
   - `CORS_ORIGIN`/`PUBLIC_APP_URL`: preencher depois da Vercel.
5. **Account Settings → API Keys** → crie `tavern-agent` e copie para
   `RENDER_API_KEY=` no `.env.deploy`.
6. Copie o ID do serviço (`srv-...`) e a URL
   (`https://<servico>.onrender.com`) para `RENDER_SERVICE_ID=` e `RENDER_URL=`.
   `RENDER_HEALTH_URL=https://<servico>.onrender.com/health`.
7. O free tier dorme após ~15 min; o keep-alive usa `/health`.

## 5. Metered Open Relay — TURN grátis

1. Crie conta em https://www.metered.ca/tools/openrelay/.
2. Crie um app **Open Relay** (free, 20 GB/mês).
3. No dashboard, copie as credenciais:
   - URLs TURN (prefira TCP/UDP 443)
   - username
   - credential
4. Preencha no `.env.deploy`:
   `TURN_URLS=turn:<host>:443?transport=tcp,turn:<host>:443?transport=udp`
   `TURN_USERNAME=...`
   `TURN_CREDENTIAL=...`
5. Sem TURN o app funciona em LAN/STUN; TURN é necessário em redes restritas.

## 6. Vercel — frontend grátis

1. Crie conta em https://vercel.com (login com GitHub).
2. **Account Settings → Tokens** → create `tavern-agent` → copie para
   `VERCEL_TOKEN=`.
3. Não precisa importar o projeto manualmente: o agente usa a CLI
   (`npx vercel`) a partir de `frontend/`.
4. Quando o Render estiver no ar, o agente define
   `VITE_API_URL=https://<servico>.onrender.com` no build da Vercel.
5. Copie a URL final (`https://<projeto>.vercel.app`) para o agente; ele
   atualiza `CORS_ORIGIN`/`PUBLIC_APP_URL` no Render.

## 7. Smoke final (agente)

Depois de tudo preenchido, o agente:

1. `node scripts/check-deploy-env.mjs`
2. `git push origin main`
3. faz deploy/valida Render + Vercel
4. roda o smoke online em HTTPS (mesa, TV, 2 celulares, áudio, chat, mapa,
   reconexão)
5. cria a tag `v1.0.0-beta` somente se o smoke passar.

## 8. Se algo falhar

- Atlas: confira IP allowlist `0.0.0.0/0` e senha URL-encoded.
- Supabase: bucket precisa ser público; service role, não anon.
- Render: veja logs do serviço; healthcheck `/health`; secrets `sync:false`.
- Vercel: `VITE_API_URL` absoluto; sem isso, `/api` cai no SPA.
- TURN: teste em 4G; se falhar, use TCP 443.
- Segredos: nunca no chat/repo; só `.env.deploy` local.
