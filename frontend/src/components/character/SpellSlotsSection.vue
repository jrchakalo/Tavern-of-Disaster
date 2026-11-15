<script setup lang="ts">
import type { SpellSlotDraft } from './sheetTypes';

const props = defineProps<{
  rows: SpellSlotDraft[];
  canEdit: boolean;
}>();

const emit = defineEmits<{ (e: 'change', rows: SpellSlotDraft[]): void }>();

function normalizedRows(): SpellSlotDraft[] {
  return props.rows.length ? props.rows : [{ key: '', used: '', max: '' }];
}

function setCell(index: number, field: 'key' | 'used' | 'max', event: Event) {
  const target = event.target as HTMLInputElement | null;
  const next = normalizedRows().map((row, rowIndex) =>
    rowIndex === index ? { ...row, [field]: target?.value ?? '' } : row,
  );
  emit('change', next);
}

function addRow() {
  emit('change', [...normalizedRows(), { key: '', used: '', max: '' }]);
}

function removeRow(index: number) {
  const next = normalizedRows().filter((_, rowIndex) => rowIndex !== index);
  emit('change', next);
}
</script>

<template>
  <section class="spell-slots" aria-label="Espaços de magia">
    <header class="spell-slots__header">
      <h4>Espaços de magia</h4>
      <button v-if="canEdit" class="btn btn-xs" type="button" @click="addRow">
        Adicionar nível
      </button>
    </header>

    <p class="spell-slots__hint">
      Um nível por linha (ex.: <code>1</code>, <code>2</code>…). Sem compêndio de magias — apenas
      controle de espaços usados e disponíveis.
    </p>

    <div class="spell-slots__head" aria-hidden="true">
      <span>Nível</span>
      <span>Usados</span>
      <span>Máx.</span>
      <span></span>
    </div>

    <div
      v-for="(row, index) in normalizedRows()"
      :key="`slot-${index}`"
      class="spell-slots__row"
    >
      <input
        :value="row.key"
        :readonly="!canEdit"
        placeholder="1"
        :aria-label="`Nível do espaço de magia ${index + 1}`"
        @input="setCell(index, 'key', $event)"
      />
      <input
        type="number"
        :min="0"
        :value="row.used"
        :readonly="!canEdit"
        placeholder="0"
        :aria-label="`Espaços usados do nível ${index + 1}`"
        @input="setCell(index, 'used', $event)"
      />
      <input
        type="number"
        :min="0"
        :value="row.max"
        :readonly="!canEdit"
        placeholder="0"
        :aria-label="`Espaços máximos do nível ${index + 1}`"
        @input="setCell(index, 'max', $event)"
      />
      <button
        v-if="canEdit"
        class="remove-btn"
        type="button"
        :aria-label="`Remover nível ${index + 1}`"
        @click="removeRow(index)"
      >
        ×
      </button>
    </div>
  </section>
</template>

<style scoped>
.spell-slots {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.spell-slots__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.spell-slots__header h4 {
  margin: 0;
  font-size: 0.95rem;
}

.spell-slots__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.spell-slots__head,
.spell-slots__row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}

.spell-slots__head {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-text-muted);
}

.spell-slots__row input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.22);
  color: var(--color-text);
  font: inherit;
  text-align: center;
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
