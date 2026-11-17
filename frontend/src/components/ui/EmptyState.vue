<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../Icon.vue'

/**
 * Estado vazio/erro/loading com a mesma gramática de arquivo das telas:
 * régua, título em Spectral e uma próxima ação obrigatória no slot.
 * Erros usam `role="alert"`; os demais são anunciados como status.
 */
const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    tone?: 'empty' | 'error' | 'loading'
    /** Rótulo curto acima do título, ex.: "Arquivo vazio". */
    eyebrow?: string
  }>(),
  {
    description: '',
    tone: 'empty',
    eyebrow: '',
  },
)

const role = computed(() => (props.tone === 'error' ? 'alert' : 'status'))
const icon = computed(() => (props.tone === 'error' ? 'alert' : 'info'))
</script>

<template>
  <section class="empty-state" :class="`empty-state--${tone}`" :role="role">
    <span class="empty-state__mark" aria-hidden="true">
      <Icon :name="icon" :size="18" />
    </span>
    <div class="empty-state__body">
      <p v-if="eyebrow" class="empty-state__eyebrow">{{ eyebrow }}</p>
      <h2 class="empty-state__title">{{ title }}</h2>
      <p v-if="description" class="empty-state__description">{{ description }}</p>
      <div v-if="$slots.default || $slots.actions" class="empty-state__actions">
        <slot />
        <slot name="actions" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.empty-state {
  display: flex;
  align-items: flex-start;
  gap: var(--s-4);
  padding: var(--s-6);
  border: 1px solid var(--line);
  border-left: 3px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
}

.empty-state--error {
  border-left-color: var(--danger);
}

.empty-state--loading {
  border-left-color: var(--accent);
}

.empty-state__mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  inline-size: 32px;
  block-size: 32px;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}

.empty-state--error .empty-state__mark {
  border-color: rgb(178 58 50 / 0.45);
  color: var(--danger-ink);
}

.empty-state--loading .empty-state__mark {
  border-color: rgb(47 108 132 / 0.5);
  color: var(--accent-ink);
}

.empty-state__body {
  min-width: 0;
}

.empty-state__eyebrow {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.empty-state__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.empty-state__description {
  max-width: 60ch;
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  font-size: var(--text-md);
  line-height: 1.55;
}

.empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-5);
}

@media (max-width: 640px) {
  .empty-state {
    padding: var(--s-5);
  }

  .empty-state__actions :deep(.btn) {
    flex: 1 1 auto;
  }
}
</style>
