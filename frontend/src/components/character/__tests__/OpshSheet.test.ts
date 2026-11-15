import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const rollDiceMock = vi.hoisted(() => vi.fn());
vi.mock('../../../services/socketService', () => ({
  socketService: { rollDice: rollDiceMock },
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../../services/toast', () => ({ toast: toastMock }));

import OpshSheet from '../OpshSheet.vue';
import { useTableStore } from '../../../stores/tableStore';
import type { CharacterDTO, DiceRolledPayload } from '../../../types';

const character: CharacterDTO = {
  _id: 'char-opsh',
  ownerId: 'user-1',
  tableId: 'table-1',
  name: 'Helena',
  systemKey: 'ordem-paranormal-sobrevivendo-ao-horror',
  profile: {
    classe: 'combatente',
    origem: 'Jornalista',
    nex: '45%',
    level: 3,
    profissao: 'Jornalista',
  },
  attributes: { agilidade: 0, forca: 2, intelecto: 4, presenca: 3, vigor: 1 },
  skills: { acrobacia: 5, profissao: 10 },
  stats: { currentHP: 18, maxHP: 24, defense: 10, currentPE: 8, maxPE: 12 },
  sanityMode: 'san',
  progressionMode: 'nex',
};

function expressionPayload(): DiceRolledPayload {
  return {
    tableId: 'table-1',
    expression: '2d20kl1+5',
    rolls: [
      { die: 20, value: 20, kept: 'kept' },
      { die: 20, value: 4, kept: 'dropped' },
    ],
    modifier: 5,
    total: 25,
    userId: 'user-1',
    username: 'Tester',
    characterId: 'char-opsh',
    metadata: 'Acrobacia (Agilidade)',
    createdAt: '2026-11-15T12:00:00.000Z',
    kind: 'expression',
  };
}

function openTab(wrapper: ReturnType<typeof mount>, label: string) {
  const tab = wrapper.findAll('.sheet-tabs__tab').find((item) => item.text().includes(label));
  expect(tab, `Aba ${label} deve existir`).toBeTruthy();
  return tab!.trigger('click');
}

describe('OpshSheet — Sobrevivendo ao Horror', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    rollDiceMock.mockReset();
    rollDiceMock.mockResolvedValue({ ok: true, revision: 1, serverNowMs: Date.now() });
    Object.values(toastMock).forEach((fn) => fn.mockReset());
  });

  it('renderiza as 28 perícias com os atributos-base corrigidos', async () => {
    const wrapper = mount(OpshSheet, { props: { character, canEdit: true } });
    expect(wrapper.find('.opsh-sheet').exists()).toBe(true);
    await openTab(wrapper, 'Atributos');

    expect(wrapper.text()).toContain('Atualidades');
    expect(wrapper.text()).toContain('Profissão');
    const skillRows = wrapper.findAll('.opsh-skill:not(.is-legacy)');
    expect(skillRows.length).toBeGreaterThanOrEqual(28);

    // Intuição (Intelecto), Percepção (Presença) e Pontaria (Agilidade).
    const intellectHeader = wrapper
      .findAll('.opsh-block')
      .find((block) => block.text().includes('Intelecto') && block.text().includes('Intuição'));
    expect(intellectHeader).toBeTruthy();
    const presenceHeader = wrapper
      .findAll('.opsh-block')
      .find((block) => block.text().includes('Presença') && block.text().includes('Percepção'));
    expect(presenceHeader).toBeTruthy();
    const agilityHeader = wrapper
      .findAll('.opsh-block')
      .find((block) => block.text().includes('Agilidade') && block.text().includes('Pontaria'));
    expect(agilityHeader).toBeTruthy();
    wrapper.unmount();
  });

  it('gera 2d20kl1 para atributo 0 e envia a expressão do servidor', async () => {
    const wrapper = mount(OpshSheet, { props: { character, canEdit: true } });
    await openTab(wrapper, 'Atributos');

    await wrapper.get('[aria-label="Rolar Acrobacia"]').trigger('click');
    await flushPromises();
    expect(rollDiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'table-1',
        characterId: 'char-opsh',
        metadata: 'Acrobacia (Agilidade)',
        expression: '2d20kl1+5',
      }),
    );

    rollDiceMock.mockClear();
    await wrapper.get('[aria-label="Rolar teste de Agilidade"]').trigger('click');
    await flushPromises();
    expect(rollDiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ expression: '2d20kl1+0' }),
    );
    wrapper.unmount();
  });

  it('altera o bônus de treino e reflete na expressão', async () => {
    const wrapper = mount(OpshSheet, { props: { character, canEdit: true } });
    await openTab(wrapper, 'Atributos');

    const professionRow = wrapper
      .findAll('.opsh-skill')
      .find((row) => row.text().includes('Profissão'));
    expect(professionRow).toBeTruthy();
    const select = professionRow!.get('select');
    await select.setValue('15');
    expect(professionRow!.text()).toContain('4d20kh1+15');

    await professionRow!.get('button[aria-label="Rolar Profissão"]').trigger('click');
    await flushPromises();
    expect(rollDiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ expression: '4d20kh1+15' }),
    );
    wrapper.unmount();
  });

  it('alterna SAN/PD, mostra a fórmula e aplica a Defesa derivada', async () => {
    const wrapper = mount(OpshSheet, { props: { character, canEdit: true } });
    await openTab(wrapper, 'Recursos');
    expect(wrapper.text()).toContain('PV 20+VIG');
    expect(wrapper.text()).toContain('SAN 12');

    const pdButton = wrapper.findAll('button').find((button) => button.text().includes('PD (sem Sanidade)'));
    expect(pdButton).toBeTruthy();
    await pdButton!.trigger('click');
    expect(wrapper.text()).toContain('PD 6+PRE');

    const defenseButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Usar Defesa calculada'));
    expect(defenseButton).toBeTruthy();
    await defenseButton!.trigger('click');
    const patch = (wrapper.vm as unknown as { buildPatch: () => Partial<CharacterDTO> }).buildPatch();
    expect(patch.stats?.defense).toBe(10);
    expect(patch.sanityMode).toBe('pd');
    wrapper.unmount();
  });

  it('destaca 20 natural como sucesso automático, sem falha crítica', async () => {
    const store = useTableStore();
    store.recentRolls = [expressionPayload()];

    const wrapper = mount(OpshSheet, { props: { character, canEdit: true } });
    const last = wrapper.get('.opsh-last-result');
    expect(last.text()).toContain('20 natural — sucesso automático');
    expect(last.text()).toContain('não tem falha crítica');
    wrapper.unmount();
  });

  it('envia as rolagens de medo (2d10) e ferimento (1d6)', async () => {
    const wrapper = mount(OpshSheet, { props: { character, canEdit: true } });
    await openTab(wrapper, 'Condições');

    const fearButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Rolar efeito de medo'));
    expect(fearButton).toBeTruthy();
    await fearButton!.trigger('click');
    await flushPromises();
    expect(rollDiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ expression: '2d10' }),
    );

    rollDiceMock.mockClear();
    const injuryButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Rolar 1d6'));
    expect(injuryButton).toBeTruthy();
    await injuryButton!.trigger('click');
    await flushPromises();
    expect(rollDiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ expression: '1d6' }),
    );
    wrapper.unmount();
  });

  it('expõe profissão, ferimentos e progressão no patch', async () => {
    const withInjury = {
      ...character,
      injuries: [{ attribute: 'vigor', penalty: 1 }],
      progressionMode: 'patente' as const,
    };
    const wrapper = mount(OpshSheet, { props: { character: withInjury, canEdit: true } });
    const patch = (wrapper.vm as unknown as { buildPatch: () => Partial<CharacterDTO> }).buildPatch();
    expect(patch.profile?.profissao).toBe('Jornalista');
    expect(patch.progressionMode).toBe('patente');
    expect(patch.injuries).toEqual([{ attribute: 'vigor', penalty: 1, notes: undefined }]);
    wrapper.unmount();
  });

  it('fica somente leitura sem permissão', () => {
    const wrapper = mount(OpshSheet, { props: { character, canEdit: false } });
    expect(wrapper.get('[aria-label="Rolar Acrobacia"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
