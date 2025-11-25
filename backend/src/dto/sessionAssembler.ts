import { ITable } from '../models/Table.model';
import { IInitiativeEntry, IScene } from '../models/Scene.model';
import { IToken } from '../models/Token.model';
import { Measurement, PersistentMeasurement, Aura } from '../socketHandlers/measurementStore';
import {
  AuraDTO,
  InitiativeEntryDTO,
  MeasurementDTO,
  SceneDTO,
  SessionStateDTO,
  TableInfoDTO,
  TokenDTO,
  UserSummaryDTO,
} from './session.dto';

function mapUser(user: any): UserSummaryDTO | null {
  if (!user) return null;
  return {
    _id: user._id?.toString?.() ?? String(user._id),
    username: user.username,
  };
}

function mapTable(table: ITable): TableInfoDTO {
  const dmUser = mapUser((table as any).dm) ?? { _id: table.dm.toString(), username: '' };
  const players = ((table as any).players ?? [])
    .map((player: any) => mapUser(player))
    .filter((player: UserSummaryDTO | null): player is UserSummaryDTO => !!player);
  return {
    _id: table._id.toString(),
    name: table.name,
    dm: dmUser,
    players,
    inviteCode: table.inviteCode,
    status: table.status,
    pauseUntil: table.pauseUntil ? table.pauseUntil.toISOString() : null,
    activeSceneId: table.activeScene ? table.activeScene.toString() : null,
  };
}

function mapScene(scene: IScene | (IScene & { toObject?: () => IScene })): SceneDTO {
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

function mapToken(token: IToken & { ownerId?: any }): TokenDTO {
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
  };
}

function mapInitiativeEntry(entry: IInitiativeEntry): InitiativeEntryDTO {
  return {
    _id: entry._id.toString(),
    characterName: entry.characterName,
    tokenId: entry.tokenId ? entry.tokenId.toString() : undefined,
    isCurrentTurn: entry.isCurrentTurn,
  };
}

function mapMeasurement(measurement: Measurement | PersistentMeasurement): MeasurementDTO {
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

function mapAura(aura: Aura): AuraDTO {
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
): SessionStateDTO {
  return {
    table: mapTable(table),
    activeScene: activeScene ? mapScene(activeScene) : null,
    scenes: scenes.map(mapScene),
    tokens: tokens.map(mapToken),
    initiative: initiative.map(mapInitiativeEntry),
    measurements: measurements.map(mapMeasurement),
    auras: auras.map(mapAura),
  };
}
