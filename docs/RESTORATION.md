# Plano de Restauração — Tavern of Disaster

> Status: em execução. Fases 0, 1, 2 e 3 concluídas e integradas; próxima: Fase 4.
> Última atualização: 2026-11-15. Tags: `v0.9.2-phase1`, `v0.9.3-phase2`,
> `v0.9.4-phase3`.

## 1. Diagnóstico em uma frase

A taverna não afundou por falta de features; afundou porque a sincronização entre
dispositivos nunca foi tratada como um protocolo com estado autoritativo, revisão e
recuperação.

## 2. Decisões tomadas

| Decisão | Escolha |
|---|---|
| Base do código | `origin/expand` integrada em `main` com merge `--no-ff` |
| Histórico | Branches antigas preservadas; novas branches por fase; nada de fast-forward |
| Infra | 100% gratuita no beta (Vercel + Render + Atlas M0 + Supabase free) |
| Playtest | 100% simulado, sem pessoas |
| Sistema inicial | D&D 5e (presets e ficha) |
| Renderizador | DOM/SVG; Pixi removido |
| Primeiro marco | 1 TV + 5 celulares virtuais, 60 min simulados, zero divergência |

## 3. Branches da restauração

```
main
├── restore/phase-0-foundation     ambiente, limpeza, CI, docs        (v0.9.1-phase0)
├── restore/phase-1-realtime       protocolo, authz, turnos, reconexão (v0.9.2-phase1)
│   ├── restore/phase-1-backend    revision, authz por entidade, acks, presença, JWT
│   ├── restore/phase-1-frontend   store revision-aware, resync, transporte, refresh
│   ├── restore/phase-1-ux         /play e /display, mobile/TV read-only
│   └── restore/phase-1-qa         authz cross-table + caos de 6 clientes
├── restore/phase-2-table-mode     /display, /play, QR, geometria canônica (v0.9.3-phase2)
│   ├── restore/phase-2-backend    display token, auth DISPLAY, ping em grade
│   ├── restore/phase-2-frontend   connectDisplay, canWrite, join por convite
│   ├── restore/phase-2-ux         ficha resumida, TV real, QR, mobile
│   └── restore/phase-2-qa         1 TV + 5 celulares + display security
├── restore/phase-3-sheets-dice    fichas, dados, sistemas (v0.9.4-phase3)
├── restore/phase-4-media-scenes   uploads, cenas, persistência
├── restore/phase-5-online         WebRTC, áudio/vídeo, chat, TURN (online real)
└── restore/phase-6-beta-ops       deploy free, observabilidade, playtest simulado
```

Cada fase é integrada em `main` com `git merge --no-ff`, preservando a árvore de
decisões. Tags: `v0.9.0-restore` (marco zero), `v0.9.x` por fase, `v1.0.0-beta` no fim.

## 4. Fases

### Fase 0 — Fundação (2–3 dias)

- [x] Integrar `expand` na `main` (feito, `f79c365`, tag `v0.9.0-restore`).
- [x] Remover do Git: `tests/e2e/node_modules`, relatórios Playwright, configs geradas.
- [x] `.gitignore` e `.env.example` completos (backend e frontend).
- [x] Backend inicia sem Supabase: driver de storage `local` (dev) e `supabase` (prod).
- [x] `docker-compose.yml` com Mongo + backend + frontend; um comando para subir.
- [x] Corrigir `tsconfig` para o type-check realmente cobrir o app; zerar os 14 erros.
- [x] Consertar os 2 testes de frontend quebrados; rodar testes no CI.
- [x] Remover Pixi e componentes órfãos.
- [x] `AGENTS.md`, este documento e skills do projeto.
- [x] Origem única (`apiBase.ts`) + proxy Vite/Nginx: funciona por IP na rede local.
- [x] Substituir `nanoid` (ESM-only) por `node:crypto` no build CommonJS.
- [x] Teste unitário do storage local (`storageService.test.ts`).
- [x] E2E de dois navegadores (DM + jogador) verde e rodando no CI.
- [x] Correções descobertas pelo E2E: token sem imagem, throttle do drag & drop,
      `releasePointerCapture` seguro.

**Saída:** clone novo sobe com um comando; CI verde; smoke test com 2 navegadores.

### Fase 1 — Núcleo em tempo real (1 semana) — CONCLUÍDA

- [x] Autorização de `joinTable` e de toda mutação por entidade → mesa → papel.
- [x] Protocolo `sessionSnapshot` / `sessionPatch` com `revision`, `requestResync` e acks.
- [x] Reconexão com rejoin automático e resync em foco/visibilidade.
- [x] Turnos: máquina de estados, dono do turno, updates atômicos (CAS), rodada, erros visíveis.
- [x] Transporte: WebSocket + polling, URL derivada de HTTPS, refresh de sessão.
- [x] Testes de integração Socket.IO e **chaos test** com 6 clientes.
- [x] Contrato escrito em `docs/REALTIME_PROTOCOL.md` e diário do PO em
      `docs/ORCHESTRATION.md`.
- [x] Rotas `/play/:tableId` e `/display/:tableId` (shells mobile/TV read-only).

**Saída:** chaos test converge; nenhuma ação silenciosa.

**Evidência (2026-11-14, integração `ef44594`, tag `v0.9.2-phase1`):**

| Gate | Resultado |
|---|---|
| Backend `npm test` | **64/64**, 12 suítes (inclui integração Socket.IO com 2+ clientes) |
| Backend `npm run build` | OK |
| Frontend `type-check` | OK |
| Frontend `npm run test:unit` | **43/43** |
| Frontend `npm run build` | OK |
| Playwright E2E completo | **8/8** (DM + jogador, authz, acks, cross-table, revisão) |
| Caos 6 clientes | **14/14 PASS**, `revision=4`, hashes de tokens/iniciativa iguais, 0 `actionError` |

**Gaps conhecidos da Fase 1 (para a Fase 2):**

- Movimento de token ainda é last-write-wins (sem CAS por token); dois movimentos
  concorrentes podem estourar `remainingMovement`.
- Mutações fora do turno (edições, medições) também são last-write-wins; só o
  avanço de turno tem CAS forte.
- `/play` e `/display` foram validados por testes de componente, não por
  screenshots em dispositivo real.
- Token de display separado da conta do Mestre ainda não existe (Fase 2).
- `tests/e2e/global-setup.ts` ainda pode deixar processos filhos em alguns
  ambientes; CI limpa o runner, mas a correção de grupo de processos fica para
  a Fase 5.

### Fase 2 — Modo Mesa Presencial (1,5–2 semanas) — CONCLUÍDA

- [x] `/display/:tableId`: TV read-only, fullscreen, fit-to-screen, iniciativa e rolagens.
- [x] `/play/:tableId`: controle mobile do jogador (ficha resumida, PV, dados, movimento).
- [x] QR code para entrar; token de display separado da conta do Mestre.
- [x] Geometria canônica: pings e medições em coordenadas de grid.
- [x] Mobile: safe areas, `pointercancel`, long-press, alvos de toque, fontes legíveis.
- [x] Redirect pós-login preserva `/play/:id?invite=...`.
- [x] Contrato em `docs/TABLE_MODE.md`; helper `gridGeometry.ts`.

**Saída:** 1 TV + 5 celulares virtuais, 60 min simulados, board idêntico, turnos funcionando.

**Evidência (2026-11-15, integração `2de7f14`, tag `v0.9.3-phase2`):**

| Gate | Resultado |
|---|---|
| Backend `npm test` | **76/76**, 13 suítes (12 testes de display) |
| Backend `npm run build` | OK |
| Frontend `type-check` | OK |
| Frontend `npm run test:unit` | **113/113** |
| Frontend `npm run build` | OK |
| E2E completo | **22/22** (happy path + authz + display security + table mode) |
| Table mode | **9/9** (TV 1920×1080 + 5 celulares 390×844 + 24 iterações) |
| Display security | **5/5** (token, read-only, rotação/revogação, pings) |
| Caos P1 | **14/14 PASS**, 0 `actionError` |

**Gaps conhecidos da Fase 2 (para a Fase 3):**

- Movimento de token e outras mutações fora do turno continuam last-write-wins
  (sem CAS por token); o avanço de turno tem CAS forte.
- Rotação/revogação do token da TV derruba a TV apenas na próxima reconexão.
- Sem screenshots versionados de 1920×1080 / 390×844; E2E valida DOM e estado.
- `LoginView`/`RegisterView` não têm link cruzado entre si; o redirect funciona.
- `PUBLIC_APP_URL` precisa ser configurado no deploy para o backend devolver
  `displayUrl` absoluto (o frontend já absolutiza como defesa).
- `tests/e2e/global-setup.ts` ainda pode deixar processos filhos em alguns
  ambientes; CI limpa o runner. Os rate limits de teste sobem via env.

### Fase 3 — Fichas, dados e sistemas (1 semana) — CONCLUÍDA

- [x] Criar/editar ficha; vínculo ficha ↔ token; PV sincronizado.
- [x] Dados server-authoritative, presets por sistema, limite de dados.
- [x] D&D 5e completo para o beta; Cyberpunk RED como segundo sistema (d10 explosivo).
- [x] Log de rolagens persistido (TTL 7 dias, cursor, `recentRolls`).
- [x] Ficha completa dono/DM; resumo (PV/CA) para TV/jogadores.
- [x] Ficha D&D 5e com atributos/perícias/saves/ataques/inventário/magias.
- [x] System seed idempotente de D&D 5e e Cyberpunk RED.
- [x] **Online-aware:** ficha, PV e rolagens sincronizam via `revision` e
  funcionam para jogadores remotos; o log é a fonte para a TV e para o chat.

**Evidência (2026-11-15, integração `991744a`, tag `v0.9.4-phase3`):**

| Gate | Resultado |
|---|---|
| Backend `npm test` | **103/103**, 17 suítes |
| Backend `npm run build` | OK |
| Frontend `type-check` | OK |
| Frontend `npm run test:unit` | **185/185** |
| Frontend `npm run build` | OK |
| Playwright sheets-dice | **8/8** |
| Playwright sheets-dice-online | **4/4** |
| Suíte E2E completa | **34/34** |
| Caos P1 | **14/14 PASS** |

**Gaps conhecidos da Fase 3:**

- Automação de regras (ataques vs CA, condições, magias) fica para depois do beta.
- HP ± na ficha só é persistido no “Salvar”; no card o ± já vai por socket.
- `systemKey` é copiado do sistema da mesa; troca de sistema não migra fichas
  antigas automaticamente.
- Log de rolagens tem TTL de 7 dias (sem exportação).
- D&D 5e tem ficha completa, mas não compêndio de magias/itens.

### Fase 4 — Mídia e cenas (1 semana)

- Upload com adapter (`local`/`supabase`), compressão, quotas, limpeza de órfãos.
- Subir mapa pelo celular do Mestre.
- Medições e auras persistidas (sobrevivem a restart).
- Religar templates ou remover painéis órfãos.
- Code-split do `TableView` e limpeza de mídia pesada.
- **Online-aware:** upload e troca de cena precisam funcionar para um Mestre
  remoto, com progresso e erro visíveis.

### Fase 5 — Online e comunicação (1,5–2 semanas)

Contrato: `docs/ONLINE_MODE.md`.

- WebRTC mesh (áudio-first) com sinalização no Socket.IO; vídeo opcional.
- Microfone, mute, **deafen**, câmera, seleção de dispositivo, indicador de fala.
- Compartilhamento de tela do Mestre.
- Chat de texto por mesa com histórico e mensagens de sistema.
- Presença com estado de mídia; DM pode remover peer da chamada.
- TURN/STUN configuráveis (Metered Open Relay free; coturn opcional).
- ICE restart/reconexão; indicador de qualidade.
- E2E online com fake media (2+ clientes) e teste manual em redes diferentes.

**Saída:** 1 Mestre + 4 jogadores remotos, 30–60 min, áudio/vídeo/chat e
tabuleiro funcionando sem Discord/Zoom. Sem gravação.

### Fase 6 — Operação e beta simulado (1 semana)

- Deploy 100% free: Vercel (frontend), Render free + keep-alive (backend),
  Atlas M0 (Mongo), Supabase free (storage), GitHub Actions (CI).
- TURN/LiveKit e `PUBLIC_APP_URL` configurados; HTTPS obrigatório para mídia.
- Healthcheck, `/metrics` protegido, logs, backup do Atlas.
- Playtest simulado completo (presencial + online) e relatório de release.
- `v1.0.0-beta`.

## 5. Playtest simulado (substitui a mesa real)

Como não haverá pessoas no playtest, a qualidade depende de um harness que simule
uma mesa inteira. Ele é o principal critério de release.

### Elenco virtual

| Ator | Implementação | Viewport |
|---|---|---|
| Mestre | Playwright context + login | 1440×900 |
| Jogador 1–4 | Playwright contexts + login | 390×844 (iPhone-like) |
| TV | Playwright context read-only | 1920×1080 |
| Remoto 1–2 | Playwright context + fake media (flags Chromium) | 1280×800 / 390×844 |
| Clientes caóticos | `socket.io-client` headless | — |

### Roteiro (60 min simulados, acelerados)

1. Mestre cria mesa, cena e sobe mapa.
2. Jogadores entram por código/QR; TV entra por token de display.
3. Mestre cria fichas e coloca tokens; jogadores veem os próprios tokens.
4. Iniciativa: adiciona entradas, inicia rodada, avança turnos.
5. Cada jogador move no seu turno; tenta mover fora do turno e recebe erro.
6. Rolagens de ataque/dano aparecem na TV e no log.
7. Chaos: derrubar 2 sockets, reconectar, trocar de Wi-Fi simulado, recarregar a TV.
8. Ações concorrentes: dois "próximo turno" simultâneos, dois movimentos no mesmo quadrado.
9. Mudança de cena e volta; medições e auras sobrevivem.
10. Verificação final de convergência.

**Cenário online (Fase 5):**

1. Mestre e 2 jogadores em contextos separados, com fake mic/camera.
2. Todos entram por link/convite; áudio conecta; estado de mute/deafen propaga.
3. Câmera liga/desliga; track de vídeo chega ao outro peer.
4. Compartilhamento de tela do Mestre aparece; chat funciona.
5. Derrubar um peer e reconectar; chamada e tabuleiro convergem.
6. Loop de 30 min acelerado com tabuleiro + voz + dados, sem divergência.

### Asserções obrigatórias

- Todos os clientes terminam com a mesma `revision` e o mesmo hash de tabuleiro.
- Nenhum erro de console não tratado em nenhum contexto.
- Toda ação rejeitada gera feedback visível.
- Reconexão <2s e sem perda de estado.
- TV nunca entra em estado de escrita.
- Chamada online: mute/deafen/câmera refletem em todos; reconexão recupera áudio.
- Nenhum áudio/vídeo gravado; credenciais TURN não aparecem em logs.
- Screenshots por etapa para regressão visual.

### Onde roda

- Local (caos headless): `cd tests/e2e && node chaos/run.mjs`.
- Local (E2E com navegador): `cd tests/e2e && npx playwright test`.
- Mesa presencial simulada: `npx playwright test specs/table-mode.spec.ts --workers=1`
  (1 TV 1920×1080 + 5 celulares 390×844 + loop de 24 iterações).
- CI: GitHub Actions (repositório público → minutos gratuitos), em PRs da Fase 1+.
- Se o binário do Mongo não estiver em cache: `MONGOMS_SYSTEM_BINARY=...` ou
  deixe o `mongodb-memory-server` baixar uma vez.

## 6. Infra 100% gratuita — limites e mitigação

| Serviço | Free tier | Risco | Mitigação |
|---|---|---|---|
| Vercel | hobby | bandwidth | assets comprimidos; cache imutável |
| Render | web service free | dorme após ~15 min | keep-alive externo + wake no início da sessão |
| MongoDB Atlas | M0 512 MB | espaço/conexões | TTL de rolls; índices; backup manual |
| Supabase | 1 GB storage | imagens grandes | Sharp WebP + quotas |
| Metered Open Relay (TURN) | 20 GB/mês | vídeo em mesh | áudio-first; TURN só quando P2P falha |
| LiveKit Cloud (SFU, fallback) | 5.000 min WebRTC/mês | ~13 sessões de 6 pessoas | usar só se mesh não bastar |
| GitHub Actions | público | minutos | e2e só em PRs críticos |

Alternativa para uso privado sem custo: Cloudflare Tunnel apontando para o backend
local. Não serve para beta público, mas serve para uma sessão remota eventual.

## 7. Métricas de sucesso

- Convergência de estado: 100% no fim de cada cenário simulado.
- Reconexão: >99% em <2s.
- Ação de turno: p95 <200ms.
- Zero erro de console em 60 min simulados.
- Onboarding: mesa + TV + 3 celulares em <5 min.
- Online: entrar em chamada em <10s; reconexão de áudio em <5s; mute/deafen
  refletidos em <300ms; 30 min sem queda não recuperada.

## 8. Não-objetivos do beta

Fog of war avançado, automação completa de regras, marketplace, app nativo, IA
mestre, 3D, voz/vídeo, múltiplas instâncias de backend.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Scope creep | fases com critério de saída; nada entra antes da Fase 2 |
| Free tier dormir no meio | keep-alive + wake + teste de sessão longa |
| Regressão de sync | chaos test obrigatório no CI |
| Dependência Supabase | adapter de storage desde a Fase 0 |
| Código morto | remoção de Pixi/órfãos na Fase 0 |
| Segurança multi-mesa | testes de ataque cross-table no CI |
| Mesh estourar upload com vídeo | áudio-first; câmera opcional; limite de câmeras; SFU fallback |
| TURN free esgotar | monitorar 20 GB/mês; preferir P2P; LiveKit free como fallback |
| NAT/firewall bloquear mídia | TURN TCP/443; ICE restart; teste em 4G/Wi-Fi |
| Safari iOS quebrar áudio | testes manuais + fallback de UI; sem autoplay forçado |
| Privacidade de câmera/mic | consentimento explícito; sem gravação; sem log de SDP |
