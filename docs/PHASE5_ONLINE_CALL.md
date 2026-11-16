# Fase 5 — Online e comunicação: contrato

> Status: **implementado e aprovado** em `v0.9.7-phase5` (2026-11-16).
> Evidência: `docs/qa/PHASE5-ONLINE-CALL-REPORT.md`.
> Branch: `restore/phase-5-online`. Base: `docs/ONLINE_MODE.md`.
> Objetivo: mesa 100% remota dentro do app — áudio, vídeo opcional, tela, chat,
> mute/deafen, TURN e reconexão — sem Discord/Zoom.

## 1. Decisões

| Tema | Decisão |
|---|---|
| Topologia | **WebRTC mesh** (áudio-first); SFU/LiveKit fica como interface futura |
| Participantes | 1 DM + até 4 jogadores (limite duro de 8 peers por mesa) |
| Vídeo | **desligado por padrão**; 360p/15fps quando ligado; máx. 3 câmeras ativas |
| TV/display | **não entra na mídia** (só tabuleiro) |
| Chat | texto por mesa, TTL **7 dias** no Mongo, histórico via REST |
| TURN | STUN público + TURN estático por env (`TURN_URLS`/`TURN_USERNAME`/`TURN_CREDENTIAL`); Metered no beta |
| Gravação | nenhuma; sem logs de SDP/ICE completos |
| Estado | mídia/chat são **efêmeros** e não incrementam `revision` |
| Sistema | D&D/OP2/OPSH não mudam; a chamada é agnóstica de sistema |

## 2. Backend — sinalização

Novo `socketHandlers/mediaHandlers.ts` + `services/mediaRoomService.ts`.
Sala em memória: `tableId -> Map<peerId=socket.id, { userId, username, mediaState }>`.

Eventos (todos com `tableId`):

| Evento | Direção | Payload |
|---|---|---|
| `mediaJoin` | cliente → servidor | `{ tableId }` + ack |
| `mediaLeave` | cliente → servidor | `{ tableId }` + ack |
| `mediaRoomState` | servidor → cliente que entrou | `{ tableId, peers: MediaPeer[] }` |
| `mediaPeerJoined` | servidor → sala | `{ tableId, peer }` |
| `mediaPeerLeft` | servidor → sala | `{ tableId, peerId, userId }` |
| `mediaOffer` | peer → peer | `{ tableId, toPeerId, sdp: { type:'offer', sdp:string } }` |
| `mediaAnswer` | peer → peer | `{ tableId, toPeerId, sdp: { type:'answer', sdp:string } }` |
| `mediaIce` | peer → peer | `{ tableId, toPeerId, candidate }` |
| `mediaState` | cliente → servidor | `{ tableId, mic, deafened, camera, screen }` |
| `mediaSpeaking` | cliente → servidor | `{ tableId, speaking }` |
| `mediaStateUpdated` | servidor → sala | `{ tableId, peerId, userId, mediaState }` |
| `mediaKicked` | servidor → alvo | `{ tableId, reason }` |
| `mediaError` | servidor → cliente | `{ code, message }` |

```ts
type MediaState = {
  mic: 'on' | 'muted';
  deafened: boolean;
  camera: 'on' | 'off';
  screen: boolean;
  speaking: boolean;
};
type MediaPeer = { peerId: string; userId: string; username: string; mediaState: MediaState };
```

Regras:

- `mediaJoin`/`mediaLeave`/`mediaState`/`mediaSpeaking`: só membro da mesa;
  display → `FORBIDDEN`; `mediaJoin` idempotente; máximo 8 peers.
- SDP/ICE só são relayados para peer da **mesma** mesa; payloads limitados
  (SDP ≤ 64 KB, candidate ≤ 4 KB) e sem log de conteúdo. O SDP viaja como
  `RTCSessionDescriptionInit` (`{ type, sdp }`), a mesma forma do browser.
- Falha de ack em `mediaOffer`/`mediaAnswer` aparece na UI; a chamada não pode
  ficar “conectada” sem áudio em silêncio.
- Rate limit de sinalização (120 eventos/10 s por socket) e de estado (20/10 s).
- `mediaState`/`mediaSpeaking` não incrementam revisão e não geram
  `sessionPatch`.
- Desconexão remove o peer e emite `mediaPeerLeft` para a sala.
- `mediaKick`: somente DM; remove só da mídia (não da mesa), emite
  `mediaKicked` ao alvo.
- Reconexão: cliente chama `mediaJoin`, recebe `mediaRoomState` e recria peers.

### 2.1 ICE/TURN

`GET /api/tables/:tableId/ice-servers` (membro):

```ts
{
  iceServers: RTCIceServer[];
  ttlSeconds: number;       // 3600 (informativo)
  mode: 'mesh';
  turnConfigured: boolean;
  maxPeers: number;         // 8
}
```

- STUN: `STUN_URLS` (CSV) ou dois STUNs públicos.
- TURN: `TURN_URLS` (CSV) + `TURN_USERNAME`/`TURN_CREDENTIAL`.
- Sem TURN: responde STUN e `turnConfigured:false`; a UI avisa que redes
  restritas podem falhar.
- Nunca logar credenciais TURN.

## 3. Backend — chat

Modelo `ChatMessage`:

```ts
{
  tableId; userId; username; text; mentions: string[];
  kind: 'user' | 'system';
  createdAt; // TTL 7 dias
}
```

- `requestSendChatMessage` `{ tableId, text, mentions? }` + ack:
  - membro; display não envia; texto 1..1000, sem HTML (render escapado);
  - rate limit 10/10 s; persiste e emite `chatMessage` para `io.to(tableId)`;
  - não incrementa `revision`.
- `GET /api/tables/:tableId/chat?limit=50&before=<ISO>` (membro): histórico
  mais recente primeiro, máximo 100; o cliente ordena para exibir.
- Mensagens de sistema (entrou/saiu/rolagem/turno) podem ser geradas pelo
  cliente a partir de presença/roll log; não são persistidas nesta fase.
- Reconexão: cliente busca o histórico REST; mensagens ao vivo continuam no
  socket.

## 4. Frontend

### 4.1 Serviço/store

- `services/mediaService.ts`: mesh com `RTCPeerConnection` por peer,
  **perfect negotiation**, ICE restart, `getUserMedia` (audio-first),
  `getDisplayMedia`, mute/deafen, câmera, seleção de dispositivo, detecção de
  fala (`AudioContext`/`AnalyserNode`), reconexão.
- `stores/mediaStore.ts` (Pinia): peers, streams, estados, falando, qualidade
  (`getStats`), erro, `joined`, `connecting`.
- `services/chatService.ts` + `stores/chatStore.ts`: mensagens, histórico,
  envio, não lidas, menções.
- `socketService` ganha métodos e listeners para os eventos acima; não usa
  `revision`/`sessionPatch`.

### 4.2 UI

- `components/media/MediaDock.vue`: entrar/sair da chamada, mic, deafen,
  câmera, tela, configurações, contagem, estado de conexão/erro.
- `components/media/ParticipantGrid.vue`: tiles locais/remotos, vídeo, anel de
  fala, ícones de mute/câmera, destaque de tela compartilhada, áudio remoto
  (`<audio autoplay>` respeitando deafen).
- `components/media/DeviceSettings.vue`: microfone/câmera/saída.
- `components/chat/ChatPanel.vue`: mensagens, input, menções, histórico,
  estado vazio/erro, badge de não lidas; mensagens de sistema locais.
- Integrar em `/table/:id` (DM) e `/play/:id` (jogador); **não** na TV.
- Mobile: dock inferior com safe areas; chat em bottom sheet; alvos ≥44 px;
  erros de permissão visíveis.
- Áudio-first: câmera só liga por ação explícita; tela só pelo botão.
- Se `turnConfigured:false`, aviso discreto “redes restritas podem falhar”.

## 5. Testes

### 5.1 Backend

- `mediaJoin`: membro ok; não-membro/display `FORBIDDEN`; limite de peers.
- Relay de offer/answer/ice só na mesma mesa e peer válido; cross-table
  bloqueado; payload grande rejeitado; rate limit.
- `mediaState`/`mediaSpeaking` não incrementam revisão; desconexão remove peer
  e emite `mediaPeerLeft`; DM kick.
- Chat: broadcast, persistência/TTL, histórico, authz, rate limit, sem revision.
- `GET /ice-servers`: authz, STUN padrão, TURN configurado.

### 5.2 E2E online (fake media)

Playwright com `--use-fake-device-for-media-stream`,
`--use-fake-ui-for-media-stream`, `--autoplay-policy=no-user-gesture-required`,
permissões de mic/câmera e fake screen share.

- DM + 2 jogadores, 2 contextos remotos + mobile.
- Entrar na chamada, mic on, peers recebem áudio; mute/deafen propagam.
- Câmera liga e peer recebe track de vídeo.
- Tela do DM aparece para os outros.
- Chat chega, persiste e sobrevive a reload/reconexão.
- Derrubar peer, reconectar; chamada e estado convergem.
- Loop de 30 min acelerado sem divergência de tabuleiro/revisão.

## 6. Critérios de aceite

- [x] 1 DM + 4 jogadores remotos por 30–60 min sem Discord/Zoom (E2E
      acelerado com fake media; teste manual fica documentado).
- [x] Áudio bidirecional, mute, deafen e indicador de fala.
- [x] Câmera opcional e compartilhamento de tela.
- [x] Chat com histórico, menções e mensagens de sistema locais.
- [x] Reconexão sem perder tabuleiro, chamada ou turno.
- [x] TURN configurável; fallback claro sem TURN.
- [x] E2E online com fake media no CI para 2+ clientes.
- [x] Nenhuma gravação; sem SDP/ICE/credenciais em logs.
- [x] D&D/OP2/OPSH e fases anteriores verdes; caos 14/14.

## 7. Quadro de coders

| ID | Entrega | Área |
|---|---|---|
| F5-BE-1 | sinalização mesh, sala, estado, kick, ICE/TURN | backend |
| F5-BE-2 | chat persistido + REST + rate limit | backend |
| F5-FE-1 | serviço/store de mídia + dock/grid/settings | frontend |
| F5-FE-2 | chat UI + integração nas views + mobile | frontend |
| F5-QA-1 | E2E fake media + chat + reconexão + caos | QA |

## 8. Fora de escopo

- Gravação, streaming, legendas, fundos virtuais.
- SFU em escala/LiveKit nesta fase (interface fica preparada).
- Vídeo 1080p em todos e áudio de sistema no screen share.
