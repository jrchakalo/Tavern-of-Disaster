/**
 * Ficha de Ordem Paranormal: Sobrevivendo ao Horror (base OP1 + suplemento).
 *
 * Atributos 1–5 viram pools de d20 (`Nd20kh1+bônus`) rolados pelo motor de
 * expressão do servidor. A ficha alterna entre Sanidade (PE/SAN) e a regra
 * opcional sem Sanidade (PD).
 */
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import type { Character, CharacterDTO, RollDiceParams } from '../../types';
import { socketService } from '../../services/socketService';
import { toast } from '../../services/toast';
import { useTableStore } from '../../stores/tableStore';
import SheetField from './SheetField.vue';
import SheetTabs from './SheetTabs.vue';
import {
  OPSH_ATTRIBUTE_KEYS,
  OPSH_ATTRIBUTE_LABELS,
  OPSH_ATTRIBUTE_SHORT,
  OPSH_INJURY_ROLLS,
  OPSH_TRAINING_BONUSES,
  buildOpshDraft,
  buildOpshPatch,
  linesFromList,
  listFromLines,
  opshDerivedDefense,
  opshHasNatural20,
  opshResourceFormula,
  opshRollExpression,
  parseAttributeScore,
  parseProgressionMode,
  type OpshAttributeKey,
  type OpshDraft,
  type OpshProgressionMode,
  type OpshSkillDraft,
  type OpshTraining,
} from './opSheetTypes';

const props = defineProps<{
  character: Character | null;
  canEdit: boolean;
}>();

const tabs = [
  { key: 'identidade', label: 'Identidade' },
  { key: 'atributos', label: 'Atributos & Perícias' },
  { key: 'recursos', label: 'Recursos' },
  { key: 'condicoes', label: 'Condições' },
  { key: 'rituais', label: 'Rituais' },
  { key: 'combate', label: 'Combate' },
  { key: 'inventario', label: 'Inventário' },
  { key: 'notas', label: 'Notas' },
];

const draft = ref<OpshDraft>(buildOpshDraft(props.character));
const activeTab = ref('identidade');
const dirty = ref(false);
const tableStore = getActivePinia() ? useTableStore() : null;

function touch() {
  dirty.value = true;
}

function resetFromCharacter(character: Character | null) {
  draft.value = buildOpshDraft(character);
  dirty.value = false;
}

watch(
  () => props.character?._id,
  (id) => {
    if (id) resetFromCharacter(props.character);
  },
  { immediate: true },
);

watch(
  () => props.character,
  (character) => {
    if (!character || dirty.value) return;
    resetFromCharacter(character);
  },
);

const tableId = computed(() => props.character?.tableId ?? '');
const characterId = computed(() => props.character?._id ?? '');

const recentRolls = computed(() => tableStore?.recentRolls ?? []);
const lastExpression = computed(() => {
  const id = characterId.value;
  if (!id) return null;
  return (
    recentRolls.value.find(
      (entry) => entry.characterId === id && (entry.kind === 'expression' || !entry.kind),
    ) ?? null
  );
});
/** 20 natural no dado escolhido: sucesso automático (não é crítico com dano). */
const lastNatural20 = computed(() => opshHasNatural20(lastExpression.value?.rolls));

const derivedDefense = computed(() =>
  opshDerivedDefense(draft.value.attributes.agilidade),
);

const defenseFormula = computed(() => `10 + AGI = ${derivedDefense.value}`);

const resourceFormula = computed(() =>
  opshResourceFormula({
    classe: draft.value.classe,
    sanityMode: draft.value.sanityMode,
    progressionMode: draft.value.progressionMode,
  }),
);

function attributeScore(key: OpshAttributeKey): number {
  return parseAttributeScore(draft.value.attributes[key]);
}

function setAttribute(key: OpshAttributeKey, value: string) {
  draft.value.attributes[key] = String(parseAttributeScore(value));
  touch();
}

function attributeOf(skill: OpshSkillDraft): OpshAttributeKey {
  return OPSH_ATTRIBUTE_KEYS.includes(skill.attribute as OpshAttributeKey)
    ? (skill.attribute as OpshAttributeKey)
    : 'vigor';
}

function setTraining(skill: OpshSkillDraft, event: Event) {
  if (!props.canEdit) return;
  const target = event.target as HTMLSelectElement | null;
  const parsed = Number(target?.value);
  skill.training = (OPSH_TRAINING_BONUSES.includes(parsed as OpshTraining)
    ? parsed
    : 0) as OpshTraining;
  touch();
}

function setStat(key: keyof OpshDraft['stats'], value: string) {
  draft.value.stats[key] = value;
  touch();
}

function setIdentityNumber(key: 'nivel' | 'idade', value: string) {
  draft.value[key] = value;
  touch();
}

function setSanityMode(mode: 'san' | 'pd') {
  if (!props.canEdit || draft.value.sanityMode === mode) return;
  draft.value.sanityMode = mode;
  touch();
}

function setProgressionMode(event: Event) {
  if (!props.canEdit) return;
  const target = event.target as HTMLSelectElement | null;
  draft.value.progressionMode = parseProgressionMode(target?.value) as OpshProgressionMode;
  touch();
}

/** Preenche a Defesa com 10 + Agilidade; o campo livre continua soberano. */
function applyDerivedDefense() {
  if (!props.canEdit) return;
  draft.value.stats.defense = String(derivedDefense.value);
  touch();
  toast.success(`Defesa definida em ${derivedDefense.value} (10 + Agilidade).`);
}

function setList(kind: 'conditions' | 'traumas', event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  draft.value[kind] = listFromLines(target?.value ?? '');
  touch();
}

// --- Listas dinâmicas -------------------------------------------------------

function addInjury() {
  draft.value.injuries.push({ attribute: 'agilidade', penalty: '', notes: '' });
  touch();
}

function removeInjury(index: number) {
  draft.value.injuries.splice(index, 1);
  touch();
}

function addRitual() {
  draft.value.rituals.push({ name: '', circle: '', cost: '', description: '' });
  touch();
}

function removeRitual(index: number) {
  draft.value.rituals.splice(index, 1);
  touch();
}

function addAttack() {
  draft.value.attacks.push({ name: '', bonus: '', damage: '', notes: '' });
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

async function rollSkill(skill: OpshSkillDraft) {
  if (!props.canEdit) return;
  const attribute = attributeOf(skill);
  const expression = opshRollExpression(attributeScore(attribute), skill.training);
  const label = `${skill.label} (${OPSH_ATTRIBUTE_LABELS[attribute]})`;
  await sendRoll({
    tableId: tableId.value,
    characterId: characterId.value,
    metadata: label,
    expression,
  });
}

async function rollAttribute(key: OpshAttributeKey) {
  if (!props.canEdit) return;
  const expression = opshRollExpression(attributeScore(key), 0);
  await sendRoll({
    tableId: tableId.value,
    characterId: characterId.value,
    metadata: `Teste de ${OPSH_ATTRIBUTE_LABELS[key]}`,
    expression,
  });
}

/** Efeito de medo: rola 2d10 (o número é a consulta; a tabela fica no livro). */
async function rollFear() {
  if (!props.canEdit) return;
  await sendRoll({
    tableId: tableId.value,
    characterId: characterId.value,
    metadata: 'Efeito de medo (2d10)',
    expression: '2d10',
  });
}

/** Ferimento debilitante: 1d6 (1 Agi, 2 For, 3 Int, 4 Pre, 5 Vig, 6 superficial). */
async function rollInjury() {
  if (!props.canEdit) return;
  await sendRoll({
    tableId: tableId.value,
    characterId: characterId.value,
    metadata: 'Ferimento debilitante (1d6)',
    expression: '1d6',
  });
}

async function rollAttack(attack: OpshDraft['attacks'][number]) {
  if (!props.canEdit) return;
  const bonus = Number(attack.bonus);
  const resolved = Number.isFinite(bonus) ? bonus : 0;
  const expression = `1d20kh1${resolved >= 0 ? '+' : ''}${resolved}`;
  const label = `Ataque: ${attack.name || 'sem nome'}`;
  await sendRoll({
    tableId: tableId.value,
    characterId: characterId.value,
    metadata: label,
    expression,
  });
}

function buildPatch(): Partial<CharacterDTO> {
  return buildOpshPatch(draft.value);
}

defineExpose({ buildPatch });
</script>

<template>
  <section class="opsh-sheet" aria-label="Ficha Sobrevivendo ao Horror">
    <SheetTabs :tabs="tabs" v-model="activeTab" />

    <div class="opsh-panels">
      <!-- Identidade -->
      <div v-show="activeTab === 'identidade'" class="opsh-panel">
        <div class="opsh-grid">
          <SheetField
            label="Nome"
            :model-value="draft.name"
            :readonly="!canEdit"
            placeholder="Nome do personagem"
            @update:model-value="draft.name = $event; touch()"
          />
          <SheetField
            label="Classe"
            :model-value="draft.classe"
            :readonly="!canEdit"
            placeholder="Combatente, Especialista, Ocultista…"
            @update:model-value="draft.classe = $event; touch()"
          />
          <SheetField
            label="Origem"
            :model-value="draft.origem"
            :readonly="!canEdit"
            placeholder="Origem do personagem"
            @update:model-value="draft.origem = $event; touch()"
          />
          <SheetField
            label="Trilha"
            :model-value="draft.trilha"
            :readonly="!canEdit"
            placeholder="Trilha (opcional)"
            @update:model-value="draft.trilha = $event; touch()"
          />
          <SheetField
            label="Profissão (perícia)"
            :model-value="draft.profissao"
            :readonly="!canEdit"
            placeholder="Ex.: psicólogo, engenheiro"
            @update:model-value="draft.profissao = $event; touch()"
          />
          <SheetField
            label="NEX"
            :model-value="draft.nex"
            :readonly="!canEdit"
            placeholder="Ex.: 45%"
            @update:model-value="draft.nex = $event; touch()"
          />
          <SheetField
            label="Patente"
            :model-value="draft.patente"
            :readonly="!canEdit"
            placeholder="Recruta, Operador…"
            @update:model-value="draft.patente = $event; touch()"
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
        <SheetField
          label="Conceito"
          :model-value="draft.conceito"
          :readonly="!canEdit"
          type="textarea"
          :rows="3"
          placeholder="Conceito, aparência, motivação…"
          @update:model-value="draft.conceito = $event; touch()"
        />
        <p class="opsh-hint">
          Atributos do OP1 vão de 0 a 5: todos começam em 1 e recebem 4 pontos
          (máximo inicial 3). Reduzir um atributo a 0 libera +1 ponto e rola
          <strong>2d20kl1</strong> (mantém o pior) nos testes daquele atributo.
        </p>
      </div>

      <!-- Atributos & Perícias -->
      <div v-show="activeTab === 'atributos'" class="opsh-panel">
        <section class="opsh-block" aria-label="Atributos">
          <header class="opsh-block__header">
            <h4>Atributos</h4>
            <small>Cada ponto é um d20 no teste</small>
          </header>
          <div class="opsh-attributes">
            <div
              v-for="key in OPSH_ATTRIBUTE_KEYS"
              :key="key"
              class="opsh-attribute"
            >
              <span class="opsh-attribute__label">{{ OPSH_ATTRIBUTE_LABELS[key] }}</span>
              <input
                class="opsh-attribute__input"
                type="number"
                min="0"
                max="5"
                :value="draft.attributes[key]"
                :readonly="!canEdit"
                :aria-label="OPSH_ATTRIBUTE_LABELS[key]"
                @change="setAttribute(key, ($event.target as HTMLInputElement).value)"
              />
              <span class="opsh-attribute__pool">
                {{ attributeScore(key) === 0 ? '2d20 (pior)' : `${attributeScore(key)}d20` }}
              </span>
              <button
                type="button"
                class="opsh-attribute__roll"
                :disabled="!canEdit"
                :aria-label="`Rolar teste de ${OPSH_ATTRIBUTE_LABELS[key]}`"
                @click="rollAttribute(key)"
              >
                Rolar
              </button>
            </div>
          </div>
        </section>

        <section
          v-for="key in OPSH_ATTRIBUTE_KEYS"
          :key="`skills-${key}`"
          class="opsh-block"
          :aria-label="`Perícias de ${OPSH_ATTRIBUTE_LABELS[key]}`"
        >
          <header class="opsh-block__header">
            <h4>{{ OPSH_ATTRIBUTE_LABELS[key] }}</h4>
            <small>
              {{ OPSH_ATTRIBUTE_SHORT[key] }} ·
              {{ attributeScore(key) === 0 ? '2d20 (pior)' : `${attributeScore(key)}d20` }}
            </small>
          </header>
          <div class="opsh-skill-list">
            <div
              v-for="skill in draft.skills.filter((row) => row.attribute === key)"
              :key="skill.key"
              class="opsh-skill"
            >
              <span class="opsh-skill__name">{{ skill.label }}</span>
              <label class="opsh-skill__training-label">
                <span class="opsh-sr-only">Treinamento de {{ skill.label }}</span>
                <select
                  class="opsh-skill__training"
                  :value="skill.training"
                  :disabled="!canEdit"
                  @change="setTraining(skill, $event)"
                >
                  <option v-for="bonus in OPSH_TRAINING_BONUSES" :key="bonus" :value="bonus">
                    +{{ bonus }}
                  </option>
                </select>
              </label>
              <span class="opsh-skill__expression">
                {{ opshRollExpression(attributeScore(key), skill.training) }}
              </span>
              <button
                type="button"
                class="opsh-skill__roll"
                :disabled="!canEdit"
                :aria-label="`Rolar ${skill.label}`"
                @click="rollSkill(skill)"
              >
                Rolar
              </button>
            </div>
          </div>
        </section>

        <section
          v-if="draft.skills.some((row) => row.legacy)"
          class="opsh-block"
          aria-label="Perícias de legado"
        >
          <header class="opsh-block__header">
            <h4>Perícias de legado</h4>
            <small>Preservadas da ficha antiga</small>
          </header>
          <div class="opsh-skill-list">
            <div
              v-for="skill in draft.skills.filter((row) => row.legacy)"
              :key="`legacy-${skill.key}`"
              class="opsh-skill is-legacy"
            >
              <span class="opsh-skill__name">{{ skill.label }}</span>
              <span class="opsh-skill__expression">+{{ skill.training }}</span>
              <button
                type="button"
                class="opsh-skill__roll"
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
      <div v-show="activeTab === 'recursos'" class="opsh-panel">
        <section class="opsh-block" aria-label="Modo de Sanidade">
          <header class="opsh-block__header">
            <h4>Sanidade</h4>
            <small>PE + SAN ou regra sem Sanidade (PD)</small>
          </header>
          <div class="opsh-toggle" role="group" aria-label="Modo de recursos mentais">
            <button
              type="button"
              class="opsh-toggle__option"
              :class="{ 'is-active': draft.sanityMode === 'san' }"
              :aria-pressed="draft.sanityMode === 'san' ? 'true' : 'false'"
              :disabled="!canEdit"
              @click="setSanityMode('san')"
            >
              PE + Sanidade
            </button>
            <button
              type="button"
              class="opsh-toggle__option"
              :class="{ 'is-active': draft.sanityMode === 'pd' }"
              :aria-pressed="draft.sanityMode === 'pd' ? 'true' : 'false'"
              :disabled="!canEdit"
              @click="setSanityMode('pd')"
            >
              PD (sem Sanidade)
            </button>
          </div>
        </section>

        <section class="opsh-block" aria-label="Recursos">
          <header class="opsh-block__header">
            <h4>PV, Defesa e recursos</h4>
            <label class="opsh-progression">
              <span>Progressão</span>
              <select
                class="opsh-field__control"
                :value="draft.progressionMode"
                :disabled="!canEdit"
                aria-label="Modo de progressão"
                @change="setProgressionMode"
              >
                <option value="nex">NEX</option>
                <option value="patente">Patente</option>
                <option value="estagio">Estágio (sobrevivente)</option>
              </select>
            </label>
          </header>
          <p class="opsh-formula" aria-live="polite">
            <strong>Fórmula:</strong> {{ resourceFormula }}
          </p>
          <div class="opsh-grid">
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
              label="Defesa"
              :model-value="draft.stats.defense"
              :readonly="!canEdit"
              type="number"
              :min="0"
              :hint="`Calculada: ${defenseFormula} (pode sobrescrever)`"
              @update:model-value="setStat('defense', $event)"
            />
            <template v-if="draft.sanityMode === 'san'">
              <SheetField
                label="PE atual"
                :model-value="draft.stats.currentPE"
                :readonly="!canEdit"
                type="number"
                :min="0"
                @update:model-value="setStat('currentPE', $event)"
              />
              <SheetField
                label="PE máximo"
                :model-value="draft.stats.maxPE"
                :readonly="!canEdit"
                type="number"
                :min="0"
                @update:model-value="setStat('maxPE', $event)"
              />
              <SheetField
                label="SAN atual"
                :model-value="draft.stats.currentSAN"
                :readonly="!canEdit"
                type="number"
                :min="0"
                @update:model-value="setStat('currentSAN', $event)"
              />
              <SheetField
                label="SAN máximo"
                :model-value="draft.stats.maxSAN"
                :readonly="!canEdit"
                type="number"
                :min="0"
                @update:model-value="setStat('maxSAN', $event)"
              />
            </template>
            <template v-else>
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
            </template>
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
            class="btn btn-xs"
            :disabled="!canEdit"
            @click="applyDerivedDefense"
          >
            Usar Defesa calculada ({{ defenseFormula }})
          </button>
          <p class="opsh-hint">
            Deslocamento padrão: 9 m (6 quadrados). Os campos atuais/máximos são
            manuais; a fórmula acima é só um lembrete.
          </p>
        </section>
      </div>

      <!-- Condições / ferimentos -->
      <div v-show="activeTab === 'condicoes'" class="opsh-panel">
        <section class="opsh-block" aria-label="Condições e traumas">
          <header class="opsh-block__header">
            <h4>Condições e traumas</h4>
            <small>Uma por linha</small>
          </header>
          <div class="opsh-grid">
            <label class="opsh-field">
              <span class="opsh-field__label">Condições</span>
              <textarea
                class="opsh-field__control"
                :value="linesFromList(draft.conditions)"
                :readonly="!canEdit"
                rows="3"
                @input="setList('conditions', $event)"
              ></textarea>
            </label>
            <label class="opsh-field">
              <span class="opsh-field__label">Traumas</span>
              <textarea
                class="opsh-field__control"
                :value="linesFromList(draft.traumas)"
                :readonly="!canEdit"
                rows="3"
                @input="setList('traumas', $event)"
              ></textarea>
            </label>
          </div>
        </section>

        <section class="opsh-block" aria-label="Ferimentos debilitantes">
          <header class="opsh-block__header">
            <h4>Ferimentos debilitantes</h4>
            <div class="opsh-record__actions">
              <button
                v-if="canEdit"
                type="button"
                class="btn btn-xs btn-ghost"
                @click="rollInjury"
              >
                Rolar 1d6
              </button>
              <button v-if="canEdit" type="button" class="btn btn-xs" @click="addInjury">
                Adicionar ferimento
              </button>
            </div>
          </header>
          <p class="opsh-hint">
            1d6:
            <template v-for="(entry, index) in OPSH_INJURY_ROLLS" :key="entry.roll">
              <span v-if="index"> · </span>{{ entry.roll }} {{ entry.label }}
            </template>
            — penalidade −O no atributo. Se Vigor, o PV máximo também cai 1 por 5% de NEX.
          </p>
          <p v-if="!draft.injuries.length" class="opsh-hint">
            Nenhum ferimento debilitante. A penalidade é aplicada ao atributo escolhido.
          </p>
          <div
            v-for="(injury, index) in draft.injuries"
            :key="`injury-${index}`"
            class="opsh-record"
          >
            <div class="opsh-grid">
              <label class="opsh-field">
                <span class="opsh-field__label">Atributo</span>
                <select
                  class="opsh-field__control"
                  :value="injury.attribute"
                  :disabled="!canEdit"
                  :aria-label="`Atributo do ferimento ${index + 1}`"
                  @change="injury.attribute = ($event.target as HTMLSelectElement).value; touch()"
                >
                  <option value="">—</option>
                  <option v-for="key in OPSH_ATTRIBUTE_KEYS" :key="key" :value="key">
                    {{ OPSH_ATTRIBUTE_LABELS[key] }}
                  </option>
                </select>
              </label>
              <SheetField
                label="Penalidade"
                :model-value="injury.penalty"
                :readonly="!canEdit"
                type="number"
                placeholder="0"
                @update:model-value="injury.penalty = $event; touch()"
              />
              <SheetField
                label="Notas"
                :model-value="injury.notes"
                :readonly="!canEdit"
                placeholder="Origem/cura"
                @update:model-value="injury.notes = $event; touch()"
              />
            </div>
            <div class="opsh-record__actions">
              <button
                v-if="canEdit"
                type="button"
                class="opsh-remove"
                :aria-label="`Remover ferimento ${index + 1}`"
                @click="removeInjury(index)"
              >
                ×
              </button>
            </div>
          </div>
        </section>

        <section class="opsh-block" aria-label="Medo e dano mental">
          <header class="opsh-block__header">
            <h4>Medo e dano mental</h4>
            <button type="button" class="btn btn-xs" :disabled="!canEdit" @click="rollFear">
              Rolar efeito de medo (2d10)
            </button>
          </header>
          <p class="opsh-hint">
            A fonte de medo causa dano mental (SAN no modo Sanidade, PD no modo
            sem Sanidade); Vontade pode anular ou reduzir. Com SAN/PD em 0, role
            2d10 (+1 por efeito anterior na cena) e consulte a Tabela 2.2 do
            livro. O resultado das rolagens fica no log e no card abaixo.
          </p>
        </section>
      </div>

      <!-- Rituais -->
      <div v-show="activeTab === 'rituais'" class="opsh-panel">
        <section class="opsh-block" aria-label="Rituais">
          <header class="opsh-block__header">
            <h4>Rituais</h4>
            <button v-if="canEdit" type="button" class="btn btn-xs" @click="addRitual">
              Adicionar ritual
            </button>
          </header>
          <p v-if="!draft.rituals.length" class="opsh-hint">Nenhum ritual registrado.</p>
          <div
            v-for="(ritual, index) in draft.rituals"
            :key="`ritual-${index}`"
            class="opsh-record"
          >
            <div class="opsh-grid">
              <SheetField
                label="Nome"
                :model-value="ritual.name"
                :readonly="!canEdit"
                @update:model-value="ritual.name = $event; touch()"
              />
              <SheetField
                label="Círculo"
                :model-value="ritual.circle"
                :readonly="!canEdit"
                placeholder="1..5"
                @update:model-value="ritual.circle = $event; touch()"
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
              @update:model-value="ritual.description = $event; touch()"
            />
            <div class="opsh-record__actions">
              <button
                v-if="canEdit"
                type="button"
                class="opsh-remove"
                :aria-label="`Remover ritual ${index + 1}`"
                @click="removeRitual(index)"
              >
                ×
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- Combate -->
      <div v-show="activeTab === 'combate'" class="opsh-panel">
        <section class="opsh-block" aria-label="Ataques">
          <header class="opsh-block__header">
            <h4>Ataques</h4>
            <button v-if="canEdit" type="button" class="btn btn-xs" @click="addAttack">
              Adicionar ataque
            </button>
          </header>
          <p v-if="!draft.attacks.length" class="opsh-hint">Nenhum ataque registrado.</p>
          <div
            v-for="(attack, index) in draft.attacks"
            :key="`attack-${index}`"
            class="opsh-record"
          >
            <div class="opsh-grid">
              <SheetField
                label="Nome"
                :model-value="attack.name"
                :readonly="!canEdit"
                @update:model-value="attack.name = $event; touch()"
              />
              <SheetField
                label="Bônus"
                :model-value="attack.bonus"
                :readonly="!canEdit"
                placeholder="+5"
                @update:model-value="attack.bonus = $event; touch()"
              />
              <SheetField
                label="Dano"
                :model-value="attack.damage"
                :readonly="!canEdit"
                placeholder="1d8+3"
                @update:model-value="attack.damage = $event; touch()"
              />
              <SheetField
                label="Notas"
                :model-value="attack.notes"
                :readonly="!canEdit"
                @update:model-value="attack.notes = $event; touch()"
              />
            </div>
            <div class="opsh-record__actions">
              <button
                type="button"
                class="btn btn-xs"
                :disabled="!canEdit"
                @click="rollAttack(attack)"
              >
                Rolar ataque
              </button>
              <button
                v-if="canEdit"
                type="button"
                class="opsh-remove"
                :aria-label="`Remover ataque ${index + 1}`"
                @click="removeAttack(index)"
              >
                ×
              </button>
            </div>
          </div>
        </section>

      </div>

      <!-- Inventário -->
      <div v-show="activeTab === 'inventario'" class="opsh-panel">
        <section class="opsh-block" aria-label="Inventário">
          <header class="opsh-block__header">
            <h4>Inventário</h4>
            <button v-if="canEdit" type="button" class="btn btn-xs" @click="addInventory">
              Adicionar item
            </button>
          </header>
          <p v-if="!draft.inventory.length" class="opsh-hint">Nenhum item no inventário.</p>
          <div
            v-for="(item, index) in draft.inventory"
            :key="`item-${index}`"
            class="opsh-record"
          >
            <div class="opsh-grid">
              <SheetField
                label="Item"
                :model-value="item.name"
                :readonly="!canEdit"
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
                @update:model-value="item.notes = $event; touch()"
              />
            </div>
            <div class="opsh-record__actions">
              <button
                v-if="canEdit"
                type="button"
                class="opsh-remove"
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
      <div v-show="activeTab === 'notas'" class="opsh-panel">
        <SheetField
          label="Notas livres"
          :model-value="draft.notes"
          :readonly="!canEdit"
          type="textarea"
          :rows="10"
          placeholder="Histórico, objetivos, NPCs, lembretes…"
          @update:model-value="draft.notes = $event; touch()"
        />
      </div>
    </div>

    <section v-if="lastExpression" class="opsh-last-result" aria-label="Última rolagem">
      <header class="opsh-block__header">
        <h4>Última rolagem</h4>
        <small>{{ lastExpression.metadata || lastExpression.expression }}</small>
      </header>
      <p class="opsh-last-roll">
        {{ lastExpression.expression }} →
        <strong>{{ lastExpression.total }}</strong>
        <span
          v-if="lastNatural20"
          class="opsh-natural20"
          title="20 natural no dado escolhido"
        >
          20 natural — sucesso automático
        </span>
      </p>
      <p class="opsh-hint">
        Um 20 natural no dado escolhido é sucesso automático. O OP1 não tem
        falha crítica por “todos 1”.
      </p>
    </section>
  </section>
</template>

<style scoped>
.opsh-sheet {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.opsh-panels {
  min-width: 0;
}

.opsh-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 4px;
}

.opsh-block {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.opsh-block__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.opsh-block__header h4 {
  margin: 0;
  font-size: 0.95rem;
}

.opsh-block__header small {
  color: var(--color-text-muted);
  font-size: 0.76rem;
}

.opsh-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.opsh-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.opsh-field__label {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.opsh-field__control {
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

.opsh-field__control[readonly],
.opsh-field__control:disabled {
  opacity: 0.75;
}

textarea.opsh-field__control {
  min-height: 80px;
  resize: vertical;
  line-height: 1.4;
}

.opsh-attributes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.opsh-attribute {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
}

.opsh-attribute__label {
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.opsh-attribute__input {
  width: 100%;
  min-height: 48px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.22);
  color: var(--color-text);
  font: inherit;
  font-size: 1.2rem;
  font-weight: 700;
  text-align: center;
}

.opsh-attribute__pool {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-accent-alt);
}

.opsh-attribute__roll {
  min-height: 36px;
  padding: 4px 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.opsh-toggle {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.opsh-toggle__option {
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
}

.opsh-toggle__option.is-active {
  background: var(--gradient-accent);
  border-color: var(--color-accent-alt);
  color: #12101a;
}

.opsh-skill-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2px 12px;
}

.opsh-skill {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 2px 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.opsh-skill__name {
  flex: 1;
  min-width: 0;
  font-size: 0.87rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.opsh-skill__training {
  min-height: 36px;
  padding: 4px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.18);
  color: var(--color-text);
  font: inherit;
  font-size: 0.84rem;
}

.opsh-skill__expression {
  font-family: var(--font-mono, monospace);
  font-size: 0.74rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.opsh-skill__roll {
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

.opsh-skill__roll:disabled,
.opsh-attribute__roll:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.opsh-skill.is-legacy {
  opacity: 0.85;
}

.opsh-record {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.1);
}

.opsh-record__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.opsh-remove {
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-danger);
  font-size: 1.2rem;
  cursor: pointer;
}

.opsh-progression {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.opsh-progression .opsh-field__control {
  width: auto;
  min-width: 150px;
  min-height: 36px;
  padding: 4px 8px;
}

.opsh-formula {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.opsh-last-result {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.18);
}

.opsh-last-roll {
  margin: 6px 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  font-size: 0.9rem;
}

.opsh-last-roll small {
  color: var(--color-text-muted);
  margin-left: 6px;
}

.opsh-natural20 {
  color: var(--color-warning);
  font-weight: 700;
}

.opsh-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.opsh-sr-only {
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
  .opsh-grid {
    grid-template-columns: 1fr 1fr;
  }

  .opsh-skill-list {
    grid-template-columns: 1fr;
  }

  .opsh-skill__expression {
    display: none;
  }
}
</style>
