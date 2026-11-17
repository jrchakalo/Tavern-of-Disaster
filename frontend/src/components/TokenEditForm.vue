<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PlayerInfo, TokenInfo, TokenSize, Character } from '../types';
import { tokenSizes } from '../types';
import { toast } from '../services/toast';
import { uploadTokenImage } from '../services/storageService';
import BaseDialog from './ui/BaseDialog.vue';

interface Props {
  token: TokenInfo | null;
  players: PlayerInfo[];
  open: boolean;
  characters: Character[];
  tableId: string;
  dmId?: string;
  /** Token já está no turno da cena. */
  inTurn?: boolean;
  /** Cena de batalha: permite adicionar/remover do turno. */
  canManageTurn?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  dmId: '',
  inTurn: false,
  canManageTurn: true,
});

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', payload: { name?: string; movement?: number; imageUrl?: string; ownerId?: string; size?: TokenSize; resetRemainingMovement?: boolean; canOverlap?: boolean; characterId?: string | null }): void;
  (e: 'add-to-turn'): void;
  (e: 'remove-from-turn'): void;
  (e: 'delete'): void;
}>();

const name = ref('');
const movement = ref<number>(9);
const imageUrl = ref('');
const ownerId = ref('');
const size = ref<TokenSize>('Pequeno/Médio');
const resetRemainingMovement = ref(false);
const canOverlap = ref(false);
const selectedCharacterId = ref<string | null>(null);
const isUploadingImage = ref(false);
const confirmDeleteOpen = ref(false);

const tokenName = computed(() => props.token?.name ?? '');

watch(() => props.token, (t) => {
  if (t) {
    name.value = t.name;
    movement.value = t.movement;
    imageUrl.value = t.imageUrl || '';
    ownerId.value = t.ownerId?._id || '';
    size.value = t.size;
    resetRemainingMovement.value = false;
    canOverlap.value = Boolean((t as TokenInfo & { canOverlap?: boolean }).canOverlap);
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

watch(() => props.open, (open) => {
  if (!open) confirmDeleteOpen.value = false;
});

function ownerLabel(player: PlayerInfo): string {
  return player._id && player._id === props.dmId ? `${player.username} (Mestre)` : player.username;
}

function submit() {
  emit('save', {
    name: name.value.trim(),
    movement: movement.value,
    imageUrl: imageUrl.value,
    ownerId: ownerId.value || undefined,
    size: size.value,
    resetRemainingMovement: resetRemainingMovement.value,
    canOverlap: canOverlap.value,
    characterId: selectedCharacterId.value,
  });
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

function confirmDelete() {
  confirmDeleteOpen.value = false;
  emit('delete');
}
</script>

<template>
  <BaseDialog
    :open="open && !!token"
    :title="tokenName ? `Token: ${tokenName}` : 'Editar token'"
    @update:open="!$event && emit('close')"
    @close="emit('close')"
  >
    <form v-if="token" class="edit-form" @submit.prevent="submit">
      <div class="field-group">
        <label for="token-edit-name">Nome</label>
        <input id="token-edit-name" v-model="name" required />
      </div>

      <div class="field-row">
        <div class="field-group">
          <label for="token-edit-movement">Movimento (m)</label>
          <input id="token-edit-movement" type="number" min="0" v-model.number="movement" required />
        </div>
        <div class="field-group">
          <label for="token-edit-size">Tamanho</label>
          <select id="token-edit-size" v-model="size">
            <option v-for="s in tokenSizes" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
      </div>

      <div class="field-group">
        <label for="token-edit-image">Imagem (URL)</label>
        <input id="token-edit-image" type="url" v-model="imageUrl" />
        <div class="upload-row">
          <label class="upload-btn" :class="{ disabled: isUploadingImage }">
            <input type="file" accept="image/*" :disabled="isUploadingImage" @change="handleFileSelected" />
            <span>{{ isUploadingImage ? 'Enviando…' : 'Enviar arquivo' }}</span>
          </label>
          <small>Ou informe manualmente a URL acima.</small>
        </div>
      </div>

      <div class="field-group">
        <label for="token-edit-owner">Dono</label>
        <select id="token-edit-owner" v-model="ownerId">
          <option v-if="!players.length" value="">Ninguém</option>
          <option v-for="p in players" :key="p._id" :value="p._id">{{ ownerLabel(p) }}</option>
        </select>
      </div>

      <div class="field-group">
        <label for="token-edit-character">Ficha vinculada</label>
        <select id="token-edit-character" v-model="selectedCharacterId">
          <option :value="null">Nenhuma</option>
          <option v-for="character in characters" :key="character._id" :value="character._id">{{ character.name }}</option>
        </select>
      </div>

      <label class="check-row">
        <input type="checkbox" v-model="resetRemainingMovement" /> Resetar movimento restante
      </label>

      <label class="check-row">
        <input type="checkbox" v-model="canOverlap" /> Pode sobrepor outros tokens
      </label>

      <section v-if="canManageTurn" class="turn-box" aria-label="Turno">
        <div>
          <p class="turn-box__label">Turno</p>
          <p class="turn-box__state">{{ inTurn ? 'No turno atual' : 'Fora do turno' }}</p>
        </div>
        <button
          v-if="inTurn"
          type="button"
          class="btn btn-sm alt"
          @click="emit('remove-from-turn')"
        >Remover do turno</button>
        <button
          v-else
          type="button"
          class="btn btn-sm alt"
          @click="emit('add-to-turn')"
        >Adicionar ao turno</button>
      </section>

      <div class="form-actions">
        <button type="button" class="btn btn-sm btn-danger-outline" @click="confirmDeleteOpen = true">
          Excluir token
        </button>
        <span class="actions-spacer" />
        <button type="button" class="btn btn-sm btn-ghost" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn btn-sm">Salvar</button>
      </div>
    </form>

    <BaseDialog
      :open="confirmDeleteOpen"
      title="Excluir token?"
      @update:open="confirmDeleteOpen = $event"
      @close="confirmDeleteOpen = false"
    >
      <p class="confirm-copy">
        O token <strong>{{ tokenName }}</strong> será removido do mapa e do turno para todos
        os clientes. Esta ação não pode ser desfeita.
      </p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-sm" @click="confirmDeleteOpen = false">Cancelar</button>
        <button type="button" class="btn btn-sm danger" @click="confirmDelete">Excluir token</button>
      </div>
    </BaseDialog>
  </BaseDialog>
</template>

<style scoped>
.edit-form {
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
.upload-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
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
.turn-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
}
.turn-box__label {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-2xs);
}
.turn-box__state { margin: 2px 0 0; font-size: var(--text-sm); font-weight: 600; }
.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
  padding-top: var(--s-2);
}
.actions-spacer { flex: 1 1 auto; }
.confirm-copy { margin: 0 0 var(--s-5); color: var(--text-muted); line-height: var(--leading-body); }
.confirm-copy strong { color: var(--text); }
.confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--s-3); }
@media (max-width: 480px) {
  .field-row { grid-template-columns: 1fr; }
  .turn-box { flex-direction: column; align-items: stretch; }
  .form-actions .btn { flex: 1 1 auto; }
  .actions-spacer { display: none; }
}
</style>
