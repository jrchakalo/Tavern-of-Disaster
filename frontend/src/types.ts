export interface TokenInfo {
  _id: string;
  squareId: string;
  color: string;
  ownerSocketId: string;
}

export interface GridSquare {
  id: string;
  token?: TokenInfo | null;
}