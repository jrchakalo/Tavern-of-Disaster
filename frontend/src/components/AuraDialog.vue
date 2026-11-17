<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import BaseDialog from './ui/BaseDialog.vue';

const props = defineProps<{ open: boolean; tokenId: string | null; defaultName?: string; defaultColor?: string; defaultRadiusMeters?: number; isDM?: boolean; isOwner?: boolean; }>();
const emit = defineEmits<{ (e:'close'):void; (e:'save', payload:{ name:string; color:string; radiusMeters:number }):void; (e:'remove'):void }>();

const name = ref(props.defaultName || 'Aura');
const color = ref(props.defaultColor || '#ffd166');
const radiusMeters = ref(props.defaultRadiusMeters ?? 0);

watch(() => props.open, (o) => {
  if (o) {
    name.value = props.defaultName || 'Aura';
    color.value = props.defaultColor || color.value;
  radiusMeters.value = props.defaultRadiusMeters ?? 0;
  }
});

const canRemove = computed(() => (props.isDM || props.isOwner));

function onSubmit() {
  emit('save', { name: name.value.trim() || 'Aura', color: color.value, radiusMeters: Math.max(0, Number(radiusMeters.value) || 0) });
}
</script>

<template>
  <BaseDialog :open="open" title="Aura/efeito persistente" @close="emit('close')">
    <form class="aura-dialog" @submit.prevent="onSubmit">
      <div class="aura-dialog__field">
        <label for="aura-name">Nome</label>
        <input id="aura-name" v-model="name" type="text" maxlength="60" data-autofocus />
      </div>

      <div class="aura-dialog__row">
        <div class="aura-dialog__field">
          <label for="aura-radius">Raio (m)</label>
          <input id="aura-radius" v-model.number="radiusMeters" type="number" step="0.1" min="0" />
        </div>
        <div class="aura-dialog__field aura-dialog__field--color">
          <label for="aura-color">Cor</label>
          <input id="aura-color" v-model="color" type="color" />
        </div>
      </div>

      <div class="actions">
        <button v-if="canRemove" class="danger" type="button" @click="emit('remove')">Remover aura</button>
        <span class="actions__spacer" aria-hidden="true"></span>
        <button type="button" @click="emit('close')">Fechar</button>
        <button type="submit">Salvar</button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped>
.aura-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.aura-dialog__field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.aura-dialog__field label {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.aura-dialog__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-4);
  align-items: end;
}

.aura-dialog__field--color {
  width: 72px;
}

.aura-dialog input[type='text'],
.aura-dialog input[type='number'] {
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-md);
}

.aura-dialog input[type='color'] {
  inline-size: 100%;
  block-size: 40px;
  padding: 2px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
  cursor: pointer;
}

.aura-dialog input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.aura-dialog .actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  align-items: center;
  padding-top: var(--s-3);
  border-top: 1px solid var(--line);
}

.actions__spacer {
  flex: 1 1 auto;
}

.aura-dialog .actions button {
  min-height: 44px;
  padding: 0 var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--raised);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--dur-hover) var(--ease-out),
    border-color var(--dur-hover) var(--ease-out),
    color var(--dur-hover) var(--ease-out);
}

.aura-dialog .actions button:hover {
  background: var(--raised-2);
}

.aura-dialog .actions button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.aura-dialog .actions button[type='submit'] {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.aura-dialog .actions button[type='submit']:hover {
  border-color: var(--accent-hover);
  background: var(--accent-hover);
}

.aura-dialog .actions button.danger {
  border-color: rgb(178 58 50 / 0.6);
  background: transparent;
  color: var(--danger-ink);
}

.aura-dialog .actions button.danger:hover {
  border-color: var(--danger);
  background: rgb(178 58 50 / 0.14);
}
</style>
