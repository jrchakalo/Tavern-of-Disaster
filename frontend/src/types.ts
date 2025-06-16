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