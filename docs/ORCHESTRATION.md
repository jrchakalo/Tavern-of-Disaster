# Orquestração da Restauração — Tavern of Disaster

> Papel deste documento: diário operacional do PO/auditor. Toda decisão de modelo,
> skill, designação, branch, revisão, correção e merge entra aqui. Se o contexto
> da conversa se perder, este arquivo é a fonte da verdade do processo.
>
> Última atualização: 2026-11-15. **Fases 1, 2 e 3 concluídas e aprovadas**:
> `v0.9.2-phase1`, `v0.9.3-phase2` e `v0.9.4-phase3` (backend 103/103,
> frontend 185/185, E2E 34/34, caos 14/14).
> **Fase 3.1 (Ordem Paranormal 2)** é a prioridade do primeiro one-shot;
> a Fase 4 está pausada até OP2 fechar. A frente **online** é a Fase 5 em
> `docs/ONLINE_MODE.md`; o deploy/beta é a Fase 6.

## 1. Modelo de trabalho

O PO (agente principal) **não implementa features de fase**. Ele:

1. escreve o contrato e o recorte da tarefa;
2. abre branch/worktree isolada por coder;
3. delega a tarefa ao subagente coder com escopo fechado;
4. revisa o diff, roda testes, type-check, build e testes de segurança;
5. devolve defeitos com evidência;
6. aprova e integra com `git merge --no-ff`;
7. registra resultado, correções e decisões neste documento.

Regras herdadas de `AGENTS.md`:

- `main` nunca é editada diretamente.
- Cada coder trabalha em branch e worktree próprios.
- Nenhum coder faz merge; merge é ato do PO.
- Toda mudança de Socket.IO precisa de teste com 2+ clientes.
- Nada de dependência nova sem justificativa.
- Type-check real, testes unitários, build e lint verdes antes do merge.

## 2. Time de coders

| Coder | Escopo | Branch | Worktree | Modelo | Status |
|---|---|---|---|---|---|
| `coder-backend` | Protocolo de estado, authz por entidade, revisão, turnos, reconexão server-side, refresh de JWT | `restore/phase-1-backend` | `.worktrees/p1-backend` | `opencode-go/deepseek-v4.1-flash` (compartilhado com o PO) | a iniciar |
| `coder-frontend` | Cliente Socket.IO, store de revisão, ack/timeout, resync, fallback de transporte | `restore/phase-1-frontend` | `.worktrees/p1-frontend` | `opencode-go/glm-5.3-flash` | a iniciar |
| `coder-ux` | `/play/:id` e `/display/:id`, mobile, TV read-only, safe areas, alvos de toque | `restore/phase-1-ux` | `.worktrees/p1-ux` | `opencode-go/longcat-2.5-free` | concluído — commit `aaaa83b` |
| `coder-qa` | Testes de autorização, caos com 6 clientes, convergência de revisão | `restore/phase-1-qa` | `.worktrees/p1-qa` | `opencode-go/minimax-m3.1-flash` | a iniciar |
| PO/auditor | Contrato, revisão, testes, merge, documentação | `restore/phase-1-realtime` | raiz | `opencode-go/deepseek-v4.1-flash` (1017) | ativo |

Integração: `restore/phase-1-realtime` (criada de `main` em `de0ca9f`).
Nenhum coder commita na integração.

### 2.1 Por que esses modelos (revisão 2026-11-14, plano Go)

A primeira rodada usou modelos `*-free` do Zen. Três coders bateram no limite
diário gratuito (“Free usage limit reached”). O PO migrou a equipe para o plano
**OpenCode Go**, cujos limites são por modelo e divididos em janelas de 5 horas
(20%), semana (50%) e mês (100%). O PO continua em
`opencode-go/deepseek-v4.1-flash` (DeepSeek V4.1 Flash 1017), como definido pelo
usuário.

Fontes: `https://opencode.ai/docs/go/` (tabela de limites e estimativas de
requisições), cards oficiais, Artificial Analysis, Vals AI, Xiaomi/MiMo, Meta,
Alibaba e OpenCode Console.

| Modelo | Limite Go (5h / semana / mês) | Evidência | Por que foi escolhido |
|---|---|---|---|
| `mimo-v2.6-flash` | 30.100 / 75.200 / 150.400 req | DeepSWE 67,9; Terminal-Bench 2.1 87,6 (fornecedor) e 76,4 (Vals); OSWorld 80,8; Visual Coding 71,5; 1M contexto | **Reserva de volume / fallback do backend.** Coding agêntico forte e cota alta; entra se o DeepSeek compartilhado apertar ou se o backend precisar de uma segunda opinião. |
| `glm-5.3-flash` | 6.320 / 15.790 / 31.580 req | Terminal-Bench 2.1 ~82-84; SWE-bench Verified ~79; Terminal-Bench 4.0 ~38; 1M contexto | **Frontend.** Menos volume que backend, mas exige paciência em refactor e reconciliação de eventos. GLM é estável e não alucina estado com a mesma frequência. |
| `longcat-2.5-free` | Gratuito no Go; 100 req/dia | Terminal-Bench 2.1 88,4; DeepSWE 64,6; multimodal; visual/3D forte | **UX.** Já entregou a branch com sucesso. O trabalho visual exige leitura de tela e iteração; 100 req/dia é suficiente para menos ciclos. |
| `minimax-m3.1-flash` | 3.880 / 9.690 / 19.380 req | DeepSWE 73,7; AutomationBench 62,8; OSWorld 61,7; 1M contexto | **QA.** Automação de agentes e muitos passos de ferramenta. O resultado é um teste executável: converge ou falha, o que mitiga o ponto fraco de alucinação factual. |
| `deepseek-v4.1-flash` (PO + backend) | 43.330 / 108.330 / 216.670 req | DeepSWE ~77; Terminal-Bench 2.1 ~90; SkillsBench ~69,8; melhor agente-código/ferramenta do conjunto | **PO/auditor + backend.** O backend é a parte mais crítica e complexa da fase; o usuário autorizou compartilhar o modelo com outra função. A cota é suficiente para PO (revisão) + backend (implementação) no mesmo período de 5h. |

Modelos considerados e não escolhidos:

- `muse-spark-1.3-contributor`: maior limite (45.300 / 113.300 / 226.600) e
  benchmarks fortes (DeepSWE 75,4; Terminal-Bench 88,8), mas é “limited regions”
  e o tier Contributor tem termos de treinamento. Fica como **reserva** se
  disponível na região e se um coder esgotar a cota.
- `miMo-v2.6-pro`: melhor que o Flash em alguns benchmarks, mas limite de
  3.250 / 8.150 / 16.300 e custo maior; não compensa para esta fase.
- `qwen3.7-plus`: SWE-bench 77,7 e Terminal-Bench 2.0 70,3, mas DeepSWE 16,5
  (fraco em longa duração) e limite 4.300 / 10.800 / 21.600; não serve para o
  núcleo.
- `glm-5.3`: qualidade alta, mas limite 220 / 540 / 1.080; inviável para coder.
- `claude-haiku-5-5`, `gpt-6-luna`, `hy4`: limites menores (≈2.700-4.200 / 5h)
  e/ou perfil menos comprovado em agente-código; ficam como fallback.
- `iceman-contributor-free`, `beam-free`: gratuitos no Go e sem cota, mas são
  modelos stealth com dados de treinamento/qualidade incerta. Reserva para
  tarefas mecânicas, nunca para o caminho crítico.
- `hy4`, `kimi-k3.1-pro`, `grok-4.7`, `gemini-4-argon`: cotas baixas demais
  (147-2.710 req/5h) para o volume de um coder.

## 3. Skills instaladas e designação

Instaladas em `.agents/skills` com `npx skills add <pkg> -a opencode -y`.
`skills-lock.json` versiona a origem.

| Skill | Origem | Designada para | Uso |
|---|---|---|---|
| `find-skills` | `vercel-labs/skills` | PO e todos | Descobrir skill nova quando faltar capacidade. |
| `code-review` | `mattpocock/skills` | PO | Revisão em dois eixos: padrões do repo e spec da tarefa. |
| `express-typescript` | `mindrally/skills` | backend | Rotas, middleware, erros, validação. |
| `websocket-engineer` | `jeffallan/claude-skills` | backend | Rooms, presença, reconexão, escala. |
| `security-best-practices` | `openai/skills` | backend e PO | IDOR, authz, segredos, validação. |
| `web-realtime-socket-io` | `agents-inc/skills` | frontend | Ciclo de vida, ack, reconexão, TypeScript. |
| `vue-testing-best-practices` | `vuejs-ai/skills` | frontend e UX | Vitest + Vue Test Utils. |
| `frontend-design` | `anthropics/skills` | UX | Direção visual intencional. |
| `web-design-guidelines` | `vercel-labs/agent-skills` | UX | Acessibilidade, foco, formulários. |
| `ux-heuristics` | `wondelai/skills` | UX | Heurísticas de usabilidade e severidade. |
| `design-mobile-apps` | `designed-by-ai/skills` | UX | Mobile, toque, safe areas. |
| `playwright-best-practices` | `currents-dev/...` | QA | Multi-contexto, WebSocket, flakiness, CI. |

Skills que falharam/não foram usadas: `bobmatnyc/claude-mpm-skills@nodejs-backend-typescript`
e `@playwright-e2e-testing` não instalaram um `SKILL.md` próprio (são coleções);
substituídas por `express-typescript` + `websocket-engineer` e
`playwright-best-practices`.

## 4. Topologia de branches e worktrees

```
main
└── restore/phase-1-realtime           (integração; docs + skills)
    ├── restore/phase-1-backend        (.worktrees/p1-backend)
    ├── restore/phase-1-frontend       (.worktrees/p1-frontend)
    ├── restore/phase-1-ux             (.worktrees/p1-ux)
    └── restore/phase-1-qa             (.worktrees/p1-qa)
```

Worktrees ficam em `.worktrees/` (ignorado pelo Git). Cada uma recebe uma cópia de
`node_modules` para não compartilhar instalação entre coders.

## 5. Protocolo de “pull request” simulado

Não há push para o GitHub nesta fase. O PR é a branch local.

1. Coder commita na própria branch com mensagem convencional.
2. Coder entrega: resumo, arquivos, comandos executados, resultados, riscos.
3. PO inspeciona `git diff restore/phase-1-realtime...<branch>`.
4. PO roda, no mínimo:
   - `backend: npm test`, `npm run build`
   - `frontend: npm run type-check`, `npm run test:unit`, `npm run build`
   - `tests/e2e: npm test` quando a mudança tocar tempo real
   - `npm run test:sim` (caos) quando a branch de QA estiver integrada
5. PO aplica o checklist da seção 6.
6. Defeito → devolve ao coder com arquivo, linha, comando e saída.
7. Aprovado → `git merge --no-ff <branch>` na integração.
8. Depois de todas as branches: validação completa na integração, merge `--no-ff`
   em `main`, tag `v0.9.2-phase1` e atualização deste log.

## 6. Checklist de revisão do PO

- [ ] A mudança respeita o contrato `docs/REALTIME_PROTOCOL.md`.
- [ ] Nenhuma autorização usa `tableId` do payload sem resolver a entidade.
- [ ] Toda mutação responde com ack `{ ok, revision }` ou `{ ok:false, error }`.
- [ ] Erro não é apenas logado; chega ao usuário.
- [ ] Broadcast usa `io.to(tableId)`, inclusive para o autor.
- [ ] `revision` é monotônica e incrementada em toda mutação.
- [ ] Evento velho/atrasado não regride estado no cliente.
- [ ] Reconexão reentra na sala e pede resync.
- [ ] Nenhum `console.log` de token/segredo.
- [ ] Teste cobre o caminho feliz e o de rejeição.
- [ ] Type-check, testes e build verdes.
- [ ] Sem dependência nova injustificada.
- [ ] Sem reformatação de arquivo inteiro.

## 7. Quadro da Fase 1

| ID | Entrega | Coder | Depende de | Critério de aceite |
|---|---|---|---|---|
| P1-BE-1 | `revision` em `Table` + serviço de revisão + snapshot/patch | backend | contrato | revisão monotônica; snapshot e patch com revisão |
| P1-BE-2 | Authz por entidade em todos os handlers; `joinTable` valida membro | backend | P1-BE-1 | ataque cross-table retorna 403; sem vazamento |
| P1-BE-3 | Acks e erros visíveis em toda mutação | backend | P1-BE-1 | nenhum `catch` silencioso |
| P1-BE-4 | Turno atômico, dono do turno, conflito de versão | backend | P1-BE-2 | dois `nextTurn` simultâneos → 1 ok + 1 conflito |
| P1-BE-5 | Presença e refresh de JWT | backend | P1-BE-1 | reconexão após expirar token |
| P1-BE-6 | Testes de integração 2+ clientes | backend | P1-BE-2..5 | cross-table, ack, revisão, turno concorrente |
| P1-FE-1 | Transporte websocket+polling e ack com timeout | frontend | contrato | fallback funciona; erro vira toast |
| P1-FE-2 | Store com `revision`, snapshot, patch, guarda de evento velho | frontend | P1-FE-1 | patch fora de ordem é ignorado; gap pede resync |
| P1-FE-3 | Reconnect/rejoin/resync em foco/visibilidade/online | frontend | P1-FE-2 | volta de background sem divergir |
| P1-FE-4 | Refresh de sessão no cliente | frontend | P1-FE-1 | token expirado renova e reconecta |
| P1-UX-1 | `/play/:id` mobile com mapa, iniciativa, dados e status | UX | P1-FE-2 | utilizável em 390×844; sem overflow |
| P1-UX-2 | `/display/:id` TV read-only/fullscreen | UX | P1-FE-2 | nunca escreve; legível em 1920×1080 |
| P1-QA-1 | Teste de authz cross-table e ack | QA | P1-BE-6 | jogador não entra em mesa alheia |
| P1-QA-2 | Chaos test 6 clientes | QA | P1-FE-3 | todos convergem para a mesma revisão |
| P1-QA-3 | Relatório de execução | QA | P1-QA-2 | evidência com comandos e saídas |

## 8. Diário de decisões

| Data | Decisão | Justificativa |
|---|---|---|
| 2026-11-14 | Fase 1 em uma branch de integração + 4 branches de coder | Paralelismo sem conflito; PO integra no fim. |
| 2026-11-14 | Contrato `REALTIME_PROTOCOL.md` escrito antes de codar | Frontend e backend não podem divergir em revisão/ack. |
| 2026-11-14 | Não fazer push para `origin` ainda | `main` local está 65 commits à frente; push é decisão do usuário/PO após fase validada. |
| 2026-11-14 | PRs são branches locais, não GitHub PRs | Beta local-first; revisão e merge pelo PO. |
| 2026-11-14 | `socket.io-client` entra como devDependency do backend | Exigência de teste de integração com 2+ clientes. |
| 2026-11-14 | LongCat 2.5 no UX apesar de 100 req/dia | Menos ciclos; limite suficiente para a fase. |
| 2026-11-14 | Primeira rodada com modelos `*-free` do Zen falhou por cota diária | Backend, frontend e QA receberam “Free usage limit reached”; UX concluiu antes do limite. |
| 2026-11-14 | Migrar a equipe para o plano Go | Limites por modelo com janelas de 5h/semana/mês; o Go permite continuar sem depender da cota diária gratuita. |
| 2026-11-14 | Backend em MiMo-V2.6-Flash | Maior limite prático fora o DeepSeek do PO; coding agêntico forte e 1M de contexto. |
| 2026-11-14 | Reatribuir backend para DeepSeek V4.1 Flash 1017 (compartilhado com o PO) | Usuário autorizou; backend é a parte mais crítica e o DeepSeek é o modelo mais forte do conjunto. A cota compartilhada (43.330/5h) é folgada para PO + backend. MiMo fica como fallback. |
| 2026-11-14 | Frontend em GLM-5.3-Flash | Menor volume, maior necessidade de estabilidade em refactor e reconciliação. |
| 2026-11-14 | QA em MiniMax M3.1 Flash | Automação/OSWorld fortes; teste executável reduz risco de alucinação. |
| 2026-11-14 | DeepSeek V4.1 Flash 1017 fica reservado ao PO | Maior cota e melhor julgamento; evita disputa de limite com coders. |
| 2026-11-14 | Muse Spark 1.3 Contributor como reserva | Maior cota do print (226k/mês), mas região limitada e termos de treinamento. |
| 2026-11-14 | E2E local usa `MONGOMS_SYSTEM_BINARY` do cache do backend | Evita download do binário do Mongo; CI pode baixar ou usar cache do runner. |
| 2026-11-14 | Fase 1 aprovada com gaps documentados | Movimento de token sem CAS e mutações fora do turno continuam last-write-wins; ficam para a Fase 2. |
| 2026-11-15 | Online entra no plano como Fase 5 | Mesa remota é requisito real; voz/vídeo/chat devem viver no app, sem Discord. |
| 2026-11-15 | Mesh WebRTC + TURN free antes de SFU | 1 DM + 4 jogadores cabem em mesh; áudio-first evita estourar upload/cota. |
| 2026-11-15 | LiveKit Cloud free como fallback SFU | 5.000 min/mês cobrem ~13 sessões de 6 pessoas; UI continua própria. |
| 2026-11-15 | E2E online com fake media | Playwright/Chromium permite testar tracks, mute/deafen e reconexão sem hardware. |
| 2026-11-15 | Ficha completa só dono/DM; resumo para os demais | Evita vazar notas/atributos privados e mantém a TV leve. |
| 2026-11-15 | Mutação de ficha via socket | Garante ack/revisão e PV sincronizado em todos os tokens. |
| 2026-11-15 | Dados com `!` explosivo e limites | Cyberpunk RED exige d10 explosivo; limites evitam DoS no servidor. |
| 2026-11-15 | Log de rolagens com TTL de 7 dias | Cabe no Atlas M0 e ainda cobre a sessão + revisão. |
| 2026-11-15 | Ordem Paranormal 2 vira o sistema principal | É o sistema do primeiro one-shot; usa dados graduados e ficha própria. |
| 2026-11-15 | Fase 4 pausada; Fase 3.1 OP2 primeiro | Sem OP2 o one-shot não acontece; mídia/cenas pode esperar. |
| 2026-11-15 | OP1 puro fora; *Sobrevivendo ao Horror* conforme PDFs | Usuário confirmou que só a extensão será usada. |

## 9. Registro de resultados

| Data | Coder | Branch/commit | Veredito | Evidência | Observações |
|---|---|---|---|---|---|
| 2026-11-14 | UX (LongCat 2.5 Free) | `restore/phase-1-ux` / `aaaa83b` + `965d32c` | **Aprovado com ressalvas** | `npm run type-check` OK; `npm run test:unit` 17/17; `npm run build` OK; integração: 38/38; rotas `/play`, `/display` emitidas | Toast duplicado de `actionError` corrigido em `965d32c`; falta validação visual em navegador real; `revision/you/presence` lidos defensivamente. |
| 2026-11-14 | Frontend (GLM-5.3-Flash) | `restore/phase-1-frontend` / `3c0eed1` + `8db2177` + `8e66d8d` | **Aprovado** | `npm run type-check` OK; `npm run test:unit` 35/35; `npm run build` OK; integração com UX: 43/43 testes | `baseRevision`, movimento via `tokenUpdates` e resize de grid corrigidos e testados. |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | `restore/phase-1-backend` / `f8df20a` + `f6ac357` | **Aprovado** | `npm test` 64/64; `npm run build` OK; 12 suítes; integração 2+ clientes | Authz por entidade, ack, revisão, CAS de turno, presença e refresh; 4 correções aplicadas. |
| 2026-11-14 | QA (MiniMax M3.1 Flash) | `restore/phase-1-qa` / `8fc0243` | **Aprovado** | Spec authz 7/7; suíte E2E completa 8/8; caos 14/14 PASS, `revision=4`, 0 `actionError` | Cross-table, actionError, revisão monotônica, reconexão, turno concorrente e convergência de 7 clientes. |
| 2026-11-14 | Frontend P2 (GLM-5.3-Flash) | `restore/phase-2-frontend` / `d36ca84` | **Aprovado** | `type-check` OK; `test:unit` 69/69; `build` OK | `connectDisplay` sem JWT/refresh, `canWrite`, join por convite e REST de token. Ping em pixel no `TableView` sinalizado para UX. |
| 2026-11-15 | Backend P2 (DeepSeek V4.1 Flash 1017) | `restore/phase-2-backend` / `c46d6f0` | **Aprovado** | `npm test` 76/76; `npm run build` OK; 12 testes de integração display | Token SHA-256, auth DISPLAY, guard read-only, rollback/rotação e ping em grade. |
| 2026-11-15 | QA P2 (DeepSeek V4.1 Flash 1017) | `restore/phase-2-qa` / `4c3b50f` + `bd346dd` | **Aprovado** | `table-mode` 9/9 + `display-security` 5/5; suíte E2E completa 22/22; caos P1 PASS | Relatório em `docs/qa/PHASE2-TABLE-MODE-REPORT.md`; 1 TV + 5 celulares + loop de 24 iterações. |
| 2026-11-15 | UX P2 (MiMo-V2.6-Flash) | `restore/phase-2-ux` / `03c16b4` + `2273862` + `1cba8b6` | **Aprovado** | `type-check` OK; 113/113 na integração; build OK | Card fora do turno, QR absoluto, pings/`pingCenterPixels` em grade e redirect pós-login corrigidos e testados. |
| 2026-11-15 | Regressão P1 na integração P2 | `restore/phase-2-table-mode` | **Aprovado** | happy-path + realtime-authz + display-security: **13/13** | Nenhuma regressão da Fase 1 após backend/frontend/UX da Fase 2. |
| 2026-11-15 | Integração P2 final | `restore/phase-2-table-mode` / `2de7f14` | **Aprovado** | E2E completo **22/22**; table-mode **9/9**; display-security **5/5**; caos **PASS** | 1 TV 1920×1080 + 5 celulares 390×844 + 24 iterações; tag `v0.9.3-phase2`. |
| — | — | — | — | — | (preencher a cada PR) |

## 10. Registro de correções

| Data | Coder | Defeito | Correção pedida | Rodada | Status |
|---|---|---|---|---|---|
| 2026-11-14 | Frontend (GLM-5.3-Flash) | `applyPatch` aplicava patch com `baseRevision` antigo quando `revision === local + 1` | Ressincronizar sempre que `baseRevision !== revision`; teste com local 5, base 3, revision 6 | 1 | corrigido em `8db2177` |
| 2026-11-14 | UX (LongCat 2.5 Free) | `PlayView` duplicava o toast de `actionError` já centralizado no `socketService` | Remover `toast.error` da view; manter só o banner | 1 | corrigido em `965d32c` |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | `diceRollError` legado + ack de erro geravam dois toasts | Emitir o legado só quando não houver callback de ack | 1 | corrigido em `f6ac357` |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | Nova rodada limpava medições persistentes no cliente, mas não no servidor | Limpar persistentes da cena no servidor e manter auras | 1 | corrigido em `f6ac357` |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | `requestReorderInitiative` aceitava entradas arbitrárias do cliente (token de outra mesa) | Validar IDs contra a iniciativa existente e reconstruir a partir do servidor | 1 | corrigido em `f6ac357` |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | Patch de edição de token não incluía mudança de dono | Incluir `owner` no `tokenUpdates` | 1 | corrigido em `f6ac357` |
| 2026-11-14 | Frontend (GLM-5.3-Flash) | `tokenUpdates` com `squareId` não movia o token entre quadrados no store | Mover o token no grid ao aplicar o patch | 1 | corrigido em `8e66d8d` |
| 2026-11-14 | Frontend (GLM-5.3-Flash) | Patch de `activeScene` com novo grid não reconstruía `squares` | Reconstruir o grid preservando tokens | 1 | corrigido em `8e66d8d` |
| 2026-11-15 | Frontend P3 (GLM-5.3-Flash) | `restore/phase-3-frontend` / `8fbc829` + `98ae8d6` | **Aprovado** | `type-check` OK; 170/170; build OK | Store/socket de ficha, HP, roll log e dice local; ordem de `recentRolls` e `characterId: null` alinhados. |
| 2026-11-15 | QA P3 (DeepSeek V4.1 Flash 1017) | `restore/phase-3-qa` / `936db06` | **Aprovado com ressalvas** | Type-check OK; specs prontos; execução bloqueada pré-integração | E2E ficha/PV/dados/sistema + 2 contextos online; rodar após backend/UX. |
| 2026-11-15 | Backend P3 (DeepSeek V4.1 Flash 1017) | `restore/phase-3-backend` / `ed77a93` | **Aprovado** | `npm test` 103/103; build OK; 14 testes novos de integração | Ficha realtime, PV↔token, dados com `!`, rate limit, log/TTL e seed D&D/Cyberpunk. |
| 2026-11-15 | UX P3 (MiMo-V2.6-Flash) | `restore/phase-3-ux` / `74af03d`..`a0b6a5c` | **Aprovado** | `type-check` OK; 185/185; build OK; table-mode 9/9 | Ficha D&D 5e/Cyberpunk, token↔ficha, PV no card/TV, dados/log, seletor de sistema. |
| 2026-11-15 | Integração P3 final | `restore/phase-3-sheets-dice` / `991744a` | **Aprovado** | E2E completo **34/34**; sheets-dice 8/8; online 4/4; caos PASS | Correções do PO: auth de `/api/systems` por rota e probe de HP online como DM. |
| 2026-11-15 | Backend/PO | `characterRouter` com auth global em `/api` derrubava `/api/systems` com 401 | Auth por rota no character router; teste de regressão com a ordem real do server | 1 | corrigido em `1abcedb` |
| 2026-11-15 | QA/PO | Spec online sondava HP de ficha do DM com socket do jogador | Usar socket do DM (dono/DM apenas, §3.2) | 1 | corrigido em `991744a` |
| — | — | — | — | — | — |

## 11. Riscos e limites

- **Cotas free**: modelos gratuitos têm limite diário e podem sumir. Se um coder
  ficar bloqueado, o PO troca o modelo e registra a troca.
- **Retenção de dados**: DeepSeek/GLM/LongCat/MiniMax free têm políticas diferentes.
  Nenhum segredo real entra em prompt; usar dados de teste.
- **Concorrência**: a integração é local e sequencial; o caos test é o juiz.
- **Divergência de contrato**: qualquer mudança no protocolo exige atualizar
  `REALTIME_PROTOCOL.md` e avisar frontend/QA antes do merge.
- **Escopo**: Phase 1 não implementa fichas completas, upload de mapa, QR ou
  display token. Isso é Fase 2+.

## 12. Como retomar

1. Ler este arquivo e `docs/REALTIME_PROTOCOL.md`.
2. Ver `git worktree list` e `git branch --list 'restore/phase-2-*'`.
3. Ver a seção 9 para o último veredito.
4. Continuar do primeiro item “a iniciar” da seção 13.

## 13. Fase 2 — Modo Mesa Presencial

Contrato: `docs/TABLE_MODE.md`. Branch de integração:
`restore/phase-2-table-mode`. Base: `main` em `d2cd365` (tag
`v0.9.2-phase1`).

### 13.1 Time

| Coder | Escopo | Branch | Modelo |
|---|---|---|---|
| `coder-backend` | token de display, auth socket DISPLAY, geometria de ping, validação | `restore/phase-2-backend` | `opencode-go/deepseek-v4.1-flash` |
| `coder-frontend` | conexão display, store/role, join por convite, REST de display token | `restore/phase-2-frontend` | `opencode-go/glm-5.3-flash` |
| `coder-ux` | `/play` ficha resumida/PV, `/display` TV, QR `TableSharePanel`, mobile | `restore/phase-2-ux` | `opencode-go/mimo-v2.6-flash` |
| `coder-qa` | E2E 1 TV + 5 celulares, read-only, geometria e caos de mesa | `restore/phase-2-qa` | `opencode-go/deepseek-v4.1-flash` (retry; MiniMax retornou vazio) |

PO: `opencode-go/deepseek-v4.1-flash` (1017).

### 13.2 Decisões

- Display usa token dedicado, hash SHA-256 no banco; texto claro só no fragmento
  da URL da TV e em `sessionStorage`.
- Coordenadas no fio são unidades de grade; helper compartilhado
  `frontend/src/services/gridGeometry.ts` escrito pelo PO antes das branches.
- QR é gerado offline no frontend com `qrcode` (MIT); sem serviço externo.
- UX usa MiMo-V2.6-Flash nesta fase por causa do limite de 100 req/dia do
  LongCat 2.5 Free e do foco visual (Visual Coding 71,5 / OSWorld 80,8).
- Deploy (Supabase/Render/Vercel) continua fora do escopo até a Fase 5; a Fase 2
  roda local com Mongo em memória/Docker e storage local.
- QA foi reexecutado em DeepSeek V4.1 Flash 1017 porque a primeira sessão
  MiniMax terminou sem commits nem relatório; o worktree estava limpo.
- UX da Fase 3 foi retomada em `mimo-v2.6-flash-free` porque a sessão Go
  atingiu o limite de 5h. Os componentes parciais em `components/character/`
  foram preservados; o worktree recebeu o merge da integração antes do retry.
- O limite Go resetou; a UX voltou para `opencode-go/mimo-v2.6-flash` sem
  reiniciar a tarefa. LongCat free foi apenas ponte durante o bloqueio.
- A suíte E2E completa compartilha um único backend/IP; `LOGIN_RATE_LIMIT_POINTS`
  e `CREATE_RATE_LIMIT_POINTS` sobem para 1000 apenas no `global-setup.ts`.
  Produção mantém 5/20 por 5 min.

### 13.3 Quadro

| ID | Entrega | Coder | Critério |
|---|---|---|---|
| P2-BE-1 | `displayTokenHash` + gerar/rotacionar/revogar | backend | DM only; hash persistido; token antigo inválido |
| P2-BE-2 | handshake `displayToken` + snapshot DISPLAY | backend | só a mesa do token; `permissions=[]` |
| P2-BE-3 | mutações de display bloqueadas | backend | 403 em todas as ações de escrita |
| P2-BE-4 | ping em coordenadas de grade + validação | backend | fora do grid → VALIDATION; broadcast em grade |
| P2-BE-5 | testes de display/geometria com 2+ clientes | backend | token, rotação, read-only, cross-table |
| P2-FE-1 | `connectDisplay(tableId, token)` e auth sem JWT | frontend | display conecta e recebe snapshot |
| P2-FE-2 | store/role DISPLAY e bloqueio de escritas no cliente | frontend | UI não emite mutação |
| P2-FE-3 | join por convite (`POST /api/tables/join`) | frontend | jogador entra pelo QR |
| P2-FE-4 | REST de token de display + helpers | frontend | gerar/rotacionar/revogar |
| P2-FE-5 | pings em grade usando `gridGeometry` | frontend | sem pixel no payload |
| P2-UX-1 | `/play` ficha resumida, PV, movimento, dados, turno | UX | 390×844, toque, safe areas |
| P2-UX-2 | `/display` TV real por token, fullscreen, fit | UX | 1920×1080, read-only |
| P2-UX-3 | `TableSharePanel` com QR do jogador e da TV | UX | QR offline, rotacionar/revogar |
| P2-QA-1 | E2E 1 TV + 5 celulares | QA | todos convergem, TV read-only |
| P2-QA-2 | caos de mesa/reconexão/60 min acelerado | QA | revisão e hashes iguais |
| P2-QA-3 | relatório da fase | QA | evidência e gaps |

### 13.4 Ordem de integração

1. Backend display/geometria.
2. Frontend display/join/ping.
3. UX play/display/QR.
4. QA E2E + caos.
5. Gates completos, merge `--no-ff` em `main`, tag `v0.9.3-phase2`.

## 14. Fase 5 — Online e comunicação (planejada)

Contrato: `docs/ONLINE_MODE.md`. Branch futura: `restore/phase-5-online`.
Substitui a numeração antiga de beta ops, que passa a Fase 6.

### 14.1 Decisões de arquitetura

- **Mesh WebRTC primeiro** para 1 DM + até 4 jogadores, áudio-first.
- **Socket.IO como sinalização**; mídia nunca passa pelo backend Node.
- **TURN Metered Open Relay** (20 GB/mês free) configurável por env; STUN
  público; coturn self-host opcional.
- **LiveKit Cloud free** (5.000 min/mês) ou self-host como fallback SFU se o
  mesh não bastar; UI continua própria, sem abrir plataforma externa.
- **Câmera opcional** (360p/15fps); TV/display não entra na mídia.
- **Chat de texto** por mesa com histórico TTL; mensagens de sistema para
  rolagens/turnos.
- **Sem gravação** de áudio/vídeo; credenciais TURN curtas; sem log de SDP.
- **Online E2E** com Chromium fake media (`--use-fake-device-for-media-stream`).

### 14.2 Subfases

| Subfase | Entrega |
|---|---|
| 5A | sinalização, presença de mídia, áudio mesh, mute/deafen |
| 5B | vídeo, câmera, dispositivos, indicador de fala |
| 5C | compartilhamento de tela, chat, moderação |
| 5D | TURN/ICE restart, E2E online, teste em redes diferentes |

### 14.3 Time previsto

| Coder | Modelo | Escopo |
|---|---|---|
| backend | `opencode-go/deepseek-v4.1-flash` | mediaHandlers, ICE servers, presença de mídia, testes |
| frontend | `opencode-go/glm-5.3-flash` | mediaService, peers, mute/deafen, reconexão |
| UX | `opencode-go/mimo-v2.6-flash` | dock, grade de participantes, chat, mobile |
| QA | `opencode-go/deepseek-v4.1-flash` | E2E fake media, TURN/relay, reconexão |

### 14.4 Perguntas pendentes para o usuário

1. Quantos jogadores remotos no beta? (recomendado 1 DM + 4)
2. Vídeo padrão ligado ou desligado? (recomendado desligado)
3. Chat persistido por quanto tempo? (recomendado 7 dias)
4. TURN: Metered free ou coturn self-host? (recomendado Metered no beta)
5. SFU: aceitar LiveKit Cloud free como fallback? (recomendado sim)
6. Compartilhamento de tela no beta? (recomendado 5C)

## 15. Fase 3 — Fichas, dados e sistemas

Contrato: `docs/SHEETS_DICE.md`. Branch de integração:
`restore/phase-3-sheets-dice`. Base: `main` em `efce6e3`.

### 15.1 Time

| Coder | Escopo | Branch | Modelo |
|---|---|---|---|
| backend | modelo/DTO, ficha realtime, PV↔token, dados/explosão, log, seed | `restore/phase-3-backend` | `opencode-go/deepseek-v4.1-flash` |
| frontend | store de resumos, socket de ficha/PV, roll log, dice local | `restore/phase-3-frontend` | `opencode-go/glm-5.3-flash` |
| UX | ficha D&D/Cyberpunk, token↔ficha, PV no card/TV, dados/log | `restore/phase-3-ux` | `opencode-go/mimo-v2.6-flash` |
| QA | E2E ficha/PV/dados/sistema + 2 clientes online | `restore/phase-3-qa` | `opencode-go/deepseek-v4.1-flash` |

PO: `opencode-go/deepseek-v4.1-flash` (1017).

### 15.2 Decisões

- Ficha completa é dona/DM; outros recebem só resumo (nome/PV/CA/nível).
- Mutação de ficha via socket com ack/revisão; REST continua para leitura/fallback.
- PV propaga para todos os tokens vinculados via `tokenUpdates.character`.
- Dados server-authoritative; `!` explosivo para Cyberpunk; limites 100 dados/1000 faces.
- Log de rolagens com TTL de 7 dias e `recentRolls` no snapshot.
- Sistema inicial D&D 5e; Cyberpunk RED como segundo, sem automação completa de regras.
- `characterMath.ts` escrito pelo PO antes das branches para evitar divergência.
- Online-aware: ficha/PV/dados são testados com 2 contextos remotos já na Fase 3.

### 15.3 Quadro

| ID | Entrega | Coder |
|---|---|---|
| P3-BE-1..3 | modelo, DTO/snapshot/patch, ficha realtime/PV | backend |
| P3-BE-4..6 | dados/explosão, rate limit, log | backend |
| P3-BE-7..8 | seed D&D/Cyberpunk + testes | backend |
| P3-FE-1..4 | store, socket ficha/PV, characterStore, roll log | frontend |
| P3-FE-5..6 | dice local, testes | frontend |
| P3-UX-1..4 | ficha, token↔ficha, dados/log, sistema | UX |
| P3-QA-1..3 | E2E presencial + online, relatório | QA |

## 16. Fase 3.1 — Ordem Paranormal 2 (one-shot)

Contrato: `docs/ORDEM_PARANORMAL.md`. Branch futura: `restore/phase-3-op2`.

### 16.1 Por que revisar

A Fase 3 entregou D&D 5e e Cyberpunk RED, mas o sistema principal do primeiro
one-shot é **Ordem Paranormal 2**. OP2 usa dados graduados (d4–d12), teste de
**dado de atributo + dado de perícia**, atributos Físico/Mente/Emoção, perfis,
Vida/PD, NEX separado de nível e 20 perícias próprias. A ficha D&D e o motor
atual não atendem.

### 16.2 Decisões

- OP2 é o sistema principal; D&D 5e continua suportado; Cyberpunk RED fica
  secundário.
- OP1 puro não será usado; apenas a extensão *Sobrevivendo ao Horror*, conforme
  o usuário confirmar quais regras entram.
- Nada de inventar regras: os PDFs locais em `references/ordem-paranormal/`
  são a fonte. A pasta é ignorada pelo Git.
- A Fase 4 fica pausada até o one-shot de OP2 fechar.
- Motor de dados ganha um tipo `stepPool` (atributo + perícia, RA/RB,
  crítico/falha, step up/down), além do motor de expressão atual.
- Ficha OP2 completa dono/DM; resumo (Vida/PD/Defesa) para TV/jogadores.

### 16.3 Pendências

1. PDFs em `references/ordem-paranormal/`.
2. Confirmar Alpha vs Beta/Contos da Vigília.
3. Confirmar quais regras de *Sobrevivendo ao Horror* entram.
4. Confirmar combate simplificado vs versão mais recente.
5. Rituais completos ou nome/custo/descrição no beta.

### 16.4 Quadro previsto

| ID | Entrega | Coder |
|---|---|---|
| P3.1-BE-1 | seed OP2 + modelo de ficha por sistema | backend |
| P3.1-BE-2 | motor `stepPool` + validação + log | backend |
| P3.1-BE-3 | testes de regras/dados | backend |
| P3.1-FE-1 | tipos/store/socket OP2 | frontend |
| P3.1-FE-2 | client do motor step pool | frontend |
| P3.1-UX-1 | ficha OP2 mobile/desktop | UX |
| P3.1-UX-2 | recursos/condições/medo no token/TV | UX |
| P3.1-QA-1 | E2E one-shot OP2 presencial | QA |
| P3.1-QA-2 | E2E online 2 contextos | QA |
