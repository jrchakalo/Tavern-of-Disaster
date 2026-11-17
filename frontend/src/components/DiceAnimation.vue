<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DiceRolledPayload } from '../types';
import DiceArt from './dice/DiceArt.vue';
import { diceArtFor, formatModifier } from './dice/dieShapes';

/**
 * Momento assinatura "Arquivo Morto": uma ficha de papel registra a rolagem,
 * com carimbo, régua manila e números em mono. O contrato público continua o
 * mesmo do DM (`payload` + `dismiss`); `variant="tv"` amplia a escala e
 * `variant="player"` vira um bilhete compacto sobre a mesa do celular.
 */
const props = withDefaults(
  defineProps<{
    payload: DiceRolledPayload;
    variant?: 'card' | 'tv' | 'player' | 'dm';
  }>(),
  { variant: 'card' },
);

const emit = defineEmits<{ (e: 'dismiss'): void }>();

/**
 * No celular o momento não pode virar bloqueio: some sozinho em 2,8 s, dentro
 * da janela de 2,6–3,2 s combinada com o jogador. No cockpit do Mestre o
 * bilhete é um card compacto no canto: 3,2 s, sem escurecer o tabuleiro.
 */
const PLAYER_DISMISS_MS = 2800;
const DM_DISMISS_MS = 3200;

const momentKey = ref(0);
const prefersReducedMotion = ref(
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false,
);
const isPlayer = computed(() => props.variant === 'player');
const isDm = computed(() => props.variant === 'dm');
/** Variantes em que o bilhete é compacto e clicável, não um palco modal. */
const isCompact = computed(() => isPlayer.value || isDm.value);

let motionQuery: MediaQueryList | null = null;
let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
let dismissed = false;

function clearAutoDismiss() {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
}

function scheduleAutoDismiss() {
  clearAutoDismiss();
  if (!isCompact.value) return;
  autoDismissTimer = setTimeout(() => dismiss(), isDm.value ? DM_DISMISS_MS : PLAYER_DISMISS_MS);
}

/** Vibração curta e opcional: nunca é requisito, nunca roda em reduced motion. */
function maybeVibrate() {
  if (!isPlayer.value || prefersReducedMotion.value) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(20);
  } catch {
    // Aparelho/navegador sem suporte — o momento visual já basta.
  }
}

function dismiss() {
  if (dismissed) return;
  dismissed = true;
  clearAutoDismiss();
  emit('dismiss');
}

/** No celular/cockpit, tocar no próprio bilhete também fecha. */
function handleSlipClick(event: MouseEvent) {
  event.stopPropagation();
  if (isCompact.value) dismiss();
}

const title = computed(() => props.payload.metadata || props.payload.tags?.[0] || 'Rolagem');
const expression = computed(() => props.payload.expression || '—');
const dice = computed(() => diceArtFor(props.payload));
const droppedCount = computed(() => dice.value.filter((die) => !die.kept).length);
const isDense = computed(() => dice.value.length > 12);
const total = computed(() => props.payload.total);
const tagsDisplay = computed(() => props.payload.tags?.filter(Boolean).join(' · ') || null);

const modifier = computed(() => formatModifier(props.payload.modifier));
const expressionHasModifier = computed(() => /[+−-]\s*\d+\s*$/.test(expression.value));
const modifierNote = computed(() =>
  modifier.value && !expressionHasModifier.value ? `Modificador ${modifier.value}` : '',
);

const footnote = computed(() => {
  const parts: string[] = [];
  if (modifierNote.value) parts.push(modifierNote.value);
  if (droppedCount.value) {
    parts.push(
      droppedCount.value === 1 ? '1 dado descartado' : `${droppedCount.value} dados descartados`,
    );
  }
  if (props.payload.step?.difficulty != null) {
    parts.push(`Dificuldade ${props.payload.step.difficulty}`);
  }
  if (props.payload.tableResult?.summary) parts.push(props.payload.tableResult.summary);
  return parts.join(' · ');
});

const timeLabel = computed(() => {
  const date = new Date(props.payload.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});

const liveSummary = computed(() => {
  const actor = props.payload.username || 'A mesa';
  const dropped = droppedCount.value
    ? ` ${droppedCount.value === 1 ? 'Um dado descartado.' : `${droppedCount.value} dados descartados.`}`
    : '';
  return `${actor} rolou ${total.value} em ${expression.value}.${dropped}`;
});

/* Coreografia: cada dado entra 70 ms depois do anterior e assenta em 480 ms.
   O total só aparece depois que o último dado parou. */
const staggerMs = 70;
const settleMs = 480;
const totalDelay = computed(() => `${dice.value.length * staggerMs + settleMs - 80}ms`);
const stampDelay = computed(() => `${dice.value.length * staggerMs + settleMs + 120}ms`);

function syncReducedMotion() {
  prefersReducedMotion.value = Boolean(motionQuery?.matches);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    dismiss();
  }
}

onMounted(() => {
  dismissed = false;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    syncReducedMotion();
    motionQuery.addEventListener?.('change', syncReducedMotion);
  }
  // Captura: se o sheet modal de Dados estiver aberto, Esc fecha o momento em
  // vez de derrubar o sheet (o `cancel` do <dialog> é o default do keydown).
  window.addEventListener('keydown', handleKeydown, true);
  maybeVibrate();
  scheduleAutoDismiss();
});

onBeforeUnmount(() => {
  clearAutoDismiss();
  window.removeEventListener('keydown', handleKeydown, true);
  motionQuery?.removeEventListener?.('change', syncReducedMotion);
});

watch(
  () => props.payload,
  () => {
    // Rolagem nova substitui a atual sem fila: reinicia a coreografia e o
    // relógio do auto-dismiss.
    dismissed = false;
    momentKey.value += 1;
    maybeVibrate();
    scheduleAutoDismiss();
  },
);
</script>

<template>
  <transition name="dice-moment" appear>
    <div
      class="dice-moment"
      :class="[`dice-moment--${variant}`, { 'is-reduced': prefersReducedMotion }]"
      role="presentation"
      @click="dismiss"
    >
      <div
        :key="momentKey"
        class="dice-slip"
        :class="{ 'is-dense': isDense }"
        :style="{ '--total-delay': totalDelay, '--stamp-delay': stampDelay }"
        @click="handleSlipClick"
      >
        <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {{ liveSummary }}
        </p>

        <div class="dice-slip__body" aria-hidden="true">
          <header class="dice-slip__head">
            <p class="dice-slip__eyebrow">Registro de rolagem</p>
            <span v-if="timeLabel" class="dice-slip__time">{{ timeLabel }}</span>
          </header>

          <p class="dice-slip__actor">{{ payload.username || 'Mesa' }}</p>
          <p class="dice-slip__title">{{ title }}</p>

          <p class="dice-slip__expression">{{ expression }}</p>

          <div class="dice-slip__dice" :data-count="dice.length">
            <span
              v-for="(die, index) in dice"
              :key="`${momentKey}-${index}`"
              class="die-slot"
              :class="{ 'is-dropped': !die.kept }"
              :data-kept="die.kept ? 'kept' : 'dropped'"
              :style="{ '--die-index': index }"
            >
              <DiceArt :sides="die.sides" :value="die.value" :kept="die.kept" />
            </span>
            <span v-if="!dice.length" class="dice-slip__no-dice">Sem dados nesta rolagem</span>
          </div>

          <div class="dice-slip__rule" aria-hidden="true"></div>

          <div class="dice-slip__total">
            <span class="dice-slip__total-label">Total</span>
            <strong class="dice-slip__total-value">{{ total }}</strong>
            <span class="dice-slip__stamp" aria-hidden="true">Registrado</span>
          </div>

          <p v-if="footnote" class="dice-slip__footnote">{{ footnote }}</p>
          <p v-if="tagsDisplay" class="dice-slip__tags">{{ tagsDisplay }}</p>
        </div>

        <div class="dice-slip__actions">
          <p class="dice-slip__hint">
            {{ isPlayer ? 'Toque ou Esc para fechar' : isDm ? 'Clique ou Esc para fechar' : 'Clique ou pressione Esc para fechar' }}
          </p>
          <button type="button" class="dice-slip__close" @click="dismiss">Fechar</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.dice-moment {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: clamp(16px, 4vw, 48px);
  background: rgb(4 6 7 / 0.82);
  cursor: pointer;
}

.dice-moment-enter-active {
  transition: opacity 120ms var(--ease-out);
}

.dice-moment-leave-active {
  transition: opacity 180ms var(--ease-in);
}

.dice-moment-enter-from,
.dice-moment-leave-to {
  opacity: 0;
}

.dice-slip {
  --die-size: clamp(40px, 5.4vw, 64px);
  --slip-muted: rgb(11 13 15 / 0.68);

  position: relative;
  width: min(560px, 100%);
  max-height: calc(100dvh - 32px);
  padding: clamp(20px, 2.6vw, 36px);
  overflow-y: auto;
  border: 1px solid var(--paper-line);
  border-radius: 2px;
  background: var(--paper);
  box-shadow: var(--shadow-overlay);
  color: var(--ink-0);
  cursor: default;
  animation: slip-in 180ms var(--ease-out) both;
}

.dice-slip.is-dense {
  --die-size: clamp(32px, 4vw, 46px);
}

.dice-moment--tv .dice-slip {
  --die-size: clamp(56px, 6vw, 92px);

  width: min(880px, 84vw);
  padding: clamp(32px, 3vw, 52px);
}

.dice-moment--tv .dice-slip.is-dense {
  --die-size: clamp(40px, 4.2vw, 60px);
}

/* Na TV, meta também é funcional: nada abaixo de ~20 px. */
.dice-moment--tv .dice-slip__eyebrow,
.dice-moment--tv .dice-slip__time,
.dice-moment--tv .dice-slip__total-label {
  font-size: clamp(1rem, 0.4vw + 0.85rem, 1.25rem);
}

.dice-moment--tv .dice-slip__actor {
  font-size: clamp(1.5rem, 0.7vw + 1.1rem, 1.875rem);
}

.dice-moment--tv .dice-slip__title,
.dice-moment--tv .dice-slip__footnote,
.dice-moment--tv .dice-slip__tags,
.dice-moment--tv .dice-slip__hint {
  font-size: clamp(1.125rem, 0.4vw + 0.95rem, 1.375rem);
}

.dice-moment--tv .dice-slip__expression {
  font-size: clamp(1.5rem, 0.7vw + 1.1rem, 1.875rem);
}

.dice-moment--tv .dice-slip__close {
  min-height: 48px;
  font-size: clamp(1rem, 0.4vw + 0.85rem, 1.25rem);
}

/* --------------------------------------------------------------------------
   Celular: o momento é um bilhete de registro, não um teatro. Card compacto
   acima da bottom nav, scrim só para dar foco e saída em 2,8 s.
   -------------------------------------------------------------------------- */
/* O bloco móvel legado (max-width: 560px) redefine `.dice-moment { padding }`;
   a especificidade dupla garante o recuo da nav também no celular. */
.dice-moment.dice-moment--player {
  place-items: end center;
  padding: 0 12px calc(76px + env(safe-area-inset-bottom, 0px));
  background: rgb(4 6 7 / 0.48);
  overscroll-behavior: contain;
}

.dice-moment--player .dice-slip {
  --die-size: clamp(30px, 9vw, 42px);

  width: min(360px, calc(100vw - 24px));
  max-height: calc(100dvh - 112px - env(safe-area-inset-bottom, 0px));
  padding: 14px var(--s-4) 12px;
  border-radius: 3px;
}

.dice-moment--player .dice-slip::before {
  inset: 6px;
}

.dice-moment--player .dice-slip__head {
  padding-bottom: 6px;
}

.dice-moment--player .dice-slip__eyebrow,
.dice-moment--player .dice-slip__time {
  font-size: 0.6875rem;
}

.dice-moment--player .dice-slip__actor {
  margin-top: 10px;
  font-size: 1rem;
}

.dice-moment--player .dice-slip__title {
  font-size: 0.8125rem;
}

.dice-moment--player .dice-slip__expression {
  margin: 8px 0 2px;
  padding-bottom: 6px;
  font-size: 1rem;
}

.dice-moment--player .dice-slip__dice {
  gap: 6px;
  padding: 4px 0 8px;
}

.dice-moment--player .dice-slip__rule {
  block-size: 2px;
  margin: 4px 0 8px;
}

.dice-moment--player .dice-slip__total {
  gap: 10px;
}

.dice-moment--player .dice-slip__total-label {
  font-size: 0.6875rem;
}

.dice-moment--player .dice-slip__total-value {
  font-size: clamp(2.75rem, 14vw, 4rem);
}

.dice-moment--player .dice-slip__footnote,
.dice-moment--player .dice-slip__tags {
  margin-top: 6px;
  font-size: 0.6875rem;
  line-height: 1.35;
}

.dice-moment--player .dice-slip__stamp {
  padding: 2px 6px;
  font-size: 0.625rem;
  letter-spacing: 0.1em;
}

.dice-moment--player .dice-slip__actions {
  gap: var(--s-2);
  margin-top: 8px;
  padding-top: 8px;
}

.dice-moment--player .dice-slip__hint {
  font-size: 0.6875rem;
}

.dice-moment--player .dice-slip__close {
  min-height: 44px;
  padding: 0 var(--s-3);
  font-size: 0.8125rem;
}

/* --------------------------------------------------------------------------
   Cockpit do Mestre: card compacto no canto, sem scrim e sem bloquear o
   tabuleiro. Novo resultado substitui o anterior; o timer do TableView fecha
   em 3,2 s e o componente também agenda a própria saída.
   -------------------------------------------------------------------------- */
.dice-moment.dice-moment--dm {
  inset: auto;
  right: calc(var(--dm-panel-w, 0px) + 16px);
  bottom: 88px;
  left: auto;
  top: auto;
  place-items: end end;
  padding: 0;
  background: transparent;
  pointer-events: none;
}

.dice-moment--dm .dice-slip {
  --die-size: clamp(26px, 2.6vw, 38px);

  width: min(420px, calc(100vw - 32px));
  max-height: min(52dvh, 420px);
  padding: 14px var(--s-4) 12px;
  border-radius: 2px;
  pointer-events: auto;
}

.dice-moment--dm .dice-slip::before {
  inset: 6px;
}

.dice-moment--dm .dice-slip__head {
  padding-bottom: 6px;
}

.dice-moment--dm .dice-slip__eyebrow,
.dice-moment--dm .dice-slip__time {
  font-size: 0.6875rem;
}

.dice-moment--dm .dice-slip__actor {
  margin-top: 8px;
  font-size: 0.9375rem;
}

.dice-moment--dm .dice-slip__title {
  font-size: 0.8125rem;
}

.dice-moment--dm .dice-slip__expression {
  margin: 6px 0 2px;
  padding-bottom: 6px;
  font-size: 0.9375rem;
  -webkit-line-clamp: 2;
}

.dice-moment--dm .dice-slip__dice {
  gap: 6px;
  padding: 2px 0 6px;
}

.dice-moment--dm .dice-slip__rule {
  block-size: 2px;
  margin: 2px 0 6px;
}

.dice-moment--dm .dice-slip__total {
  gap: 10px;
}

.dice-moment--dm .dice-slip__total-label {
  font-size: 0.6875rem;
}

.dice-moment--dm .dice-slip__total-value {
  font-size: clamp(2.25rem, 5vw, 3rem);
}

.dice-moment--dm .dice-slip__footnote,
.dice-moment--dm .dice-slip__tags {
  margin-top: 4px;
  font-size: 0.6875rem;
  line-height: 1.35;
}

.dice-moment--dm .dice-slip__stamp {
  padding: 2px 6px;
  font-size: 0.625rem;
  letter-spacing: 0.08em;
}

.dice-moment--dm .dice-slip__actions {
  gap: var(--s-2);
  margin-top: 8px;
  padding-top: 8px;
}

.dice-moment--dm .dice-slip__hint {
  font-size: 0.6875rem;
}

.dice-moment--dm .dice-slip__close {
  min-height: 44px;
  padding: 0 var(--s-3);
  font-size: 0.8125rem;
}

@media (max-width: 1023px) {
  .dice-moment.dice-moment--dm {
    right: 8px;
    bottom: calc(var(--mobile-bar-h, 64px) + 56px + 12px);
    left: 8px;
  }

  .dice-moment--dm .dice-slip {
    width: min(420px, 100%);
    margin-left: auto;
  }
}

.dice-slip::before {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgb(11 13 15 / 0.14);
  border-radius: 1px;
  pointer-events: none;
}

.dice-slip__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--paper-line);
}

.dice-slip__eyebrow {
  margin: 0;
  color: var(--slip-muted);
  font-family: var(--font-data);
  font-size: clamp(0.75rem, 0.9vw, 0.95rem);
  letter-spacing: 0.02em;
}

.dice-slip__time {
  color: var(--slip-muted);
  font-family: var(--font-data);
  font-size: clamp(0.75rem, 0.9vw, 0.95rem);
  font-variant-numeric: tabular-nums;
}

.dice-slip__actor {
  margin: var(--s-4) 0 0;
  font-family: var(--font-sans);
  font-size: clamp(1.1rem, 1.4vw, 1.5rem);
  font-weight: 600;
  line-height: 1.2;
}

.dice-slip__title {
  margin: var(--s-1) 0 0;
  color: var(--slip-muted);
  font-family: var(--font-sans);
  font-size: clamp(0.9rem, 1vw, 1.05rem);
  line-height: 1.3;
}

.dice-slip__expression {
  margin: var(--s-4) 0 var(--s-3);
  padding: 0 0 var(--s-3);
  font-family: var(--font-data);
  font-size: clamp(1.15rem, 1.6vw, 1.6rem);
  font-weight: 500;
  line-height: 1.25;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}

.dice-slip__dice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: clamp(6px, 0.9vw, 14px);
  padding: var(--s-3) 0 var(--s-4);
}

.die-slot {
  display: inline-flex;
  animation: die-settle 480ms var(--ease-settle) both;
  animation-delay: calc(var(--die-index, 0) * 70ms);
}

.dice-slip__no-dice {
  color: var(--slip-muted);
  font-family: var(--font-data);
  font-size: clamp(0.9rem, 1vw, 1.05rem);
}

.dice-slip__rule {
  block-size: 3px;
  margin: var(--s-3) 0 var(--s-4);
  background: var(--manila);
  transform-origin: left center;
  animation: rule-draw 180ms var(--ease-out) both;
  animation-delay: var(--total-delay);
}

.dice-slip__total {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-4);
}

.dice-slip__total-label {
  color: var(--slip-muted);
  font-family: var(--font-data);
  font-size: clamp(0.8rem, 1vw, 1rem);
  letter-spacing: 0.02em;
}

.dice-slip__total-value {
  display: inline-block;
  font-family: var(--font-data);
  font-size: clamp(4rem, 9vw, 6.5rem);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 0.95;
  clip-path: inset(0 100% 0 0);
  animation: total-reveal 180ms var(--ease-out) both;
  animation-delay: var(--total-delay);
}

.dice-moment--tv .dice-slip__total-value {
  font-size: clamp(6rem, 10vw, 10rem);
}

.dice-slip__footnote,
.dice-slip__tags {
  margin: var(--s-3) 0 0;
  color: var(--slip-muted);
  font-family: var(--font-data);
  font-size: clamp(0.8rem, 1vw, 1rem);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.dice-slip__tags {
  margin-top: var(--s-1);
}

.dice-slip__stamp {
  align-self: center;
  margin-left: auto;
  padding: 4px 10px;
  border: 2px double var(--danger);
  border-radius: 1px;
  color: var(--danger);
  font-family: var(--font-data);
  font-size: clamp(0.7rem, 1vw, 1rem);
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  transform: rotate(-4deg);
  opacity: 0;
  animation: stamp-print 90ms steps(2, end) both;
  animation-delay: var(--stamp-delay);
  pointer-events: none;
}

.dice-slip__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin-top: var(--s-5);
  padding-top: var(--s-3);
  border-top: 1px solid var(--paper-line);
}

.dice-slip__hint {
  margin: 0;
  color: var(--slip-muted);
  font-family: var(--font-sans);
  font-size: clamp(0.8rem, 1vw, 1rem);
}

.dice-slip__close {
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--s-5);
  border: 1px solid rgb(11 13 15 / 0.5);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ink-0);
  font-family: var(--font-sans);
  font-size: clamp(0.9rem, 1vw, 1.05rem);
  font-weight: 600;
  cursor: pointer;
}

.dice-slip__close:hover {
  background: rgb(11 13 15 / 0.08);
}

.dice-slip__close:focus-visible {
  outline: 2px solid var(--ink-0);
  outline-offset: 2px;
}

@keyframes slip-in {
  from {
    opacity: 0;
    transform: translateY(14px) rotate(-1.2deg);
  }
  to {
    opacity: 1;
    transform: translateY(0) rotate(0);
  }
}

@keyframes die-settle {
  0% {
    opacity: 0;
    transform: translateY(14px) scale(0.78) rotate(-8deg);
  }
  55% {
    opacity: 1;
    transform: translateY(-4px) scale(1.08) rotate(3deg);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1) rotate(0);
  }
}

@keyframes total-reveal {
  to {
    clip-path: inset(0 0 0 0);
  }
}

@keyframes rule-draw {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

@keyframes stamp-print {
  from {
    opacity: 0;
    transform: rotate(-4deg) scale(1.3);
  }
  to {
    opacity: 0.9;
    transform: rotate(-4deg) scale(1);
  }
}

/* Reduced motion: resultado final imediato, sem stagger, giro ou reveal. */
.dice-moment.is-reduced .dice-slip,
.dice-moment.is-reduced .die-slot,
.dice-moment.is-reduced .dice-slip__rule,
.dice-moment.is-reduced .dice-slip__total-value,
.dice-moment.is-reduced .dice-slip__stamp,
.dice-moment-enter-active,
.dice-moment-leave-active {
  animation: none;
  transition: none;
}

.dice-moment.is-reduced .dice-slip__total-value {
  clip-path: none;
}

.dice-moment.is-reduced .dice-slip__stamp {
  opacity: 0.9;
  transform: rotate(-4deg);
}

@media (prefers-reduced-motion: reduce) {
  .dice-slip,
  .die-slot,
  .dice-slip__rule,
  .dice-slip__total-value,
  .dice-slip__stamp {
    animation: none;
  }

  .dice-slip__total-value {
    clip-path: none;
  }

  .dice-slip__stamp {
    opacity: 0.9;
    transform: rotate(-4deg);
  }

  .dice-moment-enter-active,
  .dice-moment-leave-active {
    transition: none;
  }
}

@media (max-width: 560px) {
  .dice-moment {
    padding: var(--s-4);
  }

  .dice-slip {
    --die-size: clamp(34px, 10vw, 48px);
  }

  .dice-slip__stamp {
    margin-left: 0;
    opacity: 0.9;
    transform: rotate(-2deg);
    animation: none;
  }

  .dice-slip__actions {
    flex-wrap: wrap;
  }
}
</style>
