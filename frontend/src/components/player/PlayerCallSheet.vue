<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BaseSheet from '../ui/BaseSheet.vue';
import DeviceSettings from '../media/DeviceSettings.vue';
import ParticipantGrid from '../media/ParticipantGrid.vue';
import { useMediaStore } from '../../stores/mediaStore';

const props = defineProps<{ open: boolean; tableId: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useMediaStore();
const settingsOpen = ref(false);
const confirmLeave = ref(false);
const touchDevice = ref(false);

onMounted(() => {
  touchDevice.value =
    typeof navigator !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
});

const supportsScreenShare = computed(
  () =>
    !touchDevice.value &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function',
);

const permissionBlocked = computed(() =>
  Boolean(store.error && /permiss|bloque|negad/i.test(store.error)),
);

const micLabel = computed(() =>
  store.mic === 'muted' ? 'Ativar microfone' : 'Silenciar microfone',
);
const deafenLabel = computed(() =>
  store.deafened ? 'Voltar a ouvir' : 'Ensurdar a chamada',
);
const cameraLabel = computed(() =>
  store.camera === 'on' ? 'Desligar câmera' : 'Ligar câmera',
);

async function join(muted: boolean) {
  if (!props.tableId || store.connecting) return;
  await store.join(props.tableId);
  if (store.joined && muted && store.mic === 'on') store.toggleMic();
}

async function leave() {
  confirmLeave.value = false;
  await store.leave();
}

function requestLeave() {
  if (!confirmLeave.value) {
    confirmLeave.value = true;
    return;
  }
  void leave();
}
</script>

<template>
  <BaseSheet :open="open" title="Chamada" @close="emit('close')">
    <div class="player-call">
      <p class="player-call__status" role="status" aria-live="polite">
        <span
          class="player-call__dot"
          :class="{
            'is-live': store.joined,
            'is-busy': store.connecting,
            'is-error': Boolean(store.error),
          }"
          aria-hidden="true"
        ></span>
        {{ store.connecting ? 'Conectando à chamada…' : store.joined ? 'Na chamada' : 'Fora da chamada' }}
        <span v-if="store.joined" class="player-call__count">· {{ store.participantCount }}</span>
      </p>

      <div v-if="store.error" class="player-call__error" role="alert">
        <p>{{ store.error }}</p>
        <p v-if="permissionBlocked" class="player-call__error-help">
          Libere o microfone e a câmera nas configurações do site do navegador e tente de novo.
          Em iOS, confira também Ajustes → Safari → Microfone.
        </p>
        <div class="player-call__error-actions">
          <button type="button" class="btn secondary" @click="store.clearError()">Fechar aviso</button>
          <button type="button" class="btn" @click="join(true)">Tentar de novo</button>
        </div>
      </div>

      <template v-if="store.joined">
        <ParticipantGrid class="player-call__participants" />

        <div class="player-call__controls" role="group" aria-label="Controles da chamada">
          <button
            type="button"
            class="player-call__control"
            :class="{ 'is-active': store.mic === 'muted' }"
            :aria-label="micLabel"
            :aria-pressed="store.mic === 'muted'"
            @click="store.toggleMic()"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <path d="M12 19v3" />
              <path v-if="store.mic === 'muted'" d="m3 3 18 18" />
            </svg>
            <span>{{ store.mic === 'muted' ? 'Mudo' : 'Microfone' }}</span>
          </button>
          <button
            type="button"
            class="player-call__control"
            :class="{ 'is-active': store.deafened }"
            :aria-label="deafenLabel"
            :aria-pressed="store.deafened"
            @click="store.toggleDeafen()"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" />
              <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
            <span>{{ store.deafened ? 'Surdo' : 'Ouvir' }}</span>
          </button>
          <button
            type="button"
            class="player-call__control"
            :class="{ 'is-active': store.camera === 'on' }"
            :aria-label="cameraLabel"
            :aria-pressed="store.camera === 'on'"
            :disabled="store.screen"
            @click="store.toggleCamera()"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
              <path v-if="store.camera !== 'on'" d="m3 3 18 18" />
            </svg>
            <span>Câmera</span>
          </button>
          <button
            v-if="supportsScreenShare"
            type="button"
            class="player-call__control"
            :class="{ 'is-active': store.screen }"
            :aria-pressed="store.screen"
            aria-label="Compartilhar tela"
            @click="store.screen ? store.stopScreenShare() : store.startScreenShare()"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <span>Tela</span>
          </button>
          <button
            type="button"
            class="player-call__control"
            aria-label="Configurações de áudio e vídeo"
            @click="settingsOpen = true"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Ajustes</span>
          </button>
          <button
            type="button"
            class="player-call__control player-call__control--leave"
            :aria-label="confirmLeave ? 'Confirmar saída da chamada' : 'Sair da chamada'"
            @click="requestLeave"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 2 1.8z" />
              <path v-if="confirmLeave" d="m2 2 20 20" />
            </svg>
            <span>{{ confirmLeave ? 'Confirmar' : 'Sair' }}</span>
          </button>
        </div>

        <div v-if="confirmLeave" class="player-call__confirm" role="alertdialog" aria-label="Sair da chamada">
          <p>Sair da chamada? Você pode voltar depois.</p>
          <div class="player-call__confirm-actions">
            <button type="button" class="btn secondary" @click="confirmLeave = false">Cancelar</button>
            <button type="button" class="btn danger" @click="leave">Sair</button>
          </div>
        </div>

        <p v-if="!store.turnConfigured" class="player-call__note" role="status">
          Sem TURN configurado: redes restritas podem falhar.
        </p>
      </template>

      <template v-else>
        <p class="player-call__intro">
          Áudio primeiro. Em uma mesa presencial, entre mudo para evitar eco entre os celulares
          na mesma sala.
        </p>
        <ul class="player-call__tips">
          <li>O vídeo fica neste painel, nunca sobre o tabuleiro.</li>
          <li>Você pode trocar microfone e saída de áudio em Ajustes.</li>
          <li>Permissão negada? O navegador mostra o passo a passo acima.</li>
        </ul>
        <div class="player-call__join">
          <button
            type="button"
            class="btn"
            :disabled="store.connecting"
            @click="join(true)"
          >
            {{ store.connecting ? 'Conectando…' : 'Entrar mudo' }}
          </button>
          <button
            type="button"
            class="btn secondary"
            :disabled="store.connecting"
            @click="join(false)"
          >
            Entrar com microfone
          </button>
          <button type="button" class="btn ghost" @click="settingsOpen = true">
            Ajustes de áudio e vídeo
          </button>
        </div>
      </template>
    </div>

    <DeviceSettings :open="settingsOpen" @close="settingsOpen = false" />
  </BaseSheet>
</template>

<style scoped>
.player-call {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.player-call__status {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-xs);
}

.player-call__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-faint);
}

.player-call__dot.is-live {
  background: var(--success);
}

.player-call__dot.is-busy {
  background: var(--manila);
}

.player-call__dot.is-error {
  background: var(--danger);
}

.player-call__count {
  color: var(--text-faint);
}

.player-call__intro {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
}

.player-call__tips {
  margin: 0;
  padding-left: var(--s-5);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.player-call__tips li + li {
  margin-top: var(--s-2);
}

.player-call__join {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.player-call__join .btn {
  width: 100%;
}

.player-call__participants {
  max-height: min(42dvh, 360px);
  overflow-y: auto;
}

.player-call__controls {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-2);
}

.player-call__control {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 52px;
  padding: var(--s-1) var(--s-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-2xs);
}

.player-call__control > span {
  font-size: var(--text-2xs);
}

.player-call__control svg {
  color: currentColor;
}

.player-call__control.is-active {
  border-color: var(--accent-ink);
  background: var(--raised-2);
  color: var(--accent-ink);
}

.player-call__control--leave {
  border-color: rgb(178 58 50 / 0.65);
  color: var(--danger-ink);
}

.player-call__control:disabled {
  opacity: 0.55;
}

.player-call__confirm {
  padding: var(--s-3);
  border: 1px solid rgb(178 58 50 / 0.55);
  border-radius: var(--radius-sm);
  background: rgb(178 58 50 / 0.1);
}

.player-call__confirm p {
  margin: 0 0 var(--s-3);
  font-size: var(--text-sm);
}

.player-call__confirm-actions {
  display: flex;
  gap: var(--s-2);
}

.player-call__confirm-actions .btn {
  flex: 1;
}

.player-call__note {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border-left: 2px solid var(--manila);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.player-call__error {
  padding: var(--s-3);
  border: 1px solid rgb(178 58 50 / 0.55);
  border-radius: var(--radius-sm);
  background: rgb(178 58 50 / 0.1);
}

.player-call__error p {
  margin: 0;
  font-size: var(--text-sm);
}

.player-call__error-help {
  margin-top: var(--s-2) !important;
  color: var(--text-muted);
  font-size: var(--text-xs) !important;
}

.player-call__error-actions {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-3);
}

.player-call__error-actions .btn {
  flex: 1;
}

/* O componente compartilhado usa superfície própria; no sheet do jogador
   não há vidro/gradiente (regra visual da fase). */
.player-call :deep(.participant-grid) {
  border-color: var(--line);
  background: var(--panel);
  backdrop-filter: none;
}

.player-call :deep(.media-tile__placeholder) {
  background: var(--raised);
}

@media (max-width: 360px) {
  .player-call__controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
