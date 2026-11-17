<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMediaStore } from '../../stores/mediaStore';
import DeviceSettings from './DeviceSettings.vue';

const props = withDefaults(
  defineProps<{
    tableId: string;
    variant?: 'floating' | 'inline';
    compact?: boolean;
  }>(),
  { variant: 'floating', compact: false },
);

const store = useMediaStore();
const settingsOpen = ref(false);

const statusLabel = computed(() => {
  if (store.connecting) return 'Conectando à chamada…';
  if (store.joined) return 'Na chamada';
  return 'Chamada de voz';
});

const joinLabel = computed(() => (store.connecting ? 'Conectando…' : 'Entrar na chamada'));

const micLabel = computed(() => (store.mic === 'muted' ? 'Ativar microfone' : 'Silenciar microfone'));
const deafenLabel = computed(() => (store.deafened ? 'Ouvir a chamada' : 'Ensurdar a chamada'));
const cameraLabel = computed(() => (store.camera === 'on' ? 'Desligar câmera' : 'Ligar câmera'));
const screenLabel = computed(() => (store.screen ? 'Parar compartilhamento de tela' : 'Compartilhar tela'));

async function handleJoin(): Promise<void> {
  if (!props.tableId || store.connecting) return;
  await store.join(props.tableId);
}

async function handleLeave(): Promise<void> {
  await store.leave();
}
</script>

<template>
  <section
    class="media-dock"
    :class="[`media-dock--${variant}`, { 'media-dock--compact': compact, 'is-joined': store.joined }]"
    aria-label="Chamada de voz da mesa"
  >
    <div class="media-dock__status">
      <span
        class="media-dock__dot"
        :class="{
          'is-live': store.joined,
          'is-busy': store.connecting,
          'is-error': Boolean(store.error),
        }"
        aria-hidden="true"
      ></span>
      <span class="media-dock__label">{{ statusLabel }}</span>
      <span v-if="store.joined" class="media-dock__count" :title="`${store.participantCount} participantes`">
        {{ store.participantCount }}
      </span>
    </div>

    <div v-if="!store.joined" class="media-dock__actions">
      <button
        type="button"
        class="media-btn media-btn--join"
        :disabled="store.connecting || !tableId"
        @click="handleJoin"
      >
        {{ joinLabel }}
      </button>
    </div>

    <div v-else class="media-dock__actions">
      <button
        type="button"
        class="media-btn"
        :class="{ 'is-active': store.mic === 'muted' }"
        :aria-label="micLabel"
        :aria-pressed="store.mic === 'muted'"
        :title="micLabel"
        @click="store.toggleMic()"
      >
        {{ store.mic === 'muted' ? 'Mudo' : 'Mic' }}
      </button>
      <button
        type="button"
        class="media-btn"
        :class="{ 'is-active': store.deafened }"
        :aria-label="deafenLabel"
        :aria-pressed="store.deafened"
        :title="deafenLabel"
        @click="store.toggleDeafen()"
      >
        {{ store.deafened ? 'Surdo' : 'Ouvir' }}
      </button>
      <button
        type="button"
        class="media-btn"
        :class="{ 'is-active': store.camera === 'on' }"
        :aria-label="cameraLabel"
        :aria-pressed="store.camera === 'on'"
        :title="cameraLabel"
        :disabled="store.screen"
        @click="store.toggleCamera()"
      >
        {{ store.camera === 'on' ? 'Câmera' : 'Câmera off' }}
      </button>
      <button
        type="button"
        class="media-btn"
        :class="{ 'is-active': store.screen }"
        :aria-label="screenLabel"
        :aria-pressed="store.screen"
        :title="screenLabel"
        @click="store.screen ? store.stopScreenShare() : store.startScreenShare()"
      >
        {{ store.screen ? 'Parar tela' : 'Tela' }}
      </button>
      <button
        type="button"
        class="media-btn"
        aria-label="Configurações de áudio e vídeo"
        title="Configurações de áudio e vídeo"
        @click="settingsOpen = true"
      >
        Ajustes
      </button>
      <button
        type="button"
        class="media-btn media-btn--leave"
        aria-label="Sair da chamada"
        title="Sair da chamada"
        @click="handleLeave"
      >
        Sair
      </button>
    </div>

    <p v-if="store.error" class="media-dock__error" role="alert">
      <span>{{ store.error }}</span>
      <button type="button" class="media-dock__dismiss" aria-label="Fechar aviso" @click="store.clearError()">×</button>
    </p>
    <p v-else-if="store.joined && !store.turnConfigured" class="media-dock__warning" role="status">
      Sem TURN configurado: redes restritas podem falhar.
    </p>

    <DeviceSettings :open="settingsOpen" @close="settingsOpen = false" />
  </section>
</template>

<style scoped>
/* Barra sólida de chamada: rótulo à esquerda, controles à direita. */
.media-dock {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
  min-height: 56px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  box-shadow: none;
}

.media-dock--floating {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 72;
  width: fit-content;
  max-width: min(640px, calc(100vw - 32px));
}

/* Barra de uma linha: rótulo + controles lado a lado. */
.media-dock--floating .media-dock__actions {
  flex-wrap: nowrap;
}

.media-dock--inline {
  position: static;
  width: 100%;
  box-sizing: border-box;
}

.media-dock__status {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
  min-height: 24px;
  font-size: var(--text-sm);
  line-height: 1.3;
}

.media-dock__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-faint);
}

.media-dock__dot.is-busy {
  background: var(--manila);
  animation: media-pulse 1.2s var(--ease-out) 3;
}

.media-dock__dot.is-live {
  background: var(--success-ink);
}

.media-dock__dot.is-error {
  background: var(--danger);
}

.media-dock__label {
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
}

.media-dock__count {
  min-width: 20px;
  padding: 1px var(--s-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--raised);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.media-dock__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  margin-left: auto;
}

.media-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-out),
    border-color var(--dur-hover) var(--ease-out),
    color var(--dur-hover) var(--ease-out);
}

.media-btn:hover:not(:disabled) {
  background: var(--raised-2);
}

.media-btn:active:not(:disabled) {
  transform: translateY(1px);
  transition-duration: var(--dur-press);
}

.media-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.media-btn:disabled {
  border-color: var(--line);
  background: var(--raised);
  color: var(--text-muted);
  cursor: not-allowed;
}

.media-btn.is-active {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.media-btn.is-active:hover:not(:disabled) {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
}

.media-btn--join {
  flex: 1 1 auto;
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--text-md);
}

.media-btn--join:hover:not(:disabled) {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
}

.media-btn--leave {
  border-color: rgb(178 58 50 / 0.55);
  background: transparent;
  color: var(--danger-ink);
}

.media-btn--leave:hover:not(:disabled) {
  border-color: var(--danger);
  background: rgb(178 58 50 / 0.14);
}

.media-dock__error,
.media-dock__warning {
  flex: 1 1 100%;
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  font-size: var(--text-xs);
  line-height: 1.4;
}

.media-dock__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  border-color: rgb(178 58 50 / 0.45);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
}

.media-dock__warning {
  border-color: rgb(217 180 91 / 0.35);
  background: rgb(217 180 91 / 0.1);
  color: var(--manila);
}

.media-dock__dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: inherit;
  font-size: var(--text-lg);
  line-height: 1;
  cursor: pointer;
}

.media-dock__dismiss:hover {
  border-color: rgb(232 106 94 / 0.45);
  background: rgb(178 58 50 / 0.14);
}

.media-dock__dismiss:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.media-dock--compact .media-dock__actions {
  flex-wrap: wrap;
}

@keyframes media-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

@media (max-width: 900px) {
  .media-dock--floating {
    left: 10px;
    right: 10px;
    bottom: calc(76px + env(safe-area-inset-bottom, 0px));
    width: auto;
    max-width: none;
    padding: var(--s-2);
  }

  .media-dock__actions {
    width: 100%;
    margin-left: 0;
    flex-wrap: wrap;
  }

  .media-btn {
    flex: 1 1 auto;
    padding: 0 var(--s-2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-dock__dot.is-busy {
    animation: none;
  }
}
</style>
