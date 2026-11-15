# Modo Online e Comunicação — Avaliação e Plano

> Status: aprovado para planejamento em 2026-11-15.
> Depende de `docs/REALTIME_PROTOCOL.md` (estado) e `docs/TABLE_MODE.md`
> (mesa presencial). Esta frente cobre o jogo **100% remoto**, sem Discord,
> Zoom ou qualquer plataforma externa de voz/vídeo.

## 1. Veredito de viabilidade

**É viável.** A arquitetura recomendada para o beta é:

1. **WebRTC em malha (mesh) para áudio**, com vídeo opcional.
2. **Socket.IO existente como sinalização** (ofertas, respostas, ICE, estado).
3. **TURN gratuito** (Metered Open Relay, 20 GB/mês) para redes restritas.
4. **LiveKit como caminho de upgrade** (SFU) se a mesa crescer ou o upload
   apertar; LiveKit Cloud Build tem 5.000 minutos de WebRTC/mês grátis, e o
   servidor é open source (Apache 2.0) para self-host futuro.

Isso mantém **toda a experiência dentro do app**: a chamada, o mute, o deafen,
a câmera, o chat, os dados e o tabuleiro. O TURN/SFU é infraestrutura invisível,
não uma plataforma que o usuário abre.

### Por que mesh primeiro

- 1 Mestre + até 4 jogadores (5 pessoas) é o cenário realista do beta.
- Áudio Opus é leve; a malha evita servidor de mídia e custo.
- Não exige UDP no Render (que não suporta WebRTC/TURN).
- O código de sinalização e a UI são os mesmos se depois trocarmos para SFU.

### Limite do mesh

Cada participante envia uma cópia do seu áudio/vídeo para cada outro. Com 6
pessoas e vídeo ligado em todos, o upload de cada celular pode passar de
5–8 Mbps. Por isso:

- **Áudio é o padrão.**
- **Câmera é opcional e limitada** (360p/15fps, no máximo 2–3 câmeras ativas).
- **TV/display não entra na mídia** (só recebe tabuleiro).
- Se a mesa passar de 5 participantes com vídeo, migrar para LiveKit SFU.

## 2. Escopo funcional

### 2.1 Áudio

- Entrar/sair da chamada da mesa.
- Microfone on/off.
- Mutar/desmutar.
- **Deafen**: para de ouvir todos (e muta o próprio mic por padrão).
- Indicador de “falando” por participante.
- Volume individual por participante.
- Seleção de microfone e saída de áudio.
- Cancelamento de eco, supressão de ruído e ganho automático (padrões do browser).
- Push-to-talk opcional (tecla ou botão no mobile).
- Reconexão com ICE restart e reentrada automática.

### 2.2 Vídeo

- Câmera on/off.
- Seleção de câmera.
- Grade de vídeos + destaque do falante.
- Resolução/bitrate adaptativos (padrão 360p/15fps).
- Espelhamento local e indicador de câmera desligada.
- Sem gravação por padrão.

### 2.3 Compartilhamento de tela

- `getDisplayMedia` para o Mestre compartilhar mapa/handout.
- Botão “parar compartilhamento”.
- Aviso visível para todos quando a tela está sendo compartilhada.
- Sem captura de áudio do sistema no beta (opcional depois).

### 2.4 Chat de texto

- Chat por mesa, com mensagens de sistema (entrou/saiu, rolagem, turno).
- Menções `@usuário` e `@todos`.
- Histórico em memória + persistência Mongo com TTL (ex.: 7 dias).
- Enviar dados/links/imagens? Imagens ficam para a Fase 4.
- O chat não substitui o log de rolagens; complementa.

### 2.5 Presença e estado de mídia

Estender `presence`:

```ts
type MediaState = {
  mic: 'on' | 'muted';
  deafened: boolean;
  camera: 'on' | 'off';
  screen: boolean;
  speaking: boolean;
};
```

- `mediaStateUpdated` para a sala.
- “TV conectada” continua separado; display não tem mídia.
- Badge de conexão (direto/relay), latência e perda de pacotes.

### 2.6 Moderação e segurança

- Só DM/PLAYER entram na mídia; display e espectadores não.
- DM pode “mutar todos” localmente (não força o mic dos outros) e remover
  participante da chamada (kick da sala de mídia, não da mesa).
- Credenciais TURN de curta duração, emitidas por endpoint autenticado.
- Rate limit nos eventos de sinalização.
- Nenhuma gravação; mídia é DTLS-SRTP ponta a ponta entre peers (mesh).
- Não logar SDP/ICE completos em produção.

## 3. Arquitetura

```
┌────────────┐        Socket.IO (sinalização)         ┌────────────┐
│  Cliente A │ ◄────────────────────────────────────► │  Backend   │
│  (DM)      │                                        │  (Express) │
└─────┬──────┘                                        └─────┬──────┘
      │ WebRTC (áudio/vídeo)                                │
      │                                                     │
┌─────▼──────┐        WebRTC (áudio/vídeo)          ┌──────▼─────┐
│  Cliente B │ ◄────────────────────────────────────► │  Cliente C │
└────────────┘                                        └────────────┘
```

### 3.1 Sinalização (backend)

Novo `backend/src/socketHandlers/mediaHandlers.ts` e
`backend/src/services/mediaRoomService.ts`:

| Evento | Direção | Payload |
|---|---|---|
| `mediaJoin` | cliente → servidor | `{ tableId }` + ack |
| `mediaLeave` | cliente → servidor | `{ tableId }` + ack |
| `mediaPeerJoined` | servidor → sala | `{ tableId, peerId, userId, username, mediaState }` |
| `mediaPeerLeft` | servidor → sala | `{ tableId, peerId, userId }` |
| `mediaOffer` | ambos | `{ tableId, toPeerId, sdp }` |
| `mediaAnswer` | ambos | `{ tableId, toPeerId, sdp }` |
| `mediaIce` | ambos | `{ tableId, toPeerId, candidate }` |
| `mediaState` | cliente → servidor | `{ tableId, mic, deafened, camera, screen }` |
| `mediaSpeaking` | cliente → servidor | `{ tableId, speaking }` |
| `mediaStateUpdated` | servidor → sala | `{ tableId, peerId, userId, mediaState }` |
| `mediaScreenShare` | servidor → sala | `{ tableId, peerId, active }` |
| `mediaError` | servidor → cliente | `{ code, message }` |

Regras:

- `mediaJoin` só para membro da mesa; display → `FORBIDDEN`.
- Cada socket tem no máximo um `peerId` por mesa.
- O servidor só repassa SDP/ICE para membros da **mesma** mesa e para o
  `toPeerId` que pertence à sala.
- `mediaState` e `mediaSpeaking` são efêmeros (não incrementam `revision`).
- Ao desconectar, o servidor remove o peer e avisa a sala.
- Reconexão: o cliente reentra com `mediaJoin`, recria peers e faz ICE restart.

### 3.2 Cliente

Novo `frontend/src/services/mediaService.ts`:

- `join(tableId)`, `leave()`, `toggleMic()`, `toggleDeafen()`, `toggleCamera()`,
  `startScreenShare()`, `stopScreenShare()`, `setDevice(...)`.
- `RTCPeerConnection` por peer; **perfect negotiation** para evitar glare.
- `getUserMedia({ audio: {...}, video: ... })` só quando o usuário liga.
- `getDisplayMedia` para tela.
- `AudioContext` + `AnalyserNode` para detectar fala (threshold local).
- `iceServers` obtidos de `GET /api/tables/:tableId/ice-servers` (STUN/TURN).
- Estado reativo em `useMediaStore` (Pinia): peers, tracks, muted, deafened,
  camera, screen, speaking, connection quality.
- Componentes: `MediaDock`, `ParticipantGrid`, `MediaControls`,
  `DeviceSettings`, `ChatPanel` (texto).

### 3.3 TURN/STUN

Endpoint autenticado:

```http
GET /api/tables/:tableId/ice-servers
Authorization: Bearer <jwt>
200 {
  "iceServers": [
    { "urls": ["stun:stun.l.google.com:19302"] },
    { "urls": ["turn:...:443?transport=tcp"], "username": "...", "credential": "..." }
  ],
  "ttlSeconds": 3600
}
```

- `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` no `.env`.
- Para Metered Open Relay: 20 GB/mês grátis; usar credenciais estáticas
  (beta) ou API de credenciais temporárias.
- Para self-host: `deploy/coturn/docker-compose.yml` (perfil opcional) e
  documentação de portas UDP/TCP.
- Se não houver TURN configurado, o app funciona em LAN/STUN e avisa que
  redes restritas podem falhar.

### 3.4 Provider abstrato (upgrade para SFU)

```ts
interface MediaProvider {
  join(tableId: string): Promise<void>;
  leave(): Promise<void>;
  publish(track: MediaStreamTrack): Promise<void>;
  unpublish(track: MediaStreamTrack): Promise<void>;
  onPeerStream(cb: (peerId: string, stream: MediaStream) => void): void;
}
```

- `MeshMediaProvider` (padrão, sem servidor de mídia).
- `LiveKitMediaProvider` (fase futura; LiveKit Cloud free 5k min/mês ou
  self-host Apache 2.0).
- A UI consome o provider; trocar mesh → SFU não reescreve a chamada.

## 4. Free tier e custos

| Recurso | Free tier | Uso estimado | Risco |
|---|---|---|---|
| Metered Open Relay TURN | 20 GB/mês | áudio mesh ~0,4 GB/sessão de 60 min; vídeo ligado pode passar de 5 GB/sessão | priorizar áudio; TURN só quando P2P falha |
| LiveKit Cloud Build | 5.000 min WebRTC/mês | 6 pessoas × 60 min = 360 min/sessão → ~13 sessões/mês | fallback para SFU |
| Cloudflare Realtime TURN | grátis com SFU; senão US$ 0,05/GB | alternativa | avaliar se Metered apertar |
| STUN público | grátis | sempre | sem SLA; usar 2+ STUNs |
| Render free | web service 512 MB, sem UDP | sinalização/HTTP | não hospeda TURN/coturn; TURN é externo ou VPS |

Conclusão: **áudio + chat + tabuleiro é 100% gratuito no beta**. Vídeo em todas
as câmeras é o único item que pode estourar a cota; por isso o padrão é
áudio-first e câmera opcional. Se o grupo exigir vídeo em todos, migrar para
LiveKit SFU (5k min/mês) ou self-host coturn/LiveKit em VPS free.

## 5. Testes

### 5.1 Unitários/integração backend

- `mediaJoin` de membro → ok; não-membro/display → `FORBIDDEN`.
- SDP/ICE só são relayados para a mesma mesa e peer válido.
- `mediaState`/`mediaSpeaking` não incrementam `revision`.
- Desconexão remove peer e emite `mediaPeerLeft`.
- `GET /ice-servers` exige membro e devolve TURN configurado.

### 5.2 E2E online (Playwright + fake media)

Criar `tests/e2e/specs/online-call.spec.ts` em um projeto Playwright com flags:

```ts
launchOptions: {
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
}
```

Cenário:

1. DM + 2 jogadores em contextos separados (1280×800 e 390×844).
2. Todos entram na mesa por link/convite.
3. DM liga mic; jogadores veem “falando”/estado.
4. Jogador muta/desmuta; estado propaga.
5. Jogador liga câmera; peer recebe track de vídeo.
6. Deafen para de ouvir (estado visual + track remoto silenciado).
7. Compartilhamento de tela do DM (fake display media) aparece.
8. Chat: mensagem chega aos outros e ao log.
9. Derrubar um peer; reconectar; chamada volta e estado converge.
10. Loop de 30 min acelerado: tabuleiro + chamada + dados sem divergência.

Sem hardware real; usar mocks/fake devices. Testar pelo menos Chromium.
Documentar limitação de Safari/iOS.

### 5.3 Teste manual assistido

- Duas redes diferentes (Wi-Fi + 4G) para forçar TURN.
- Chrome/Edge/Firefox desktop e Safari iOS.
- Fones/eco, mute, deafen, troca de dispositivo.

## 6. Fases internas

| Subfase | Entrega | Critério |
|---|---|---|
| 5A | sinalização + presença de mídia + áudio mesh + mute/deafen | 2 clientes ouvem um ao outro; estado propaga |
| 5B | vídeo + câmera + seleção de dispositivo + indicador de fala | 2–3 câmeras simultâneas sem travar |
| 5C | compartilhamento de tela + chat persistido + moderação | tela e chat funcionam; DM remove peer |
| 5D | TURN/ICE restart + E2E online + teste em redes diferentes | 30 min, reconexão e relay funcionando |

## 7. Critérios de aceite da frente online

1. 1 Mestre + 4 jogadores remotos, 30–60 min, sem Discord/Zoom.
2. Áudio bidirecional com mute, deafen e indicador de fala.
3. Câmera opcional e compartilhamento de tela.
4. Chat de texto com histórico e mensagens de sistema.
5. Reconexão de rede sem perder tabuleiro, chamada ou turno.
6. TURN configurável e documentado; fallback claro quando não houver.
7. E2E online com fake media no CI para 2+ clientes.
8. Nenhum áudio/vídeo gravado; credenciais TURN curtas; sem logs de SDP.

## 8. Fora do escopo

- Gravação de sessão, streaming, telefonia, legendas automáticas.
- SFU em escala (dezenas de participantes).
- Fundos virtuais/IA de ruído.
- Vídeo 1080p em todos.
- App nativo.

## 9. Decisões pendentes (para o usuário)

1. **Quantos jogadores remotos** no beta? (Recomendado: 1 DM + 4.)
2. **Vídeo padrão ligado ou desligado?** (Recomendado: desligado; áudio-first.)
3. **Chat persistido por quanto tempo?** (Recomendado: 7 dias com TTL.)
4. **TURN**: criar conta gratuita Metered Open Relay ou self-host coturn?
   (Recomendado: Metered no beta; coturn opcional para LAN/VPS.)
5. **SFU**: aceitar LiveKit Cloud free como fallback ou só self-host?
   (Recomendado: aceitar como fallback, UI própria.)
6. **Compartilhamento de tela** é essencial no beta ou pode ficar para depois?
   (Recomendado: entra na 5C.)
