import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

import DiceTray from '../DiceTray.vue';

const socketServiceMock = vi.hoisted(() => ({
  isConnected: vi.fn(() => true),
  rollDice: vi.fn(async () => ({ ok: true, revision: 8, serverNowMs: 0 })),
  socket: null as unknown,
}));
vi.mock('../../../services/socketService', () => ({ socketService: socketServiceMock }));

const authMock = vi.hoisted(() => ({
  currentUser: { value: { id: 'user-1', username: 'Ana' } },
}));
vi.mock('../../../services/authService', () => authMock);

const tableState = vi.hoisted(() => ({
  currentTable: null as Record<string, unknown> | null,
  system: null as Record<string, unknown> | null,
}));
vi.mock('../../../stores/tableStore', () => ({
  useTableStore: () => ({ currentTable: tableState.currentTable }),
}));
vi.mock('../../../stores/systemStore', () => ({
  useSystemStore: () => ({
    currentSystemForTable: () => tableState.system,
    fetchAll: async () => undefined,
  }),
}));

function mountTray(overrides: Record<string, unknown> = {}) {
  return mount(DiceTray, {
    props: {
      tableId: 'table-1',
      connectionStatus: 'connected',
      ...overrides,
    },
  });
}

beforeEach(() => {
  socketServiceMock.isConnected.mockReturnValue(true);
  socketServiceMock.rollDice.mockReset();
  socketServiceMock.rollDice.mockResolvedValue({ ok: true, revision: 8, serverNowMs: 0 });
});

describe('DiceTray', () => {
  it('compõe expressão por dado, modificador e vantagem/desvantagem', async () => {
    const wrapper = mountTray();
    const input = wrapper.get('#dice-expression');

    await wrapper.get('button[aria-label="Usar um d6"]').trigger('click');
    expect((input.element as HTMLInputElement).value).toBe('1d6');

    await wrapper.get('.dice-tray__modifier-input').setValue('3');
    expect((input.element as HTMLInputElement).value).toBe('1d6+3');

    await wrapper.get('button[aria-pressed="false"]').trigger('click');
    expect((input.element as HTMLInputElement).value).toBe('1d6adv+3');

    const dis = wrapper
      .findAll('.dice-tray__option')
      .find((button) => button.text() === 'Desvantagem');
    await dis!.trigger('click');
    expect((input.element as HTMLInputElement).value).toBe('1d6dis+3');
    wrapper.unmount();
  });

  it('não emite rolagem inválida e anuncia o erro', async () => {
    const wrapper = mountTray();
    await wrapper.get('#dice-expression').setValue('banana');
    await wrapper.get('.dice-tray__roll').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('Expressão');
    expect(socketServiceMock.rollDice).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('envia a expressão pelo caminho canônico e mostra a confirmação', async () => {
    const wrapper = mountTray({
      currentTokenId: 'tok-1',
      characters: [
        {
          _id: 'char-1',
          ownerId: 'user-1',
          tableId: 'table-1',
          name: 'Lyra',
          attacks: [{ name: 'Espada longa', bonus: '+5', damage: '1d8+3' }],
        },
      ],
      activeCharacterId: 'char-1',
    });

    await wrapper.get('#dice-expression').setValue('1d20+2');
    await wrapper.get('.dice-tray__roll').trigger('click');
    await flushPromises();

    expect(socketServiceMock.rollDice).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'table-1',
        expression: '1d20+2',
        tokenId: 'tok-1',
        characterId: 'char-1',
      }),
      undefined,
      { silent: true },
    );
    expect(wrapper.text()).toContain('Espada longa');
    wrapper.unmount();
  });

  it('mostra o resultado da própria rolagem no painel do celular', async () => {
    const wrapper = mountTray();
    await wrapper.get('#dice-expression').setValue('1d20+2');
    await wrapper.get('.dice-tray__roll').trigger('click');
    await flushPromises();

    await wrapper.setProps({
      recentRolls: [
        {
          tableId: 'table-1',
          expression: '1d20+2',
          rolls: [{ die: 20, value: 18, kept: 'kept' }],
          modifier: 2,
          total: 20,
          userId: 'user-1',
          username: 'Ana',
          createdAt: new Date().toISOString(),
        },
      ],
    });
    await flushPromises();

    const result = wrapper.get('[data-testid="dice-result"]');
    expect(result.text()).toContain('20');
    expect(result.text()).toContain('18');
    wrapper.unmount();
  });

  it('mantém o resultado próprio na aba Dados quando o painel é reaberto', () => {
    const wrapper = mountTray({
      recentRolls: [
        {
          tableId: 'table-1',
          expression: '1d20+2',
          rolls: [{ die: 20, value: 18, kept: 'kept' }],
          modifier: 2,
          total: 20,
          userId: 'user-1',
          username: 'Ana',
          createdAt: new Date().toISOString(),
        },
        {
          tableId: 'table-1',
          expression: '1d6',
          rolls: [{ die: 6, value: 4, kept: 'kept' }],
          modifier: 0,
          total: 4,
          userId: 'user-2',
          username: 'Outro',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const result = wrapper.get('[data-testid="dice-result"]');
    expect(result.text()).toContain('20');
    expect(result.text()).toContain('1d20+2');
    // Restaurar do log não reabre o momento assinatura.
    expect(wrapper.emitted('roll-result')).toBeUndefined();
    wrapper.unmount();
  });

  it('mantém todos os atalhos de dado sem select que estoure em 320', () => {
    const wrapper = mountTray();

    expect(wrapper.findAll('.dice-tray__die')).toHaveLength(7);
    expect(wrapper.find('select').exists()).toBe(false);
    wrapper.unmount();
  });

  it('nomeia o preset do sistema começando pelo texto visível', () => {
    tableState.currentTable = { _id: 'table-1', systemId: 'sys-1', systemKey: 'dnd5e' };
    tableState.system = {
      dicePresets: [{ key: 'atr', label: 'Teste de atributo', expression: 'd20' }],
    };
    const wrapper = mountTray();

    const button = wrapper.get('.system-preset-btn');
    expect(button.attributes('aria-label')).toBe('Teste de atributo d20 — rolar');
    expect(button.text().replace(/\s+/g, ' ').trim()).toBe('Teste de atributo d20');

    tableState.currentTable = null;
    tableState.system = null;
    wrapper.unmount();
  });
});
