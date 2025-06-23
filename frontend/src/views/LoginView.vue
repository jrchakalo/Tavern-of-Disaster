<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { setAuthToken } from '../auth';

const email = ref('');
const password = ref('');
const router = useRouter();

async function handleLogin() {
  console.log('Tentando fazer login com:', email.value);
  try {
    const response = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('Login bem-sucedido, token recebido:', data.token);

      // Salvar o token no navegador
      localStorage.setItem('authToken', data.token);
      setAuthToken(data.token); // Atualiza o token de autenticação global

      alert(data.message);
      // Redireciona para a página principal após o login
      router.push('/');
    } else {
      alert(`Erro no login: ${data.message}`);
    }
  } catch (error) {
    console.error('Falha na requisição de login:', error);
    alert('Não foi possível conectar ao servidor. Tente novamente mais tarde.');
  }
}
</script>

<template>
  <div class="auth-container">
    <form class="auth-form" @submit.prevent="handleLogin">
      <h1>Login</h1>

      <label for="email">Email:</label>
      <input id="email" v-model="email" type="email" required />

      <label for="password">Senha:</label>
      <input id="password" v-model="password" type="password" required />

      <button type="submit">Entrar</button>
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