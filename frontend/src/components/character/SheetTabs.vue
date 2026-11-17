<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  tabs: Array<{ key: string; label: string }>;
  modelValue: string;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', key: string): void }>();

const stripRef = ref<HTMLElement | null>(null);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Mantém a aba ativa visível sem esconder as demais: o trilho rola na horizontal. */
async function revealActiveTab() {
  await nextTick();
  const strip = stripRef.value;
  if (!strip) return;
  const active = strip.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!active) return;
  const left = active.offsetLeft;
  const right = left + active.offsetWidth;
  const viewLeft = strip.scrollLeft;
  const viewRight = viewLeft + strip.clientWidth;
  if (left < viewLeft) {
    strip.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  } else if (right > viewRight) {
    strip.scrollTo({ left: right - strip.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
}

watch(
  () => [props.modelValue, props.tabs.length],
  () => {
    void revealActiveTab();
  },
  { immediate: true },
);
</script>

<template>
  <div ref="stripRef" class="sheet-tabs" role="tablist" aria-label="Seções da ficha">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      role="tab"
      class="sheet-tabs__tab"
      :class="{ 'is-active': tab.key === modelValue }"
      :aria-selected="tab.key === modelValue ? 'true' : 'false'"
      :data-tab-key="tab.key"
      @click="emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.sheet-tabs {
  display: flex;
  flex: 0 0 auto;
  gap: var(--s-2);
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: var(--s-2);
  scrollbar-width: thin;
  scroll-padding-inline: var(--s-2);
  scroll-snap-type: x proximity;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.sheet-tabs__tab {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  scroll-snap-align: start;
  cursor: pointer;
}

.sheet-tabs__tab:hover {
  color: var(--text);
  border-color: var(--focus);
}

.sheet-tabs__tab.is-active {
  border-color: var(--accent-ink);
  background: var(--raised-2);
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--accent-ink);
}

.sheet-tabs__tab:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .sheet-tabs__tab {
    transition: none;
  }
}
</style>
