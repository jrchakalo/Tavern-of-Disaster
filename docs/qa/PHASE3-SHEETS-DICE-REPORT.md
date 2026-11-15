# Relatório de QA — Fase 3 (fichas, dados e sistemas)

> Codificado em: `restore/phase-3-qa` (P3-QA-1, P3-QA-2, P3-QA-3).
> Contrato de referência: `docs/SHEETS_DICE.md` sobre
> `docs/REALTIME_PROTOCOL.md` e `docs/TABLE_MODE.md`.
>
> **Status em 2026-11-15: BLOQUEADO (pré-integração).** A branch de QA saiu de
> `main`/`dcfb40a`, que contém apenas contrato e tipos compartilhados; backend,
> frontend e UX da Fase 3 ainda não estão nesta branch. Os specs foram
> executados e falham com a lista de superfícies ausentes (§5.4). **Nenhum
> "pass" foi fabricado.** O veredito final é do PO após a integração (§7).

## 1. Escopo

| ID | Entrega | Arquivo | O que cobre |
|---|---|---|---|
| P3-QA-1 | E2E presencial de ficha/PV/dados/sistemas | `tests/e2e/specs/sheets-dice.spec.ts` | `SHEETS_DICE.md` §1, §2, §3, §6, §7, §8 e §9 (E2E 1–6) |
| P3-QA-2 | E2E online-aware com 2 clientes remotos | `tests/e2e/specs/sheets-dice-online.spec.ts` | `SHEETS_DICE.md` §1/§9 (E2E 7) + `ONLINE_MODE.md` (mesmas rotas, sem TV) |
| P3-QA-3 | Relatório da fase | este arquivo | evidência, lacunas e campos do PO |

### 1.1 Cenários do `sheets-dice.spec.ts`

| # | Cenário | Asserção principal | Contrato |
|---|---|---|---|
| 1 | Contrato da Fase 3 | seeds `dnd5e`/`cyberpunk-red`; `Character.systemKey/profile`; `sessionSnapshot.characters`; `TokenDTO.character`; `requestUpdateCharacterHp` responde ack | §2, §3.1, §3.2, §7 |
| 2 | DM + jogador criam fichas D&D | DM cria `Kael` e jogador cria `Nyx` via REST; DM vincula `Kael` a token; card do jogador e TV mostram nome/PV/CA; DM abre a ficha pelo link da iniciativa | §2, §4, §8.2 |
| 3 | Jogador altera PV | edição na ficha do `/play`; servidor, ficha do DM, card e TV convergem; revisão igual no jogador e na TV | §3.2, §8.1, §8.2 |
| 4 | Validação de PV | `PV > maxHP` e `PV < 0` via socket → `VALIDATION`; UI mostra toast; estado e revisão intactos | §2, §3.2, DoD |
| 5 | Rolagem `2d6+3` | aparece no log do DM (`.log-entry`) e da TV (`.roll-log__item`); REST persiste; TV recupera após reload | §6.3, §8.3 |
| 6 | Cyberpunk RED | troca de sistema; preset `1d10!` aparece e rola; explosão comprovada com `100d2!` (P(sem explosão) = 2⁻¹⁰⁰) | §5, §6.2, §7 |
| 7 | Reconexão do jogador | contexto fechado e reaberto; card, PV, ficha e log REST recuperados; revisão converge | §1 (critério 5), §9 (E2E 6) |
| 8 | Cross-table | jogador da mesa A não altera ficha da mesa B via socket (duas combinações de `tableId`) nem via REST; revisão/HP da mesa B intactos | `REALTIME_PROTOCOL.md` §10 |

### 1.2 Cenários do `sheets-dice-online.spec.ts`

| # | Cenário | Asserção principal | Contrato |
|---|---|---|---|
| 1 | Entrada remota | DM em `/table/:id`; jogador em `/play/:id?invite=...`; ambos recebem a mesa e o card com resumo da ficha | §1, §3.1, §3.2, `ONLINE_MODE.md` |
| 2 | PV entre clientes | DM altera PV na ficha; servidor, ficha do DM e card remoto convergem; revisão do `/play` acompanha | §3.2 |
| 3 | Dados remotos | DM rola `2d6+4`; o socket do jogador recebe `diceRolled`; log do DM mostra; REST do jogador persiste | §6.3, §8.3 |
| 4 | Reconexão remota | contexto do jogador fechado/reaberto; card/PV/revisão/log REST convergem sem TV | §9 (E2E 7) |

## 2. Ambiente e versionamento

| Item | Valor |
|---|---|
| SO | Linux 7.2.9-100.fc43.x86_64 (x86_64) |
| Node / npm | v24.13.0 / 11.6.2 |
| Playwright | 1.57.0 (`tests/e2e/node_modules`) |
| Browser | Google Chrome do sistema (`E2E_CHANNEL=chrome`) |
| MongoDB | `mongodb-memory-server`, binário local `mongod-x64-fedora-7.0.24` |
| Backend | `backend/src/server.ts` via `npm run start:test` (porta 3100) |
| Frontend | Vite (`npm run dev`, porta 4173) |
| Branch de QA | `restore/phase-3-qa` @ `dcfb40a` |
| Integração alvo | `restore/phase-3-sheets-dice` (backend/frontend/UX ainda não mesclados) |

## 3. Comandos

```bash
cd tests/e2e

# type-check dos specs (o pacote e2e não traz `typescript`; usa o do backend)
../../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json

# suíte presencial
MONGOMS_SYSTEM_BINARY=<repo>/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome \
npx playwright test specs/sheets-dice.spec.ts --reporter=list --workers=1

# suíte online-aware
MONGOMS_SYSTEM_BINARY=<repo>/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome \
npx playwright test specs/sheets-dice-online.spec.ts --reporter=list --workers=1

# as duas juntas (após a integração)
MONGOMS_SYSTEM_BINARY=<repo>/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome \
npx playwright test specs/sheets-dice.spec.ts specs/sheets-dice-online.spec.ts --reporter=list --workers=1
```

`--workers=1` é obrigatório: os describes são `serial` e compartilham mesa,
fichas, tokens, sockets e páginas. Retries estão desligados (`retries: 0`).

## 4. Type-check

| Comando | Resultado |
|---|---|
| `../../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json` | **OK**, sem erros (2026-11-15) |

## 5. Resultado atual (pré-integração)

### 5.1 Tabela de execução

| Data | Comando | Resultado | Veredito |
|---|---|---|---|
| 2026-11-15 | `tsc --noEmit -p tsconfig.json` | sem erros | **PASS** (harness compila) |
| 2026-11-15 | `playwright test specs/sheets-dice.spec.ts --workers=1` | 1 falha de contrato + 7 não executados | **BLOCKED** |
| 2026-11-15 | `playwright test specs/sheets-dice-online.spec.ts --workers=1` | 1 falha de contrato + 3 não executados | **BLOCKED** |

O tempo de setup + bloqueio ficou abaixo de 30 s por spec. O alvo de <3 min só
pode ser medido com as features integradas.

### 5.2 Tabela de aceite (preenchida somente com evidência real)

| Critério (`SHEETS_DICE.md`) | Teste | Resultado atual |
|---|---|---|
| Seed D&D 5e e Cyberpunk RED | sheets-dice §1, §6 | **BLOCKED** (seed ausente) |
| `Character.systemKey`/`profile` | sheets-dice §1 | **BLOCKED** |
| `sessionSnapshot.characters` | sheets-dice §1 | **BLOCKED** |
| `TokenDTO.character` (PV/CA no token) | sheets-dice §1, §2 | **BLOCKED** |
| Ficha editável e PV via socket | sheets-dice §3 | **BLOCKED** (evento ausente) |
| Validação 0..maxHP | sheets-dice §4 | **BLOCKED** |
| Rolagem server-authoritative + log | sheets-dice §5 | **BLOCKED** (depende do harness) |
| Preset `1d10!` / explosão | sheets-dice §6 | **BLOCKED** |
| Reconexão sem divergência | sheets-dice §7 | **BLOCKED** |
| Cross-table ficha | sheets-dice §8 | **BLOCKED** |
| Online-aware (2 clientes) | sheets-dice-online §1–4 | **BLOCKED** |

### 5.3 Evidência do type-check

```
$ ../../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json
(sem saída — exit 0)
```

### 5.4 Evidência do bloqueio (saída real, resumida)

`specs/sheets-dice.spec.ts`:

```
✘  1 [chromium] › P3-QA-1 · contrato da Fase 3 está disponível
-  2 .. 8 (não executados; describe serial)

Error: Fase 3 incompleta — superfícies ausentes:
PUT /api/tables/:id/system respondeu 404; a mesa não conseguiu usar "dnd5e" (§7). |
GET /api/systems/key/dnd5e não encontrou o seed de D&D 5e (§7). |
GET /api/systems/key/cyberpunk-red não encontrou o seed de Cyberpunk RED (§7). |
Character.systemKey não foi copiado do Table.systemId (Kael=undefined, Nyx=undefined) (§2). |
Character.profile (classe/nível) não persistiu (§2/§4). |
sessionSnapshot.characters ausente (§3.1). |
TokenDTO.character ausente ou sem currentHP (§3.2). |
requestUpdateCharacterHp não respondeu ok em nenhuma forma de payload (§3.2).

1 failed, 7 did not run
```

`specs/sheets-dice-online.spec.ts`:

```
✘  1 [chromium] › P3-QA-2 · dois clientes remotos entram por convite e recebem a ficha
-  2 .. 4 (não executados; describe serial)

Error: Fase 3 online incompleta:
Character.systemKey não foi copiado do Table.systemId (veio undefined) (§2). |
sessionSnapshot.characters ausente no modo online (§3.1). |
TokenDTO.character ausente/sem currentHP no modo online (§3.2). |
requestUpdateCharacterHp não respondeu ok (§3.2).

1 failed, 3 did not run
```

O `PUT /api/tables/:id/system` responde 404 porque a rota procura
`System.findOne({ key: 'dnd5e' })` e o seed ainda não existe nesta branch; não é
uma falha da rota em si.

## 6. Decisões de implementação do harness

1. **JWT assinado localmente** (HS256, `{ user: { id, username } }`, mesmo
   segredo de `global-setup.ts`) para os usuários do cenário. Evita competir com
   o bucket de login REST e segue o padrão dos specs das Fases 1 e 2.
2. **Sem dependência nova.** Reaproveita `@playwright/test`, `socket.io-client` e
   `mongodb-memory-server` já presentes em `tests/e2e/package.json`.
3. **Bloqueio explícito.** O primeiro teste de cada spec falha com a lista de
   superfícies ausentes; os demais não executam por causa do `mode: 'serial'`.
4. **Criação de ficha via REST no harness.** O contrato §3.2 permite REST como
   fallback. Os eventos de socket são exercitados onde são canônicos:
   `requestUpdateCharacterHp` (PV), `requestRollDice` (dados) e
   `requestUpdateCharacter` (cross-table).
5. **Atalho de PV com payload sondado.** `docs/SHEETS_DICE.md` §3.2 não fixa o
   payload de `requestUpdateCharacterHp`. O harness tenta, em ordem,
   `currentHP`, `hp`, `value`, `newHP`, `patch.currentHP`, `stats.currentHP`,
   `patch.stats.currentHP` e `newCurrentHP`, e
   memoriza a primeira forma que recebe `ok:true`. Se nenhuma funcionar, o
   contrato é reportado como ausente — sem fallback silencioso para REST.
6. **Explosão determinística.** `1d10!` é validado na UI/preset, mas a
   probabilidade de explodir em uma única rolagem é 10%. A prova de explosão usa
   `100d2!` (P(sem explosão) = 2⁻¹⁰⁰) e aceita as duas representações possíveis:
   dados extras no array `rolls` ou `value > face`.
7. **Online sem TV.** O segundo spec usa dois contextos de navegador
   independentes e as mesmas rotas do modo presencial, como exige
   `ONLINE_MODE.md`. A ficha online é do DM; o jogador recebe o resumo pelo
   token (`TokenDTO.character`), testando o recorte de privacidade do §2.

## 7. Campos para a execução final do PO

| Campo | Valor |
|---|---|
| Data/hora da execução | 2026-11-15 (pré-integração) |
| Branch de QA | `restore/phase-3-qa` @ `dcfb40a` |
| Commit de integração validado | **pendente** (`restore/phase-3-sheets-dice`) |
| `tsc --noEmit -p tsconfig.json` | **PASS** |
| `npx playwright test specs/sheets-dice.spec.ts --workers=1` | **BLOCKED** (1 failed, 7 did not run) |
| `npx playwright test specs/sheets-dice-online.spec.ts --workers=1` | **BLOCKED** (1 failed, 3 did not run) |
| Runtime das duas execuções bloqueadas | <30 s por spec |
| Veredito do PO | **PENDENTE** |
| Observações do PO | preencher após a integração |

## 8. Lacunas e riscos conhecidos

| # | Lacuna / risco | Impacto | Situação |
|---|---|---|---|
| L1 | Fase 3 não integrada na branch de QA | Specs bloqueiam por contrato | **Aberto**; reexecutar após o merge |
| L2 | Seletores de ficha/card/TV (`character-sheet`, `token-card__hp`, `character-link`, `system-preset-btn`) dependem da UX da Fase 3 | Ajuste visual pode quebrar o E2E | O harness usa fallbacks por role/label e falha com mensagem do contrato; revisar na integração |
| L3 | Abertura da ficha no `/play` não tem seletor fixado no contrato | Se a UX não tornar o card/link clicável, o teste falha | **Intencional**: §8.1/§8.2 exigem ficha acessível ao jogador |
| L4 | Log de rolagens no `/play` não é exigido pelo harness | O teste usa DM/TV para UI e REST para o jogador | `SHEETS_DICE.md` §8.3 fala em “painel/TV”; o painel do jogador é desejável, mas não bloqueia o aceite atual |
| L5 | Explosão usa RNG real | `1d10!` isolado pode não explodir | Mitigado com `100d2!`; a UI prova o preset e o payload prova a mecânica |
| L6 | Ficha online pertence ao DM | O jogador não edita a ficha online no P3-QA-2 | Cobre o resumo privado do §2; a edição pelo jogador já é coberta no P3-QA-1 |
| L7 | `openDmCharacterSheet` depende do link da iniciativa (`.character-link`) | Mudança de classe quebra o caminho | Há fallback por texto na iniciativa e clique no toggle do painel; reportar se a UX mudar |
| L8 | Sem screenshots versionados | `test-results/` é ignorado pelo Git | Evidência textual neste relatório; traces locais disponíveis |

## 9. Como reexecutar depois de integrar esta QA

```bash
# 1. O PO integra restore/phase-3-qa na branch restore/phase-3-sheets-dice.
# 2. Dependências:
cd backend && npm ci
cd ../frontend && npm ci
cd ../tests/e2e && npm ci

# 3. Type-check dos specs:
cd tests/e2e
../../backend/node_modules/.bin/tsc --noEmit -p tsconfig.json

# 4. Execução:
MONGOMS_SYSTEM_BINARY=<repo>/backend/node_modules/.cache/mongodb-memory-server/mongod-x64-fedora-7.0.24 \
E2E_CHANNEL=chrome \
npx playwright test specs/sheets-dice.spec.ts specs/sheets-dice-online.spec.ts \
  --reporter=list --workers=1

# 5. Preencher §5 e §7 com a saída real. Não copiar "PASS" sem execução.
```

Se uma execução anterior deixar processos órfãos:

```bash
pkill -f "ts-node src/server.ts" || true
pkill -f "vite --host 127.0.0.1 --port 4173" || true
```
