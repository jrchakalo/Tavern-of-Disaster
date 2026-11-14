# Orquestração da Restauração — Tavern of Disaster

> Papel deste documento: diário operacional do PO/auditor. Toda decisão de modelo,
> skill, designação, branch, revisão, correção e merge entra aqui. Se o contexto
> da conversa se perder, este arquivo é a fonte da verdade do processo.
>
> Última atualização: 2026-11-14.

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

## 9. Registro de resultados

| Data | Coder | Branch/commit | Veredito | Evidência | Observações |
|---|---|---|---|---|---|
| 2026-11-14 | UX (LongCat 2.5 Free) | `restore/phase-1-ux` / `aaaa83b` + `965d32c` | **Aprovado com ressalvas** | `npm run type-check` OK; `npm run test:unit` 17/17; `npm run build` OK; integração: 38/38; rotas `/play`, `/display` emitidas | Toast duplicado de `actionError` corrigido em `965d32c`; falta validação visual em navegador real; `revision/you/presence` lidos defensivamente. |
| 2026-11-14 | Frontend (GLM-5.3-Flash) | `restore/phase-1-frontend` / `3c0eed1` + `8db2177` | **Aprovado com ressalvas** | `npm run type-check` OK; `npm run test:unit` 30/30; `npm run build` OK; integração com UX: 38/38 testes | `baseRevision` corrigido; patches de movimento/grid em correção (rodada 2). |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | `restore/phase-1-backend` / `f8df20a` | **Aprovado com ressalvas** | `npm test` 52/52; `npm run build` OK; 12 testes de integração 2+ clientes | Authz por entidade, ack, revisão e CAS de turno implementados; 4 correções de integração devolvidas. |
| — | — | — | — | — | (preencher a cada PR) |

## 10. Registro de correções

| Data | Coder | Defeito | Correção pedida | Rodada | Status |
|---|---|---|---|---|---|
| 2026-11-14 | Frontend (GLM-5.3-Flash) | `applyPatch` aplicava patch com `baseRevision` antigo quando `revision === local + 1` | Ressincronizar sempre que `baseRevision !== revision`; teste com local 5, base 3, revision 6 | 1 | corrigido em `8db2177` |
| 2026-11-14 | UX (LongCat 2.5 Free) | `PlayView` duplicava o toast de `actionError` já centralizado no `socketService` | Remover `toast.error` da view; manter só o banner | 1 | corrigido em `965d32c` |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | `diceRollError` legado + ack de erro geravam dois toasts | Emitir o legado só quando não houver callback de ack | 1 | devolvido |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | Nova rodada limpava medições persistentes no cliente, mas não no servidor | Limpar persistentes da cena no servidor e manter auras | 1 | devolvido |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | `requestReorderInitiative` aceitava entradas arbitrárias do cliente (token de outra mesa) | Validar IDs contra a iniciativa existente e reconstruir a partir do servidor | 1 | devolvido |
| 2026-11-14 | Backend (DeepSeek V4.1 Flash 1017) | Patch de edição de token não incluía mudança de dono | Incluir `owner` no `tokenUpdates` | 1 | devolvido |
| 2026-11-14 | Frontend (GLM-5.3-Flash) | `tokenUpdates` com `squareId` não movia o token entre quadrados no store | Mover o token no grid ao aplicar o patch | 1 | devolvido |
| 2026-11-14 | Frontend (GLM-5.3-Flash) | Patch de `activeScene` com novo grid não reconstruía `squares` | Reconstruir o grid preservando tokens | 1 | devolvido |
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
2. Ver `git worktree list` e `git branch --list 'restore/phase-1-*'`.
3. Ver a seção 9 para o último veredito.
4. Continuar do primeiro item “a iniciar” da seção 2/7.
