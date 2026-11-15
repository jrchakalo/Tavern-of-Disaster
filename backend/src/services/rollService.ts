import type { FilterQuery } from 'mongoose';
import Roll, { IRoll } from '../models/Roll.model';
import type { DiceRolledPayload } from '../dto/roll.dto';

/** Teto do log exposto no snapshot e no REST (por página). */
export const ROLL_LOG_LIMIT = 50;
export const ROLL_LOG_RETENTION_DAYS = 7;

type LeanRoll = Omit<IRoll, 'userId'> & {
  userId: { _id?: unknown; username?: string } | unknown;
};

type ListRollsOptions = {
  limit?: number;
  before?: string;
  /** Revisão usada quando o documento antigo não persistiu a própria. */
  fallbackRevision?: number;
};

function normalizeLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return ROLL_LOG_LIMIT;
  return Math.min(Math.max(Math.trunc(limit as number), 1), ROLL_LOG_LIMIT);
}

export function mapRollToPayload(roll: LeanRoll, fallbackRevision = 0): DiceRolledPayload {
  const rawUser = roll.userId as { _id?: unknown; username?: string } | undefined;
  const populated = rawUser && typeof rawUser === 'object' && 'username' in rawUser;
  const userId = populated ? String(rawUser!._id) : String(rawUser ?? '');
  return {
    id: roll._id ? roll._id.toString() : undefined,
    expression: roll.expression,
    rolls: (roll.rolls ?? []).map((item) => ({
      die: item.die,
      value: item.value,
      kept: item.kept,
      ...(item.explosions ? { explosions: item.explosions } : {}),
    })),
    modifier: roll.modifier ?? 0,
    total: roll.total,
    metadata: roll.metadata,
    tableId: roll.tableId.toString(),
    userId,
    username: populated ? rawUser!.username ?? '' : '',
    tokenId: roll.tokenId ? roll.tokenId.toString() : undefined,
    characterId: roll.characterId ? roll.characterId.toString() : undefined,
    tags: roll.tags ?? [],
    createdAt: new Date(roll.createdAt).toISOString(),
    revision: roll.revision ?? fallbackRevision,
  };
}

/** Histórico da mesa: mais recente primeiro, com paginação por cursor (`before`). */
export async function listTableRolls(
  tableId: string,
  options: ListRollsOptions = {}
): Promise<DiceRolledPayload[]> {
  const filter: FilterQuery<IRoll> = { tableId };
  if (options.before) {
    const beforeDate = new Date(options.before);
    if (!Number.isNaN(beforeDate.getTime())) {
      filter.createdAt = { $lt: beforeDate };
    }
  }
  const rolls = await Roll.find(filter)
    .sort({ createdAt: -1 })
    .limit(normalizeLimit(options.limit))
    .populate('userId', 'username')
    .lean();
  return rolls.map((roll) => mapRollToPayload(roll as unknown as LeanRoll, options.fallbackRevision ?? 0));
}
