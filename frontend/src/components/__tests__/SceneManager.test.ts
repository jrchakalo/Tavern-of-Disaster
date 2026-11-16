import { afterEach, describe, expect, it, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';

import SceneManager from '../SceneManager.vue';
import type { IScene } from '../../types';
import type { AssetUsage } from '../../services/storageService';

const scenes: IScene[] = [
  { _id: 'scene-1', tableId: 'table-1', name: 'Cena 1', type: 'battlemap' },
];

const baseProps = {
  scenes,
  activeSceneId: 'scene-1',
  isCollapsed: false,
  mapUrlInput: '',
  newSceneName: '',
  newSceneImageUrl: '',
  newSceneType: 'battlemap' as const,
  isUploadingMap: false,
};

const usage: AssetUsage = {
  usedBytes: 52_428_800,
  quotaBytes: 209_715_200,
  remainingBytes: 157_286_400,
  count: 2,
  byKind: { map: 31_457_280, token: 20_971_520, avatar: 0 },
};

function mountManager(overrides: Record<string, unknown> = {}) {
  return shallowMount(SceneManager, {
    props: { ...baseProps, ...overrides },
  });
}

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: '(max-width: 900px)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  });
}

describe('SceneManager upload feedback', () => {
  afterEach(() => {
    mockMatchMedia(false);
  });

  it('exibe barra e percentual durante o upload', () => {
    const wrapper = mountManager({ isUploadingMap: true, uploadProgress: 42.6 });

    const progress = wrapper.find('[role="progressbar"]');
    expect(progress.exists()).toBe(true);
    expect(progress.attributes('aria-valuenow')).toBe('43');
    expect(progress.text()).toContain('43%');
    expect(wrapper.find('.upload-button').text()).toContain('Enviando…');

    wrapper.unmount();
  });

  it('mostra uso de armazenamento em formato legível', () => {
    const wrapper = mountManager({ usage, isUploadingMap: false });

    const summary = wrapper.find('.usage-summary');
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain('50 MB de 200 MB');
    expect(wrapper.find('.usage-warning').exists()).toBe(false);

    wrapper.unmount();
  });

  it('avisa quando o espaço restante está baixo', () => {
    const wrapper = mountManager({
      usage: { ...usage, remainingBytes: 5 * 1024 * 1024 },
    });

    expect(wrapper.find('.usage-summary').classes()).toContain('low');
    const warning = wrapper.find('.usage-warning');
    expect(warning.exists()).toBe(true);
    expect(warning.text()).toContain('5 MB');

    wrapper.unmount();
  });

  it('mostra o erro de upload no painel', () => {
    const wrapper = mountManager({
      uploadError: 'A mesa atingiu o limite de armazenamento.',
    });

    const error = wrapper.find('.upload-error');
    expect(error.exists()).toBe(true);
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toBe('A mesa atingiu o limite de armazenamento.');

    wrapper.unmount();
  });

  it('aceita somente imagens e habilita câmera no celular', async () => {
    mockMatchMedia(true);
    const wrapper = mountManager();
    await nextTick();

    const input = wrapper.find('input[type="file"]');
    expect(input.attributes('accept')).toBe('image/*');
    expect(input.attributes('capture')).toBe('environment');

    wrapper.unmount();
  });

  it('não força capture no desktop', () => {
    mockMatchMedia(false);
    const wrapper = mountManager();

    const input = wrapper.find('input[type="file"]');
    expect(input.attributes('accept')).toBe('image/*');
    expect(input.attributes('capture')).toBeUndefined();

    wrapper.unmount();
  });
});
