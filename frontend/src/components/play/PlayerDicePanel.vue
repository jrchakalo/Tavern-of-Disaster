<script setup lang="ts">
import BaseSheet from '../ui/BaseSheet.vue';
import DiceTray from '../dice/DiceTray.vue';
import type { CharacterDTO, DiceRolledPayload, RollLogEntryDTO } from '../../types';

withDefaults(
  defineProps<{
    open: boolean;
    tableId: string;
    currentTokenId?: string | null;
    characters?: CharacterDTO[];
    activeCharacterId?: string | null;
    recentRolls?: RollLogEntryDTO[];
    connectionStatus?: string;
  }>(),
  {
    currentTokenId: null,
    characters: () => [],
    activeCharacterId: null,
    recentRolls: () => [],
    connectionStatus: 'connected',
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'roll-result', payload: DiceRolledPayload): void;
}>();
</script>

<template>
  <BaseSheet :open="open" title="Dados" @close="emit('close')">
    <div class="player-dice">
      <DiceTray
        :table-id="tableId"
        :current-token-id="currentTokenId"
        :characters="characters"
        :active-character-id="activeCharacterId"
        :recent-rolls="recentRolls"
        :connection-status="connectionStatus"
        @roll-result="emit('roll-result', $event)"
      />
    </div>
  </BaseSheet>
</template>

<style scoped>
.player-dice {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  min-width: 0;
}

/* Campos legados do DiceRoller (DM) que podem aparecer em telas pequenas. */
.player-dice :deep(input),
.player-dice :deep(select) {
  font-size: var(--text-base);
}

.player-dice :deep(.shortcut-btn) {
  min-width: 44px;
  min-height: 44px;
  padding: 0 var(--s-2);
}

.player-dice :deep(.primary),
.player-dice :deep(.ghost) {
  min-height: 48px;
}
</style>
