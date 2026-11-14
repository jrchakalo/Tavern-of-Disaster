<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import DiceRoller from '../DiceRoller.vue';

const props = defineProps<{
  open: boolean;
  tableId: string;
  currentTokenId?: string | null;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const panelRef = ref<HTMLElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    panelRef.value?.focus();
  },
);

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
  }
}
</script>

<template>
  <div v-if="open" class="dice-overlay" @click.self="emit('close')">
    <section
      ref="panelRef"
      class="dice-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Rolagem de dados"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <div class="dice-sheet__bar" aria-hidden="true"></div>
      <div class="dice-sheet__actions">
        <button
          type="button"
          class="dice-sheet__close"
          aria-label="Fechar rolagem de dados"
          @click="emit('close')"
        >
          ×
        </button>
      </div>
      <DiceRoller
        :table-id="tableId"
        :current-token-id="currentTokenId"
        mode="embedded"
        default-expression="1d20"
      />
    </section>
  </div>
</template>

<style scoped>
.dice-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(10, 7, 10, 0.6);
}

.dice-sheet {
  position: relative;
  width: min(480px, 100%);
  max-height: 82%;
  overflow-y: auto;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
  border: 1px solid var(--color-border-strong);
  border-radius: 16px 16px 0 0;
  background: var(--color-surface);
  box-shadow: var(--elev-3);
}

.dice-sheet:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: -2px;
}

.dice-sheet__bar {
  width: 44px;
  height: 4px;
  margin: 0 auto 8px;
  border-radius: var(--radius-pill);
  background: var(--color-border-strong);
}

.dice-sheet__actions {
  position: absolute;
  top: 8px;
  right: 8px;
}

.dice-sheet__close {
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface-alt);
  color: inherit;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.dice-sheet__close:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: 2px;
}
</style>
