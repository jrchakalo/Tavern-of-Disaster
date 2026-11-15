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

import Op2Sheet from '../Op2Sheet.vue';
import { useTableStore } from '../../../stores/tableStore';
import type { CharacterDTO, DiceRolledPayload } from '../../../types';

const character: CharacterDTO = {
  _id: 'char-op2',
  ownerId: 'user-1',
  tableId: 'table-1',
  name: 'Victoria',
  systemKey: 'ordem-paranormal-2',
  profile: { perfil: 'analista', vocacao: 'Policial', level: 3, idade: 29 },
  attributes: { fisico: 8, mente: 10, emocao: 6 },
  skills: { luta: 8, ocultismo: 6 },
  stats: {
    currentHP: 12,
    maxHP: 16,
    currentPD: 5,
    maxPD: 7,
    armorPoints: 2,
    armorPointsMax: 3,
  },
  fear: { active: true, dreadDie: 6 },
  relations: [{ name: 'Mãe', grade: 2, note: 'Apoio' }],
  conditions: ['Abalado'],
};

function stepPayload(): DiceRolledPayload {
  return {
    tableId: 'table-1',
    expression: 'd8 + d8',
    rolls: [
      { die: 8, value: 8, kept: 'kept', role: 'attribute' },
      { die: 8, value: 5, kept: 'kept', role: 'skill' },
    ],
    modifier: 0,
    total: 13,
    userId: 'user-1',
    username: 'Tester',
    characterId: 'char-op2',
    metadata: 'Luta (Físico)',
    createdAt: '2026-11-15T12:00:00.000Z',
    kind: 'step',
    step: {
      attribute: { key: 'fisico', die: 8, value: 8 },
      skill: { key: 'luta', die: 8, value: 5 },
      bonusDice: [],
      canceledValues: [],
      high: 8,
      low: 5,
      difficulty: 7,
      success: true,
      critical: false,
      fumble: false,
      dreadEnds: false,
      summedDice: [8, 5],
      damageBase: 8,
      label: 'Luta (Físico)',
    },
  };
}

function openTab(wrapper: ReturnType<typeof mount>, label: string) {
  const tab = wrapper.findAll('.sheet-tabs__tab').find((item) => item.text().includes(label));
  expect(tab, `Aba ${label} deve existir`).toBeTruthy();
  return tab!.trigger('click');
}

describe('Op2Sheet — ficha de Ordem Paranormal 2', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    rollDiceMock.mockReset();
    rollDiceMock.mockResolvedValue({ ok: true, revision: 1, serverNowMs: Date.now() });
    Object.values(toastMock).forEach((fn) => fn.mockReset());
  });

  it('renderiza identidade, atributos e as perícias agrupadas', async () => {
    const wrapper = mount(Op2Sheet, { props: { character, canEdit: true } });
    expect(wrapper.find('.op2-sheet').exists()).toBe(true);
    expect((wrapper.get('input[placeholder="Nome do personagem"]').element as HTMLInputElement).value).toBe(
      'Victoria',
    );

    await openTab(wrapper, 'Atributos');
    expect(wrapper.findAll('.op2-attribute')).toHaveLength(3);
    expect(wrapper.text()).toContain('Físico');
    expect(wrapper.text()).toContain('Luta');
    expect(wrapper.text()).toContain('Bruxaria');
    expect(wrapper.findAll('.op2-skill__roll').length).toBeGreaterThanOrEqual(20);
    wrapper.unmount();
  });

  it('rola atributo + perícia com step e dado de pavor', async () => {
    const wrapper = mount(Op2Sheet, { props: { character, canEdit: true } });
    await openTab(wrapper, 'Atributos');
    await wrapper.get('[aria-label="Rolar Luta"]').trigger('click');
    await flushPromises();

    expect(rollDiceMock).toHaveBeenCalledTimes(1);
    expect(rollDiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'table-1',
        characterId: 'char-op2',
        metadata: 'Luta (Físico)',
        step: expect.objectContaining({
          attribute: 'fisico',
          attributeDie: 8,
          skillKey: 'luta',
          skillDie: 8,
          difficulty: 7,
          dreadDie: 6,
          label: 'Luta (Físico)',
        }),
      }),
    );
    wrapper.unmount();
  });

  it('respeita a DT personalizada e envia ataques com damageMode', async () => {
    const withAttack = {
      ...character,
      attacks: [{ name: 'Revólver', damage: 'RA+3', range: 'longo', notes: '' }],
    };
    const wrapper = mount(Op2Sheet, { props: { character: withAttack, canEdit: true } });
    await openTab(wrapper, 'Atributos');
    await wrapper.get('.op2-dt__input').setValue('10');
    await flushPromises();

    await openTab(wrapper, 'Combate');
    const attackButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Rolar ataque'));
    expect(attackButton).toBeTruthy();
    await attackButton!.trigger('click');
    await flushPromises();

    expect(rollDiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({
          skillKey: 'pontaria',
          difficulty: 10,
          damageMode: true,
          damageModifier: 3,
        }),
      }),
    );
    wrapper.unmount();
  });

  it('gasta ponto de armadura e expõe o patch para o shell salvar', async () => {
    const wrapper = mount(Op2Sheet, { props: { character, canEdit: true } });
    await openTab(wrapper, 'Recursos');
    await wrapper.get('.op2-armor-spend').trigger('click');

    expect(toastMock.success).toHaveBeenCalledWith(
      expect.stringContaining('Ponto de armadura gasto'),
    );
    const patch = (wrapper.vm as unknown as { buildPatch: () => Partial<CharacterDTO> }).buildPatch();
    expect(patch.stats?.armorPoints).toBe(1);
    expect(patch.stats?.currentPD).toBe(5);
    wrapper.unmount();
  });

  it('invoça relação como dado extra do próximo teste', async () => {
    const wrapper = mount(Op2Sheet, { props: { character, canEdit: true } });
    await openTab(wrapper, 'Relações');
    const invoke = wrapper.findAll('button').find((button) => button.text().includes('Invocar'));
    expect(invoke).toBeTruthy();
    await invoke!.trigger('click');

    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining('+1d8'));
    expect(wrapper.text()).toContain('Bônus no próximo teste');

    await openTab(wrapper, 'Atributos');
    await wrapper.get('[aria-label="Rolar Luta"]').trigger('click');
    await flushPromises();
    expect(rollDiceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({ bonusDice: [8] }),
      }),
    );
    wrapper.unmount();
  });

  it('mostra o último teste de passo do characterId', async () => {
    const store = useTableStore();
    store.recentRolls = [
      // Rolagem de outra ficha não aparece.
      { ...stepPayload(), characterId: 'outra', metadata: 'Outra ficha' },
      stepPayload(),
    ];

    const wrapper = mount(Op2Sheet, { props: { character, canEdit: true } });
    const result = wrapper.get('.op2-last-result');
    expect(result.text()).toContain('Sucesso');
    expect(result.text()).toContain('RA 8');
    expect(result.text()).toContain('RB 5');
    expect(result.text()).toContain('DT 7');
    expect(result.text()).toContain('Dano base: 8');
    wrapper.unmount();
  });

  it('fica somente leitura sem permissão', () => {
    const wrapper = mount(Op2Sheet, { props: { character, canEdit: false } });
    expect(wrapper.get('[aria-label="Dado de Físico"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
