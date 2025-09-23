<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { authToken, clearAuthToken } from './services/authService';
import ToastHost from './components/ui/ToastHost.vue';

const router = useRouter();
const route = useRoute();
const isHome = computed(() => route.path === '/');

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

  <main :class="{ 'home-fit': isHome }">
    <RouterView />
  </main>
  <ToastHost position="top-right" />
</template>

<style>
body { margin:0; min-height:100vh; background:linear-gradient(180deg,var(--color-bg), var(--color-bg-alt)); color:var(--color-text); font-family:var(--font-sans, system-ui, sans-serif); }
:root { --header-h: 56px; }
</style>

<style scoped>
.main-header { background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); height:var(--header-h); display:flex; align-items:center; justify-content:center; padding:0 20px; text-align:center; border-bottom:1px solid var(--color-border); box-shadow:var(--elev-1); }

nav { display:flex; justify-content:center; flex-wrap:wrap; gap:6px; }
nav a { font-weight:600; color:var(--color-text-muted); text-decoration:none; padding:8px 14px; border-radius:var(--radius-sm); transition:background var(--transition-fast), color var(--transition-fast); display:inline-flex; align-items:center; }
nav a:hover { background:var(--color-surface); color:var(--color-text); }

nav a.router-link-exact-active { color:var(--color-accent); background:var(--color-surface); box-shadow:0 0 0 1px var(--color-border-strong) inset; }

main { font-family:var(--font-sans, system-ui, sans-serif); display:flex; flex-direction:column; align-items:center; margin-top:20px; padding-bottom:50px; width:100%; }
main.home-fit { margin-top:0; padding-bottom:0; height: calc(100dvh - var(--header-h)); overflow:hidden; display:flex; width:100%; }
@media (max-width: 760px) {
  main.home-fit { height: auto; min-height: calc(100dvh - var(--header-h)); overflow:auto; }
}
/* On short desktop windows, allow vertical scroll to avoid clipping home cards */
@media (hover: hover) and (pointer: fine) and (max-height: 760px) {
  main.home-fit { height: auto; min-height: calc(100dvh - var(--header-h)); overflow:auto; }
}
/* On desktop in general, prefer auto height + scroll so logged-out cards never get cut */
@media (hover: hover) and (pointer: fine) {
  main.home-fit { height: auto; min-height: calc(100dvh - var(--header-h)); overflow:auto; display:block; align-items: initial; }
}


</style>