<script setup lang="ts">
import { computed, ref } from 'vue';

import BaseDialog from './ui/BaseDialog.vue';

const MIN_PAUSE_MINUTES = 1;
const MAX_PAUSE_MINUTES = 120;
const DEFAULT_PAUSE_MINUTES = 5;

const props = defineProps<{
  sessionStatus: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED';
  pauseInput: number;
  pauseRemaining: number;
  isCollapsed: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'update:pauseInput', value: number): void;
  (e: 'update-status', status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED'): void;
  (e: 'start-session'): void;
}>();

const confirmEndOpen = ref(false);

function clampPause(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_PAUSE_MINUTES;
  return Math.max(MIN_PAUSE_MINUTES, Math.min(MAX_PAUSE_MINUTES, Math.round(parsed)));
}

const pauseMinutes = computed(() => clampPause(props.pauseInput));
const isPaused = computed(() => props.sessionStatus === 'PAUSED');
const isLive = computed(() => props.sessionStatus === 'LIVE');
const isPreparing = computed(() => props.sessionStatus === 'PREPARING');
const isEnded = computed(() => props.sessionStatus === 'ENDED');

const statusLabel = computed(() => {
  switch (props.sessionStatus) {
    case 'LIVE':
      return 'Ao vivo';
    case 'PAUSED':
      return 'Pausado';
    case 'ENDED':
      return 'Encerrado';
    default:
      return 'Preparando';
  }
});

const statusCopy = computed(() => {
  switch (props.sessionStatus) {
    case 'LIVE':
      return 'Jogadores e TV acompanham o tabuleiro. Pausar congela a mesa por tempo limitado.';
    case 'PAUSED':
      return 'Jogadores e TV veem a tela de pausa e o tempo restante para retomar.';
    case 'ENDED':
      return 'A mesa vê a tela final. Reabrir volta a sessão para Preparando.';
    default:
      return 'O tabuleiro está em montagem; jogadores e TV veem a tela de espera.';
  }
});

const pauseCountdown = computed(() => {
  const remaining = Math.max(0, Math.floor(props.pauseRemaining));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
});

function onPauseInput(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const next = clampPause(input?.value);
  if (input) input.value = String(next);
  emit('update:pauseInput', next);
}

function setStatus(status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED') {
  emit('update-status', status);
}

function requestEnd() {
  confirmEndOpen.value = true;
}

function confirmEnd() {
  confirmEndOpen.value = false;
  setStatus('ENDED');
}
</script>

<template>
  <div class="panel-section session-controls">
    <h4 class="session-title">Sessão</h4>

    <div class="session-body" v-show="!isCollapsed">
      <div class="session-status" role="status" aria-live="polite">
        <span class="status-chip" :class="`status-${sessionStatus.toLowerCase()}`">{{ statusLabel }}</span>
        <p class="session-copy">{{ statusCopy }}</p>
      </div>

      <div v-if="isPreparing" class="session-primary">
        <button class="btn session-start" type="button" @click="emit('start-session')">
          Iniciar sessão
        </button>
        <p class="session-hint">Uma transição curta aparece em todos os dispositivos antes do “Ao vivo”.</p>
      </div>

      <div v-if="isLive || isPaused" class="session-actions">
        <button
          v-if="isLive"
          class="btn session-pause"
          type="button"
          @click="setStatus('PAUSED')"
        >Pausar sessão</button>
        <button
          v-else
          class="btn session-resume"
          type="button"
          @click="setStatus('LIVE')"
        >Retomar sessão</button>

        <button class="btn danger session-end" type="button" @click="requestEnd">
          Encerrar sessão
        </button>
      </div>

      <p v-if="isEnded" class="session-hint">
        Reabrir não restaura rodada ou turno anteriores; a mesa volta para a preparação.
      </p>
      <div v-if="isEnded" class="session-primary">
        <button class="btn alt" type="button" @click="setStatus('PREPARING')">Reabrir sessão</button>
      </div>

      <div v-if="isLive || isPaused" class="session-pause-config">
        <label for="session-pause-minutes">Duração da pausa (min)</label>
        <div class="session-pause-row">
          <input
            id="session-pause-minutes"
            class="session-pause-input"
            type="number"
            inputmode="numeric"
            min="1"
            max="120"
            step="1"
            :value="pauseMinutes"
            @input="onPauseInput"
            @blur="onPauseInput"
          />
          <span class="session-hint">
            1 a 120 min. {{ isPaused ? 'Pausa em andamento.' : 'Vale para a próxima pausa.' }}
          </span>
        </div>
        <p v-if="isPaused" class="pause-countdown" data-testid="pause-countdown">
          <template v-if="pauseRemaining > 0">Retomando em {{ pauseCountdown }}</template>
          <template v-else>Pausa sem retorno automático.</template>
        </p>
      </div>
    </div>

    <BaseDialog
      :open="confirmEndOpen"
      title="Encerrar sessão?"
      @update:open="confirmEndOpen = $event"
      @close="confirmEndOpen = false"
    >
      <p class="session-dialog-copy">
        Jogadores e TV verão a tela final imediatamente. A mesa pode ser reaberta em
        <strong>Preparando</strong>, mas a sessão atual termina para todos.
      </p>
      <template #footer>
        <button type="button" class="btn btn-sm alt" @click="confirmEndOpen = false">Cancelar</button>
        <button type="button" class="btn btn-sm danger" @click="confirmEnd">Encerrar sessão</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.session-controls {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.session-title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}

.session-body {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.session-status {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.status-chip {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--raised);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}

.status-chip.status-live {
  border-color: rgb(92 155 133 / 0.5);
  background: rgb(92 155 133 / 0.14);
  color: var(--success-ink);
}

.status-chip.status-paused {
  border-color: rgb(217 180 91 / 0.5);
  background: rgb(217 180 91 / 0.14);
  color: var(--manila);
}

.status-chip.status-preparing {
  border-color: rgb(127 182 201 / 0.5);
  background: rgb(47 108 132 / 0.16);
  color: var(--accent-ink);
}

.session-copy {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.session-primary,
.session-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}

.session-start,
.session-pause,
.session-resume,
.session-end {
  min-height: 44px;
}

.session-start {
  --btn-bg: var(--accent);
  --btn-bg-hover: var(--accent-hover);
  --btn-fg: var(--on-accent);
}

.session-pause {
  --btn-bg: var(--manila);
  --btn-bg-hover: #e2c274;
  --btn-fg: var(--on-manila);
}

.session-resume {
  --btn-bg: var(--accent);
  --btn-bg-hover: var(--accent-hover);
  --btn-fg: var(--on-accent);
}

.session-end {
  --btn-bg: var(--danger);
  --btn-bg-hover: var(--danger-hover);
  --btn-fg: var(--on-danger);
}

.session-hint {
  margin: 0;
  color: var(--text-faint);
  font-size: var(--text-2xs);
  line-height: var(--leading-body);
}

.session-pause-config {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding-top: var(--s-3);
  border-top: 1px solid var(--line);
}

.session-pause-config label {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.session-pause-row {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  flex-wrap: wrap;
}

.session-pause-input {
  width: 88px;
  min-height: 44px;
  font-size: 16px;
}

.pause-countdown {
  margin: 0;
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}

.session-dialog-copy {
  margin: 0;
  color: var(--text-muted);
  line-height: var(--leading-body);
}

@media (max-width: 420px) {
  .session-actions .btn {
    flex: 1 1 100%;
  }
}
</style>
