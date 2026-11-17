<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Character, SystemDTO } from '../types';

import SheetTabs from './character/SheetTabs.vue';
import VitalsBar from './character/VitalsBar.vue';
import Op2Sheet from './character/Op2Sheet.vue';
import OpshSheet from './character/OpshSheet.vue';
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

const props = withDefaults(
  defineProps<{
    open: boolean;
    character: Character | null;
    isDM: boolean;
    isOwner: boolean;
    system?: SystemDTO | null;
    /** Salvamento em curso no pai: trava o botão e evita sobrescrever digitação. */
    saving?: boolean;
  }>(),
  { system: null, saving: false },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', payload: Partial<Character>): void;
  (e: 'delete'): void;
}>();

const draft = ref<SheetDraft>(buildDraft(null));
const activeTab = ref<SheetTabKey>('identidade');
/** Houve edição desde a última sincronização: protege o rascunho de patches externos. */
const dirty = ref(false);
/** Fichas OP2/OPSH controlam o próprio rascunho; elas informam sujeira por evento. */
const systemDirty = ref(false);
const remoteUpdated = ref(false);
const saveError = ref('');
const awaitingSave = ref(false);
const closeConfirm = ref(false);
const confirmingDelete = ref(false);
const closeCancelRef = ref<HTMLButtonElement | null>(null);

const sheetRef = ref<HTMLElement | null>(null);
const titleId = 'character-sheet-title';
let previouslyFocused: HTMLElement | null = null;

const sheetDirty = computed(() => dirty.value || systemDirty.value);

watch(
  () => props.open,
  async (open) => {
    if (open) {
      closeConfirm.value = false;
      confirmingDelete.value = false;
      saveError.value = '';
      remoteUpdated.value = false;
      previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      await nextTick();
      sheetRef.value?.focus();
      return;
    }
    const target = previouslyFocused;
    previouslyFocused = null;
    if (target?.isConnected) {
      await nextTick();
      target.focus();
    }
  },
  { immediate: true },
);

watch(closeConfirm, async (open) => {
  if (!open) return;
  await nextTick();
  closeCancelRef.value?.focus();
});

function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return;
  const root = sheetRef.value;
  if (!root) return;
  const focusables = Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/** Fichas de sistema próprio expõem `buildPatch`/`markSaved` para o rodapé. */
type SystemSheetHandle = {
  buildPatch: () => Partial<Character>;
  markSaved?: () => void;
};
const op2SheetRef = ref<SystemSheetHandle | null>(null);
const opshSheetRef = ref<SystemSheetHandle | null>(null);

const canEdit = computed(() => props.isDM || props.isOwner);
const hasCharacterLoaded = computed(() => Boolean(props.character));
const systemKey = computed(() => props.character?.systemKey ?? props.system?.key ?? null);
const dnd = computed(() => isDndSheet(systemKey.value));
const systemKind = computed<'op2' | 'opsh' | 'standard'>(() => {
  if (systemKey.value === 'ordem-paranormal-2') return 'op2';
  if (systemKey.value === 'ordem-paranormal-sobrevivendo-ao-horror') return 'opsh';
  return 'standard';
});
const SYSTEM_LABELS: Record<string, string> = {
  dnd5e: 'D&D 5e',
  'cyberpunk-red': 'Cyberpunk RED',
  'ordem-paranormal-2': 'Ordem Paranormal 2',
  'ordem-paranormal-sobrevivendo-ao-horror': 'Sobrevivendo ao Horror',
};
const systemLabel = computed(() => {
  const key = props.character?.systemKey;
  if (key && SYSTEM_LABELS[key]) return SYSTEM_LABELS[key];
  if (props.system) return props.system.name;
  if (systemKind.value === 'op2') return 'Ordem Paranormal 2';
  if (systemKind.value === 'opsh') return 'Sobrevivendo ao Horror';
  return '';
});
const sheetTitle = computed(() => {
  if (systemKind.value !== 'standard') return props.character?.name ?? 'Novo personagem';
  return draft.value.name || props.character?.name || 'Novo personagem';
});
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
  remoteUpdated.value = false;
  if (systemKind.value !== 'standard') return;
  draft.value = buildDraft(props.character, {
    systemAttributeKeys: systemAttributeKeys.value,
    dnd: dnd.value,
  });
  dirty.value = false;
}

function applyPatch(patch: SheetPatch) {
  applySheetPatch(draft.value, patch);
  dirty.value = true;
  saveError.value = '';
}

// (Re)abre a ficha quando o diálogo abre ou o personagem muda de id.
// Comparação por id (primitivo): troca de identidade do objeto com o mesmo id
// NÃO reseta o rascunho — isso fica por conta do guard de `dirty` abaixo.
watch(
  () => (props.open ? props.character?._id ?? null : null),
  (id) => {
    if (id === null) return;
    systemDirty.value = false;
    remoteUpdated.value = false;
    saveError.value = '';
    awaitingSave.value = false;
    syncFromCharacter();
  },
  { immediate: true },
);

// Atualizações remotas (outro cliente salvou) entram só com rascunho limpo:
// enquanto o dono está digitando, o rascunho dele não pode ser sobrescrito.
watch(
  () => props.character,
  () => {
    if (!props.open) return;
    if (props.saving || awaitingSave.value) {
      awaitingSave.value = false;
      syncFromCharacter();
      return;
    }
    if (sheetDirty.value) {
      remoteUpdated.value = true;
      return;
    }
    syncFromCharacter();
  },
);

watch(systemDirty, (value) => {
  if (value) saveError.value = '';
  else remoteUpdated.value = false;
});

function handleSave() {
  if (!props.character || !canEdit.value) return;
  if (!sheetDirty.value && systemKind.value === 'standard') return;
  saveError.value = '';
  awaitingSave.value = true;
  if (systemKind.value !== 'standard') {
    const handle = systemKind.value === 'op2' ? op2SheetRef.value : opshSheetRef.value;
    const payload = handle?.buildPatch();
    if (!payload) return;
    emit('save', { ...payload, name: payload.name || props.character.name });
    return;
  }
  emit('save', buildPatch(draft.value, { fallbackName: props.character.name }));
}

function handleDelete() {
  if (!props.character || !canEdit.value) return;
  confirmingDelete.value = false;
  emit('delete');
}

function requestClose() {
  if (sheetDirty.value && !props.saving) {
    closeConfirm.value = true;
    return;
  }
  emit('close');
}

function confirmDiscard() {
  closeConfirm.value = false;
  dirty.value = false;
  systemDirty.value = false;
  remoteUpdated.value = false;
  saveError.value = '';
  emit('close');
}

function handleEscape() {
  if (confirmingDelete.value) {
    confirmingDelete.value = false;
    return;
  }
  if (closeConfirm.value) {
    closeConfirm.value = false;
    return;
  }
  requestClose();
}

/** Chamado pelo pai depois de um salvamento aceito pelo servidor. */
function notifySaved() {
  awaitingSave.value = false;
  closeConfirm.value = false;
  saveError.value = '';
  remoteUpdated.value = false;
  dirty.value = false;
  systemDirty.value = false;
  if (props.character) {
    if (systemKind.value === 'standard') {
      draft.value = buildDraft(props.character, {
        systemAttributeKeys: systemAttributeKeys.value,
        dnd: dnd.value,
      });
    } else {
      const handle = systemKind.value === 'op2' ? op2SheetRef.value : opshSheetRef.value;
      handle?.markSaved?.();
    }
  }
}

/** Chamado pelo pai quando o servidor recusa o salvamento. */
function notifySaveError(message: string) {
  awaitingSave.value = false;
  saveError.value = message;
}

defineExpose({ notifySaved, notifySaveError });

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
    <div
      v-if="open"
      class="character-sheet-overlay"
      @click.self="requestClose"
      @keydown.esc.prevent="handleEscape"
      @keydown="trapFocus"
    >
      <div
        ref="sheetRef"
        class="character-sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
      >
        <header class="sheet-header">
          <div class="sheet-header__text">
            <p class="sheet-label">Ficha do Personagem</p>
            <h2 :id="titleId">{{ sheetTitle }}</h2>
            <p v-if="!canEdit && hasCharacterLoaded" class="readonly-hint">
              Visualização somente leitura
            </p>
            <p v-else-if="systemLabel" class="system-hint">
              Sistema: <strong>{{ systemLabel }}</strong>
            </p>
          </div>
          <button class="close-btn" type="button" aria-label="Fechar" @click="requestClose">
            ×
          </button>
        </header>

        <section v-if="hasCharacterLoaded" class="sheet-body">
          <p v-if="remoteUpdated" class="sheet-banner" role="status">
            Atualizado por outro cliente enquanto você editava. Suas alterações continuam aqui.
          </p>

          <Op2Sheet
            v-if="systemKind === 'op2'"
            ref="op2SheetRef"
            :character="character"
            :can-edit="canEdit"
            @dirty="systemDirty = $event"
          />
          <OpshSheet
            v-else-if="systemKind === 'opsh'"
            ref="opshSheetRef"
            :character="character"
            :can-edit="canEdit"
            @dirty="systemDirty = $event"
          />

          <template v-else>
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
          </template>

          <div
            v-if="confirmingDelete"
            class="sheet-confirm sheet-confirm--danger"
            role="alertdialog"
            aria-labelledby="character-delete-title"
          >
            <p id="character-delete-title" class="sheet-confirm__text">
              Excluir “{{ sheetTitle }}”? A ficha e o vínculo com tokens serão removidos. Esta ação
              não pode ser desfeita.
            </p>
            <div class="sheet-confirm__actions">
              <button type="button" class="btn secondary" @click="confirmingDelete = false">
                Cancelar
              </button>
              <button type="button" class="btn danger" @click="handleDelete">Excluir ficha</button>
            </div>
          </div>
        </section>

        <section v-else class="sheet-empty">
          <p>Nenhum personagem selecionado.</p>
        </section>

        <div v-if="closeConfirm" class="sheet-confirm" role="alertdialog" aria-labelledby="character-close-title">
          <p id="character-close-title" class="sheet-confirm__text">
            Descartar as alterações não salvas de “{{ sheetTitle }}”?
          </p>
          <div class="sheet-confirm__actions">
            <button ref="closeCancelRef" type="button" class="btn secondary" @click="closeConfirm = false">
              Continuar editando
            </button>
            <button type="button" class="btn danger" @click="confirmDiscard">
              Descartar e fechar
            </button>
          </div>
        </div>

        <footer class="sheet-footer">
          <div class="sheet-footer__status">
            <span v-if="saveError" class="sheet-save-error" role="alert" aria-live="assertive">
              {{ saveError }}
            </span>
            <span v-else-if="remoteUpdated" class="sheet-remote" role="status">
              Atualizado por outro cliente
            </span>
            <span v-else-if="sheetDirty" class="sheet-dirty" role="status">Alterações não salvas</span>
            <span v-else class="sheet-clean">Ficha sincronizada</span>
          </div>
          <div class="sheet-footer__actions">
            <button class="btn btn-ghost" type="button" @click="requestClose">Fechar</button>
            <button
              v-if="canEdit && hasCharacterLoaded"
              class="btn btn-danger-outline"
              type="button"
              :disabled="saving"
              @click="confirmingDelete = true"
            >
              Excluir
            </button>
            <button
              v-if="canEdit && hasCharacterLoaded"
              class="btn"
              type="button"
              :disabled="saving || (systemKind === 'standard' && !sheetDirty)"
              @click="handleSave"
            >
              {{ saving ? 'Salvando…' : 'Salvar alterações' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.character-sheet-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    max(16px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  overflow: hidden;
  background: rgb(4 6 7 / 0.78);
  overscroll-behavior: contain;
  z-index: 120;
}

.character-sheet {
  display: flex;
  flex-direction: column;
  width: min(760px, 95vw);
  max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px);
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
}

.character-sheet:focus {
  outline: none;
}

.sheet-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-5) var(--s-5) var(--s-4);
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

.sheet-header__text {
  min-width: 0;
}

.sheet-label {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.sheet-header h2 {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-xl);
}

.close-btn {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-size: var(--text-xl);
  line-height: 1;
  cursor: pointer;
}

.close-btn:hover {
  background: var(--raised);
}

.close-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.readonly-hint,
.system-hint {
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.sheet-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--s-4);
  min-height: 0;
  padding: var(--s-4) var(--s-5);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scroll-padding-bottom: var(--s-6);
}

.sheet-banner {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--manila);
  background: rgb(217 180 91 / 0.08);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.sheet-banner--error {
  border-left-color: var(--danger);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
}

.sheet-tab-panels {
  min-width: 0;
}

.sheet-tab-panel {
  padding-top: var(--s-2);
}

.sheet-empty {
  flex: 1;
  padding: var(--s-8) var(--s-5);
  color: var(--text-muted);
  text-align: center;
}

.sheet-confirm {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: var(--s-3);
  margin: 0 var(--s-5) var(--s-3);
  padding: var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
}

.sheet-confirm--danger {
  border-color: rgb(178 58 50 / 0.65);
}

.sheet-confirm__text {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
}

.sheet-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.sheet-confirm__actions .btn {
  min-height: 44px;
}

.sheet-footer {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-5);
  padding-bottom: max(var(--s-3), env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
  background: var(--panel);
}

.sheet-footer__status {
  min-width: 0;
}

.sheet-dirty {
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.sheet-remote {
  color: var(--accent-ink);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.sheet-save-error {
  color: var(--danger-ink);
  font-size: var(--text-xs);
}

.sheet-clean {
  color: var(--text-faint);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.sheet-footer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-left: auto;
}

.sheet-footer__actions .btn {
  min-height: 44px;
}

@media (max-width: 640px) {
  .character-sheet-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .character-sheet {
    width: 100%;
    max-height: none;
    height: calc(100dvh - env(safe-area-inset-top) - 4px);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .sheet-header {
    padding: var(--s-3) var(--s-4);
  }

  .sheet-body {
    padding: var(--s-3) var(--s-4);
  }

  .sheet-confirm {
    margin-inline: var(--s-4);
  }

  .sheet-footer {
    padding: var(--s-2) var(--s-4);
    padding-bottom: max(var(--s-2), env(safe-area-inset-bottom));
  }

  .sheet-footer__actions {
    flex: 1 1 100%;
  }

  .sheet-footer__actions .btn {
    flex: 1 1 auto;
  }

  .character-sheet :deep(input),
  .character-sheet :deep(select),
  .character-sheet :deep(textarea) {
    font-size: var(--text-base);
  }
}

@media (max-width: 360px) {
  .sheet-footer__actions .btn {
    flex-basis: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .close-btn {
    transition: none;
  }
}
</style>
