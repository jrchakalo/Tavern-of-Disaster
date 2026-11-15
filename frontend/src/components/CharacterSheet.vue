<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Character, SystemDTO } from '../types';

import SheetTabs from './character/SheetTabs.vue';
import VitalsBar from './character/VitalsBar.vue';
import IdentitySection from './character/IdentitySection.vue';
import AbilitiesSection from './character/AbilitiesSection.vue';
import CombatSection from './character/CombatSection.vue';
import RecordListSection from './character/RecordListSection.vue';
import SpellSlotsSection from './character/SpellSlotsSection.vue';
import NotesSection from './character/NotesSection.vue';
import {
  applySheetPatch,
  buildDraft,
  buildPatch,
  isDndSheet,
  type SheetDraft,
  type SheetPatch,
  type SheetTabKey,
} from './character/sheetTypes';

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

const draft = ref<SheetDraft>(buildDraft(null));
const activeTab = ref<SheetTabKey>('identidade');
/** Houve edição desde a última sincronização: protege o rascunho de patches externos. */
const dirty = ref(false);

const canEdit = computed(() => props.isDM || props.isOwner);
const hasCharacterLoaded = computed(() => Boolean(props.character));
const systemKey = computed(() => props.character?.systemKey ?? props.system?.key ?? null);
const dnd = computed(() => isDndSheet(systemKey.value));
const systemLabel = computed(() => (props.system ? props.system.name : ''));
const systemAttributeKeys = computed(
  () => props.system?.defaultAttributes?.map((attribute) => attribute.key) ?? [],
);

const tabs: Array<{ key: SheetTabKey; label: string }> = [
  { key: 'identidade', label: 'Identidade' },
  { key: 'atributos', label: 'Atributos & Perícias' },
  { key: 'combate', label: 'Combate' },
  { key: 'ataques', label: 'Ataques' },
  { key: 'caracteristicas', label: 'Características' },
  { key: 'inventario', label: 'Inventário' },
  { key: 'magias', label: 'Magias' },
  { key: 'notas', label: 'Notas' },
];

function syncFromCharacter() {
  draft.value = buildDraft(props.character, {
    systemAttributeKeys: systemAttributeKeys.value,
    dnd: dnd.value,
  });
  dirty.value = false;
}

function applyPatch(patch: SheetPatch) {
  applySheetPatch(draft.value, patch);
  dirty.value = true;
}

// (Re)abre a ficha quando o diálogo abre ou o personagem muda de id.
watch(
  () => [props.open, props.character?._id] as const,
  ([open]) => {
    if (open) syncFromCharacter();
  },
  { immediate: true },
);

// Atualizações remotas (outro cliente salvou) entram só com rascunho limpo:
// enquanto o dono está digitando, o rascunho dele não pode ser sobrescrito.
watch(
  () => props.character,
  () => {
    if (!props.open || dirty.value) return;
    syncFromCharacter();
  },
);

function handleSave() {
  if (!props.character || !canEdit.value) return;
  emit(
    'save',
    buildPatch(draft.value, { fallbackName: props.character.name }),
  );
}

function handleDelete() {
  if (!props.character || !canEdit.value) return;
  emit('delete');
}

// --- Conversão das listas genéricas (RecordListSection) ----------------------

type RecordRow = Record<string, string>;

function recordsToDraft(
  kind: 'attacks' | 'features' | 'inventory',
  rows: RecordRow[],
): void {
  if (kind === 'attacks') {
    applyPatch({
      attacks: rows.map((row) => ({
        name: row.name ?? '',
        bonus: row.bonus ?? '',
        damage: row.damage ?? '',
        notes: row.notes ?? '',
      })),
    });
    return;
  }
  if (kind === 'features') {
    applyPatch({
      features: rows.map((row) => ({
        name: row.name ?? '',
        description: row.description ?? '',
      })),
    });
    return;
  }
  applyPatch({
    inventory: rows.map((row) => ({
      name: row.name ?? '',
      quantity: row.quantity ?? '',
      notes: row.notes ?? '',
    })),
  });
}

function draftToRecords(kind: 'attacks' | 'features' | 'inventory'): RecordRow[] {
  if (kind === 'attacks') {
    return draft.value.attacks.map((row) => ({ ...row }));
  }
  if (kind === 'features') {
    return draft.value.features.map((row) => ({ ...row }));
  }
  return draft.value.inventory.map((row) => ({ ...row }));
}
</script>

<template>
  <teleport to="body">
    <div v-if="open" class="character-sheet-overlay" @click.self="emit('close')">
      <div class="character-sheet" role="dialog" aria-modal="true" aria-label="Ficha do personagem">
        <header class="sheet-header">
          <div class="sheet-header__text">
            <p class="sheet-label">Ficha do Personagem</p>
            <h2>{{ draft.name || character?.name || 'Novo personagem' }}</h2>
            <p v-if="!canEdit && hasCharacterLoaded" class="readonly-hint">
              Visualização somente leitura
            </p>
            <p v-else-if="systemLabel" class="system-hint">
              Sistema: <strong>{{ systemLabel }}</strong>
            </p>
          </div>
          <button class="close-btn" type="button" aria-label="Fechar" @click="emit('close')">
            ×
          </button>
        </header>

        <section v-if="hasCharacterLoaded" class="sheet-body">
          <VitalsBar :draft="draft" :can-edit="canEdit" :patch="applyPatch" />

          <SheetTabs :tabs="tabs" v-model="activeTab" />

          <div class="sheet-tab-panels">
            <div v-show="activeTab === 'identidade'" class="sheet-tab-panel">
              <IdentitySection
                :draft="draft"
                :can-edit="canEdit"
                :patch="applyPatch"
                :dnd="dnd"
                :system-label="systemLabel"
              />
            </div>

            <div v-show="activeTab === 'atributos'" class="sheet-tab-panel">
              <AbilitiesSection
                :draft="draft"
                :can-edit="canEdit"
                :patch="applyPatch"
                :dnd="dnd"
                :system-attributes="system?.defaultAttributes ?? undefined"
              />
            </div>

            <div v-show="activeTab === 'combate'" class="sheet-tab-panel">
              <CombatSection :draft="draft" :can-edit="canEdit" :patch="applyPatch" :dnd="dnd" />
            </div>

            <div v-show="activeTab === 'ataques'" class="sheet-tab-panel">
              <RecordListSection
                kind="attacks"
                :rows="draftToRecords('attacks')"
                :can-edit="canEdit"
                @change="recordsToDraft('attacks', $event)"
              />
            </div>

            <div v-show="activeTab === 'caracteristicas'" class="sheet-tab-panel">
              <RecordListSection
                kind="features"
                :rows="draftToRecords('features')"
                :can-edit="canEdit"
                @change="recordsToDraft('features', $event)"
              />
            </div>

            <div v-show="activeTab === 'inventario'" class="sheet-tab-panel">
              <RecordListSection
                kind="inventory"
                :rows="draftToRecords('inventory')"
                :can-edit="canEdit"
                @change="recordsToDraft('inventory', $event)"
              />
            </div>

            <div v-show="activeTab === 'magias'" class="sheet-tab-panel">
              <SpellSlotsSection
                :rows="draft.spellSlots"
                :can-edit="canEdit"
                @change="applyPatch({ spellSlots: $event })"
              />
            </div>

            <div v-show="activeTab === 'notas'" class="sheet-tab-panel">
              <NotesSection
                :notes="draft.notes"
                :can-edit="canEdit"
                @update:notes="applyPatch({ notes: $event })"
              />
            </div>
          </div>
        </section>

        <section v-else class="sheet-empty">
          <p>Nenhum personagem selecionado.</p>
        </section>

        <footer class="sheet-footer">
          <button class="btn btn-ghost" type="button" @click="emit('close')">Fechar</button>
          <div class="spacer" />
          <button
            v-if="canEdit && hasCharacterLoaded"
            class="btn btn-danger-outline"
            type="button"
            @click="handleDelete"
          >
            Excluir
          </button>
          <button
            v-if="canEdit && hasCharacterLoaded"
            class="btn"
            type="button"
            @click="handleSave"
          >
            Salvar alterações
          </button>
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
  width: min(760px, 95vw);
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
.sheet-header__text {
  min-width: 0;
}
.sheet-label {
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 1px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.sheet-header h2 {
  margin: 0;
  overflow-wrap: anywhere;
}
.close-btn {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  color: var(--color-text);
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
}
.close-btn:focus-visible {
  outline: 2px solid var(--color-accent-alt);
  outline-offset: 2px;
}
.readonly-hint,
.system-hint {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font-size: 0.8rem;
}
.sheet-body {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sheet-tab-panels {
  min-width: 0;
}
.sheet-tab-panel {
  padding-top: 4px;
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
  position: sticky;
  bottom: -20px;
  background: linear-gradient(180deg, transparent, var(--color-surface) 30%);
  padding: 8px 0 4px;
}
.sheet-footer .spacer {
  flex: 1;
}
@media (max-width: 640px) {
  .character-sheet-overlay {
    padding: 0;
    align-items: flex-end;
  }
  .character-sheet {
    width: 100%;
    max-height: 96dvh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding: 16px 14px calc(16px + env(safe-area-inset-bottom));
  }
  .sheet-footer {
    bottom: -16px;
    flex-wrap: wrap;
  }
}
</style>
