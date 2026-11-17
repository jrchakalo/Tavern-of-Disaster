import type { SingleDieRoll } from '../services/diceService';
import type { StepDiceRole, StepRollDetails } from '../services/stepDiceService';
import type { TableRollResult } from '../services/opTableService';

export type RollKind = 'expression' | 'step' | 'table';

/** Payload de rolagem transmitido ao vivo e no histórico (`recentRolls`). */
export interface DiceRolledPayload {
  expression: string;
  rolls: Array<SingleDieRoll & { role?: StepDiceRole }>;
  modifier: number;
  total: number;
  metadata?: string;
  /** Motor da rolagem; ausente em clientes/documentos antigos. */
  kind?: RollKind;
  /** Detalhes do teste de passo (OP2), quando `kind === 'step'`. */
  step?: StepRollDetails;
  /** Resultado de tabela (OP2), quando `kind === 'table'`. */
  tableResult?: TableRollResult;
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
