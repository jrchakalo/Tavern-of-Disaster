<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    modelValue: string;
    type?: 'text' | 'number' | 'url' | 'textarea';
    readonly?: boolean;
    placeholder?: string;
    min?: number;
    max?: number;
    step?: string | number;
    rows?: number;
    hint?: string;
  }>(),
  {
    type: 'text',
    readonly: false,
    placeholder: '',
    min: undefined,
    max: undefined,
    step: undefined,
    rows: 3,
    hint: '',
  },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  emit('update:modelValue', target?.value ?? '');
}
</script>

<template>
  <label class="sheet-field">
    <span class="sheet-field__label">{{ label }}</span>
    <textarea
      v-if="type === 'textarea'"
      class="sheet-field__control"
      :value="modelValue"
      :readonly="readonly"
      :placeholder="placeholder"
      :rows="rows"
      @input="handleInput"
    ></textarea>
    <input
      v-else
      class="sheet-field__control"
      :type="type === 'number' ? 'number' : type === 'url' ? 'url' : 'text'"
      :value="modelValue"
      :readonly="readonly"
      :placeholder="placeholder"
      :min="min"
      :max="max"
      :step="step"
      @input="handleInput"
    />
    <small v-if="hint" class="sheet-field__hint">{{ hint }}</small>
  </label>
</template>

<style scoped>
.sheet-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.sheet-field__label {
  font-size: 0.78rem;
  letter-spacing: 0.3px;
  color: var(--color-text-muted);
}

.sheet-field__control {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.18);
  color: var(--color-text);
  font: inherit;
}

.sheet-field__control:focus-visible {
  outline: 2px solid var(--color-accent-alt);
  outline-offset: 1px;
}

.sheet-field__control[readonly] {
  opacity: 0.75;
  cursor: default;
}

textarea.sheet-field__control {
  min-height: 96px;
  resize: vertical;
  line-height: 1.45;
}

.sheet-field__hint {
  font-size: 0.74rem;
  color: var(--color-text-muted);
}
</style>
