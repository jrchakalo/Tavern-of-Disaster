export const tokenSizes = ['Pequeno/Médio', 'Grande', 'Enorme', 'Descomunal', 'Colossal'] as const;
export type TokenSize = typeof tokenSizes[number];

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