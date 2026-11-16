import { Server, Socket } from 'socket.io';
import {
  getMediaPeer,
  joinMediaRoom,
  kickMediaPeer,
  leaveMediaRoom,
  removeSocketFromMedia,
  setMediaSpeaking,
  updateMediaState,
} from '../services/mediaRoomService';
import type { MediaPeer } from '../services/mediaRoomService';
import { assertUserInTable, assertUserIsDM, getTableById } from '../services/tableService';
import { assertCondition } from '../services/serviceErrors';
import { getRevision } from '../services/revisionService';
import { createSlidingWindowRateLimiter } from '../services/socketRateLimiter';
import { extractAck, runAction } from './ack';
import { createLogger } from '../logger';
import { validate } from '../validation/validate';
import {
  zMediaIcePayload,
  zMediaJoinPayload,
  zMediaKickPayload,
  zMediaLeavePayload,
  zMediaSignalPayload,
  zMediaSpeakingPayload,
  zMediaStatePayload,
} from '../validation/schemas';

/** Sinalização (offer/answer/ice): 120 eventos por 10s por socket. */
export const mediaSignalRateLimiter = createSlidingWindowRateLimiter({
  limit: Number(process.env.MEDIA_SIGNAL_RATE_LIMIT_POINTS ?? 120),
  windowMs: Number(process.env.MEDIA_SIGNAL_RATE_LIMIT_WINDOW_MS ?? 10_000),
});

/** Estado de mídia (mic/deafen/camera/screen): 20 eventos por 10s por socket. */
export const mediaStateRateLimiter = createSlidingWindowRateLimiter({
  limit: Number(process.env.MEDIA_STATE_RATE_LIMIT_POINTS ?? 20),
  windowMs: Number(process.env.MEDIA_STATE_RATE_LIMIT_WINDOW_MS ?? 10_000),
});

/** Indicador de fala: 20 eventos por 10s por socket. */
export const mediaSpeakingRateLimiter = createSlidingWindowRateLimiter({
  limit: Number(process.env.MEDIA_SPEAKING_RATE_LIMIT_POINTS ?? 20),
  windowMs: Number(process.env.MEDIA_SPEAKING_RATE_LIMIT_WINDOW_MS ?? 10_000),
});

const SIGNAL_RATE_LIMITED_MESSAGE = 'Muitos eventos de sinalização em pouco tempo. Aguarde alguns segundos.';
const STATE_RATE_LIMITED_MESSAGE = 'Muitas atualizações de estado de mídia. Aguarde alguns segundos.';
const SPEAKING_RATE_LIMITED_MESSAGE = 'Muitas atualizações de fala. Aguarde alguns segundos.';
const NOT_JOINED_MESSAGE = 'Entre na chamada antes de sinalizar.';

function hintTableId(payload: unknown): string | undefined {
  const raw = payload as { tableId?: unknown } | undefined;
  return typeof raw?.tableId === 'string' ? raw.tableId : undefined;
}

export function registerMediaHandlers(io: Server, socket: Socket) {
  const log = createLogger({ scope: 'socket:media', socketId: socket.id, userId: socket.data.user?.id });

  /**
   * Resolve a mesa e exige vínculo real (DM/PLAYER). A TV é bloqueada antes
   * de qualquer trabalho pelo `runAction`; aqui garantimos o membro.
   */
  const requireMember = async (tableId: string) => {
    const user = socket.data.user;
    assertCondition(!!user?.id, 'Usuário não autenticado.', 401);
    const table = await getTableById(tableId);
    // Mesa inexistente e não-membro respondem igual para não revelar mesas.
    assertCondition(!!table, 'Usuário não faz parte desta mesa.', 403);
    assertUserInTable(user!.id, table!);
    return { userId: user!.id as string, username: (user!.username as string) || '' };
  };

  /** Exige que este socket já esteja na sala de mídia da mesa. */
  const requireJoinedPeer = (tableId: string): MediaPeer => {
    const peer = getMediaPeer(tableId, socket.id);
    assertCondition(!!peer, NOT_JOINED_MESSAGE, 409);
    return peer!;
  };

  const mediaJoin = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'mediaJoin',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zMediaJoinPayload, payload);
        const { userId, username } = await requireMember(data.tableId);

        const result = joinMediaRoom(data.tableId, {
          peerId: socket.id,
          userId,
          username,
        });

        // Garante entrega dos relays/broadcasts mesmo se o cliente entrou na
        // chamada antes do snapshot da mesa. Não concede estado nem revisão.
        if (!socket.rooms.has(data.tableId)) {
          await socket.join(data.tableId);
        }

        // O próprio entrante recebe o estado atual (peers existentes), não o
        // próprio join. Os demais recebem `mediaPeerJoined` uma única vez.
        socket.emit('mediaRoomState', { tableId: data.tableId, peers: result.peers });
        if (result.created) {
          socket.to(data.tableId).emit('mediaPeerJoined', {
            tableId: data.tableId,
            peer: result.peer,
          });
        }

        log.info({ tableId: data.tableId, peerId: socket.id }, 'Peer entrou na chamada');
        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  const mediaLeave = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'mediaLeave',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zMediaLeavePayload, payload);
        await requireMember(data.tableId);

        const removed = leaveMediaRoom(data.tableId, socket.id);
        if (removed) {
          socket.to(data.tableId).emit('mediaPeerLeft', {
            tableId: data.tableId,
            peerId: removed.peerId,
            userId: removed.userId,
          });
          log.info({ tableId: data.tableId, peerId: socket.id }, 'Peer saiu da chamada');
        }
        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  const relaySdp = (event: 'mediaOffer' | 'mediaAnswer') => async (
    payload: unknown,
    ackArg?: unknown
  ) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event,
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        assertCondition(mediaSignalRateLimiter.take(socket.id), SIGNAL_RATE_LIMITED_MESSAGE, 429);
        const data = validate(zMediaSignalPayload, payload);
        requireJoinedPeer(data.tableId);
        assertCondition(data.toPeerId !== socket.id, 'Não é possível sinalizar para si mesmo.', 400);

        // Só peers da MESMA sala recebem o relay; `getMediaPeer` garante a mesa.
        const target = getMediaPeer(data.tableId, data.toPeerId);
        assertCondition(!!target, 'Participante não está na chamada desta mesa.', 404);

        // Nunca logar conteúdo de SDP.
        io.to(target!.peerId).emit(event, {
          tableId: data.tableId,
          fromPeerId: socket.id,
          sdp: data.sdp,
        });
        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  const mediaIce = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'mediaIce',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        assertCondition(mediaSignalRateLimiter.take(socket.id), SIGNAL_RATE_LIMITED_MESSAGE, 429);
        const data = validate(zMediaIcePayload, payload);
        requireJoinedPeer(data.tableId);
        assertCondition(data.toPeerId !== socket.id, 'Não é possível sinalizar para si mesmo.', 400);

        const target = getMediaPeer(data.tableId, data.toPeerId);
        assertCondition(!!target, 'Participante não está na chamada desta mesa.', 404);

        // Nunca logar conteúdo de ICE.
        io.to(target!.peerId).emit('mediaIce', {
          tableId: data.tableId,
          fromPeerId: socket.id,
          candidate: data.candidate,
        });
        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  const mediaState = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'mediaState',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        assertCondition(mediaStateRateLimiter.take(socket.id), STATE_RATE_LIMITED_MESSAGE, 429);
        const data = validate(zMediaStatePayload, payload);
        const peer = updateMediaState(data.tableId, socket.id, {
          mic: data.mic,
          deafened: data.deafened,
          camera: data.camera,
          screen: data.screen,
        });
        assertCondition(!!peer, NOT_JOINED_MESSAGE, 409);

        io.to(data.tableId).emit('mediaStateUpdated', {
          tableId: data.tableId,
          peerId: peer!.peerId,
          userId: peer!.userId,
          mediaState: peer!.mediaState,
        });
        // Mídia é efêmera: ack usa a revisão atual sem incrementá-la.
        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  const mediaSpeaking = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'mediaSpeaking',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        assertCondition(mediaSpeakingRateLimiter.take(socket.id), SPEAKING_RATE_LIMITED_MESSAGE, 429);
        const data = validate(zMediaSpeakingPayload, payload);
        const peer = setMediaSpeaking(data.tableId, socket.id, data.speaking);
        assertCondition(!!peer, NOT_JOINED_MESSAGE, 409);

        io.to(data.tableId).emit('mediaStateUpdated', {
          tableId: data.tableId,
          peerId: peer!.peerId,
          userId: peer!.userId,
          mediaState: peer!.mediaState,
        });
        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  const mediaKick = async (payload: unknown, ackArg?: unknown) => {
    const ack = extractAck(ackArg);
    await runAction({
      io,
      socket,
      event: 'mediaKick',
      ack,
      log,
      tableIdHint: hintTableId(payload),
      body: async () => {
        const data = validate(zMediaKickPayload, payload);
        const user = socket.data.user;
        assertCondition(!!user?.id, 'Usuário não autenticado.', 401);
        const table = await getTableById(data.tableId);
        assertCondition(!!table, 'Mesa não encontrada.', 404);
        assertUserIsDM(user!.id, table!);

        assertCondition(data.peerId !== socket.id, 'Você não pode remover a si mesmo da chamada.', 400);
        const removed = kickMediaPeer(data.tableId, data.peerId);
        assertCondition(!!removed, 'Participante não está na chamada desta mesa.', 404);

        // Kick de mídia não remove o jogador da mesa.
        io.to(removed!.peerId).emit('mediaKicked', {
          tableId: data.tableId,
          reason: 'Você foi removido da chamada pelo Mestre.',
        });
        io.to(data.tableId).emit('mediaPeerLeft', {
          tableId: data.tableId,
          peerId: removed!.peerId,
          userId: removed!.userId,
        });
        log.info(
          { tableId: data.tableId, peerId: removed!.peerId, byUserId: user!.id },
          'Peer removido da chamada pelo Mestre'
        );
        return { tableId: data.tableId, revision: await getRevision(data.tableId) };
      },
    });
  };

  socket.on('mediaJoin', mediaJoin);
  socket.on('mediaLeave', mediaLeave);
  socket.on('mediaOffer', relaySdp('mediaOffer'));
  socket.on('mediaAnswer', relaySdp('mediaAnswer'));
  socket.on('mediaIce', mediaIce);
  socket.on('mediaState', mediaState);
  socket.on('mediaSpeaking', mediaSpeaking);
  socket.on('mediaKick', mediaKick);

  socket.on('disconnect', () => {
    mediaSignalRateLimiter.reset(socket.id);
    mediaStateRateLimiter.reset(socket.id);
    mediaSpeakingRateLimiter.reset(socket.id);

    // Remove o peer de todas as mesas em que estava na chamada e avisa cada sala.
    const removed = removeSocketFromMedia(socket.id);
    removed.forEach(({ tableId, peer }) => {
      io.to(tableId).emit('mediaPeerLeft', {
        tableId,
        peerId: peer.peerId,
        userId: peer.userId,
      });
    });
  });
}
