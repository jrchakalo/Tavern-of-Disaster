<script setup lang="ts">
defineProps<{
  tabs: Array<{ key: string; label: string }>;
  modelValue: string;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', key: string): void }>();
</script>

<template>
  <div class="sheet-tabs" role="tablist" aria-label="Seções da ficha">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      role="tab"
      class="sheet-tabs__tab"
      :class="{ 'is-active': tab.key === modelValue }"
      :aria-selected="tab.key === modelValue ? 'true' : 'false'"
      @click="emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.sheet-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.sheet-tabs__tab {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: 0.86rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.sheet-tabs__tab:hover {
  color: var(--color-text);
  border-color: var(--color-border-strong);
}

.sheet-tabs__tab.is-active {
  background: var(--gradient-accent);
  border-color: var(--color-accent-alt);
  color: #12101a;
}

.sheet-tabs__tab:focus-visible {
  outline: 2px solid var(--color-accent-alt);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .sheet-tabs__tab {
    transition: none;
  }
}
</style>
