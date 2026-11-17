import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import DMPanel from '../DMPanel.vue';
import BaseDialog from '../../ui/BaseDialog.vue';

function props(overrides: Record<string, unknown> = {}) {
  return {
    activeTab: 'scene',
    tableId: 'table-1',
    sessionStatus: 'LIVE',
    pauseInput: 5,
    pauseRemaining: 0,
    inviteCode: 'INV',
    displayConnected: false,
    scenes: [{ _id: 'scene-1', tableId: 'table-1', name: 'Cripta', type: 'battlemap', gridWidth: 30, gridHeight: 30, metersPerSquare: 1.5 }],
    activeSceneId: 'scene-1',
    assetUsage: null,
    initiativeList: [],
    tokensOnMap: [],
    metersPerSquare: 1.5,
    currentUser: { _id: 'dm-1', username: 'DM' },
    isDM: true,
    myActiveToken: null,
    currentTurnTokenId: null,
    gridWidth: 30,
    gridHeight: 30,
    systemOptions: [],
    selectedSystemId: '',
    characters: [],
    currentSystem: null,
    round: 1,
    createScene: vi.fn(async () => undefined),
    deleteScene: vi.fn(async () => undefined),
    renameScene: vi.fn(async () => undefined),
    activateScene: vi.fn(async () => undefined),
    ...overrides,
  };
}

function mountPanel(overrides: Record<string, unknown> = {}) {
  return mount(DMPanel, {
    attachTo: document.body,
    props: props(overrides),
    global: { stubs: { teleport: true } },
  });
}

function gridDialog(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper
    .findAllComponents(BaseDialog)
    .find((dialog) => dialog.props('title') === 'Aplicar grade?');
}

describe('DMPanel', () => {
  it('troca de aba ao clicar e ao navegar pelo teclado', async () => {
    const wrapper = mountPanel();
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.length).toBe(4);

    await tabs[1]!.trigger('click');
    expect(wrapper.emitted('update:activeTab')?.[0]).toEqual(['initiative']);

    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:activeTab')?.[1]).toEqual(['initiative']);
    wrapper.unmount();
  });

  it('lista tokens da cena e abre o inspetor pelo teclado', async () => {
    const wrapper = mountPanel({
      tokensOnMap: ref([
        { _id: 'token-1', name: 'Ghoul', ownerId: { _id: 'dm-1', username: 'DM' }, color: '#3c096c' },
      ]).value,
    });
    const tokenButton = wrapper.find('.token-list__main');
    expect(tokenButton.exists()).toBe(true);
    expect(tokenButton.attributes('aria-label')).toContain('Ghoul');
    await tokenButton.trigger('click');
    expect(wrapper.emitted('select-token')?.[0]).toEqual(['token-1']);
    wrapper.unmount();
  });

  it('não aplica grade ao digitar; só emite depois da confirmação', async () => {
    const wrapper = mountPanel();
    await wrapper.get('#grid-columns').setValue(20);
    await nextTick();

    expect(wrapper.emitted('apply-grid')).toBeUndefined();

    const request = wrapper.findAll('button').find((button) => button.text() === 'Aplicar grade');
    expect(request).toBeTruthy();
    await request!.trigger('click');
    await nextTick();

    expect(wrapper.emitted('apply-grid')).toBeUndefined();
    const dialog = gridDialog(wrapper);
    expect(dialog?.props('open')).toBe(true);
    expect(dialog?.text()).toContain('30 × 30');
    expect(dialog?.text()).toContain('20 × 30');

    const confirm = wrapper
      .findAll('button')
      .filter((button) => button.text() === 'Aplicar grade')
      .at(-1);
    await confirm!.trigger('click');
    await nextTick();

    expect(wrapper.emitted('apply-grid')?.[0]).toEqual([
      { width: 20, height: 30, metersPerSquare: 1.5 },
    ]);
    wrapper.unmount();
  });

  it('clampa a grade antes de confirmar e avisa sobre tokens fora dos limites', async () => {
    const wrapper = mountPanel({
      tokensOnMap: [
        { _id: 'token-1', name: 'Ghoul', squareId: 'sq-899', ownerId: null, color: '#fff' },
      ],
    });
    await wrapper.get('#grid-columns').setValue(0);
    await wrapper.get('#grid-rows').setValue(999);
    await wrapper.get('#grid-scale').setValue(999);

    await wrapper.findAll('button').find((button) => button.text() === 'Aplicar grade')!.trigger('click');
    await nextTick();

    const dialog = gridDialog(wrapper);
    expect(dialog?.text()).toContain('1 × 200');
    expect(dialog?.text()).toContain('fora da nova grade');
    wrapper.unmount();
  });

  it('avisa que a grade atual e a escala vêm da cena real', () => {
    const wrapper = mountPanel({
      gridWidth: 24,
      gridHeight: 18,
      metersPerSquare: 1.5,
      scenes: [{ _id: 'scene-1', tableId: 'table-1', name: 'Cripta', type: 'battlemap', gridWidth: 24, gridHeight: 18, metersPerSquare: 1.5 }],
    });
    const text = wrapper.text();
    expect(text).toContain('Grade atual: 24 × 18');
    expect(text).toContain('1.5 m por quadrado');
    wrapper.unmount();
  });

  it('usa D&D 5e como padrão visível quando a mesa não tem sistema', async () => {
    const wrapper = mountPanel({ activeTab: 'session', selectedSystemId: '' });
    await flushPromises();
    expect(wrapper.text()).toContain('Padrão da plataforma (D&D 5e)');
    expect(wrapper.text()).toContain('D&D 5e vale como padrão');
    wrapper.unmount();
  });

  it('abre a biblioteca de fichas pela aba Sessão', async () => {
    const wrapper = mountPanel({
      activeTab: 'session',
      characters: [{ _id: 'char-1', name: 'Lyra', ownerId: 'u-2', tableId: 'table-1' }],
      tokensOnMap: [],
    });

    const open = wrapper.findAll('button').find((button) => button.text() === 'Abrir fichas');
    expect(open).toBeTruthy();
    await open!.trigger('click');

    expect(wrapper.emitted('open-character-library')).toHaveLength(1);
    expect(wrapper.text()).toContain('1 ficha · 1 sem token nesta cena');
    wrapper.unmount();
  });

  it('usa o DiceTray (uma superfície) dentro do hook .dice-roller da aba Iniciativa', async () => {
    const wrapper = mountPanel({
      activeTab: 'initiative',
      currentTurnTokenId: 'token-1',
      tokensOnMap: [
        { _id: 'token-1', name: 'Ghoul', ownerId: null, color: '#fff', characterId: 'char-1' },
      ],
      characters: [{ _id: 'char-1', name: 'Lyra', ownerId: 'u-2', tableId: 'table-1' }],
      recentRolls: [
        {
          userId: 'dm-1',
          username: 'DM',
          expression: '1d20',
          total: 14,
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      ],
    });
    await flushPromises();

    const surface = wrapper.get('.dice-roller');
    expect(wrapper.findComponent({ name: 'DiceRoller' }).exists()).toBe(false);
    const tray = wrapper.findComponent({ name: 'DiceTray' });
    expect(tray.exists()).toBe(true);
    expect(surface.find('#dice-expression').exists()).toBe(true);
    expect(tray.props('currentTokenId')).toBe('token-1');
    expect(tray.props('activeCharacterId')).toBe('char-1');
    expect(tray.props('recentRolls')).toHaveLength(1);
    wrapper.unmount();
  });
});
