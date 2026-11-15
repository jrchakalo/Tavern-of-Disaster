import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const rollDiceMock = vi.hoisted(() => vi.fn());
vi.mock('../../services/socketService', () => ({
  socketService: { rollDice: rollDiceMock },
}));

vi.mock('../../services/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import CharacterSheet from '../CharacterSheet.vue';
import type { Character } from '../../types';

const op2Character: Character = {
  _id: 'char-op2',
  ownerId: 'user-1',
  tableId: 'table-1',
  name: 'Victoria',
  systemKey: 'ordem-paranormal-2',
  attributes: { fisico: 8, mente: 10, emocao: 6 },
  skills: { luta: 8 },
  stats: { currentHP: 12, maxHP: 16, currentPD: 5, maxPD: 7, armorPoints: 2, armorPointsMax: 3 },
  conditions: ['Abalado'],
};

const opshCharacter: Character = {
  _id: 'char-opsh',
  ownerId: 'user-1',
  tableId: 'table-1',
  name: 'Helena',
  systemKey: 'ordem-paranormal-sobrevivendo-ao-horror',
  profile: { classe: 'combatente', profissao: 'Jornalista' },
  attributes: { agilidade: 2, forca: 2, intelecto: 2, presenca: 2, vigor: 2 },
  stats: { currentHP: 18, maxHP: 24, defense: 12, currentPE: 8, maxPE: 12 },
  sanityMode: 'san',
};

describe('CharacterSheet — roteamento por sistema', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    rollDiceMock.mockReset();
    rollDiceMock.mockResolvedValue({ ok: true, revision: 1, serverNowMs: Date.now() });
  });

  it('renderiza Op2Sheet para ordem-paranormal-2 e mantém o shell de diálogo', () => {
    const wrapper = mount(CharacterSheet, {
      props: { open: true, character: op2Character, isDM: false, isOwner: false, system: null },
      global: { stubs: { teleport: true } },
    });

    expect(wrapper.find('.character-sheet').exists()).toBe(true);
    expect(wrapper.get('.character-sheet h2').text()).toBe('Victoria');
    expect(wrapper.find('.op2-sheet').exists()).toBe(true);
    expect(wrapper.find('.vitals').exists()).toBe(false);
    const tabs = wrapper.findAll('.sheet-tabs__tab').map((tab) => tab.text());
    expect(tabs).toContain('Rituais');
    expect(tabs).toContain('Relações');
    expect(tabs).not.toContain('Magias');
    expect(wrapper.text()).toContain('Visualização somente leitura');
    wrapper.unmount();
  });

  it('renderiza OpshSheet para sobrevivendo-ao-horror', () => {
    const wrapper = mount(CharacterSheet, {
      props: { open: true, character: opshCharacter, isDM: false, isOwner: true, system: null },
      global: { stubs: { teleport: true } },
    });

    expect(wrapper.find('.opsh-sheet').exists()).toBe(true);
    expect(wrapper.find('.op2-sheet').exists()).toBe(false);
    const tabs = wrapper.findAll('.sheet-tabs__tab').map((tab) => tab.text());
    expect(tabs).toContain('Condições');
    expect(tabs).toContain('Recursos');
    wrapper.unmount();
  });

  it('salva a ficha OP2 pelo mesmo evento save do shell', async () => {
    const wrapper = mount(CharacterSheet, {
      props: { open: true, character: op2Character, isDM: true, isOwner: true, system: null },
      global: { stubs: { teleport: true } },
    });

    const save = wrapper.findAll('button').find((button) => button.text() === 'Salvar alterações');
    expect(save).toBeTruthy();
    await save!.trigger('click');

    const emitted = wrapper.emitted('save');
    expect(emitted).toHaveLength(1);
    const payload = emitted![0][0] as Partial<Character>;
    expect(payload.name).toBe('Victoria');
    expect(payload.attributes).toMatchObject({ fisico: 8, mente: 10, emocao: 6 });
    expect(payload.stats).toMatchObject({ currentPD: 5, armorPoints: 2 });
    expect(payload.conditions).toEqual(['Abalado']);
    wrapper.unmount();
  });

  it('mantém a ficha D&D no shell genérico (sem componentes OP)', () => {
    const wrapper = mount(CharacterSheet, {
      props: {
        open: true,
        character: { ...op2Character, systemKey: 'dnd5e' },
        isDM: true,
        isOwner: true,
        system: null,
      },
      global: { stubs: { teleport: true } },
    });

    expect(wrapper.find('.vitals').exists()).toBe(true);
    expect(wrapper.find('.op2-sheet').exists()).toBe(false);
    expect(wrapper.find('.opsh-sheet').exists()).toBe(false);
    wrapper.unmount();
  });
});
