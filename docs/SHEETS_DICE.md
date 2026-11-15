# Fichas, Dados e Sistemas — Contrato da Fase 3

> Status: aprovado para implementação em 2026-11-15.
> Depende de `docs/REALTIME_PROTOCOL.md` (estado/revisão) e
> `docs/TABLE_MODE.md` (TV/celulares/geometria).
> Objetivo: ficha utilizável, PV sincronizado, dados server-authoritative,
> presets por sistema, log persistido — funcionando presencial **e online**.

## 1. Escopo e critério de saída

Uma mesa D&D 5e consegue, sem papel externo:

1. Criar/editar ficha (identidade, atributos, perícias, CA, PV, ataques,
   características, inventário, espaços de magia, notas).
2. Vincular ficha a token; PV/CA aparecem no token e no `/play`/TV.
3. Alterar PV na ficha ou no card e todos os clientes convergirem.
4. Rolar dados com presets do sistema; resultado no log de todos.
5. Recarregar/reconectar e recuperar ficha, PV e log.
6. Usar Cyberpunk RED como segundo sistema (d10 explosivo e presets).

**Fora do escopo:** automação completa de regras, compêndio de magias/itens,
multiclasse, níveis épicos, importação de fichas externas, VTT de mapas 3D.

## 2. Modelo de personagem

Estender `Character` (mantendo os campos atuais):

```ts
systemKey?: string;            // 'dnd5e' | 'cyberpunk-red' | ...
profile?: {
  className?: string;
  level?: number;
  race?: string;
  background?: string;
  alignment?: string;
  speed?: number;              // metros ou pés conforme sistema
  hitDice?: string;
};
proficientSaves?: string[];    // chaves de atributo
proficientSkills?: string[];   // chaves de perícia
expertiseSkills?: string[];
attacks?: Array<{ name: string; bonus?: string; damage?: string; notes?: string }>;
features?: Array<{ name: string; description?: string }>;
inventory?: Array<{ name: string; quantity?: number; notes?: string }>;
spellSlots?: Record<string, { used?: number; max?: number }>;
```

Manter:

```ts
name, avatarUrl, notes,
attributes: Record<string, number>,   // STR/DEX/... ou INT/REF/...
stats: { currentHP?, maxHP?, defense?, baseInitiative? },
skills: Record<string, number | string>,
```

Regras:

- `systemKey` é copiado do `Table.systemId` na criação; pode ser sobrescrito
  pelo DM.
- `stats.defense` é a CA/Defesa do sistema.
- `stats.currentHP` nunca > `stats.maxHP`; nunca < 0.
- `attributes` e `skills` são validados no servidor (números finitos).
- Ficha só é editável pelo dono ou DM; leitura completa só dono/DM.
- A TV e outros jogadores recebem apenas o **resumo** (nome, PV, CA, nível,
  token vinculado), não a ficha completa.

## 3. Protocolo de ficha em tempo real

### 3.1 Resumo no snapshot

Adicionar ao `sessionSnapshot`:

```ts
characters: CharacterSummaryDTO[];
```

```ts
type CharacterSummaryDTO = {
  _id: string;
  name: string;
  ownerId: string;
  systemKey?: string;
  level?: number;
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  tokenId?: string | null;
};
```

`sessionPatch.changes` ganha:

```ts
characters?: CharacterSummaryDTO[];          // substitui a lista
characterUpdates?: Array<{ characterId: string; patch: Partial<CharacterSummaryDTO> }>;
charactersRemoved?: string[];
```

### 3.2 Eventos

Todos exigem ack e revisão.

| Evento | Papel | Efeito |
|---|---|---|
| `requestCreateCharacter` | membro | cria ficha; patch `characters` |
| `requestUpdateCharacter` | dono/DM | atualiza ficha; patch `characterUpdates` + token summaries |
| `requestDeleteCharacter` | dono/DM | remove ficha; patch `charactersRemoved`; desvincula tokens |
| `requestUpdateCharacterHp` | dono/DM | atalho de PV; valida 0..maxHP; patch summary + tokens |

- `requestUpdateCharacter` recebe `{ tableId, characterId, patch }` com os
  campos do item 2; usa Zod; não aceita `ownerId`/`tableId` no patch.
- PV/CA atualizados refletem em **todos** os tokens vinculados via
  `tokenUpdates: [{ tokenId, patch: { character: summary } }]`.
- O `TokenDTO` ganha:

```ts
character?: {
  _id: string;
  name: string;
  currentHP?: number;
  maxHP?: number;
  defense?: number;
} | null;
```

- Eventos legados `characterUpdated` / `characterRemoved` podem existir para
  compatibilidade, mas o caminho canônico é `sessionPatch`.
- REST existente de personagens continua para leitura/criação/fallback; a UI
  usa socket quando conectada.

## 4. Ficha D&D 5e

Campos mínimo para o beta:

- Identidade: nome, classe, nível, raça, antecedente, alinhamento, avatar.
- Atributos: STR, DEX, CON, INT, WIS, CHA (valores crus).
- Modificadores calculados no cliente: `floor((score-10)/2)`.
- Bônus de proficiência: `2 + floor((level-1)/4)`.
- Testes de resistência: marcar proficiência por atributo.
- Perícias: lista padrão de D&D 5e com atributo associado, proficiência e
  expertise.
- Combate: CA, PV atual/máx/temporário (temporário pode ficar em `notes` se
  não couber no modelo), iniciativa, deslocamento, dados de vida.
- Ataques: nome, bônus, dano, notas.
- Características e traços.
- Inventário simples (nome, quantidade, notas).
- Espaços de magia por nível (usado/máx).
- Notas livres.

Cálculos no cliente em `frontend/src/services/characterMath.ts` (helper
compartilhado, escrito pelo PO):

```ts
abilityModifier(score): number
proficiencyBonus(level): number
savingThrow(score, proficient, level): number
skillBonus(score, proficient, expertise, level): number
passiveScore(score, proficient, expertise, level): number
formatModifier(value): string
DND_SKILLS: Array<{ key, label, ability }>
```

Sem automação de magias/compêndio.

## 5. Cyberpunk RED (segundo sistema)

- `systemKey: 'cyberpunk-red'`.
- Atributos: INT, REF, DEX, TECH, COOL, WILL, LUCK, MOVE, BODY, EMP.
- Perícias: pares chave/valor (o modelo `skills` já serve).
- Combate: PV, Defesa, Iniciativa, armadura (campo em `notes` ou atributo).
- Dados: `1d10!` (explosivo), `1d10!+mod`, dano `2d6`/`3d6`.
- Presets no seed do sistema.
- Sem automação completa de roles/cyberware no beta.

## 6. Dados server-authoritative

### 6.1 Limites

- Expressão: 1–80 caracteres.
- Máximo de dados por rolagem: **100**.
- Faces: 2–1000.
- Modificador: -1000..1000.
- Explosões por dado: no máximo **20** (evita loop infinito).
- Rejeitar `0d6`? Permitir e retornar total do modificador (comportamento atual),
  mas documentar.
- Rate limit por socket (ex.: 20 rolagens/10s) para evitar spam.

### 6.2 Sintaxe

Manter `NdM`, `kh/kl`, `adv/dis`, `+/-mod`. Adicionar:

- `!` explosivo: cada dado que tira o valor máximo rola de novo e soma; cap 20.
- `1d10!` é o caso Cyberpunk.
- `metadata`/`tags` continuam para vincular ficha/token/sistema.

### 6.3 Log

- Persistir `Roll` com userId, tableId, expressão, resultado, metadata,
  characterId/tokenId.
- `GET /api/tables/:tableId/rolls?limit=50&before=<ISO>` (membro) para
  histórico; mais recente primeiro.
- TTL de 7 dias (`expireAfterSeconds`) para o Atlas M0.
- `sessionSnapshot.recentRolls` com no máximo 50 rolagens para a TV/reconexão.
- `diceRolled` continua ao vivo; `revision` no payload.

## 7. Sistemas e presets

Criar `backend/src/services/systemSeedService.ts` e chamar no `startServer`:

- `dnd5e`: nome "D&D 5e", atributos STR/DEX/CON/INT/WIS/CHA, movimento
  30ft/5ft, presets:
  - `d20` (teste), `d20+5` (ataque exemplo), `2d6+3` (dano exemplo),
    `4d6kh3` (gerar atributo), `1d100` (percentual).
- `cyberpunk-red`: nome "Cyberpunk RED", atributos INT/REF/DEX/TECH/COOL/WILL/
  LUCK/MOVE/BODY/EMP, presets:
  - `1d10!` (teste), `1d10!+6` (exemplo), `2d6` (dano leve), `3d6` (dano médio).
- Seed idempotente (não sobrescreve sistemas existentes).
- Teste unitário do seed.

A UI de sistemas já lista; adicionar seleção de sistema na mesa se ainda não
estiver exposta.

## 8. UI

### 8.1 Ficha (`CharacterSheet.vue` e componentes)

- Layout desktop e mobile; abas ou seções: Identidade, Atributos/Perícias,
  Combate, Ataques, Características, Inventário, Magias, Notas.
- Modificadores e bônus calculados em tempo real.
- PV com botões `-`/`+` e input direto; salvar via socket.
- Indicador “somente leitura” para quem não é dono/DM.
- Avatar com fallback.
- Acessibilidade: labels, foco, contraste, alvos ≥44px no mobile.

### 8.2 Token ↔ ficha

- No `TokenEditForm`, permitir escolher ficha da mesa (DM) ou própria (jogador).
- Token card no `/play` mostra PV/CA/nome da ficha em tempo real.
- TV mostra PV no token/rail quando disponível.
- Ao desvincular/excluir ficha, token fica sem `characterId`.

### 8.3 Dados

- `DiceRoller` usa presets do sistema (já existe base).
- Botão “Rolar” com ack/erro visível.
- Histórico de rolagens no painel/TV, carregado via REST e atualizado por
  `diceRolled`.
- `DiceSandboxView` continua funcionando.

## 9. Testes

### Backend

1. Criar/atualizar/excluir ficha via socket com ack e revisão.
2. Jogador não edita ficha de outro; DM edita qualquer uma da mesa.
3. PV fora de 0..maxHP → `VALIDATION`.
4. PV atualizado propaga para todos os tokens vinculados no `sessionPatch`.
5. `sessionSnapshot.characters` inclui resumos; `TokenDTO.character` correto.
6. Dice: limites (101 dados, 1001 faces), explosão `1d10!` com cap, presets.
7. Roll log: GET membro, paginação, TTL index, `recentRolls` no snapshot.
8. Seed idempotente de D&D 5e e Cyberpunk RED.

### Frontend

1. `characterMath`: modificador, proficiência, saves, skills, passive.
2. Store aplica `characterUpdates`/`charactersRemoved`/`characters`.
3. Ficha D&D calcula e salva; PV chama socket.
4. Dice presets do sistema aparecem e rolam.
5. Log carrega e atualiza ao vivo.
6. `/play` mostra PV/CA do token.

### E2E (presencial + online)

1. DM cria ficha D&D, vincula token, define PV.
2. Jogador vê PV/CA no `/play` e na TV.
3. Jogador altera PV no card; DM/TV convergem.
4. Rolagem `2d6+3` aparece no log de todos e sobrevive a reload.
5. Troca para Cyberpunk RED; preset `1d10!` funciona.
6. Reconexão de jogador recupera ficha/PV/log.
7. Dois clientes remotos (mesmo cenário sem TV) — online-aware.

## 10. Arquivos e ownership

- Backend: models, DTO/assembler, services, socketHandlers, validation, routes,
  seed, tests.
- Frontend: services (character/dice/roll log), store, socketService,
  types, localDiceEngine, tests.
- UX: CharacterSheet, TokenCard/TokenEditForm, DiceRoller, roll log panel,
  PlayView/DisplayView HP, CSS/mobile.
- QA: E2E specs + report.
- PO: `docs/SHEETS_DICE.md`, `characterMath.ts` e testes.

## 11. Fora do escopo

- Compêndio completo de magias/itens.
- Automação de ataques contra CA, resistências, condições.
- Multiclasse, níveis 21+, gestão de XP.
- Importação/exportação de fichas externas.
- Voz/vídeo (Fase 5).
