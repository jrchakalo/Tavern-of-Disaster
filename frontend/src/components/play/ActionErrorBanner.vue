<script setup lang="ts">
defineProps<{ message: string }>();

const emit = defineEmits<{ (e: 'dismiss'): void }>();
</script>

<template>
  <div class="action-error" role="alert">
    <span class="action-error__icon" aria-hidden="true">!</span>
    <p class="action-error__message">{{ message }}</p>
    <button
      type="button"
      class="action-error__dismiss"
      aria-label="Fechar aviso"
      @click="emit('dismiss')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.action-error {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 12px 0;
  padding: 10px 12px;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: rgba(196, 71, 71, 0.14);
  color: var(--color-text);
}

.action-error__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--color-danger);
  color: #fff;
  font-weight: 700;
}

.action-error__message {
  flex: 1;
  margin: 0;
  font-size: 0.86rem;
  min-width: 0;
}

.action-error__dismiss {
  width: 44px;
  height: 44px;
  margin: -10px -12px -10px 0;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 1.3rem;
  cursor: pointer;
}

.action-error__dismiss:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: -2px;
}
</style>
