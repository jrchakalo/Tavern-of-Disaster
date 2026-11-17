<script setup lang="ts">
import SheetField from './SheetField.vue';

defineProps<{
  notes: string;
  canEdit: boolean;
}>();

const emit = defineEmits<{ (e: 'update:notes', value: string): void }>();
</script>

<template>
  <section class="notes" aria-label="Notas">
    <SheetField
      label="Notas livres"
      :model-value="notes"
      :readonly="!canEdit"
      type="textarea"
      :rows="10"
      placeholder="Histórico, objetivos, NPCs, lembretes da sessão…"
      @update:model-value="emit('update:notes', $event)"
    />
  </section>
</template>

<style scoped>
.notes {
  display: block;
}
</style>
