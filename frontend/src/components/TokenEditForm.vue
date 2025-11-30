<script setup lang="ts">
import { ref, watch } from 'vue';
import { PlayerInfo, TokenInfo, tokenSizes, TokenSize, Character } from '../types';
import { toast } from '../services/toast';
import { uploadTokenImage } from '../services/storageService';

interface Props {
  token: TokenInfo | null;
  players: PlayerInfo[];
  open: boolean;
  characters: Character[];
  tableId: string;
}
const props = defineProps<Props>();

const emit = defineEmits<{ (e:'close'):void; (e:'save', payload: { name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: TokenSize; resetRemainingMovement?: boolean; canOverlap?: boolean; characterId?: string | null }): void; }>();

const name = ref('');
const movement = ref<number>(9);
const imageUrl = ref('');
const ownerId = ref('');
const size = ref<TokenSize>('Pequeno/Médio');
const resetRemainingMovement = ref(false);
const canOverlap = ref(false);
const selectedCharacterId = ref<string | null>(null);
const isUploadingImage = ref(false);

watch(() => props.token, (t) => {
  if (t) {
    name.value = t.name;
    movement.value = t.movement;
    imageUrl.value = t.imageUrl || '';
    ownerId.value = t.ownerId?._id || '';
    size.value = t.size;
    resetRemainingMovement.value = false;
  // @ts-ignore
  canOverlap.value = (t as any).canOverlap || false;
    selectedCharacterId.value = t.characterId || null;
  } else {
    selectedCharacterId.value = null;
  }
}, { immediate: true });

watch(
  () => props.characters.map(character => character._id),
  (ids) => {
    if (selectedCharacterId.value && !ids.includes(selectedCharacterId.value)) {
      selectedCharacterId.value = null;
    }
  },
  { immediate: true }
);

function submit() {
  emit('save', { name: name.value, movement: movement.value, imageUrl: imageUrl.value, ownerId: ownerId.value, size: size.value, resetRemainingMovement: resetRemainingMovement.value, canOverlap: canOverlap.value, characterId: selectedCharacterId.value });
}

async function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  if (!props.tableId) {
    toast.error('Mesa inválida para upload.');
    if (input) input.value = '';
    return;
  }
  try {
    isUploadingImage.value = true;
    const url = await uploadTokenImage(file, props.tableId);
    imageUrl.value = url;
    toast.success('Imagem atualizada.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.';
    toast.error(message);
  } finally {
    if (input) input.value = '';
    isUploadingImage.value = false;
  }
}
</script>

<template>
  <div v-if="open && token" class="edit-overlay" @click.self="emit('close')">
    <form class="edit-form" @submit.prevent="submit">
      <h3>Editar Token</h3>
      <label>Nome</label>
      <input v-model="name" required />

      <label>Movimento (m)</label>
      <input type="number" min="1" v-model.number="movement" required />

      <label>Imagem (URL)</label>
      <input type="url" v-model="imageUrl" />
      <div class="upload-row">
        <label class="upload-btn" :class="{ disabled: isUploadingImage }">
          <input type="file" accept="image/*" :disabled="isUploadingImage" @change="handleFileSelected" />
          <span>{{ isUploadingImage ? 'Enviando…' : 'Enviar arquivo' }}</span>
        </label>
        <small>Ou informe manualmente a URL acima.</small>
      </div>

      <label>Dono</label>
      <select v-model="ownerId">
        <option v-for="p in players" :key="p._id" :value="p._id">{{ p.username }}</option>
      </select>

      <label>Tamanho</label>
      <select v-model="size">
        <option v-for="s in tokenSizes" :key="s" :value="s">{{ s }}</option>
      </select>

      <label>Ficha vinculada</label>
      <select v-model="selectedCharacterId">
        <option :value="null">Nenhuma</option>
        <option v-for="character in characters" :key="character._id" :value="character._id">{{ character.name }}</option>
      </select>

      <label class="reset-row">
        <input type="checkbox" v-model="resetRemainingMovement" /> Resetar movimento restante
      </label>

      <label class="reset-row">
        <input type="checkbox" v-model="canOverlap" /> Pode sobrepor outros tokens
      </label>

      <div class="buttons">
        <button type="submit">Salvar</button>
        <button type="button" @click="emit('close')">Cancelar</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.edit-overlay { position: fixed; inset:0; background: rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; z-index:120; }
.edit-form { background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); color:var(--color-text); padding:20px; border-radius:var(--radius-md); width:320px; display:flex; flex-direction:column; gap:10px; border:1px solid var(--color-border); box-shadow:var(--elev-3); }
.edit-form input, .edit-form select { padding:6px 8px; background:var(--color-surface-alt); border:1px solid var(--color-border); border-radius:var(--radius-sm); color:var(--color-text); }
.edit-form input:focus, .edit-form select:focus { outline:2px solid var(--color-border-strong); outline-offset:2px; }
.buttons { display:flex; gap:10px; }
.buttons button { flex:1; cursor:pointer; }
.reset-row { display:flex; gap:6px; align-items:center; font-size:0.9em; }
.upload-row { display:flex; flex-direction:column; gap:0.3rem; font-size:0.85rem; }
.upload-row small { color:var(--color-text-muted); }
.upload-btn { position:relative; display:inline-flex; align-items:center; justify-content:center; gap:0.35rem; padding:0.35rem 0.65rem; border:1px dashed var(--color-border); border-radius:var(--radius-sm); cursor:pointer; background:var(--color-surface-alt); }
.upload-btn input { position:absolute; inset:0; opacity:0; cursor:pointer; }
.upload-btn.disabled { opacity:0.6; cursor:not-allowed; }
.upload-btn.disabled input { cursor:not-allowed; }
</style>
