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
  gap: var(--s-3);
  box-sizing: border-box;
  padding: var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
}

.chat-panel--desktop {
  right: 20px;
  bottom: calc(132px + env(safe-area-inset-bottom, 0px));
  width: min(360px, calc(100vw - 40px));
  max-height: min(70vh, 560px);
}

.chat-panel--mobile {
  left: 10px;
  right: 10px;
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  width: auto;
  max-height: min(68dvh, 540px);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.chat-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--line);
}

.chat-panel__eyebrow {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.chat-panel__heading h3 {
  margin: 2px 0 0;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.chat-panel__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-out),
    color var(--dur-hover) var(--ease-out),
    border-color var(--dur-hover) var(--ease-out);
}

.chat-panel__close:hover {
  background: var(--raised-2);
  border-color: var(--line-strong);
  color: var(--text);
}

.chat-panel__status,
.chat-panel__error {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  font-size: var(--text-xs);
  line-height: 1.4;
}

.chat-panel__status {
  border-color: rgb(217 180 91 / 0.35);
  background: rgb(217 180 91 / 0.1);
  color: var(--manila);
}

.chat-panel__error {
  border-color: rgb(178 58 50 / 0.45);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
}

.chat-panel__list {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  padding-right: var(--s-1);
}

.chat-panel__empty {
  margin: auto;
  padding: var(--s-5) var(--s-3);
  color: var(--text-muted);
  font-size: var(--text-md);
  line-height: var(--leading-body);
  text-align: center;
}

/* Linhas de registro, não bolhas: autor, hora e corpo separados por régua. */
.chat-message {
  padding: var(--s-3) 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: transparent;
}

.chat-message:last-child {
  border-bottom: 0;
}

.chat-message__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-2);
  margin-bottom: 2px;
}

.chat-message__author {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.chat-message__time {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

.chat-message__text {
  margin: 0;
  color: var(--text);
  font-size: var(--text-md);
  line-height: 21px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.chat-message__mention {
  padding: 0 3px;
  border-radius: var(--radius-xs);
  background: rgb(127 182 201 / 0.16);
  color: var(--accent-ink);
  font-weight: 600;
}

.chat-message__mention.is-all {
  background: rgb(217 180 91 / 0.16);
  color: var(--manila);
}

.chat-message__mention.is-self {
  outline: 1px solid var(--accent-ink);
  outline-offset: -1px;
}

.chat-message--system {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-2);
  padding-left: var(--s-3);
  border-left: 2px solid var(--line-strong);
  border-bottom: 0;
  background: transparent;
  color: var(--text-muted);
}

.chat-message__system-text {
  font-size: var(--text-sm);
  font-style: italic;
  overflow-wrap: anywhere;
}

.chat-panel__composer {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding-top: var(--s-3);
  border-top: 1px solid var(--line);
}

.chat-panel__field {
  display: block;
  margin: 0;
}

.chat-panel__input {
  width: 100%;
  min-height: 40px;
  max-height: 120px;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: 1.4;
  resize: none;
}

.chat-panel__input:focus-visible {
  border-color: var(--focus);
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.chat-panel__input:disabled {
  border-color: var(--line);
  background: var(--raised);
  color: var(--text-muted);
  cursor: not-allowed;
}

.chat-panel__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.chat-panel__count {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  font-variant-numeric: tabular-nums;
}

.chat-panel__count.is-near-limit {
  color: var(--manila);
}

.chat-panel__send {
  min-width: 88px;
  min-height: 40px;
  padding: 0 var(--s-5);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-out),
    border-color var(--dur-hover) var(--ease-out),
    color var(--dur-hover) var(--ease-out);
}

.chat-panel__send:hover:not(:disabled) {
  background: var(--accent-hover);
}

.chat-panel__send:active:not(:disabled) {
  transform: translateY(1px);
  transition-duration: var(--dur-press);
}

.chat-panel__send:disabled {
  border-color: var(--line);
  background: var(--raised);
  color: var(--text-muted);
  cursor: not-allowed;
}

.chat-panel__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-2xs);
  line-height: 1.4;
}

.chat-panel__close:focus-visible,
.chat-panel__send:focus-visible {
  outline: 2px solid var(--focus);
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
    padding: var(--s-3) 0;
  }

  .chat-panel__list {
    min-height: 100px;
  }

  /* 16px evita o zoom automático do iOS no compositor. */
  .chat-panel__input {
    min-height: 44px;
    font-size: var(--text-base);
  }

  .chat-panel__send {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-panel,
  .chat-message,
  .chat-panel__close,
  .chat-panel__send,
  .chat-panel__input {
    transition: none;
  }
}
</style>
