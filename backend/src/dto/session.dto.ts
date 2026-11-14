import type { PresenceEntry, SessionRole } from '../services/presenceService';

export interface UserSummaryDTO {
  _id: string;
  username: string;
}

export interface TableInfoDTO {
  _id: string;
  name: string;
  dm: UserSummaryDTO;
  players: UserSummaryDTO[];
  inviteCode: string;
  status: string;
  pauseUntil: string | null;
  activeSceneId?: string | null;
  systemId?: string | null;
  systemKey?: string | null;
  systemName?: string | null;
}

export interface InitiativeEntryDTO {
  _id: string;
  characterName: string;
  tokenId?: string;
  characterId?: string;
  isCurrentTurn: boolean;
}

export interface SceneDTO {
  _id: string;
  tableId: string;
  name: string;
  imageUrl?: string;
  gridWidth?: number;
  gridHeight?: number;
  type: string;
  metersPerSquare?: number;
}

export interface TokenDTO {
  _id: string;
  tableId: string;
  sceneId?: string;
  squareId: string;
  color: string;
  owner: UserSummaryDTO | null;
  name: string;
  imageUrl?: string;
  movement: number;
  remainingMovement: number;
  size: string;
  canOverlap: boolean;
  characterId?: string;
}

export interface MeasurementDTO {
  id?: string;
  userId: string;
  username: string;
  sceneId: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  distance: string;
  type?: 'ruler' | 'cone' | 'circle' | 'square' | 'line' | 'beam';
  affectedSquares?: string[];
  color: string;
}

export interface AuraDTO {
  id: string;
  tokenId: string;
  tableId: string;
  sceneId: string;
  ownerId: string;
  name: string;
  color: string;
  radiusMeters: number;
  difficultTerrain?: boolean;
}

export interface SessionStateDTO {
  table: TableInfoDTO;
  activeScene: SceneDTO | null;
  scenes: SceneDTO[];
  tokens: TokenDTO[];
  initiative: InitiativeEntryDTO[];
  measurements: MeasurementDTO[];
  auras: AuraDTO[];
}

// --- Protocolo realtime (Fase 1) -----------------------------------------

export type { PresenceEntry, SessionRole };

export const SESSION_PROTOCOL_VERSION = 1 as const;
export type SessionProtocolVersion = typeof SESSION_PROTOCOL_VERSION;

export interface SessionYou {
  userId: string;
  username: string;
  role: SessionRole;
  permissions: string[];
}

/** Snapshot autoritativo completo da mesa. */
export interface SessionSnapshotDTO extends SessionStateDTO {
  protocolVersion: SessionProtocolVersion;
  tableId: string;
  revision: number;
  serverNowMs: number;
  you: SessionYou;
  presence: PresenceEntry[];
}

export interface SessionStatusPatch {
  status: string;
  pauseUntil: string | null;
  serverNowMs: number;
}

export interface SessionPatchChanges {
  /** Substitui a lista inteira. */
  table?: Partial<TableInfoDTO>;
  activeScene?: SceneDTO | null;
  /** Substitui a lista inteira. */
  scenes?: SceneDTO[];
  /** Substitui a lista inteira. */
  tokens?: TokenDTO[];
  /** Merge por tokenId. */
  tokenUpdates?: Array<{ tokenId: string; patch: Partial<TokenDTO> }>;
  tokensRemoved?: string[];
  /** Substitui a lista inteira. */
  initiative?: InitiativeEntryDTO[];
  /** Substitui a lista inteira. */
  measurements?: MeasurementDTO[];
  /** Substitui a lista inteira. */
  auras?: AuraDTO[];
  sessionStatus?: SessionStatusPatch;
}

/** Alteração incremental canônica do estado da mesa. */
export interface SessionPatchDTO {
  protocolVersion: SessionProtocolVersion;
  tableId: string;
  /** Revisão depois da mudança. */
  revision: number;
  /** Revisão antes da mudança. */
  baseRevision: number;
  serverNowMs: number;
  changes: SessionPatchChanges;
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface AckErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface AckOk {
  ok: true;
  revision: number;
  serverNowMs: number;
}

export interface AckError {
  ok: false;
  error: AckErrorBody;
  revision: number;
  serverNowMs: number;
}

export type Ack = AckOk | AckError;
