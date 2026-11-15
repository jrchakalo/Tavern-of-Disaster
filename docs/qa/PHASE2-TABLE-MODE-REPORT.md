# Relatório de QA — Fase 2 (modo mesa presencial)

> Codificado em: `restore/phase-2-qa` (P2-QA-1, P2-QA-2, P2-QA-3).
> Contrato de referência: `docs/TABLE_MODE.md` e `docs/REALTIME_PROTOCOL.md`.
>
> **Status em 2026-11-15: VALIDADO CONTRA A INTEGRAÇÃO.** A Fase 2 foi mesclada
> em `restore/phase-2-table-mode` (`e67e730`) e os dois specs passaram:
> **14/14** (`table-mode` 9/9 + `display-security` 5/5) em 38,7 s. O veredito
> final continua sendo do PO (§7). A execução de bloqueio contra a branch
> pré-integração fica preservada em §5.4 como histórico.

## 1. Escopo

| ID | Entrega | Arquivo | O que cobre |
|---|---|---|---|
| P2-QA-1 | E2E 1 TV + 5 celulares | `tests/e2e/specs/table-mode.spec.ts` | `TABLE_MODE.md` §7, §8 (itens 1–10) |
| P2-QA-2 | Segurança do display e geometria | `tests/e2e/specs/display-security.spec.ts` | `TABLE_MODE.md` §3.3, §3.4, §5.3 |
| P2-QA-3 | Relatório da fase | este arquivo | evidência e lacunas |

### 1.1 Cenários do `table-mode.spec.ts`

| # | Cenário | Asserção principal | Contrato |
|---|---|---|---|
| 1 | Contrato da Fase 2 | `POST /display-token` devolve `{ token, displayUrl }` (relativo ou absoluto); handshake com `displayToken` conecta | §3.2, §3.3 |
| 2 | TV 1920×1080 | `/display/:id#token=…` renderiza mesa/cena/iniciativa; **sem** `Mover`, `Encerrar turno`, `Rolar`, `.play-controls` nem `draggable`; revisão não muda na janela de observação | §7 |
| 3 | 5 celulares 390×844 | `/play/:id?invite=<code>` adiciona os 5 jogadores; header, board e ficha visíveis | §4.1, §6 |
| 4 | Convergência | TV + 5 celulares na mesma revisão; mesmos nomes/posições de token | §1 (critério 1) |
| 5 | Movimento do Mestre | token muda no servidor, na TV e nos celulares; revisão avança | §8 (item 5) |
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

## 2. Ambiente e versionamento

| Item | Valor |
|---|---|
| SO | Linux 7.2.9-100.fc43.x86_64 (x86_64) |
| Node / npm | v24.13.0 / 11.6.2 |
| Playwright | 1.57.0 (`tests/e2e/node_modules`) |
| Browser | Google Chrome do sistema (`E2E_CHANNEL=chrome`) |
| MongoDB | `mongodb-memory-server` com binário local via `MONGOMS_SYSTEM_BINARY` |
| Backend | `backend/src/server.ts` via `npm run start:test` (porta 3100) |
| Frontend | Vite (`npm run dev`, porta 4173) |
| Branch de QA | `restore/phase-2-qa` |
| Integração validada | `restore/phase-2-table-mode` @ `e67e730` (backend + frontend + UX; inclui o merge final da UX) |

Como a branch de QA antecede a integração, a execução foi feita a partir de um
worktree temporário em `e67e730` com os specs desta branch aplicados por cima.
Nenhum merge/push foi feito a partir da QA. Quando o PO integrar este commit na
branch de integração, o comando padrão abaixo roda direto no checkout normal.

## 3. Comandos

```bash
cd tests/e2e

# type-check dos specs (o pacote e2e não traz `typescript`; usa o do backend)
../../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json

# suíte contra a integração
MONGOMS_SYSTEM_BINARY=<repo>/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome \
npx playwright test specs/table-mode.spec.ts --reporter=list --workers=1

MONGOMS_SYSTEM_BINARY=<repo>/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome \
npx playwright test specs/display-security.spec.ts --reporter=list --workers=1
```

## 4. Resultado da integração (2026-11-15)

### 4.1 Type-check

| Comando | Resultado |
|---|---|
| `tsc --noEmit -p tsconfig.json` (backend tsc) | **OK**, sem erros |

### 4.2 Execuções

| Data | Comando | Resultado | Veredito |
|---|---|---|---|
| 2026-11-15 | `table-mode.spec.ts specs/display-security.spec.ts --reporter=list --workers=1` (`e67e730`) | **14 passed** em 38,7 s | **APROVADO** |
| 2026-11-15 | `table-mode.spec.ts --workers=1` (`e67e730`, subconjunto da execução acima) | **9/9** | **APROVADO** |
| 2026-11-15 | `display-security.spec.ts --workers=1` (`e67e730`, subconjunto da execução acima) | **5/5** | **APROVADO** |

Runtime da execução combinada: 38,7 s, dentro do alvo de <3 min.

### 4.3 Tabela de aceite

| Critério (`TABLE_MODE.md`) | Teste | Resultado |
|---|---|---|
| TV entra por token de display | table-mode §1/§2 | **PASS** |
| TV nunca muta | display-security §4 | **PASS** |
| Jogador entra por QR/convite | table-mode §3 | **PASS** |
| Geometria de grade em pings | display-security §1 | **PASS** |
| Ping fora do grid → `VALIDATION` | display-security §2 | **PASS** |
| 5 celulares + TV convergem | table-mode §4 | **PASS** |
| Turnos e erro fora do turno | table-mode §6 | **PASS** |
| Rolagem na TV | table-mode §7 | **PASS** |
| Reconexão sem divergência | table-mode §8 | **PASS** |
| 60 min sem divergência | table-mode §9 | **PASS** |

## 5. Evidência

### 5.1 `table-mode.spec.ts` (9/9)

```
✓ P2-QA-1 · contrato da Fase 2 está disponível (5ms)
✓ TV 1920×1080 entra por token, renderiza mesa/cena/iniciativa e não escreve (3.2s)
✓ 5 celulares 390×844 entram por /play/:id?invite= e veem o tabuleiro (5.9s)
✓ TV e os 5 celulares convergem na mesma revisão e no mesmo tabuleiro (729ms)
✓ movimento do Mestre atualiza todos os clientes (275ms)
✓ iniciativa: cada jogador move no próprio turno; fora do turno é rejeitado (3.1s)
✓ rolagem de dados aparece no log da TV (98ms)
✓ recarregar 2 celulares e a TV recupera a mesma revisão (1.4s)
✓ loop acelerado de 60 minutos (24 iterações) termina com revisão e hashes iguais (4.5s)
9/9 passed (execução combinada: 14 passed em 38,7 s)
```

Os logs de `ServiceError: Você só pode mover no seu turno.` (status 403) no teste
de iniciativa são **esperados**: são as tentativas fora do turno que o teste
exige que sejam rejeitadas, com revisão inalterada.

### 5.2 `display-security.spec.ts` (5/5)

```
✓ ping válido em coordenadas de grade chega a 2 clientes com os mesmos x/y (19ms)
✓ ping fora do grid responde VALIDATION e não gera broadcast (1.2s)
✓ token de display entra só na mesa dona e recebe role DISPLAY sem permissões (148ms)
✓ display não consegue mutar estado e a revisão permanece intacta (249ms)
✓ token rotacionado e token revogado falham no handshake com UNAUTHENTICATED (61ms)
5/5 passed (execução combinada: 14 passed em 38,7 s)
```

Os logs de `Ping fora dos limites da grade.` e `A TV não pode entrar em outra
mesa`/`ressincronizar outra mesa` também são **esperados**: são as asserções
negativas do contrato.

### 5.3 Correções feitas nesta revisão

| # | Sintoma | Correção |
|---|---|---|
| 1 | `TypeError: Invalid URL` na TV | `new URL(w.displayUrl, getBaseUrl())` aceita `displayUrl` relativo (`/display/:id#token=…`) e absoluto. A navegação usa `pathname + hash`, preservando o frontend local. |
| 2 | Falso negativo no movimento do Mestre | `styleBefore` do token da TV era lido **depois** do movimento (já atualizado). Passou a ser lido antes do `requestMoveToken`. |
| 3 | Texto do estado do turno | A UX integrada mostra `Seu turno` (não `Sua vez`) em `.token-card__status`; a asserção foi alinhada ao contrato visual atual. |

Nenhuma dessas correções mascara comportamento: todas são ajustes do próprio
teste, e o comportamento de produto foi validado nas asserções seguintes.

### 5.4 Histórico — execução pré-integração (bloqueada)

Antes do merge da Fase 2, a mesma suíte rodava contra `8c62df2` e falhava como
esperado:

| Superfície | Evidência |
|---|---|
| P2-BE-1 | `POST /api/tables/:id/display-token` → 404 |
| P2-FE-3 | `/play?invite=` não adicionava jogadores; `joinTable` 403 |
| P2-BE-4 | ping fora do grid → `ok:true` + broadcast |
| P2-BE-4 | `pingBroadcast` sem `revision` |

Esses itens foram resolvidos pela integração (`bba3d1d`, com o merge final da UX
em `e67e730`) e agora passam nos testes acima.

## 6. Decisões de implementação

1. **JWT assinado localmente** (HS256, payload `{ user: { id, username } }`) para
   os usuários do cenário. Motivo: `limitLogin` permite 5 logins/5 min por IP;
   tentar logar 6 vezes pela UI estouraria a cota e criaria flakiness. O token é
   usado no `localStorage` dos contextos mobile e nos sockets de controle.
   `happy-path.spec.ts` continua cobrindo o login real.
2. **Sem dependência nova.** Reaproveita `socket.io-client` e `@playwright/test`
   já presentes em `tests/e2e/package.json`.
3. **Bloqueio explícito, não silencioso.** O primeiro teste de cada spec falha
   com a lista de superfícies ausentes quando o contrato não está disponível.
4. **Retries desligados nos dois describes** (`retries: 0`). Além de evitar
   mascarar flakiness, o cenário cria 6 usuários + 1 mesa (table-mode) e 3
   usuários + 3 mesas (display-security), o que consumiria o bucket
   `limitCreate` (20/5 min) em uma repetição.
5. **Ordem serial** (`mode: 'serial'`) porque os testes compartilham um mundo
   (mesa, tokens, sockets e páginas). Executar com `--workers=1`.
6. **`expectedRevision`** é enviado em `requestMoveToken` do Mestre e no loop,
   exercitando o CAS previsto no protocolo.
7. **`displayUrl` relativo é o caso normal** em dev/teste (sem
   `PUBLIC_APP_URL`/`CORS_ORIGIN`); o spec aceita relativo e absoluto.

## 7. Campos para a execução final do PO

| Campo | Valor |
|---|---|
| Data/hora da execução | 2026-11-15 |
| Commit de integração validado | `e67e730` (`restore/phase-2-table-mode`) |
| `npx playwright test specs/table-mode.spec.ts --workers=1` | **9/9** (subconjunto da execução combinada) |
| `npx playwright test specs/display-security.spec.ts --workers=1` | **5/5** (subconjunto da execução combinada) |
| Suíte completa (`npx playwright test`, paralela) | _(pendente — 14 passed em 38,7 s com `--workers=1`)_ |
| `revision` final | _(não impressa; a igualdade entre os 6 clientes é asserida no teste de loop)_ |
| `tokenHash` final | _(não impresso; a igualdade entre os 6 clientes é asserida no teste de loop)_ |
| `initiativeHash` final | _(não impresso; a igualdade entre os 6 clientes é asserida no teste de loop)_ |
| `actionError` inesperados | **0** nas asserções dos testes |
| Veredito do PO | _(pendente)_ |

## 8. Lacunas e riscos conhecidos

| # | Lacuna / risco | Impacto | Situação |
|---|---|---|---|
| L1 | Fase 2 não integrada na branch de QA | — | **Resolvido**: validado contra `e67e730` |
| L2 | Seletores acoplados ao DOM atual (`play-header__revision`, `display-header__revision`, `board-token`, `display-board__token`, `token-card__status`) | Ajustes de UX podem quebrar o E2E | Alinhado à UX integrada; revisar em mudanças visuais |
| L3 | A execução usa `pathname + hash` de `displayUrl` com o `E2E_BASE_URL` | Se o backend devolver outro host, o teste continua no frontend local (intencional) | Documentado |
| L4 | Rotação/revogação só derruba a TV no próximo handshake | Sockets já conectados continuam até reconectar (aceito no §3.4) | Coberto como o contrato permite |
| L5 | Rate limit `limitCreate` (20/5 min) compartilhado | Duas execuções seguidas completas podem estourar | `retries: 0`; reiniciar o backend reseta o bucket |
| L6 | `global-setup.ts` pode deixar processos filhos órfãos (L2 da Fase 1) | `EADDRINUSE` em execuções consecutivas | Defeito pré-existente; ver `PHASE1-CHAOS-REPORT.md` L2 |
| L7 | O cenário de 60 min usa 24 iterações de sockets + UI | Não mede tempo real nem latência p95 | O critério de "60 min" é acelerado, como no plano §5 |
| L8 | Hashes finais não são impressos no reporter `list` | O PO não vê os valores no log padrão | As igualdades são asseridas entre os 6 clientes; imprimir valores é melhoria futura |
| L9 | Sem screenshots versionados | `test-results/` é ignorado pelo Git | Evidência textual neste relatório; traces locais em `test-results/` |

## 9. Como reexecutar depois de integrar esta QA

```bash
# 1. O PO integra restore/phase-2-qa na branch de integração.
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
npx playwright test specs/table-mode.spec.ts --reporter=list --workers=1

MONGOMS_SYSTEM_BINARY=<repo>/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome \
npx playwright test specs/display-security.spec.ts --reporter=list --workers=1

# 5. Preencher a tabela do §7 com a saída real.
```

Se uma execução anterior deixar processos órfãos:

```bash
pkill -f "ts-node src/server.ts" || true
pkill -f "vite --host 127.0.0.1 --port 4173" || true
```
