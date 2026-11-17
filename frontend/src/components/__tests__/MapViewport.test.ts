import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MapViewport from '../MapViewport.vue';
import type { GridSquare, TokenInfo } from '../../types';

const token = {
  _id: 'token-1',
  name: 'Herói',
  squareId: 'sq-0',
  size: 'Pequeno/Médio',
  color: '#d9b45b',
  ownerId: null,
  characterId: null,
} as unknown as TokenInfo;

function squaresWithToken(): GridSquare[] {
  return [{ id: 'sq-0', token }] as GridSquare[];
}

function mountViewport(props: Record<string, unknown> = {}) {
  return mount(MapViewport, {
    props: {
      isMeasuring: false,
      viewTransform: { scale: 1, x: 0, y: 0 },
      currentMapUrl: '/uploads/maps/handout.webp',
      activeSceneType: 'battlemap',
      gridWidth: 4,
      gridHeight: 4,
      metersPerSquare: 1.5,
      rulerDistance: '0.0m',
      measurementColor: '#d9b45b',
      squares: squaresWithToken(),
      isDm: true,
      showAssignMenu: false,
      assignMenuPosition: { x: 0, y: 0 },
      onWheel: vi.fn(),
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onMiddleClick: vi.fn(),
      onSquareRightClick: vi.fn(),
      onSquareLeftClick: vi.fn(),
      onTokenMoveRequest: vi.fn(),
      onRemovePersistent: vi.fn(),
      onSelectPersistent: vi.fn(),
      onViewportContextmenu: vi.fn(),
      onShapeContextmenu: vi.fn(),
      onAssignToken: vi.fn(),
      onCloseAssignMenu: vi.fn(),
      ...props,
    },
  });
}

describe('MapViewport image-only', () => {
  it('renderiza só a imagem: sem grade, tokens, medições ou camada de ping', () => {
    const wrapper = mountViewport({ imageOnly: true, activeSceneType: 'image' });

    expect(wrapper.find('.map-image').exists()).toBe(true);
    expect(wrapper.find('.grid-overlay').exists()).toBe(false);
    expect(wrapper.find('.token-layer').exists()).toBe(false);
    expect(wrapper.find('.grid-viewport').exists()).toBe(false);
    expect(wrapper.get('.viewport').classes()).toContain('image-only');
    wrapper.unmount();
  });

  it('ignora o clique do meio (ping) na prévia de imagem', async () => {
    const onMiddleClick = vi.fn();
    const wrapper = mountViewport({ imageOnly: true, onMiddleClick });

    await wrapper.get('.map-stage').trigger('mousedown', { button: 1 });

    expect(onMiddleClick).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('volta a renderizar grade e tokens quando imageOnly é falso', () => {
    const wrapper = mountViewport({ imageOnly: false, activeSceneType: 'battlemap' });

    expect(wrapper.find('.grid-overlay').exists()).toBe(true);
    expect(wrapper.find('.token-layer').exists()).toBe(true);
    expect(wrapper.find('.token').exists()).toBe(true);
    expect(wrapper.get('.viewport').classes()).not.toContain('image-only');
    wrapper.unmount();
  });
});
