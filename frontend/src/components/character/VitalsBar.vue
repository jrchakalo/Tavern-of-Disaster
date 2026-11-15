<script setup lang="ts">
import SheetField from './SheetField.vue';
import type { SheetDraft, SheetPatch } from './sheetTypes';

const props = defineProps<{
  draft: SheetDraft;
  canEdit: boolean;
  patch: (patch: SheetPatch) => void;
}>();

const emit = defineEmits<{ (e: 'hp', value: number): void }>();

function currentHpValue(): number {
  const parsed = Number(props.draft.stats.currentHP);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maxHpValue(): number | null {
  const parsed = Number(props.draft.stats.maxHP);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number): number {
  const max = maxHpValue();
  const bounded = max !== null ? Math.min(value, max) : value;
  return Math.max(0, bounded);
}

function adjustHp(delta: number) {
  if (!props.canEdit) return;
  const next = clamp(currentHpValue() + delta);
  props.patch({ stats: { currentHP: String(next) } });
  emit('hp', next);
}
</script>

<template>
  <div class="vitals" aria-label="Vitais">
    <div class="vitals__hp">
      <button
        type="button"
        class="vitals__step"
        :disabled="!canEdit"
        aria-label="Diminuir PV em 1"
        @click="adjustHp(-1)"
      >
        −
      </button>
      <SheetField
        class="vitals__field"
        label="HP Atual"
        :model-value="draft.stats.currentHP"
        :readonly="!canEdit"
        type="number"
        :min="0"
        placeholder="0"
        @update:model-value="patch({ stats: { currentHP: $event } })"
      />
      <button
        type="button"
        class="vitals__step"
        :disabled="!canEdit"
        aria-label="Aumentar PV em 1"
        @click="adjustHp(1)"
      >
        +
      </button>
    </div>

    <SheetField
      label="HP Máximo"
      :model-value="draft.stats.maxHP"
      :readonly="!canEdit"
      type="number"
      :min="0"
      placeholder="0"
      @update:model-value="patch({ stats: { maxHP: $event } })"
    />
    <SheetField
      label="Defesa / CA"
      :model-value="draft.stats.defense"
      :readonly="!canEdit"
      type="number"
      :min="0"
      placeholder="0"
      @update:model-value="patch({ stats: { defense: $event } })"
    />
  </div>
</template>

<style scoped>
.vitals {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) minmax(120px, 1fr) minmax(120px, 1fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, rgba(152, 115, 79, 0.14), rgba(152, 115, 79, 0.04));
}

.vitals__hp {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.vitals__field {
  flex: 1;
  min-width: 0;
}

.vitals__step {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface-alt);
  color: var(--color-text);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.vitals__step:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.vitals__step:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .vitals {
    grid-template-columns: 1fr 1fr;
  }

  .vitals__hp {
    grid-column: 1 / -1;
  }
}
</style>
