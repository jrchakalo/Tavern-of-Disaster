import System, { ISystem } from '../models/System.model';
import { createLogger } from '../logger';

type SystemSeed = Pick<
  ISystem,
  'key' | 'name' | 'description' | 'defaultAttributes' | 'movementRules' | 'dicePresets'
>;

/** Sistemas mínimos do beta. O seed nunca sobrescreve um sistema existente. */
export const SYSTEM_SEEDS: SystemSeed[] = [
  {
    key: 'dnd5e',
    name: 'D&D 5e',
    description: 'Fantasia clássica com d20, atributos e testes de resistência.',
    defaultAttributes: [
      { key: 'STR', label: 'Força', type: 'number' },
      { key: 'DEX', label: 'Destreza', type: 'number' },
      { key: 'CON', label: 'Constituição', type: 'number' },
      { key: 'INT', label: 'Inteligência', type: 'number' },
      { key: 'WIS', label: 'Sabedoria', type: 'number' },
      { key: 'CHA', label: 'Carisma', type: 'number' },
    ],
    movementRules: {
      baseSpeedFeet: 30,
      gridSizeFeet: 5,
      diagonalRule: '5-10-5',
    },
    dicePresets: [
      { key: 'ability-check', label: 'Teste de atributo', expression: 'd20', category: 'check' },
      { key: 'attack', label: 'Ataque (exemplo)', expression: 'd20+5', category: 'attack' },
      { key: 'damage', label: 'Dano (exemplo)', expression: '2d6+3', category: 'damage' },
      { key: 'generate-stats', label: 'Gerar atributo', expression: '4d6kh3', category: 'utility' },
      { key: 'percentile', label: 'Percentual', expression: '1d100', category: 'utility' },
    ],
  },
  {
    key: 'cyberpunk-red',
    name: 'Cyberpunk RED',
    description: 'Distopia cyberpunk com testes de d10 explosivo.',
    defaultAttributes: [
      { key: 'INT', label: 'Inteligência', type: 'number' },
      { key: 'REF', label: 'Reflexos', type: 'number' },
      { key: 'DEX', label: 'Destreza', type: 'number' },
      { key: 'TECH', label: 'Tecnologia', type: 'number' },
      { key: 'COOL', label: 'Frieza', type: 'number' },
      { key: 'WILL', label: 'Vontade', type: 'number' },
      { key: 'LUCK', label: 'Sorte', type: 'number' },
      { key: 'MOVE', label: 'Movimento', type: 'number' },
      { key: 'BODY', label: 'Corpo', type: 'number' },
      { key: 'EMP', label: 'Empatia', type: 'number' },
    ],
    dicePresets: [
      { key: 'check', label: 'Teste (d10 explosivo)', expression: '1d10!', category: 'check' },
      { key: 'check-bonus', label: 'Teste com bônus', expression: '1d10!+6', category: 'check' },
      { key: 'light-damage', label: 'Dano leve', expression: '2d6', category: 'damage' },
      { key: 'medium-damage', label: 'Dano médio', expression: '3d6', category: 'damage' },
    ],
  },
];

/**
 * Idempotente: usa `$setOnInsert` para criar apenas o que falta.
 * Retorna as chaves criadas e as que já existiam.
 */
export async function seedSystems(): Promise<{ inserted: string[]; existing: string[] }> {
  const inserted: string[] = [];
  const existing: string[] = [];

  for (const seed of SYSTEM_SEEDS) {
    const result = await System.updateOne(
      { key: seed.key },
      { $setOnInsert: seed },
      { upsert: true }
    ).exec();
    if (result.upsertedCount > 0) {
      inserted.push(seed.key);
    } else {
      existing.push(seed.key);
    }
  }

  return { inserted, existing };
}

/** Chamado no bootstrap do servidor; falha não derruba o processo. */
export async function seedSystemsSafe(): Promise<void> {
  const log = createLogger({ scope: 'system-seed' });
  try {
    const result = await seedSystems();
    log.info(
      { inserted: result.inserted, existing: result.existing },
      'Seed de sistemas concluído'
    );
  } catch (error) {
    log.error({ err: error }, 'Falha no seed de sistemas');
  }
}
