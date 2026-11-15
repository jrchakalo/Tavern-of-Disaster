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
  it('renders system default attributes when provided', async () => {
    const system: SystemDTO = {
      _id: 'sys-1',
      key: 'generic-rules',
      name: 'Sistema Genérico',
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

    // Atributos do sistema vivem na aba "Atributos & Perícias".
    const atributosTab = wrapper
      .findAll('.sheet-tabs__tab')
      .find((tab) => tab.text().includes('Atributos'));
    expect(atributosTab, 'A ficha precisa expor a aba de atributos.').toBeTruthy();
    await atributosTab!.trigger('click');

    const systemSection = wrapper.find('.system-attributes');
    expect(systemSection.exists()).toBe(true);
    const attrInput = systemSection.get('input');
    expect((attrInput.element as HTMLInputElement).value).toBe('3');
  });

  it('shows the D&D 5e tab structure with vitals and dialog hooks', async () => {
    const wrapper = mount(CharacterSheet, {
      props: {
        open: true,
        character: { ...baseCharacter, systemKey: 'dnd5e' },
        isDM: true,
        isOwner: true,
        system: null,
      },
      global: {
        stubs: { teleport: true },
      },
    });

    expect(wrapper.find('.character-sheet').exists()).toBe(true);
    expect(wrapper.get('.character-sheet h2').text()).toBe('Aerin');
    expect(wrapper.find('button[aria-label="Fechar"]').exists()).toBe(true);
    expect(wrapper.find('.vitals').exists()).toBe(true);

    const labels = wrapper.findAll('.sheet-tabs__tab').map((tab) => tab.text());
    expect(labels).toEqual([
      'Identidade',
      'Atributos & Perícias',
      'Combate',
      'Ataques',
      'Características',
      'Inventário',
      'Magias',
      'Notas',
    ]);

    // D&D 5e: atributos e perícias calculados aparecem na aba correspondente.
    const atributosTab = wrapper.findAll('.sheet-tabs__tab')[1];
    await atributosTab.trigger('click');
    expect(wrapper.find('.ability-grid').exists()).toBe(true);
    expect(wrapper.find('.skill-list').exists()).toBe(true);
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
