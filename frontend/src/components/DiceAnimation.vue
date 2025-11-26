<script setup lang="ts">
import { computed } from 'vue';
import type { DiceRolledPayload } from '../types';

const props = defineProps<{ payload: DiceRolledPayload }>();
const emit = defineEmits<{ (e: 'dismiss'): void }>();

const title = computed(() => props.payload.metadata || props.payload.tags?.[0] || 'Rolagem enviada');
const modifierDisplay = computed(() => {
  const modifier = props.payload.modifier;
  if (!modifier) return '';
  return modifier > 0 ? `+${modifier}` : `${modifier}`;
});
const expressionSummary = computed(() => {
  const modifier = modifierDisplay.value;
  return modifier ? `${props.payload.expression} ${modifier}` : props.payload.expression;
});
const rollValues = computed(() => props.payload.rolls || []);
const hasDropped = computed(() => rollValues.value.some((roll) => roll.kept === 'dropped'));
const tagsDisplay = computed(() => props.payload.tags?.filter(Boolean).join(' • ') || null);
</script>

<template>
  <transition name="dice-fanfare">
    <div
      class="dice-animation-overlay"
      role="status"
      aria-live="polite"
      @click="emit('dismiss')"
    >
      <div class="dice-card surface" @click.stop>
        <p class="dice-eyebrow">🎲 Rolagem registrada</p>
        <h2 class="dice-title">{{ title }}</h2>
        <p class="dice-expression">{{ expressionSummary }}</p>
        <div class="dice-total">
          <span class="total-number">{{ props.payload.total }}</span>
          <span v-if="props.payload.modifier" class="total-note">Inclui modificador</span>
        </div>
        <div v-if="rollValues.length" class="dice-trail">
          <span
            v-for="(roll, index) in rollValues"
            :key="index"
            class="die"
            :class="{ kept: roll.kept === 'kept', dropped: roll.kept === 'dropped' }"
          >
            {{ roll.value }}
          </span>
        </div>
        <p v-if="hasDropped" class="dice-footnote">Dados em cinza foram descartados.</p>
        <p v-if="tagsDisplay" class="dice-tags">{{ tagsDisplay }}</p>
        <p class="dice-dismiss-hint">Clique para ocultar</p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.dice-fanfare-enter-active,
.dice-fanfare-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.dice-fanfare-enter-from,
.dice-fanfare-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
.dice-animation-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at center, rgba(88, 28, 135, 0.45), rgba(4, 3, 6, 0.92));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 20px;
  cursor: pointer;
  backdrop-filter: blur(2px);
}
.dice-card {
  max-width: 420px;
  width: 100%;
  border-radius: 24px;
  padding: 28px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(26, 20, 33, 0.95), rgba(8, 6, 12, 0.95));
  text-align: center;
  box-shadow: 0 15px 55px rgba(6, 1, 12, 0.65);
  animation: float 4s ease-in-out infinite alternate;
}
.dice-eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
}
.dice-title {
  margin: 4px 0 6px;
  font-size: 1.6rem;
}
.dice-expression {
  margin: 0;
  color: rgba(255, 255, 255, 0.85);
  font-size: 1rem;
}
.dice-total {
  margin: 18px 0 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}
.total-number {
  font-size: clamp(3rem, 9vw, 4.5rem);
  font-weight: 700;
  color: #f8f4ff;
  text-shadow: 0 6px 24px rgba(156, 93, 255, 0.55);
  animation: burst 0.6s ease;
}
.total-note {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
}
.dice-trail {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}
.die {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 1.1rem;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  transform: translateY(0);
  animation: rollIn 0.45s ease;
}
.die.kept {
  border-color: rgba(123, 245, 169, 0.9);
  box-shadow: 0 0 16px rgba(107, 255, 201, 0.35);
}
.die.dropped {
  opacity: 0.6;
  border-style: dashed;
}
.dice-footnote,
.dice-tags,
.dice-dismiss-hint {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.75);
}
.dice-dismiss-hint {
  margin-top: 10px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.55);
}
@keyframes float {
  from { transform: translateY(0px); }
  to { transform: translateY(-10px); }
}
@keyframes burst {
  0% { transform: scale(0.65); opacity: 0; }
  60% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); }
}
@keyframes rollIn {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@media (max-width: 480px) {
  .dice-card {
    padding: 20px;
  }
  .die {
    width: 42px;
    height: 42px;
  }
}
</style>
