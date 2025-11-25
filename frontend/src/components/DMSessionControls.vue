<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';

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

const isPaused = computed(() => props.sessionStatus === 'PAUSED');
const isLive = computed(() => props.sessionStatus === 'LIVE');
const isPreparing = computed(() => props.sessionStatus === 'PREPARING');
const isEnded = computed(() => props.sessionStatus === 'ENDED');

function setStatus(status: 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED') {
  emit('update-status', status);
}
</script>

<template>
  <div class="panel-section">
    <button class="subsection-toggle" @click="emit('toggle')">
      <h4>Sessão</h4>
      <span class="chevron"><Icon :name="isCollapsed ? 'plus' : 'minus'" size="16" /></span>
    </button>
    <div class="session-controls" v-show="!isCollapsed">
      <button
        v-if="isEnded"
        class="btn btn-sm session-btn session-prepare"
        @click="setStatus('PREPARING')"
      >Preparar Sessão</button>

      <div v-if="isPreparing" class="row gap-2">
        <button class="btn btn-sm session-btn session-start" @click="emit('start-session')">
          Iniciar Sessão
        </button>
      </div>

      <button
        v-if="isLive"
        class="btn btn-sm session-btn session-pause"
        @click="setStatus('PAUSED')"
      >Pausar</button>

      <div v-if="isLive || isPaused" class="row gap-2 pause-config">
        <label>Duração da pausa (min):</label>
        <input
          class="input-xs"
          type="number"
          min="0"
          step="0.5"
          :value="pauseInput"
          @input="emit('update:pauseInput', Number(($event.target as HTMLInputElement).value))"
        />
      </div>

      <button
        v-if="isPaused"
        class="btn btn-sm session-btn session-resume"
        @click="setStatus('LIVE')"
      >Retomar</button>

      <button
        v-if="isLive || isPaused"
        class="btn btn-sm session-btn session-end"
        @click="setStatus('ENDED')"
      >Encerrar Sessão</button>

      <p v-if="isPaused && pauseRemaining > 0" class="pause-countdown">
        Retomando em {{ Math.floor(pauseRemaining / 60) }}:{{ String(pauseRemaining % 60).padStart(2, '0') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.pause-config {
  margin-top: 15px;
  align-items: center;
}
.pause-countdown {
  margin-top: 10px;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
</style>
