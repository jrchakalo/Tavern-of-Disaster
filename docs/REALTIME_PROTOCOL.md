# Protocolo Realtime — Fase 1

> Contrato entre backend e frontend. Mudou aqui? Atualize o documento e avise
> frontend/QA antes de implementar. Versão atual: `protocolVersion: 1`.
>
> Status: aprovado pelo PO em 2026-11-14.

## 1. Objetivo

Transformar a sincronização da mesa em um protocolo com estado autoritativo,
revisão monotônica, confirmação de ação e recuperação após reconexão.

Não-objetivos desta fase: fog of war, display token, presets de sistema, upload
de mapa, histórico persistente de rolagens.

## 2. Fonte da verdade

- O servidor é a única fonte de verdade.
- Toda mutação bem-sucedida incrementa `Table.revision` exatamente uma vez.
- Todo evento canônico carrega a revisão resultante.
- O cliente nunca autoriza nada com base no próprio estado.
- O cliente aplica estado somente se a revisão for maior que a atual; se houver
  buraco (`baseRevision` diferente), pede `requestResync`.

## 3. Papéis e permissões

| Papel | Como é resolvido | Pode |
|---|---|---|
| `DM` | `table.dm === userId` | tudo na mesa |
| `PLAYER` | `table.players` contém `userId` | ler, mover token próprio no turno, desfazer movimento próprio, rolar dados, medir, pingar, pedir resync |
| `DISPLAY` | token de display (Fase 2) | somente leitura; nesta fase não existe |
| `NONE` | não é membro | nada; `joinTable` retorna `FORBIDDEN` |

`you` no snapshot:

```ts
type SessionRole = 'DM' | 'PLAYER' | 'DISPLAY' | 'SPECTATOR';

type SessionYou = {
  userId: string;
  username: string;
  role: SessionRole;
  permissions: string[]; // ex.: ['session:write', 'token:move:any']
};
```

Permissões sugeridas:

- `session:write` (DM)
- `scene:write` (DM)
- `token:place` (DM)
- `token:move:any` (DM)
- `token:move:own` (PLAYER)
- `initiative:write` (DM)
- `initiative:advance:own` (PLAYER)
- `measure:write` (DM e PLAYER)
- `dice:roll` (DM e PLAYER)

O cliente usa `permissions` para esconder controles. O servidor **sempre**
revalida; permissão no cliente é UX, não segurança.

## 4. Revisão

Adicionar em `Table`:

```ts
revision: { type: Number, default: 0, min: 0 }
```

Serviço `revisionService`:

```ts
bumpRevision(tableId): Promise<number>   // findByIdAndUpdate({ $inc: { revision: 1 } }, { new: true })
getRevision(tableId): Promise<number>
assertExpectedRevision(tableId, expected?: number): Promise<void> // 409 CONFLICT se diferente
```

Regras:

1. Escrever o estado primeiro; incrementar a revisão depois, na mesma operação
   lógica.
2. Se a escrita falhar, não incrementar.
3. Se a revisão não puder ser lida, responder `INTERNAL`, nunca emitir evento
   sem revisão.
4. A revisão é por mesa, não por cena.
5. Eventos efêmeros (ping, medição compartilhada em andamento, transição) não
   incrementam revisão; eles não alteram estado persistente.
6. Status de sessão, cena ativa, tokens, iniciativa, medições persistentes e
   auras incrementam revisão.

## 5. Envelope de ação e ack

Toda ação do cliente que muda estado usa o evento existente + callback de ack:

```ts
socket.emit('requestMoveToken', payload, (ack: Ack) => { ... });
```

```ts
type AckOk = {
  ok: true;
  revision: number;
  serverNowMs: number;
};

type AckError = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;       // pt-BR, pronta para toast
    details?: unknown;     // nunca inclui segredo
  };
  revision: number;
  serverNowMs: number;
};

type Ack = AckOk | AckError;

type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';
```

Regras:

- Se o cliente passou callback, o servidor **deve** chamá-lo exatamente uma vez.
- Se não passou, o servidor emite `actionError` para o próprio socket:
  ```ts
  socket.emit('actionError', { event, error, revision, serverNowMs });
  ```
- `catch` vazio ou apenas `log.error` é proibido em handler de ação.
- `details` só para validação de campo; nunca token, senha ou stack.
- A revisão no ack é a revisão **depois** da mutação (ou a atual, se falhou).

## 6. Snapshot

Evento: `sessionSnapshot`

```ts
type SessionSnapshot = {
  protocolVersion: 1;
  tableId: string;
  revision: number;
  serverNowMs: number;
  you: SessionYou;
  presence: PresenceEntry[];
  table: TableInfoDTO;
  activeScene: SceneDTO | null;
  scenes: SceneDTO[];
  tokens: TokenDTO[];
  initiative: InitiativeEntryDTO[];
  measurements: MeasurementDTO[];
  auras: AuraDTO[];
  /** Últimas rolagens persistidas (retenção 7 dias). */
  recentRolls: RollLogEntryDTO[];
  /** Últimas ações de sessão persistidas, no máximo 50, mais antigas primeiro. */
  recentActions: SessionActionDTO[];
};

type SessionActionDTO = {
  id: string;
  type: 'system' | 'movement';
  content: string;
  authorId?: string;
  authorName?: string;
  revision?: number;
  createdAt: string;
};

type PresenceEntry = {
  userId: string;
  username: string;
  role: SessionRole;
  socketCount: number;
};
```

Quando é emitido:

- resposta a `joinTable` (após autorizar);
- resposta a `requestResync`;
- quando o servidor decide que um patch ficaria grande demais (ex.: troca de cena).

Não usar `initialSessionState`/`sessionStateUpdated` como fonte nova. Eles podem
continuar existindo como alias temporário, mas o frontend deve migrar para
`sessionSnapshot`/`sessionPatch` nesta fase.

## 7. Patch

Evento: `sessionPatch`

```ts
type SessionPatch = {
  protocolVersion: 1;
  tableId: string;
  revision: number;      // revisão depois da mudança
  baseRevision: number;  // revisão antes da mudança
  serverNowMs: number;
  changes: {
    table?: Partial<TableInfoDTO>;
    activeScene?: SceneDTO | null;
    scenes?: SceneDTO[];
    tokens?: TokenDTO[];                 // substitui a lista inteira
    tokenUpdates?: Array<{ tokenId: string; patch: Partial<TokenDTO> }>;
    tokensRemoved?: string[];
    initiative?: InitiativeEntryDTO[];   // substitui a lista inteira
    measurements?: MeasurementDTO[];     // substitui a lista inteira
    auras?: AuraDTO[];                   // substitui a lista inteira
    sessionStatus?: {
      status: string;
      pauseUntil: string | null;
      serverNowMs: number;
    };
  };
};
```

Regras de aplicação no cliente:

1. Se `revision <= currentRevision`, ignorar (evento atrasado/duplicado).
2. Se `baseRevision !== currentRevision` e `revision > currentRevision + 1`,
   pedir `requestResync` e **não** aplicar.
3. Se `baseRevision === currentRevision`, aplicar e setar `currentRevision`.
4. Listas enviadas em `changes` substituem a lista local inteira.
5. `tokenUpdates` aplica merge por `tokenId`; `tokensRemoved` remove.
6. Nunca aplicar patch de outra `tableId`.

Eventos granulares antigos (`tokenMoved`, `initiativeTurnAdvanced`, etc.) podem
continuar sendo emitidos por compatibilidade, mas **não podem** ser a única via
de atualização. O caminho canônico é `sessionPatch`.

## 8. Eventos cliente → servidor

Todos aceitam ack e `expectedRevision?` quando fazem sentido.

| Evento | Papel | Muda estado | Ack | Observações |
|---|---|---|---|---|
| `joinTable` | membro | não | sim | autoriza antes de `socket.join`; responde snapshot |
| `requestResync` | membro | não | sim | payload `{ tableId, sinceRevision? }`; responde snapshot |
| `requestSetActiveScene` | DM | sim | sim | valida cena da mesa |
| `requestUpdateSessionStatus` | DM | sim | sim | |
| `requestStartTransition` | DM | não | sim | efêmero |
| `requestSetMap` | DM | sim | sim | cena ativa da mesa |
| `requestReorderScenes` | DM | sim | sim | |
| `requestUpdateGridDimensions` | DM | sim | sim | |
| `requestUpdateSceneScale` | DM | sim | sim | |
| `requestUpdateScene` | DM | sim | sim | payload `{ tableId, sceneId, patch: { name?, type?, gridWidth?, gridHeight?, metersPerSquare? } }`; emite `sessionPatch` com `scenes`/`activeScene` |
| `requestPlaceToken` | DM | sim | sim | dono deve ser membro |
| `requestMoveToken` | DM ou dono no turno | sim | sim | `expectedRevision` |
| `requestAssignToken` | DM | sim | sim | novo dono deve ser membro |
| `requestEditToken` | DM | sim | sim | |
| `requestDeleteToken` | DM | sim | sim | payload `{ tableId, tokenId }`; resolve token → cena → mesa; emite `tokenRemoved` e, se havia entrada, `initiativeEntryRemoved` |
| `requestUndoMove` | DM ou dono | sim | sim | |
| `requestAddCharacterToInitiative` | DM | sim | sim | token da mesma cena |
| `requestNextTurn` | DM ou dono atual | sim | sim | conflito se revisão mudou |
| `requestResetInitiative` | DM | sim | sim | |
| `requestRemoveFromInitiative` | DM | sim | sim | remove **só** a entrada; nunca apaga o token |
| `requestReorderInitiative` | DM | sim | sim | |
| `requestEditInitiativeEntry` | DM | sim | sim | |
| `requestShareMeasurement` | membro | não | sim | efêmero |
| `requestAddPersistentMeasurement` | membro | sim | sim | |
| `requestRemovePersistentMeasurement` | dono/DM | sim | sim | |
| `requestClearAllMeasurements` | DM | sim | sim | |
| `requestUpsertAura` | dono do token/DM | sim | sim | |
| `requestRemoveAura` | dono do token/DM | sim | sim | |
| `requestPing` | membro | não | sim | |
| `requestRollDice` | membro | não | sim | resultado vai para o log |

## 9. Eventos servidor → cliente

| Evento | Quando | Payload |
|---|---|---|
| `sessionSnapshot` | join, resync, troca grande | `SessionSnapshot` |
| `sessionPatch` | toda mutação de estado | `SessionPatch` |
| `sessionAction` | ação de sessão registrada (cena, status, movimento, turno, ficha, remoção) | `SessionActionDTO` |
| `actionError` | ação sem ack falhou | `{ event, error, revision, serverNowMs }` |
| `presenceUpdated` | entra/sai socket | `{ tableId, presence, revision }` |
| `diceRolled` | rolagem | payload atual + `revision` |
| `tokenRemoved` | exclusão explícita de token (`requestDeleteToken`) | `{ tokenId, revision }` |
| `initiativeEntryRemoved` | remoção de entrada ou exclusão de token | `{ tableId, sceneId, revision, entryId, order }` |
| `pingBroadcast` | ping | payload atual (efêmero) |
| `measurementShared` | medição em andamento | payload atual (efêmero) |
| `measurementRemoved` | fim de medição | payload atual (efêmero) |
| `allMeasurementsCleared` | limpeza | payload atual |
| `sessionTransition` | transição de cena | `{ durationMs }` (efêmero) |
| `connect_error` | handshake | `err.data.code` = `TOKEN_EXPIRED` quando expirado |

## 10. Autorização por entidade

O servidor **nunca** confia no `tableId` do payload para autorizar.

Fluxo obrigatório:

```ts
// token
const token = await Token.findById(tokenId).populate('ownerId');
const scene = await Scene.findById(token.sceneId);
const table = await Table.findById(scene.tableId);
assertUserInTable(userId, table);
assertCondition(token.tableId.toString() === table._id.toString(), 'VALIDATION');

// cena
const scene = await Scene.findById(sceneId);
const table = await Table.findById(scene.tableId);
assertUserInTable(userId, table);

// entrada de iniciativa
const scene = await Scene.findById(sceneId);
const table = await Table.findById(scene.tableId);
const entry = scene.initiative.id(entryId);
```

Se o payload trouxer `tableId` e ele divergir da entidade, responder `FORBIDDEN`
(ou `VALIDATION`) sem vazar existência de outra mesa.

`joinTable`:

```ts
const table = await Table.findById(tableId).select('dm players');
assertUserInTable(userId, table); // 403 antes de socket.join
socket.join(tableId);
```

Também limitar tentativas de `joinTable` por socket (ex.: 10/min) para evitar
enumeração.

## 11. Turnos

- O servidor registra a ação de sessão após emitir o `sessionPatch` e transmite
  `sessionAction` para a sala inteira. O snapshot seguinte traz `recentActions`
  (máx. 50, mais antigas primeiro) além de `recentRolls`; o cliente substitui o
  histórico local pelo canônico no join/resync, sem duplicar.
- Exatamente uma entrada com `isCurrentTurn: true` ou nenhuma.
- `Scene.turnVersion` (novo, default 0) serve de CAS para avanço.
- `requestNextTurn`:
  1. valida que o usuário é DM ou dono do token da entrada atual;
  2. lê `scene.turnVersion`;
  3. calcula próxima entrada;
  4. `findOneAndUpdate({ _id, turnVersion }, { $set: { initiative }, $inc: { turnVersion: 1 } })`;
  5. se `null` → `CONFLICT` “O turno já foi avançado por outro cliente.”;
  6. se nova rodada, reseta movimento;
  7. incrementa revisão e emite `sessionPatch`;
  8. limpa medições efêmeras.
- Jogador só move token próprio e somente se a entrada atual for do token dele.
- DM pode mover qualquer token.
- Token sem dono só o DM move.
- `requestUndoMove` do jogador só no próprio token.

## 12. Reconexão e resync

Cliente:

1. Socket.IO conecta com `transports: ['websocket', 'polling']` e
   `tryAllTransports: true`.
2. No evento `connect`: `joinTable` com ack; se `FORBIDDEN`, mostra erro e
   desconecta.
3. Após join ok: `requestResync` com `sinceRevision`.
4. Em `visibilitychange` para visível, `focus` e `online`: se
   `Date.now() - lastSyncAt > 15s` ou status não conectado, `requestResync`.
5. Em `connect_error` com `TOKEN_EXPIRED`: chama refresh, atualiza o token e
   reconecta uma vez.
6. Enquanto reconecta, UI mostra banner “Reconectando…” com a última revisão.

Servidor:

1. `joinTable` é idempotente: pode ser chamado várias vezes no mesmo socket.
2. `requestResync` responde snapshot completo (não patch) e é sempre permitido
   para membro.
3. Toda sala é `io.to(tableId)`; ações do autor também passam pelo broadcast.
4. Presença é derivada dos sockets na sala; ao desconectar, remove o socket e
   emite `presenceUpdated`.

## 13. Refresh de JWT

- `POST /api/auth/refresh` com `Authorization: Bearer <token>` válido retorna
  `{ token }` com nova expiração (mesmo `JWT_EXPIRES_IN`, default 6h).
- Token expirado no handshake: `connect_error` com `err.data.code = 'TOKEN_EXPIRED'`.
- O cliente renova quando faltar 20% da validade ou ao receber `TOKEN_EXPIRED`.
- Nunca logar o token.

## 14. Testes obrigatórios

### Backend (2+ clientes)

1. `joinTable` de não membro → `FORBIDDEN`, socket não recebe snapshot.
2. Jogador da mesa A tenta mover token da mesa B → `FORBIDDEN`, token B intacto.
3. Jogador tenta `requestSetActiveScene` → `FORBIDDEN` com ack.
4. `requestMoveToken` sem ack callback → `actionError` no socket.
5. Duas mutações seguidas → revisão 1 e 2, snapshot com 2.
6. Dois `requestNextTurn` simultâneos → um `ok`, um `CONFLICT`.
7. Jogador tenta avançar turno que não é dele → `FORBIDDEN`.
8. Reconexão: cliente cai, volta, `requestResync` recebe revisão atual.
9. Refresh: token expirado → `TOKEN_EXPIRED`; refresh → conecta.

### Frontend

1. Patch com revisão menor é ignorado.
2. Patch com `baseRevision` errado dispara `requestResync` e não aplica.
3. Ack timeout vira toast, sem travar a UI.
4. Reconexão chama `joinTable` + `requestResync`.
5. `applySnapshot` substitui estado e seta revisão.

### Caos (6 clientes)

1. DM + 5 jogadores conectados.
2. Todos recebem o mesmo snapshot inicial.
3. Mover token, avançar turno, rolar dados.
4. Derrubar 2 sockets, reconectar, resync.
5. Dois `nextTurn` concorrentes.
6. Ao final: todos com a mesma `revision` e mesmo hash de tokens/iniciativa.
7. Nenhum `actionError` inesperado; nenhum erro de console não tratado.

## 15. Compatibilidade e migração

- O backend pode manter os eventos antigos por uma fase, mas o frontend deve
  consumir `sessionSnapshot`/`sessionPatch`.
- Se um evento antigo for mantido, ele deve carregar `revision` e não pode
  regredir o estado.
- `TableView` não deve ser reescrita nesta fase; ela continua lendo o store.
  O store é adaptado para aplicar snapshot/patch e continuar expondo as mesmas
  ações.
- Qualquer campo novo no DTO precisa entrar em `session.dto.ts`,
  `sessionAssembler.ts`, `frontend/src/types.ts` e neste documento.
