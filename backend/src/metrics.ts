import { createLogger } from './logger';

const log = createLogger({ scope: 'metrics' });

type TableMetricsState = {
  totalTableJoins: number;
  connectedSockets: number;
  diceRollsCount: number;
  tokenMovesCount: number;
  authFailures: number;
  tokenMoveErrors: number;
  activeTables: Map<string, Set<string>>; // tableId -> socket ids
  socketSubscriptions: Map<string, Set<string>>; // socketId -> table ids
};

const state: TableMetricsState = {
  totalTableJoins: 0,
  connectedSockets: 0,
  diceRollsCount: 0,
  tokenMovesCount: 0,
  authFailures: 0,
  tokenMoveErrors: 0,
  activeTables: new Map(),
  socketSubscriptions: new Map(),
};

export type MetricsSnapshot = {
  totalTableJoins: number;
  activeTables: number;
  activeSubscriptions: number;
  connectedSockets: number;
  diceRollsCount: number;
  tokenMovesCount: number;
  authFailures: number;
  tokenMoveErrors: number;
};

type RateTracker = {
  timestamps: number[];
};

const createRateTracker = (): RateTracker => ({ timestamps: [] });
const pruneTracker = (tracker: RateTracker, windowMs: number, now: number) => {
  while (tracker.timestamps.length && now - tracker.timestamps[0] > windowMs) {
    tracker.timestamps.shift();
  }
};

const checkAlertThreshold = (
  tracker: RateTracker,
  threshold: number,
  windowMs: number,
  alertName: string,
  context: Record<string, unknown> = {}
) => {
  const now = Date.now();
  tracker.timestamps.push(now);
  pruneTracker(tracker, windowMs, now);
  if (tracker.timestamps.length >= threshold) {
    log.warn({ alert: alertName, count: tracker.timestamps.length, windowMs, ...context }, 'Alert threshold exceeded');
  }
};

const authFailureTracker = createRateTracker();
const tokenMoveErrorTracker = createRateTracker();
const ONE_MINUTE_MS = 60 * 1000;
const AUTH_FAILURE_ALERT_THRESHOLD = Number(process.env.AUTH_FAILURE_ALERT_THRESHOLD ?? 10);
const TOKEN_MOVE_ERROR_ALERT_THRESHOLD = Number(process.env.TOKEN_MOVE_ERROR_ALERT_THRESHOLD ?? 8);

const ensureMapEntry = <T>(map: Map<string, Set<T>>, key: string) => {
  let entry = map.get(key);
  if (!entry) {
    entry = new Set<T>();
    map.set(key, entry);
  }
  return entry;
};

export const recordSocketConnected = (socketId: string) => {
  if (!socketId) return;
  state.connectedSockets += 1;
  ensureMapEntry(state.socketSubscriptions, socketId);
};

export const recordSocketDisconnected = (socketId: string) => {
  if (!socketId) return;
  state.connectedSockets = Math.max(0, state.connectedSockets - 1);
  cleanupSocketSubscriptions(socketId);
};

export const recordTableJoin = (socketId: string, tableId: string) => {
  if (!socketId || !tableId) return;
  state.totalTableJoins += 1;
  ensureMapEntry(state.activeTables, tableId).add(socketId);
  ensureMapEntry(state.socketSubscriptions, socketId).add(tableId);
};

export const recordTableLeave = (socketId: string, tableId: string) => {
  const tableSockets = state.activeTables.get(tableId);
  if (tableSockets) {
    tableSockets.delete(socketId);
    if (tableSockets.size === 0) {
      state.activeTables.delete(tableId);
    }
  }

  const socketTables = state.socketSubscriptions.get(socketId);
  if (socketTables) {
    socketTables.delete(tableId);
    if (socketTables.size === 0) {
      state.socketSubscriptions.delete(socketId);
    }
  }
};

export const cleanupSocketSubscriptions = (socketId: string) => {
  const socketTables = state.socketSubscriptions.get(socketId);
  if (!socketTables) return;

  socketTables.forEach((tableId) => {
    const tableSockets = state.activeTables.get(tableId);
    if (!tableSockets) return;
    tableSockets.delete(socketId);
    if (tableSockets.size === 0) state.activeTables.delete(tableId);
  });

  state.socketSubscriptions.delete(socketId);
};

export const recordDiceRoll = () => {
  state.diceRollsCount += 1;
};

export const recordTokenMove = () => {
  state.tokenMovesCount += 1;
};

export const recordTokenMoveError = () => {
  state.tokenMoveErrors += 1;
  checkAlertThreshold(tokenMoveErrorTracker, TOKEN_MOVE_ERROR_ALERT_THRESHOLD, ONE_MINUTE_MS, 'tokenMoveErrors');
};

export const recordAuthFailure = () => {
  state.authFailures += 1;
  checkAlertThreshold(authFailureTracker, AUTH_FAILURE_ALERT_THRESHOLD, ONE_MINUTE_MS, 'authFailures');
};

export const getMetricsSnapshot = (): MetricsSnapshot => ({
  totalTableJoins: state.totalTableJoins,
  activeTables: state.activeTables.size,
  activeSubscriptions: [...state.activeTables.values()].reduce((acc, sockets) => acc + sockets.size, 0),
  connectedSockets: state.connectedSockets,
  diceRollsCount: state.diceRollsCount,
  tokenMovesCount: state.tokenMovesCount,
  authFailures: state.authFailures,
  tokenMoveErrors: state.tokenMoveErrors,
});

export const logMetricsSnapshot = () => {
  const snapshot = getMetricsSnapshot();
  log.debug({ metrics: snapshot }, 'Metrics snapshot');
};
