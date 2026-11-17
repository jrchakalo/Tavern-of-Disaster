import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

import PlayerBoard from '../play/PlayerBoard.vue';
import type { TokenInfo } from '../../types';

/**
 * O tabuleiro do jogador converte toque em unidade de grade antes de emitir.
 * O ambiente de teste fornece a geometria que o ResizeObserver e o
 * `getBoundingClientRect` dariam em um navegador real.
 *
 * `trigger()` do Test Utils não serve para ponteiro: ele tenta gravar
 * `clientX`/`button` em eventos forjados pelo jsdom e falha. O evento é
 * montado à mão, como o browser faria.
 */

class ResizeObserverStub {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback(
      [{ contentRect: { width: 600, height: 600 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

function firePointer(el: Element, type: string, props: Record<string, unknown>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, props);
  el.dispatchEvent(event);
}

const token: TokenInfo = {
  _id: 'tok-1',
  squareId: 'sq-0',
  color: '#765770',
  ownerId: { _id: 'user-1', username: 'Tester' },
  name: 'Lyra',
  sceneId: 'scene-1',
  movement: 9,
  remainingMovement: 9,
  size: 'Pequeno/Médio',
  canOverlap: false,
};

async function mountBoard(overrides: Record<string, unknown> = {}): Promise<VueWrapper> {
  const wrapper = mount(PlayerBoard, {
    props: {
      squares: [],
      gridWidth: 10,
      gridHeight: 10,
      tokens: [token],
      activeTokenId: 'tok-1',
      currentTurnTokenId: 'tok-1',
      moveMode: true,
      interactive: true,
      metersPerSquare: 1.5,
      ...overrides,
    },
  });
  // O ResizeObserver notifica no mounted; o flush aplica a geometria no DOM.
  await nextTick();
  const canvas = wrapper.find('.board-canvas');
  (canvas.element as HTMLElement).getBoundingClientRect = () =>
    ({
      width: 600,
      height: 600,
      left: 0,
      top: 0,
      right: 600,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return wrapper;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('PlayerBoard pointer input', () => {
  it('converts a tap into grid units and emits request-move', async () => {
    const wrapper = await mountBoard();
    const el = wrapper.find('.board-canvas').element;

    // 150px / 60px por célula = coluna 2; 90px / 60px = linha 1 → sq-12
    firePointer(el, 'pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 90 });
    firePointer(el, 'pointerup', { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 90 });

    expect(wrapper.emitted('request-move')?.[0]).toEqual(['sq-12']);
    expect(wrapper.emitted('move-blocked')).toBeUndefined();
    wrapper.unmount();
  });

  it('reports taps outside the reachable movement without emitting a move', async () => {
    const wrapper = await mountBoard();
    const el = wrapper.find('.board-canvas').element;

    // Canto oposto: 9 quadrados de distância, o movimento chega a 6.
    firePointer(el, 'pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 570, clientY: 570 });
    firePointer(el, 'pointerup', { pointerId: 2, pointerType: 'touch', clientX: 570, clientY: 570 });

    expect(wrapper.emitted('request-move')).toBeUndefined();
    expect(wrapper.emitted('move-blocked')?.[0]).toEqual(['sq-99']);
    wrapper.unmount();
  });

  it('does not move when the board is not armed', async () => {
    const wrapper = await mountBoard({ moveMode: false });
    const el = wrapper.find('.board-canvas').element;

    firePointer(el, 'pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 90 });
    firePointer(el, 'pointerup', { pointerId: 3, pointerType: 'touch', clientX: 150, clientY: 90 });

    expect(wrapper.emitted('request-move')).toBeUndefined();
    expect(wrapper.emitted('move-blocked')).toBeUndefined();
    wrapper.unmount();
  });

  it('long-press opens token details and suppresses the following tap', async () => {
    vi.useFakeTimers();
    const wrapper = await mountBoard();
    const el = wrapper.find('.board-canvas').element;

    firePointer(el, 'pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 30, clientY: 30 });
    vi.advanceTimersByTime(500);

    expect(wrapper.emitted('token-details')?.[0]?.[0]).toMatchObject({ _id: 'tok-1' });

    firePointer(el, 'pointerup', { pointerId: 4, pointerType: 'touch', clientX: 30, clientY: 30 });
    expect(wrapper.emitted('request-move')).toBeUndefined();
    wrapper.unmount();
  });

  it('restores state on pointercancel so a late pointerup cannot move', async () => {
    vi.useFakeTimers();
    const wrapper = await mountBoard();
    const el = wrapper.find('.board-canvas').element;

    firePointer(el, 'pointerdown', { pointerId: 5, pointerType: 'touch', clientX: 30, clientY: 30 });
    firePointer(el, 'pointercancel', { pointerId: 5 });
    vi.advanceTimersByTime(500);
    expect(wrapper.emitted('token-details')).toBeUndefined();

    firePointer(el, 'pointerup', { pointerId: 5, pointerType: 'touch', clientX: 150, clientY: 90 });
    expect(wrapper.emitted('request-move')).toBeUndefined();
    wrapper.unmount();
  });

  it('restores state on lostpointercapture', async () => {
    vi.useFakeTimers();
    const wrapper = await mountBoard();
    const el = wrapper.find('.board-canvas').element;

    firePointer(el, 'pointerdown', { pointerId: 6, pointerType: 'touch', clientX: 30, clientY: 30 });
    firePointer(el, 'lostpointercapture', { pointerId: 6 });
    vi.advanceTimersByTime(500);
    expect(wrapper.emitted('token-details')).toBeUndefined();

    firePointer(el, 'pointerup', { pointerId: 6, pointerType: 'touch', clientX: 150, clientY: 90 });
    expect(wrapper.emitted('request-move')).toBeUndefined();
    wrapper.unmount();
  });

  it('opens details when tapping within the 44px token hit area', async () => {
    const wrapper = await mountBoard({
      gridWidth: 30,
      gridHeight: 30,
      moveMode: true,
      interactive: true,
    });
    const el = wrapper.find('.board-canvas').element;

    // Célula de 20px; o centro do token sq-0 fica em (10,10). Um toque a 20px
    // ainda precisa abrir detalhes (hit box mínima de 44×44), e não mover.
    firePointer(el, 'pointerdown', { pointerId: 9, pointerType: 'touch', clientX: 30, clientY: 10 });
    firePointer(el, 'pointerup', { pointerId: 9, pointerType: 'touch', clientX: 30, clientY: 10 });

    expect(wrapper.emitted('token-details')?.[0]?.[0]).toMatchObject({ _id: 'tok-1' });
    expect(wrapper.emitted('request-move')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders pings from grid coordinates', async () => {
    const wrapper = await mountBoard({
      moveMode: false,
      interactive: false,
      tokens: [],
      pings: [{ id: 'ping-1', x: 2.5, y: 3.5, color: '#ffeb3b' }],
    });
    await nextTick();

    const ping = wrapper.find('.board-ping');
    expect(ping.exists()).toBe(true);
    // Centro do ponto de grade (2.5, 3.5) em px: 150 e 210; raio = 60/2.
    expect(ping.attributes('style')).toContain('left: 120px');
    expect(ping.attributes('style')).toContain('top: 180px');
    wrapper.unmount();
  });
});
