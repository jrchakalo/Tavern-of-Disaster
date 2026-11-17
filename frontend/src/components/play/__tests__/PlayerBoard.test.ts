import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import PlayerBoard from '../PlayerBoard.vue';

type ResizeCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void;

class ResizeObserverStub {
  static callback: ResizeCallback | null = null;

  constructor(callback: ResizeCallback) {
    ResizeObserverStub.callback = callback;
  }

  observe() {
    ResizeObserverStub.callback?.([{ contentRect: { width: 400, height: 400 } }]);
  }

  unobserve() {
    /* noop */
  }

  disconnect() {
    ResizeObserverStub.callback = null;
  }
}

const baseToken = {
  _id: 'tok-1',
  squareId: 'sq-0',
  color: '#765770',
  ownerId: { _id: 'user-1', username: 'Tester' },
  name: 'Lyra',
  sceneId: 'scene-1',
  movement: 9,
  remainingMovement: 6,
  size: 'Pequeno/Médio' as const,
  canOverlap: false,
};

function rect(): DOMRect {
  return {
    left: 0,
    top: 0,
    right: 400,
    bottom: 400,
    width: 400,
    height: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

async function mountBoard(props: Record<string, unknown>) {
  const wrapper = mount(PlayerBoard, {
    props: { squares: [], gridWidth: 10, gridHeight: 10, interactive: true, ...props },
    global: { stubs: { GridLayer: true } },
  });
  await nextTick();
  await nextTick();
  const canvas = wrapper.get('.board-canvas');
  (canvas.element as HTMLElement).getBoundingClientRect = rect;
  return { wrapper, canvas };
}

async function pointer(
  canvas: ReturnType<typeof mountBoard>['canvas'],
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  x: number,
  y: number,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
    clientX: { value: x },
    clientY: { value: y },
    button: { value: 0 },
  });
  (canvas.element as HTMLElement).dispatchEvent(event);
  await nextTick();
}

describe('PlayerBoard — ferramenta de régua/ping', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toque simples com ferramenta ativa emite square-tap com quadrado e ponto de grade', async () => {
    const { wrapper, canvas } = await mountBoard({ tool: 'ruler' });

    await pointer(canvas, 'pointerdown', 100, 100);
    await pointer(canvas, 'pointerup', 100, 100);

    const taps = wrapper.emitted('square-tap') as unknown[][] | undefined;
    expect(taps).toHaveLength(1);
    expect(taps?.[0]?.[0]).toEqual({ squareId: 'sq-22', point: { x: 2.5, y: 2.5 } });
    expect(wrapper.emitted('token-details')).toBeUndefined();
  });

  it('ferramenta ativa desliga o pan: arrastar não mexe na câmera', async () => {
    const { wrapper, canvas } = await mountBoard({ tool: 'ruler' });

    await pointer(canvas, 'pointerdown', 100, 100);
    await pointer(canvas, 'pointermove', 180, 160);
    await pointer(canvas, 'pointerup', 180, 160);

    expect(wrapper.emitted('camera-change')).toBeUndefined();
    expect(wrapper.emitted('square-tap')).toBeUndefined();
  });

  it('sem ferramenta o arrasto continua sendo pan', async () => {
    const { wrapper, canvas } = await mountBoard({ tool: 'none' });

    await pointer(canvas, 'pointerdown', 100, 100);
    await pointer(canvas, 'pointermove', 180, 160);
    await pointer(canvas, 'pointerup', 180, 160);

    expect(wrapper.emitted('camera-change')).toBeTruthy();
    expect(wrapper.emitted('square-tap')).toBeUndefined();
  });

  it('toque em token abre detalhes quando nenhuma ferramenta está ativa', async () => {
    const { wrapper, canvas } = await mountBoard({ tool: 'none', tokens: [baseToken] });

    await pointer(canvas, 'pointerdown', 20, 20);
    await pointer(canvas, 'pointerup', 20, 20);

    const details = wrapper.emitted('token-details') as unknown[][] | undefined;
    expect(details).toHaveLength(1);
    expect((details?.[0]?.[0] as { _id: string })._id).toBe('tok-1');
    expect(wrapper.emitted('square-tap')).toBeUndefined();
  });

  it('com ferramenta ativa o toque em token vira seleção de quadrado', async () => {
    const { wrapper, canvas } = await mountBoard({ tool: 'ping', tokens: [baseToken] });

    await pointer(canvas, 'pointerdown', 20, 20);
    await pointer(canvas, 'pointerup', 20, 20);

    expect(wrapper.emitted('token-details')).toBeUndefined();
    const taps = wrapper.emitted('square-tap') as unknown[][] | undefined;
    expect(taps?.[0]?.[0]).toEqual({ squareId: 'sq-0', point: { x: 0.5, y: 0.5 } });
  });

  it('desenha a régua e a distância no espaço de grade do tabuleiro', async () => {
    const { wrapper } = await mountBoard({
      tool: 'none',
      sharedMeasurements: [
        {
          userId: 'user-2',
          username: 'Outro',
          start: { x: 1.5, y: 1.5 },
          end: { x: 4.5, y: 1.5 },
          distance: '4,5 m',
          color: '#ff8c00',
          type: 'ruler',
        },
      ],
    });
    await nextTick();

    const line = wrapper.get('.board-measurements line');
    expect(line.attributes('x1')).toBe('60');
    expect(line.attributes('x2')).toBe('180');
    expect(wrapper.get('.board-measurements text').text()).toBe('4,5 m');
  });
});
