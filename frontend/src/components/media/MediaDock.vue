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
.media-dock {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #4b3a44);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(40, 30, 36, 0.96), rgba(24, 18, 22, 0.96));
  box-shadow: var(--elev-2, 0 10px 24px rgba(0, 0, 0, 0.35));
  color: var(--color-text, #f3e9ef);
  font: inherit;
}

.media-dock--floating {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 72;
  max-width: min(560px, calc(100vw - 32px));
}

.media-dock--inline {
  position: static;
  width: 100%;
  box-sizing: border-box;
  border-radius: 12px;
}

.media-dock__status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  font-size: 0.82rem;
}

.media-dock__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--color-text-muted, #9c9198);
  flex: 0 0 auto;
}

.media-dock__dot.is-busy {
  background: var(--color-warning, #f5a524);
  animation: media-pulse 1s ease-in-out infinite;
}

.media-dock__dot.is-live {
  background: var(--color-success, #2ecc71);
}

.media-dock__dot.is-error {
  background: var(--color-danger, #e53935);
}

.media-dock__label {
  font-weight: 600;
}

.media-dock__count {
  min-width: 24px;
  padding: 1px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  text-align: center;
  font-size: 0.74rem;
}

.media-dock__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.media-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--color-border-strong, #6b5561);
  border-radius: 10px;
  background: var(--color-surface-alt, #3a2c34);
  color: inherit;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.media-btn:hover:not(:disabled) {
  background: var(--color-surface, #463641);
}

.media-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.media-btn.is-active {
  background: var(--color-accent, #c8a2c8);
  border-color: var(--color-accent, #c8a2c8);
  color: #1b1218;
}

.media-btn--join {
  flex: 1;
  background: var(--color-accent-alt, #c9a227);
  border-color: #ab865c;
  color: #1b120c;
}

.media-btn--leave {
  background: rgba(229, 57, 53, 0.18);
  border-color: rgba(229, 57, 53, 0.65);
}

.media-dock__error,
.media-dock__warning {
  margin: 0;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 0.75rem;
  line-height: 1.35;
}

.media-dock__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: rgba(229, 57, 53, 0.14);
  color: #ffb4b0;
}

.media-dock__warning {
  background: rgba(245, 165, 36, 0.12);
  color: #ffd28a;
}

.media-dock__dismiss {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 1.1rem;
  cursor: pointer;
  line-height: 1;
}

.media-dock--compact .media-dock__actions {
  flex-wrap: wrap;
}

@keyframes media-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

@media (max-width: 900px) {
  .media-dock--floating {
    left: 10px;
    right: 10px;
    bottom: calc(76px + env(safe-area-inset-bottom, 0px));
    max-width: none;
  }
  .media-btn {
    flex: 1 1 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-dock__dot.is-busy { animation: none; }
}
</style>
