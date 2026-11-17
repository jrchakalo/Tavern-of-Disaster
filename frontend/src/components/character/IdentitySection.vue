<script setup lang="ts">
import SheetField from './SheetField.vue';
import type { SheetDraft, SheetPatch } from './sheetTypes';

const props = defineProps<{
  draft: SheetDraft;
  canEdit: boolean;
  patch: (patch: SheetPatch) => void;
  dnd: boolean;
  systemLabel?: string;
}>();

function setProfile(partial: Partial<SheetDraft['profile']>) {
  props.patch({ profile: partial });
}
</script>

<template>
  <div class="identity">
    <div class="identity__avatar" aria-hidden="true">
      <img v-if="draft.avatarUrl" :src="draft.avatarUrl" alt="" @error="patch({ avatarUrl: '' })" />
      <span v-else>{{ (draft.name || '?').charAt(0).toUpperCase() }}</span>
    </div>

    <div class="identity__grid">
      <SheetField
        label="Nome"
        :model-value="draft.name"
        :readonly="!canEdit"
        placeholder="Nome do personagem"
        @update:model-value="patch({ name: $event })"
      />
      <SheetField
        label="Avatar (URL)"
        :model-value="draft.avatarUrl"
        :readonly="!canEdit"
        type="url"
        placeholder="https://..."
        @update:model-value="patch({ avatarUrl: $event })"
      />

      <template v-if="dnd">
        <SheetField
          label="Classe"
          :model-value="draft.profile.className"
          :readonly="!canEdit"
          placeholder="Ex.: Ladina"
          @update:model-value="setProfile({ className: $event })"
        />
        <SheetField
          label="Nível"
          :model-value="draft.profile.level"
          :readonly="!canEdit"
          type="number"
          :min="1"
          placeholder="1"
          @update:model-value="setProfile({ level: $event })"
        />
        <SheetField
          label="Raça"
          :model-value="draft.profile.race"
          :readonly="!canEdit"
          placeholder="Ex.: Elfo"
          @update:model-value="setProfile({ race: $event })"
        />
        <SheetField
          label="Antecedente"
          :model-value="draft.profile.background"
          :readonly="!canEdit"
          placeholder="Ex.: Criminoso"
          @update:model-value="setProfile({ background: $event })"
        />
        <SheetField
          label="Alinhamento"
          :model-value="draft.profile.alignment"
          :readonly="!canEdit"
          placeholder="Ex.: Caótico Bom"
          @update:model-value="setProfile({ alignment: $event })"
        />
        <SheetField
          label="Dados de vida"
          :model-value="draft.profile.hitDice"
          :readonly="!canEdit"
          placeholder="Ex.: 8d8"
          @update:model-value="setProfile({ hitDice: $event })"
        />
      </template>

      <template v-else>
        <SheetField
          label="Função / classe"
          :model-value="draft.profile.className"
          :readonly="!canEdit"
          placeholder="Ex.: Solo"
          @update:model-value="setProfile({ className: $event })"
        />
        <SheetField
          label="Nível"
          :model-value="draft.profile.level"
          :readonly="!canEdit"
          type="number"
          :min="1"
          placeholder="1"
          @update:model-value="setProfile({ level: $event })"
        />
      </template>

      <p v-if="!dnd && systemLabel" class="identity__system">
        Sistema: <strong>{{ systemLabel }}</strong>
      </p>
    </div>
  </div>
</template>

<style scoped>
.identity {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.identity__avatar {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
  font-family: var(--font-display);
  font-size: 2rem;
  color: var(--color-accent-alt);
}

.identity__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.identity__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.identity__system {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.82rem;
  color: var(--color-text-muted);
}

@media (max-width: 560px) {
  .identity {
    grid-template-columns: 1fr;
  }

  .identity__avatar {
    width: 72px;
    height: 72px;
    font-size: 1.6rem;
  }
}
</style>
