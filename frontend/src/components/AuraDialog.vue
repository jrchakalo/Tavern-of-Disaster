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
.aura-dialog { position:absolute; top:120px; left:50%; transform:translateX(-50%); background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:12px; z-index:1001; min-width:260px; color:var(--color-text); box-shadow:var(--elev-3); }
label{ display:flex; gap:8px; align-items:center; margin: 6px 0; }
input[type="number"], input[type="text"], input[type="color"]{ flex: 1; }
.actions{ display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }
.danger { background:var(--color-danger); color:var(--color-text); border:1px solid #d06060; }
.danger:hover { background:#d06060; }
</style>
