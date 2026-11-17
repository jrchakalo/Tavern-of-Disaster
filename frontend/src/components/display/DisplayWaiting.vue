<script setup lang="ts">
import { computed } from 'vue';

type SessionStatus = 'PREPARING' | 'LIVE' | 'PAUSED' | 'ENDED';

const props = withDefaults(
  defineProps<{
    status: SessionStatus;
    tableName: string;
    inviteCode?: string;
    qrDataUrl?: string;
    /** `mm:ss` restante da pausa, quando o snapshot expõe `pauseUntil`. */
    pauseLabel?: string;
  }>(),
  {
    inviteCode: '',
    qrDataUrl: '',
    pauseLabel: '',
  },
);

const copy = computed(() => {
  switch (props.status) {
    case 'PAUSED':
      return {
        eyebrow: 'Intervalo',
        title: 'Sessão pausada',
        lead: props.pauseLabel
          ? 'A mesa volta quando o relógio zerar.'
          : 'O Mestre retoma a sessão quando estiver pronto.',
      };
    case 'ENDED':
      return {
        eyebrow: 'Fim do registro',
        title: 'Sessão encerrada',
        lead: 'Obrigado pela mesa. O tabuleiro fica como registro do último encontro.',
      };
    default:
      return {
        eyebrow: 'Mesa em preparação',
        title: 'Aguardando o Mestre',
        lead: 'O tabuleiro aparece aqui assim que a sessão começar.',
      };
  }
});
</script>

<template>
  <section class="display-waiting" :data-state="status">
    <div class="display-waiting__card" role="status" aria-live="polite">
      <p class="display-waiting__eyebrow">{{ copy.eyebrow }}</p>
      <h2 class="display-waiting__title">{{ copy.title }}</h2>
      <p class="display-waiting__lead">{{ copy.lead }}</p>
      <p class="display-waiting__table">{{ tableName }}</p>

      <div v-if="status === 'PAUSED' && pauseLabel" class="display-waiting__pause" aria-hidden="true">
        <span class="display-waiting__pause-label">Volta em</span>
        <strong class="display-waiting__pause-value">{{ pauseLabel }}</strong>
      </div>

      <div v-if="status === 'PREPARING'" class="display-waiting__invite">
        <template v-if="inviteCode">
          <div v-if="qrDataUrl" class="display-waiting__qr">
            <img
              :src="qrDataUrl"
              alt="QR Code para entrar na mesa pelo celular"
              width="180"
              height="180"
            />
          </div>
          <div class="display-waiting__invite-copy">
            <p class="display-waiting__code-label">Código da mesa</p>
            <p class="display-waiting__code">{{ inviteCode }}</p>
            <p class="display-waiting__invite-line">
              Entre em <strong>/play</strong> com o código
              <strong>{{ inviteCode }}</strong
              >.
            </p>
          </div>
        </template>
        <p v-else class="display-waiting__fallback">
          Peça o link ao Mestre para entrar pelo celular.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.display-waiting {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 2.4vw, 40px);
  background: rgb(4 6 7 / 0.86);
}

.display-waiting__card {
  width: min(640px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: clamp(24px, 2.6vw, 44px);
  border: 1px solid var(--line-strong);
  border-top: 3px solid var(--manila);
  border-radius: var(--radius-sm);
  background: var(--panel);
}

.display-waiting[data-state='PAUSED'] .display-waiting__card {
  border-top-color: var(--accent-ink);
}

.display-waiting[data-state='ENDED'] .display-waiting__card {
  border-top-color: var(--line-strong);
}

.display-waiting__eyebrow {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: clamp(0.875rem, 0.4vw + 0.7rem, 1.125rem);
}

.display-waiting__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2rem, 2vw + 1rem, 3.25rem);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.01em;
}

.display-waiting__lead {
  max-width: 46ch;
  margin: var(--s-4) 0 0;
  color: var(--text);
  font-size: clamp(1.125rem, 0.6vw + 0.85rem, 1.5rem);
  line-height: 1.4;
}

.display-waiting__table {
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: clamp(1.125rem, 0.6vw + 0.85rem, 1.5rem);
  overflow-wrap: anywhere;
}

.display-waiting__pause {
  display: flex;
  align-items: baseline;
  gap: var(--s-4);
  margin-top: var(--s-6);
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
}

.display-waiting__pause-label {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: clamp(1.125rem, 0.6vw + 0.85rem, 1.5rem);
}

.display-waiting__pause-value {
  color: var(--manila);
  font-family: var(--font-data);
  font-size: clamp(2.5rem, 3.4vw + 1rem, 4.5rem);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.display-waiting__invite {
  display: flex;
  align-items: center;
  gap: clamp(16px, 2vw, 32px);
  margin-top: var(--s-6);
  padding-top: var(--s-5);
  border-top: 1px solid var(--line);
}

.display-waiting__qr {
  flex: none;
  padding: 10px;
  border: 1px solid var(--paper-line);
  border-radius: var(--radius-xs);
  background: #fff;
}

.display-waiting__qr img {
  display: block;
  width: 180px;
  height: 180px;
}

.display-waiting__invite-copy {
  min-width: 0;
}

.display-waiting__code-label {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: clamp(0.875rem, 0.4vw + 0.7rem, 1.125rem);
}

.display-waiting__code {
  margin: var(--s-1) 0 var(--s-3);
  color: var(--manila);
  font-family: var(--font-data);
  font-size: clamp(2rem, 2.2vw + 1rem, 3rem);
  font-weight: 500;
  letter-spacing: 0.08em;
  line-height: 1.05;
  overflow-wrap: anywhere;
}

.display-waiting__invite-line,
.display-waiting__fallback {
  margin: 0;
  color: var(--text);
  font-size: clamp(1.125rem, 0.6vw + 0.85rem, 1.5rem);
  line-height: 1.4;
}

.display-waiting__fallback {
  max-width: 42ch;
  color: var(--text-muted);
}

@media (max-width: 760px) {
  .display-waiting__invite {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
