# Relatório de execução — Fase 1 (autorização e caos)

> Codificado em: `restore/phase-1-qa` (P1-QA-1, P1-QA-2, P1-QA-3).
> Contrato de referência: `docs/REALTIME_PROTOCOL.md` (`protocolVersion: 1`).
>
> **Status: validado contra o backend integrado (`restore/phase-1-realtime`,
> `0f39f34`).** Spec: **7 passed**. Caos: **PASS** (saída 0, 12,8 s).
> O mesmo código **reprova** contra o backend pré-Fase 1 (`239b76e`), como
> esperado. O veredito final e a reexecução ficam com o PO (§4.3).

## 1. Escopo

| ID | Entrega | Arquivo | O que cobre |
|---|---|---|---|
| P1-QA-1 | Teste de authz cross-table e ack | `tests/e2e/specs/realtime-authz.spec.ts` | §3, §5, §6, §8, §10, §14 |
| P1-QA-2 | Chaos test 6 clientes | `tests/e2e/chaos/run.mjs` (+ `README.md`) | §5, §6, §7, §11, §12, §14 |
| P1-QA-3 | Relatório de execução | este arquivo | — |

### 1.1 Cenários cobertos pelo spec de autorização (P1-QA-1)

| # | Cenário | Asserção principal | Contrato |
|---|---|---|---|
| 1 | Não-membro tenta `joinTable` | ack `{ ok: false, error.code: 'FORBIDDEN' }` e **nenhum** `sessionSnapshot` | §3, §6, §10 |
| 2 | Membro entra na mesa | ack ok + `sessionSnapshot` com `revision` e `you.role` (`PLAYER` para o jogador, `DM` para o mestre) | §3, §6 |
| 3 | Jogador tenta mutação de DM | `requestSetActiveScene` → `FORBIDDEN`; cena ativa e revisão inalteradas | §8, §10 |
| 4 | IDOR cross-table | token da mesa B não pode ser movido pelo jogador da mesa A (com `tableId` mentiroso **e** com `tableId` da mesa B) → `FORBIDDEN`; token e revisão de B intactos | §10, §14 |
| 5 | Mutação sem callback de ack | o socket recebe `actionError` com `event` e `error.code` | §5, §14 |
| 6 | Duas mutações seguidas | `revision` monotônica (`r1 > r0`, `r2 > r1`) | §4, §14 |
| 7 | Broadcast do DM | jogador recebe `sessionPatch` com o token e `revision` igual ao ack | §7 |

### 1.2 Cenários cobertos pelo harness de caos (P1-QA-2)

| # | Check | O que exige |
|---|---|---|
| C0 | Backend no ar | `GET /metrics` responde |
| C1 | Elenco | 1 DM + 5 jogadores registrados |
| C2 | Mesa/cena/jogadores | mesa e cena via REST, jogadores via código de convite |
| C3 | `joinTable` | ack `ok` para os 6 clientes |
| C4 | Snapshot inicial | os 6 clientes com o mesmo `tableId` e a mesma `revision` |
| C5 | Colocação de token | ack `ok` em `requestPlaceToken` |
| C6 | Propagação | `sessionPatch` (caminho canônico) nos 6 clientes |
| C7/C8 | Turno | ack `ok` e mesma entrada de iniciativa em todos os clientes |
| C9 | Reconexão | 2 sockets derrubados voltam, pedem `requestResync` e recuperam a revisão atual |
| C10 | Concorrência | 2 `requestNextTurn` com o mesmo `expectedRevision` → 1 `ok` + 1 `CONFLICT` |
| C11 | Convergência final | mesma `revision`, mesmo hash de tokens, mesmo hash de iniciativa |
| C12 | Ruído | nenhum `actionError` inesperado |

## 2. Ambiente

| Item | Valor |
|---|---|
| SO | Linux 7.2.9-100.fc43.x86_64 (x86_64) |
| Node | v24.13.0 |
| npm | 11.6.2 |
| CPUs / RAM | 4 / 15 GB |
| Branch base | `restore/phase-1-qa` a partir de `239b76e` |
| Backend | `backend/src/server.ts` via `npm run start:test` (ts-node) |
| Banco | `mongodb-memory-server` (in-memory) |
| Browser | **não usado** pelo P1-QA-1/P1-QA-2 (só REST + Socket.IO) |

## 3. Comandos

```bash
# type-check do spec
cd tests/e2e
npx tsc --noEmit -p tsconfig.json        # (o projeto não declara typescript;
                                          #  usar o tsc do backend:
                                          # ../../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json)

# suíte Playwright (sobe backend + frontend + mongo em memória pelo global-setup)
npx playwright test specs/realtime-authz.spec.ts --reporter=list

# harness de caos (headless, sobe seu próprio backend)
cd tests/e2e
node chaos/run.mjs
```

## 4. Resultado

### 4.1 Execução contra o backend pré-Fase 1 (branch `restore/phase-1-qa`, `239b76e`)

| Data | Comando | Resultado | Veredito |
|---|---|---|---|
| 2026-11-14 | `npx playwright test specs/realtime-authz.spec.ts` | 7 falhas / 0 aprovadas | **REPROVADO (esperado)** — o backend desta branch não implementa acks, `sessionSnapshot` nem `sessionPatch` |
| 2026-11-14 | `node chaos/run.mjs` | `result: FAIL`, 4 checks PASS e 9 FAIL | **REPROVADO (esperado)** — mesmos itens de contrato ausentes |

Motivo das reprovações: os eventos legados (`initialSessionState`,
`tokenPlaced`, `tokenMoved`, `initiativeTurnAdvanced`) existem e funcionam, mas
o envelope de ack (§5), o `sessionSnapshot` (§6), o `sessionPatch` (§7) e o CAS
por revisão (§11) ainda não existem no backend desta branch.

Evidência do harness (execução de 2026-11-14, porta 3348, 66,8 s, saída 1):

```
✓ C0 backend no ar com /metrics — http://127.0.0.1:3348
✓ C1 elenco registrado (1 DM + 5 jogadores) — 6 usuários
✓ C2 mesa, cena e jogadores criados via REST — table=6af89c0db253839062fe47da scene=6af89c0db253839062fe47dc
✗ C3 joinTable responde ack para os 6 clientes — sem ack: dm, player1, player2, player3, player4, player5
✗ C4 6 clientes recebem o mesmo snapshot — não avaliado: 6 cliente(s) não obtiveram ack em joinTable (ver C3)
✗ C5 DM coloca token com ack — requestPlaceToken sem ack — falta o envelope de ack (§5).
✗ C6 estado do token chega a todos os clientes (sessionPatch) — sessionPatch em 0/6; evento legado em 6/6
✗ C7 DM avança o turno com ack — requestNextTurn sem ack — falta o envelope de ack (§5).
✗ C9 reconexão responde ack em joinTable — player2 sem ack após reconectar
✗ C9 requestResync responde ack — player3 sem ack — falta o envelope de ack (§5).
✗ C10 requestNextTurn concorrente: 1 ok + 1 CONFLICT — ok=0 conflict=0 outros=nenhum (§11 exige CAS por revisão)
✗ C11 convergência final — revisões=-1 (nenhuma revisão exposta pelo servidor)
✓ C12 nenhum actionError inesperado — 0 actionError recebidos
```

Contagens do relatório JSON da mesma execução: 7 clientes (6 da mesa + 1 socket
extra do DM para a corrida), `snapshots: 0` e `patches: 0` em todos os clientes
(o estado veio só por eventos legados: `legacyEvents` entre 6 e 7),
`actionErrors: 0`, `reconnects: 1` nos dois sockets derrubados. O processo
do backend, o MongoDB em memória e o diretório temporário foram encerrados ao
final (sem processo órfão).

### 4.2 Execução contra o protocolo integrado (`restore/phase-1-realtime`, `0f39f34`)

| Data | Comando | Resultado | Veredito |
|---|---|---|---|
| 2026-11-14 | `npx playwright test specs/realtime-authz.spec.ts` (backend `0f39f34`) | **7 passed** em 4,6 s | **APROVADO** |
| 2026-11-14 | `CHAOS_BACKEND_DIR=<repo>/backend node chaos/run.mjs` (backend `0f39f34`) | **`result: PASS`**, saída 0, 12,8 s | **APROVADO** |

Como foi executado: o `global-setup.ts` do Playwright sobe o backend a partir do
próprio worktree de `tests/e2e` (que ainda está no backend pré-Fase 1). Para
validar contra o protocolo integrado, o backend foi iniciado manualmente
(Mongo em memória + `npm run start:test` na porta 3100) a partir do checkout da
branch de integração e os testes foram executados contra ele
(`E2E_BACKEND_URL=http://127.0.0.1:3100`). O harness de caos aceita
`CHAOS_BACKEND_DIR` para apontar para outro checkout de backend.

Saída do spec contra o backend integrado:

```
✓ não-membro é rejeitado em joinTable e não recebe snapshot (1.6s)
✓ membro entra na mesa e recebe snapshot com revisão e papel (76ms)
✓ jogador não executa mutação de DM e o estado não muda (92ms)
✓ token de outra mesa não pode ser movido (IDOR cross-table) (130ms)
✓ mutação sem callback de ack devolve actionError no socket (148ms)
✓ duas mutações seguidas incrementam a revisão de forma monotônica (59ms)
✓ mutação do DM é propagada ao jogador via sessionPatch (129ms)
7 passed (4.6s)
```

Saída do harness de caos contra o backend integrado:

```
✓ C0 backend no ar com /metrics — http://127.0.0.1:3420
✓ C1 elenco registrado (1 DM + 5 jogadores) — 6 usuários
✓ C2 mesa, cena e jogadores criados via REST — table=6af89f16d4fc2b4be04f82d3 scene=6af89f16d4fc2b4be04f82d5
✓ C3 joinTable responde ack para os 6 clientes — payload=object revision=0
✓ C4 6 clientes recebem o mesmo snapshot — revision=0 roles=DM,PLAYER,PLAYER,PLAYER,PLAYER,PLAYER
✓ C5 DM coloca token com ack — 2 token(s), revision=2
✓ C6 estado do token chega a todos os clientes (sessionPatch) — sessionPatch em 6/6
✓ C7 DM avança o turno com ack — revision=3
✓ C8 turno convergente em todos os clientes — entrada atual=6af89f17d4fc2b4be04f8325
✓ C9 clientes reconectados recuperam a revisão — player2 recuperou revision=3 (referência 3)
✓ C9 clientes reconectados recuperam a revisão — player3 recuperou revision=3 (referência 3)
✓ C10 requestNextTurn concorrente: 1 ok + 1 CONFLICT — expectedRevision=3
✓ C11 convergência final (revisão, tokens e iniciativa) — revision=4 tokens=b29128b88545b4ae iniciativa=d11c3ca4c400bda6
✓ C12 nenhum actionError inesperado — 0 actionError recebidos
[chaos] PASS: todos os itens do contrato de caos foram satisfeitos.
```

### 4.3 Registro de execução final (PO, 2026-11-14)

| Campo | Valor |
|---|---|
| Data/hora da execução | 2026-11-14 18:00 UTC |
| Commit da integração validado | `ef44594` (`restore/phase-1-realtime`; backend integrado em `0f39f34`, correções em `f6ac357`) |
| `npx playwright test specs/realtime-authz.spec.ts --workers=1` | **7 passed** (15,5 s) |
| `npx playwright test` (suíte completa, paralela) | **8 passed** (33,9 s) — inclui `happy-path.spec.ts` |
| `node chaos/run.mjs` → `result` | **PASS** (saída 0, 14 checks) |
| `revision` convergida | **4** |
| `tokenHash` convergido | **d8565ae406b8e431** (desta execução) |
| `initiativeHash` convergido | **322e2b63376f4487** (desta execução) |
| Clientes no caos | 7 (6 da mesa + 1 socket extra do DM para a corrida) |
| `actionError` inesperados | **0** |
| Veredito do PO | **APROVADO** |

Ambiente local: `MONGOMS_SYSTEM_BINARY` apontando para o binário já em cache em
`backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24`
(evita download). CI pode baixar o binário normalmente ou usar o cache do runner.

## 5. Evidência do caos (execução aprovada)

O relatório JSON da execução aprovada tem o bloco `clients`:

```json
"clients": [
  { "label": "dm",      "revision": 4, "tokenHash": "b29128b88545b4ae", "initiativeHash": "d11c3ca4c400bda6", "snapshots": 1, "patches": 4, "actionErrors": 0 },
  { "label": "player1", "revision": 4, "tokenHash": "b29128b88545b4ae", "initiativeHash": "d11c3ca4c400bda6", "snapshots": 1, "patches": 4, "actionErrors": 0 },
  { "label": "player2", "revision": 4, "tokenHash": "b29128b88545b4ae", "initiativeHash": "d11c3ca4c400bda6", "snapshots": 3, "patches": 4, "actionErrors": 0, "reconnects": 1 },
  { "label": "player3", "revision": 4, "tokenHash": "b29128b88545b4ae", "initiativeHash": "d11c3ca4c400bda6", "snapshots": 3, "patches": 4, "actionErrors": 0, "reconnects": 1 },
  { "label": "player4", "revision": 4, "tokenHash": "b29128b88545b4ae", "initiativeHash": "d11c3ca4c400bda6", "snapshots": 1, "patches": 4, "actionErrors": 0 },
  { "label": "player5", "revision": 4, "tokenHash": "b29128b88545b4ae", "initiativeHash": "d11c3ca4c400bda6", "snapshots": 1, "patches": 4, "actionErrors": 0 },
  { "label": "dm-second","revision": 4, "tokenHash": "b29128b88545b4ae", "initiativeHash": "d11c3ca4c400bda6", "snapshots": 1, "patches": 1, "actionErrors": 0 }
]
```

Critérios de aceite do caos (mesmos do §14 do protocolo), todos verificados:

- os 6 clientes com a mesma `revision` (`0`) no snapshot inicial e com papéis
  `DM` + 5×`PLAYER`;
- `sessionPatch` (e não apenas evento legado) chegando aos 6 clientes;
- mesma entrada de iniciativa depois do avanço de turno;
- os 2 clientes reconectados com a revisão atual (`3`) após `requestResync`;
- exatamente 1 `ok` + 1 `CONFLICT` no `requestNextTurn` concorrente com
  `expectedRevision: 3`;
- `revision` (`4`), `tokenHash` (`b29128b88545b4ae`) e `initiativeHash`
  (`d11c3ca4c400bda6`) idênticos nos 7 clientes no fim;
- nenhum `actionError` inesperado.

> Os hashes mudam entre execuções porque os ids de token e de entrada de
> iniciativa são gerados pelo banco a cada rodada. O que importa é que **os
> hashes são iguais entre os 7 clientes** dentro da mesma execução.

### 5.1 Defeitos encontrados nos testes durante a validação

A execução contra o backend integrado encontrou **três defeitos nos próprios
testes** (e não no backend), corrigidos antes deste commit:

1. O teste de IDOR e o de `actionError` esperavam um **novo** `sessionSnapshot`
   depois de colocar o token. O caminho canônico é `sessionPatch`; o snapshot
   completo só vem por `requestResync`. Agora os dois testes pedem resync.
2. O teste de revisão monotônica esperava um snapshot novo após as mutações.
   Agora espera o `sessionPatch` com a revisão esperada.
3. O teste de mutação de DM rejeitada validava o snapshot antigo (o do join) em
   vez do snapshot do resync. Agora usa o último snapshot recebido e compara a
   revisão do ack do resync.

O harness de caos tinha duas falhas que só apareciam no caminho de sucesso
(`C5` e `C7` não eram registrados quando passavam); corrigido.

## 6. Decisões de implementação (para a revisão do PO)

1. **Tokens JWT assinados localmente** (HS256, payload `{ user: { id,
   username } }`, mesmo segredo do backend). Motivo: `limitLogin` permite 5
   logins a cada 5 min por IP e o bucket é compartilhado com
   `happy-path.spec.ts`; o harness precisa de 6+ tokens e não pode competir por
   essa cota. O token é validado contra `GET /api/tables/mytables` antes do
   uso (401 → mensagem explícita). O caminho de login real continua coberto
   por `happy-path.spec.ts`.
2. **Setup compartilhado entre workers com lock em disco**
   (`$TMPDIR/tavern-qa-setup`). Motivo: com `fullyParallel: true`, cada worker
   executaria o `beforeAll` e o `limitCreate` (20 por 5 min por IP) estouraria.
   O setup é criado uma vez por execução (3 usuários + 5 mesas) e validado
   antes do reuse (um arquivo de execução anterior é descartado porque as mesas
   não existem mais no Mongo novo).
3. **Mesas dedicadas por teste mutante** (A, B, C, D, E). Motivo: os testes
   rodam em paralelo e as asserções de "revisão não mudou" / "revisão
   monotônica" não podem ser interferidas por mutações de outro teste.
4. **Payload de `joinTable` sondado** (`{ tableId }` e, sem ack, `tableId`
   string). Motivo: o contrato não fixa o formato; o harness aceita os dois e
   reporta o que foi usado.
5. **`joinTable` de não-membro**: o teste usa um segundo mestre (`other`) que
   é DM de outra mesa e não participa da mesa alheia — assim o mesmo usuário
   serve aos testes de "não-membro" e de IDOR.

## 7. Lacunas conhecidas e riscos

| # | Lacuna | Impacto | Situação |
|---|---|---|---|
| L1 | Os testes só podem ser executados contra o protocolo integrado depois do merge de `restore/phase-1-backend` | — | **Resolvido**: validado contra `0f39f34` (§4.2) |
| L2 | `tests/e2e/global-setup.ts` encerra apenas o processo `npm`, não o processo filho (`ts-node`/`vite`) | Em execuções consecutivas o backend anterior pode ficar órfão na porta 3100 e a próxima execução falha com `EADDRINUSE` | **Defeito pré-existente**, fora do escopo desta branch. Correção sugerida: `spawn(..., { detached: true })` + `process.kill(-child.pid, 'SIGTERM')`, ou chamar o binário direto (`node_modules/.bin/ts-node`) em vez do wrapper `npm` |
| L3 | O ambiente de desenvolvimento não tem o binário do Chromium do Playwright | `happy-path.spec.ts` falha com `browserType.launch: Executable doesn't exist` | **Ambiente**, não código: `npx playwright install chromium`. O P1-QA-1/P1-QA-2 não usam navegador |
| L4 | O hash de tokens/iniciativa é calculado sobre o DTO do cliente, não sobre o banco | Divergência de campo entre DTO e banco não é detectada por este harness | Aceito nesta fase; o backend valida via `sessionSnapshot` |
| L5 | O harness de caos não exercita `requestRollDice`, `requestPing`, medições e auras | O roteiro do §14 cita "rolar dados" no passo 3 | Parcial: o item 3 do §14 ("mover token, avançar turno, rolar dados") não tem asserção própria aqui |
| L6 | O lock do setup compartilhado assume uma única execução do Playwright por máquina/porta | Duas execuções concorrentes no mesmo backend poderiam disputar o setup | Aceito: a porta 3100 já impede execuções concorrentes no mesmo host |
| L7 | `expectedRevision` só é exercitado em `requestNextTurn` | Outros eventos com CAS (`requestMoveToken`) não têm teste de conflito dedicado | Coberto indiretamente pelo IDOR e pelas revisões monotônicas |
| L8 | O backend integrado ainda não está no worktree de `tests/e2e` | O `global-setup.ts` do Playwright sobe o backend pré-Fase 1, então o comando padrão `npx playwright test` ainda reprova até o PO integrar a branch de backend nesta branch | O PO deve integrar `restore/phase-1-backend` (e depois a de frontend) na branch que contém esta entrega antes de rodar a suíte |
| L9 | O frontend da Fase 1 ainda não foi integrado | O P1-QA-1/P1-QA-2 não dependem do frontend (só REST + Socket.IO), mas o contrato do §15 (migração do store) não é verificado por esta entrega | Fora do escopo do P1-QA |

## 8. Como reexecutar

```bash
# 1. integrar as branches de backend/frontend na branch de integração
# 2. preparar o ambiente
cd backend && npm ci && npm run build
cd ../frontend && npm ci
cd ../tests/e2e && npm ci

# 3. type-check do spec
../../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json

# 4. suíte de autorização (sobe backend + frontend + mongo via global-setup)
npx playwright test specs/realtime-authz.spec.ts --reporter=list

# 5. caos headless (sobe o próprio backend)
node chaos/run.mjs
```

Se a execução anterior deixou o backend órfão na porta 3100 (L2):

```bash
pkill -f "ts-node src/server.ts" || true
pkill -f "vite --host 127.0.0.1 --port 4173" || true
```
