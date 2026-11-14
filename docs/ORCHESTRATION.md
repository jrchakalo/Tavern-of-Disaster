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
| `coder-backend` | Protocolo de estado, authz por entidade, revisão, turnos, reconexão server-side, refresh de JWT | `restore/phase-1-backend` | `.worktrees/p1-backend` | `opencode/deepseek-v4.1-flash-free` | a iniciar |
| `coder-frontend` | Cliente Socket.IO, store de revisão, ack/timeout, resync, fallback de transporte | `restore/phase-1-frontend` | `.worktrees/p1-frontend` | `opencode/glm-5.3-flash-free` | a iniciar |
| `coder-ux` | `/play/:id` e `/display/:id`, mobile, TV read-only, safe areas, alvos de toque | `restore/phase-1-ux` | `.worktrees/p1-ux` | `opencode/longcat-2.5-free` | a iniciar |
| `coder-qa` | Testes de autorização, caos com 6 clientes, convergência de revisão | `restore/phase-1-qa` | `.worktrees/p1-qa` | `opencode/minimax-m3.1-flash-free` | a iniciar |

Integração: `restore/phase-1-realtime` (criada de `main` em `de0ca9f`).
Nenhum coder commita na integração.

### 2.1 Por que esses modelos

Pesquisa feita em 2026-11-14 (fontes: cards oficiais, Artificial Analysis, Vals AI,
Meituan/LongCat, NVIDIA, OpenCode docs).

| Modelo | Evidência principal | Por que foi escolhido |
|---|---|---|
| `deepseek-v4.1-flash-free` | DeepSWE v1.1 ~74; Terminal-Bench 2.1 ~90 no harness próprio; SkillsBench ~69,8; AutomationBench ~55-69; 1M contexto; rápido; provider zero-retention | Melhor relação agente-código/ferramenta entre os gratuitos. O backend desta fase é exatamente isso: muitas mutações, autorização, revisão, testes de integração e uso intenso de ferramentas. |
| `glm-5.3-flash-free` | Terminal-Bench 2.1 ~82-84; SWE-bench Verified ~79; Terminal-Bench 4.0 ~38; 1M contexto | Mais estável em tarefas longas de terminal/refactor que o MiniMax; escolhido para o cliente realtime, que precisa de paciência para reconciliar eventos e não “inventar” estado. |
| `longcat-2.5-free` | Terminal-Bench 2.1 88,4; DeepSWE 64,6; nativo multimodal; 1,6T MoE; visual/3D forte; 100 req/dia | Trabalho de UX/design exige leitura de tela, hierarquia visual e iteração com screenshots. O limite de 100 req/dia é aceitável porque UX tem menos ciclos que backend. Provider zero-retention. |
| `minimax-m3.1-flash-free` | DeepSWE 73,7; AutomationBench 62,8; OSWorld 61,7; 1M contexto; multimodal | QA de caos é automação de agente com muitos passos e ferramentas. O ponto fraco (alucinação factual) é mitigado porque o resultado é um teste executável: ou converge, ou falha. |

Modelos considerados e não escolhidos:

- `flint-40b-free`: ótimo custo/velocidade, mas 262K de contexto e menos maduro em
  tarefas longas; fica como reserva para patches pequenos.
- `nemotron-3.5-super-vl-free`: multimodal e bom em SWE (71), mas Terminal-Bench 2.1
  ~60 e DeepSWE ~24; bom para inspeção visual, não para o núcleo.
- `nemotron-3.5-lightning-free`: pequeno; só para tarefas mecânicas.
- `inkling-2-small-free`, `big-pickle`, `iceman-free`, `beam-free`, `mimo-v2.6-flash-free`:
  informação pública insuficiente ou foco não comprovado em código; não usar no caminho
  crítico.
- `glm-5.3-flash-free` vs `minimax-m3.1-flash-free`: GLM escolhido para frontend por
  confiabilidade; MiniMax para QA por automação.

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

## 9. Registro de resultados

| Data | Coder | Branch/commit | Veredito | Evidência | Observações |
|---|---|---|---|---|---|
| — | — | — | — | — | (preencher a cada PR) |

## 10. Registro de correções

| Data | Coder | Defeito | Correção pedida | Rodada | Status |
|---|---|---|---|---|---|
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
