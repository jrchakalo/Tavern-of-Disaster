import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const storeState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../../../stores/mediaStore', async () => {
  const { reactive } = await import('vue');
  const store = reactive({
    joined: false,
    mic: 'on',
    deafened: false,
    camera: 'off',
    screen: false,
    speaking: false,
    peers: [] as unknown[],
    selectedDevices: {} as Record<string, string>,
    localUsername: 'Tester',
    localStream: null as unknown,
  });
  storeState.current = store;
  return { useMediaStore: () => store };
});

import ParticipantGrid from '../ParticipantGrid.vue';

interface GridStore {
  joined: boolean;
  mic: string;
  deafened: boolean;
  camera: string;
  screen: boolean;
  speaking: boolean;
  peers: Array<{
    peerId: string;
    userId: string;
    username: string;
    mediaState: { mic: string; deafened: boolean; camera: string; screen: boolean; speaking: boolean };
    stream: unknown;
    connectionState: string;
    quality: string;
  }>;
  localUsername: string;
  localStream: unknown;
  selectedDevices: Record<string, string>;
}

function store(): GridStore {
  return storeState.current as GridStore;
}

function fakeStream(kind: 'audio' | 'video' | 'both' = 'audio') {
  const video = { kind: 'video' };
  const audio = { kind: 'audio' };
  return {
    getVideoTracks: () => (kind === 'video' || kind === 'both' ? [video] : []),
    getAudioTracks: () => (kind === 'audio' || kind === 'both' ? [audio] : []),
    getTracks: () => (kind === 'both' ? [video, audio] : kind === 'video' ? [video] : [audio]),
  };
}

function remote(overrides: Partial<GridStore['peers'][number]> = {}) {
  return {
    peerId: 'peer-1',
    userId: 'user-2',
    username: 'Lyra',
    mediaState: { mic: 'on', deafened: false, camera: 'off', screen: false, speaking: false },
    stream: fakeStream('audio'),
    connectionState: 'connected',
    quality: 'good',
    ...overrides,
  };
}

describe('ParticipantGrid', () => {
  beforeEach(() => {
    const s = store();
    s.joined = false;
    s.mic = 'on';
    s.deafened = false;
    s.camera = 'off';
    s.screen = false;
    s.speaking = false;
    s.peers = [];
    s.localUsername = 'Tester';
    s.localStream = null;
    s.selectedDevices = {};
  });

  it('não renderiza nada fora da chamada', () => {
    const wrapper = mount(ParticipantGrid);
    expect(wrapper.find('.participant-grid').exists()).toBe(false);
    wrapper.unmount();
  });

  it('mostra tile local com placeholder de câmera desligada e peer com badges', () => {
    const s = store();
    s.joined = true;
    s.camera = 'off';
    s.mic = 'muted';
    s.localStream = fakeStream('both');
    s.peers = [remote({ mediaState: { mic: 'muted', deafened: false, camera: 'off', screen: false, speaking: false } })];

    const wrapper = mount(ParticipantGrid);
    const tiles = wrapper.findAll('.media-tile');
    expect(tiles).toHaveLength(2);
    expect(tiles[0].attributes('data-peer-id')).toBe('local');
    expect(tiles[0].text()).toContain('Você');

    expect(tiles[1].text()).toContain('Lyra');
    expect(tiles[1].text()).toContain('Mudo');
    expect(tiles[1].text()).toContain('Câmera off');
    expect(wrapper.findAll('[aria-label="Microfone mudo"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it('renderiza vídeo remoto e áudio separado respeitando deafen', () => {
    const s = store();
    s.joined = true;
    s.deafened = true;
    s.peers = [remote({
      stream: fakeStream('both'),
      mediaState: { mic: 'on', deafened: false, camera: 'on', screen: false, speaking: true },
    })];

    const wrapper = mount(ParticipantGrid);
    expect(wrapper.findAll('.media-tile video')).toHaveLength(1);
    const audio = wrapper.find('.media-tile audio');
    expect(audio.exists()).toBe(true);
    expect((audio.element as HTMLAudioElement).muted).toBe(true);
    expect(wrapper.get('[data-peer-id="peer-1"]').classes()).toContain('is-speaking');
    wrapper.unmount();
  });

  it('destaca a tela compartilhada como tile grande e primeiro', () => {
    const s = store();
    s.joined = true;
    s.camera = 'on';
    s.localStream = fakeStream('both');
    s.peers = [remote({
      stream: fakeStream('both'),
      mediaState: { mic: 'on', deafened: false, camera: 'off', screen: true, speaking: false },
    })];

    const wrapper = mount(ParticipantGrid);
    const first = wrapper.findAll('.media-tile')[0];
    expect(first.attributes('data-peer-id')).toBe('peer-1');
    expect(first.classes()).toContain('is-screen');
    expect(first.text()).toContain('Tela');
    wrapper.unmount();
  });
});
