import { Server } from 'socket.io';
import { getTableById } from './tableService';
import { getSceneWithTokens } from './sceneService';
import { listSceneAuras, listScenePersistents } from './measurementService';
import {
  buildSessionState as assembleSessionState,
  mapInitiativeEntry,
  mapScene,
  mapToken,
  mapTable,
  mapMeasurement,
  mapAura,
} from '../dto/sessionAssembler';
import { getRevision } from './revisionService';
import { isDisplayUserId, listPresence, PresenceEntry, SessionRole } from './presenceService';
import {
  InitiativeEntryDTO,
  SceneDTO,
  SESSION_PROTOCOL_VERSION,
  SessionPatchChanges,
  SessionSnapshotDTO,
  SessionStateDTO,
  TableInfoDTO,
  TokenDTO,
  UserSummaryDTO,
  AuraDTO,
  MeasurementDTO,
} from '../dto/session.dto';
import { IScene } from '../models/Scene.model';
import { ITable } from '../models/Table.model';
import { Measurement, PersistentMeasurement, Aura } from '../socketHandlers/measurementStore';

const DM_PERMISSIONS = [
  'session:write',
  'scene:write',
  'token:place',
  'token:move:any',
  'initiative:write',
  'measure:write',
  'dice:roll',
];

const PLAYER_PERMISSIONS = [
  'token:move:own',
  'initiative:advance:own',
  'measure:write',
  'dice:roll',
];

export type SessionStateBundle = {
  state: SessionStateDTO;
  table: ITable;
  tableInfo: TableInfoDTO;
  activeScene: IScene | null;
};

/**
 * Monta o estado completo da sessão a partir da mesa ativa.
 * Retorna null quando a mesa não existe.
 */
export async function loadSessionState(tableId: string): Promise<SessionStateBundle | null> {
  const table = await getTableById(tableId, [
    { path: 'activeScene' },
    { path: 'scenes' },
    { path: 'players', select: 'username _id' },
    { path: 'dm', select: 'username _id' },
  ]);
  if (!table) return null;
  const tableDoc = table as ITable;
  const activeSceneId = (tableDoc.activeScene as any)?._id?.toString?.() ?? tableDoc.activeScene?.toString?.();
  const { activeScene, tokens } = activeSceneId
    ? await getSceneWithTokens(activeSceneId)
    : { activeScene: null, tokens: [] as any[] };
  const initiative = activeScene?.initiative ?? [];
  const measurements = activeSceneId ? listScenePersistents(tableId, activeSceneId) : [];
  const auras = activeSceneId ? listSceneAuras(tableId, activeSceneId) : [];
  const scenes = Array.isArray(tableDoc.scenes) ? (tableDoc.scenes as any) : [];
  const state = assembleSessionState(
    tableDoc,
    activeScene as any,
    scenes,
    tokens as any,
    initiative as any,
    measurements as any,
    auras as any
  );
  return {
    state,
    table: tableDoc,
    tableInfo: mapTable(tableDoc),
    activeScene: (activeScene as IScene | null) ?? null,
  };
}

export function resolveRole(table: TableInfoDTO, userId: string): SessionRole {
  // O id sintético da TV nunca é membro real; força DISPLAY (nunca DM/PLAYER).
  if (isDisplayUserId(userId)) return 'DISPLAY';
  const dmId = table.dm?._id?.toString();
  if (dmId === userId) return 'DM';
  if (table.players?.some((player) => player._id?.toString() === userId)) return 'PLAYER';
  return 'SPECTATOR';
}

export function permissionsForRole(role: SessionRole): string[] {
  if (role === 'DM') return [...DM_PERMISSIONS];
  if (role === 'PLAYER') return [...PLAYER_PERMISSIONS];
  return [];
}

export function buildPresence(table: TableInfoDTO, tableId: string): PresenceEntry[] {
  return listPresence(tableId, (userId) => resolveRole(table, userId));
}

/** Snapshot autoritativo para UM usuário/socket. */
export async function buildSessionSnapshot(
  tableId: string,
  userId: string,
  username: string,
  options: { roleOverride?: SessionRole } = {}
): Promise<SessionSnapshotDTO | null> {
  const bundle = await loadSessionState(tableId);
  if (!bundle) return null;
  const revision = await getRevision(tableId);
  const role = options.roleOverride ?? resolveRole(bundle.tableInfo, userId);
  return {
    protocolVersion: SESSION_PROTOCOL_VERSION,
    tableId,
    revision,
    serverNowMs: Date.now(),
    you: {
      userId,
      username,
      role,
      permissions: permissionsForRole(role),
    },
    presence: buildPresence(bundle.tableInfo, tableId),
    ...bundle.state,
  };
}

/** Emite um patch canônico para a sala inteira (inclui o autor da ação). */
export function emitSessionPatch(
  io: Server,
  tableId: string,
  revision: number,
  changes: SessionPatchChanges
): void {
  io.to(tableId).emit('sessionPatch', {
    protocolVersion: SESSION_PROTOCOL_VERSION,
    tableId,
    revision,
    baseRevision: Math.max(0, revision - 1),
    serverNowMs: Date.now(),
    changes,
  });
}

/** Emite presença atualizada para a sala. */
export function sendPresenceUpdated(
  io: Server,
  tableId: string,
  table: TableInfoDTO,
  revision: number
): PresenceEntry[] {
  const presence = buildPresence(table, tableId);
  io.to(tableId).emit('presenceUpdated', { tableId, presence, revision });
  return presence;
}

// --- Helpers de slices para patches ---------------------------------------

export async function getScenesForTable(tableId: string): Promise<SceneDTO[]> {
  const table = await getTableById(tableId, [{ path: 'scenes' }]);
  const scenes = table && Array.isArray(table.scenes) ? (table.scenes as any[]) : [];
  return scenes.map((scene) => mapScene(scene));
}

export async function getTokensForScene(sceneId: string): Promise<TokenDTO[]> {
  const { tokens } = await getSceneWithTokens(sceneId);
  return (tokens as any[]).map((token) => mapToken(token));
}

export function getInitiativeDTO(scene: IScene | null | undefined): InitiativeEntryDTO[] {
  if (!scene) return [];
  return scene.initiative.map(mapInitiativeEntry);
}

export function getMeasurementsDTO(tableId: string, sceneId: string): MeasurementDTO[] {
  return listScenePersistents(tableId, sceneId).map((item) =>
    mapMeasurement(item as Measurement | PersistentMeasurement)
  );
}

export function getAurasDTO(tableId: string, sceneId: string): AuraDTO[] {
  return listSceneAuras(tableId, sceneId).map((item) => mapAura(item as Aura));
}

export function getTableInfo(table: ITable): TableInfoDTO {
  return mapTable(table);
}

export function getUserSummary(user: any): UserSummaryDTO | null {
  if (!user) return null;
  return {
    _id: user._id?.toString?.() ?? String(user._id),
    username: user.username ?? '',
  };
}
