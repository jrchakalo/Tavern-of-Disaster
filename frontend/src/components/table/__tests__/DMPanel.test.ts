import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
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
    scenes: [{ _id: 'scene-1', tableId: 'table-1', name: 'Cripta', type: 'battlemap' }],
    activeSceneId: 'scene-1',
    mapUrlInput: '',
    newSceneName: '',
    newSceneImageUrl: '',
    newSceneType: 'battlemap',
    isUploadingMap: false,
    mapUploadProgress: 0,
    mapUploadError: '',
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
    ...overrides,
  };
}

describe('DMPanel', () => {
  it('troca de aba ao clicar e ao navegar pelo teclado', async () => {
    const wrapper = shallowMount(DMPanel, { props: props() });
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.length).toBe(4);

    await tabs[1]!.trigger('click');
    expect(wrapper.emitted('update:activeTab')?.[0]).toEqual(['initiative']);

    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:activeTab')?.[1]).toEqual(['initiative']);
    wrapper.unmount();
  });

  it('lista tokens da cena e abre o inspetor pelo teclado', async () => {
    const wrapper = shallowMount(DMPanel, {
      props: props({
        tokensOnMap: ref([
          { _id: 'token-1', name: 'Ghoul', ownerId: { _id: 'dm-1', username: 'DM' }, color: '#3c096c' },
        ]).value,
      }),
    });
    const tokenButton = wrapper.find('.token-list__main');
    expect(tokenButton.exists()).toBe(true);
    expect(tokenButton.attributes('aria-label')).toContain('Ghoul');
    await tokenButton.trigger('click');
    expect(wrapper.emitted('select-token')?.[0]).toEqual(['token-1']);
    wrapper.unmount();
  });

  it('emite apply-grid com os valores validados', async () => {
    const wrapper = shallowMount(DMPanel, { props: props() });
    const apply = wrapper.findAll('button').find((button) => button.text() === 'Aplicar grade');
    expect(apply).toBeTruthy();
    await apply!.trigger('click');
    expect(wrapper.emitted('apply-grid')?.[0]).toEqual([
      { width: 30, height: 30, metersPerSquare: 1.5 },
    ]);
    wrapper.unmount();
  });
});
