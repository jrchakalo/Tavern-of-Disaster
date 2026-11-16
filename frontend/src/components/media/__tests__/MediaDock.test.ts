import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const storeState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../../../stores/mediaStore', async () => {
  const { reactive } = await import('vue');
  const store = reactive({
    joined: false,
    connecting: false,
    mic: 'on',
    deafened: false,
    camera: 'off',
    screen: false,
    speaking: false,
    peers: [] as unknown[],
    error: null as string | null,
    turnConfigured: true,
    selectedDevices: {} as Record<string, string>,
    participantCount: 0,
    localUsername: 'Tester',
    localStream: null as unknown,
    join: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
    toggleMic: vi.fn(),
    toggleDeafen: vi.fn(),
    toggleCamera: vi.fn(async () => {}),
    startScreenShare: vi.fn(async () => {}),
    stopScreenShare: vi.fn(async () => {}),
    listDevices: vi.fn(async () => []),
    setDevice: vi.fn(async () => {}),
    clearError: vi.fn(),
  });
  storeState.current = store;
  return { useMediaStore: () => store };
});

import MediaDock from '../MediaDock.vue';

interface MediaStoreStub {
  joined: boolean;
  connecting: boolean;
  mic: string;
  deafened: boolean;
  camera: string;
  screen: boolean;
  error: string | null;
  turnConfigured: boolean;
  participantCount: number;
  join: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  toggleMic: ReturnType<typeof vi.fn>;
  toggleDeafen: ReturnType<typeof vi.fn>;
  toggleCamera: ReturnType<typeof vi.fn>;
  startScreenShare: ReturnType<typeof vi.fn>;
  stopScreenShare: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
}

function store(): MediaStoreStub {
  return storeState.current as MediaStoreStub;
}

function mountDock() {
  return mount(MediaDock, {
    props: { tableId: 'table-1' },
    global: { stubs: { DeviceSettings: true } },
  });
}

describe('MediaDock', () => {
  beforeEach(() => {
    const s = store();
    s.joined = false;
    s.connecting = false;
    s.mic = 'on';
    s.deafened = false;
    s.camera = 'off';
    s.screen = false;
    s.error = null;
    s.turnConfigured = true;
    s.participantCount = 0;
    Object.values(s).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        (value as { mockClear: () => void }).mockClear();
      }
    });
  });

  it('mostra o botão de entrar e delega a chamada com a mesa', async () => {
    const wrapper = mountDock();
    expect(wrapper.text()).toContain('Chamada de voz');
    const join = wrapper.get('button.media-btn--join');
    expect(join.text()).toBe('Entrar na chamada');

    await join.trigger('click');
    await flushPromises();

    expect(store().join).toHaveBeenCalledWith('table-1');
    wrapper.unmount();
  });

  it('desabilita o join enquanto conecta', () => {
    store().connecting = true;
    const wrapper = mountDock();
    const join = wrapper.get('button.media-btn--join');
    expect(join.text()).toBe('Conectando…');
    expect(join.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Conectando à chamada…');
    wrapper.unmount();
  });

  it('mostra contagem, controles ativos e aviso sem TURN', () => {
    const s = store();
    s.joined = true;
    s.participantCount = 3;
    s.mic = 'muted';
    s.deafened = true;
    s.turnConfigured = false;

    const wrapper = mountDock();

    expect(wrapper.text()).toContain('3');
    expect(wrapper.get('[aria-label="Ativar microfone"]').text()).toBe('Mudo');
    expect(wrapper.get('[aria-label="Ouvir a chamada"]').text()).toBe('Surdo');
    expect(wrapper.text()).toContain('Sem TURN configurado');
    wrapper.unmount();
  });

  it('delega mute, deafen, câmera, tela e saída', async () => {
    store().joined = true;
    const wrapper = mountDock();

    await wrapper.get('[aria-label="Silenciar microfone"]').trigger('click');
    await wrapper.get('[aria-label="Ensurdar a chamada"]').trigger('click');
    await wrapper.get('[aria-label="Ligar câmera"]').trigger('click');
    await wrapper.get('[aria-label="Compartilhar tela"]').trigger('click');
    await wrapper.get('[aria-label="Sair da chamada"]').trigger('click');

    const s = store();
    expect(s.toggleMic).toHaveBeenCalledTimes(1);
    expect(s.toggleDeafen).toHaveBeenCalledTimes(1);
    expect(s.toggleCamera).toHaveBeenCalledTimes(1);
    expect(s.startScreenShare).toHaveBeenCalledTimes(1);
    expect(s.leave).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('exibe erro de permissão e permite dispensar', async () => {
    const s = store();
    s.joined = true;
    s.error = 'Permissão de microfone negada.';

    const wrapper = mountDock();
    expect(wrapper.get('[role="alert"]').text()).toContain('Permissão de microfone negada.');

    await wrapper.get('[aria-label="Fechar aviso"]').trigger('click');
    expect(s.clearError).toHaveBeenCalled();
    wrapper.unmount();
  });
});
