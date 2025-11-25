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
