import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import GridMeasurementLayer from '../GridMeasurementLayer.vue';

/**
 * Pings são unidades de grade no protocolo da Fase 2 (§5.3): o render nunca
 * deve adivinhar entre pixel e grade. O heurístico `toLocalPoint` continua
 * existindo apenas para medições com clientes legados.
 */
function mountLayer(overrides: Record<string, unknown> = {}) {
  return mount(GridMeasurementLayer, {
    props: {
      previewMeasurement: null,
      sharedMeasurements: [],
      persistentMeasurements: [],
      auras: [],
      squares: [],
      squareSize: 10,
      gridWidth: 40,
      gridHeight: 40,
      metersPerSquare: 1.5,
      viewScale: 1,
      isDm: false,
      ...overrides,
    },
  });
}

describe('GridMeasurementLayer pings', () => {
  it('renders x/y as grid units multiplied by squareSize (no pixel heuristic)', () => {
    const wrapper = mountLayer({
      pings: [
        {
          id: 'ping-1',
          userId: 'u1',
          username: 'Tester',
          sceneId: 'scene-1',
          x: 35,
          y: 7,
          color: '#ffeb3b',
          ts: 1,
        },
      ],
    });

    const circle = wrapper.get('.ping-overlay circle');
    expect(circle.attributes('cx')).toBe('350'); // 35 * 10
    expect(circle.attributes('cy')).toBe('70'); // 7 * 10
    wrapper.unmount();
  });

  it('supports squareId pings anchored to the cell center', () => {
    const wrapper = mountLayer({
      pings: [
        {
          id: 'ping-2',
          userId: 'u1',
          username: 'Tester',
          sceneId: 'scene-1',
          squareId: 'sq-45', // col 5, linha 1 em grade 40
          ts: 1,
        },
      ],
    });

    const circle = wrapper.get('.ping-overlay circle');
    expect(circle.attributes('cx')).toBe('55'); // (5 + 0.5) * 10
    expect(circle.attributes('cy')).toBe('15'); // (1 + 0.5) * 10
    wrapper.unmount();
  });

  it('renders nothing when the ping has no coordinates', () => {
    const wrapper = mountLayer({
      pings: [{ id: 'ping-3', userId: 'u1', username: 'Tester', sceneId: 'scene-1', ts: 1 }],
    });

    expect(wrapper.find('.ping-overlay circle').exists()).toBe(false);
    wrapper.unmount();
  });
});
