<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router'; 

const username = ref('');
const email = ref('');
const password = ref('');

const router = useRouter();

// Função para lidar com o registro do usuário
async function handleRegister() {
  console.log('Tentando registrar com:', {
    username: username.value,
    email: email.value,
  });

  try {
    const response = await fetch('http://localhost:3001/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username.value,
        email: email.value,
        password: password.value,
      }),
    });

    const data = await response.json();

    if (response.ok) { // Se a resposta for bem-sucedida
      alert(data.message); // Exibe "Usuário registrado com sucesso!"
      router.push('/login'); 
    } else { 
      alert(`Erro no registro: ${data.message}`); // Exibe a mensagem de erro do backend
    }
  } catch (error) {
    console.error('Falha na requisição de registro:', error);
    alert('Não foi possível conectar ao servidor. Tente novamente mais tarde.');
  }
}
</script>

<template>
  <div class="auth-container">
    <form class="auth-form" @submit.prevent="handleRegister">
      <h1>Registre-se</h1>

      <label for="username">Nome de Usuário:</label>
      <input id="username" v-model="username" type="text" required />

      <label for="email">Email:</label>
      <input id="email" v-model="email" type="email" required />

      <label for="password">Senha:</label>
      <input id="password" v-model="password" type="password" required />

      <button type="submit">Registrar</button>
    </form>
  </div>
</template>

<style scoped>
.auth-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding-top: 40px;
}
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 30px;
  background-color: #3a3a3a;
  border-radius: 8px;
  width: 100%;
  max-width: 400px;
}
h1 {
  color: #ffc107;
  margin-top: 0;
}
label {
  text-align: left;
  font-weight: bold;
}
input {
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #555;
}
button {
  padding: 12px;
  border: none;
  border-radius: 4px;
  background-color: #ffc107;
  color: #333;
  font-weight: bold;
  font-size: 1em;
  cursor: pointer;
  margin-top: 10px;
}
button:hover {
  background-color: #ffca2c;
}
</style>