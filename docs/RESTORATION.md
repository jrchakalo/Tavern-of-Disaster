# Plano de Restauração — Tavern of Disaster

> Status: em execução. Fase 0 (fundação) concluída tecnicamente; próxima: Fase 1.
> Última atualização: 2026-11-14.

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
└── restore/phase-0-foundation     ambiente, limpeza, CI, docs
    ├── restore/phase-1-realtime   protocolo de estado, authz, turnos, reconexão
    ├── restore/phase-2-table-mode /display, /play, QR, geometria canônica
    ├── restore/phase-3-sheets-dice fichas, dados, sistemas
    ├── restore/phase-4-media-scenes uploads, cenas, persistência
    └── restore/phase-5-beta-ops   deploy free, observabilidade, playtest simulado
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

### Fase 1 — Núcleo em tempo real (1 semana)

- Autorização de `joinTable` e de toda mutação por entidade → mesa → papel.
- Protocolo `sessionSnapshot` / `sessionPatch` com `revision`, `requestResync` e acks.
- Reconexão com rejoin automático e resync em foco/visibilidade.
- Turnos: máquina de estados, dono do turno, updates atômicos, rodada, erros visíveis.
- Transporte: WebSocket + polling, URL derivada de HTTPS, refresh de sessão.
- Testes de integração Socket.IO e **chaos test** com 6 clientes.

**Saída:** chaos test converge; nenhuma ação silenciosa.

### Fase 2 — Modo Mesa Presencial (1,5–2 semanas)

- `/display/:tableId`: TV read-only, fullscreen, fit-to-screen, iniciativa e rolagens.
- `/play/:tableId`: controle mobile do jogador (ficha resumida, PV, dados, movimento).
- QR code para entrar; token de display separado da conta do Mestre.
- Geometria canônica: grid/SVG, pings e medições em coordenadas de grid.
- Mobile: safe areas, `pointercancel`, long-press, alvos de toque, fontes legíveis.

**Saída:** 1 TV + 5 celulares virtuais, 60 min, board idêntico, turnos funcionando.

### Fase 3 — Fichas, dados e sistemas (1 semana)

- Criar/editar ficha; vínculo ficha ↔ token; PV sincronizado.
- Dados server-authoritative, presets por sistema, limite de dados.
- D&D 5e completo para o beta; Cyberpunk RED como segundo sistema (d10 explosivo).
- Log de rolagens persistido.

### Fase 4 — Mídia e cenas (1 semana)

- Upload com adapter (`local`/`supabase`), compressão, quotas, limpeza de órfãos.
- Subir mapa pelo celular do Mestre.
- Medições e auras persistidas (sobrevivem a restart).
- Religar templates ou remover painéis órfãos.
- Code-split do `TableView` e limpeza de mídia pesada.

### Fase 5 — Operação e beta simulado (1 semana)

- Deploy 100% free: Vercel (frontend), Render free + keep-alive (backend),
  Atlas M0 (Mongo), Supabase free (storage), GitHub Actions (CI).
- Healthcheck, `/metrics` protegido, logs, backup do Atlas.
- Playtest simulado completo e relatório de release.
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

### Asserções obrigatórias

- Todos os clientes terminam com a mesma `revision` e o mesmo hash de tabuleiro.
- Nenhum erro de console não tratado em nenhum contexto.
- Toda ação rejeitada gera feedback visível.
- Reconexão <2s e sem perda de estado.
- TV nunca entra em estado de escrita.
- Screenshots por etapa para regressão visual.

### Onde roda

- Local: `npm run test:sim`.
- CI: GitHub Actions (repositório público → minutos gratuitos), em PRs da Fase 1+.

## 6. Infra 100% gratuita — limites e mitigação

| Serviço | Free tier | Risco | Mitigação |
|---|---|---|---|
| Vercel | hobby | bandwidth | assets comprimidos; cache imutável |
| Render | web service free | dorme após ~15 min | keep-alive externo + wake no início da sessão |
| MongoDB Atlas | M0 512 MB | espaço/conexões | TTL de rolls; índices; backup manual |
| Supabase | 1 GB storage | imagens grandes | Sharp WebP + quotas |
| GitHub Actions | público | minutos | e2e só em PRs críticos |

Alternativa para uso privado sem custo: Cloudflare Tunnel apontando para o backend
local. Não serve para beta público, mas serve para uma sessão remota eventual.

## 7. Métricas de sucesso

- Convergência de estado: 100% no fim de cada cenário simulado.
- Reconexão: >99% em <2s.
- Ação de turno: p95 <200ms.
- Zero erro de console em 60 min simulados.
- Onboarding: mesa + TV + 3 celulares em <5 min.

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
