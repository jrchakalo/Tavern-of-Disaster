import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const setCharacterHpMock = vi.hoisted(() => vi.fn());
vi.mock('../../character/hpSync', () => ({ setCharacterHp: setCharacterHpMock }));

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../../services/toast', () => ({ toast: toastMock }));

import TokenCard from '../TokenCard.vue';
import type { CharacterDTO, TokenInfo } from '../../../types';

function makeToken(extra: Partial<TokenInfo> = {}): TokenInfo {
  return {
    _id: 'tok-1',
    squareId: 'sq-0',
    color: '#765770',
    name: 'Nyx token',
    sceneId: 'scene-1',
    movement: 9,
    remainingMovement: 6,
    size: 'Pequeno/Médio',
    ...extra,
  };
}

const character: CharacterDTO = {
  _id: 'char-1',
  ownerId: 'user-1',
  tableId: 'table-1',
  name: 'Nyx',
  stats: { currentHP: 42, maxHP: 50, defense: 16 },
  profile: { level: 4 },
};

describe('TokenCard — vitais, ajuste rápido e abertura da ficha', () => {
  beforeEach(() => {
    setCharacterHpMock.mockReset();
    setCharacterHpMock.mockResolvedValue({ ok: true, via: 'store', currentHP: 43 });
    Object.values(toastMock).forEach((fn) => fn.mockReset());
  });

  it('mostra nome, PV, CA e nível; cai para a ficha quando não há resumo', () => {
    const wrapper = mount(TokenCard, {
      props: { token: makeToken(), character },
    });

    expect(wrapper.get('.token-card__name').text()).toBe('Nyx');
    expect(wrapper.get('.token-card__hp').text()).toBe('PV 42 / 50');
    expect(wrapper.get('.token-card__defense').text()).toContain('16');
    expect(wrapper.get('.token-card__level').text()).toContain('4');
    wrapper.unmount();
  });

  it('prefere o resumo vivo do token (PV/CA em tempo real)', () => {
    const wrapper = mount(TokenCard, {
      props: {
        token: makeToken({
          character: { _id: 'char-1', name: 'Nyx', currentHP: 12, maxHP: 18, defense: 13 },
        }),
        character,
      },
    });

    expect(wrapper.get('.token-card__hp').text()).toBe('PV 12 / 18');
    expect(wrapper.get('.token-card__defense').text()).toContain('13');
    wrapper.unmount();
  });

  it('emite open-sheet ao tocar no cartão apenas quando openable', async () => {
    const closed = mount(TokenCard, { props: { token: makeToken(), character } });
    await closed.get('.token-card').trigger('click');
    expect(closed.emitted('open-sheet')).toBeUndefined();
    closed.unmount();

    const open = mount(TokenCard, { props: { token: makeToken(), character, openable: true } });
    await open.get('.token-card').trigger('click');
    expect(open.emitted('open-sheet')).toHaveLength(1);
    open.unmount();
  });

  it('ajusta PV pelo caminho canônico (hpSync) com clamp no máximo', async () => {
    const wrapper = mount(TokenCard, {
      props: { token: makeToken(), character, tableId: 'table-1', canEdit: true },
    });

    await wrapper.get('[aria-label="Aumentar PV em 1"]').trigger('click');
    await flushPromises();

    expect(setCharacterHpMock).toHaveBeenCalledTimes(1);
    expect(setCharacterHpMock).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 'table-1', characterId: 'char-1', currentHP: 43, maxHP: 50 }),
    );
    expect(toastMock.error).not.toHaveBeenCalled();

    // No máximo o botão não ultrapassa maxHP.
    setCharacterHpMock.mockClear();
    setCharacterHpMock.mockResolvedValue({ ok: true, via: 'store', currentHP: 50 });
    const atMax = mount(TokenCard, {
      props: {
        token: makeToken(),
        character: { ...character, stats: { currentHP: 50, maxHP: 50, defense: 16 } },
        tableId: 'table-1',
        canEdit: true,
      },
    });
    await atMax.get('[aria-label="Aumentar PV em 1"]').trigger('click');
    await flushPromises();
    expect(setCharacterHpMock).not.toHaveBeenCalled();
    atMax.unmount();
    wrapper.unmount();
  });

  it('mostra o erro uma única vez quando o hpSync ainda não notificou', async () => {
    setCharacterHpMock.mockResolvedValue({
      ok: false,
      via: 'rest',
      message: 'PV recusado pelo servidor.',
      alreadyNotified: false,
    });

    const wrapper = mount(TokenCard, {
      props: { token: makeToken(), character, tableId: 'table-1', canEdit: true },
    });
    await wrapper.get('[aria-label="Diminuir PV em 1"]').trigger('click');
    await flushPromises();

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledWith('PV recusado pelo servidor.');
    wrapper.unmount();

    // Já notificado pelo socketService: sem segundo toast.
    toastMock.error.mockClear();
    setCharacterHpMock.mockResolvedValue({
      ok: false,
      via: 'store',
      message: 'PV recusado pelo servidor.',
      alreadyNotified: true,
    });
    const wrapper2 = mount(TokenCard, {
      props: { token: makeToken(), character, tableId: 'table-1', canEdit: true },
    });
    await wrapper2.get('[aria-label="Diminuir PV em 1"]').trigger('click');
    await flushPromises();
    expect(toastMock.error).not.toHaveBeenCalled();
    wrapper2.unmount();
  });
});
