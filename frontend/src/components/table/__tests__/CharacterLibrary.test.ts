import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import CharacterLibrary from '../CharacterLibrary.vue';
import type { CharacterDTO, TokenInfo } from '../../../types';

const ana: CharacterDTO = {
  _id: 'char-1',
  ownerId: 'dm-1',
  tableId: 'table-1',
  name: 'Ana',
  systemKey: 'dnd5e',
  stats: { currentHP: 18, maxHP: 24, defense: 15 },
};

const bruxo: CharacterDTO = {
  _id: 'char-2',
  ownerId: 'u-2',
  tableId: 'table-1',
  name: 'Bruxo',
  systemKey: 'dnd5e',
  stats: { currentHP: 5, maxHP: 9, defense: 12 },
};

function token(overrides: Partial<TokenInfo>): TokenInfo {
  return {
    _id: 'token-1',
    squareId: 'sq-0',
    color: '#ffffff',
    ownerId: null,
    name: 'Token',
    sceneId: 'scene-1',
    movement: 9,
    remainingMovement: 9,
    size: 'Pequeno/Médio',
    characterId: null,
    ...overrides,
  };
}

const linkedToken = token({
  _id: 'token-1',
  name: 'Goblin',
  characterId: 'char-1',
  ownerId: { _id: 'u-2', username: 'Ana' },
});
const freeToken = token({
  _id: 'token-2',
  name: 'Lobo',
  ownerId: { _id: 'dm-1', username: 'Mestre' },
});

const ownerNames = { 'dm-1': 'Mestre (Mestre)', 'u-2': 'Ana' };

function mountLibrary(overrides: Record<string, unknown> = {}) {
  return mount(CharacterLibrary, {
    props: {
      open: true,
      characters: [ana, bruxo],
      ownerNames,
      tokensOnMap: [linkedToken, freeToken],
      tableSystemName: 'D&D 5e',
      canManageTokens: true,
      activeSceneName: 'Cripta',
      ...overrides,
    },
    global: { stubs: { teleport: true } },
  });
}

function itemFor(wrapper: ReturnType<typeof mountLibrary>, name: string) {
  const item = wrapper
    .findAll('.character-list__item')
    .find((entry) => entry.text().includes(name));
  if (!item) throw new Error(`Ficha ${name} não encontrada`);
  return item;
}

describe('CharacterLibrary', () => {
  it('lista todas as fichas da mesa com dono, sistema, PV/CA e token', () => {
    const wrapper = mountLibrary();
    const text = wrapper.text();

    expect(text).toContain('Ana');
    expect(text).toContain('Bruxo');
    expect(text).toContain('Dono: Mestre (Mestre)');
    expect(text).toContain('Dono: Ana');
    expect(text).toContain('PV 18 / 24');
    expect(text).toContain('CA 15');
    expect(text).toContain('Token: “Goblin”');
    expect(text).toContain('Sem token nesta cena');
    expect(text).toContain('2 fichas');
    expect(text).toContain('1 sem token nesta cena');
    expect(wrapper.findAll('.character-list__open')).toHaveLength(2);

    wrapper.unmount();
  });

  it('vincula um token livre da cena ativa à ficha escolhida', async () => {
    const wrapper = mountLibrary();
    const item = itemFor(wrapper, 'Bruxo');

    await item.get('.character-library__link').trigger('click');
    expect(item.text()).toContain('Vincular token a “Bruxo”');
    expect(item.text()).toContain('Lobo');

    await item.get('.character-library__token-option').trigger('click');
    expect(wrapper.emitted('link')?.[0]).toEqual([
      { characterId: 'char-2', tokenId: 'token-2' },
    ]);
    wrapper.unmount();
  });

  it('desvincula o token atual da ficha', async () => {
    const wrapper = mountLibrary();
    const item = itemFor(wrapper, 'Ana');

    expect(item.get('.character-library__link').text()).toBe('Trocar token');
    await item.get('.character-library__link').trigger('click');
    expect(item.text()).toContain('Token atual: “Goblin”');

    const unlink = item
      .findAll('button')
      .find((button) => button.text().includes('Desvincular'));
    expect(unlink).toBeTruthy();
    await unlink!.trigger('click');

    expect(wrapper.emitted('link')?.[0]).toEqual([
      { characterId: 'char-1', tokenId: null },
    ]);
    wrapper.unmount();
  });

  it('exclui só depois de confirmar nomeando a ficha e a consequência', async () => {
    const wrapper = mountLibrary();
    const item = itemFor(wrapper, 'Ana');

    await item.get('.character-library__delete').trigger('click');
    expect(wrapper.emitted('delete')).toBeUndefined();
    expect(item.text()).toContain('Excluir a ficha “Ana”?');
    expect(item.text()).toContain('token vinculado é desvinculado');

    await item.get('.character-library__confirm-delete').trigger('click');
    expect(wrapper.emitted('delete')?.[0]).toEqual(['char-1']);
    wrapper.unmount();
  });

  it('oferece criar token quando não há token livre e a ficha não tem token', async () => {
    const wrapper = mountLibrary({ tokensOnMap: [linkedToken] });
    const item = itemFor(wrapper, 'Bruxo');

    await item.get('.character-library__link').trigger('click');
    expect(item.text()).toContain('Nenhum token livre');
    expect(item.find('.character-library__token-option').exists()).toBe(false);

    const create = item
      .findAll('button')
      .find((button) => button.text() === 'Criar token para esta ficha');
    expect(create).toBeTruthy();
    await create!.trigger('click');

    expect(wrapper.emitted('create-token')?.[0]).toEqual(['char-2']);
    wrapper.unmount();
  });

  it('explica o vazio e oferece Nova ficha sem “Pedir ao Mestre”', async () => {
    const wrapper = mountLibrary({ characters: [], tokensOnMap: [] });
    const text = wrapper.text();

    expect(text).toContain('Nenhuma ficha nesta mesa');
    expect(text).toContain('pode existir sem token');
    expect(text).not.toContain('Pedir ao Mestre');

    await wrapper.get('.character-list__create').trigger('click');
    expect(wrapper.emitted('create-request')).toHaveLength(1);
    wrapper.unmount();
  });
});
