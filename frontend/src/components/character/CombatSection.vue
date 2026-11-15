<script setup lang="ts">
import { computed } from 'vue';
import SheetField from './SheetField.vue';
import type { SheetDraft, SheetPatch } from './sheetTypes';
import { abilityModifier, formatModifier } from '../../services/characterMath';

const props = defineProps<{
  draft: SheetDraft;
  canEdit: boolean;
  patch: (patch: SheetPatch) => void;
  dnd: boolean;
}>();

const dexModifier = computed(() => {
  // Chaves maiúsculas (seed D&D 5e); `attributes.dex` é tolerado como fallback.
  const raw = props.draft.attributes.DEX ?? props.draft.attributes.dex;
  const score = Number(raw);
  return abilityModifier(Number.isFinite(score) ? score : 10);
});

function setProfile(partial: Partial<SheetDraft['profile']>) {
  props.patch({ profile: partial });
}
</script>

<template>
  <div class="combat">
    <SheetField
      label="Iniciativa Base"
      :model-value="draft.stats.baseInitiative"
      :readonly="!canEdit"
      type="number"
      placeholder="0"
      :hint="dnd ? `Destreza: ${formatModifier(dexModifier)}` : undefined"
      @update:model-value="patch({ stats: { baseInitiative: $event } })"
    />

    <template v-if="dnd">
      <SheetField
        label="Deslocamento"
        :model-value="draft.profile.speed"
        :readonly="!canEdit"
        type="number"
        :min="0"
        placeholder="Ex.: 30"
        hint="Em pés por rodada (D&D 5e)"
        @update:model-value="setProfile({ speed: $event })"
      />
      <SheetField
        label="Dados de vida"
        :model-value="draft.profile.hitDice"
        :readonly="!canEdit"
        placeholder="Ex.: 8d8"
        @update:model-value="setProfile({ hitDice: $event })"
      />
      <SheetField
        label="Notas de combate"
        :model-value="draft.notes"
        :readonly="!canEdit"
        type="textarea"
        :rows="3"
        placeholder="PV temporário, reduções de dano, condições…"
        hint="Mesmo conteúdo da aba Notas; PV temporário pode morar aqui."
        @update:model-value="patch({ notes: $event })"
      />
    </template>

    <p v-else class="combat__hint">
      PV, Defesa e Iniciativa ficam no topo da ficha e são gravados em
      <strong>Salvar alterações</strong>.
    </p>
  </div>
</template>

<style scoped>
.combat {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  align-items: start;
}

.combat__hint {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
</style>
