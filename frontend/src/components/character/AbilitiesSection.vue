<script setup lang="ts">
import { computed } from 'vue';
import type { SheetDraft, SheetPatch } from './sheetTypes';
import { DND_ABILITY_KEYS, DND_ABILITY_LABELS, DND_ABILITY_SHORT } from './sheetTypes';
import {
  DND_SKILLS,
  abilityModifier,
  formatModifier,
  passiveScore,
  proficiencyBonus,
  savingThrow,
  skillBonus,
} from '../../services/characterMath';

const props = defineProps<{
  draft: SheetDraft;
  canEdit: boolean;
  patch: (patch: SheetPatch) => void;
  dnd: boolean;
  systemAttributes?: Array<{ key: string; label: string; type: string }>;
}>();

const level = computed(() => {
  const parsed = Number(props.draft.profile.level);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
});

const profBonus = computed(() => proficiencyBonus(level.value));

function scoreOf(key: string): number {
  const parsed = Number(props.draft.attributes[key]);
  return Number.isFinite(parsed) ? parsed : 10;
}

function modifierOf(key: string): number {
  return abilityModifier(scoreOf(key));
}

function saveBonus(key: string): number {
  return savingThrow(scoreOf(key), props.draft.proficientSaves.includes(key), level.value);
}

const skills = computed(() =>
  DND_SKILLS.map((skill) => {
    const proficient = props.draft.proficientSkills.includes(skill.key);
    const expertise = proficient && props.draft.expertiseSkills.includes(skill.key);
    // `characterMath` usa chaves minúsculas; a ficha persiste STR/DEX/… maiúsculas.
    const score = scoreOf(skill.ability.toUpperCase());
    return {
      ...skill,
      proficient,
      expertise,
      bonus: skillBonus(score, proficient, expertise, level.value),
    };
  }),
);

const passivePerception = computed(() => {
  const perception = DND_SKILLS.find((skill) => skill.key === 'perception');
  if (!perception) return null;
  const proficient = props.draft.proficientSkills.includes('perception');
  const expertise = proficient && props.draft.expertiseSkills.includes('perception');
  return passiveScore(scoreOf(perception.ability.toUpperCase()), proficient, expertise, level.value);
});

function setAttribute(key: string, value: string) {
  props.patch({ attributes: { ...props.draft.attributes, [key]: value } });
}

function setAttributeEvent(key: string, event: Event) {
  const target = event.target as HTMLInputElement | null;
  setAttribute(key, target?.value ?? '');
}

function toggleSave(key: string, event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const current = props.draft.proficientSaves;
  const next = checked ? [...current, key] : current.filter((item) => item !== key);
  props.patch({ proficientSaves: next });
}

function toggleSkill(skillKey: string, kind: 'prof' | 'exp', event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  const proficient = props.draft.proficientSkills;
  const expertise = props.draft.expertiseSkills;

  if (kind === 'prof') {
    const nextProf = checked ? [...proficient, skillKey] : proficient.filter((item) => item !== skillKey);
    const nextExp = checked ? expertise : expertise.filter((item) => item !== skillKey);
    props.patch({ proficientSkills: nextProf, expertiseSkills: nextExp });
    return;
  }
  if (checked) {
    const nextProf = proficient.includes(skillKey) ? proficient : [...proficient, skillKey];
    const nextExp = expertise.includes(skillKey) ? expertise : [...expertise, skillKey];
    props.patch({ proficientSkills: nextProf, expertiseSkills: nextExp });
    return;
  }
  props.patch({ expertiseSkills: expertise.filter((item) => item !== skillKey) });
}

// --- Genérico (fora de D&D 5e) -------------------------------------------

function extraAttributeRows() {
  return props.draft.extraAttributes.length
    ? props.draft.extraAttributes
    : [{ key: '', value: '' }];
}

function setExtraAttribute(index: number, field: 'key' | 'value', event: Event) {
  const target = event.target as HTMLInputElement | null;
  const rows = extraAttributeRows().map((row, rowIndex) =>
    rowIndex === index ? { ...row, [field]: target?.value ?? '' } : row,
  );
  props.patch({ extraAttributes: rows });
}

function addExtraAttribute() {
  props.patch({ extraAttributes: [...extraAttributeRows(), { key: '', value: '' }] });
}

function removeExtraAttribute(index: number) {
  const rows = extraAttributeRows().filter((_, rowIndex) => rowIndex !== index);
  props.patch({ extraAttributes: rows.length ? rows : [{ key: '', value: '' }] });
}

function skillRows() {
  return props.draft.skills.length ? props.draft.skills : [{ key: '', value: '' }];
}

function setSkillRow(index: number, field: 'key' | 'value', event: Event) {
  const target = event.target as HTMLInputElement | null;
  const rows = skillRows().map((row, rowIndex) =>
    rowIndex === index ? { ...row, [field]: target?.value ?? '' } : row,
  );
  props.patch({ skills: rows });
}

function addSkillRow() {
  props.patch({ skills: [...skillRows(), { key: '', value: '' }] });
}

function removeSkillRow(index: number) {
  const rows = skillRows().filter((_, rowIndex) => rowIndex !== index);
  props.patch({ skills: rows.length ? rows : [{ key: '', value: '' }] });
}
</script>

<template>
  <div class="abilities">
    <!-- D&D 5e: atributos, salvaguardas e perícias calculadas -->
    <template v-if="dnd">
      <section class="block" aria-label="Atributos">
        <header class="block__header">
          <h4>Atributos</h4>
          <small class="block__meta">Bônus de proficiência +{{ profBonus }}</small>
        </header>
        <div class="ability-grid">
          <div v-for="key in DND_ABILITY_KEYS" :key="key" class="ability-card">
            <span class="ability-card__label" :title="DND_ABILITY_LABELS[key]">
              {{ DND_ABILITY_SHORT[key] }}
            </span>
            <input
              class="ability-card__score"
              type="number"
              :value="draft.attributes[key] ?? ''"
              :readonly="!canEdit"
              :aria-label="`Valor de ${DND_ABILITY_LABELS[key]}`"
              @change="setAttributeEvent(key, $event)"
            />
            <span class="ability-card__mod" :aria-label="`Modificador ${DND_ABILITY_LABELS[key]}`">
              {{ formatModifier(modifierOf(key)) }}
            </span>
          </div>
        </div>
      </section>

      <section class="block" aria-label="Testes de resistência">
        <header class="block__header">
          <h4>Testes de resistência</h4>
        </header>
        <div class="save-grid">
          <label v-for="key in DND_ABILITY_KEYS" :key="key" class="save-row">
            <input
              type="checkbox"
              :checked="draft.proficientSaves.includes(key)"
              :disabled="!canEdit"
              @change="toggleSave(key, $event)"
            />
            <span class="save-row__name">{{ DND_ABILITY_LABELS[key] }}</span>
            <span class="save-row__value">{{ formatModifier(saveBonus(key)) }}</span>
          </label>
        </div>
      </section>

      <section class="block" aria-label="Perícias">
        <header class="block__header">
          <h4>Perícias</h4>
          <small v-if="passivePerception !== null" class="block__meta">
            Percepção passiva {{ passivePerception }}
          </small>
        </header>
        <div class="skill-list">
          <div v-for="skill in skills" :key="skill.key" class="skill-row">
            <label class="skill-row__toggle" :title="`Proficiente em ${skill.label}`">
              <input
                type="checkbox"
                :checked="skill.proficient"
                :disabled="!canEdit"
                :aria-label="`Proficiente em ${skill.label}`"
                @change="toggleSkill(skill.key, 'prof', $event)"
              />
              <span aria-hidden="true">P</span>
            </label>
            <label class="skill-row__toggle" :title="`Especialista em ${skill.label}`">
              <input
                type="checkbox"
                :checked="skill.expertise"
                :disabled="!canEdit || !skill.proficient"
                :aria-label="`Especialista em ${skill.label}`"
                @change="toggleSkill(skill.key, 'exp', $event)"
              />
              <span aria-hidden="true">E</span>
            </label>
            <span class="skill-row__name">
              {{ skill.label }}
              <small>{{ DND_ABILITY_SHORT[skill.ability] }}</small>
            </span>
            <span class="skill-row__bonus">{{ formatModifier(skill.bonus) }}</span>
          </div>
        </div>
      </section>
    </template>

    <!-- Genérico: atributos do sistema + perícias livres -->
    <template v-else>
      <section v-if="systemAttributes?.length" class="block" aria-label="Atributos do sistema">
        <header class="block__header">
          <h4>Atributos</h4>
          <small class="block__meta">{{ systemAttributes.length }}</small>
        </header>
        <div class="system-attributes">
          <div v-for="attr in systemAttributes" :key="attr.key" class="system-attr-row">
            <span class="system-attr-row__label">{{ attr.label }}</span>
            <input
              type="number"
              :value="draft.attributes[attr.key] ?? ''"
              :readonly="!canEdit"
              :aria-label="attr.label"
              @change="setAttributeEvent(attr.key, $event)"
            />
          </div>
        </div>
      </section>

      <section class="block" aria-label="Atributos adicionais">
        <header class="block__header">
          <h4>Atributos adicionais</h4>
          <button v-if="canEdit" class="btn btn-xs" type="button" @click="addExtraAttribute">
            Adicionar atributo
          </button>
        </header>
        <div class="kv-list">
          <div v-for="(row, index) in extraAttributeRows()" :key="`attr-${index}`" class="kv-row">
            <input
              :value="row.key"
              :readonly="!canEdit"
              placeholder="Ex: Resistência"
              :aria-label="`Atributo ${index + 1}`"
              @input="setExtraAttribute(index, 'key', $event)"
            />
            <input
              type="number"
              :value="row.value"
              :readonly="!canEdit"
              placeholder="0"
              :aria-label="`Valor do atributo ${index + 1}`"
              @input="setExtraAttribute(index, 'value', $event)"
            />
            <button
              v-if="canEdit"
              class="remove-btn"
              type="button"
              :aria-label="`Remover atributo ${index + 1}`"
              @click="removeExtraAttribute(index)"
            >
              ×
            </button>
          </div>
        </div>
      </section>

      <section class="block" aria-label="Perícias">
        <header class="block__header">
          <h4>Perícias</h4>
          <button v-if="canEdit" class="btn btn-xs" type="button" @click="addSkillRow">
            Adicionar perícia
          </button>
        </header>
        <div class="kv-list">
          <div v-for="(row, index) in skillRows()" :key="`skill-${index}`" class="kv-row">
            <input
              :value="row.key"
              :readonly="!canEdit"
              placeholder="Ex: Furtividade"
              :aria-label="`Perícia ${index + 1}`"
              @input="setSkillRow(index, 'key', $event)"
            />
            <input
              :value="row.value"
              :readonly="!canEdit"
              placeholder="+5 ou texto"
              :aria-label="`Valor da perícia ${index + 1}`"
              @input="setSkillRow(index, 'value', $event)"
            />
            <button
              v-if="canEdit"
              class="remove-btn"
              type="button"
              :aria-label="`Remover perícia ${index + 1}`"
              @click="removeSkillRow(index)"
            >
              ×
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.abilities {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.block {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: rgba(0, 0, 0, 0.12);
}

.block__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.block__header h4 {
  margin: 0;
  font-size: 0.95rem;
}

.block__meta {
  color: var(--color-accent-alt);
  font-weight: 700;
  font-size: 0.8rem;
}

.ability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 10px;
}

.ability-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
  text-align: center;
}

.ability-card__label {
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--color-text-muted);
}

.ability-card__score {
  width: 100%;
  min-height: 44px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.22);
  color: var(--color-text);
  font: inherit;
  font-weight: 700;
  text-align: center;
}

.ability-card__mod {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-accent-alt);
}

.save-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 6px;
}

.save-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.save-row input {
  width: 20px;
  height: 20px;
  accent-color: var(--color-accent-alt);
}

.save-row__name {
  flex: 1;
  min-width: 0;
  font-size: 0.86rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save-row__value {
  font-weight: 700;
  color: var(--color-accent-alt);
}

.skill-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 4px 12px;
}

.skill-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 2px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.skill-row__toggle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-text-muted);
  cursor: pointer;
}

.skill-row__toggle input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.skill-row__toggle:has(input:checked) {
  background: var(--color-accent-alt);
  border-color: var(--color-accent-alt);
  color: #17110a;
}

.skill-row__toggle:has(input:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}

.skill-row__toggle:has(input:focus-visible) {
  outline: 2px solid var(--color-warning);
  outline-offset: 2px;
}

.skill-row__name {
  flex: 1;
  min-width: 0;
  font-size: 0.88rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-row__name small {
  margin-left: 4px;
  color: var(--color-text-muted);
  font-size: 0.7rem;
  letter-spacing: 0.5px;
}

.skill-row__bonus {
  font-weight: 700;
  color: var(--color-accent-alt);
}

.system-attributes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.system-attr-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.system-attr-row__label {
  flex: 1;
  min-width: 0;
  font-size: 0.88rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-attr-row input {
  width: 96px;
  min-height: 44px;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.22);
  color: var(--color-text);
  font: inherit;
  text-align: center;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv-row {
  display: grid;
  grid-template-columns: 2fr 1fr auto;
  gap: 8px;
  align-items: center;
}

.kv-row input {
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.22);
  color: var(--color-text);
  font: inherit;
}

.kv-row input[readonly] {
  opacity: 0.75;
}

.remove-btn {
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-danger);
  font-size: 1.2rem;
  cursor: pointer;
}
</style>
