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
    expect(labels).toEqual(['Identidade', 'Atributos', 'Combate', 'Inventário & Notas']);

    // D&D 5e: atributos e perícias calculados aparecem na aba correspondente.
    const atributosTab = wrapper.findAll('.sheet-tabs__tab')[1];
    await atributosTab.trigger('click');
    expect(wrapper.find('.ability-grid').exists()).toBe(true);
    expect(wrapper.find('.skill-list').exists()).toBe(true);
  });

  it('keeps vitals and the tab strip fixed above the scrolling panel', () => {
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

    const pinned = wrapper.get('.sheet-pinned');
    expect(pinned.find('.vitals').exists()).toBe(true);
    expect(pinned.find('.sheet-tabs').exists()).toBe(true);

    // O trilho não pode viver dentro da área que rola: era isso que colapsava.
    const scrollArea = wrapper.get('.sheet-panel-scroll');
    expect(scrollArea.find('.sheet-tabs').exists()).toBe(false);
    expect(scrollArea.findAll('.sheet-tab-panel').length).toBe(4);
  });

  it('groups every section without losing content', async () => {
    const wrapper = mount(CharacterSheet, {
      props: {
        open: true,
        character: {
          ...baseCharacter,
          systemKey: 'dnd5e',
          attacks: [{ name: 'Espada longa', bonus: 5, damage: '1d8+3' }],
          features: [{ name: 'Ataque furtivo', description: '1d6' }],
          inventory: [{ name: 'Corda', quantity: 1 }],
        },
        isDM: true,
        isOwner: true,
        system: null,
      },
      global: {
        stubs: { teleport: true },
      },
    });

    async function openTab(index: number) {
      await wrapper.findAll('.sheet-tabs__tab')[index].trigger('click');
      return wrapper
        .findAll('.sheet-tab-panel')
        .find((panel) => (panel.element as HTMLElement).style.display !== 'none');
    }

    const combate = await openTab(2);
    expect(combate, 'Combate precisa estar visível.').toBeTruthy();
    expect(combate!.find('.combat').exists()).toBe(true);
    expect(combate!.text()).toContain('Ataques');
    expect(combate!.text()).toContain('Espaços de magia');

    const inventario = await openTab(3);
    expect(inventario, 'Inventário & Notas precisa estar visível.').toBeTruthy();
    expect(inventario!.text()).toContain('Inventário');
    expect(inventario!.text()).toContain('Características');
    expect(inventario!.text()).toContain('Notas livres');
  });

  it('navigates the tab strip with arrow keys, Home and End', async () => {
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

    // O stub de teleport recria o DOM a cada update; reconsultamos o trilho.
    const tablist = () => wrapper.get('.sheet-tabs');
    const selected = () =>
      wrapper.findAll('.sheet-tabs__tab').findIndex((tab) => tab.attributes('aria-selected') === 'true');

    expect(selected()).toBe(0);
    await tablist().trigger('keydown', { key: 'ArrowRight' });
    expect(selected()).toBe(1);
    await tablist().trigger('keydown', { key: 'End' });
    expect(selected()).toBe(3);
    await tablist().trigger('keydown', { key: 'Home' });
    expect(selected()).toBe(0);
    await tablist().trigger('keydown', { key: 'ArrowLeft' });
    expect(selected()).toBe(3);
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
