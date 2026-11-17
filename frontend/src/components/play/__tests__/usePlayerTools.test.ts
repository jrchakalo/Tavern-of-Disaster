import { describe, it, expect, vi } from 'vitest';
import { formatMeters, usePlayerTools, type PlayerToolDeps } from '../usePlayerTools';

function setup(overrides: Partial<PlayerToolDeps> = {}) {
  const shareMeasurement = vi.fn(async () => ({ ok: true }));
  const removeMyMeasurement = vi.fn(async () => ({ ok: true }));
  const sendPing = vi.fn(async () => ({ ok: true }));
  const onError = vi.fn();
  const deps: PlayerToolDeps = {
    tableId: () => 'table-1',
    sceneId: () => 'scene-1',
    gridWidth: () => 10,
    metersPerSquare: () => 1.5,
    color: () => '#ff8c00',
    userId: () => 'user-1',
    username: () => 'Tester',
    shareMeasurement,
    removeMyMeasurement,
    sendPing,
    onError,
    ...overrides,
  };
  return {
    tools: usePlayerTools(deps),
    shareMeasurement,
    removeMyMeasurement,
    sendPing,
    onError,
  };
}

describe('usePlayerTools — régua', () => {
  it('primeiro toque só marca o início', async () => {
    const { tools, shareMeasurement } = setup();
    tools.startRuler();
    expect(tools.tool.value).toBe('ruler');
    expect(tools.hint.value).toBe('Toque no primeiro quadrado');

    await tools.tapSquare({ squareId: 'sq-0', point: { x: 0.2, y: 0.1 } });

    expect(tools.rulerStart.value).toEqual({ x: 0.5, y: 0.5 });
    expect(tools.localMeasurement.value).toBeNull();
    expect(shareMeasurement).not.toHaveBeenCalled();
    expect(tools.hint.value).toBe('Toque no segundo quadrado');
    expect(tools.tool.value).toBe('ruler');
  });

  it('segundo toque calcula a distância, compartilha e encerra a ferramenta', async () => {
    const { tools, shareMeasurement, onError } = setup();
    tools.startRuler();
    await tools.tapSquare({ squareId: 'sq-0', point: { x: 0.2, y: 0.1 } });
    await tools.tapSquare({ squareId: 'sq-13', point: { x: 3.1, y: 1.4 } });

    expect(tools.localMeasurement.value).toMatchObject({
      userId: 'user-1',
      start: { x: 0.5, y: 0.5 },
      end: { x: 3.5, y: 1.5 },
      distance: '4,5 m',
      color: '#ff8c00',
      type: 'ruler',
    });
    expect(shareMeasurement).toHaveBeenCalledWith({
      tableId: 'table-1',
      sceneId: 'scene-1',
      start: { x: 0.5, y: 0.5 },
      end: { x: 3.5, y: 1.5 },
      distance: '4,5 m',
      type: 'ruler',
      color: '#ff8c00',
    });
    expect(tools.tool.value).toBe('none');
    expect(tools.rulerStart.value).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('mantém a medida local quando o servidor recusa o compartilhamento', async () => {
    const { tools, onError } = setup({
      shareMeasurement: vi.fn(async () => ({
        ok: false,
        error: { message: 'Você não pode compartilhar medição agora.' },
      })),
    });
    tools.startRuler();
    await tools.tapSquare({ squareId: 'sq-0', point: { x: 0.5, y: 0.5 } });
    await tools.tapSquare({ squareId: 'sq-11', point: { x: 1.5, y: 1.5 } });

    expect(tools.localMeasurement.value?.distance).toBe('1,5 m');
    expect(onError).toHaveBeenCalledWith('Você não pode compartilhar medição agora.');
    expect(tools.tool.value).toBe('none');
  });

  it('cancelar preserva a última medida e desarma a ferramenta', async () => {
    const { tools } = setup();
    tools.startRuler();
    await tools.tapSquare({ squareId: 'sq-0', point: { x: 0.5, y: 0.5 } });
    tools.startRuler();
    expect(tools.rulerStart.value).toBeNull();
    tools.cancel();
    expect(tools.tool.value).toBe('none');
    expect(tools.hint.value).toBe('');
  });
});

describe('usePlayerTools — ping', () => {
  it('um toque envia o ping em unidades de grade e encerra o modo', async () => {
    const { tools, sendPing } = setup();
    tools.startPing();
    expect(tools.hint.value).toBe('Ping: toque num quadrado');

    await tools.tapSquare({ squareId: 'sq-12', point: { x: 2.1, y: 1.2 } });

    expect(sendPing).toHaveBeenCalledWith({
      tableId: 'table-1',
      sceneId: 'scene-1',
      squareId: 'sq-12',
      x: 2.5,
      y: 1.5,
      color: '#ff8c00',
    });
    expect(tools.tool.value).toBe('none');
    expect(tools.rulerStart.value).toBeNull();
  });

  it('erro do servidor vira mensagem para a view', async () => {
    const { tools, onError } = setup({
      sendPing: vi.fn(async () => ({ ok: false, error: { message: 'Ping fora dos limites.' } })),
    });
    tools.startPing();
    await tools.tapSquare({ squareId: 'sq-3', point: { x: 3.5, y: 0.5 } });
    expect(onError).toHaveBeenCalledWith('Ping fora dos limites.');
  });

  it('não emite quando não há cena ativa', async () => {
    const { tools, sendPing } = setup({ sceneId: () => null });
    tools.startPing();
    await tools.tapSquare({ squareId: 'sq-3', point: { x: 3.5, y: 0.5 } });
    expect(sendPing).not.toHaveBeenCalled();
  });
});

describe('usePlayerTools — limpar', () => {
  it('remove a medição local e avisa o servidor', async () => {
    const { tools, removeMyMeasurement } = setup();
    tools.startRuler();
    await tools.tapSquare({ squareId: 'sq-0', point: { x: 0.5, y: 0.5 } });
    await tools.tapSquare({ squareId: 'sq-11', point: { x: 1.5, y: 1.5 } });
    expect(tools.hasLocalMeasurement.value).toBe(true);

    await tools.clearMeasurement();

    expect(tools.localMeasurement.value).toBeNull();
    expect(tools.hasLocalMeasurement.value).toBe(false);
    expect(removeMyMeasurement).toHaveBeenCalledWith({ tableId: 'table-1', sceneId: 'scene-1' });
  });
});

describe('formatMeters', () => {
  it('usa vírgula decimal e espaço antes do metro', () => {
    expect(formatMeters(1.5)).toBe('1,5 m');
    expect(formatMeters(0)).toBe('0,0 m');
    expect(formatMeters(12)).toBe('12,0 m');
  });
});
