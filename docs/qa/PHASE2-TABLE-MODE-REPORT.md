# Relatório de QA — Fase 2 (modo mesa presencial)

> Codificado em: `restore/phase-2-qa` (P2-QA-1, P2-QA-2, P2-QA-3).
> Contrato de referência: `docs/TABLE_MODE.md` e `docs/REALTIME_PROTOCOL.md`.
>
> **Status em 2026-11-15: BLOQUEADO.** A Fase 2 ainda não está integrada nesta
> branch. Os testes foram escritos e executados; a primeira superfície ausente
> (`POST /api/tables/:tableId/display-token`) falha com mensagem explícita e as
> demais não executam (`did not run`/`skipped`). Nenhum "pass" foi inventado. O
> veredito continua sendo do PO (§7).

## 1. Escopo

| ID | Entrega | Arquivo | O que cobre |
|---|---|---|---|
| P2-QA-1 | E2E 1 TV + 5 celulares | `tests/e2e/specs/table-mode.spec.ts` | `TABLE_MODE.md` §7, §8 (itens 1–10) |
| P2-QA-2 | Segurança do display e geometria | `tests/e2e/specs/display-security.spec.ts` | `TABLE_MODE.md` §3.3, §3.4, §5.3 |
| P2-QA-3 | Relatório da fase | este arquivo | evidência e lacunas |

### 1.1 Cenários do `table-mode.spec.ts`

| # | Cenário | Asserção principal | Contrato |
|---|---|---|---|
| 1 | Contrato da Fase 2 | `POST /display-token` devolve `{ token, displayUrl }`; handshake com `displayToken` conecta | §3.2, §3.3 |
| 2 | TV 1920×1080 | `/display/:id#token=…` renderiza mesa/cena/iniciativa; **sem** `Mover`, `Encerrar turno`, `Rolar`, `.play-controls` nem `draggable`; revisão não muda na janela de observação | §7 |
| 3 | 5 celulares 390×844 | `/play/:id?invite=<code>` adiciona os 5 jogadores; header, board e token card visíveis | §4.1, §6 |
| 4 | Convergência | TV + 5 celulares na mesma revisão; mesmos nomes/posições de token | §1 (critério 1) |
| 5 | Movimento do Mestre | token muda no servidor e em todos os clientes; revisão avança | §8 (item 5) |
| 6 | Turnos | cada jogador move no próprio turno pela UI; `Mover` desabilitado fora do turno; socket fora do turno → `FORBIDDEN`; revisão/token intactos | §6.2, §8 (item 6) |
| 7 | Dados na TV | `requestRollDice` aparece em `.roll-log__item[data-type="roll"]` | §8 (item 7) |
| 8 | Recarga | 2 celulares + TV recarregados recuperam a revisão do servidor | §1 (critério 7) |
| 9 | Loop de 60 min | 24 iterações de `nextTurn` + movimento + rolagem; revisão, `tokenHash` e `initiativeHash` iguais nos 6 clientes | §8 (item 10) |

### 1.2 Cenários do `display-security.spec.ts`

| # | Cenário | Asserção principal | Contrato |
|---|---|---|---|
| 1 | Ping válido | 2 clientes recebem o mesmo `x=1.5`, `y=2.5` e a mesma revisão | §5.3 |
| 2 | Ping fora do grid | ack `VALIDATION` e **zero** `pingBroadcast` | §5.3 |
| 3 | Entrada do display | entra na mesa dona, `you.role = DISPLAY`, `permissions = []`; mesa alheia → `FORBIDDEN` | §3.3, §3.4 |
| 4 | Display read-only | `requestPlaceToken`, `requestMoveToken`, `requestNextTurn`, `requestSetActiveScene`, `requestPing`, `requestRollDice` → `FORBIDDEN`; revisão e tabuleiro intactos | §3.3, §3.4 |
| 5 | Rotação/revogação | token anterior falha no handshake; token novo conecta; após `DELETE`, falha de novo; código `UNAUTHENTICATED` | §3.4 |

## 2. Ambiente

| Item | Valor |
|---|---|
| SO | Linux 7.2.9-100.fc43.x86_64 (x86_64) |
| Node / npm | v24.13.0 / 11.6.2 |
| Playwright | 1.57.0 (`tests/e2e/node_modules`) |
| Browser | Google Chrome do sistema (`E2E_CHANNEL=chrome`) |
| MongoDB | `mongodb-memory-server` com binário local via `MONGOMS_SYSTEM_BINARY` |
| Backend | `backend/src/server.ts` via `npm run start:test` (porta 3100) |
| Frontend | Vite (`npm run dev`, porta 4173) |
| Branch | `restore/phase-2-qa` @ `8c62df2` |
| Integração alvo | `restore/phase-2-table-mode` (não mesclada por esta QA) |

Estado das branches irmãs no momento da execução (inspeção de `git status`):

- `restore/phase-2-backend`: limpa em `8c62df2` (sem P2-BE-1..4);
- `restore/phase-2-frontend`: com alterações não commitadas em
  `socketService.ts`, `tableAccessService.ts`, `tableStore.ts`;
- `restore/phase-2-ux`: limpa em `8c62df2` (sem P2-UX-1..3).

## 3. Comandos

```bash
cd tests/e2e

# type-check dos specs (o pacote e2e não traz `typescript`; usa o do backend)
../../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json

# suíte completa (sobe backend + Vite + Mongo em memória via global-setup)
MONGOMS_SYSTEM_BINARY=<repo>/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome \
npx playwright test specs/table-mode.spec.ts specs/display-security.spec.ts --workers=1

# execuções filtradas usadas para isolar as lacunas deste relatório
npx playwright test specs/table-mode.spec.ts --workers=1
npx playwright test specs/table-mode.spec.ts -g "5 celulares" --workers=1
npx playwright test specs/display-security.spec.ts --workers=1
npx playwright test specs/display-security.spec.ts -g "ping fora do grid" --workers=1
npx playwright test specs/display-security.spec.ts -g "token de display entra" --workers=1
```

## 4. Resultado

### 4.1 Type-check

| Comando | Resultado |
|---|---|
| `tsc --noEmit -p tsconfig.json` (backend tsc) | **OK**, sem erros |

### 4.2 Execuções de 2026-11-15

| Data | Comando | Resultado | Veredito |
|---|---|---|---|
| 2026-11-15 | `table-mode.spec.ts specs/display-security.spec.ts --workers=1` | 2 failed / 12 did not run | **BLOQUEADO** — P2-BE-1 (token de display) e P2-BE-4 (ping) |
| 2026-11-15 | `table-mode.spec.ts --workers=1` | 1 failed / 8 did not run | **BLOQUEADO** — `POST /display-token` responde 404 (P2-BE-1) |
| 2026-11-15 | `table-mode.spec.ts -g "5 celulares" --workers=1` | 1 failed / 1 did not run | **BLOQUEADO** — convite não adiciona jogadores (P2-FE-3) |
| 2026-11-15 | `display-security.spec.ts --workers=1` | 1 failed / 4 did not run | **FALHA** — `pingBroadcast` sem `revision` (P2-BE-4 incompleto) |
| 2026-11-15 | `display-security.spec.ts -g "ping fora do grid"` | 1 failed | **FALHA** — ack `ok:true` e broadcast para coordenada inválida (P2-BE-4) |
| 2026-11-15 | `display-security.spec.ts -g "token de display entra"` | 1 skipped | **BLOQUEADO** — sem token de display (P2-BE-1) |

### 4.3 Tabela de aceite

| Critério (`TABLE_MODE.md`) | Teste | Resultado |
|---|---|---|
| TV entra por token de display | table-mode §1/§2 | **BLOQUEADO** (P2-BE-1) |
| TV nunca muta | display-security §4 | **NÃO EXECUTADO** (depende de P2-BE-1/2) |
| Jogador entra por QR/convite | table-mode §3 | **FALHOU** (P2-FE-3) |
| Geometria de grade em pings | display-security §1 | **FALHOU** (sem `revision` no broadcast) |
| Ping fora do grid → `VALIDATION` | display-security §2 | **FALHOU** (P2-BE-4) |
| 5 celulares + TV convergem | table-mode §4 | **NÃO EXECUTADO** |
| Turnos e erro fora do turno | table-mode §6 | **NÃO EXECUTADO** |
| Rolagem na TV | table-mode §7 | **NÃO EXECUTADO** |
| Reconexão sem divergência | table-mode §8 | **NÃO EXECUTADO** |
| 60 min sem divergência | table-mode §9 | **NÃO EXECUTADO** |

## 5. Evidência

### 5.1 P2-BE-1 — rota de token de display ausente

`table-mode.spec.ts`, teste "contrato da Fase 2 está disponível":

```
Error: P2-BE-1 ausente: POST /api/tables/:tableId/display-token respondeu 404
(<pre>Cannot POST /api/tables/<id>/display-token</pre>).
docs/TABLE_MODE.md §3.2 exige { token, displayUrl }.
```

O setup chegou até aqui depois de registrar DM + 5 jogadores, criar mesa/cena,
ativar a cena, colocar 5 tokens e colocar a sessão em `LIVE`. Ou seja, o caminho
da Fase 1 está funcional; a primeira superfície da Fase 2 é que falta.

### 5.2 P2-FE-3 — convite do jogador não é consumido pelo `/play`

`table-mode.spec.ts -g "5 celulares"`:

```
Error: P2-FE-3 ausente: /play/:tableId?invite=<code> não adicionou os jogadores à mesa
(docs/TABLE_MODE.md §4.1).
Received: ["p1-p2-…", "p2-p2-…", "p3-p2-…", "p4-p2-…", "p5-p2-…"]
```

Log do backend na mesma execução, repetido para os 5 sockets:

```
[socket:table] joinTable falhou
ServiceError: Usuário não faz parte desta mesa. (status 403)
```

### 5.3 P2-BE-4 — ping sem validação de limites

`display-security.spec.ts -g "ping fora do grid"`:

```
Error: Esperava ok:false em "requestPing", veio
{"ok":true,"revision":2,"serverNowMs":…}.
```

O backend atual aceita `x = gridWidth + 5` e transmite o ping. O contrato
(`TABLE_MODE.md` §5.3) exige `VALIDATION` sem broadcast.

### 5.4 P2-BE-4 — broadcast de ping sem revisão

`display-security.spec.ts` (teste de ping válido):

```
Expected: "number"
Received: "undefined"
> expect(typeof dmPayload.revision).toBe('number');
```

`pingBroadcast` chega aos 2 clientes com `x=1.5`/`y=2.5` corretos, mas sem o
campo `revision` exigido pelo §5.3.

### 5.5 Superfícies que nem chegaram a ser executadas

| Superfície | Motivo |
|---|---|
| P2-BE-2 (handshake `displayToken`) | o probe só roda depois de P2-BE-1; hoje o endpoint não existe |
| P2-BE-3 (display read-only) | depende de P2-BE-2 |
| P2-FE-1/2 (conexão DISPLAY e store) | dependem de P2-BE-2 |
| P2-UX-2 (`/display` por token, sem JWT) | router atual ainda exige JWT em `/display` |
| P2-FE-5 (ping em grade no cliente) | backend nem valida limites; o teste de 2 clientes já falha antes |
| P2-UX-3 (`TableSharePanel`/QR) | não há componente nesta branch |

## 6. Decisões de implementação

1. **JWT assinado localmente** (HS256, payload `{ user: { id, username } }`) para
   os 6 usuários do cenário. Motivo: `limitLogin` permite 5 logins/5 min por IP;
   tentar logar 6 vezes pela UI estouraria a cota e criaria flakiness. O token é
   usado no `localStorage` dos contextos mobile e nos sockets de controle.
   `happy-path.spec.ts` continua cobrindo o login real.
2. **Sem dependência nova.** Reaproveita `socket.io-client` e `@playwright/test`
   já presentes em `tests/e2e/package.json`.
3. **Bloqueio explícito, não silencioso.** O primeiro teste de cada spec falha
   com a lista de superfícies ausentes; os dependentes usam `test.skip` com o
   mesmo motivo ou não executam por causa do modo serial. A suíte nunca fica
   "verde" sem a Fase 2.
4. **Retries desligados nos dois describes** (`retries: 0`). Além de evitar
   mascarar flakiness, o cenário cria 6 usuários + 1 mesa (table-mode) e 3
   usuários + 3 mesas (display-security), o que consumiria o bucket
   `limitCreate` (20/5 min) em uma repetição.
5. **Ordem serial** (`mode: 'serial'`) porque os testes compartilham um mundo
   (mesa, tokens, sockets e páginas). Isso mantém a execução previsível com
   `--workers=1`.
6. **`expectedRevision`** é enviado em `requestMoveToken` do Mestre e no loop,
   exercitando o CAS previsto no protocolo.

## 7. Campos para a execução final do PO

Preencher **somente após** a integração das branches de backend/frontend/UX na
`restore/phase-2-table-mode` (ou `main`, conforme o plano). Não copiar valores.

| Campo | Valor |
|---|---|
| Data/hora da execução | _(pendente)_ |
| Commit de integração validado | _(pendente)_ |
| `npx playwright test specs/table-mode.spec.ts --workers=1` | _(pendente)_ |
| `npx playwright test specs/display-security.spec.ts --workers=1` | _(pendente)_ |
| Suíte completa (`npx playwright test`, paralela) | _(pendente)_ |
| `revision` final | _(pendente)_ |
| `tokenHash` final | _(pendente)_ |
| `initiativeHash` final | _(pendente)_ |
| `actionError` inesperados | _(pendente)_ |
| Veredito do PO | _(pendente)_ |

## 8. Lacunas e riscos conhecidos

| # | Lacuna / risco | Impacto | Situação |
|---|---|---|---|
| L1 | Fase 2 não integrada nesta branch | specs não podem passar | **Bloqueio atual**; reexecutar após merge |
| L2 | Seletores acoplados ao DOM atual (`play-header__revision`, `display-header__revision`, `board-token`, `display-board__token`, `token-card__status`) | A branch de UX pode renomear classes e quebrar o E2E | Risco aceito; ajustar junto da UX se necessário |
| L3 | O teste da TV usa `pathname + hash` de `displayUrl` com o `E2E_BASE_URL` | Se o backend devolver outro host, o teste continua no frontend local (intencional) | Documentado |
| L4 | Rotação/revogação só derruba a TV no próximo handshake | Sockets já conectados continuam até reconectar (aceito no §3.4) | Coberto como o contrato permite |
| L5 | `pingBroadcast` sem `revision` no backend atual | Contrato §5.3 não cumprido; teste falha | Aguardando P2-BE-4 |
| L6 | Rate limit `limitCreate` (20/5 min) compartilhado | Duas execuções seguidas completas podem estourar | `retries: 0`; reiniciar o backend reseta o bucket |
| L7 | `global-setup.ts` pode deixar processos filhos órfãos (L2 da Fase 1) | `EADDRINUSE` em execuções consecutivas | Defeito pré-existente; ver `PHASE1-CHAOS-REPORT.md` L2 |
| L8 | O cenário de 60 min usa 24 iterações de sockets + UI | Não mede tempo real nem latência p95 | O critério de "60 min" é acelerado, como no plano §5 |
| L9 | Sem screenshots versionados | `test-results/` é ignorado pelo Git | Evidência textual neste relatório; traces locais em `test-results/` |

## 9. Como reexecutar depois da integração

```bash
# 1. Integrar backend/frontend/UX na branch de integração e atualizar esta QA.
# 2. Instalar/validar dependências.
cd backend && npm ci
cd ../frontend && npm ci
cd ../tests/e2e && npm ci

# 3. Type-check dos specs.
cd tests/e2e
../../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json

# 4. Executar (o global-setup sobe backend, Vite e Mongo em memória).
MONGOMS_SYSTEM_BINARY=<repo>/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome \
npx playwright test specs/table-mode.spec.ts specs/display-security.spec.ts --workers=1

# 5. Preencher a tabela do §7 com a saída real.
```

Se uma execução anterior deixar processos órfãos:

```bash
pkill -f "ts-node src/server.ts" || true
pkill -f "vite --host 127.0.0.1 --port 4173" || true
```
