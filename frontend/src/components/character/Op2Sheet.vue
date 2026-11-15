/**
 * Ficha de Ordem Paranormal 2 (Playtest / Contos da Vigília).
 *
 * Renderizada dentro do shell de `CharacterSheet.vue`; consome o contrato de
 * `docs/ORDEM_PARANORMAL.md` §3–4. Toda rolagem é server-authoritative
 * (`requestRollDice` com `step` ou `table`) e o card de último teste lê o log
 * canônico de `tableStore.recentRolls`.
 */
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import type {
  Character,
  CharacterDTO,
  DieSize,
  RollDiceParams,
  TableRollKey,
} from '../../types';
import { socketService } from '../../services/socketService';
import { toast } from '../../services/toast';
import { useTableStore } from '../../stores/tableStore';
import SheetField from './SheetField.vue';
import SheetTabs from './SheetTabs.vue';
import {
  OP2_ATTRIBUTE_KEYS,
  OP2_ATTRIBUTE_LABELS,
  OP2_ATTRIBUTE_SHORT,
  OP2_DIE_SIZES,
  attackUsesRangedSkill,
  buildOpDraft,
  buildOpPatch,
  dieLabel,
  linesFromList,
  listFromLines,
  op2SkillByKey,
  op2SkillsForAttribute,
  parseDamageModifier,
  relationBonusDie,
  type Op2AttributeKey,
  type Op2Draft,
  type Op2SkillDraft,
} from './opSheetTypes';

const props = defineProps<{
  character: Character | null;
  canEdit: boolean;
}>();

const tabs = [
  { key: 'identidade', label: 'Identidade' },
  { key: 'atributos', label: 'Atributos & Perícias' },
  { key: 'recursos', label: 'Recursos' },
  { key: 'combate', label: 'Combate' },
  { key: 'rituais', label: 'Rituais' },
  { key: 'relacoes', label: 'Relações' },
  { key: 'condicoes', label: 'Condições' },
  { key: 'inventario', label: 'Inventário' },
  { key: 'notas', label: 'Notas' },
];

const DT_PRESETS = [4, 7, 10, 13] as const;
const TABLE_LABELS: Record<TableRollKey, string> = {
  lesao: 'Teste de lesão',
  trauma: 'Teste de trauma',
  'falha-critica': 'Falha crítica',
};

const draft = ref<Op2Draft>(buildOpDraft(props.character));
const activeTab = ref('identidade');
const dirty = ref(false);
const pendingBonusDice = ref<DieSize[]>([]);

// A ficha pode ser montada em testes sem Pinia (ex.: roteamento do shell).
const tableStore = getActivePinia() ? useTableStore() : null;

function touch() {
  dirty.value = true;
}

function resetFromCharacter(character: Character | null) {
  draft.value = buildOpDraft(character);
  dirty.value = false;
  pendingBonusDice.value = [];
}

watch(
  () => props.character?._id,
  (id) => {
    if (id) resetFromCharacter(props.character);
  },
  { immediate: true },
);

// Atualização remota só entra com rascunho limpo; enquanto o dono digita, o
// rascunho local é preservado (mesma política do shell D&D).
watch(
  () => props.character,
  (character) => {
    if (!character || dirty.value) return;
    resetFromCharacter(character);
  },
);

const ability = computed(() => props.character?.attributes ?? {});

function attributeDie(key: Op2AttributeKey): DieSize {
  return draft.value.attributes[key];
}

function cycleAttributeDie(key: Op2AttributeKey) {
  if (!props.canEdit) return;
  const index = OP2_DIE_SIZES.indexOf(draft.value.attributes[key]);
  const next = OP2_DIE_SIZES[(index + 1) % OP2_DIE_SIZES.length];
  draft.value.attributes[key] = next;
  touch();
}

function setAttributeDie(key: Op2AttributeKey, event: Event) {
  if (!props.canEdit) return;
  const target = event.target as HTMLSelectElement | null;
  const parsed = Number(target?.value);
  draft.value.attributes[key] = OP2_DIE_SIZES.includes(parsed as DieSize)
    ? (parsed as DieSize)
    : draft.value.attributes[key];
  touch();
}

function attributeOf(skill: Op2SkillDraft): Op2AttributeKey {
  return OP2_ATTRIBUTE_KEYS.includes(skill.attribute as Op2AttributeKey)
    ? (skill.attribute as Op2AttributeKey)
    : 'fisico';
}

function setSkillDie(skill: Op2SkillDraft, event: Event) {
  if (!props.canEdit) return;
  const target = event.target as HTMLSelectElement | null;
  const parsed = Number(target?.value);
  if (OP2_DIE_SIZES.includes(parsed as DieSize)) {
    skill.die = parsed as DieSize;
    touch();
  }
}

const legacySkills = computed(() => draft.value.skills.filter((skill) => skill.legacy));

function setStat(key: keyof Op2Draft['stats'], value: string) {
  draft.value.stats[key] = value;
  touch();
}

function setIdentityNumber(key: 'nivel' | 'idade', value: string) {
  draft.value[key] = value;
  touch();
}

function setPerfil(event: Event) {
  const target = event.target as HTMLSelectElement | null;
  const value = target?.value ?? '';
  draft.value.perfil = value === 'executor' || value === 'analista' || value === 'vigilante'
    ? value
    : '';
  touch();
}

function setList(kind: 'conditions' | 'traumas' | 'injuries', event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  draft.value[kind] = listFromLines(target?.value ?? '');
  touch();
}

function setDifficulty(value: number) {
  if (!props.canEdit) return;
  if (!Number.isFinite(value)) return;
  // O backend valida 1..100; a UI usa o mesmo intervalo.
  draft.value.difficulty = Math.min(100, Math.max(1, Math.trunc(value)));
  touch();
}

// --- Listas dinâmicas -------------------------------------------------------

function addRelation() {
  draft.value.relations.push({ name: '', grade: 1, note: '' });
  touch();
}

function removeRelation(index: number) {
  draft.value.relations.splice(index, 1);
  touch();
}

function addRitual() {
  draft.value.rituals.push({ name: '', cost: '', description: '' });
  touch();
}

function removeRitual(index: number) {
  draft.value.rituals.splice(index, 1);
  touch();
}

function addAttack() {
  draft.value.attacks.push({ name: '', damage: '', range: '', notes: '' });
  touch();
}

function removeAttack(index: number) {
  draft.value.attacks.splice(index, 1);
  touch();
}

function addInventory() {
  draft.value.inventory.push({ name: '', quantity: '', notes: '' });
  touch();
}

function removeInventory(index: number) {
  draft.value.inventory.splice(index, 1);
  touch();
}

// --- Rolagens ---------------------------------------------------------------

const tableId = computed(() => props.character?.tableId ?? '');
const characterId = computed(() => props.character?._id ?? '');

function stepBase() {
  return {
    difficulty: draft.value.difficulty,
    ...(draft.value.fear.active ? { dreadDie: draft.value.fear.dreadDie } : {}),
    ...(pendingBonusDice.value.length ? { bonusDice: [...pendingBonusDice.value] } : {}),
  };
}

function consumeBonusDice() {
  pendingBonusDice.value = [];
}

async function sendRoll(params: RollDiceParams) {
  if (!tableId.value) {
    toast.error('Mesa não identificada; não foi possível rolar.');
    return;
  }
  try {
    // O toast automático do serviço fica silencioso: a ficha mostra o erro
    // exatamente uma vez, inclusive para falhas de ack (rate limit etc.).
    const ack = await socketService.rollDice(params, undefined, { silent: true });
    if (!ack.ok) {
      toast.error(ack.error.message || 'Não foi possível enviar a rolagem.');
    }
  } catch {
    toast.error('Não foi possível enviar a rolagem.');
  }
}

async function rollSkill(skill: Op2SkillDraft) {
  if (!props.canEdit) return;
  const attribute = attributeOf(skill);
  const label = `${skill.label} (${OP2_ATTRIBUTE_LABELS[attribute]})`;
  await sendRoll({
    tableId: tableId.value,
    characterId: characterId.value,
    metadata: label,
    step: {
      attribute,
      attributeDie: attributeDie(attribute),
      skillKey: skill.key,
      skillDie: skill.die,
      label,
      ...stepBase(),
    },
  });
  consumeBonusDice();
}

async function rollAttack(attack: Op2Draft['attacks'][number]) {
  if (!props.canEdit) return;
  const ranged = attackUsesRangedSkill(attack.range);
  const skillKey = ranged ? 'pontaria' : 'luta';
  const definition = op2SkillByKey(skillKey);
  const skillRow = draft.value.skills.find((row) => row.key === skillKey);
  const label = `Ataque: ${attack.name || (ranged ? 'Pontaria' : 'Luta')}`;
  await sendRoll({
    tableId: tableId.value,
    characterId: characterId.value,
    metadata: label,
    step: {
      attribute: 'fisico',
      attributeDie: attributeDie('fisico'),
      skillKey,
      skillDie: skillRow?.die ?? 6,
      label: `${label} (${definition?.label ?? skillKey})`,
      damageMode: true,
      damageModifier: parseDamageModifier(attack.damage),
      ...stepBase(),
    },
  });
  consumeBonusDice();
}

async function rollTable(table: TableRollKey) {
  if (!props.canEdit) return;
  await sendRoll({
    tableId: tableId.value,
    characterId: characterId.value,
    metadata: TABLE_LABELS[table],
    table,
    modifier: 0,
  });
}

function invokeRelation(index: number) {
  if (!props.canEdit) return;
  const relation = draft.value.relations[index];
  if (!relation) return;
  if (pendingBonusDice.value.length >= 2) {
    toast.warning('Máximo de 2 dados extras por teste.');
    return;
  }
  const die = relationBonusDie(relation.grade);
  pendingBonusDice.value = [...pendingBonusDice.value, die];
  toast.success(
    `${relation.name || 'Relação'} invocada: +1${dieLabel(die)} no próximo teste.`,
  );
}

async function rollRelation(index: number) {
  if (!props.canEdit) return;
  const relation = draft.value.relations[index];
  if (!relation) return;
  const die = relationBonusDie(relation.grade);
  const label = `Relação: ${relation.name || 'sem nome'} (grau ${relation.grade})`;
  await sendRoll({
    tableId: tableId.value,
    characterId: characterId.value,
    metadata: label,
    expression: `1${dieLabel(die)}`,
  });
}

function spendArmorPoint() {
  if (!props.canEdit) return;
  const current = Number(draft.value.stats.armorPoints);
  if (!Number.isFinite(current)) {
    toast.error('Defina os pontos de armadura atuais antes de gastar.');
    return;
  }
  if (current <= 0) {
    toast.warning('Sem pontos de armadura disponíveis.');
    return;
  }
  const next = Math.max(0, Math.trunc(current) - 1);
  draft.value.stats.armorPoints = String(next);
  touch();
  toast.success(`Ponto de armadura gasto (−10 dano). Restam ${next}.`);
}

// --- Último resultado -------------------------------------------------------

const recentRolls = computed(() => tableStore?.recentRolls ?? []);

const lastStepEntry = computed(() => {
  const id = characterId.value;
  if (!id) return null;
  return (
    recentRolls.value.find(
      (entry) => entry.characterId === id && (entry.kind === 'step' || Boolean(entry.step)),
    ) ?? null
  );
});

const lastStep = computed(() => lastStepEntry.value?.step ?? null);

const lastStepStatus = computed(() => {
  const step = lastStep.value;
  if (!step) return '';
  if (step.fumble) return 'Falha crítica';
  if (step.critical) return 'Crítico';
  return step.success ? 'Sucesso' : 'Falha';
});

const lastStepClass = computed(() => {
  const step = lastStep.value;
  if (!step) return '';
  if (step.fumble) return 'is-fumble';
  if (step.critical) return 'is-critical';
  return step.success ? 'is-success' : 'is-failure';
});

const lastStepDice = computed(() => {
  const entry = lastStepEntry.value;
  if (!entry) return [];
  return entry.rolls.filter((roll) => roll.role !== 'dread');
});

const lastTableEntry = computed(() => {
  const id = characterId.value;
  if (!id) return null;
  return (
    recentRolls.value.find(
      (entry) => entry.characterId === id && (entry.kind === 'table' || Boolean(entry.tableResult)),
    ) ?? null
  );
});

// --- API para o shell -------------------------------------------------------

function buildPatch(): Partial<CharacterDTO> {
  return buildOpPatch(draft.value);
}

defineExpose({ buildPatch });
</script>

<template>
  <section class="op2-sheet" aria-label="Ficha Ordem Paranormal 2">
    <SheetTabs :tabs="tabs" v-model="activeTab" />

    <div class="op2-tab-panels">
      <!-- Identidade -->
      <div v-show="activeTab === 'identidade'" class="op2-panel">
        <div class="op2-grid op2-grid--identity">
          <SheetField
            label="Nome"
            :model-value="draft.name"
            :readonly="!canEdit"
            placeholder="Nome do personagem"
            @update:model-value="draft.name = $event; touch()"
          />
          <label class="op2-field">
            <span class="op2-field__label">Perfil</span>
            <select
              class="op2-field__control"
              :value="draft.perfil"
              :disabled="!canEdit"
              aria-label="Perfil do personagem"
              @change="setPerfil"
            >
              <option value="">—</option>
              <option value="executor">Executor</option>
              <option value="analista">Analista</option>
              <option value="vigilante">Vigilante</option>
            </select>
          </label>
          <SheetField
            label="Vocação"
            :model-value="draft.vocacao"
            :readonly="!canEdit"
            placeholder="Ex.: Policial"
            @update:model-value="draft.vocacao = $event; touch()"
          />
          <SheetField
            label="Nível"
            :model-value="draft.nivel"
            :readonly="!canEdit"
            type="number"
            :min="1"
            placeholder="1"
            @update:model-value="setIdentityNumber('nivel', $event)"
          />
          <SheetField
            label="Idade"
            :model-value="draft.idade"
            :readonly="!canEdit"
            type="number"
            :min="0"
            placeholder="—"
            @update:model-value="setIdentityNumber('idade', $event)"
          />
        </div>
        <p class="op2-hint">
          PV e PD do OP2 são preenchidos manualmente: as fichas oficiais trazem os
          valores impressos e não há fórmula no Alpha nem no Beta.
        </p>
      </div>

      <!-- Atributos & Perícias -->
      <div v-show="activeTab === 'atributos'" class="op2-panel">
        <section class="op2-block" aria-label="Dificuldade do teste">
          <header class="op2-block__header">
            <h4>DT do teste</h4>
            <small>Padrão 7</small>
          </header>
          <div class="op2-dt" role="group" aria-label="Dificuldade">
            <button
              v-for="preset in DT_PRESETS"
              :key="preset"
              type="button"
              class="op2-dt__preset"
              :class="{ 'is-active': draft.difficulty === preset }"
              :disabled="!canEdit"
              :aria-pressed="draft.difficulty === preset ? 'true' : 'false'"
              @click="setDifficulty(preset)"
            >
              {{ preset }}
            </button>
            <label class="op2-dt__custom">
              <span>Outra</span>
              <input
                class="op2-dt__input"
                type="number"
                min="1"
                max="100"
                aria-label="DT personalizada"
                :value="draft.difficulty"
                :readonly="!canEdit"
                @change="setDifficulty(Number(($event.target as HTMLInputElement)?.value))"
              />
            </label>
          </div>
        </section>

        <section class="op2-block" aria-label="Atributos">
          <header class="op2-block__header">
            <h4>Atributos</h4>
            <small>Clique no dado para subir um passo</small>
          </header>
          <div class="op2-attributes">
            <div
              v-for="key in OP2_ATTRIBUTE_KEYS"
              :key="key"
              class="op2-attribute"
            >
              <span class="op2-attribute__label">{{ OP2_ATTRIBUTE_LABELS[key] }}</span>
              <button
                type="button"
                class="op2-attribute__die"
                :disabled="!canEdit"
                :aria-label="`Dado de ${OP2_ATTRIBUTE_LABELS[key]}`"
                @click="cycleAttributeDie(key)"
              >
                {{ dieLabel(attributeDie(key)) }}
              </button>
              <label class="op2-attribute__select-label">
                <span class="op2-sr-only">Alterar dado de {{ OP2_ATTRIBUTE_LABELS[key] }}</span>
                <select
                  class="op2-attribute__select"
                  :value="attributeDie(key)"
                  :disabled="!canEdit"
                  @change="setAttributeDie(key, $event)"
                >
                  <option v-for="die in OP2_DIE_SIZES" :key="die" :value="die">
                    {{ dieLabel(die) }}
                  </option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section
          v-for="key in OP2_ATTRIBUTE_KEYS"
          :key="`skills-${key}`"
          class="op2-block"
          :aria-label="`Perícias de ${OP2_ATTRIBUTE_LABELS[key]}`"
        >
          <header class="op2-block__header">
            <h4>{{ OP2_ATTRIBUTE_LABELS[key] }} <span class="op2-block__die">{{ dieLabel(attributeDie(key)) }}</span></h4>
            <small>{{ OP2_ATTRIBUTE_SHORT[key] }}</small>
          </header>
          <div class="op2-skill-list">
            <div
              v-for="definition in op2SkillsForAttribute(key)"
              :key="definition.key"
              class="op2-skill"
            >
              <span class="op2-skill__name">{{ definition.label }}</span>
              <label class="op2-skill__die-label">
                <span class="op2-sr-only">Dado de {{ definition.label }}</span>
                <select
                  class="op2-skill__die"
                  :value="draft.skills.find((row) => row.key === definition.key)?.die ?? 6"
                  :disabled="!canEdit"
                  @change="
                    (event) => {
                      const row = draft.skills.find((item) => item.key === definition.key);
                      if (row) setSkillDie(row, event);
                    }
                  "
                >
                  <option v-for="die in OP2_DIE_SIZES" :key="die" :value="die">
                    {{ dieLabel(die) }}
                  </option>
                </select>
              </label>
              <span class="op2-skill__attr" :title="`Atributo ${OP2_ATTRIBUTE_LABELS[key]}`">
                + {{ dieLabel(attributeDie(key)) }}
              </span>
              <button
                type="button"
                class="op2-skill__roll"
                :disabled="!canEdit"
                :aria-label="`Rolar ${definition.label}`"
                @click="
                  () => {
                    const row = draft.skills.find((item) => item.key === definition.key);
                    if (row) rollSkill(row);
                  }
                "
              >
                Rolar
              </button>
            </div>
          </div>
        </section>

        <section v-if="legacySkills.length" class="op2-block" aria-label="Perícias de legado">
          <header class="op2-block__header">
            <h4>Perícias de legado</h4>
            <small>Preservadas da ficha antiga</small>
          </header>
          <div class="op2-skill-list">
            <div v-for="skill in legacySkills" :key="`legacy-${skill.key}`" class="op2-skill is-legacy">
              <span class="op2-skill__name">{{ skill.label }}</span>
              <span class="op2-skill__attr">{{ skill.raw ?? dieLabel(skill.die) }}</span>
              <button
                type="button"
                class="op2-skill__roll"
                :disabled="!canEdit"
                :aria-label="`Rolar ${skill.label}`"
                @click="rollSkill(skill)"
              >
                Rolar
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- Recursos -->
      <div v-show="activeTab === 'recursos'" class="op2-panel">
        <section class="op2-block" aria-label="Recursos">
          <header class="op2-block__header">
            <h4>PV, PD e armadura</h4>
            <small v-if="pendingBonusDice.length">
              Bônus no próximo teste: {{ pendingBonusDice.map(dieLabel).join(' + ') }}
            </small>
          </header>
          <div class="op2-grid">
            <SheetField
              label="PV atual"
              :model-value="draft.stats.currentHP"
              :readonly="!canEdit"
              type="number"
              :min="0"
              @update:model-value="setStat('currentHP', $event)"
            />
            <SheetField
              label="PV máximo"
              :model-value="draft.stats.maxHP"
              :readonly="!canEdit"
              type="number"
              :min="0"
              @update:model-value="setStat('maxHP', $event)"
            />
            <SheetField
              label="PD atual"
              :model-value="draft.stats.currentPD"
              :readonly="!canEdit"
              type="number"
              :min="0"
              @update:model-value="setStat('currentPD', $event)"
            />
            <SheetField
              label="PD máximo"
              :model-value="draft.stats.maxPD"
              :readonly="!canEdit"
              type="number"
              :min="0"
              @update:model-value="setStat('maxPD', $event)"
            />
            <SheetField
              label="Armadura atual"
              :model-value="draft.stats.armorPoints"
              :readonly="!canEdit"
              type="number"
              :min="0"
              @update:model-value="setStat('armorPoints', $event)"
            />
            <SheetField
              label="Armadura máxima"
              :model-value="draft.stats.armorPointsMax"
              :readonly="!canEdit"
              type="number"
              :min="0"
              @update:model-value="setStat('armorPointsMax', $event)"
            />
          </div>
          <button
            type="button"
            class="op2-armor-spend"
            :disabled="!canEdit"
            @click="spendArmorPoint"
          >
            Gastar 1 ponto de armadura (−10 dano)
          </button>
        </section>

        <section class="op2-block" aria-label="Medo e pavor">
          <header class="op2-block__header">
            <h4>Medo</h4>
            <small>Pavor não soma; anula dados menores</small>
          </header>
          <label class="op2-check">
            <input
              type="checkbox"
              :checked="draft.fear.active"
              :disabled="!canEdit"
              @change="
                draft.fear.active = ($event.target as HTMLInputElement).checked;
                touch();
              "
            />
            <span>Sob efeito de pavor</span>
          </label>
          <label class="op2-field op2-field--inline">
            <span class="op2-field__label">Dado de pavor</span>
            <select
              class="op2-field__control"
              :value="draft.fear.dreadDie"
              :disabled="!canEdit"
              aria-label="Dado de pavor"
              @change="
                draft.fear.dreadDie = Number(($event.target as HTMLSelectElement).value) as DieSize;
                touch();
              "
            >
              <option v-for="die in OP2_DIE_SIZES" :key="die" :value="die">
                {{ dieLabel(die) }}
              </option>
            </select>
          </label>
          <SheetField
            label="Observações de medo"
            :model-value="draft.fear.notes"
            :readonly="!canEdit"
            type="textarea"
            :rows="2"
            placeholder="Efeito atual, duração, origem…"
            @update:model-value="draft.fear.notes = $event; touch()"
          />
        </section>
      </div>

      <!-- Combate -->
      <div v-show="activeTab === 'combate'" class="op2-panel">
        <section class="op2-block" aria-label="Ataques">
          <header class="op2-block__header">
            <h4>Ataques</h4>
            <button v-if="canEdit" type="button" class="btn btn-xs" @click="addAttack">
              Adicionar ataque
            </button>
          </header>

          <p v-if="!draft.attacks.length" class="op2-hint">Nenhum ataque registrado.</p>
          <div
            v-for="(attack, index) in draft.attacks"
            :key="`attack-${index}`"
            class="op2-record"
          >
            <div class="op2-grid">
              <SheetField
                label="Nome"
                :model-value="attack.name"
                :readonly="!canEdit"
                placeholder="Ex.: Revólver"
                @update:model-value="attack.name = $event; touch()"
              />
              <SheetField
                label="Dano (RA+X)"
                :model-value="attack.damage"
                :readonly="!canEdit"
                placeholder="RA+3"
                @update:model-value="attack.damage = $event; touch()"
              />
              <SheetField
                label="Alcance"
                :model-value="attack.range"
                :readonly="!canEdit"
                placeholder="Corpo a corpo / longo"
                @update:model-value="attack.range = $event; touch()"
              />
              <SheetField
                label="Notas"
                :model-value="attack.notes"
                :readonly="!canEdit"
                placeholder="Propriedades, munição…"
                @update:model-value="attack.notes = $event; touch()"
              />
            </div>
            <div class="op2-record__actions">
              <span class="op2-record__base">
                Dano base: RA {{ parseDamageModifier(attack.damage) >= 0 ? '+' : '−' }}
                {{ Math.abs(parseDamageModifier(attack.damage)) }}
              </span>
              <button
                type="button"
                class="btn btn-xs"
                :disabled="!canEdit"
                @click="rollAttack(attack)"
              >
                Rolar ataque ({{ attackUsesRangedSkill(attack.range) ? 'Pontaria' : 'Luta' }})
              </button>
              <button
                v-if="canEdit"
                type="button"
                class="op2-remove"
                :aria-label="`Remover ataque ${index + 1}`"
                @click="removeAttack(index)"
              >
                ×
              </button>
            </div>
          </div>
        </section>

        <p class="op2-hint">
          Ordem da rodada no OP2: fase geral → ataques à distância → ataques corpo a
          corpo. Um ataque usa Luta (corpo a corpo) ou Pontaria (distância) + Físico.
        </p>
      </div>

      <!-- Rituais -->
      <div v-show="activeTab === 'rituais'" class="op2-panel">
        <section class="op2-block" aria-label="Rituais">
          <header class="op2-block__header">
            <h4>Rituais</h4>
            <button v-if="canEdit" type="button" class="btn btn-xs" @click="addRitual">
              Adicionar ritual
            </button>
          </header>
          <p v-if="!draft.rituals.length" class="op2-hint">Nenhum ritual registrado.</p>
          <div
            v-for="(ritual, index) in draft.rituals"
            :key="`ritual-${index}`"
            class="op2-record"
          >
            <div class="op2-grid">
              <SheetField
                label="Nome"
                :model-value="ritual.name"
                :readonly="!canEdit"
                placeholder="Nome do ritual"
                @update:model-value="ritual.name = $event; touch()"
              />
              <SheetField
                label="Custo"
                :model-value="ritual.cost"
                :readonly="!canEdit"
                placeholder="Ex.: 2 PE"
                @update:model-value="ritual.cost = $event; touch()"
              />
            </div>
            <SheetField
              label="Descrição"
              :model-value="ritual.description"
              :readonly="!canEdit"
              type="textarea"
              :rows="2"
              placeholder="Efeito resumido"
              @update:model-value="ritual.description = $event; touch()"
            />
            <div class="op2-record__actions">
              <button
                v-if="canEdit"
                type="button"
                class="op2-remove"
                :aria-label="`Remover ritual ${index + 1}`"
                @click="removeRitual(index)"
              >
                ×
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- Relações -->
      <div v-show="activeTab === 'relacoes'" class="op2-panel">
        <section class="op2-block" aria-label="Relações">
          <header class="op2-block__header">
            <h4>Relações</h4>
            <button v-if="canEdit" type="button" class="btn btn-xs" @click="addRelation">
              Adicionar relação
            </button>
          </header>
          <p v-if="!draft.relations.length" class="op2-hint">
            Sem relações. Graus: 1 afinidade (+1d6), 2 vínculo (+1d8), 3 devoção (+1d12).
          </p>
          <div
            v-for="(relation, index) in draft.relations"
            :key="`relation-${index}`"
            class="op2-record"
          >
            <div class="op2-grid">
              <SheetField
                label="Nome"
                :model-value="relation.name"
                :readonly="!canEdit"
                placeholder="Pessoa, lugar ou memória"
                @update:model-value="relation.name = $event; touch()"
              />
              <label class="op2-field">
                <span class="op2-field__label">Grau</span>
                <select
                  class="op2-field__control"
                  :value="relation.grade"
                  :disabled="!canEdit"
                  :aria-label="`Grau da relação ${index + 1}`"
                  @change="
                    relation.grade = Number(($event.target as HTMLSelectElement).value) as 1 | 2 | 3;
                    touch();
                  "
                >
                  <option :value="1">1 — Afinidade (+1d6)</option>
                  <option :value="2">2 — Vínculo (+1d8)</option>
                  <option :value="3">3 — Devoção (+1d12)</option>
                </select>
              </label>
              <SheetField
                label="Observação"
                :model-value="relation.note"
                :readonly="!canEdit"
                placeholder="Detalhe"
                @update:model-value="relation.note = $event; touch()"
              />
            </div>
            <div class="op2-record__actions">
              <button
                type="button"
                class="btn btn-xs"
                :disabled="!canEdit"
                @click="invokeRelation(index)"
              >
                Invocar (+1{{ dieLabel(relationBonusDie(relation.grade)) }})
              </button>
              <button
                type="button"
                class="btn btn-xs btn-ghost"
                :disabled="!canEdit"
                @click="rollRelation(index)"
              >
                Rolar bônus
              </button>
              <button
                v-if="canEdit"
                type="button"
                class="op2-remove"
                :aria-label="`Remover relação ${index + 1}`"
                @click="removeRelation(index)"
              >
                ×
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- Condições -->
      <div v-show="activeTab === 'condicoes'" class="op2-panel">
        <section class="op2-block" aria-label="Condições, traumas e lesões">
          <header class="op2-block__header">
            <h4>Condições, traumas e lesões</h4>
            <small>Uma por linha</small>
          </header>
          <div class="op2-grid">
            <label class="op2-field">
              <span class="op2-field__label">Condições</span>
              <textarea
                class="op2-field__control"
                :value="linesFromList(draft.conditions)"
                :readonly="!canEdit"
                rows="3"
                placeholder="Ex.: Atordoado"
                @input="setList('conditions', $event)"
              ></textarea>
            </label>
            <label class="op2-field">
              <span class="op2-field__label">Traumas</span>
              <textarea
                class="op2-field__control"
                :value="linesFromList(draft.traumas)"
                :readonly="!canEdit"
                rows="3"
                placeholder="Ex.: Pânico"
                @input="setList('traumas', $event)"
              ></textarea>
            </label>
            <label class="op2-field">
              <span class="op2-field__label">Lesões</span>
              <textarea
                class="op2-field__control"
                :value="linesFromList(draft.injuries)"
                :readonly="!canEdit"
                rows="3"
                placeholder="Ex.: Sem olho"
                @input="setList('injuries', $event)"
              ></textarea>
            </label>
          </div>
        </section>

        <section class="op2-block" aria-label="Tabelas">
          <header class="op2-block__header">
            <h4>Tabelas</h4>
            <small>Resultado no log/TV</small>
          </header>
          <div class="op2-table-actions">
            <button type="button" class="btn btn-xs" :disabled="!canEdit" @click="rollTable('lesao')">
              Rolar lesão (1d20)
            </button>
            <button type="button" class="btn btn-xs" :disabled="!canEdit" @click="rollTable('trauma')">
              Rolar trauma (1d20)
            </button>
            <button
              type="button"
              class="btn btn-xs btn-danger-outline"
              :disabled="!canEdit"
              @click="rollTable('falha-critica')"
            >
              Rolar falha crítica (1d8)
            </button>
          </div>
          <p v-if="lastTableEntry?.tableResult" class="op2-table-result">
            {{ lastTableEntry.tableResult.summary }}
            <small>({{ lastTableEntry.tableResult.expression }})</small>
          </p>
        </section>
      </div>

      <!-- Inventário -->
      <div v-show="activeTab === 'inventario'" class="op2-panel">
        <section class="op2-block" aria-label="Inventário">
          <header class="op2-block__header">
            <h4>Inventário</h4>
            <button v-if="canEdit" type="button" class="btn btn-xs" @click="addInventory">
              Adicionar item
            </button>
          </header>
          <p v-if="!draft.inventory.length" class="op2-hint">Nenhum item no inventário.</p>
          <div
            v-for="(item, index) in draft.inventory"
            :key="`item-${index}`"
            class="op2-record"
          >
            <div class="op2-grid">
              <SheetField
                label="Item"
                :model-value="item.name"
                :readonly="!canEdit"
                placeholder="Ex.: Lanterna"
                @update:model-value="item.name = $event; touch()"
              />
              <SheetField
                label="Qtd."
                :model-value="item.quantity"
                :readonly="!canEdit"
                type="number"
                :min="0"
                @update:model-value="item.quantity = $event; touch()"
              />
              <SheetField
                label="Notas"
                :model-value="item.notes"
                :readonly="!canEdit"
                placeholder="Detalhes"
                @update:model-value="item.notes = $event; touch()"
              />
            </div>
            <div class="op2-record__actions">
              <button
                v-if="canEdit"
                type="button"
                class="op2-remove"
                :aria-label="`Remover item ${index + 1}`"
                @click="removeInventory(index)"
              >
                ×
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- Notas -->
      <div v-show="activeTab === 'notas'" class="op2-panel">
        <SheetField
          label="Notas livres"
          :model-value="draft.notes"
          :readonly="!canEdit"
          type="textarea"
          :rows="10"
          placeholder="Histórico, objetivos, NPCs, lembretes da missão…"
          @update:model-value="draft.notes = $event; touch()"
        />
      </div>
    </div>

    <section class="op2-last-result" :class="lastStepClass" aria-label="Último teste">
      <header class="op2-last-result__header">
        <h4>Último teste</h4>
        <span v-if="lastStepEntry?.metadata" class="op2-last-result__label">
          {{ lastStepEntry.metadata }}
        </span>
      </header>
      <template v-if="lastStep">
        <p class="op2-last-result__line">
          <strong>{{ lastStepStatus }}</strong>
          <span>{{ lastStepDice.map((roll) => roll.value).join(' + ') || '—' }}</span>
          <span>= {{ lastStepEntry?.total ?? 0 }}</span>
          <span>DT {{ lastStep.difficulty }}</span>
        </p>
        <p class="op2-last-result__meta">
          <span>RA {{ lastStep.high }}</span>
          <span>RB {{ lastStep.low }}</span>
          <span v-if="lastStep.dread">Pavor d{{ lastStep.dread.die }}: {{ lastStep.dread.value }}</span>
          <span v-if="lastStep.canceledValues.length">
            Anulados: {{ lastStep.canceledValues.join(', ') }}
          </span>
          <span v-if="lastStep.damageBase !== undefined">
            Dano base: {{ lastStep.damageBase }}
          </span>
        </p>
        <p v-if="lastStepEntry?.expression" class="op2-last-result__expression">
          {{ lastStepEntry.expression }}
        </p>
      </template>
      <p v-else class="op2-hint">Nenhum teste de passo registrado para esta ficha.</p>
    </section>

    <p class="op2-sr-only" aria-live="polite">
      {{ Object.keys(ability).length ? 'Ficha carregada' : '' }}
    </p>
  </section>
</template>

<style scoped>
.op2-sheet {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.op2-tab-panels {
  min-width: 0;
}

.op2-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 4px;
}

.op2-block {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.op2-block__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.op2-block__header h4 {
  margin: 0;
  font-size: 0.95rem;
}

.op2-block__header small {
  color: var(--color-text-muted);
  font-size: 0.76rem;
}

.op2-block__die {
  color: var(--color-accent-alt);
  font-weight: 700;
}

.op2-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.op2-grid--identity {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.op2-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.op2-field--inline {
  max-width: 180px;
}

.op2-field__label {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.op2-field__control {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.18);
  color: var(--color-text);
  font: inherit;
}

.op2-field__control[readonly],
.op2-field__control:disabled {
  opacity: 0.75;
}

textarea.op2-field__control {
  min-height: 80px;
  resize: vertical;
  line-height: 1.4;
}

.op2-dt {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-end;
}

.op2-dt__preset {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.op2-dt__preset.is-active {
  background: var(--gradient-accent);
  border-color: var(--color-accent-alt);
  color: #12101a;
}

.op2-dt__custom {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.op2-dt__input {
  width: 72px;
  min-height: 44px;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.18);
  color: var(--color-text);
  font: inherit;
  text-align: center;
}

.op2-attributes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.op2-attribute {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
}

.op2-attribute__label {
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.op2-attribute__die {
  width: 100%;
  min-height: 56px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.22);
  color: var(--color-accent-alt);
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  cursor: pointer;
}

.op2-attribute__die:disabled {
  cursor: default;
  opacity: 0.8;
}

.op2-attribute__select {
  width: 100%;
  min-height: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
}

.op2-skill-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 2px 12px;
}

.op2-skill {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 2px 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.op2-skill__name {
  flex: 1;
  min-width: 0;
  font-size: 0.87rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.op2-skill__die {
  min-height: 36px;
  padding: 4px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.18);
  color: var(--color-text);
  font: inherit;
  font-size: 0.84rem;
}

.op2-skill__attr {
  font-size: 0.74rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.op2-skill__roll {
  min-width: 56px;
  min-height: 36px;
  padding: 4px 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface-alt);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.op2-skill__roll:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.op2-skill.is-legacy {
  opacity: 0.85;
}

.op2-check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-size: 0.88rem;
  cursor: pointer;
}

.op2-check input {
  width: 20px;
  height: 20px;
  accent-color: var(--color-accent-alt);
}

.op2-armor-spend {
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-sm);
  background: rgba(210, 156, 68, 0.12);
  color: var(--color-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.op2-record {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.1);
}

.op2-record__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.op2-record__base {
  flex: 1;
  min-width: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.op2-remove {
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-danger);
  font-size: 1.2rem;
  cursor: pointer;
}

.op2-table-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.op2-table-result {
  margin: 0;
  font-size: 0.86rem;
}

.op2-table-result small {
  color: var(--color-text-muted);
}

.op2-last-result {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.18);
}

.op2-last-result__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.op2-last-result__header h4 {
  margin: 0;
  font-size: 0.9rem;
}

.op2-last-result__label {
  font-size: 0.76rem;
  color: var(--color-text-muted);
}

.op2-last-result__line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 6px 0 0;
  font-size: 0.95rem;
}

.op2-last-result__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 4px 0 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.op2-last-result__expression {
  margin: 4px 0 0;
  font-size: 0.74rem;
  color: var(--color-text-muted);
}

.op2-last-result.is-success {
  border-color: var(--color-success, #6fbf73);
}

.op2-last-result.is-critical {
  border-color: var(--color-warning);
  box-shadow: 0 0 0 1px rgba(210, 156, 68, 0.35);
}

.op2-last-result.is-failure,
.op2-last-result.is-fumble {
  border-color: var(--color-danger);
}

.op2-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.op2-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

@media (max-width: 640px) {
  .op2-grid,
  .op2-grid--identity {
    grid-template-columns: 1fr 1fr;
  }

  .op2-attributes {
    gap: 6px;
  }

  .op2-skill-list {
    grid-template-columns: 1fr;
  }
}
</style>
