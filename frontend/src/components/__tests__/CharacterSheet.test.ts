import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import CharacterSheet from '../CharacterSheet.vue';
import type { Character, SystemDTO } from '../../types';

const baseCharacter: Character = {
  _id: 'char-1',
  ownerId: 'user-1',
  tableId: 'table-1',
  name: 'Aerin',
  attributes: { str: 3 },
  stats: { currentHP: 10, maxHP: 12 },
  skills: { stealth: '+5' },
  notes: 'Rogue',
};

describe('CharacterSheet', () => {
  it('renders system default attributes when provided', () => {
    const system: SystemDTO = {
      _id: 'sys-1',
      key: 'dnd5e',
      name: 'D&D',
      defaultAttributes: [{ key: 'str', label: 'Força', type: 'number' }],
    } as SystemDTO;

    const wrapper = mount(CharacterSheet, {
      props: {
        open: true,
        character: baseCharacter,
        isDM: true,
        isOwner: false,
        system,
      },
      global: {
        stubs: { teleport: true },
      },
    });

    const systemSection = wrapper.find('.system-attributes');
    expect(systemSection.exists()).toBe(true);
    const attrInput = systemSection.get('input');
    expect((attrInput.element as HTMLInputElement).value).toBe('3');
  });

  it('prevents editing when user is neither DM nor owner', () => {
    const wrapper = mount(CharacterSheet, {
      props: {
        open: true,
        character: baseCharacter,
        isDM: false,
        isOwner: false,
        system: null,
      },
      global: {
        stubs: { teleport: true },
      },
    });

    const nameInput = wrapper.get('input[placeholder="Nome do personagem"]');
    expect(nameInput.attributes('readonly')).toBeDefined();
    const hasSaveButton = wrapper.findAll('button').some((btn) => btn.text() === 'Salvar alterações');
    expect(hasSaveButton).toBe(false);
  });
});
