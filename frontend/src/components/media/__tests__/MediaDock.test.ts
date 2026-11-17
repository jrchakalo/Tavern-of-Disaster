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

  it('fora da chamada mostra uma pílula única com o rótulo Chamada', async () => {
    const wrapper = mountDock();
    expect(wrapper.get('.media-dock').classes()).toContain('media-dock--pill');
    expect(wrapper.get('.media-dock__label').text()).toBe('Chamada');
    const join = wrapper.get('button.media-btn--join');
    expect(join.attributes('aria-label')).toBe('Entrar na chamada');
    expect(wrapper.find('.media-dock__count').exists()).toBe(false);
    expect(wrapper.findAll('.media-btn')).toHaveLength(1);

    await join.trigger('click');
    await flushPromises();

    expect(store().join).toHaveBeenCalledWith('table-1');
    wrapper.unmount();
  });

  it('desabilita o join enquanto conecta', () => {
    store().connecting = true;
    const wrapper = mountDock();
    const join = wrapper.get('button.media-btn--join');
    expect(join.attributes('aria-label')).toBe('Conectando à chamada');
    expect(join.attributes('disabled')).toBeDefined();
    expect(wrapper.get('.media-dock__label').text()).toBe('Conectando…');
    wrapper.unmount();
  });

  it('na chamada mostra a barra de 56 px, contagem, controles e nota de TURN', () => {
    const s = store();
    s.joined = true;
    s.participantCount = 3;
    s.mic = 'muted';
    s.deafened = true;
    s.turnConfigured = false;

    const wrapper = mountDock();

    expect(wrapper.get('.media-dock').classes()).not.toContain('media-dock--pill');
    expect(wrapper.get('.media-dock__label').text()).toBe('Na chamada');
    expect(wrapper.get('.media-dock__count').text()).toBe('3');
    expect(wrapper.find('button.media-btn--join').exists()).toBe(false);
    expect(wrapper.get('[aria-label="Ativar microfone"]').text()).toBe('Mudo');
    expect(wrapper.get('[aria-label="Ouvir a chamada"]').text()).toBe('Surdo');

    // O aviso de TURN não abre uma linha que empurra a barra.
    const note = wrapper.get('.media-dock__turn-note');
    expect(note.text()).toBe('Sem TURN');
    expect(note.attributes('title')).toContain('Sem TURN configurado');
    expect(wrapper.find('.media-dock__warning').exists()).toBe(false);
    wrapper.unmount();
  });

  it('expande a grade da chamada pelo rótulo e pela prévia', async () => {
    store().joined = true;
    store().participantCount = 2;
    const wrapper = mount(MediaDock, {
      props: { tableId: 'table-1' },
      slots: { preview: '<span class="preview-stub">tiles</span>' },
      global: { stubs: { DeviceSettings: true } },
    });

    expect(wrapper.find('.media-dock__preview .preview-stub').exists()).toBe(true);
    await wrapper.get('.media-dock__status').trigger('click');
    await wrapper.get('.media-dock__preview').trigger('click');

    expect(wrapper.emitted('expand')).toHaveLength(2);
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
