import type { DiceRolledPayload, LogEntry, SingleDieRoll } from '../../types';

/** Linha do ticker de rolagens da TV (últimas 3, sem log duplicado). */
export interface TickerRoll {
  id: string;
  actor: string;
  expression: string;
  detail: string;
  total: string;
}

function diceDetail(rolls: SingleDieRoll[] | undefined): string {
  if (!rolls?.length) return '';
  return rolls
    .map((roll) => (roll.kept === 'dropped' ? `(${roll.value})` : `${roll.value}`))
    .join(' · ');
}

function parseLogContent(content: string): { expression: string; detail: string; total: string } {
  const totalMatch = content.match(/=\s*(-?\d+)\s*$/);
  const detailMatch = content.match(/\[([^\]]*)\]/);
  const expression = content.replace(/\s*→.*$/, '').trim();
  return {
    expression: expression || content,
    detail: detailMatch?.[1]?.trim() ?? '',
    total: totalMatch?.[1] ?? '—',
  };
}

/**
 * Converte o log mesclado (snapshot `recentRolls` + `logs` ao vivo) em no
 * máximo 3 linhas de ticker. Quando o `raw` é um `diceRolled`, usa os dados
 * estruturados; quando não, lê a própria linha do log.
 */
export function tickerRollsFromLogs(logs: LogEntry[], limit = 3): TickerRoll[] {
  const rollLogs = logs.filter((entry) => entry.type === 'roll');
  return rollLogs
    .slice(-limit)
    .reverse()
    .map((entry) => {
      const raw = entry.raw as Partial<DiceRolledPayload> | undefined;
      if (raw && typeof raw.expression === 'string') {
        return {
          id: entry.id,
          actor: raw.username || entry.authorName || 'Mesa',
          expression: raw.expression,
          detail: diceDetail(raw.rolls),
          total: String(raw.total ?? '—'),
        };
      }
      const parsed = parseLogContent(entry.content);
      return {
        id: entry.id,
        actor: entry.authorName || 'Mesa',
        expression: parsed.expression,
        detail: parsed.detail,
        total: parsed.total,
      };
    });
}
