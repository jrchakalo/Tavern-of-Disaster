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

export interface CharacterDTO {
  _id: string;
  ownerId: string;
  tableId: string;
  name: string;
  avatarUrl?: string;
  attributes?: Record<string, number>;
  stats?: CharacterStats;
  skills?: Record<string, number | string>;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type Character = CharacterDTO;

// Session DTOs espelhados do backend
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
}

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