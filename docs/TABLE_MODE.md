# Modo Mesa Presencial — Contrato da Fase 2

> Status: aprovado para implementação em 2026-11-14.
> Depende de `docs/REALTIME_PROTOCOL.md` (Fase 1, `protocolVersion: 1`).
> Tag da fase anterior: `v0.9.2-phase1`.

## 1. Objetivo e critério de saída

Uma mesa presencial completa: **1 TV read-only + 5 celulares**, 60 minutos
simulados, tabuleiro idêntico em todos os dispositivos, turnos funcionando e
entrada por QR sem digitar IDs.

Critérios de aceite:

1. A TV entra por um **token de display**, não pela conta do Mestre.
2. A TV nunca consegue mutar estado (nem por bug de UI, nem por socket manual).
3. O jogador entra escaneando um QR e cai no `/play/:tableId` já como membro.
4. Tokens, pings, medições e auras usam **coordenadas de grade** em todos os
   clientes, independentes de resolução/zoom.
5. O jogador vê ficha resumida (nome, PV/máx, defesa, movimento) e consegue
   mover no próprio turno, rolar dados e encerrar o turno.
6. A TV mostra mapa, iniciativa, rolagens e status; nunca controles de escrita.
7. Reconexão de qualquer cliente não deixa estado divergente.

## 2. Rotas e papéis

| Rota | Papel | Autenticação | Escrita |
|---|---|---|---|
| `/table/:id` | DM | JWT | total |
| `/play/:id` | PLAYER | JWT | token próprio no turno, dados, medições |
| `/display/:id` | DISPLAY | token de display | **nenhuma** |

`SessionRole` já inclui `DISPLAY`; nesta fase ele passa a existir de verdade.
`permissions` do display é `[]`.

## 3. Token de display

### 3.1 Modelo

Adicionar em `Table`:

```ts
displayTokenHash?: string | null;
displayTokenRotatedAt?: Date | null;
```

- Token em texto claro: 32 bytes aleatórios, base64url.
- Persistir apenas `sha256(token)`; nunca logar o token.
- Um token por mesa; rotacionar invalida o anterior imediatamente.
- `displayTokenRotatedAt` para auditoria/exibição.

### 3.2 REST

Todas exigem JWT e DM da mesa.

| Método | Rota | Efeito |
|---|---|---|
| `POST` | `/api/tables/:tableId/display-token` | gera/rotaciona e devolve `{ token, displayUrl }` |
| `DELETE` | `/api/tables/:tableId/display-token` | revoga (hash = null) |

`displayUrl` é `${origin}/display/:tableId#token=<token>`; o fragmento não vai
para o servidor HTTP nem para referrer.

### 3.3 Socket

Handshake aceita:

```ts
auth: { token: '<jwt>' }              // usuário normal
auth: { displayToken: '<token>' }     // TV
```

- `displayToken` resolve a mesa dona; inválido → `connect_error` com
  `err.data.code = 'UNAUTHENTICATED'`.
- `socket.data.user = { id: 'display:<tableId>', username: 'TV' }` (id sintético,
  nunca corresponde a um usuário real).
- `socket.data.displayTableId = tableId`.
- `joinTable` e `requestResync` só são permitidos para `displayTableId`.
- Qualquer outro evento de mutação → `FORBIDDEN`/`actionError`; o handler genérico
  de authz já rejeita porque o id sintético não é membro. O handler de display
  deve falhar **antes** de qualquer escrita.
- Snapshot para display: `you.role = 'DISPLAY'`, `permissions = []`, presença
  inclui a TV com role `DISPLAY`.
- Presença do display entra/sai como qualquer socket (username `TV`).

### 3.4 Segurança

- Token de display não pode ser usado para `joinTable` de outra mesa.
- Token rotacionado/revogado derruba a TV no próximo handshake; sockets já
  conectados podem continuar até reconectar. Aceitável nesta fase.
- Não colocar o token em logs, query string HTTP ou localStorage permanente.
  Guardar em `sessionStorage` do display e no fragmento da URL.
- Rate limit no endpoint de geração (reutilizar `limitCreate`).

## 4. Entrada por QR

### 4.1 Jogador

QR gerado pelo Mestre com:

```text
${origin}/play/:tableId?invite=<inviteCode>
```

Fluxo:

1. Jogador escaneia; se não estiver logado, o router redireciona para
   `/login?redirect=<rota>` e volta depois do login.
2. `PlayView` lê `invite`; se o usuário ainda não é membro, chama
   `POST /api/tables/join` com `{ inviteCode }` (endpoint existente).
3. Em caso de sucesso, conecta no socket e entra na mesa.
4. Erro de convite inválido/expirado → toast + botão “Voltar”.

### 4.2 TV

QR gerado pelo Mestre com a `displayUrl` acima. A TV abre, lê o fragmento
`#token=...`, guarda em `sessionStorage` e conecta com `displayToken`.

### 4.3 Painel do Mestre

Novo componente `TableSharePanel.vue` (ou equivalente) no painel do Mestre:

- QR do jogador + botão “Copiar link”.
- QR da TV + botão “Copiar link” + “Rotacionar token” (com confirmação).
- Estado: “TV conectada” quando houver presença `DISPLAY`.
- Quando não houver token, botão “Gerar token da TV”.

Dependência nova permitida: `qrcode` (MIT) + `@types/qrcode` no frontend.
Justificativa: geração offline, sem serviço externo, funciona na rede local.

## 5. Geometria canônica

### 5.1 Unidade

Toda coordenada de estado/efeito no fio é **unidade de grade**:

```ts
type GridPoint = { x: number; y: number };
// x=0.5, y=0.5 é o centro da primeira célula.
// x=gridWidth, y=gridHeight é a borda inferior direita.
```

Não usar pixels de dispositivo, `clientX`, `clientY`, `getBoundingClientRect` ou
zoom no payload.

### 5.2 Helpers compartilhados

Criar `frontend/src/services/gridGeometry.ts` (base da fase) com funções puras:

```ts
pixelToGrid(point, squareSize): GridPoint
gridToPixel(point, squareSize): GridPoint
clampGridPoint(point, gridWidth, gridHeight): GridPoint
squareIdToGrid(squareId, gridWidth): { col, row, index }
gridToSquareId(point, gridWidth, gridHeight): string | null
distanceInSquares(a, b): number       // Chebyshev
distanceInMeters(a, b, metersPerSquare): number
```

Testes unitários cobrem conversão, clamp, squareId e distância.

### 5.3 Pings

`requestPing` passa a enviar:

```ts
{ tableId, sceneId, x: number, y: number, color?: string }
```

- `x/y` em unidades de grade, validados no backend contra `gridWidth/gridHeight`
  da cena ativa (`0 <= x <= width`, idem y).
- Fora dos limites → `VALIDATION`, sem broadcast.
- `pingBroadcast` ecoa os mesmos valores + `revision` atual.
- O cliente converte pixel local → grade com `gridGeometry` antes de emitir.
- `GridMeasurementLayer` passa a tratar `x/y` sempre como grade (remover o
  heurístico `xIsGrid`/`yIsGrid` depois que todos os clientes estiverem na
  mesma versão; manter fallback por uma fase se necessário).

### 5.4 Medições e auras

- Medições já são enviadas em unidades de grade; validar `0..width/height`.
- Auras usam `radiusMeters`; o cliente converte para células com
  `metersPerSquare` usando o helper.
- Nenhum overlay pode usar `devicePixelRatio` para posicionar estado.

## 6. `/play/:tableId`

### 6.1 Dados

Ler do `tableStore`: mesa, cena, tokens, iniciativa, turno atual, revisão, papel,
presença, status. Buscar a ficha resumida via REST existente
`GET /api/tables/:tableId/characters/my` e casar `token.characterId`.

Card do jogador:

- Nome do token/personagem.
- PV atual / máximo e defesa (somente leitura nesta fase).
- Movimento restante / total em metros e em quadrados.
- Indicador “Seu turno” / “Aguardando”.
- Botões: Mover, Dados, Encerrar turno.

### 6.2 Movimento

- Só arma o modo de movimento se `isMyTurn` e token próprio.
- Toque em célula → `gridToSquareId` → `requestMoveToken` com
  `expectedRevision` atual.
- Feedback imediato: célula destacada, custo em metros/quadrados.
- Toque fora do alcance → não emite; mostra motivo.
- Servidor continua sendo a autoridade; erro vira toast.

### 6.3 Mobile

- `100dvh`, safe areas, sem scroll horizontal.
- Alvos ≥ 44×44 px.
- `touch-action: none` no tabuleiro durante arraste/medição.
- Tratar `pointercancel` e `lostpointercapture` restaurando o estado.
- Long-press (500 ms) em token para detalhes; não disparar contexto nativo.
- `prefers-reduced-motion` respeitado.

## 7. `/display/:tableId`

- Lê `#token=...`; se ausente, mostra “TV não configurada” + instrução.
- Conecta com `displayToken`; sem JWT.
- Layout 16:9: mapa ocupa o centro, rail de iniciativa, log de rolagens, nome da
  cena, status e revisão.
- Fullscreen API; botão some/desabilita se não suportado.
- **Nenhum** emit de mutação. Nenhum `draggable`, `contextmenu` de escrita,
  botão de mover/turno/dados.
- Se sessão não estiver `LIVE`, mostra “Aguardando o Mestre”.
- Reconexão automática; se token for revogado, mostra “Token da TV inválido”.

## 8. Testes obrigatórios

### Backend

1. DM gera token; token em claro não é persistido; hash confere.
2. Rotacionar invalida o token anterior.
3. Revogar invalida.
4. Socket com `displayToken` entra na mesa certa e recebe snapshot
   `you.role = 'DISPLAY'`, `permissions = []`.
5. Display não consegue `requestMoveToken`, `requestNextTurn`,
   `requestSetActiveScene` nem `requestResync` de outra mesa → `FORBIDDEN`.
6. `requestPing` com coordenada fora do grid → `VALIDATION`, sem broadcast.
7. `requestPing` válido chega em todos os clientes com x/y de grade.

### Frontend

1. `gridGeometry` (conversão, clamp, squareId, distância).
2. `socketService.connectDisplay` usa `displayToken` e não JWT.
3. `PlayView` com `invite` chama join quando necessário e entra.
4. `TableSharePanel` gera links/QR corretos e rotaciona token.
5. `DisplayView` não chama nenhum método de mutação.

### E2E / caos

Cenário `table-mode` com Playwright:

1. DM cria mesa/cena/token e gera token de TV.
2. 1 contexto TV (1920×1080) abre `/display/:id#token=...`.
3. 5 contextos mobile (390×844) entram por `/play/:id?invite=...`.
4. Todos recebem o mesmo snapshot e `revision`.
5. DM move token; todos convergem.
6. Cada jogador move no seu turno; fora do turno recebe erro visível.
7. Dados aparecem no log da TV.
8. TV não tem botões de escrita e não emite mutação.
9. Derrubar 2 celulares e a TV; reconectar; todos convergem.
10. Loop acelerado de 60 “minutos” (rodadas/ações) sem divergência de revisão
    nem hash de tokens/iniciativa.

## 9. Fora do escopo

- Ficha completa editável (Fase 3).
- Upload de mapa pelo celular (Fase 4).
- Fog of war, templates avançados.
- Deploy (Fase 5).
- Múltiplas TVs por mesa.
