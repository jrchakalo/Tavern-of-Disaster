<script setup lang="ts">
import type { RecordListKind } from './sheetTypes';

type FieldConfig = { key: string; label: string; type?: 'number'; placeholder?: string };

const CONFIG: Record<
  RecordListKind,
  { title: string; addLabel: string; empty: string; fields: FieldConfig[]; columns: string }
> = {
  attacks: {
    title: 'Ataques',
    addLabel: 'Adicionar ataque',
    empty: 'Nenhum ataque registrado.',
    columns: 'minmax(120px, 2fr) minmax(70px, 1fr) minmax(90px, 1fr) auto',
    fields: [
      { key: 'name', label: 'Nome', placeholder: 'Ex.: Espada longa' },
      { key: 'bonus', label: 'Bônus', placeholder: '+5' },
      { key: 'damage', label: 'Dano', placeholder: '1d8+3' },
      { key: 'notes', label: 'Notas', placeholder: 'Alcance, propriedades…' },
    ],
  },
  features: {
    title: 'Características',
    addLabel: 'Adicionar característica',
    empty: 'Nenhuma característica registrada.',
    columns: 'minmax(120px, 1fr) minmax(160px, 2fr) auto',
    fields: [
      { key: 'name', label: 'Nome', placeholder: 'Ex.: Ataque Furtivo' },
      { key: 'description', label: 'Descrição', placeholder: 'Como funciona' },
    ],
  },
  inventory: {
    title: 'Inventário',
    addLabel: 'Adicionar item',
    empty: 'Nenhum item no inventário.',
    columns: 'minmax(120px, 2fr) minmax(64px, 1fr) minmax(120px, 2fr) auto',
    fields: [
      { key: 'name', label: 'Item', placeholder: 'Ex.: Corda' },
      { key: 'quantity', label: 'Qtd.', type: 'number', placeholder: '1' },
      { key: 'notes', label: 'Notas', placeholder: 'Detalhes' },
    ],
  },
};

const props = defineProps<{
  kind: RecordListKind;
  rows: Array<Record<string, string>>;
  canEdit: boolean;
}>();

const emit = defineEmits<{ (e: 'change', rows: Array<Record<string, string>>): void }>();

const config = CONFIG[props.kind];

function emptyRow(): Record<string, string> {
  const row: Record<string, string> = {};
  config.fields.forEach((field) => {
    row[field.key] = '';
  });
  return row;
}

function normalizedRows(): Array<Record<string, string>> {
  return props.rows.length ? props.rows : [emptyRow()];
}

function setCell(index: number, key: string, event: Event) {
  const target = event.target as HTMLInputElement | null;
  const next = normalizedRows().map((row, rowIndex) =>
    rowIndex === index ? { ...row, [key]: target?.value ?? '' } : row,
  );
  emit('change', next);
}

function addRow() {
  emit('change', [...normalizedRows(), emptyRow()]);
}

function removeRow(index: number) {
  const next = normalizedRows().filter((_, rowIndex) => rowIndex !== index);
  emit('change', next);
}
</script>

<template>
  <section class="record-list" :aria-label="config.title">
    <header class="record-list__header">
      <h4>{{ config.title }}</h4>
      <button v-if="canEdit" class="btn btn-xs" type="button" @click="addRow">
        {{ config.addLabel }}
      </button>
    </header>

    <div
      v-for="(row, index) in normalizedRows()"
      :key="`${kind}-${index}`"
      class="record-row"
      :style="{ gridTemplateColumns: config.columns }"
    >
      <label
        v-for="field in config.fields"
        :key="field.key"
        class="record-row__field"
        :class="{ 'record-row__field--wide': field.key === 'description' || field.key === 'notes' }"
      >
        <span>{{ field.label }}</span>
        <input
          :type="field.type === 'number' ? 'number' : 'text'"
          :value="row[field.key] ?? ''"
          :readonly="!canEdit"
          :placeholder="field.placeholder"
          :aria-label="`${config.title}: ${field.label} ${index + 1}`"
          @input="setCell(index, field.key, $event)"
        />
      </label>
      <button
        v-if="canEdit"
        class="remove-btn"
        type="button"
        :aria-label="`Remover ${config.title.toLowerCase()} ${index + 1}`"
        @click="removeRow(index)"
      >
        ×
      </button>
    </div>
  </section>
</template>

<style scoped>
.record-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.record-list__header h4 {
  margin: 0;
  font-size: 0.95rem;
}

.record-row {
  display: grid;
  gap: 8px;
  align-items: end;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.12);
}

.record-row__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.record-row__field span {
  font-size: 0.74rem;
  color: var(--color-text-muted);
}

.record-row__field input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.22);
  color: var(--color-text);
  font: inherit;
}

.record-row__field input[readonly] {
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

@media (max-width: 640px) {
  .record-row {
    grid-template-columns: 1fr 1fr !important;
  }
}
</style>
