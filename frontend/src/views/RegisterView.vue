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
.auth-form { display:flex; flex-direction:column; gap:15px; padding:30px; background: linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); border-radius: var(--radius-md); width:100%; max-width:400px; border:1px solid var(--color-border); box-shadow: var(--elev-2); font-family: var(--font-sans); }
h1 { color: var(--color-accent); margin-top:0; font-family: var(--font-display); }
label {
  text-align: left;
  font-weight: bold;
}
input { padding:10px; border-radius: var(--radius-sm); border:1px solid var(--color-border); background: var(--color-surface-alt); color: var(--color-text); font:inherit; }
input:focus { outline:2px solid var(--color-border-strong); outline-offset:2px; }
button { padding:12px; border:1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-accent); color: var(--color-text); font-weight:600; font-size:1em; cursor:pointer; margin-top:10px; letter-spacing:.5px; }
button:hover { background: var(--color-accent-alt); }
</style>