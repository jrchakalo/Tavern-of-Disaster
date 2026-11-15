import type { DiceRollResult } from '../services/diceService';

/** Payload de rolagem transmitido ao vivo e no histórico (`recentRolls`). */
export interface DiceRolledPayload extends DiceRollResult {
  /** ID persistido; ausente no broadcast ao vivo (a rolagem ainda está sendo gravada). */
  id?: string;
  tableId: string;
  userId: string;
  username: string;
  tokenId?: string;
  characterId?: string;
  tags?: string[];
  createdAt: string;
  revision: number;
}
