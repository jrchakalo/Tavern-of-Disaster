<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { authToken, clearAuthToken } from './auth';

const router = useRouter();

function handleLogout() {
  clearAuthToken(); // Limpa o token de autenticação
  router.push('/login'); // Redireciona para a página de login
}

</script>

<template>
  <header class="main-header">
    <nav>
      <RouterLink to="/">Home</RouterLink>
      <template v-if="authToken">
        <RouterLink to="/tables">Minhas Mesas</RouterLink> 
        <a @click="handleLogout" href="#">Logout</a>
      </template>
      <template v-else>
        <RouterLink to="/login">Login</RouterLink>
        <RouterLink to="/register">Registro</RouterLink>
      </template>

    </nav>
  </header>

  <main>
    <RouterView />
  </main>
</template>

<style>
  body{
      background-color: #5b5b5b;
      margin: 0;
      min-height: 100vh;
  }
</style>

<style scoped>
.main-header {
  background-color: #2c2c2c;
  padding: 10px 20px;
  text-align: center;
}

nav a {
  font-weight: bold;
  color: #ccc;
  text-decoration: none;
  margin: 0 15px;
}

nav a.router-link-exact-active {
  color: #ffc107;
}

main{
  font-family: sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
  padding-bottom: 50px;
}
</style>