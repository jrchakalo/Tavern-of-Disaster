<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { toast } from '../services/toast';
import { PlayerInfo, TokenSize, Character } from '../types'; 
import { tokenSizes } from '../types';

const tokenName = ref('');
const tokenImageUrl = ref('');
const tokenMovement = ref(9);
const assignedOwnerId = ref('');
const tokenSize = ref<TokenSize>('Pequeno/Médio');
const canOverlap = ref(false);
const selectedCharacterId = ref<string | null>(null);

interface Props {
  players: PlayerInfo[]; 
  characters: Character[];
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'create-token', payload: { name: string; imageUrl: string; movement: number; ownerId: string; size: TokenSize; canOverlap?: boolean; characterId?: string | null }): void; // includes canOverlap
  (e: 'cancel'): void;
}>();

function handleSubmit() {
  if (!tokenName.value.trim()) {
    toast.warning('O nome do token é obrigatório!');
    return;
  }
  emit('create-token', {
    name: tokenName.value,
    imageUrl: tokenImageUrl.value,
    movement: tokenMovement.value,
    ownerId: assignedOwnerId.value,
  size: tokenSize.value,
  canOverlap: canOverlap.value,
  characterId: selectedCharacterId.value,
  });
  // Limpa os campos após emitir
  tokenName.value = '';
  tokenImageUrl.value = '';
  selectedCharacterId.value = null;
}

function handleCancel() {
    emit('cancel');
}

onMounted(() => {
  if (props.players.length > 0) {
    assignedOwnerId.value = props.players[0]._id; 
  }
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
  <div class="form-overlay">
    <form class="token-form" @submit.prevent="handleSubmit">
      <h3>Criar Novo Token</h3>
      <label for="token-name">Nome:</label>
      <input id="token-name" v-model="tokenName" type="text" placeholder="Nome do Personagem" required />

      <label for="token-image">URL da Imagem:</label>
      <input id="token-image" v-model="tokenImageUrl" type="url" placeholder="https://exemplo.com/imagem.png" />

      <label for="token-movement">Movimento (m):</label>
      <input id="token-movement" v-model="tokenMovement" type="number" required />

      <label for="token-owner">Atribuir a:</label>
      <select id="token-owner" v-model="assignedOwnerId">
        <option v-for="player in players" :key="player._id" :value="player._id">
          {{ player.username }} {{ player._id === props.players[0]._id ? '(Mestre)' : '' }}
        </option>
      </select>

      <label for="token-size">Tamanho:</label>
      <select id="token-size" v-model="tokenSize">
        <option v-for="sizeOption in tokenSizes" :key="sizeOption" :value="sizeOption">
          {{ sizeOption }}
        </option>
      </select>

      <label for="token-character">Associar ficha:</label>
      <select id="token-character" v-model="selectedCharacterId">
        <option :value="null">Nenhuma</option>
        <option v-for="character in characters" :key="character._id" :value="character._id">
          {{ character.name }}
        </option>
      </select>

      <label class="toggle-row">
        <input type="checkbox" v-model="canOverlap" /> Pode sobrepor outros tokens
      </label>

      <div class="buttons">
        <button type="submit">Criar</button>
        <button type="button" @click="handleCancel">Cancelar</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}
.token-form { background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); color:var(--color-text); padding:20px; border-radius:var(--radius-md); display:flex; flex-direction:column; gap:10px; border:1px solid var(--color-border); box-shadow:var(--elev-3); }
label {
  text-align: left;
}
input, select { padding:8px; border-radius:var(--radius-sm); border:1px solid var(--color-border); background:var(--color-surface-alt); color:var(--color-text); }
input:focus, select:focus { outline:2px solid var(--color-border-strong); outline-offset:2px; }
.buttons {
  display: flex;
  justify-content: space-around;
  margin-top: 10px;
}
</style>