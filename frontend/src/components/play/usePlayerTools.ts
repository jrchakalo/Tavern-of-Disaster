import { computed, ref } from 'vue';
import {
  distanceInMeters,
  squareCenterInGrid,
  type GridPoint,
} from '../../services/gridGeometry';

/**
 * Ferramentas de mesa do jogador (`/play`): régua e ping.
 *
 * A régua local é sempre medida no celular; o compartilhamento com a mesa usa
 * o mesmo contrato do DM (`requestShareMeasurement`) e só é aceito pelo
 * servidor quando é o turno do jogador. O ping é efêmero e vale para qualquer
 * membro da mesa.
 */

export type PlayerTool = 'none' | 'ruler' | 'ping';

export type PlayerMeasurement = {
  userId: string;
  username?: string;
  start: GridPoint;
  end: GridPoint;
  distance: string;
  color: string;
  type?: 'ruler';
};

export type SquareTap = {
  squareId: string;
  point: GridPoint;
};

export type ToolAck = {
  ok?: boolean;
  error?: { message?: string };
} | null | undefined;

export type ShareMeasurementPayload = {
  tableId: string;
  sceneId: string;
  start: GridPoint;
  end: GridPoint;
  distance: string;
  type: 'ruler';
  color: string;
};

export type RemoveMeasurementPayload = {
  tableId: string;
  sceneId: string;
};

export type PingPayload = {
  tableId: string;
  sceneId: string;
  squareId: string;
  x: number;
  y: number;
  color: string;
};

export interface PlayerToolDeps {
  tableId: () => string | null;
  sceneId: () => string | null;
  gridWidth: () => number;
  metersPerSquare: () => number;
  color: () => string;
  userId: () => string;
  username?: () => string;
  shareMeasurement?: (payload: ShareMeasurementPayload) => ToolAck | Promise<ToolAck>;
  removeMyMeasurement?: (payload: RemoveMeasurementPayload) => ToolAck | Promise<ToolAck>;
  sendPing?: (payload: PingPayload) => ToolAck | Promise<ToolAck>;
  onError?: (message: string) => void;
}

/** Formato canônico do jogador: vírgula decimal e espaço antes do metro. */
export function formatMeters(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} m`;
}

/** Centro do quadrado em unidades de grade, com fallback para o toque bruto. */
export function snapToSquareCenter(tap: SquareTap, gridWidth: number): GridPoint {
  return squareCenterInGrid(tap.squareId, gridWidth) ?? tap.point;
}

function ackMessage(ack: ToolAck, fallback: string): string | null {
  if (!ack || ack.ok !== false) return null;
  const message = ack.error?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export function usePlayerTools(deps: PlayerToolDeps) {
  const tool = ref<PlayerTool>('none');
  const rulerStart = ref<GridPoint | null>(null);
  const localMeasurement = ref<PlayerMeasurement | null>(null);
  const busy = ref(false);

  const hasLocalMeasurement = computed(() => localMeasurement.value !== null);
  const isToolActive = computed(() => tool.value !== 'none');

  const hint = computed(() => {
    if (tool.value === 'ruler') {
      return rulerStart.value ? 'Toque no segundo quadrado' : 'Toque no primeiro quadrado';
    }
    if (tool.value === 'ping') return 'Ping: toque num quadrado';
    return '';
  });

  function startRuler() {
    tool.value = 'ruler';
    rulerStart.value = null;
  }

  function startPing() {
    tool.value = 'ping';
    rulerStart.value = null;
  }

  function cancel() {
    tool.value = 'none';
    rulerStart.value = null;
  }

  function resetMeasurement() {
    localMeasurement.value = null;
    cancel();
  }

  function measurementFor(start: GridPoint, end: GridPoint): PlayerMeasurement {
    const distance = formatMeters(distanceInMeters(start, end, deps.metersPerSquare()));
    return {
      userId: deps.userId(),
      username: deps.username?.(),
      start,
      end,
      distance,
      color: deps.color(),
      type: 'ruler',
    };
  }

  async function shareRuler(measurement: PlayerMeasurement) {
    const tableId = deps.tableId();
    const sceneId = deps.sceneId();
    if (!tableId || !sceneId || !deps.shareMeasurement) return;
    try {
      const ack = await deps.shareMeasurement({
        tableId,
        sceneId,
        start: measurement.start,
        end: measurement.end,
        distance: measurement.distance,
        type: 'ruler',
        color: measurement.color,
      });
      const message = ackMessage(
        ack,
        'A régua ficou só no seu celular; a mesa recebe no seu turno.',
      );
      if (message) deps.onError?.(message);
    } catch {
      deps.onError?.('Não foi possível compartilhar a régua. A medida continua no seu tabuleiro.');
    }
  }

  async function rulerTap(tap: SquareTap) {
    const point = snapToSquareCenter(tap, deps.gridWidth());
    if (!rulerStart.value) {
      rulerStart.value = point;
      return;
    }
    const measurement = measurementFor(rulerStart.value, point);
    localMeasurement.value = measurement;
    rulerStart.value = null;
    tool.value = 'none';
    await shareRuler(measurement);
  }

  async function pingTap(tap: SquareTap) {
    const tableId = deps.tableId();
    const sceneId = deps.sceneId();
    const point = snapToSquareCenter(tap, deps.gridWidth());
    tool.value = 'none';
    rulerStart.value = null;
    if (!tableId || !sceneId || !deps.sendPing) return;
    try {
      const ack = await deps.sendPing({
        tableId,
        sceneId,
        squareId: tap.squareId,
        x: point.x,
        y: point.y,
        color: deps.color(),
      });
      const message = ackMessage(ack, 'Não foi possível enviar o ping.');
      if (message) deps.onError?.(message);
    } catch {
      deps.onError?.('Não foi possível enviar o ping.');
    }
  }

  async function tapSquare(tap: SquareTap) {
    if (busy.value) return;
    if (!deps.tableId() || !deps.sceneId()) return;
    busy.value = true;
    try {
      if (tool.value === 'ruler') await rulerTap(tap);
      else if (tool.value === 'ping') await pingTap(tap);
    } finally {
      busy.value = false;
    }
  }

  async function clearMeasurement() {
    const tableId = deps.tableId();
    const sceneId = deps.sceneId();
    localMeasurement.value = null;
    cancel();
    if (!tableId || !sceneId || !deps.removeMyMeasurement) return;
    try {
      await deps.removeMyMeasurement({ tableId, sceneId });
    } catch {
      deps.onError?.('Não foi possível limpar a medição na mesa.');
    }
  }

  return {
    tool,
    rulerStart,
    localMeasurement,
    busy,
    hasLocalMeasurement,
    isToolActive,
    hint,
    startRuler,
    startPing,
    cancel,
    resetMeasurement,
    tapSquare,
    clearMeasurement,
  };
}
