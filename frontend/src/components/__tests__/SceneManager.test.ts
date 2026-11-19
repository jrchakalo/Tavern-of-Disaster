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
  const updateScene = vi.fn(async () => undefined);
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
      updateScene,
      deleteScene,
      renameScene,
      activateScene,
      ...overrides,
    },
    global: { stubs: { teleport: true } },
  });
  return { wrapper, createScene, updateScene, deleteScene, renameScene, activateScene };
}

async function openCreateDialog(wrapper: ReturnType<typeof mountManager>['wrapper']) {
  await wrapper.get('.scene-create-btn').trigger('click');
  await nextTick();
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

  it('mostra a cena ativa em destaque com imagem, nome, tipo e selo Ativa', () => {
    const { wrapper } = mountManager();
    const current = wrapper.get('.scene-current');
    expect(current.text()).toContain('Cena atual');
    expect(current.get('.scene-current__name').text()).toBe('Cena 1');
    expect(current.text()).toContain('Cena de batalha');
    expect(current.get('.badge--active').text()).toBe('Ativa');
    expect(current.find('.scene-current__thumb').exists()).toBe(true);
    wrapper.unmount();
  });

  it('aplica nome, grade e escala em um único botão', async () => {
    const { wrapper, updateScene } = mountManager();
    await wrapper.get('#scene-current-name').setValue('Cripta Nova');
    await wrapper.get('#scene-current-columns').setValue(20);
    await wrapper.get('#scene-current-rows').setValue(15);
    await wrapper.get('#scene-current-scale').setValue(2);

    await wrapper.get('form.scene-edit').trigger('submit');
    await flushPromises();

    expect(updateScene).toHaveBeenCalledWith('scene-1', {
      name: 'Cripta Nova',
      gridWidth: 20,
      gridHeight: 15,
      metersPerSquare: 2,
    });
    expect(wrapper.get('.scene-status').text()).toContain('Alterações aplicadas');
    wrapper.unmount();
  });

  it('troca a cena para imagem, esconde a grade e explica o modo', async () => {
    const { wrapper, updateScene } = mountManager();
    await wrapper.get('.scene-edit input[value="image"]').setValue(true);

    expect(wrapper.find('#scene-current-columns').exists()).toBe(false);
    expect(wrapper.text()).toContain('Imagem não usa grade nem iniciativa.');

    await wrapper.get('form.scene-edit').trigger('submit');
    await flushPromises();

    expect(updateScene).toHaveBeenCalledWith('scene-1', { type: 'image' });
    wrapper.unmount();
  });

  it('não aplica ao digitar; avisa tokens fora de grade válida e recusa entrada inválida', async () => {
    const { wrapper, updateScene } = mountManager({
      tokensOnMap: [
        { _id: 'token-1', name: 'Ghoul', squareId: 'sq-500', ownerId: null, color: '#fff' },
      ],
    });

    await wrapper.get('#scene-current-columns').setValue(10);
    await wrapper.get('#scene-current-rows').setValue(10);
    expect(updateScene).not.toHaveBeenCalled();
    expect(wrapper.get('.scene-warning').text()).toContain('1 token(s)');

    // 0 colunas é inválido: o aviso de tokens dá lugar ao erro do campo.
    await wrapper.get('#scene-current-columns').setValue(0);
    expect(wrapper.find('.scene-warning').exists()).toBe(false);

    await wrapper.get('form.scene-edit').trigger('submit');
    await flushPromises();

    expect(updateScene).not.toHaveBeenCalled();
    const error = wrapper.get('#scene-editor-error');
    expect(error.text()).toBe('As colunas precisam estar entre 1 e 200.');
    const columns = wrapper.get('#scene-current-columns');
    expect(columns.attributes('aria-invalid')).toBe('true');
    expect(columns.attributes('aria-describedby')).toBe('scene-editor-error');
    expect((columns.element as HTMLInputElement).value).toBe('0');
    wrapper.unmount();
  });

  it('recusa colunas, linhas e metros fora da faixa sem chamar a API', async () => {
    const cases = [
      {
        field: '#scene-current-columns',
        value: 0,
        message: 'As colunas precisam estar entre 1 e 200.',
      },
      {
        field: '#scene-current-rows',
        value: 201,
        message: 'As linhas precisam estar entre 1 e 200.',
      },
      {
        field: '#scene-current-scale',
        value: 0,
        message: 'Os metros por quadrado precisam estar entre 0,1 e 50.',
      },
      {
        field: '#scene-current-scale',
        value: 51,
        message: 'Os metros por quadrado precisam estar entre 0,1 e 50.',
      },
    ];

    for (const testCase of cases) {
      const { wrapper, updateScene } = mountManager();
      await wrapper.get(testCase.field).setValue(testCase.value);
      await wrapper.get('form.scene-edit').trigger('submit');
      await flushPromises();

      expect(updateScene).not.toHaveBeenCalled();
      expect(wrapper.get('#scene-editor-error').text()).toBe(testCase.message);
      expect(wrapper.get(testCase.field).attributes('aria-invalid')).toBe('true');
      wrapper.unmount();
    }
  });

  it('aceita os limites de grade 1/200/0,1/50', async () => {
    const { wrapper, updateScene } = mountManager();
    await wrapper.get('#scene-current-columns').setValue(1);
    await wrapper.get('#scene-current-rows').setValue(200);
    await wrapper.get('#scene-current-scale').setValue(0.1);

    await wrapper.get('form.scene-edit').trigger('submit');
    await flushPromises();

    expect(updateScene).toHaveBeenLastCalledWith('scene-1', {
      gridWidth: 1,
      gridHeight: 200,
      metersPerSquare: 0.1,
    });

    await wrapper.get('#scene-current-scale').setValue(50);
    await wrapper.get('form.scene-edit').trigger('submit');
    await flushPromises();

    expect(updateScene).toHaveBeenLastCalledWith('scene-1', {
      gridWidth: 1,
      gridHeight: 200,
      metersPerSquare: 50,
    });
    expect(wrapper.find('#scene-editor-error').exists()).toBe(false);
    wrapper.unmount();
  });

  it('ativa a próxima cena da lista e volta para a primeira no fim', async () => {
    const second = {
      ...scenes[0]!,
      _id: 'scene-2',
      name: 'Cena 2',
    };
    const { wrapper, activateScene } = mountManager({ scenes: [...scenes, second] });

    await wrapper.get('.scene-next-btn').trigger('click');
    await flushPromises();
    expect(activateScene).toHaveBeenCalledWith('scene-2');

    await wrapper.setProps({ activeSceneId: 'scene-2' });
    await nextTick();
    await wrapper.get('.scene-next-btn').trigger('click');
    await flushPromises();
    expect(activateScene).toHaveBeenLastCalledWith('scene-1');
    wrapper.unmount();
  });

  it('desabilita Próxima cena quando há menos de duas cenas', () => {
    const { wrapper } = mountManager();
    expect(wrapper.get('.scene-next-btn').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('explica o primeiro passo quando não há cenas', () => {
    const { wrapper } = mountManager({ scenes: [], activeSceneId: null });
    expect(wrapper.text()).toContain('Nenhuma cena ainda.');
    expect(wrapper.text()).toContain('Ativar ao criar');
    wrapper.unmount();
  });

  it('cria cena em diálogo, com nome, grade, tipo e ativação em um único submit', async () => {
    const { wrapper, createScene } = mountManager();
    expect(wrapper.find('.scene-manager > .create-scene-form').exists()).toBe(false);
    await openCreateDialog(wrapper);
    expect(dialogByTitle(wrapper, 'Nova cena')?.props('open')).toBe(true);
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
    expect(dialogByTitle(wrapper, 'Nova cena')?.props('open')).toBe(false);
    wrapper.unmount();
  });

  it('envia a imagem escolhida e usa a URL no payload da cena', async () => {
    const { wrapper, createScene } = mountManager();
    await openCreateDialog(wrapper);
    await wrapper.get('#scene-name').setValue('Cripta');
    const file = new File(['px'], 'mapa.png', { type: 'image/png' });
    const input = wrapper.get('.create-scene-form input[type="file"]');
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
    await openCreateDialog(wrapper);
    await wrapper.get('#scene-name').setValue('Cripta');

    await wrapper.get('form.create-scene-form').trigger('submit');
    await flushPromises();

    const error = wrapper.get('.upload-error');
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toContain('Servidor indisponível.');
    expect(dialogByTitle(wrapper, 'Nova cena')?.props('open')).toBe(true);

    const retry = wrapper.findAll('button').find((button) => button.text() === 'Tentar de novo');
    expect(retry).toBeTruthy();
    await retry!.trigger('click');
    await flushPromises();

    expect(createScene).toHaveBeenCalledTimes(2);
    expect(createScene.mock.calls[1]?.[0]).toEqual(createScene.mock.calls[0]?.[0]);
    wrapper.unmount();
  });

  it('recusa grade inválida na criação sem clampar e mantém o valor digitado', async () => {
    const { wrapper, createScene } = mountManager();
    await openCreateDialog(wrapper);
    await wrapper.get('#scene-name').setValue('Limites');
    await wrapper.get('#scene-columns').setValue(0);

    await wrapper.get('form.create-scene-form').trigger('submit');
    await flushPromises();

    expect(createScene).not.toHaveBeenCalled();
    const columns = wrapper.get('#scene-columns');
    expect(columns.attributes('aria-invalid')).toBe('true');
    expect(columns.attributes('aria-describedby')).toBe('scene-create-error');
    expect((columns.element as HTMLInputElement).value).toBe('0');
    expect(wrapper.get('#scene-create-error').text()).toBe('As colunas precisam estar entre 1 e 200.');
    expect(dialogByTitle(wrapper, 'Nova cena')?.props('open')).toBe(true);

    await wrapper.get('#scene-columns').setValue(200);
    await wrapper.get('#scene-rows').setValue(999);
    await wrapper.get('form.create-scene-form').trigger('submit');
    await flushPromises();

    expect(createScene).not.toHaveBeenCalled();
    expect(wrapper.get('#scene-create-error').text()).toBe('As linhas precisam estar entre 1 e 200.');
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

  it('troca a imagem da cena ativa por URL sem tocar na grade', async () => {
    const replaceSceneImage = vi.fn(async () => undefined);
    const { wrapper } = mountManager({ replaceSceneImage });

    const open = wrapper.findAll('button').find((button) => button.text().includes('Trocar imagem'));
    expect(open).toBeTruthy();
    await open!.trigger('click');
    await nextTick();

    const dialog = dialogByTitle(wrapper, 'Trocar imagem da cena');
    expect(dialog?.props('open')).toBe(true);
    expect(dialog?.text()).toContain('24×18');
    expect(dialog?.text()).toContain('preservados');

    await wrapper.get('#scene-replace-url').setValue('https://example.com/cripta-nova.webp');
    const apply = wrapper.findAll('button').find((button) => button.text() === 'Aplicar imagem');
    expect(apply).toBeTruthy();
    await apply!.trigger('click');
    await flushPromises();

    expect(replaceSceneImage).toHaveBeenCalledWith('scene-1', 'https://example.com/cripta-nova.webp');
    wrapper.unmount();
  });

  it('envia arquivo novo pela troca de imagem e mostra erro com retry', async () => {
    const replaceSceneImage = vi.fn(async () => { throw new Error('Falha ao aplicar.'); });
    const { wrapper } = mountManager({ replaceSceneImage });

    await wrapper.findAll('button').find((button) => button.text().includes('Trocar imagem'))!.trigger('click');
    await nextTick();

    const file = new File(['img'], 'nova.png', { type: 'image/png' });
    const dialog = dialogByTitle(wrapper, 'Trocar imagem da cena');
    const input = dialog!.find('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [file] });
    await input.trigger('change');
    await nextTick();

    await wrapper.findAll('button').find((button) => button.text() === 'Aplicar imagem')!.trigger('click');
    await flushPromises();

    expect(storageMock.uploadMap).toHaveBeenCalledWith(file, 'table-1', expect.any(Function));
    expect(replaceSceneImage).toHaveBeenCalledWith('scene-1', '/uploads/maps/enviado.webp');
    const error = wrapper.get('.upload-error');
    expect(error.attributes('role')).toBe('alert');
    expect(error.text()).toContain('Falha ao aplicar.');

    const retry = wrapper.findAll('button').find((button) => button.text() === 'Tentar de novo');
    expect(retry).toBeTruthy();
    await retry!.trigger('click');
    await flushPromises();

    // O retry reaplica a URL já enviada, sem um segundo upload do arquivo.
    expect(storageMock.uploadMap).toHaveBeenCalledTimes(1);
    expect(replaceSceneImage).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
