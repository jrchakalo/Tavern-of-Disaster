<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Character, SystemDTO } from '../types';

type KeyValueEntry = { key: string; value: string };

const props = defineProps<{
  open: boolean;
  character: Character | null;
  isDM: boolean;
  isOwner: boolean;
  system?: SystemDTO | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', payload: Partial<Character>): void;
  (e: 'delete'): void;
}>();

const name = ref('');
const avatarUrl = ref('');
const notes = ref('');
const stats = ref({
  currentHP: null as number | null,
  maxHP: null as number | null,
  defense: null as number | null,
  baseInitiative: null as number | null,
});
const attributeEntries = ref<KeyValueEntry[]>([{ key: '', value: '' }]);
const skillEntries = ref<KeyValueEntry[]>([{ key: '', value: '' }]);
const systemAttributeValues = ref<Record<string, string>>({});

const canEdit = computed(() => props.isDM || props.isOwner);
const hasCharacterLoaded = computed(() => Boolean(props.character));
const systemAttributes = computed(() => props.system?.defaultAttributes ?? null);
const hasSystemAttributes = computed(() => Boolean(systemAttributes.value?.length));

function buildEntries(record?: Record<string, unknown> | null) {
  if (!record) return [{ key: '', value: '' }];
  const entries = Object.entries(record).map(([key, value]) => ({
    key,
    value: value === null || value === undefined ? '' : String(value),
  }));
  return entries.length ? entries : [{ key: '', value: '' }];
}

function syncFromCharacter() {
  const character = props.character;
  name.value = character?.name ?? '';
  avatarUrl.value = character?.avatarUrl ?? '';
  notes.value = character?.notes ?? '';
  stats.value = {
    currentHP: character?.stats?.currentHP ?? null,
    maxHP: character?.stats?.maxHP ?? null,
    defense: character?.stats?.defense ?? null,
    baseInitiative: character?.stats?.baseInitiative ?? null,
  };
  attributeEntries.value = buildEntries(character?.attributes || null);
  skillEntries.value = buildEntries(character?.skills || null);
  syncSystemAttributeValues();
}

function syncSystemAttributeValues() {
  const defaults = systemAttributes.value;
  if (!defaults?.length) {
    systemAttributeValues.value = {};
    return;
  }
  const characterAttributes = props.character?.attributes ?? {};
  const next: Record<string, string> = {};
  defaults.forEach((attr) => {
    const key = attr.key?.trim();
    if (!key) return;
    const value = characterAttributes[key];
    next[key] = value === undefined || value === null ? '' : String(value);
  });
  systemAttributeValues.value = next;
}

watch(
  () => [props.character, props.open],
  () => {
    if (!props.open) return;
    syncFromCharacter();
  },
  { immediate: true }
);

watch(systemAttributes, () => {
  if (!props.open) return;
  syncSystemAttributeValues();
});

function addAttributeRow() {
  attributeEntries.value.push({ key: '', value: '' });
}

function removeAttributeRow(index: number) {
  attributeEntries.value.splice(index, 1);
  if (!attributeEntries.value.length) {
    attributeEntries.value.push({ key: '', value: '' });
  }
}

function addSkillRow() {
  skillEntries.value.push({ key: '', value: '' });
}

function removeSkillRow(index: number) {
  skillEntries.value.splice(index, 1);
  if (!skillEntries.value.length) {
    skillEntries.value.push({ key: '', value: '' });
  }
}

function buildAttributesPayload() {
  const attributes: Record<string, number> = {};
  if (systemAttributes.value?.length) {
    systemAttributes.value.forEach(({ key }) => {
      const normalizedKey = key.trim();
      if (!normalizedKey) return;
      const raw = systemAttributeValues.value[normalizedKey];
      if (raw === undefined || raw === '') return;
      const numeric = Number(raw);
      if (Number.isNaN(numeric)) return;
      attributes[normalizedKey] = numeric;
    });
  }
  attributeEntries.value.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return;
    attributes[trimmedKey] = numeric;
  });
  return Object.keys(attributes).length ? attributes : undefined;
}

function buildSkillsPayload() {
  const skills: Record<string, number | string> = {};
  skillEntries.value.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return;
    const trimmedValue = value.trim();
    if (!trimmedValue.length) return;
    const numeric = Number(trimmedValue);
    skills[trimmedKey] = Number.isNaN(numeric) ? trimmedValue : numeric;
  });
  return Object.keys(skills).length ? skills : undefined;
}

function handleSystemAttributeInput(key: string, value: string) {
  systemAttributeValues.value = {
    ...systemAttributeValues.value,
    [key]: value,
  };
}

function handleSystemAttributeEvent(key: string, event: Event) {
  const target = event.target as HTMLInputElement | null;
  handleSystemAttributeInput(key, target?.value ?? '');
}

function buildStatsPayload() {
  const nextStats: Record<string, number> = {};
  if (stats.value.currentHP !== null) nextStats.currentHP = stats.value.currentHP;
  if (stats.value.maxHP !== null) nextStats.maxHP = stats.value.maxHP;
  if (stats.value.defense !== null) nextStats.defense = stats.value.defense;
  if (stats.value.baseInitiative !== null) nextStats.baseInitiative = stats.value.baseInitiative;
  return Object.keys(nextStats).length ? nextStats : undefined;
}

function handleSave() {
  if (!props.character || !canEdit.value) return;
  const payload: Partial<Character> = {
    name: name.value.trim() || props.character.name,
    avatarUrl: avatarUrl.value.trim() || undefined,
    notes: notes.value ?? '',
  };
  const statsPayload = buildStatsPayload();
  if (statsPayload) payload.stats = statsPayload;
  const attributesPayload = buildAttributesPayload();
  if (attributesPayload) payload.attributes = attributesPayload;
  const skillsPayload = buildSkillsPayload();
  if (skillsPayload) payload.skills = skillsPayload;
  emit('save', payload);
}

function handleDelete() {
  if (!props.character || !canEdit.value) return;
  emit('delete');
}
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="character-sheet-overlay" @click.self="emit('close')">
      <div class="character-sheet" role="dialog" aria-modal="true">
        <header class="sheet-header">
          <div>
            <p class="sheet-label">Ficha do Personagem</p>
            <h2>{{ name || character?.name || 'Novo personagem' }}</h2>
            <p v-if="!canEdit" class="readonly-hint">Visualização somente leitura</p>
          </div>
          <button class="close-btn" type="button" @click="emit('close')" aria-label="Fechar">×</button>
        </header>

        <section v-if="hasCharacterLoaded" class="sheet-body">
          <div class="identity-row">
            <label class="field-group">
              <span>Nome</span>
              <input v-model="name" :readonly="!canEdit" placeholder="Nome do personagem" />
            </label>
            <label class="field-group">
              <span>Avatar (URL)</span>
              <input v-model="avatarUrl" :readonly="!canEdit" placeholder="https://..." />
            </label>
          </div>

          <div class="avatar-preview">
            <img v-if="avatarUrl" :src="avatarUrl" alt="Avatar" @error="avatarUrl = ''" />
            <div v-else class="avatar-placeholder">Sem avatar</div>
          </div>

          <div class="stats-grid">
            <label class="field-group">
              <span>HP Atual</span>
              <input type="number" v-model.number="stats.currentHP" :readonly="!canEdit" />
            </label>
            <label class="field-group">
              <span>HP Máx.</span>
              <input type="number" v-model.number="stats.maxHP" :readonly="!canEdit" />
            </label>
            <label class="field-group">
              <span>Defesa / CA</span>
              <input type="number" v-model.number="stats.defense" :readonly="!canEdit" />
            </label>
            <label class="field-group">
              <span>Iniciativa Base</span>
              <input type="number" v-model.number="stats.baseInitiative" :readonly="!canEdit" />
            </label>
          </div>

          <div v-if="hasSystemAttributes" class="kv-section">
            <div class="section-header">
              <h3>Atributos do sistema</h3>
              <small class="system-attr-hint">{{ props.system?.name }}</small>
            </div>
            <div class="system-attributes">
              <div v-for="attr in systemAttributes" :key="attr.key" class="system-attr-row">
                <div class="system-attr-info">
                  <span class="system-attr-label">{{ attr.label }}</span>
                  <small class="system-attr-type">{{ attr.type }}</small>
                </div>
                <input
                  type="number"
                  :readonly="!canEdit"
                  :value="systemAttributeValues[attr.key] ?? ''"
                  placeholder="0"
                  @input="handleSystemAttributeEvent(attr.key, $event)"
                />
              </div>
            </div>
          </div>

          <div class="kv-section" v-if="hasSystemAttributes">
            <div class="section-header">
              <h3>Atributos adicionais</h3>
              <button v-if="canEdit" class="btn btn-xs" type="button" @click="addAttributeRow">Adicionar atributo</button>
            </div>
            <div class="kv-list">
              <div v-for="(attr, index) in attributeEntries" :key="`attr-extra-${index}`" class="kv-row">
                <input v-model="attr.key" :readonly="!canEdit" placeholder="Ex: Resistência" />
                <input type="number" v-model="attr.value" :readonly="!canEdit" placeholder="0" />
                <button v-if="canEdit" class="remove-btn" type="button" @click="removeAttributeRow(index)" aria-label="Remover atributo">×</button>
              </div>
            </div>
          </div>

          <div class="kv-section" v-else>
            <div class="section-header">
              <h3>Atributos</h3>
              <button v-if="canEdit" class="btn btn-xs" type="button" @click="addAttributeRow">Adicionar atributo</button>
            </div>
            <div class="kv-list">
              <div v-for="(attr, index) in attributeEntries" :key="`attr-${index}`" class="kv-row">
                <input v-model="attr.key" :readonly="!canEdit" placeholder="Ex: Força" />
                <input type="number" v-model="attr.value" :readonly="!canEdit" placeholder="0" />
                <button v-if="canEdit" class="remove-btn" type="button" @click="removeAttributeRow(index)" aria-label="Remover atributo">×</button>
              </div>
            </div>
          </div>

          <div class="kv-section">
            <div class="section-header">
              <h3>Perícias</h3>
              <button v-if="canEdit" class="btn btn-xs" type="button" @click="addSkillRow">Adicionar perícia</button>
            </div>
            <div class="kv-list">
              <div v-for="(skill, index) in skillEntries" :key="`skill-${index}`" class="kv-row">
                <input v-model="skill.key" :readonly="!canEdit" placeholder="Ex: Furtividade" />
                <input v-model="skill.value" :readonly="!canEdit" placeholder="+5 ou texto" />
                <button v-if="canEdit" class="remove-btn" type="button" @click="removeSkillRow(index)" aria-label="Remover perícia">×</button>
              </div>
            </div>
          </div>

          <label class="field-group">
            <span>Notas</span>
            <textarea v-model="notes" rows="4" :readonly="!canEdit" placeholder="Histórico, equipamentos, efeitos..."></textarea>
          </label>
        </section>

        <section v-else class="sheet-empty">
          <p>Nenhum personagem selecionado.</p>
        </section>

        <footer class="sheet-footer">
          <button class="btn btn-ghost" type="button" @click="emit('close')">Fechar</button>
          <div class="spacer" />
          <button v-if="canEdit && hasCharacterLoaded" class="btn btn-danger-outline" type="button" @click="handleDelete">Excluir</button>
          <button v-if="canEdit && hasCharacterLoaded" class="btn" type="button" @click="handleSave">Salvar alterações</button>
        </footer>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.character-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 16px;
}
.character-sheet {
  width: min(720px, 95vw);
  max-height: 95vh;
  overflow-y: auto;
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--elev-3);
  padding: 20px;
  color: var(--color-text);
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.sheet-label {
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 1px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text);
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
}
.readonly-hint {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
.sheet-body {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.identity-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.avatar-preview {
  width: 180px;
  height: 180px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  overflow: hidden;
  align-self: flex-start;
}
.avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-style: italic;
  background: rgba(0, 0, 0, 0.15);
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.field-group span {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.kv-section {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: rgba(0, 0, 0, 0.08);
}
.system-attributes {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.system-attr-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.system-attr-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.system-attr-label {
  font-weight: 600;
}
.system-attr-type {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.system-attr-row input {
  flex: 1;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: rgba(0, 0, 0, 0.2);
  color: inherit;
  padding: 8px;
}
.system-attr-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.kv-list {
  margin-top: 12px;
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
.kv-row input[readonly] {
  opacity: 0.8;
}
.remove-btn {
  background: transparent;
  border: none;
  color: var(--color-danger);
  font-size: 1.1rem;
  cursor: pointer;
}
.sheet-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-muted);
}
.sheet-footer {
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.sheet-footer .spacer {
  flex: 1;
}
@media (max-width: 640px) {
  .character-sheet {
    width: 100%;
    max-height: 100vh;
  }
  .kv-row {
    grid-template-columns: 1fr 1fr auto;
  }
  .avatar-preview {
    width: 100%;
    height: 200px;
  }
}
</style>
