import { socketService } from './socketService';
import type {
  IceServerConfig,
  MediaConnectionQuality,
  MediaDeviceKind,
  MediaIceServersResponse,
  MediaPeer,
  MediaPeerView,
  MediaState,
} from '../types';

/**
 * Mesh WebRTC da chamada (Fase 5).
 *
 * Responsabilidades:
 * - capturar microfone (áudio-first), câmera sob demanda e tela;
 * - abrir um `RTCPeerConnection` por peer com perfect negotiation;
 * - publicar estado efêmero (`mediaState`/`mediaSpeaking`) pelo Socket.IO;
 * - sobreviver a reconexão com rejoin + recriação dos peers.
 *
 * A store Pinia é dona do estado reativo. Este serviço só mantém o estado
 * operacional (streams/PCs) e notifica snapshots; não importa nenhuma store.
 */

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 360 },
  frameRate: { ideal: 15, max: 20 },
};

const SPEAKING_INTERVAL_MS = 250;
/**
 * O backend limita `mediaSpeaking` a 20 eventos/10 s (2/s). Só publicamos em
 * mudança de estado e respeitamos uma janela de 500 ms entre envios.
 */
const SPEAKING_EMIT_MIN_MS = 500;
const QUALITY_INTERVAL_MS = 5_000;
const SPEAKING_THRESHOLD = 0.02;

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export interface MediaSnapshot {
  tableId: string | null;
  joined: boolean;
  connecting: boolean;
  mic: MediaState['mic'];
  deafened: boolean;
  camera: MediaState['camera'];
  screen: boolean;
  speaking: boolean;
  localStream: MediaStream | null;
  peers: MediaPeerView[];
  error: string | null;
  iceConfig: MediaIceServersResponse | null;
  turnConfigured: boolean;
  selectedDevices: Partial<Record<MediaDeviceKind, string>>;
}

export type MediaSnapshotListener = (snapshot: MediaSnapshot) => void;

interface AnalyserHandle {
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  data: Uint8Array;
}

interface PeerRuntime {
  peerId: string;
  userId: string;
  username: string;
  mediaState: MediaState;
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  quality: MediaConnectionQuality;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  polite: boolean;
  audioSender: RTCRtpSender | null;
  videoSender: RTCRtpSender | null;
  analyser: AnalyserHandle | null;
}

function defaultMediaState(): MediaState {
  return { mic: 'on', deafened: false, camera: 'off', screen: false, speaking: false };
}

function normalizeMediaState(state?: Partial<MediaState> | null): MediaState {
  return {
    mic: state?.mic === 'muted' ? 'muted' : 'on',
    deafened: state?.deafened === true,
    camera: state?.camera === 'on' ? 'on' : 'off',
    screen: state?.screen === true,
    speaking: state?.speaking === true,
  };
}

function isBrowserWithWebRtc(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

function getMediaDevices(): MediaDevices | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.mediaDevices ?? null;
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  const legacy = (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return legacy ?? null;
}

function describeMediaError(error: unknown, fallback: string): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Permissão de microfone/câmera negada. Libere o acesso no navegador e tente novamente.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Nenhum microfone ou câmera encontrado. Conecte um dispositivo e tente novamente.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'O microfone ou a câmera está em uso por outro aplicativo.';
    case 'OverconstrainedError':
      return 'O dispositivo selecionado não está disponível. Escolha outro nas configurações.';
    default:
      return fallback;
  }
}

function describeDisplayError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permissão para compartilhar tela negada.';
  }
  return 'Não foi possível compartilhar a tela.';
}

export class MediaService {
  private tableId: string | null = null;
  private joined = false;
  private connecting = false;
  private mic: MediaState['mic'] = 'on';
  private deafened = false;
  private camera: MediaState['camera'] = 'off';
  private screen = false;
  private speaking = false;
  private error: string | null = null;
  private iceConfig: MediaIceServersResponse | null = null;

  private localStream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  /** Câmera estava ligada quando o compartilhamento de tela começou. */
  private restoreCameraAfterScreen = false;

  private peers = new Map<string, PeerRuntime>();
  private listeners = new Set<MediaSnapshotListener>();

  private audioContext: AudioContext | null = null;
  private localAnalyser: AnalyserHandle | null = null;
  private speakingTimer: ReturnType<typeof setInterval> | null = null;
  private qualityTimer: ReturnType<typeof setInterval> | null = null;
  private lastLocalSpeaking = false;
  private lastSpeakingSentAt = 0;

  private selectedDevices: Partial<Record<MediaDeviceKind, string>> = {};
  private rejoinInFlight = false;
  private unboundSocketListeners: Array<() => void> = [];

  constructor() {
    this.bindSocket();
  }

  // ------------------------------------------------------------------
  // Assinatura / snapshot
  // ------------------------------------------------------------------

  subscribe(listener: MediaSnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): MediaSnapshot {
    return {
      tableId: this.tableId,
      joined: this.joined,
      connecting: this.connecting,
      mic: this.mic,
      deafened: this.deafened,
      camera: this.camera,
      screen: this.screen,
      speaking: this.speaking,
      localStream: this.localStream,
      peers: Array.from(this.peers.values()).map((peer) => ({
        peerId: peer.peerId,
        userId: peer.userId,
        username: peer.username,
        mediaState: { ...peer.mediaState },
        stream: peer.stream,
        connectionState: peer.connectionState,
        quality: peer.quality,
      })),
      error: this.error,
      iceConfig: this.iceConfig,
      turnConfigured: this.iceConfig?.turnConfigured ?? false,
      selectedDevices: { ...this.selectedDevices },
    };
  }

  private notify(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // UI quebrada não pode derrubar a chamada.
      }
    }
  }

  private setError(message: string | null): void {
    this.error = message;
    this.notify();
  }

  private clearError(): void {
    if (this.error !== null) {
      this.error = null;
      this.notify();
    }
  }

  // ------------------------------------------------------------------
  // Ciclo de vida
  // ------------------------------------------------------------------

  async join(tableId: string): Promise<void> {
    if (this.connecting) return;
    if (this.joined && this.tableId === tableId) return;
    if (this.joined) await this.leave();

    this.tableId = tableId;
    this.connecting = true;
    this.error = null;
    this.notify();

    try {
      this.iceConfig = await this.loadIceServers(tableId);
      await this.acquireMicrophone();
      this.startAudioAnalysis();
      this.startQualityLoop();

      const ack = await socketService.joinMedia(tableId);
      if (!ack.ok) {
        throw new Error(ack.error?.message || 'Não foi possível entrar na chamada.');
      }

      this.joined = true;
      this.connecting = false;
      this.notify();
      // Reafirma o estado inicial (o servidor também mantém um default).
      this.publishState();
    } catch (error) {
      this.connecting = false;
      this.joined = false;
      this.error = error instanceof Error && error.message
        ? error.message
        : 'Não foi possível entrar na chamada.';
      this.cleanupLocalMedia();
      this.notify();
    }
  }

  async leave(options: { reason?: string } = {}): Promise<void> {
    const tableId = this.tableId;
    const wasJoined = this.joined;

    this.teardownPeers();
    this.cleanupLocalMedia();
    this.joined = false;
    this.connecting = false;
    this.tableId = null;
    this.error = options.reason ?? null;
    this.mic = 'on';
    this.deafened = false;
    this.camera = 'off';
    this.screen = false;
    this.speaking = false;
    this.lastLocalSpeaking = false;
    this.restoreCameraAfterScreen = false;
    this.iceConfig = null;
    this.notify();

    if (wasJoined && tableId) {
      // O emit é síncrono; o ack pode chegar depois e não bloqueia a saída.
      void socketService.leaveMedia(tableId).catch(() => undefined);
    }
  }

  // ------------------------------------------------------------------
  // Microfone / mute / deafen
  // ------------------------------------------------------------------

  toggleMic(): void {
    if (!this.joined) return;
    if (this.mic === 'muted') {
      this.mic = 'on';
      // Desmutar enquanto surdo seria contraditório: o usuário quer ouvir.
      if (this.deafened) this.deafened = false;
    } else {
      this.mic = 'muted';
    }
    if (this.audioTrack) this.audioTrack.enabled = this.mic === 'on';
    this.notify();
    this.publishState();
  }

  toggleDeafen(): void {
    if (!this.joined) return;
    this.deafened = !this.deafened;
    if (this.deafened) {
      // Deafen muta o microfone por padrão.
      this.mic = 'muted';
      if (this.audioTrack) this.audioTrack.enabled = false;
    }
    this.notify();
    this.publishState();
  }

  // ------------------------------------------------------------------
  // Câmera / tela
  // ------------------------------------------------------------------

  async toggleCamera(): Promise<void> {
    if (!this.joined || this.screen) return;
    if (this.camera === 'on') {
      this.stopCameraTrack();
      await this.applyLocalVideoTrack(null);
      this.camera = 'off';
      this.notify();
      this.publishState();
      return;
    }
    try {
      const devices = getMediaDevices();
      if (!devices?.getUserMedia) throw new Error('Seu navegador não suporta chamadas de vídeo.');
      const deviceId = this.selectedDevices.videoinput;
      const stream = await devices.getUserMedia({
        audio: false,
        video: deviceId ? { ...VIDEO_CONSTRAINTS, deviceId: { exact: deviceId } } : VIDEO_CONSTRAINTS,
      });
      const track = stream.getVideoTracks()[0] ?? null;
      if (!track) throw new Error('Nenhuma câmera encontrada.');
      this.cameraTrack?.stop();
      this.cameraTrack = track;
      this.camera = 'on';
      await this.applyLocalVideoTrack(track);
      this.notify();
      this.publishState();
    } catch (error) {
      this.setError(describeMediaError(error, 'Não foi possível ligar a câmera.'));
    }
  }

  async startScreenShare(): Promise<void> {
    if (!this.joined || this.screen) return;
    try {
      const devices = getMediaDevices() as (MediaDevices & { getDisplayMedia?: MediaDevices['getDisplayMedia'] }) | null;
      if (!devices?.getDisplayMedia) throw new Error('Seu navegador não suporta compartilhar tela.');
      const stream = await devices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0] ?? null;
      if (!track) throw new Error('Nenhuma tela selecionada.');
      this.restoreCameraAfterScreen = this.camera === 'on';
      this.stopCameraTrack();
      this.camera = 'off';
      this.screen = true;
      this.screenTrack = track;
      track.onended = () => {
        void this.stopScreenShare();
      };
      await this.applyLocalVideoTrack(track);
      this.notify();
      this.publishState();
    } catch (error) {
      this.screen = false;
      this.screenTrack = null;
      this.setError(describeDisplayError(error));
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.screen) return;
    this.stopScreenTrack();
    this.screen = false;
    if (this.restoreCameraAfterScreen) {
      this.restoreCameraAfterScreen = false;
      this.camera = 'off';
      await this.toggleCamera();
      return;
    }
    await this.applyLocalVideoTrack(null);
    this.notify();
    this.publishState();
  }

  private stopCameraTrack(): void {
    if (this.cameraTrack) {
      try { this.cameraTrack.stop(); } catch {}
      this.cameraTrack = null;
    }
  }

  private stopScreenTrack(): void {
    if (this.screenTrack) {
      try { this.screenTrack.stop(); } catch {}
      this.screenTrack = null;
    }
  }

  /**
   * Troca a track de vídeo enviada a todos os peers. Câmera e tela usam o
   * mesmo sender `video`; `replaceTrack` evita renegociar quando o sender já
   * existe. O primeiro vídeo de um peer exige uma nova oferta.
   */
  private async applyLocalVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    if (this.localStream) {
      for (const existing of this.localStream.getVideoTracks()) {
        if (existing !== track) {
          try { this.localStream.removeTrack(existing); } catch {}
        }
      }
      if (track && !this.localStream.getVideoTracks().includes(track)) {
        this.localStream.addTrack(track);
      }
    }

    for (const peer of this.peers.values()) {
      const hadSender = Boolean(peer.videoSender);
      if (peer.videoSender) {
        try { await peer.videoSender.replaceTrack(track); } catch {}
      } else if (track && this.localStream) {
        try {
          peer.videoSender = peer.pc.addTrack(track, this.localStream);
        } catch {}
      }
      if (!hadSender && track) {
        void this.negotiate(peer.peerId);
      }
    }
  }

  // ------------------------------------------------------------------
  // Dispositivos
  // ------------------------------------------------------------------

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    const devices = getMediaDevices();
    if (!devices?.enumerateDevices) return [];
    try {
      return await devices.enumerateDevices();
    } catch {
      return [];
    }
  }

  async setDevice(kind: MediaDeviceKind, deviceId: string): Promise<void> {
    if (kind === 'audiooutput') {
      this.selectedDevices.audiooutput = deviceId;
      this.notify();
      return;
    }
    try {
      if (kind === 'audioinput') {
        this.selectedDevices.audioinput = deviceId;
        if (!this.joined) {
          this.notify();
          return;
        }
        const devices = getMediaDevices();
        if (!devices?.getUserMedia) throw new Error('Seu navegador não suporta microfone.');
        const stream = await devices.getUserMedia({
          audio: deviceId ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } } : AUDIO_CONSTRAINTS,
          video: false,
        });
        const track = stream.getAudioTracks()[0] ?? null;
        if (!track) throw new Error('Nenhum microfone encontrado.');
        track.enabled = this.mic === 'on';
        const previous = this.audioTrack;
        if (previous && this.localStream) {
          try { this.localStream.removeTrack(previous); } catch {}
        }
        this.audioTrack?.stop();
        this.audioTrack = track;
        if (this.localStream) this.localStream.addTrack(track);
        for (const peer of this.peers.values()) {
          if (peer.audioSender) {
            try { await peer.audioSender.replaceTrack(track); } catch {}
          }
        }
        this.refreshLocalAnalyser();
        this.notify();
        return;
      }

      this.selectedDevices.videoinput = deviceId;
      if (this.camera !== 'on') {
        this.notify();
        return;
      }
      const devices = getMediaDevices();
      if (!devices?.getUserMedia) throw new Error('Seu navegador não suporta câmera.');
      const stream = await devices.getUserMedia({
        audio: false,
        video: deviceId ? { ...VIDEO_CONSTRAINTS, deviceId: { exact: deviceId } } : VIDEO_CONSTRAINTS,
      });
      const track = stream.getVideoTracks()[0] ?? null;
      if (!track) throw new Error('Nenhuma câmera encontrada.');
      this.cameraTrack?.stop();
      this.cameraTrack = track;
      await this.applyLocalVideoTrack(track);
      this.notify();
    } catch (error) {
      this.setError(describeMediaError(error, 'Não foi possível trocar o dispositivo.'));
    }
  }

  // ------------------------------------------------------------------
  // Captura local / análise de fala
  // ------------------------------------------------------------------

  private async acquireMicrophone(): Promise<void> {
    const devices = getMediaDevices();
    if (!devices?.getUserMedia) {
      throw new Error('Seu navegador não suporta chamadas de áudio.');
    }
    const deviceId = this.selectedDevices.audioinput;
    let stream: MediaStream;
    try {
      stream = await devices.getUserMedia({
        audio: deviceId ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } } : AUDIO_CONSTRAINTS,
        video: false,
      });
    } catch (error) {
      throw new Error(describeMediaError(error, 'Não foi possível acessar o microfone.'));
    }
    this.audioTrack = stream.getAudioTracks()[0] ?? null;
    if (this.audioTrack) this.audioTrack.enabled = this.mic === 'on';
    this.localStream = stream;
  }

  private refreshLocalAnalyser(): void {
    this.detachAnalyser('local');
    if (this.localStream) this.attachAnalyser('local', this.localStream);
  }

  private startAudioAnalysis(): void {
    this.refreshLocalAnalyser();
    if (this.speakingTimer) return;
    this.speakingTimer = setInterval(() => this.scanSpeaking(), SPEAKING_INTERVAL_MS);
  }

  private startQualityLoop(): void {
    if (this.qualityTimer) return;
    this.qualityTimer = setInterval(() => {
      void this.pollQuality();
    }, QUALITY_INTERVAL_MS);
  }

  private scanSpeaking(): void {
    const localSpeaking = this.measureAnalyser(this.localAnalyser) > SPEAKING_THRESHOLD;
    if (localSpeaking !== this.lastLocalSpeaking) {
      this.lastLocalSpeaking = localSpeaking;
      this.speaking = localSpeaking;
      this.notify();
      this.publishSpeaking(localSpeaking);
    }

    let peersChanged = false;
    for (const peer of this.peers.values()) {
      const speaking = this.measureAnalyser(peer.analyser) > SPEAKING_THRESHOLD;
      if (peer.mediaState.speaking !== speaking) {
        peer.mediaState = { ...peer.mediaState, speaking };
        peersChanged = true;
      }
    }
    if (peersChanged) this.notify();
  }

  private measureAnalyser(handle: AnalyserHandle | null): number {
    if (!handle) return 0;
    try {
      handle.analyser.getByteTimeDomainData(handle.data);
      let sum = 0;
      for (let i = 0; i < handle.data.length; i += 1) {
        const value = (handle.data[i] - 128) / 128;
        sum += value * value;
      }
      return Math.sqrt(sum / handle.data.length);
    } catch {
      return 0;
    }
  }

  private attachAnalyser(key: string, stream: MediaStream): void {
    if (!stream.getAudioTracks || stream.getAudioTracks().length === 0) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    try {
      if (!this.audioContext) this.audioContext = new Ctor();
      if (this.audioContext.state === 'suspended') {
        void this.audioContext.resume().catch(() => undefined);
      }
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const handle: AnalyserHandle = { analyser, source, data };
      if (key === 'local') {
        this.localAnalyser = handle;
      } else {
        const peer = this.peers.get(key);
        if (peer) {
          this.detachAnalyser(key);
          peer.analyser = handle;
        }
      }
    } catch {
      // Sem AudioContext funcional (Safari antigo): fala fica via servidor.
    }
  }

  private detachAnalyser(key: string): void {
    const handle = key === 'local' ? this.localAnalyser : this.peers.get(key)?.analyser ?? null;
    if (!handle) return;
    try { handle.source.disconnect(); } catch {}
    try { handle.analyser.disconnect(); } catch {}
    if (key === 'local') {
      this.localAnalyser = null;
    } else {
      const peer = this.peers.get(key);
      if (peer) peer.analyser = null;
    }
  }

  private publishSpeaking(speaking: boolean): void {
    if (!this.tableId) return;
    const now = Date.now();
    // O analisador atualiza a 250 ms, mas o contrato aceita no máximo 2/s.
    if (now - this.lastSpeakingSentAt < SPEAKING_EMIT_MIN_MS) return;
    this.lastSpeakingSentAt = now;
    socketService.updateMediaSpeaking({ tableId: this.tableId, speaking });
  }

  // ------------------------------------------------------------------
  // Peers / perfect negotiation
  // ------------------------------------------------------------------

  private bindSocket(): void {
    // Em testes/unidades o socketService pode ser um mock parcial: os métodos
    // opcionais evitam quebrar a importação do módulo.
    const on = socketService.onMediaEvent?.bind(socketService);
    if (on) {
      this.unboundSocketListeners.push(
        on('mediaRoomState', (payload) => this.handleRoomState(payload)),
        on('mediaPeerJoined', (payload) => this.handlePeerJoined(payload)),
        on('mediaPeerLeft', (payload) => this.handlePeerLeft(payload)),
        on('mediaOffer', (payload) => { void this.handleSignal(payload, 'offer'); }),
        on('mediaAnswer', (payload) => { void this.handleSignal(payload, 'answer'); }),
        on('mediaIce', (payload) => { void this.handleIce(payload); }),
        on('mediaStateUpdated', (payload) => this.handleStateUpdated(payload)),
        on('mediaKicked', (payload) => { void this.handleKicked(payload.reason); }),
        on('mediaError', (payload) => this.setError(payload.message || 'Erro na chamada.')),
      );
    }

    const onConnect = socketService.onSocketConnect?.bind(socketService);
    if (onConnect) {
      this.unboundSocketListeners.push(onConnect(() => { void this.handleSocketReconnect(); }));
    }
    const onDisconnect = socketService.onSocketDisconnect?.bind(socketService);
    if (onDisconnect) {
      this.unboundSocketListeners.push(onDisconnect(() => this.handleSocketDisconnect()));
    }
  }

  private handleSocketDisconnect(): void {
    if (!this.joined) return;
    let changed = false;
    for (const peer of this.peers.values()) {
      if (peer.connectionState !== 'disconnected') {
        peer.connectionState = 'disconnected';
        changed = true;
      }
    }
    if (changed) this.notify();
  }

  private async handleSocketReconnect(): Promise<void> {
    if (!this.joined || !this.tableId || this.rejoinInFlight) return;
    this.rejoinInFlight = true;
    this.connecting = true;
    this.notify();
    try {
      // Peers antigos pertencem ao socket antigo; recria tudo na sala nova.
      this.teardownPeers();
      this.iceConfig = await this.loadIceServers(this.tableId);
      const ack = await socketService.joinMedia(this.tableId);
      if (!ack.ok) throw new Error(ack.error?.message || 'Não foi possível retomar a chamada.');
      this.connecting = false;
      this.notify();
    } catch (error) {
      this.connecting = false;
      this.setError(error instanceof Error && error.message ? error.message : 'Não foi possível retomar a chamada.');
    } finally {
      this.rejoinInFlight = false;
    }
  }

  private async handleKicked(reason: string): Promise<void> {
    await this.leave({ reason: reason || 'Você foi removido da chamada pelo Mestre.' });
  }

  private async loadIceServers(tableId: string): Promise<MediaIceServersResponse> {
    try {
      return await socketService.fetchIceServers(tableId);
    } catch {
      // Fallback claro sem TURN: STUN público mantém LAN/redes abertas.
      return {
        iceServers: DEFAULT_ICE_SERVERS,
        ttlSeconds: 3600,
        mode: 'mesh',
        turnConfigured: false,
        maxPeers: 8,
      };
    }
  }

  private ensurePeer(peer: MediaPeer, initiator: boolean): PeerRuntime | null {
    if (!isBrowserWithWebRtc()) {
      this.setError('Seu navegador não suporta chamadas WebRTC.');
      return null;
    }
    const existing = this.peers.get(peer.peerId);
    if (existing) {
      existing.userId = peer.userId;
      existing.username = peer.username;
      existing.mediaState = normalizeMediaState(peer.mediaState);
      this.notify();
      return existing;
    }

    const selfId = socketService.getPeerId?.() ?? socketService.socketId ?? '';
    const polite = Boolean(selfId) && selfId < peer.peerId;
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({ iceServers: (this.iceConfig?.iceServers ?? DEFAULT_ICE_SERVERS) as RTCIceServer[] });
    } catch {
      this.setError('Não foi possível abrir a conexão de áudio.');
      return null;
    }

    const runtime: PeerRuntime = {
      peerId: peer.peerId,
      userId: peer.userId,
      username: peer.username,
      mediaState: normalizeMediaState(peer.mediaState),
      pc,
      stream: null,
      connectionState: pc.connectionState ?? 'new',
      quality: 'good',
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      polite,
      audioSender: null,
      videoSender: null,
      analyser: null,
    };
    this.peers.set(peer.peerId, runtime);
    this.attachLocalTracks(runtime);

    pc.onicecandidate = (event) => {
      if (!this.tableId) return;
      const candidate = event.candidate ? event.candidate.toJSON?.() ?? null : null;
      void socketService.sendMediaIce({
        tableId: this.tableId,
        toPeerId: peer.peerId,
        candidate,
      }).catch(() => undefined);
    };

    pc.ontrack = (event) => {
      const stream = event.streams?.[0]
        ?? (typeof MediaStream !== 'undefined' ? new MediaStream([event.track]) : null);
      runtime.stream = stream;
      if (stream) this.attachAnalyser(peer.peerId, stream);
      this.notify();
    };

    pc.onconnectionstatechange = () => {
      runtime.connectionState = pc.connectionState;
      if (pc.connectionState === 'failed' && initiator) {
        try { pc.restartIce?.(); } catch {}
        void this.negotiate(peer.peerId, true);
      }
      this.notify();
    };

    this.notify();
    if (initiator) void this.negotiate(peer.peerId);
    return runtime;
  }

  private attachLocalTracks(peer: PeerRuntime): void {
    if (!this.localStream) return;
    try {
      if (this.audioTrack) peer.audioSender = peer.pc.addTrack(this.audioTrack, this.localStream);
      const videoTrack = this.screenTrack ?? this.cameraTrack;
      if (videoTrack) peer.videoSender = peer.pc.addTrack(videoTrack, this.localStream);
    } catch {
      // addTrack pode falhar se a track foi encerrada; o próximo apply recupera.
    }
  }

  private async negotiate(peerId: string, iceRestart = false): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer || peer.makingOffer || peer.pc.signalingState === 'closed') return;
    if (!iceRestart && peer.pc.signalingState !== 'stable') return;
    try {
      peer.makingOffer = true;
      const offer = await peer.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await peer.pc.setLocalDescription(offer);
      if (!this.tableId) return;
      await socketService.sendMediaOffer({
        tableId: this.tableId,
        toPeerId: peerId,
        sdp: peer.pc.localDescription ?? offer,
      });
    } catch {
      // Negociação transitória: ICE/next state ou rejoin resolve.
    } finally {
      peer.makingOffer = false;
    }
  }

  private async handleSignal(
    payload: { tableId: string; toPeerId: string; sdp: RTCSessionDescriptionInit },
    kind: 'offer' | 'answer',
  ): Promise<void> {
    if (!this.tableId || payload.tableId !== this.tableId) return;
    let peer = this.peers.get(payload.toPeerId);
    if (!peer && kind === 'offer') {
      // `mediaPeerJoined` pode ter sido perdido: cria um peer mínimo.
      peer = this.ensurePeer({
        peerId: payload.toPeerId,
        userId: '',
        username: 'Participante',
        mediaState: defaultMediaState(),
      }, false) ?? undefined;
    }
    if (!peer) return;

    const description = payload.sdp;
    if (!description || (description.type !== 'offer' && description.type !== 'answer')) return;

    try {
      if (description.type === 'offer') {
        const readyForOffer = !peer.makingOffer
          && (peer.pc.signalingState === 'stable' || peer.isSettingRemoteAnswerPending);
        const offerCollision = !readyForOffer;
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        if (offerCollision) {
          try {
            await peer.pc.setLocalDescription({ type: 'rollback' } as RTCLocalSessionDescriptionInit);
          } catch {}
        }
        peer.isSettingRemoteAnswerPending = false;
        await peer.pc.setRemoteDescription(description);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        if (!this.tableId) return;
        await socketService.sendMediaAnswer({
          tableId: this.tableId,
          toPeerId: peer.peerId,
          sdp: peer.pc.localDescription ?? answer,
        });
      } else {
        peer.isSettingRemoteAnswerPending = true;
        await peer.pc.setRemoteDescription(description);
        peer.isSettingRemoteAnswerPending = false;
      }
    } catch {
      // SDP inválido/fora de ordem: a reconexão recria o peer.
    }
  }

  private async handleIce(payload: { tableId: string; toPeerId: string; candidate: RTCIceCandidateInit | null }): Promise<void> {
    if (!this.tableId || payload.tableId !== this.tableId || !payload.candidate) return;
    const peer = this.peers.get(payload.toPeerId);
    if (!peer) return;
    try {
      await peer.pc.addIceCandidate(payload.candidate);
    } catch {
      // Candidate chega antes da remote description: o próximo offer/answer
      // traz a negociação completa; ignorar aqui é seguro.
    }
  }

  private handleRoomState(payload: { tableId: string; peers: MediaPeer[] }): void {
    if (!this.tableId || payload.tableId !== this.tableId) return;
    const seen = new Set<string>();
    for (const peer of payload.peers ?? []) {
      if (peer.peerId === socketService.getPeerId?.()) continue;
      seen.add(peer.peerId);
      const existing = this.peers.get(peer.peerId);
      if (existing) {
        existing.userId = peer.userId;
        existing.username = peer.username;
        existing.mediaState = normalizeMediaState(peer.mediaState);
      } else {
        // Quem entra recebe a lista: é o novo peer que inicia as ofertas.
        this.ensurePeer(peer, true);
      }
    }
    for (const peerId of Array.from(this.peers.keys())) {
      if (!seen.has(peerId)) this.removePeer(peerId);
    }
    this.notify();
  }

  private handlePeerJoined(payload: { tableId: string; peer: MediaPeer }): void {
    if (!this.tableId || payload.tableId !== this.tableId) return;
    if (payload.peer.peerId === socketService.getPeerId?.()) return;
    // O peer novo inicia a oferta; quem já estava espera.
    this.ensurePeer(payload.peer, false);
    this.notify();
  }

  private handlePeerLeft(payload: { tableId: string; peerId: string }): void {
    if (!this.tableId || payload.tableId !== this.tableId) return;
    this.removePeer(payload.peerId);
    this.notify();
  }

  private handleStateUpdated(payload: { tableId: string; peerId: string; mediaState: MediaState }): void {
    if (!this.tableId || payload.tableId !== this.tableId) return;
    const peer = this.peers.get(payload.peerId);
    if (!peer) return;
    peer.mediaState = normalizeMediaState(payload.mediaState);
    this.notify();
  }

  private removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    this.detachAnalyser(peerId);
    try { peer.pc.close(); } catch {}
    this.peers.delete(peerId);
  }

  private teardownPeers(): void {
    for (const peerId of Array.from(this.peers.keys())) {
      this.removePeer(peerId);
    }
    this.peers.clear();
  }

  // ------------------------------------------------------------------
  // Qualidade (getStats)
  // ------------------------------------------------------------------

  private async pollQuality(): Promise<void> {
    if (this.peers.size === 0) return;
    let changed = false;
    for (const peer of this.peers.values()) {
      if (!peer.pc.getStats) continue;
      try {
        const stats = await peer.pc.getStats();
        const quality = this.qualityFromStats(stats);
        if (quality !== peer.quality) {
          peer.quality = quality;
          changed = true;
        }
      } catch {
        // getStats pode falhar durante renegociação.
      }
    }
    if (changed) this.notify();
  }

  private qualityFromStats(stats: RTCStatsReport): MediaConnectionQuality {
    let rtt: number | null = null;
    let packetsLost = 0;
    let packetsReceived = 0;
    stats.forEach((report) => {
      if (report.type === 'candidate-pair') {
        const selected = report.selected === true || report.nominated === true || report.state === 'succeeded';
        if (selected && typeof report.currentRoundTripTime === 'number') {
          rtt = report.currentRoundTripTime;
        }
      } else if (report.type === 'inbound-rtp') {
        if (typeof report.packetsLost === 'number') packetsLost += report.packetsLost;
        if (typeof report.packetsReceived === 'number') packetsReceived += report.packetsReceived;
      }
    });
    const total = packetsLost + packetsReceived;
    const loss = total > 0 ? packetsLost / total : 0;
    if ((rtt !== null && rtt > 0.4) || loss > 0.1) return 'poor';
    if ((rtt !== null && rtt > 0.15) || loss > 0.03) return 'fair';
    return 'good';
  }

  // ------------------------------------------------------------------
  // Publicação de estado / limpeza
  // ------------------------------------------------------------------

  private publishState(): void {
    if (!this.tableId || !this.joined) return;
    void socketService.updateMediaState({
      tableId: this.tableId,
      mic: this.mic,
      deafened: this.deafened,
      camera: this.camera,
      screen: this.screen,
    }).catch(() => undefined);
  }

  private cleanupLocalMedia(): void {
    if (this.speakingTimer) {
      clearInterval(this.speakingTimer);
      this.speakingTimer = null;
    }
    if (this.qualityTimer) {
      clearInterval(this.qualityTimer);
      this.qualityTimer = null;
    }
    this.detachAnalyser('local');
    for (const peerId of Array.from(this.peers.keys())) this.detachAnalyser(peerId);
    if (this.audioContext) {
      try { void this.audioContext.close().catch(() => undefined); } catch {}
      this.audioContext = null;
    }
    this.stopCameraTrack();
    this.stopScreenTrack();
    if (this.audioTrack) {
      try { this.audioTrack.stop(); } catch {}
      this.audioTrack = null;
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        try { track.stop(); } catch {}
      }
      this.localStream = null;
    }
  }
}

export const mediaService = new MediaService();
