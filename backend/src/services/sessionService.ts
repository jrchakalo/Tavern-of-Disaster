import { Server } from 'socket.io';
import { getTableById } from './tableService';
import { getSceneWithTokens } from './sceneService';
import { listSceneAuras, listScenePersistents } from './measurementService';
import {
  buildSessionState as assembleSessionState,
  mapCharacterSummary,
  mapInitiativeEntry,
  mapScene,
  mapToken,
  mapTable,
  mapMeasurement,
  mapAura,
} from '../dto/sessionAssembler';
import { listTableRolls, ROLL_LOG_LIMIT } from './rollService';
import Character, { ICharacter } from '../models/Character.model';
import Token from '../models/Token.model';
import { getRevision } from './revisionService';
import { isDisplayUserId, listPresence, PresenceEntry, SessionRole } from './presenceService';
import {
  CharacterSummaryDTO,
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

  const characterDocs = await Character.find({ tableId: tableDoc._id }).sort({ createdAt: 1 });
  const tokenLinks = await Token.find({ tableId: tableDoc._id, characterId: { $ne: null } }).select(
    '_id characterId'
  );
  const characters = buildCharacterSummaries(characterDocs, tokenLinks);
  const characterByTokenId = buildCharacterByTokenId(tokens as any[], characterDocs);

  const recentRolls = await listTableRolls(tableId, {
    limit: ROLL_LOG_LIMIT,
    fallbackRevision: tableDoc.revision ?? 0,
  });

  const state = assembleSessionState(
    tableDoc,
    activeScene as any,
    scenes,
    tokens as any,
    initiative as any,
    measurements as any,
    auras as any,
    characters,
    recentRolls,
    characterByTokenId
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

type TokenLink = { _id: any; characterId?: any };

function buildCharacterSummaries(characterDocs: ICharacter[], tokenLinks: TokenLink[]): CharacterSummaryDTO[] {
  const tokenIdByCharacter = new Map<string, string>();
  tokenLinks.forEach((token) => {
    if (!token.characterId) return;
    tokenIdByCharacter.set(token.characterId.toString(), token._id.toString());
  });
  return characterDocs.map((character) =>
    mapCharacterSummary(character, tokenIdByCharacter.get(character._id.toString()) ?? null)
  );
}

function buildCharacterByTokenId(tokens: TokenLink[], characterDocs: ICharacter[]): Map<string, ICharacter> {
  const characterById = new Map(characterDocs.map((character) => [character._id.toString(), character]));
  const byTokenId = new Map<string, ICharacter>();
  tokens.forEach((token) => {
    if (!token.characterId) return;
    const character = characterById.get(token.characterId.toString());
    if (character) byTokenId.set(token._id.toString(), character);
  });
  return byTokenId;
}

/** Resumos de ficha da mesa (o que a TV e os outros jogadores podem ver). */
export async function getCharacterSummariesForTable(tableId: string): Promise<CharacterSummaryDTO[]> {
  const [characterDocs, tokenLinks] = await Promise.all([
    Character.find({ tableId }).sort({ createdAt: 1 }),
    Token.find({ tableId, characterId: { $ne: null } }).select('_id characterId'),
  ]);
  return buildCharacterSummaries(characterDocs, tokenLinks);
}

export async function getTokensForScene(sceneId: string): Promise<TokenDTO[]> {
  const { tokens } = await getSceneWithTokens(sceneId);
  const characterIds = (tokens as any[])
    .map((token) => token.characterId?.toString())
    .filter((value: string | undefined): value is string => !!value);
  const characterDocs = characterIds.length
    ? await Character.find({ _id: { $in: Array.from(new Set(characterIds)) } })
    : [];
  const characterByTokenId = buildCharacterByTokenId(tokens as any[], characterDocs);
  return (tokens as any[]).map((token) => mapToken(token, characterByTokenId.get(token._id.toString()) ?? null));
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
