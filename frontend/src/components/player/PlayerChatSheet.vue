<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BaseSheet from '../ui/BaseSheet.vue';
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
    open: boolean;
    tableId: string;
    connectionStatus?: string;
  }>(),
  { connectionStatus: 'connected' },
);

const emit = defineEmits<{ (e: 'close'): void }>();

const store = useChatStore();
const draft = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const hasNew = ref(false);

const isOffline = computed(() => props.connectionStatus !== 'connected');
const canSend = computed(
  () =>
    !store.sending &&
    !isOffline.value &&
    draft.value.trim().length > 0 &&
    draft.value.length <= CHAT_TEXT_MAX,
);
const remaining = computed(() => CHAT_TEXT_MAX - draft.value.length);

function ensureHistory() {
  if (!props.tableId || store.historyLoaded || store.loading) return;
  void store.loadHistory(props.tableId);
}

function isNearBottom(): boolean {
  const el = listRef.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
}

async function scrollToBottom() {
  await nextTick();
  const el = listRef.value;
  if (el) el.scrollTop = el.scrollHeight;
  hasNew.value = false;
}

function jumpToLatest() {
  void scrollToBottom();
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    ensureHistory();
    store.markRead();
    draft.value = '';
    void scrollToBottom();
  },
  { immediate: true },
);

watch(
  () => store.messages[store.messages.length - 1]?.id ?? '',
  () => {
    if (!props.open) return;
    store.markRead();
    if (isNearBottom()) void scrollToBottom();
    else hasNew.value = true;
  },
);

// Teclado: mantém o compositor à vista quando o campo recebe foco.
function handleComposerFocus() {
  window.setTimeout(() => {
    inputRef.value?.scrollIntoView?.({ block: 'nearest' });
    void scrollToBottom();
  }, 80);
}

let viewportHandler: (() => void) | null = null;

onMounted(() => {
  if (typeof window !== 'undefined' && window.visualViewport) {
    viewportHandler = () => {
      if (props.open) void scrollToBottom();
    };
    window.visualViewport.addEventListener('resize', viewportHandler);
  }
});

onBeforeUnmount(() => {
  if (viewportHandler && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', viewportHandler);
  }
  viewportHandler = null;
});

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
      segment.type === 'mention' &&
      Boolean(myName) &&
      segment.text.slice(1).toLocaleLowerCase() === myName,
  };
}

async function submit() {
  if (!canSend.value) return;
  const text = draft.value;
  const ok = await store.send(props.tableId, text);
  if (!ok) return;
  draft.value = '';
  await scrollToBottom();
  inputRef.value?.focus();
}
</script>

<template>
  <BaseSheet
    :open="open"
    title="Chat"
    label="Chat da mesa"
    @close="emit('close')"
  >
    <div class="player-chat" data-testid="chat-panel" aria-label="Chat da mesa">
      <div class="player-chat__status-row">
        <span class="player-chat__status" :class="{ 'is-offline': isOffline }">
          {{ isOffline ? 'Sem conexão' : 'Conectado' }}
        </span>
        <span class="player-chat__meta">{{ store.messages.length }} mensagens</span>
      </div>

      <p v-if="isOffline" class="player-chat__notice" role="status">
        O chat volta quando a mesa reconectar.
      </p>
      <p v-if="store.error" class="player-chat__error" role="alert">{{ store.error }}</p>
      <p v-else-if="store.loading" class="player-chat__notice" role="status">Carregando histórico…</p>

      <div
        ref="listRef"
        class="player-chat__list"
        role="log"
        aria-live="polite"
        aria-label="Mensagens"
        @scroll="hasNew = hasNew && !isNearBottom()"
      >
        <p v-if="!store.messages.length && !store.loading" class="player-chat__empty">
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
          <article v-else class="chat-message" data-kind="user">
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

      <button
        v-if="hasNew"
        type="button"
        class="player-chat__jump"
        @click="jumpToLatest"
      >
        Novas mensagens
      </button>
    </div>

    <template #footer>
      <form class="player-chat__composer" @submit.prevent="submit">
        <label class="player-chat__field">
          <span class="sr-only">Mensagem</span>
          <textarea
            ref="inputRef"
            v-model="draft"
            class="player-chat__input"
            rows="1"
            :maxlength="CHAT_TEXT_MAX"
            :disabled="store.sending || isOffline"
            placeholder="Escreva uma mensagem…"
            aria-label="Escreva uma mensagem"
            @focus="handleComposerFocus"
            @keydown.enter.exact.prevent="submit"
          ></textarea>
        </label>
        <div class="player-chat__send-row">
          <span class="player-chat__count" :class="{ 'is-near-limit': remaining < 100 }">
            {{ draft.length }}/{{ CHAT_TEXT_MAX }}
          </span>
          <button type="submit" class="btn" :disabled="!canSend">
            {{ store.sending ? 'Enviando…' : 'Enviar' }}
          </button>
        </div>
        <p class="player-chat__hint">Enter envia · Shift+Enter quebra linha</p>
      </form>
    </template>
  </BaseSheet>
</template>

<style scoped>
.player-chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: min(52dvh, 520px);
}

.player-chat__status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-3);
}

.player-chat__status {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--success-ink);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.player-chat__status::before {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  content: '';
}

.player-chat__status.is-offline {
  color: var(--danger-ink);
}

.player-chat__meta {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.player-chat__notice,
.player-chat__error {
  margin: 0 0 var(--s-3);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--radius-xs);
  font-size: var(--text-xs);
}

.player-chat__notice {
  border-left: 2px solid var(--manila);
  background: var(--raised);
  color: var(--text-muted);
}

.player-chat__error {
  border-left: 2px solid var(--danger);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
}

.player-chat__list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--s-2);
  min-height: 140px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 2px;
}

.player-chat__empty {
  margin: auto;
  padding: var(--s-5) var(--s-3);
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.chat-message {
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
}

.chat-message__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: 2px;
}

.chat-message__author {
  color: var(--accent-ink);
  font-size: var(--text-xs);
  font-weight: 600;
}

.chat-message__time {
  flex: 0 0 auto;
  color: var(--text-faint);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.chat-message__text {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--text-sm);
  line-height: 1.4;
  white-space: pre-wrap;
}

.chat-message__mention {
  padding: 0 3px;
  border-radius: var(--radius-xs);
  background: rgb(47 108 132 / 0.28);
  color: var(--text);
  font-weight: 500;
}

.chat-message__mention.is-all {
  background: rgb(217 180 91 / 0.2);
  color: var(--manila);
}

.chat-message__mention.is-self {
  outline: 1px solid var(--accent-ink);
}

.chat-message--system {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  border-style: dashed;
  background: transparent;
  color: var(--text-muted);
}

.chat-message__system-text {
  overflow-wrap: anywhere;
  font-size: var(--text-xs);
  font-style: italic;
}

.player-chat__jump {
  align-self: center;
  min-height: 36px;
  margin-top: var(--s-2);
  padding: 0 var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-xs);
}

.player-chat__composer {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--s-2);
  width: 100%;
}

.player-chat__field {
  display: block;
  width: 100%;
  margin: 0;
}

.player-chat__input {
  width: 100%;
  min-height: 44px;
  max-height: 120px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.35;
  resize: none;
}

.player-chat__send-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.player-chat__count {
  color: var(--text-faint);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.player-chat__count.is-near-limit {
  color: var(--manila);
}

.player-chat__send-row .btn {
  min-width: 96px;
  min-height: 44px;
}

.player-chat__hint {
  margin: 0;
  color: var(--text-faint);
  font-size: var(--text-2xs);
}

@media (hover: none), (pointer: coarse) {
  .player-chat__hint {
    display: none;
  }
}

@media (max-height: 520px) and (orientation: landscape) {
  .player-chat {
    height: min(42dvh, 280px);
  }
}
</style>
