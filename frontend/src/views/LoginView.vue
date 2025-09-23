<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { setAuthToken } from '../services/authService';
import { toast } from '../services/toast';

const email = ref('');
const password = ref('');
const router = useRouter();
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function handleLogin() {
  console.log('Tentando fazer login com:', email.value);
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
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

      // Sucesso: sem modal/alert intrusivo. Toast opcional curto ou nenhum.
      toast.success(data.message || 'Login realizado.');
      // Redireciona para a página principal após o login
      router.push('/');
    } else {
      toast.error(data.message || 'Erro no login.');
    }
  } catch (error) {
    console.error('Falha na requisição de login:', error);
    toast.error('Não foi possível conectar ao servidor. Tente novamente mais tarde.');
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
  display: grid;
  place-items: center;
  padding: 24px 12px 40px;
  width: 100%;
}
.auth-form { display:flex; flex-direction:column; gap:14px; padding:20px; background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); border-radius:var(--radius-md); width:100%; max-width:360px; border:1px solid var(--color-border); box-shadow:var(--elev-2); }
h1 { color:var(--color-accent); margin-top:0; }
label {
  text-align: left;
  font-weight: bold;
}
input { padding:10px; border-radius:var(--radius-sm); border:1px solid var(--color-border); background:var(--color-surface-alt); color:var(--color-text); font-size:0.95rem; }
input:focus { outline:2px solid var(--color-border-strong); outline-offset:2px; }
button { padding:10px; border:1px solid var(--color-border-strong); border-radius:var(--radius-sm); background:var(--color-accent); color:var(--color-text); font-weight:600; font-size:0.95rem; cursor:pointer; margin-top:8px; }
button:hover { background:var(--color-accent-alt); }

@media (max-width: 420px) {
  .auth-form { max-width: 320px; padding:16px; gap:12px; }
}
</style>