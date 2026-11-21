# AGENTS.md — Tavern of Disaster

Guia operacional para qualquer pessoa ou agente de IA que trabalhe neste repositório.

## 1. O que é

VTT (virtual tabletop) de RPG, presencial-first: a TV é o tabuleiro compartilhado,
cada celular é o controle de um jogador, e a mesma mesa funciona online.

Stack: Node.js + Express 5 + TypeScript + MongoDB/Mongoose + Socket.IO no backend;
Vue 3 + Vite + TypeScript + Pinia no frontend.

## 2. Estado atual (importante)

- `main` contém a antiga branch `expand`, que já incorpora `character`, `rolling`,
  `system`, `polishing` e `fix`.
- A restauração está organizada em fases. Fases 0–6 concluídas e o beta está
  **em produção**: https://tavernofdisaster.vercel.app (API no Render). Tags:
  `v0.9.2-phase1`, `v0.9.3-phase2`, `v0.9.4-phase3`, `v0.9.5-phase3.1`,
  `v0.9.6-phase4`, `v0.9.7-phase5`, `v0.9.8-phase6`, `v1.0.0-beta`.
- A reformulação visual/UX (“Arquivo Morto”) está concluída na branch
  `design/overhaul-v1`: Home/Lobby, auth por usuário ou e-mail, cockpit DM de
  3 zonas, jogador mobile com bottom nav, TV em 3 zonas e dado assinatura.
  Fonte da verdade: `docs/DESIGN_OVERHAUL.md` (tokens, IA, ondas e gates).
  Gates: 296 testes backend, 577 frontend, 83 E2E, axe 11/11, caos PASS.
- **D&D 5e é o sistema padrão da plataforma.** OP2 e OPSH têm o mesmo peso;
  Cyberpunk RED é secundário; Call of Cthulhu é futuro.
- Contratos: `docs/REALTIME_PROTOCOL.md` (tempo real), `docs/TABLE_MODE.md`
  (TV + celulares, display token, QR, geometria de grade),
  `docs/SHEETS_DICE.md` (fichas/dados D&D/Cyberpunk) e
  `docs/ORDEM_PARANORMAL.md` (OP2). O diário de decisões/modelos/coders está em
  `docs/ORCHESTRATION.md`.
- PDFs de regras ficam em `references/ordem-paranormal/` (ignorado pelo Git;
  nunca commitar material copyrighted).
- A frente online é requisito real: a mesma mesa funciona presencial e remota.
  Voz/vídeo/chat ficam dentro do app; TURN/SFU é infraestrutura invisível.
- PixiJS está morto (não renderiza). O renderizador oficial é DOM/SVG
  (`MapViewport.vue` + `GridLayer.vue` + `TokenLayer.vue`).
- O backend não depende mais do Supabase para iniciar: o storage usa o driver
  `local` por padrão (`STORAGE_DRIVER`, `LOCAL_UPLOAD_DIR`) e `supabase` apenas
  quando configurado.
- O frontend não usa mais `localhost` fixo: REST, Socket.IO e assets derivam de
  `frontend/src/services/apiBase.ts`, com proxy no Vite e no Nginx do Docker.
- O `type-check` do frontend agora cobre `tsconfig.app.json` via
  `npm run type-check` (`vue-tsc --build`).
- Existem testes E2E em `tests/e2e` (Playwright) e eles rodam no CI no job
  `e2e`, com MongoDB em memória e dois navegadores.

## 3. Comandos

```bash
# backend
cd backend && npm ci
npm run dev          # ts-node + nodemon (porta 3001)
npm test             # jest, exige Mongo em memória
npm run build

# frontend
cd frontend && npm ci
npm run dev          # Vite (porta 5173)
npm run build
npm run test:unit
npx vue-tsc --noEmit -p tsconfig.app.json   # type-check real

# testes de tempo real / caos
cd tests/e2e
npx playwright test                         # E2E com 2+ navegadores
npx playwright test specs/table-mode.spec.ts --workers=1  # 1 TV + 5 celulares
node chaos/run.mjs                          # caos headless de 6 clientes
```

> A partir da Fase 0 há um `docker compose up` na raiz (Mongo + backend +
> frontend, porta 8080). Para desenvolvimento sem Docker, é necessário um
> MongoDB local (`mongodb://localhost:27017/tavern_of_disaster`).

## 4. Invariantes de arquitetura

1. **O servidor é a fonte da verdade.** O cliente aplica estado com `revision` ou
   pede ressincronização. Nunca confie em estado local para autorizar ação.
2. **Autorização por entidade, não por payload.** Resolva a entidade (token, cena,
   entrada de iniciativa), descubra a mesa dona e só então verifique o papel.
   Nunca autorize usando o `tableId` enviado pelo cliente.
3. **Toda mutação responde.** `ack { ok, revision }` ou `error { code, message }`.
   Proibido `socket?.emit(...)` silencioso para ações do usuário.
4. **Broadcast canônico.** Use `io.to(tableId)` inclusive para quem originou a ação.
   `socket.to(...)` só para efeitos efêmeros que não alteram estado.
5. **Um tabuleiro, uma geometria.** Coordenadas normalizadas (grid/ViewBox), nunca
   pixels do dispositivo. Pings, medições, auras e tokens usam o mesmo espaço.
6. **Três modos, três rotas.** `/table/:id` (Mestre), `/play/:id` (Jogador),
   `/display/:id` (TV read-only). O modo online usa as mesmas rotas.
7. **Nada de feature nova antes do núcleo multi-dispositivo convergir.**
8. **Mídia não é estado de tabuleiro.** Voz/vídeo/tela são efêmeros, sem
   `revision`, sem gravação; a sinalização é autenticada por mesa e só
   DM/PLAYER entram na chamada. TURN/SFU nunca recebem autorização própria.

## 5. Mapa do backend

```
src/
├── server.ts                 # Express + Socket.IO + auth de handshake
├── config/db.ts              # conexão Mongo
├── models/                   # User, Table, Scene, Token, Character, System, Roll...
├── routes/                   # REST (auth, tables, characters, systems, assets...)
├── services/                 # regras de negócio (token, iniciativa, medição, storage)
├── socketHandlers/           # eventos Socket.IO
├── dto/                      # contrato de estado da sessão
├── validation/               # schemas Zod
├── middleware/               # auth, rate limit
├── logger.ts / metrics.ts
└── test-utils/               # Mongo em memória
```

## 6. Mapa do frontend

```
src/
├── views/                    # Home, Tables, Table (Mestre), Login, Profile...
├── components/               # MapViewport, GridLayer, TokenLayer, painéis, dados
├── stores/                   # Pinia (tableStore é o núcleo da sessão)
├── services/                 # socketService, authService, storageService...
├── router/
└── types.ts                  # contratos do domínio
```

## 7. Regras para agentes

- Trabalhe em worktree/branch própria. Não edite `main` diretamente.
- Leia este arquivo e `docs/RESTORATION.md` antes de codar.
- Não reformate arquivos inteiros; mudanças focadas.
- Não introduza dependência nova sem justificar no PR.
- Não remova código aparentemente morto sem `grep` de referências e confirmação.
- Todo PR deve rodar: lint, type-check real, testes unitários, build.
- Mudanças em Socket.IO exigem teste de integração com pelo menos 2 clientes.
- Playtest oficial é **simulado** (`tests/sim`), não com pessoas.

## 8. Definição de pronto (DoD)

- [ ] Comportamento implementado e coberto por teste (unitário ou integração).
- [ ] Erros retornam feedback ao usuário (toast/ack), não apenas log.
- [ ] Funciona com pelo menos 2 clientes simultâneos.
- [ ] Reconexão não deixa estado divergente.
- [ ] Sem `console.log` de credenciais/tokens.
- [ ] Type-check e build verdes.
- [ ] Documentação atualizada quando muda contrato ou env.
