# Fase 5 — Online e comunicação: relatório de QA

> Branch: `restore/phase-5-online`. Contrato: `docs/PHASE5_ONLINE_CALL.md`
> sobre `docs/ONLINE_MODE.md`. Data: 2026-11-16.
> Veredito do PO: **aprovado**.

## 1. Escopo validado

- WebRTC mesh áudio-first (1 DM + 4 jogadores; limite de 8 peers).
- Sinalização Socket.IO com `RTCSessionDescriptionInit`, ICE relay, estado de
  mic/deafen/câmera/tela e indicador de fala.
- Mute, deafen, câmera, compartilhamento de tela, seleção de dispositivos.
- Chat por mesa com histórico Mongo (TTL 7 dias), menções, não lidas e
  mensagens de sistema locais.
- TURN/STUN configuráveis por endpoint autenticado; fallback sem TURN visível.
- Reconexão de socket/peer sem perder tabuleiro, chamada, chat ou turno.
- TV continua fora da mídia.

## 2. Evidência de execução

| Gate | Resultado |
|---|---|
| Backend (`npm test`) | **27 suites, 224/224** |
| Backend (`npm run build`) | `tsc` limpo |
| Frontend (`npm run test:unit`) | **40 arquivos, 308/308** |
| Frontend (`npm run type-check`) | `vue-tsc --build` limpo |
| Frontend (`npm run build`) | Vite OK |
| E2E online novo (`online-call`) | **10/10** |
| E2E completo (11 specs) | **67/67**, 0 falhas, 0 skips |
| Caos | **14/14 PASS**, `result: PASS` |

Fake media flags: `--use-fake-device-for-media-stream`,
`--use-fake-ui-for-media-stream`, `--autoplay-policy=no-user-gesture-required`,
`--auto-select-desktop-capture-source=Entire screen`,
`--enable-usermedia-screen-capturing`; permissões de mic/câmera.

## 3. Cobertura do E2E online

1. DM + 2 jogadores (um mobile) entram na chamada; 3 tiles e 2 `<audio>`
   remotos com track de áudio em todos os clientes.
2. Mute e unmute propagam o badge.
3. Deafen silencia os `<audio>` remotos e **não** incrementa revisão.
4. Câmera liga/desliga; peer recebe track de vídeo e placeholder ao desligar.
5. Compartilhamento de tela do DM **verificado headless**; ambos os jogadores
   recebem track de vídeo; parar remove o estado.
6. Chat `@todos` chega, destaca menção, badge de não lidas limpa ao abrir,
   histórico sobrevive a reload e não incrementa revisão.
7. `mediaKick` do DM remove só da chamada; alvo continua na mesa/tabuleiro.
8. Reconexão do jogador volta a 3 peers, recupera histórico e mantém revisão.
9. Loop acelerado de 10 iterações (tabuleiro + chat + mic) converge em DM,
   dois jogadores e TV.
10. Authz: display `mediaJoin` FORBIDDEN; não-membro FORBIDDEN; offer
    cross-table `NOT_FOUND`/`CONFLICT`.

## 4. Correções feitas durante a fase

- **SDP:** backend aceita/relaya `{ type, sdp }` (antes só string, o que
  quebrava toda chamada real).
- Falha de ack em offer/answer agora aparece na UI; não há mais chamada
  “conectada” silenciosamente sem áudio.
- Sinalização inbound usa `fromPeerId` (bug de contrato cliente/servidor).
- Throttle de fala ≤2/s para respeitar o rate limit.
- Testes E2E ajustados para reentrada após reload e orçamento de movimento.

## 5. Limitações conhecidas (não bloqueiam o beta)

- Mesh apenas; SFU/LiveKit fica como interface futura para mesas maiores.
- TURN estático por env (Metered no beta), sem credenciais temporárias via API.
- Sem UI de kick na chamada; o backend e o E2E usam `mediaKick` via socket.
- Mensagens de sistema do chat são locais (não persistidas), conforme contrato.
- Limite de 3 câmeras simultâneas é recomendação operacional, não bloqueio
  técnico.
- Teste manual em redes diferentes/4G e Safari/iOS continua recomendado antes
  de produção.

## 6. Veredito

Critérios de `docs/PHASE5_ONLINE_CALL.md` §6 cobertos no E2E com fake media:
áudio bidirecional, mute/deafen/fala, câmera, tela, chat, reconexão, authz,
sem revisão indevida e sem regressão nas fases anteriores. **Fase 5 aprovada.**
