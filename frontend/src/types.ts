export const tokenSizes = ['Pequeno/Médio', 'Grande', 'Enorme', 'Descomunal', 'Colossal'] as const;
export type TokenSize = typeof tokenSizes[number];

export type KeptFlag = 'kept' | 'dropped';

export type AttributeType = 'number' | 'text' | 'boolean';
export type DiagonalRule = '5-10-5' | '5' | 'euclidean';

export interface SystemDTO {
  _id: string;
  key: string;
  name: string;
  description?: string;
  defaultAttributes?: Array<{
    key: string;
    label: string;
    type: AttributeType;
  }>;
  movementRules?: {
    baseSpeedFeet?: number;
    diagonalRule?: DiagonalRule;
    gridSizeFeet?: number;
  };
  dicePresets?: Array<{
    key: string;
    label: string;
    expression: string;
    category?: string;
  }>;
  docsUrl?: string | null;
}

export interface SingleDieRoll {
  die: number;
  value: number;
  kept: KeptFlag;
}

export interface TokenInfo {
  _id: string;
  tableId?: string;
  squareId: string;
  color: string;
  ownerId?: TokenOwner | null;
  name: string; 
  imageUrl?: string; 
  sceneId: string;
  movement: number;
  remainingMovement: number;
  size: TokenSize;
  canOverlap?: boolean;
  characterId?: string | null;
}

export interface TokenOwner {
    _id: string;
    username: string;
}

export interface GridSquare {
  id: string;
  token?: TokenInfo | null;
}

export interface ITable {
  _id: string;
  name: string;
  dm: PlayerInfo;
  players: PlayerInfo[];
  inviteCode: string;
  activeSceneId?: string | null | undefined;
  status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED';
  pauseUntil?: string | null;
  systemId?: string | null;
  systemKey?: string | null;
  systemName?: string | null;
}

export interface PlayerInfo {
  _id: string;
  username: string;
}

export interface IInitiativeEntry {
  _id: string;
  characterName: string;
  tokenId?: string;
  characterId?: string;
  isCurrentTurn: boolean;
}

export interface IScene {
  _id: string; 
  tableId: string;
  name: string;
  imageUrl?: string;
  gridWidth?: number; // Número de colunas (largura) da grade
  gridHeight?: number; // Número de linhas (altura) da grade
  type?: 'battlemap' | 'image';
  initiative?: IInitiativeEntry[];
  metersPerSquare?: number;
}

// Auras persistentes ancoradas a tokens
export interface AuraInfo {
  id: string; // normalmente igual ao tokenId
  tokenId: string;
  sceneId: string;
  tableId: string;
  name: string;
  color: string;
  radiusMeters: number;
  ownerId: string; // dono do token (ou de quem criou)
  difficultTerrain?: boolean;
}

export interface CharacterStats {
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  baseInitiative?: number;
}

export interface CharacterProfile {
  className?: string;
  level?: number;
  race?: string;
  background?: string;
  alignment?: string;
  speed?: number;
  hitDice?: string;
}

export interface CharacterAttack {
  name: string;
  bonus?: string;
  damage?: string;
  notes?: string;
}

export interface CharacterFeature {
  name: string;
  description?: string;
}

export interface CharacterInventoryItem {
  name: string;
  quantity?: number;
  notes?: string;
}

export interface CharacterSpellSlot {
  used?: number;
  max?: number;
}

export interface CharacterDTO {
  _id: string;
  ownerId: string;
  tableId: string;
  name: string;
  avatarUrl?: string;
  systemKey?: string;
  profile?: CharacterProfile;
  attributes?: Record<string, number>;
  stats?: CharacterStats;
  skills?: Record<string, number | string>;
  proficientSaves?: string[];
  proficientSkills?: string[];
  expertiseSkills?: string[];
  attacks?: CharacterAttack[];
  features?: CharacterFeature[];
  inventory?: CharacterInventoryItem[];
  spellSlots?: Record<string, CharacterSpellSlot>;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CharacterSummaryDTO {
  _id: string;
  name: string;
  ownerId: string;
  systemKey?: string;
  level?: number;
  currentHP?: number;
  maxHP?: number;
  defense?: number;
  tokenId?: string | null;
}

export interface CharacterSummaryLite {
  _id: string;
  name: string;
  currentHP?: number;
  maxHP?: number;
  defense?: number;
}

export interface CharacterUpdateDTO {
  characterId: string;
  patch: Partial<CharacterSummaryDTO>;
}

export type Character = CharacterDTO;

// Session DTOs espelhados do backend
export interface UserSummaryDTO {
  _id: string;
  username: string;
}

export interface UserProfileDTO {
  _id: string;
  username: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  preferredSystemId?: string | null;
  measurementColor?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TableInfoDTO {
  _id: string;
  name: string;
  dm: UserSummaryDTO;
  players: UserSummaryDTO[];
  inviteCode: string;
  status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED';
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
  size: TokenSize;
  canOverlap: boolean;
  characterId?: string;
  character?: CharacterSummaryLite | null;
}

export interface TokenTemplateDTO {
  _id: string;
  ownerId: string;
  systemId?: string | null;
  name: string;
  imageUrl?: string;
  size?: TokenSize;
  color?: string;
  tags?: string[];
  baseMovement?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SceneTemplateDTO {
  _id: string;
  ownerId: string;
  systemId?: string | null;
  name: string;
  mapUrl: string;
  gridWidth?: number;
  gridHeight?: number;
  type?: 'battlemap' | 'image';
  defaultMetersPerSquare?: number;
  createdAt?: string;
  updatedAt?: string;
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

export interface RollDiceParams {
  tableId: string;
  expression: string;
  tokenId?: string;
  characterId?: string;
  tags?: string[];
  metadata?: string;
}

export interface DiceRolledPayload {
  tableId: string;
  expression: string;
  rolls: SingleDieRoll[];
  modifier: number;
  total: number;
  metadata?: string;
  userId: string;
  username: string;
  tokenId?: string;
  characterId?: string;
  tags?: string[];
  createdAt: string;
  revision?: number;
}

export type RollLogEntryDTO = DiceRolledPayload;

export type LogEntryType = 'roll' | 'system' | 'movement' | 'chat';

export interface LogEntry {
  id: string;
  type: LogEntryType;
  authorId?: string;
  authorName?: string;
  createdAt: string;
  content: string;
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Contrato realtime (docs/REALTIME_PROTOCOL.md, protocolVersion: 1)
// ---------------------------------------------------------------------------

export type SessionRole = 'DM' | 'PLAYER' | 'DISPLAY' | 'SPECTATOR';

export interface SessionYou {
  userId: string;
  username: string;
  role: SessionRole;
  permissions: string[];
}

export interface PresenceEntry {
  userId: string;
  username: string;
  role: SessionRole;
  socketCount: number;
}

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface AckOk {
  ok: true;
  revision: number;
  serverNowMs: number;
}

export interface AckError {
  ok: false;
  error: {
    code: ErrorCode;
    /** pt-BR, pronta para toast. */
    message: string;
    /** Nunca inclui segredo. */
    details?: unknown;
  };
  revision: number;
  serverNowMs: number;
}

export type Ack = AckOk | AckError;

export interface SessionSnapshot {
  protocolVersion: 1;
  tableId: string;
  revision: number;
  serverNowMs: number;
  you: SessionYou;
  presence: PresenceEntry[];
  table: TableInfoDTO;
  activeScene: SceneDTO | null;
  scenes: SceneDTO[];
  tokens: TokenDTO[];
  initiative: InitiativeEntryDTO[];
  measurements: MeasurementDTO[];
  auras: AuraDTO[];
  characters?: CharacterSummaryDTO[];
  recentRolls?: RollLogEntryDTO[];
}

export interface TokenUpdateDTO {
  tokenId: string;
  patch: Partial<TokenDTO>;
}

export interface SessionStatusChangeDTO {
  status: string;
  pauseUntil: string | null;
  serverNowMs: number;
}

export interface SessionPatchChanges {
  table?: Partial<TableInfoDTO>;
  activeScene?: SceneDTO | null;
  scenes?: SceneDTO[];
  /** Substitui a lista inteira. */
  tokens?: TokenDTO[];
  /** Merge por tokenId. */
  tokenUpdates?: TokenUpdateDTO[];
  /** Remove por tokenId. */
  tokensRemoved?: string[];
  /** Substitui a lista inteira. */
  initiative?: InitiativeEntryDTO[];
  /** Substitui a lista inteira. */
  measurements?: MeasurementDTO[];
  /** Substitui a lista inteira. */
  auras?: AuraDTO[];
  sessionStatus?: SessionStatusChangeDTO;
  /** Substitui a lista inteira. */
  characters?: CharacterSummaryDTO[];
  /** Merge por characterId. */
  characterUpdates?: CharacterUpdateDTO[];
  /** Remove por characterId. */
  charactersRemoved?: string[];
  /** Substitui a lista inteira (máx. 50). */
  recentRolls?: RollLogEntryDTO[];
}

export interface SessionPatch {
  protocolVersion: 1;
  tableId: string;
  /** Revisão depois da mudança. */
  revision: number;
  /** Revisão antes da mudança. */
  baseRevision: number;
  serverNowMs: number;
  changes: SessionPatchChanges;
}