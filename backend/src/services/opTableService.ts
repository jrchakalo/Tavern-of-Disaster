import { ServiceError } from './serviceErrors';

export type OpTableKey = 'lesao' | 'trauma' | 'falha-critica';

export interface TableRollInput {
  table: OpTableKey;
  /** Ex.: +1 por patamar acima de iniciante. */
  modifier?: number;
}

export interface TableRollResult {
  kind: 'table';
  table: OpTableKey;
  die: number;
  /** Resultado bruto do dado, antes do modificador de patamar. */
  roll: number;
  key: string;
  summary: string;
  expression: string;
  modifier: number;
}

type TableBand = {
  min: number;
  /** `null` = sem teto (banda "20+"). */
  max: number | null;
  key: string;
  summary: string;
};

const TABLE_LABELS: Record<OpTableKey, string> = {
  lesao: 'Lesão',
  trauma: 'Trauma',
  'falha-critica': 'Falha crítica',
};

/** Resumos mecânicos das tabelas do Beta (docs/ORDEM_PARANORMAL.md §3.6). */
export const OP_TABLES: Record<OpTableKey, TableBand[]> = {
  lesao: [
    { min: 1, max: 4, key: 'morte-subita', summary: 'Morte súbita: o personagem morre; crie um novo personagem.' },
    { min: 5, max: 9, key: 'morte-lenta', summary: 'Morte lenta: age uma última rodada e morre ao fim dela.' },
    { min: 10, max: 10, key: 'laceracao-profunda', summary: 'Laceração profunda: perde 2 PV (acumula a cada vez).' },
    { min: 11, max: 11, key: 'sem-olho', summary: 'Sem olho: −1 em Percepção e Pontaria.' },
    { min: 12, max: 12, key: 'sem-mao', summary: 'Sem mão: empunha apenas um item; tarefas de duas mãos são penalizadas.' },
    { min: 13, max: 13, key: 'sem-pe', summary: 'Sem pé: duas reduções de passo em movimento e perseguição a pé.' },
    { min: 14, max: 14, key: 'tendao-comprometido', summary: 'Tendão comprometido: −2 em Acrobacia.' },
    { min: 15, max: 15, key: 'musculo-comprometido', summary: 'Músculo comprometido: −2 em Atletismo.' },
    { min: 16, max: 16, key: 'orgao-interno-comprometido', summary: 'Órgão interno comprometido: −2 em Vigor.' },
    { min: 17, max: 17, key: 'orgao-sensorial-comprometido', summary: 'Órgão sensorial comprometido: −2 em Percepção.' },
    { min: 18, max: 18, key: 'cicatriz-assustadora', summary: 'Cicatriz assustadora: −2 em Persuasão e +1 em Intimidar.' },
    { min: 19, max: 19, key: 'contusao', summary: 'Contusão: Físico reduzido em um passo até o fim da cena.' },
    { min: 20, max: null, key: 'surto-adrenalina', summary: 'Surto de adrenalina: recupera 1 PV.' },
  ],
  trauma: [
    { min: 1, max: 4, key: 'colapso-total', summary: 'Colapso total: a mente sucumbe; crie um novo personagem.' },
    { min: 5, max: 6, key: 'tept', summary: 'TEPT: +1 de dano emocional sempre que sofrer dano emocional.' },
    { min: 7, max: 8, key: 'degradacao-cognitiva', summary: 'Degradação cognitiva: −1 em Mente.' },
    { min: 9, max: 10, key: 'macula-psiquica', summary: 'Mácula psíquica: −1 em Emoção.' },
    { min: 11, max: 12, key: 'chaga-da-alma', summary: 'Chaga da alma: perde 2 PD.' },
    { min: 13, max: 14, key: 'retracao-defensiva', summary: 'Retração defensiva: −2 em Persuasão e Intuição.' },
    { min: 15, max: 17, key: 'panico', summary: 'Pânico: recebe um dado de pavor.' },
    { min: 18, max: 19, key: 'estupor', summary: 'Estupor catatônico: perde a ação na próxima rodada.' },
    { min: 20, max: null, key: 'injecao-animo', summary: 'Injeção de ânimo: recupera 1 PD.' },
  ],
  'falha-critica': [
    { min: 1, max: 1, key: 'vexame', summary: 'Vexame: descreva a ação de forma vergonhosa; sem efeito mecânico adicional.' },
    { min: 2, max: 2, key: 'fisico-1-passo', summary: 'Machucado: Físico reduzido em um passo até o fim da cena.' },
    { min: 3, max: 3, key: 'mente-1-passo', summary: 'Desatenção: Mente reduzida em um passo até o fim da cena.' },
    { min: 4, max: 4, key: 'emocao-1-passo', summary: 'Irritação: Emoção reduzida em um passo até o fim da cena.' },
    { min: 5, max: 5, key: 'perde-1d4-pv', summary: 'Acidente: perde 1d4 PV.' },
    { min: 6, max: 6, key: 'perde-1d4-pd', summary: 'Frustração: perde 1d4 PD.' },
    { min: 7, max: 7, key: 'perde-item', summary: 'Perda: perde um item carregado ou um espaço de compra.' },
    { min: 8, max: null, key: 'sem-efeito', summary: 'Nenhum efeito adicional.' },
  ],
};

const TABLE_DICE: Record<OpTableKey, number> = {
  lesao: 20,
  trauma: 20,
  'falha-critica': 8,
};

export const OP_TABLE_MODIFIER_MIN = -10;
export const OP_TABLE_MODIFIER_MAX = 10;

function assertTable(value: unknown): asserts value is OpTableKey {
  if (value !== 'lesao' && value !== 'trauma' && value !== 'falha-critica') {
    throw new ServiceError('Tabela inválida. Use lesao, trauma ou falha-critica.');
  }
}

function rollDie(die: number, rng: () => number): number {
  const raw = rng();
  const normalized = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999999) : 0;
  return Math.floor(normalized * die) + 1;
}

function findBand(bands: TableBand[], value: number): TableBand {
  const band = bands.find(
    (candidate) => value >= candidate.min && (candidate.max === null || value <= candidate.max)
  );
  if (!band) {
    throw new ServiceError('Resultado fora das tabelas de Ordem Paranormal.');
  }
  return band;
}

/**
 * Rola a tabela de lesão (`1d20`), trauma (`1d20`) ou falha crítica (`1d8`).
 * O modificador de patamar entra apenas na consulta da faixa.
 */
export function rollTable(input: TableRollInput, rng: () => number = Math.random): TableRollResult {
  assertTable(input?.table);
  const modifier = input.modifier ?? 0;
  if (
    !Number.isInteger(modifier) ||
    modifier < OP_TABLE_MODIFIER_MIN ||
    modifier > OP_TABLE_MODIFIER_MAX
  ) {
    throw new ServiceError(
      `Modificador inválido. Use entre ${OP_TABLE_MODIFIER_MIN} e ${OP_TABLE_MODIFIER_MAX}.`
    );
  }

  const die = TABLE_DICE[input.table];
  const roll = rollDie(die, rng);
  const lookup = Math.min(die, Math.max(1, roll + modifier));
  const band = findBand(OP_TABLES[input.table], lookup);
  const modifierText = modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`;

  return {
    kind: 'table',
    table: input.table,
    die,
    roll,
    key: band.key,
    summary: band.summary,
    expression: `${TABLE_LABELS[input.table]} 1d${die}${modifierText}`,
    modifier,
  };
}
