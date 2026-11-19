import { ITable } from '../models/Table.model';
import { IInitiativeEntry, IScene } from '../models/Scene.model';
import { IToken } from '../models/Token.model';
import { ICharacter } from '../models/Character.model';
import { Measurement, PersistentMeasurement, Aura } from '../socketHandlers/measurementStore';
import {
  AuraDTO,
  CharacterSummaryDTO,
  CharacterSummaryLite,
  InitiativeEntryDTO,
  MeasurementDTO,
  SceneDTO,
  SessionActionDTO,
  SessionStateDTO,
  TableInfoDTO,
  TokenDTO,
  UserSummaryDTO,
} from './session.dto';
import type { DiceRolledPayload } from './roll.dto';

export function mapUser(user: any): UserSummaryDTO | null {
  if (!user) return null;
  return {
    _id: user._id?.toString?.() ?? String(user._id),
    username: user.username,
  };
}

export function mapTable(table: ITable): TableInfoDTO {
  // `dm` pode vir populado como null se o usuário foi removido (ex.: limpeza de
  // teste/offboarding); não deixar a emissão de presença explodir por isso.
  const dmUser = mapUser((table as any).dm) ?? {
    _id: table.dm?.toString?.() ?? '',
    username: '',
  };
  const players = ((table as any).players ?? [])
    .map((player: any) => mapUser(player))
    .filter((player: UserSummaryDTO | null): player is UserSummaryDTO => !!player);
  const systemField = (table as any).systemId;
  const systemId = table.systemId ? table.systemId.toString?.() ?? String(table.systemId) : null;
  const systemKey = systemField && typeof systemField === 'object' && 'key' in systemField ? systemField.key : null;
  const systemName = systemField && typeof systemField === 'object' && 'name' in systemField ? systemField.name : null;
  return {
    _id: table._id.toString(),
    name: table.name,
    dm: dmUser,
    players,
    inviteCode: table.inviteCode,
    status: table.status,
    pauseUntil: table.pauseUntil ? table.pauseUntil.toISOString() : null,
    activeSceneId: table.activeScene ? table.activeScene.toString() : null,
    systemId,
    systemKey,
    systemName,
  };
}

export function mapScene(scene: IScene | (IScene & { toObject?: () => IScene })): SceneDTO {
  const plain = 'toObject' in scene && typeof (scene as any).toObject === 'function' ? (scene as any).toObject() : scene;
  return {
    _id: plain._id.toString(),
    tableId: plain.tableId.toString(),
    name: plain.name,
    imageUrl: plain.imageUrl,
    gridWidth: plain.gridWidth,
    gridHeight: plain.gridHeight,
    type: plain.type,
    metersPerSquare: plain.metersPerSquare,
  };
}

/** Recursos OP2/OPSH expostos no resumo (undefined em D&D/Cyberpunk). */
function mapCharacterVitals(stats?: ICharacter['stats']) {
  return {
    currentPD: stats?.currentPD,
    maxPD: stats?.maxPD,
    armorPoints: stats?.armorPoints,
    armorPointsMax: stats?.armorPointsMax,
    currentPE: stats?.currentPE,
    maxPE: stats?.maxPE,
    currentSAN: stats?.currentSAN,
    maxSAN: stats?.maxSAN,
  };
}

export function mapCharacterSummary(
  character: ICharacter,
  tokenId?: string | null
): CharacterSummaryDTO {
  return {
    _id: character._id.toString(),
    name: character.name,
    ownerId: character.ownerId.toString(),
    systemKey: character.systemKey,
    level: character.profile?.level,
    currentHP: character.stats?.currentHP,
    maxHP: character.stats?.maxHP,
    defense: character.stats?.defense,
    ...mapCharacterVitals(character.stats),
    tokenId: tokenId ?? null,
  };
}

export function mapCharacterSummaryLite(character: ICharacter): CharacterSummaryLite {
  return {
    _id: character._id.toString(),
    name: character.name,
    currentHP: character.stats?.currentHP,
    maxHP: character.stats?.maxHP,
    defense: character.stats?.defense,
    ...mapCharacterVitals(character.stats),
  };
}

export function mapToken(
  token: IToken & { ownerId?: any },
  character?: ICharacter | null
): TokenDTO {
  const owner = mapUser(token.ownerId);
  return {
    _id: token._id.toString(),
    tableId: token.tableId.toString(),
    sceneId: token.sceneId ? token.sceneId.toString() : undefined,
    squareId: token.squareId,
    color: token.color,
    owner,
    name: token.name,
    imageUrl: token.imageUrl,
    movement: token.movement,
    remainingMovement: token.remainingMovement,
    size: token.size,
    canOverlap: token.canOverlap,
    characterId: token.characterId ? token.characterId.toString() : null,
    character: character ? mapCharacterSummaryLite(character) : null,
  };
}

export function mapInitiativeEntry(entry: IInitiativeEntry): InitiativeEntryDTO {
  return {
    _id: entry._id.toString(),
    characterName: entry.characterName,
    tokenId: entry.tokenId ? entry.tokenId.toString() : undefined,
    characterId: entry.characterId ? entry.characterId.toString() : undefined,
    isCurrentTurn: entry.isCurrentTurn,
  };
}

export function mapMeasurement(measurement: Measurement | PersistentMeasurement): MeasurementDTO {
  return {
    id: (measurement as PersistentMeasurement).id,
    userId: measurement.userId,
    username: measurement.username,
    sceneId: measurement.sceneId,
    start: measurement.start,
    end: measurement.end,
    distance: measurement.distance,
    type: measurement.type,
    affectedSquares: measurement.affectedSquares,
    color: measurement.color,
  };
}

export function mapAura(aura: Aura): AuraDTO {
  return {
    id: aura.id,
    tokenId: aura.tokenId,
    tableId: aura.tableId,
    sceneId: aura.sceneId,
    ownerId: aura.ownerId,
    name: aura.name,
    color: aura.color,
    radiusMeters: aura.radiusMeters,
    difficultTerrain: aura.difficultTerrain,
  };
}

export function buildSessionState(
  table: ITable,
  activeScene: IScene | null,
  scenes: IScene[],
  tokens: (IToken & { ownerId?: any })[],
  initiative: IInitiativeEntry[],
  measurements: Array<Measurement | PersistentMeasurement>,
  auras: Aura[],
  characters: CharacterSummaryDTO[] = [],
  recentRolls: DiceRolledPayload[] = [],
  recentActions: SessionActionDTO[] = [],
  characterByTokenId: Map<string, ICharacter> = new Map(),
): SessionStateDTO {
  return {
    table: mapTable(table),
    activeScene: activeScene ? mapScene(activeScene) : null,
    scenes: scenes.map(mapScene),
    tokens: tokens.map((token) => mapToken(token, characterByTokenId.get(token._id.toString()) ?? null)),
    initiative: initiative.map(mapInitiativeEntry),
    measurements: measurements.map(mapMeasurement),
    auras: auras.map(mapAura),
    characters,
    recentRolls,
    recentActions,
  };
}
