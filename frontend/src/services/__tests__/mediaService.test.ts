import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Handler = (payload: unknown) => void;

const socketState = vi.hoisted(() => {
  const handlers: Record<string, Handler> = {};
  const okAck = { ok: true, revision: 1, serverNowMs: 0 };
  const mock = {
    socketId: 'peer-self' as string | null,
    getPeerId: vi.fn(() => 'peer-self'),
    joinMedia: vi.fn(async () => okAck),
    leaveMedia: vi.fn(async () => okAck),
    sendMediaOffer: vi.fn(async () => okAck),
    sendMediaAnswer: vi.fn(async () => okAck),
    sendMediaIce: vi.fn(async () => okAck),
    updateMediaState: vi.fn(async () => okAck),
    updateMediaSpeaking: vi.fn(),
    fetchIceServers: vi.fn(async () => ({
      iceServers: [
        { urls: ['stun:stun.example.org:19302'] },
        { urls: ['turn:turn.example.org:443'], username: 'u', credential: 'c' },
      ],
      ttlSeconds: 3600,
      mode: 'mesh' as const,
      turnConfigured: true,
      maxPeers: 8,
    })),
    onMediaEvent: vi.fn((event: string, handler: Handler) => {
      handlers[event] = handler;
      return () => { delete handlers[event]; };
    }),
    onSocketConnect: vi.fn(() => () => {}),
    onSocketDisconnect: vi.fn(() => () => {}),
  };
  return { mock, handlers };
});

vi.mock('../socketService', () => ({ socketService: socketState.mock }));

class FakeTrack {
  kind: string;
  enabled = true;
  stop = vi.fn();
  onended: (() => void) | null = null;
  constructor(kind: string) { this.kind = kind; }
}

class FakeMediaStream {
  private tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) { this.tracks = [...tracks]; }
  getTracks() { return [...this.tracks]; }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === 'video'); }
  addTrack(track: FakeTrack) {
    if (!this.tracks.includes(track)) this.tracks.push(track);
  }
  removeTrack(track: FakeTrack) {
    this.tracks = this.tracks.filter((entry) => entry !== track);
  }
}

class FakeSender {
  track: FakeTrack | null;
  replaceTrack = vi.fn(async (track: FakeTrack | null) => { this.track = track; });
  constructor(track: FakeTrack | null) { this.track = track; }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  connectionState = 'new';
  signalingState = 'stable';
  localDescription: RTCSessionDescriptionInit | null = null;
  senders: FakeSender[] = [];
  onicecandidate: ((event: { candidate: { toJSON: () => RTCIceCandidateInit } | null }) => void) | null = null;
  ontrack: ((event: { track: FakeTrack; streams: FakeMediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'offer-sdp' }));
  createAnswer = vi.fn(async () => ({ type: 'answer' as const, sdp: 'answer-sdp' }));
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
  });
  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  });
  addIceCandidate = vi.fn(async () => {});
  close = vi.fn(() => { this.connectionState = 'closed'; });
  getStats = vi.fn(async () => new Map());
  restartIce = vi.fn();
  constructor(public config?: RTCConfiguration) {
    FakePeerConnection.instances.push(this);
  }
  addTrack(track: FakeTrack, _stream: FakeMediaStream) {
    const sender = new FakeSender(track);
    this.senders.push(sender);
    return sender;
  }
  getSenders() { return this.senders; }
}

const mediaDevices = {
  getUserMedia: vi.fn(),
  getDisplayMedia: vi.fn(),
  enumerateDevices: vi.fn(async () => []),
};

function audioStream() {
  return new FakeMediaStream([new FakeTrack('audio')]);
}

function videoStream() {
  return new FakeMediaStream([new FakeTrack('video')]);
}

const globals = globalThis as typeof globalThis & {
  MediaStream: typeof FakeMediaStream;
  RTCPeerConnection: typeof FakePeerConnection;
};

globals.MediaStream = FakeMediaStream;
globals.RTCPeerConnection = FakePeerConnection;
Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: mediaDevices,
});

const { mediaService } = await import('../mediaService');

const flush = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 10));
};

const peer = (peerId = 'peer-remote') => ({
  peerId,
  userId: `user-${peerId}`,
  username: `User ${peerId}`,
  mediaState: { mic: 'on' as const, deafened: false, camera: 'off' as const, screen: false, speaking: false },
});

describe('mediaService — mesh WebRTC', () => {
  beforeEach(async () => {
    await mediaService.leave();
    Object.values(socketState.mock).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        (value as { mockClear: () => void }).mockClear();
      }
    });
    socketState.mock.joinMedia.mockResolvedValue({ ok: true, revision: 1, serverNowMs: 0 });
    socketState.mock.leaveMedia.mockResolvedValue({ ok: true, revision: 1, serverNowMs: 0 });
    socketState.mock.fetchIceServers.mockResolvedValue({
      iceServers: [{ urls: ['stun:stun.example.org:19302'] }],
      ttlSeconds: 3600,
      mode: 'mesh',
      turnConfigured: true,
      maxPeers: 8,
    });
    mediaDevices.getUserMedia.mockReset();
    mediaDevices.getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) =>
      constraints.video ? videoStream() : audioStream());
    mediaDevices.getDisplayMedia.mockReset();
    mediaDevices.getDisplayMedia.mockResolvedValue(new FakeMediaStream([new FakeTrack('video')]));
    FakePeerConnection.instances = [];
  });

  afterEach(async () => {
    await mediaService.leave();
  });

  it('entra na sala com áudio, busca ICE autenticado e publica estado inicial', async () => {
    await mediaService.join('table-1');

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: expect.objectContaining({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }),
      video: false,
    }));
    expect(socketState.mock.fetchIceServers).toHaveBeenCalledWith('table-1');
    expect(socketState.mock.joinMedia).toHaveBeenCalledWith('table-1');
    expect(socketState.mock.updateMediaState).toHaveBeenCalledWith(expect.objectContaining({
      tableId: 'table-1',
      mic: 'on',
      deafened: false,
      camera: 'off',
      screen: false,
    }));

    const snapshot = mediaService.getSnapshot();
    expect(snapshot.joined).toBe(true);
    expect(snapshot.connecting).toBe(false);
    expect(snapshot.localStream).toBeTruthy();
    expect(snapshot.turnConfigured).toBe(true);
  });

  it('mediaRoomState cria RTCPeerConnection e envia oferta ao peer existente', async () => {
    await mediaService.join('table-1');
    socketState.handlers.mediaRoomState({ tableId: 'table-1', peers: [peer()] });
    await flush();

    expect(FakePeerConnection.instances).toHaveLength(1);
    const snapshot = mediaService.getSnapshot();
    expect(snapshot.peers).toHaveLength(1);
    expect(snapshot.peers[0].peerId).toBe('peer-remote');
    expect(socketState.mock.sendMediaOffer).toHaveBeenCalledWith(expect.objectContaining({
      tableId: 'table-1',
      toPeerId: 'peer-remote',
      sdp: expect.objectContaining({ type: 'offer' }),
    }));
  });

  it('mediaPeerJoined espera a oferta do peer novo e responde com answer', async () => {
    await mediaService.join('table-1');
    socketState.handlers.mediaPeerJoined({ tableId: 'table-1', peer: peer('peer-new') });
    await flush();

    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(socketState.mock.sendMediaOffer).not.toHaveBeenCalled();

    socketState.handlers.mediaOffer({
      tableId: 'table-1',
      toPeerId: 'peer-new',
      sdp: { type: 'offer', sdp: 'remote-offer' },
    });
    await flush();

    expect(socketState.mock.sendMediaAnswer).toHaveBeenCalledWith(expect.objectContaining({
      tableId: 'table-1',
      toPeerId: 'peer-new',
      sdp: expect.objectContaining({ type: 'answer' }),
    }));
  });

  it('propaga mute, deafen, câmera e tela pelo estado efêmero', async () => {
    await mediaService.join('table-1');
    socketState.mock.updateMediaState.mockClear();

    mediaService.toggleMic();
    expect(mediaService.getSnapshot().mic).toBe('muted');
    expect(socketState.mock.updateMediaState).toHaveBeenLastCalledWith(expect.objectContaining({ mic: 'muted' }));

    mediaService.toggleDeafen();
    expect(mediaService.getSnapshot().deafened).toBe(true);
    expect(mediaService.getSnapshot().mic).toBe('muted');
    expect(socketState.mock.updateMediaState).toHaveBeenLastCalledWith(expect.objectContaining({
      deafened: true,
      mic: 'muted',
    }));

    await mediaService.toggleCamera();
    expect(mediaService.getSnapshot().camera).toBe('on');
    expect(socketState.mock.updateMediaState).toHaveBeenLastCalledWith(expect.objectContaining({ camera: 'on' }));

    await mediaService.startScreenShare();
    expect(mediaService.getSnapshot().screen).toBe(true);
    expect(mediaDevices.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(socketState.mock.updateMediaState).toHaveBeenLastCalledWith(expect.objectContaining({
      screen: true,
      camera: 'off',
    }));

    await mediaService.stopScreenShare();
    expect(mediaService.getSnapshot().screen).toBe(false);
    expect(socketState.mock.updateMediaState).toHaveBeenLastCalledWith(expect.objectContaining({ screen: false }));
  });

  it('leave encerra tracks, fecha PCs e avisa a sala', async () => {
    await mediaService.join('table-1');
    socketState.handlers.mediaRoomState({ tableId: 'table-1', peers: [peer()] });
    await flush();

    const stream = mediaService.getSnapshot().localStream as unknown as FakeMediaStream;
    const tracks = stream.getTracks();
    const pc = FakePeerConnection.instances[0];

    await mediaService.leave();

    expect(tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true);
    expect(pc.close).toHaveBeenCalled();
    expect(socketState.mock.leaveMedia).toHaveBeenCalledWith('table-1');
    const snapshot = mediaService.getSnapshot();
    expect(snapshot.joined).toBe(false);
    expect(snapshot.localStream).toBeNull();
    expect(snapshot.peers).toHaveLength(0);
  });

  it('erro de permissão de microfone aparece em pt-BR e não entra na sala', async () => {
    mediaDevices.getUserMedia.mockRejectedValueOnce({ name: 'NotAllowedError' });

    await mediaService.join('table-1');

    const snapshot = mediaService.getSnapshot();
    expect(snapshot.joined).toBe(false);
    expect(snapshot.connecting).toBe(false);
    expect(snapshot.error).toMatch(/Permissão de microfone/);
    expect(socketState.mock.joinMedia).not.toHaveBeenCalled();
  });

  it('mediaError do servidor vira mensagem visível e mediaKicked encerra a chamada', async () => {
    await mediaService.join('table-1');

    socketState.handlers.mediaError({ code: 'RATE_LIMITED', message: 'Muitas ações na chamada.' });
    expect(mediaService.getSnapshot().error).toBe('Muitas ações na chamada.');

    socketState.handlers.mediaKicked({ tableId: 'table-1', reason: 'Mestre removeu você.' });
    await flush();
    const snapshot = mediaService.getSnapshot();
    expect(snapshot.joined).toBe(false);
    expect(snapshot.error).toBe('Mestre removeu você.');
  });

  it('sem endpoint de ICE usa STUN público e avisa que TURN não está configurado', async () => {
    socketState.mock.fetchIceServers.mockRejectedValueOnce(new Error('404'));

    await mediaService.join('table-1');

    expect(mediaService.getSnapshot().joined).toBe(true);
    expect(mediaService.getSnapshot().turnConfigured).toBe(false);
    expect(mediaService.getSnapshot().iceConfig?.iceServers[0].urls).toEqual(
      expect.arrayContaining([expect.stringContaining('stun:')]),
    );
  });
});
