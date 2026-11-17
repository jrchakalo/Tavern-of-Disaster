import { computed, markRaw, ref, shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';
import { mediaService, type MediaSnapshot } from '../services/mediaService';
import { currentUser } from '../services/authService';
import type {
  MediaConnectionQuality,
  MediaDeviceKind,
  MediaIceServersResponse,
  MediaPeerView,
  MediaState,
} from '../types';

/**
 * Estado reativo da chamada. A store é dona do que a UI vê; o
 * `mediaService` é dono dos streams e `RTCPeerConnection`s.
 */
export const useMediaStore = defineStore('media', () => {
  const joined = ref(false);
  const connecting = ref(false);
  const mic = ref<MediaState['mic']>('on');
  const deafened = ref(false);
  const camera = ref<MediaState['camera']>('off');
  const screen = ref(false);
  const speaking = ref(false);
  const peers = ref<MediaPeerView[]>([]);
  const error = ref<string | null>(null);
  const iceConfig = shallowRef<MediaIceServersResponse | null>(null);
  const turnConfigured = ref(false);
  const localStream = shallowRef<MediaStream | null>(null);
  const selectedDevices = ref<Partial<Record<MediaDeviceKind, string>>>({});
  let bound = false;

  function applySnapshot(snapshot: MediaSnapshot): void {
    joined.value = snapshot.joined;
    connecting.value = snapshot.connecting;
    mic.value = snapshot.mic;
    deafened.value = snapshot.deafened;
    camera.value = snapshot.camera;
    screen.value = snapshot.screen;
    speaking.value = snapshot.speaking;
    localStream.value = snapshot.localStream ? markRaw(snapshot.localStream) : null;
    peers.value = snapshot.peers.map((peer) => ({
      ...peer,
      mediaState: { ...peer.mediaState },
      stream: peer.stream ? markRaw(peer.stream) : null,
    }));
    error.value = snapshot.error;
    iceConfig.value = snapshot.iceConfig;
    turnConfigured.value = snapshot.turnConfigured;
    selectedDevices.value = { ...snapshot.selectedDevices };
  }

  /** Liga a store ao serviço uma única vez (idempotente). */
  function init(): void {
    if (bound) return;
    bound = true;
    mediaService.subscribe(applySnapshot);
  }

  function reset(): void {
    joined.value = false;
    connecting.value = false;
    mic.value = 'on';
    deafened.value = false;
    camera.value = 'off';
    screen.value = false;
    speaking.value = false;
    peers.value = [];
    error.value = null;
    iceConfig.value = null;
    turnConfigured.value = false;
    localStream.value = null;
    selectedDevices.value = {};
  }

  init();
  applySnapshot(mediaService.getSnapshot());

  // Troca de usuário/login: nunca deixa stream/track de outra sessão vivos.
  watch(
    () => currentUser.value?.id ?? null,
    (id, previous) => {
      if (previous && previous !== id) {
        void mediaService.leave();
        reset();
      }
    },
  );

  const participantCount = computed(() => (joined.value ? peers.value.length + 1 : 0));
  const remoteStreams = computed(() =>
    peers.value
      .map((peer) => peer.stream)
      .filter((stream): stream is MediaStream => Boolean(stream)),
  );
  const hasVideo = computed(
    () =>
      (camera.value === 'on' || screen.value)
      || peers.value.some((peer) => peer.mediaState.camera === 'on' || peer.mediaState.screen),
  );
  const localUsername = computed(() => currentUser.value?.username ?? 'Você');

  async function join(tableId: string): Promise<void> {
    init();
    await mediaService.join(tableId);
  }

  async function leave(): Promise<void> {
    await mediaService.leave();
  }

  function toggleMic(): void {
    mediaService.toggleMic();
  }

  function toggleDeafen(): void {
    mediaService.toggleDeafen();
  }

  async function toggleCamera(): Promise<void> {
    await mediaService.toggleCamera();
  }

  async function startScreenShare(): Promise<void> {
    await mediaService.startScreenShare();
  }

  async function stopScreenShare(): Promise<void> {
    await mediaService.stopScreenShare();
  }

  function listDevices(): Promise<MediaDeviceInfo[]> {
    return mediaService.enumerateDevices();
  }

  async function setDevice(kind: MediaDeviceKind, deviceId: string): Promise<void> {
    await mediaService.setDevice(kind, deviceId);
  }

  function clearError(): void {
    error.value = null;
  }

  function qualityOf(peerId: string): MediaConnectionQuality {
    return peers.value.find((peer) => peer.peerId === peerId)?.quality ?? 'good';
  }

  return {
    // estado
    joined,
    connecting,
    mic,
    deafened,
    camera,
    screen,
    speaking,
    peers,
    error,
    iceConfig,
    turnConfigured,
    localStream,
    selectedDevices,
    // getters
    participantCount,
    remoteStreams,
    hasVideo,
    localUsername,
    // lifecycle
    init,
    reset,
    join,
    leave,
    // ações
    toggleMic,
    toggleDeafen,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    listDevices,
    setDevice,
    clearError,
    qualityOf,
  };
});
