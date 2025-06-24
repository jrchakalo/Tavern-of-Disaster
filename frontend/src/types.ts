export interface TokenInfo {
  _id: string;
  squareId: string;
  color: string;
  ownerSocketId: string;
  name: string; 
  imageUrl?: string; 
}

export interface GridSquare {
  id: string;
  token?: TokenInfo | null;
}

export interface ITable {
  _id: string;
  name: string;
  dm: string; // Apenas o ID como string
  players: string[];
  inviteCode: string;
  activeScene?: string | null | undefined;
}

export interface IScene {
  _id: string; 
  tableId: string;
  name: string;
  imageUrl?: string;
}