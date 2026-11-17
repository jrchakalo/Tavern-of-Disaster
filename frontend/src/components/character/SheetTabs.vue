<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    tabs: Array<{ key: string; label: string }>;
    modelValue: string;
    /** Quebra em duas linhas em vez de rolar na horizontal (fichas com 4 seções). */
    wrap?: boolean;
    idPrefix?: string;
    label?: string;
  }>(),
  { wrap: false, idPrefix: 'sheet-tab', label: 'Seções da ficha' },
);

const emit = defineEmits<{ (e: 'update:modelValue', key: string): void }>();

const stripRef = ref<HTMLElement | null>(null);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function tabId(key: string): string {
  return `${props.idPrefix}-${key}`;
}

async function focusTab(index: number) {
  await nextTick();
  stripRef.value?.querySelectorAll<HTMLElement>('[role="tab"]')[index]?.focus();
}

/** Mantém a aba ativa visível sem esconder as demais: o trilho rola na horizontal. */
async function revealActiveTab() {
  await nextTick();
  const strip = stripRef.value;
  if (!strip || props.wrap) return;
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

function select(index: number) {
  const tab = props.tabs[index];
  if (!tab || tab.key === props.modelValue) {
    void focusTab(index);
    return;
  }
  emit('update:modelValue', tab.key);
  void focusTab(index);
}

function onKeydown(event: KeyboardEvent) {
  const total = props.tabs.length;
  if (!total) return;
  const current = Math.max(
    0,
    props.tabs.findIndex((tab) => tab.key === props.modelValue),
  );
  let next: number | null = null;
  if (event.key === 'ArrowRight') next = (current + 1) % total;
  else if (event.key === 'ArrowLeft') next = (current - 1 + total) % total;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = total - 1;
  if (next === null) return;
  event.preventDefault();
  select(next);
}
</script>

<template>
  <div
    ref="stripRef"
    class="sheet-tabs"
    :class="{ 'sheet-tabs--wrap': wrap }"
    role="tablist"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :id="tabId(tab.key)"
      type="button"
      role="tab"
      class="sheet-tabs__tab"
      :class="{ 'is-active': tab.key === modelValue }"
      :aria-selected="tab.key === modelValue ? 'true' : 'false'"
      :tabindex="tab.key === modelValue ? 0 : -1"
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

/* Fichas com poucas seções: todas visíveis, em duas colunas no celular. */
.sheet-tabs--wrap {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  overflow: visible;
  padding-bottom: 0;
}

.sheet-tabs--wrap .sheet-tabs__tab {
  width: 100%;
  text-align: center;
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
