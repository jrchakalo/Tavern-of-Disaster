<script setup lang="ts">
import { ref, watch, computed } from 'vue';

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
  <div v-if="open" class="aura-dialog" @click.stop>
    <h3>Aura/Efeito Persistente</h3>
    <label>Nome
      <input v-model="name" />
    </label>
    <label>Raio (m)
      <input type="number" step="0.1" min="0" v-model.number="radiusMeters" />
    </label>
    <label>Cor
      <input type="color" v-model="color" />
    </label>
    <div class="actions">
      <button @click="onSubmit">Salvar</button>
      <button v-if="canRemove" class="danger" @click="$emit('remove')">Remover aura</button>
      <button @click="$emit('close')">Fechar</button>
    </div>
  </div>
  <div v-else />
  
</template>

<style scoped>
.aura-dialog {
  position: absolute;
  top: 120px;
  left: 50%;
  z-index: 1001;
  min-width: 280px;
  max-width: min(340px, calc(100vw - 24px));
  padding: var(--s-5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
}

.aura-dialog h3 {
  margin: 0 0 var(--s-4);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.aura-dialog label {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin: 0 0 var(--s-3);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: 0;
}

.aura-dialog input[type='text'],
.aura-dialog input[type='number'] {
  flex: 1;
  min-width: 0;
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
  flex: 0 0 auto;
  inline-size: 44px;
  block-size: 44px;
  padding: 2px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--ink-0);
  cursor: pointer;
}

.aura-dialog input[type='text']:focus-visible,
.aura-dialog input[type='number']:focus-visible,
.aura-dialog input[type='color']:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.aura-dialog .actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  justify-content: flex-end;
  margin-top: var(--s-4);
  padding-top: var(--s-3);
  border-top: 1px solid var(--line);
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

.aura-dialog .actions button:active {
  transform: translateY(1px);
  transition-duration: var(--dur-press);
}

.aura-dialog .actions button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Primeiro botão do rodapé é a ação primária (Salvar). */
.aura-dialog .actions button:first-child {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}

.aura-dialog .actions button:first-child:hover {
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
