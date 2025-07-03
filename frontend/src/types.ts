export interface TokenInfo {
  _id: string;
  squareId: string;
  color: string;
  ownerId: TokenOwner;
  name: string; 
  imageUrl?: string; 
  sceneId: string;
  movement: number;
  remainingMovement: number;
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
  activeScene?: string | null | undefined;
}

export interface PlayerInfo {
  _id: string;
  username: string;
}

export interface IInitiativeEntry {
  _id: string;
  characterName: string;
  tokenId?: string;
  isCurrentTurn: boolean;
}

export interface IScene {
  _id: string; 
  tableId: string;
  name: string;
  imageUrl?: string;
  gridSize?: number; // Tamanho da grade, se necessário
  type?: 'battlemap' | 'image';
  initiative: IInitiativeEntry[];
}