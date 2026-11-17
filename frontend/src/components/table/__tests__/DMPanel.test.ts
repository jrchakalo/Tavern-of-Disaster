import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { ref } from 'vue';
import DMPanel from '../DMPanel.vue';

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
    characters: [],
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
    expect(tokenButton.text()).toContain('Ghoul');
    expect(tokenButton.attributes('aria-label')).toBeUndefined();
    await tokenButton.trigger('click');
    expect(wrapper.emitted('select-token')?.[0]).toEqual(['token-1']);
    wrapper.unmount();
  });

  it('não repete sistema nem fichas na aba Sessão', async () => {
    const wrapper = mountPanel({ activeTab: 'session' });
    await flushPromises();
    expect(wrapper.text()).toContain('Resumo');
    expect(wrapper.text()).not.toContain('Sistema da mesa');
    expect(wrapper.text()).not.toContain('Fichas da mesa');
    expect(wrapper.find('#table-system-select').exists()).toBe(false);
    wrapper.unmount();
  });

  it('expõe uma única ação de criar token no painel', async () => {
    const wrapper = mountPanel({ activeTab: 'initiative' });

    const addButtons = wrapper
      .findAll('button')
      .filter((button) => button.text().includes('＋ Token'));
    expect(addButtons).toHaveLength(1);
    expect(addButtons[0]!.classes()).toContain('dm-panel__add');

    await addButtons[0]!.trigger('click');
    expect(wrapper.emitted('add-token')).toHaveLength(1);
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
