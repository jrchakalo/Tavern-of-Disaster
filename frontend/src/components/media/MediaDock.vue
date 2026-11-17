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

const emit = defineEmits<{ (e: 'expand'): void }>();

const store = useMediaStore();
const settingsOpen = ref(false);

const joinLabel = computed(() => (store.connecting ? 'Conectando…' : 'Chamada'));

const joinAriaLabel = computed(() =>
  store.connecting ? 'Conectando à chamada' : 'Entrar na chamada',
);

const expandAriaLabel = computed(
  () => `Chamada com ${store.participantCount} ${store.participantCount === 1 ? 'participante' : 'participantes'}. Abrir vídeos.`,
);

/**
 * Aviso de TURN deixa de ser uma linha que empurra a barra: vira `title` e
 * uma nota curta ao lado do rótulo. A mensagem completa também aparece nas
 * configurações de áudio/vídeo (DeviceSettings).
 */
const turnNote = computed(() =>
  store.turnConfigured ? '' : 'Sem TURN configurado: redes restritas podem falhar.',
);

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
    :class="[
      `media-dock--${variant}`,
      { 'media-dock--compact': compact, 'media-dock--pill': !store.joined, 'is-joined': store.joined },
    ]"
    aria-label="Chamada de voz da mesa"
    :title="store.joined ? turnNote || undefined : undefined"
  >
    <template v-if="!store.joined">
      <button
        type="button"
        class="media-btn media-btn--join media-dock__join"
        :disabled="store.connecting || !tableId"
        :aria-label="joinAriaLabel"
        :title="joinAriaLabel"
        @click="handleJoin"
      >
        <svg class="media-dock__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M6.6 3.8h2.1l1.5 3.8-1.9 1.4a12 12 0 0 0 6.7 6.7l1.4-1.9 3.8 1.5v2.1a2.4 2.4 0 0 1-2.6 2.4A17.6 17.6 0 0 1 4.2 6.4a2.4 2.4 0 0 1 2.4-2.6Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
        </svg>
        <span class="media-dock__label">{{ joinLabel }}</span>
        <span v-if="store.error" class="media-dock__pill-error" aria-hidden="true">!</span>
      </button>
    </template>

    <template v-else>
      <button
        type="button"
        class="media-dock__status"
        :aria-label="expandAriaLabel"
        @click="emit('expand')"
      >
        <span
          class="media-dock__dot"
          :class="{
            'is-live': store.joined,
            'is-busy': store.connecting,
            'is-error': Boolean(store.error),
          }"
          aria-hidden="true"
        ></span>
        <span class="media-dock__label">Na chamada</span>
        <span
          class="media-dock__count"
          :title="`${store.participantCount} participantes`"
          :aria-label="`${store.participantCount} participantes`"
        >
          {{ store.participantCount }}
        </span>
      </button>

      <div v-if="$slots.preview" class="media-dock__preview" @click="emit('expand')">
        <slot name="preview" />
      </div>

      <div class="media-dock__actions">
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
          class="media-btn media-btn--deafen"
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
          class="media-btn media-btn--settings"
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

      <span v-if="!store.turnConfigured" class="media-dock__turn-note" :title="turnNote">
        Sem TURN
      </span>
    </template>

    <p v-if="store.error" class="media-dock__error" role="alert" :title="store.error">
      <span class="media-dock__error-text">{{ store.error }}</span>
      <button type="button" class="media-dock__dismiss" aria-label="Fechar aviso" @click="store.clearError()">
        ×
      </button>
    </p>

    <DeviceSettings :open="settingsOpen" @close="settingsOpen = false" />
  </section>
</template>

<style scoped>
/* Barra sólida de chamada: rótulo à esquerda, controles à direita. */
.media-dock {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
  min-width: 0;
  max-width: 100%;
  min-height: 56px;
  padding: var(--s-1) var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  color: var(--text);
  font: inherit;
  box-shadow: none;
}

/* Fora da chamada: uma pílula de 44 px, não a barra inteira. */
.media-dock--pill {
  min-height: 44px;
  padding: 0;
  overflow: visible;
  border: 0;
  background: transparent;
}

.media-dock--floating {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 72;
  width: fit-content;
  max-width: min(640px, calc(100vw - 32px));
}

.media-dock--inline {
  position: static;
  width: 100%;
  box-sizing: border-box;
}

.media-dock__join {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: 44px;
  padding: 0 var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-sm);
}

.media-dock__join:hover:not(:disabled) {
  border-color: var(--accent-ink);
  background: var(--raised-2);
}

.media-dock__icon {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--accent-ink);
}

.media-dock__status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--s-2);
  min-height: 44px;
  padding: 0 var(--s-1);
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.media-dock__status:hover .media-dock__label {
  color: var(--accent-ink);
}

.media-dock__status:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.media-dock__preview {
  display: flex;
  min-width: 0;
  max-width: 264px;
  cursor: pointer;
}

.media-dock__preview :deep(.participant-grid) {
  max-width: 100%;
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
  flex: 0 1 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
  margin-left: auto;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.media-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--s-2);
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
  flex: none;
  border-color: var(--line-strong);
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-sm);
}

.media-btn--join:hover:not(:disabled) {
  border-color: var(--accent-ink);
  background: var(--raised-2);
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

/* Nota curta: não abre linha nova nem empurra os controles. */
.media-dock__turn-note {
  flex: 0 0 auto;
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  white-space: nowrap;
  cursor: help;
}

.media-dock__pill-error {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid var(--danger);
  border-radius: 50%;
  color: var(--danger-ink);
  font-family: var(--font-data);
  font-size: 11px;
  line-height: 1;
}

/* Erro é um balão acima da barra: nunca aumenta a altura do cockpit. */
.media-dock__error {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--s-2));
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  width: max-content;
  max-width: min(320px, calc(100vw - 32px));
  margin: 0;
  padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3);
  border: 1px solid rgb(178 58 50 / 0.45);
  border-radius: var(--radius-xs);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
  color: var(--danger-ink);
  font-size: var(--text-xs);
  line-height: 1.4;
}

.media-dock__error-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.media-dock__dismiss {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
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
  .media-dock {
    padding: 0 var(--s-2);
  }

  .media-dock__preview {
    display: none;
  }

  .media-btn {
    padding: 0 var(--s-2);
  }

  .media-dock__status {
    padding: 0;
  }
}

@media (max-width: 420px) {
  .media-dock {
    gap: var(--s-1) var(--s-2);
  }

  .media-dock__actions {
    gap: var(--s-1);
  }

  .media-btn {
    padding: 0 6px;
    font-size: 11px;
  }

  .media-btn--deafen {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .media-dock__dot.is-busy {
    animation: none;
  }
}
</style>
