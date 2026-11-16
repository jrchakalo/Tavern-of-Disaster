import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

type Snapshot = Record<string, unknown>;
type Listener = (snapshot: Snapshot) => void;

const serviceState = vi.hoisted(() => {
  const state: { snapshot: Record<string, unknown> } = {
    snapshot: {
      tableId: null,
      joined: false,
      connecting: false,
      mic: 'on',
      deafened: false,
      camera: 'off',
      screen: false,
      speaking: false,
      localStream: null,
      peers: [],
      error: null,
      iceConfig: null,
      turnConfigured: false,
      selectedDevices: {},
    },
  };
  const listeners = new Set<Listener>();

  function emit(): void {
    for (const listener of listeners) listener(state.snapshot);
  }

  function setSnapshot(patch: Snapshot): void {
    state.snapshot = { ...state.snapshot, ...patch };
    emit();
  }

  const api = {
    subscribe: vi.fn((listener: Listener) => {
      listeners.add(listener);
      listener(state.snapshot);
      return () => listeners.delete(listener);
    }),
    getSnapshot: vi.fn(() => state.snapshot),
    join: vi.fn(async () => {
      setSnapshot({ joined: true, connecting: false, tableId: 'table-1' });
    }),
    leave: vi.fn(async () => {
      setSnapshot({ joined: false, connecting: false, peers: [], localStream: null, tableId: null });
    }),
    toggleMic: vi.fn(),
    toggleDeafen: vi.fn(),
    toggleCamera: vi.fn(async () => {}),
    startScreenShare: vi.fn(async () => {}),
    stopScreenShare: vi.fn(async () => {}),
    enumerateDevices: vi.fn(async () => []),
    setDevice: vi.fn(async () => {}),
  };

  return { api, setSnapshot, state, listeners };
});

vi.mock('../../services/mediaService', () => ({ mediaService: serviceState.api }));

vi.mock('../../services/authService', async () => {
  const { ref } = await import('vue');
  return {
    currentUser: ref<{ id: string; username: string } | null>({ id: 'user-1', username: 'Tester' }),
  };
});

setActivePinia(createPinia());
const { useMediaStore } = await import('../mediaStore');
const { currentUser } = await import('../../services/authService');

const peer = (id = 'peer-1') => ({
  peerId: id,
  userId: `user-${id}`,
  username: `User ${id}`,
  mediaState: { mic: 'on', deafened: false, camera: 'off', screen: false, speaking: false },
  stream: { id: `stream-${id}`, getTracks: () => [] },
  connectionState: 'connected',
  quality: 'good',
});

describe('mediaStore', () => {
  beforeEach(() => {
    serviceState.setSnapshot({
      tableId: null,
      joined: false,
      connecting: false,
      mic: 'on',
      deafened: false,
      camera: 'off',
      screen: false,
      speaking: false,
      localStream: null,
      peers: [],
      error: null,
      iceConfig: null,
      turnConfigured: false,
      selectedDevices: {},
    });
    Object.values(serviceState.api).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        (value as { mockClear: () => void }).mockClear();
      }
    });
    currentUser.value = { id: 'user-1', username: 'Tester' };
    setActivePinia(createPinia());
  });

  it('join delega ao serviço e reflete o snapshot', async () => {
    const store = useMediaStore();
    await store.join('table-1');

    expect(serviceState.api.join).toHaveBeenCalledWith('table-1');
    expect(store.joined).toBe(true);
    expect(store.participantCount).toBe(1);
  });

  it('expõe peers, streams remotos, vídeo e contagem', () => {
    const store = useMediaStore();
    serviceState.setSnapshot({
      joined: true,
      peers: [peer('a'), peer('b')],
      camera: 'on',
    });

    expect(store.peers).toHaveLength(2);
    expect(store.remoteStreams).toHaveLength(2);
    expect(store.hasVideo).toBe(true);
    expect(store.participantCount).toBe(3);
    expect(store.qualityOf('a')).toBe('good');
  });

  it('delega mute, deafen, câmera, tela e dispositivos', async () => {
    const store = useMediaStore();
    serviceState.setSnapshot({ joined: true });

    store.toggleMic();
    store.toggleDeafen();
    await store.toggleCamera();
    await store.startScreenShare();
    await store.stopScreenShare();
    await store.setDevice('audioinput', 'mic-2');

    expect(serviceState.api.toggleMic).toHaveBeenCalledTimes(1);
    expect(serviceState.api.toggleDeafen).toHaveBeenCalledTimes(1);
    expect(serviceState.api.toggleCamera).toHaveBeenCalledTimes(1);
    expect(serviceState.api.startScreenShare).toHaveBeenCalledTimes(1);
    expect(serviceState.api.stopScreenShare).toHaveBeenCalledTimes(1);
    expect(serviceState.api.setDevice).toHaveBeenCalledWith('audioinput', 'mic-2');
  });

  it('leave encerra a chamada e limpa o estado', async () => {
    const store = useMediaStore();
    serviceState.setSnapshot({ joined: true, peers: [peer()], error: 'falha' });

    await store.leave();

    expect(serviceState.api.leave).toHaveBeenCalledTimes(1);
    expect(store.joined).toBe(false);
    expect(store.peers).toHaveLength(0);
    expect(store.localStream).toBeNull();
  });

  it('reset limpa estado local sem chamar o serviço', () => {
    const store = useMediaStore();
    serviceState.setSnapshot({ joined: true, peers: [peer()], error: 'falha' });

    store.reset();

    expect(store.joined).toBe(false);
    expect(store.peers).toHaveLength(0);
    expect(store.error).toBeNull();
  });

  it('troca de login encerra a chamada anterior', async () => {
    useMediaStore();
    serviceState.setSnapshot({ joined: true, peers: [peer()] });

    currentUser.value = { id: 'user-2', username: 'Outro' };
    await nextTick();

    expect(serviceState.api.leave).toHaveBeenCalled();
  });
});
