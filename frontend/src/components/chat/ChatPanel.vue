<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useChatStore } from '../../stores/chatStore';
import { currentUser } from '../../services/authService';
import {
  CHAT_TEXT_MAX,
  formatChatText,
  isAllMention,
  type ChatTextSegment,
} from '../../services/chatService';
import type { ChatMessage } from '../../types';

const props = withDefaults(
  defineProps<{
    tableId: string;
    open: boolean;
    connectionStatus?: string;
    /** Força o layout de bottom sheet (testes/teclado); senão usa matchMedia. */
    mobile?: boolean;
  }>(),
  {
    connectionStatus: 'connected',
  },
);

const emit = defineEmits<{ (e: 'close'): void }>();

const store = useChatStore();
const draft = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const internalMobile = ref(false);
let mobileQuery: MediaQueryList | null = null;

const mobileSheet = computed(() => props.mobile ?? internalMobile.value);
const isOffline = computed(() => props.connectionStatus !== 'connected');
const canSend = computed(
  () =>
    !store.sending
    && !isOffline.value
    && draft.value.trim().length > 0
    && draft.value.length <= CHAT_TEXT_MAX,
);
const remaining = computed(() => CHAT_TEXT_MAX - draft.value.length);

function updateMobile(): void {
  internalMobile.value = mobileQuery?.matches ?? false;
}

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mobileQuery = window.matchMedia('(max-width: 900px)');
    updateMobile();
    mobileQuery.addEventListener?.('change', updateMobile);
  }
  if (props.open) {
    ensureHistory();
    void focusInput();
    void scrollToBottom();
  }
});

onBeforeUnmount(() => {
  mobileQuery?.removeEventListener?.('change', updateMobile);
  mobileQuery = null;
});

function ensureHistory(): void {
  if (!props.tableId || store.historyLoaded || store.loading) return;
  void store.loadHistory(props.tableId);
}

async function focusInput(): Promise<void> {
  await nextTick();
  inputRef.value?.focus();
}

async function scrollToBottom(): Promise<void> {
  await nextTick();
  const element = listRef.value;
  if (element) element.scrollTop = element.scrollHeight;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    ensureHistory();
    store.markRead();
    void focusInput();
    void scrollToBottom();
  },
);

watch(
  () => store.messages[store.messages.length - 1]?.id ?? '',
  () => {
    if (!props.open) return;
    store.markRead();
    void scrollToBottom();
  },
);

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function segmentsFor(message: ChatMessage): ChatTextSegment[] {
  return formatChatText(message.text);
}

function segmentClass(segment: ChatTextSegment): Record<string, boolean> {
  const myName = currentUser.value?.username?.toLocaleLowerCase();
  return {
    'chat-message__mention': segment.type !== 'text',
    'is-all': segment.type === 'all' || (segment.type === 'mention' && isAllMention(segment.text.slice(1))),
    'is-self':
      segment.type === 'mention'
      && Boolean(myName)
      && segment.text.slice(1).toLocaleLowerCase() === myName,
  };
}

function mentionTitle(message: ChatMessage): string {
  if (!message.mentions.length) return '';
  return `Menções: ${message.mentions.join(', ')}`;
}

async function submit(): Promise<void> {
  if (!canSend.value) return;
  const text = draft.value;
  const ok = await store.send(props.tableId, text);
  if (!ok) {
    // Mantém o texto para o usuário tentar de novo; erro fica visível no painel.
    void focusInput();
    return;
  }
  draft.value = '';
  await scrollToBottom();
  void focusInput();
}
</script>

<template>
  <section
    v-if="open"
    class="chat-panel"
    :class="{ 'chat-panel--mobile': mobileSheet, 'chat-panel--desktop': !mobileSheet }"
    role="dialog"
    aria-label="Chat da mesa"
    data-testid="chat-panel"
    @keydown.escape="emit('close')"
  >
    <header class="chat-panel__header">
      <div class="chat-panel__heading">
        <p class="chat-panel__eyebrow">Mesa</p>
        <h3>Chat</h3>
      </div>
      <button
        type="button"
        class="chat-panel__close"
        aria-label="Fechar chat"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <p v-if="isOffline" class="chat-panel__status" role="status">
      Sem conexão — o chat volta quando a mesa reconectar.
    </p>
    <p v-if="store.error" class="chat-panel__error" role="alert">{{ store.error }}</p>
    <p v-else-if="store.loading" class="chat-panel__status" role="status">Carregando histórico…</p>

    <div ref="listRef" class="chat-panel__list" role="log" aria-live="polite" aria-label="Mensagens">
      <p v-if="!store.messages.length && !store.loading" class="chat-panel__empty">
        Nenhuma mensagem ainda. Diga olá para a mesa.
      </p>

      <template v-for="message in store.messages" :key="message.id">
        <article
          v-if="message.kind === 'system'"
          class="chat-message chat-message--system"
          data-kind="system"
        >
          <span class="chat-message__system-text">{{ message.text }}</span>
          <time class="chat-message__time" :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time>
        </article>
        <article
          v-else
          class="chat-message"
          data-kind="user"
          :title="mentionTitle(message)"
        >
          <header class="chat-message__meta">
            <span class="chat-message__author">{{ message.username || 'Jogador' }}</span>
            <time class="chat-message__time" :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time>
          </header>
          <p class="chat-message__text">
            <template v-for="(segment, index) in segmentsFor(message)" :key="`${message.id}-${index}`">
              <span :class="segmentClass(segment)">{{ segment.text }}</span>
            </template>
          </p>
        </article>
      </template>
    </div>

    <form class="chat-panel__composer" @submit.prevent="submit">
      <label class="chat-panel__field">
        <span class="chat-panel__sr-only">Mensagem</span>
        <textarea
          ref="inputRef"
          v-model="draft"
          class="chat-panel__input"
          rows="1"
          :maxlength="CHAT_TEXT_MAX"
          :disabled="store.sending || isOffline"
          placeholder="Escreva uma mensagem…"
          aria-label="Escreva uma mensagem"
          @keydown.enter.exact.prevent="submit"
        ></textarea>
      </label>
      <div class="chat-panel__actions">
        <span class="chat-panel__count" :class="{ 'is-near-limit': remaining < 100 }">
          {{ draft.length }}/{{ CHAT_TEXT_MAX }}
        </span>
        <button
          type="button"
          class="chat-panel__send"
          :disabled="!canSend"
          aria-label="Enviar mensagem"
          @click="submit"
        >
          {{ store.sending ? 'Enviando…' : 'Enviar' }}
        </button>
      </div>
      <p class="chat-panel__hint">Enter envia · Shift+Enter quebra linha</p>
    </form>
  </section>
</template>

<style scoped>
.chat-panel {
  position: fixed;
  z-index: 78;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  padding: 14px;
  border: 1px solid var(--color-border, #4b3a44);
  background: linear-gradient(180deg, rgba(18, 14, 19, 0.98), rgba(11, 9, 14, 0.98));
  color: var(--color-text, #f3e9ef);
  box-shadow: var(--elev-3, 0 18px 42px rgba(0, 0, 0, 0.45));
}

.chat-panel--desktop {
  right: 20px;
  bottom: calc(132px + env(safe-area-inset-bottom, 0px));
  width: min(380px, calc(100vw - 40px));
  max-height: min(70vh, 560px);
  border-radius: 18px;
}

.chat-panel--mobile {
  left: 10px;
  right: 10px;
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  width: auto;
  max-height: min(68dvh, 540px);
  border-radius: 18px 18px 12px 12px;
}

.chat-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.chat-panel__eyebrow {
  margin: 0;
  color: var(--color-text-muted, #c9c5d4);
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.chat-panel__heading h3 {
  margin: 2px 0 0;
  font-size: 1.08rem;
}

.chat-panel__close {
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border, #4b3a44);
  border-radius: 999px;
  background: var(--color-surface-alt, #3a2c34);
  color: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.chat-panel__status,
.chat-panel__error {
  margin: 0;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 0.76rem;
  line-height: 1.35;
}

.chat-panel__status {
  background: rgba(245, 165, 36, 0.12);
  color: #ffd28a;
}

.chat-panel__error {
  background: rgba(229, 57, 53, 0.14);
  color: #ffb4b0;
}

.chat-panel__list {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}

.chat-panel__empty {
  margin: auto;
  padding: 18px 8px;
  color: var(--color-text-muted, #c9c5d4);
  font-size: 0.84rem;
  text-align: center;
}

.chat-message {
  padding: 8px 10px;
  border: 1px solid var(--color-border, #4b3a44);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
}

.chat-message__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 3px;
}

.chat-message__author {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-accent, #c8a2c8);
}

.chat-message__time {
  flex: 0 0 auto;
  color: var(--color-text-muted, #c9c5d4);
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
}

.chat-message__text {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.chat-message__mention {
  padding: 0 3px;
  border-radius: 4px;
  background: rgba(200, 162, 200, 0.2);
  color: #f0d7f0;
  font-weight: 600;
}

.chat-message__mention.is-all {
  background: rgba(201, 162, 39, 0.22);
  color: #ffe29a;
}

.chat-message__mention.is-self {
  outline: 1px solid rgba(200, 162, 200, 0.6);
}

.chat-message--system {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  border-style: dashed;
  background: rgba(255, 255, 255, 0.02);
  color: var(--color-text-muted, #c9c5d4);
}

.chat-message__system-text {
  font-size: 0.77rem;
  font-style: italic;
  overflow-wrap: anywhere;
}

.chat-panel__composer {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-panel__field {
  display: block;
}

.chat-panel__input {
  width: 100%;
  min-height: 44px;
  max-height: 120px;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--color-border-strong, #6b5561);
  border-radius: 10px;
  background: var(--color-surface-alt, #3a2c34);
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
  line-height: 1.35;
  resize: vertical;
}

.chat-panel__input:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.chat-panel__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-panel__count {
  color: var(--color-text-muted, #c9c5d4);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.chat-panel__count.is-near-limit {
  color: var(--color-warning, #f5a524);
}

.chat-panel__send {
  min-width: 96px;
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid #ab865c;
  border-radius: 10px;
  background: var(--color-accent-alt, #98734f);
  color: #1b120c;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.chat-panel__send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chat-panel__hint {
  margin: 0;
  color: var(--color-text-muted, #c9c5d4);
  font-size: 0.68rem;
}

.chat-panel__close:focus-visible,
.chat-panel__send:focus-visible,
.chat-panel__input:focus-visible {
  outline: 2px solid var(--color-warning, #f5a524);
  outline-offset: 2px;
}

.chat-panel__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 900px) {
  .chat-panel--mobile .chat-message {
    padding: 8px;
  }

  .chat-panel__list {
    min-height: 100px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-panel,
  .chat-message {
    transition: none;
  }
}
</style>
