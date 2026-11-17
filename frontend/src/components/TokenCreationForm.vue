<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { toast } from '../services/toast';
import { uploadTokenImage } from '../services/storageService';
import BaseDialog from './ui/BaseDialog.vue';
import type { PlayerInfo, TokenSize, Character } from '../types';
import { tokenSizes } from '../types';

const tokenName = ref('');
const tokenImageUrl = ref('');
const tokenMovement = ref(9);
const assignedOwnerId = ref('');
const tokenSize = ref<TokenSize>('Pequeno/Médio');
const canOverlap = ref(false);
const selectedCharacterId = ref<string | null>(null);
const isUploadingImage = ref(false);

interface Props {
  players: PlayerInfo[];
  characters: Character[];
  tableId: string;
  /** Mesa com DM no topo da lista: usado apenas para o rótulo (Mestre). */
  dmId?: string;
}
const props = withDefaults(defineProps<Props>(), { dmId: '' });

const emit = defineEmits<{
  (e: 'create-token', payload: { name: string; imageUrl?: string; movement: number; ownerId?: string; size: TokenSize; canOverlap?: boolean; characterId?: string | null }): void;
  (e: 'cancel'): void;
}>();

const ownerOptions = computed(() => props.players);

function ownerLabel(player: PlayerInfo): string {
  return player._id && player._id === props.dmId ? `${player.username} (Mestre)` : player.username;
}

function handleSubmit() {
  if (!tokenName.value.trim()) {
    toast.warning('O nome do token é obrigatório.');
    return;
  }
  emit('create-token', {
    name: tokenName.value.trim(),
    imageUrl: tokenImageUrl.value.trim() || undefined,
    movement: tokenMovement.value,
    ownerId: assignedOwnerId.value || undefined,
    size: tokenSize.value,
    canOverlap: canOverlap.value,
    characterId: selectedCharacterId.value,
  });
  tokenName.value = '';
  tokenImageUrl.value = '';
  selectedCharacterId.value = null;
}

function handleCancel() {
  emit('cancel');
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
    tokenImageUrl.value = url;
    toast.success('Imagem do token enviada.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.';
    toast.error(message);
  } finally {
    if (input) input.value = '';
    isUploadingImage.value = false;
  }
}

onMounted(() => {
  const dm = props.players.find((player) => player._id === props.dmId);
  assignedOwnerId.value = dm?._id ?? props.players[0]?._id ?? '';
});

watch(
  () => props.characters.map(character => character._id),
  (ids) => {
    if (selectedCharacterId.value && !ids.includes(selectedCharacterId.value)) {
      selectedCharacterId.value = null;
    }
  },
  { immediate: true }
);
</script>

<template>
  <BaseDialog
    :open="true"
    title="Criar token"
    @update:open="!$event && handleCancel()"
    @close="handleCancel"
  >
    <form class="token-form" @submit.prevent="handleSubmit">
      <div class="field-group">
        <label for="token-name">Nome</label>
        <input id="token-name" v-model="tokenName" type="text" placeholder="Nome do personagem ou NPC" required autofocus />
      </div>

      <div class="field-group">
        <label for="token-image">Imagem (URL)</label>
        <input id="token-image" v-model="tokenImageUrl" type="url" placeholder="https://exemplo.com/imagem.png" />
        <div class="upload-row">
          <label class="upload-btn" :class="{ disabled: isUploadingImage }">
            <input
              type="file"
              accept="image/*"
              :disabled="isUploadingImage"
              @change="handleFileSelected"
            />
            <span>{{ isUploadingImage ? 'Enviando…' : 'Enviar arquivo' }}</span>
          </label>
          <small>Ou cole uma URL direta no campo acima.</small>
        </div>
      </div>

      <div class="field-row">
        <div class="field-group">
          <label for="token-movement">Movimento (m)</label>
          <input id="token-movement" v-model.number="tokenMovement" type="number" min="0" required />
        </div>
        <div class="field-group">
          <label for="token-size">Tamanho</label>
          <select id="token-size" v-model="tokenSize">
            <option v-for="sizeOption in tokenSizes" :key="sizeOption" :value="sizeOption">
              {{ sizeOption }}
            </option>
          </select>
        </div>
      </div>

      <div class="field-group">
        <label for="token-owner">Atribuir a</label>
        <select id="token-owner" v-model="assignedOwnerId">
          <option v-if="!ownerOptions.length" value="">Ninguém</option>
          <option v-for="player in ownerOptions" :key="player._id" :value="player._id">
            {{ ownerLabel(player) }}
          </option>
        </select>
      </div>

      <div class="field-group">
        <label for="token-character">Ficha vinculada</label>
        <select id="token-character" v-model="selectedCharacterId">
          <option :value="null">Nenhuma</option>
          <option v-for="character in characters" :key="character._id" :value="character._id">
            {{ character.name }}
          </option>
        </select>
      </div>

      <label class="check-row">
        <input type="checkbox" v-model="canOverlap" /> Pode sobrepor outros tokens
      </label>

      <div class="form-actions">
        <button type="button" class="btn btn-sm btn-ghost" @click="handleCancel">Cancelar</button>
        <button type="submit" class="btn btn-sm">Criar</button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped>
.token-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}
.field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-4);
}
.upload-row {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  font-size: var(--text-xs);
}
.upload-row small { color: var(--text-muted); }
.upload-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: 40px;
  padding: 0 var(--s-4);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius-sm);
  cursor: pointer;
  background: var(--raised);
  color: var(--text);
  font-size: var(--text-sm);
}
.upload-btn input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.upload-btn.disabled { opacity: 0.6; cursor: not-allowed; }
.upload-btn.disabled input { cursor: not-allowed; }
.check-row {
  display: flex;
  gap: var(--s-2);
  align-items: center;
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
}
.form-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--s-3);
  padding-top: var(--s-2);
}
@media (max-width: 480px) {
  .field-row { grid-template-columns: 1fr; }
  .form-actions .btn { flex: 1 1 auto; }
}
</style>
