import { ServiceError } from './serviceErrors';

export type MediaMicState = 'on' | 'muted';
export type MediaCameraState = 'on' | 'off';

/**
 * Estado efêmero de mídia de um participante. Não é estado de tabuleiro:
 * não incrementa `revision`, não gera `sessionPatch` e nunca é persistido.
 */
export type MediaState = {
  mic: MediaMicState;
  deafened: boolean;
  camera: MediaCameraState;
  screen: boolean;
  speaking: boolean;
};

export type MediaPeer = {
  peerId: string;
  userId: string;
  username: string;
  mediaState: MediaState;
};

export type MediaPeerInput = {
  peerId: string;
  userId: string;
  username: string;
  mediaState?: Partial<MediaState>;
};

export type MediaStatePatch = Pick<MediaState, 'mic' | 'deafened' | 'camera' | 'screen'>;

export type MediaJoinResult = {
  peer: MediaPeer;
  /** Peers que já estavam na sala antes desta entrada (sem o próprio). */
  peers: MediaPeer[];
  /** false quando a entrada foi idempotente (peer já estava na sala). */
  created: boolean;
};

export type RemovedMediaPeer = {
  tableId: string;
  peer: MediaPeer;
};

export const MEDIA_MAX_PEERS_DEFAULT = 8;

/** Limite duro de peers por mesa (env `MEDIA_MAX_PEERS`, padrão 8). */
export function getMediaMaxPeers(): number {
  const raw = Number(process.env.MEDIA_MAX_PEERS);
  if (!Number.isFinite(raw) || raw <= 0) return MEDIA_MAX_PEERS_DEFAULT;
  return Math.max(1, Math.trunc(raw));
}

/**
 * Microfone começa mutado por privacidade: o cliente só anuncia `mic: 'on'`
 * depois de obter a faixa de áudio. Câmera desligada por padrão (áudio-first).
 */
const DEFAULT_MEDIA_STATE: MediaState = {
  mic: 'muted',
  deafened: false,
  camera: 'off',
  screen: false,
  speaking: false,
};

/** tableId -> peerId (socket.id) -> peer */
const rooms = new Map<string, Map<string, MediaPeer>>();

function snapshotPeer(peer: MediaPeer): MediaPeer {
  return {
    peerId: peer.peerId,
    userId: peer.userId,
    username: peer.username,
    mediaState: { ...peer.mediaState },
  };
}

function listOthers(tableId: string, excludePeerId: string): MediaPeer[] {
  const room = rooms.get(tableId);
  if (!room) return [];
  const peers: MediaPeer[] = [];
  room.forEach((peer) => {
    if (peer.peerId !== excludePeerId) peers.push(snapshotPeer(peer));
  });
  return peers;
}

function dropEmptyRoom(tableId: string): void {
  const room = rooms.get(tableId);
  if (room && room.size === 0) rooms.delete(tableId);
}

/**
 * Entra na sala de mídia da mesa. Idempotente por `peerId` (socket.id):
 * uma reconexão que reenvia o mesmo id não duplica o peer.
 */
export function joinMediaRoom(tableId: string, input: MediaPeerInput): MediaJoinResult {
  let room = rooms.get(tableId);
  if (!room) {
    room = new Map<string, MediaPeer>();
    rooms.set(tableId, room);
  }

  const existing = room.get(input.peerId);
  if (existing) {
    if (input.username) existing.username = input.username;
    return {
      peer: snapshotPeer(existing),
      peers: listOthers(tableId, input.peerId),
      created: false,
    };
  }

  const maxPeers = getMediaMaxPeers();
  if (room.size >= maxPeers) {
    throw new ServiceError(
      `A chamada desta mesa está cheia (máximo de ${maxPeers} participantes).`,
      409,
      { maxPeers }
    );
  }

  const peer: MediaPeer = {
    peerId: input.peerId,
    userId: input.userId,
    username: input.username,
    mediaState: {
      ...DEFAULT_MEDIA_STATE,
      ...input.mediaState,
      speaking: input.mediaState?.speaking ?? false,
    },
  };
  room.set(peer.peerId, peer);
  return {
    peer: snapshotPeer(peer),
    peers: listOthers(tableId, peer.peerId),
    created: true,
  };
}

/** Sai da sala de mídia. Retorna o peer removido (ou null quando não estava). */
export function leaveMediaRoom(tableId: string, peerId: string): MediaPeer | null {
  const room = rooms.get(tableId);
  if (!room) return null;
  const peer = room.get(peerId);
  if (!peer) return null;
  room.delete(peerId);
  dropEmptyRoom(tableId);
  return snapshotPeer(peer);
}

/** Remove um peer da mídia por moderação (não o remove da mesa). */
export function kickMediaPeer(tableId: string, peerId: string): MediaPeer | null {
  return leaveMediaRoom(tableId, peerId);
}

/** Remove o socket de todas as salas de mídia (desconexão). */
export function removeSocketFromMedia(socketId: string): RemovedMediaPeer[] {
  const removed: RemovedMediaPeer[] = [];
  rooms.forEach((room, tableId) => {
    const peer = room.get(socketId);
    if (!peer) return;
    room.delete(socketId);
    removed.push({ tableId, peer: snapshotPeer(peer) });
  });
  const emptyTables: string[] = [];
  rooms.forEach((room, tableId) => {
    if (room.size === 0) emptyTables.push(tableId);
  });
  emptyTables.forEach((tableId) => rooms.delete(tableId));
  return removed;
}

/** Lista os peers da sala em ordem de entrada. */
export function listMediaPeers(tableId: string): MediaPeer[] {
  const room = rooms.get(tableId);
  if (!room) return [];
  return Array.from(room.values()).map(snapshotPeer);
}

export function getMediaPeer(tableId: string, peerId: string): MediaPeer | null {
  const peer = rooms.get(tableId)?.get(peerId);
  return peer ? snapshotPeer(peer) : null;
}

/** Atualiza mic/deafen/camera/screen preservando o indicador de fala. */
export function updateMediaState(
  tableId: string,
  peerId: string,
  patch: MediaStatePatch
): MediaPeer | null {
  const peer = rooms.get(tableId)?.get(peerId);
  if (!peer) return null;
  peer.mediaState = {
    ...peer.mediaState,
    ...patch,
    speaking: peer.mediaState.speaking,
  };
  return snapshotPeer(peer);
}

export function setMediaSpeaking(tableId: string, peerId: string, speaking: boolean): MediaPeer | null {
  const peer = rooms.get(tableId)?.get(peerId);
  if (!peer) return null;
  peer.mediaState = { ...peer.mediaState, speaking };
  return snapshotPeer(peer);
}

/** Apenas para testes: limpa todas as salas de mídia. */
export function resetMediaRooms(): void {
  rooms.clear();
}
