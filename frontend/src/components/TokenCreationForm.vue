<script setup lang="ts">
import { ref } from 'vue';

const tokenName = ref('');
const tokenImageUrl = ref('');

const emit = defineEmits<{
  (e: 'create-token', payload: { name: string; imageUrl: string }): void;
  (e: 'cancel'): void;
}>();

function handleSubmit() {
  if (!tokenName.value.trim()) {
    alert('O nome do token é obrigatório!');
    return;
  }
  emit('create-token', {
    name: tokenName.value,
    imageUrl: tokenImageUrl.value
  });
  // Limpa os campos após emitir
  tokenName.value = '';
  tokenImageUrl.value = '';
}

function handleCancel() {
    emit('cancel');
}
</script>

<template>
  <div class="form-overlay">
    <form class="token-form" @submit.prevent="handleSubmit">
      <h3>Criar Novo Token</h3>
      <label for="token-name">Nome:</label>
      <input id="token-name" v-model="tokenName" type="text" placeholder="Nome do Personagem" required />

      <label for="token-image">URL da Imagem:</label>
      <input id="token-image" v-model="tokenImageUrl" type="url" placeholder="https://exemplo.com/imagem.png" />

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
.token-form {
  background: #333;
  color: white;
  padding: 20px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
label {
  text-align: left;
}
input {
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #555;
}
.buttons {
  display: flex;
  justify-content: space-around;
  margin-top: 10px;
}
</style>