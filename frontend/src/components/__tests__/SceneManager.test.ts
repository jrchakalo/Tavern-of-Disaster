import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';

const storageMock = vi.hoisted(() => ({
  uploadMap: vi.fn(),
}));
vi.mock('../../services/storageService', () => ({
  uploadMap: storageMock.uploadMap,
}));

import SceneManager from '../SceneManager.vue';
import BaseDialog from '../ui/BaseDialog.vue';
import type { IScene } from '../../types';
import type { AssetUsage } from '../../services/storageService';

const scenes: IScene[] = [
  {
    _id: 'scene-1',
    tableId: 'table-1',
    name: 'Cena 1',
    type: 'battlemap',
    gridWidth: 24,
    gridHeight: 18,
    metersPerSquare: 1.5,
  },
];

const usage: AssetUsage = {
  usedBytes: 52_428_800,
  quotaBytes: 209_715_200,
  remainingBytes: 157_286_400,
  count: 2,
  byKind: { map: 31_457_280, token: 20_971_520, avatar: 0 },
};

function mountManager(overrides: Record<string, unknown> = {}) {
  const createScene = vi.fn(async () => undefined);
  const deleteScene = vi.fn(async () => undefined);
  const renameScene = vi.fn(async () => undefined);
  const activateScene = vi.fn(async () => undefined);
  const wrapper = mount(SceneManager, {
    attachTo: document.body,
    props: {
      scenes,
      activeSceneId: 'scene-1',
      tableId: 'table-1',
      createScene,
      deleteScene,
      renameScene,
      activateScene,
      ...overrides,
    },
    global: { stubs: { teleport: true } },
  });
  return { wrapper, createScene, deleteScene, renameScene, activateScene };
}

function dialogByTitle(wrapper: ReturnType<typeof mountManager>['wrapper'], title: string) {
  return wrapper
    .findAllComponents(BaseDialog)
    .find((dialog) => dialog.props('title') === title);
}

beforeEach(() => {
  storageMock.uploadMap.mockReset();
  storageMock.uploadMap.mockImplementation(async (_file: File, _tableId: string, onProgress?: (p: number) => void) => {
    onProgress?.(60);
    return '/uploads/maps/enviado.webp';
  });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SceneManager — cena em um passo', () => {
  it('mostra o uso de armazenamento em formato legível', () => {
    const { wrapper } = mountManager({ usage });
    const summary = wrapper.find('.usage-summary');
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain('50 MB de 200 MB');
    expect(wrapper.find('.usage-warning').exists()).toBe(false);
    wrapper.unmount();
  });

  it('avisa quando o espaço restante está baixo', () => {
    const { wrapper } = mountManager({
      usage: { ...usage, remainingBytes: 5 * 1024 * 1024 },
    });
    expect(wrapper.find('.usage-summary').classes()).toContain('low');
    expect(wrapper.find('.usage-warning').text()).toContain('5 MB');
    wrapper.unmount();
  });

  it('lista a cena com metadados reais e estado ativo', () => {
    const { wrapper } = mountManager();
    const row = wrapper.get('.scene-list li');
    expect(row.text()).toContain('Cena 1');
    expect(row.text()).toContain('24×18');
    expect(row.text()).toContain('1.5 m/quad');
    expect(row.text()).toContain('Ativa');
    wrapper.unmount();
  });

  it('explica o primeiro passo quando não há cenas', () => {
    const { wrapper } = mountManager({ scenes: [], activeSceneId: null });
    expect(wrapper.text()).toContain('Nenhuma cena ainda.');
    expect(wrapper.text()).toContain('Ativar ao criar');
    wrapper.unmount();
  });

  it('cria cena com nome, grade, tipo e ativação em um único submit', async () => {
    const { wrapper, createScene } = mountManager();
    await wrapper.get('#scene-name').setValue('Cripta');
    await wrapper.get('#scene-columns').setValue(24);
    await wrapper.get('#scene-rows').setValue(18);
    await wrapper.get('#scene-scale').setValue(1.5);

    await wrapper.get('form.create-scene-form').trigger('submit');
    await flushPromises();

    expect(storageMock.uploadMap).not.toHaveBeenCalled();
    expect(createScene).toHaveBeenCalledWith({
      name: 'Cripta',
      imageUrl: '',
      type: 'battlemap',
      gridWidth: 24,
      gridHeight: 18,
      metersPerSquare: 1.5,
      activate: true,
    });
    expect(wrapper.get('#scene-name').element).toHaveProperty('value', '');
    wrapper.unmount();
  });

  it('envia a imagem escolhida e usa a URL no payload da cena', async () => {
    const { wrapper, createScene } = mountManager();
    await wrapper.get('#scene-name').setValue('Cripta');
    const file = new File(['px'], 'mapa.png', { type: 'image/png' });
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] });
    await input.trigger('change');

    await wrapper.get('form.create-scene-form').trigger('submit');
    await flushPromises();

    expect(storageMock.uploadMap).toHaveBeenCalledWith(file, 'table-1', expect.any(Function));
    expect(createScene).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Cripta',
      imageUrl: '/uploads/maps/enviado.webp',
    }));
    wrapper.unmount();
  });

  it('mostra erro inline e tenta de novo sem reenviar a imagem', async () => {
    const { wrapper, createScene } = mountManager();
    createScene.mockRejectedValueOnce(new Error('Servidor indisponível.'));
    await wrapper.get('#scene-name').setValue('Cripta');

    await wrapper.get('form.create-scene-form').trigger('submit');
    await flushPromises();

    const error = wrapper.get('.upload-error');
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toContain('Servidor indisponível.');

    const retry = wrapper.findAll('button').find((button) => button.text() === 'Tentar de novo');
    expect(retry).toBeTruthy();
    await retry!.trigger('click');
    await flushPromises();

    expect(createScene).toHaveBeenCalledTimes(2);
    expect(createScene.mock.calls[1]?.[0]).toEqual(createScene.mock.calls[0]?.[0]);
    wrapper.unmount();
  });

  it('clampa colunas, linhas e escala para os limites válidos', async () => {
    const { wrapper, createScene } = mountManager();
    await wrapper.get('#scene-name').setValue('Limites');
    await wrapper.get('#scene-columns').setValue(0);
    await wrapper.get('#scene-rows').setValue(999);
    await wrapper.get('#scene-scale').setValue(999);

    await wrapper.get('form.create-scene-form').trigger('submit');
    await flushPromises();

    expect(createScene).toHaveBeenCalledWith(expect.objectContaining({
      gridWidth: 1,
      gridHeight: 200,
      metersPerSquare: 50,
    }));
    wrapper.unmount();
  });

  it('só exclui a cena depois de confirmar, nomeando a cena e a consequência', async () => {
    const { wrapper, deleteScene } = mountManager();
    await wrapper.get('button[aria-label="Excluir cena Cena 1"]').trigger('click');
    await nextTick();

    expect(deleteScene).not.toHaveBeenCalled();
    const dialog = dialogByTitle(wrapper, 'Excluir cena?');
    expect(dialog?.props('open')).toBe(true);
    expect(dialog?.text()).toContain('Cena 1');
    expect(dialog?.text()).toContain('cena ativa');

    const confirm = wrapper.findAll('button').find((button) => button.text() === 'Excluir cena');
    expect(confirm).toBeTruthy();
    await confirm!.trigger('click');
    await flushPromises();

    expect(deleteScene).toHaveBeenCalledWith('scene-1');
    wrapper.unmount();
  });

  it('renomeia por diálogo em vez de prompt nativo', async () => {
    const { wrapper, renameScene } = mountManager();
    await wrapper.get('button[aria-label="Renomear cena Cena 1"]').trigger('click');
    await nextTick();

    const dialog = dialogByTitle(wrapper, 'Renomear cena');
    expect(dialog?.props('open')).toBe(true);
    await wrapper.get('#scene-rename-input').setValue('Cripta Profunda');
    const save = wrapper.findAll('button').find((button) => button.text() === 'Salvar nome');
    await save!.trigger('click');
    await flushPromises();

    expect(renameScene).toHaveBeenCalledWith('scene-1', 'Cripta Profunda');
    wrapper.unmount();
  });
});
