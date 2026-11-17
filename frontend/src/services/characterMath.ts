/**
 * Cálculos puros de ficha D&D 5e.
 *
 * O servidor guarda os valores crus; o cliente deriva modificadores, bônus de
 * proficiência, saves, perícias e passivas. Nenhum desses cálculos autoriza
 * ação — são apenas apresentação.
 */

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface DndSkill {
  key: string;
  label: string;
  ability: AbilityKey;
}

export const DND_SKILLS: DndSkill[] = [
  { key: 'acrobatics', label: 'Acrobacia', ability: 'dex' },
  { key: 'animal-handling', label: 'Adestrar Animais', ability: 'wis' },
  { key: 'arcana', label: 'Arcanismo', ability: 'int' },
  { key: 'athletics', label: 'Atletismo', ability: 'str' },
  { key: 'deception', label: 'Enganação', ability: 'cha' },
  { key: 'history', label: 'História', ability: 'int' },
  { key: 'insight', label: 'Intuição', ability: 'wis' },
  { key: 'intimidation', label: 'Intimidação', ability: 'cha' },
  { key: 'investigation', label: 'Investigação', ability: 'int' },
  { key: 'medicine', label: 'Medicina', ability: 'wis' },
  { key: 'nature', label: 'Natureza', ability: 'int' },
  { key: 'perception', label: 'Percepção', ability: 'wis' },
  { key: 'performance', label: 'Atuação', ability: 'cha' },
  { key: 'persuasion', label: 'Persuasão', ability: 'cha' },
  { key: 'religion', label: 'Religião', ability: 'int' },
  { key: 'sleight-of-hand', label: 'Prestidigitação', ability: 'dex' },
  { key: 'stealth', label: 'Furtividade', ability: 'dex' },
  { key: 'survival', label: 'Sobrevivência', ability: 'wis' },
];

export function abilityModifier(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(level: number): number {
  const safeLevel = Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  return 2 + Math.floor((safeLevel - 1) / 4);
}

export function savingThrow(score: number, proficient: boolean, level: number): number {
  const base = abilityModifier(score);
  return proficient ? base + proficiencyBonus(level) : base;
}

export function skillBonus(
  score: number,
  proficient: boolean,
  expertise: boolean,
  level: number,
): number {
  const base = abilityModifier(score);
  if (!proficient) return base;
  return base + proficiencyBonus(level) * (expertise ? 2 : 1);
}

export function passiveScore(
  score: number,
  proficient: boolean,
  expertise: boolean,
  level: number,
): number {
  return 10 + skillBonus(score, proficient, expertise, level);
}

export function formatModifier(value: number): string {
  if (!Number.isFinite(value)) return '+0';
  const rounded = Math.trunc(value);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

export function abilityModifierLabel(score: number): string {
  return formatModifier(abilityModifier(score));
}

export function skillByKey(key: string): DndSkill | undefined {
  return DND_SKILLS.find((skill) => skill.key === key);
}
