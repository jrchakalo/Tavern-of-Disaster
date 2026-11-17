<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { IInitiativeEntry, TokenInfo } from '../../types';
import { characterResourceBadges } from '../character/summary';

const props = withDefaults(
  defineProps<{
    entries: IInitiativeEntry[];
    tokens: TokenInfo[];
    metersPerSquare?: number;
    currentUserId?: string | null;
    orientation?: 'horizontal' | 'vertical';
    /** Fichas que este cliente pode abrir (dono/DM) — vira `.character-link`. */
    openableCharacterIds?: string[];
    /** Rodada da iniciativa, quando o servidor expõe esse dado. */
    round?: number | null;
    /** Uma linha: ator atual + próximo. Usado no rodapé do jogador. */
    compact?: boolean;
    /** Rola até o ator atual ao montar/trocar de turno. */
    autoScroll?: boolean;
  }>(),
  {
    tokens: () => [],
    metersPerSquare: 1.5,
    currentUserId: null,
    orientation: 'horizontal',
    openableCharacterIds: () => [],
    round: null,
    compact: false,
    autoScroll: true,
  },
);

const emit = defineEmits<{
  (e: 'open-character-sheet', characterId: string): void;
  (e: 'open-sheet'): void;
}>();

const openableIds = computed(() => new Set(props.openableCharacterIds));
const listRef = ref<HTMLElement | null>(null);

const enriched = computed(() =>
  props.entries.map((entry) => {
    const token = props.tokens.find((item) => item._id === entry.tokenId) ?? null;
    const isMine = Boolean(
      token && props.currentUserId && token.ownerId && token.ownerId._id === props.currentUserId,
    );
    const remaining = token ? `${token.remainingMovement.toFixed(1).replace('.', ',')} m` : '—';
    const vitals = token?.character ?? null;
    const resources = characterResourceBadges(vitals);
    return { entry, token, isMine, remaining, vitals, resources };
  }),
);

const currentIndex = computed(() => enriched.value.findIndex((item) => item.entry.isCurrentTurn));
const current = computed(() => (currentIndex.value >= 0 ? enriched.value[currentIndex.value] : null));
const next = computed(() => {
  if (!enriched.value.length) return null;
  if (currentIndex.value < 0) return enriched.value[0] ?? null;
  return enriched.value[(currentIndex.value + 1) % enriched.value.length] ?? null;
});

const roundLabel = computed(() => (props.round && props.round > 0 ? `Rodada ${props.round}` : ''));
const compactLabel = computed(() => {
  if (!current.value) return 'Iniciativa não iniciada';
  return roundLabel.value ? `${roundLabel.value}` : 'Turno';
});
const compactActor = computed(() => current.value?.entry.characterName ?? '');
const nextIsMine = computed(() => Boolean(next.value?.isMine && next.value?.entry._id !== current.value?.entry._id));

const reducedMotion = computed(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
});

async function scrollToCurrent() {
  if (!props.autoScroll || props.compact) return;
  await nextTick();
  const list = listRef.value;
  if (!list) return;
  const element = list.querySelector<HTMLElement>('[data-current="true"]');
  if (!element) return;
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: reducedMotion.value ? 'auto' : 'smooth',
    });
    return;
  }
  // Fallback determinístico (jsdom/navegadores antigos): mantém o ator visível.
  const left = element.offsetLeft - list.clientWidth / 2 + element.clientWidth / 2;
  if (list.scrollTo) list.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
  else list.scrollLeft = Math.max(0, left);
}

watch(
  () => [current.value?.entry._id ?? '', props.entries.length, props.orientation] as const,
  () => {
    void scrollToCurrent();
  },
  { immediate: true, flush: 'post' },
);
</script>

<template>
  <button
    v-if="compact"
    type="button"
    class="initiative-line"
    aria-haspopup="dialog"
    :aria-label="`${compactLabel}${compactActor ? `, ${compactActor}` : ''}. Abrir iniciativa.`"
    @click="emit('open-sheet')"
  >
    <span
      class="initiative-line__dot"
      :style="{ background: current?.token?.color || 'var(--text-faint)' }"
      aria-hidden="true"
    ></span>
    <span class="initiative-line__copy">
      <span class="initiative-line__label">{{ compactLabel }}</span>
      <span v-if="compactActor" class="initiative-line__actor">{{ compactActor }}</span>
    </span>
    <span v-if="nextIsMine" class="initiative-line__next">Próximo: você</span>
    <span class="initiative-line__action" aria-hidden="true">Iniciativa</span>
  </button>

  <div
    v-else
    ref="listRef"
    class="initiative-strip"
    :class="`orientation-${orientation}`"
    :aria-label="roundLabel ? `Iniciativa, ${roundLabel}` : 'Iniciativa'"
  >
    <p v-if="!enriched.length" class="initiative-strip__empty">Iniciativa não iniciada.</p>
    <template v-else>
      <article
        v-for="item in enriched"
        :key="item.entry._id"
        class="initiative-item"
        :class="{ 'is-current': item.entry.isCurrentTurn, 'is-mine': item.isMine }"
        :aria-current="item.entry.isCurrentTurn ? 'true' : undefined"
        :data-current="item.entry.isCurrentTurn ? 'true' : undefined"
      >
        <div class="initiative-item__top">
          <span
            class="initiative-item__dot"
            :style="{ background: item.token?.color || 'var(--text-faint)' }"
            aria-hidden="true"
          ></span>
          <button
            v-if="item.entry.characterId && openableIds.has(item.entry.characterId)"
            type="button"
            class="character-link"
            :title="`Abrir ficha de ${item.entry.characterName}`"
            @click.stop="emit('open-character-sheet', item.entry.characterId)"
          >
            {{ item.entry.characterName }}
          </button>
          <span v-else class="initiative-item__name" :title="item.entry.characterName">
            {{ item.entry.characterName }}
          </span>
          <span v-if="item.isMine" class="initiative-item__mine">Você</span>
        </div>
        <div v-if="item.vitals" class="initiative-item__vitals">
          <span
            v-if="item.vitals.maxHP != null"
            class="initiative-item__hp"
            :title="`PV ${item.vitals.currentHP ?? 0} / ${item.vitals.maxHP}`"
          >
            PV {{ item.vitals.currentHP ?? 0 }}/{{ item.vitals.maxHP }}
          </span>
          <span v-if="item.vitals.defense != null" class="initiative-item__def">
            CA {{ item.vitals.defense }}
          </span>
          <span
            v-for="resource in item.resources"
            :key="resource.key"
            class="initiative-item__resource"
            :title="resource.title"
          >
            {{ resource.label }} {{ resource.value }}
          </span>
        </div>
        <div class="initiative-item__meta">
          <span v-if="item.entry.isCurrentTurn" class="initiative-item__turn">Turno atual</span>
          <span v-if="item.token">Movimento {{ item.remaining }}</span>
          <span v-if="orientation === 'vertical' && item.token?.ownerId">
            {{ item.token.ownerId.username }}
          </span>
        </div>
      </article>
    </template>
  </div>
</template>

<style scoped>
.initiative-line {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  width: 100%;
  min-height: 40px;
  padding: 0 var(--s-4);
  border: 0;
  border-top: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-sans);
  text-align: left;
}

.initiative-line:hover {
  background: var(--raised);
}

.initiative-line__dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.initiative-line__copy {
  display: flex;
  flex: 1;
  align-items: baseline;
  gap: var(--s-2);
  min-width: 0;
}

.initiative-line__label {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.initiative-line__actor {
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.initiative-line__next {
  flex: 0 0 auto;
  color: var(--accent-ink);
  font-size: var(--text-2xs);
  font-weight: 500;
}

.initiative-line__action {
  flex: 0 0 auto;
  color: var(--text-faint);
  font-size: var(--text-2xs);
}

.initiative-strip {
  display: flex;
  gap: var(--s-2);
  padding: var(--s-1) var(--s-4);
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
}

.initiative-strip.orientation-vertical {
  flex: 1;
  min-height: 0;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0;
  scroll-snap-type: y proximity;
}

.initiative-strip__empty {
  margin: 0;
  padding: var(--s-3) var(--s-4);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.initiative-item {
  flex: 0 0 auto;
  min-width: 132px;
  max-width: 180px;
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  scroll-snap-align: center;
}

.initiative-item.is-current {
  border-color: var(--manila);
  background: var(--raised);
}

.initiative-item.is-mine {
  box-shadow: inset 0 0 0 1px var(--accent-ink);
}

.initiative-strip.orientation-vertical .initiative-item {
  min-width: 0;
  max-width: none;
  padding: var(--s-3);
}

.initiative-item__top {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
}

.initiative-item__dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.initiative-item__name {
  overflow: hidden;
  font-size: var(--text-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent-ink);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: rgb(127 182 201 / 0.4);
  text-underline-offset: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.character-link:hover {
  color: var(--text);
}

.initiative-item__mine {
  margin-left: auto;
  padding: 0 4px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  color: var(--accent-ink);
  font-family: var(--font-data);
  font-size: 0.5625rem;
}

.initiative-item__vitals {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin-top: var(--s-2);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.initiative-item__hp {
  font-weight: 500;
  color: var(--text);
}

.initiative-item__def {
  font-weight: 500;
  color: var(--accent-ink);
}

.initiative-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  margin-top: var(--s-2);
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

.initiative-item__turn {
  color: var(--manila);
  font-weight: 500;
}

@media (prefers-reduced-motion: reduce) {
  .initiative-item {
    transition: none;
  }
}
</style>
