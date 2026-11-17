<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../Icon.vue';
import { PLAYER_TABS, type PlayerTab } from './tabs';

const props = withDefaults(
  defineProps<{
    active: PlayerTab;
    unread?: number;
    callActive?: boolean;
    callCount?: number;
  }>(),
  {
    unread: 0,
    callActive: false,
    callCount: 0,
  },
);

const emit = defineEmits<{ (e: 'select', tab: PlayerTab): void }>();

const tabs = PLAYER_TABS;

const badge = computed(() => (props.unread > 99 ? '99+' : String(props.unread)));

function stateFor(tab: PlayerTab): 'page' | undefined {
  return tab === props.active ? 'page' : undefined;
}

function ariaFor(tab: PlayerTab): string {
  let label = tab === 'chat' && props.unread > 0
    ? `Chat, ${props.unread} ${props.unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`
    : tab === 'chamada' && props.callActive
      ? `Chamada, ${props.callCount} ${props.callCount === 1 ? 'participante' : 'participantes'}`
      : tab === 'mesa'
        ? 'Mesa e tabuleiro'
        : tab;
  label = label.charAt(0).toUpperCase() + label.slice(1);
  return props.active === tab ? `${label}, aba atual` : label;
}
</script>

<template>
  <nav class="player-nav" aria-label="Navegação do jogador">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      type="button"
      class="player-nav__item"
      :class="{ 'is-active': active === tab.key }"
      :aria-current="stateFor(tab.key)"
      :aria-label="ariaFor(tab.key)"
      :data-testid="tab.key === 'chat' ? 'chat-toggle' : undefined"
      :data-tab="tab.key"
      @click="emit('select', tab.key)"
    >
      <span class="player-nav__icon" aria-hidden="true">
        <Icon v-if="tab.key === 'ficha'" name="book" :size="20" />
        <Icon v-else-if="tab.key === 'dados'" name="dice" :size="20" />
        <svg
          v-else-if="tab.key === 'mesa'"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        </svg>
        <svg
          v-else-if="tab.key === 'chat'"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 2 1.8z" />
        </svg>
      </span>
      <span class="player-nav__label">
        {{ tab.label }}
        <span v-if="tab.key === 'chat' && unread > 0" class="player-nav__badge">{{ badge }}</span>
        <span
          v-else-if="tab.key === 'chamada' && callActive"
          class="player-nav__call-dot"
          aria-hidden="true"
        ></span>
      </span>
    </button>
  </nav>
</template>

<style scoped>
.player-nav {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0;
  width: 100%;
  padding: 0 0 env(safe-area-inset-bottom, 0px);
  border-top: 1px solid var(--line);
  background: var(--panel);
}

.player-nav__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  min-height: 64px;
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-2xs);
  line-height: 1.1;
}

.player-nav__item::before {
  position: absolute;
  top: 0;
  right: 8px;
  left: 8px;
  height: 2px;
  background: transparent;
  content: '';
}

.player-nav__item:hover {
  background: var(--raised);
  color: var(--text);
}

.player-nav__item.is-active {
  color: var(--text);
}

.player-nav__item.is-active::before {
  background: var(--accent-ink);
}

.player-nav__item.is-active .player-nav__label {
  font-weight: 600;
}

.player-nav__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.player-nav__label {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  overflow: hidden;
  font-size: var(--text-2xs);
  white-space: nowrap;
}

.player-nav__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: var(--radius-pill);
  background: var(--danger);
  color: var(--on-danger);
  font-family: var(--font-data);
  font-size: 0.5625rem;
  font-weight: 500;
  line-height: 1;
}

.player-nav__call-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success-ink);
}

.player-nav__item:focus-visible {
  outline-offset: -2px;
}

@media (max-height: 520px) and (orientation: landscape) {
  .player-nav__item {
    min-height: 48px;
    flex-direction: row;
    gap: var(--s-2);
  }

  .player-nav__item::before {
    top: auto;
    bottom: 0;
  }
}

@media (max-width: 340px) {
  .player-nav__label {
    font-size: 0.625rem;
  }
}
</style>
