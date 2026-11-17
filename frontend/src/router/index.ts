import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { authToken } from '../services/authService';

const APP_NAME = 'Tavern of Disaster';

/**
 * Metadados de shell/título:
 * - shell 'session' = a rota tem barra própria (/table, /play, /display) e não
 *   deve carregar o cabeçalho global.
 * - title alimenta `document.title` em `afterEach`.
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView, // Landing page when logged out; dashboard when authenticated
      meta: { title: 'Início', shell: 'app' },
    },
    {
      path: '/login',
      name: 'login',
      // Lazy-loading: O código desta página só é baixado quando o usuário a visita.
      component: () => import('../views/LoginView.vue'),
      meta: { title: 'Entrar', shell: 'app' },
    },
    {
      path: '/register',
      name: 'register',
      // Lazy-loading também aqui.
      component: () => import('../views/RegisterView.vue'),
      meta: { title: 'Criar conta', shell: 'app' },
    },
    {
      path: '/table/:tableId', // Usa um parâmetro dinâmico ':tableId'
      name: 'table',
      component: () => import('../views/TableView.vue'),
      meta: { requiresAuth: true, title: 'Mesa', shell: 'session' },
    },
    {
      path: '/play/:tableId', // Controle mobile do jogador
      name: 'play',
      component: () => import('../views/PlayView.vue'),
      meta: { requiresAuth: true, title: 'Jogador', shell: 'session' },
    },
    {
      path: '/display/:tableId', // TV read-only: entra pelo token de display (#token=…), sem JWT
      name: 'display',
      component: () => import('../views/DisplayView.vue'),
      meta: { title: 'TV', shell: 'session' },
    },
    {
      path: '/dice',
      name: 'dice-sandbox',
      component: () => import('../views/DiceSandboxView.vue'),
      meta: { title: 'Dados', shell: 'app' },
    },
    {
      path: '/systems',
      name: 'systems-library',
      component: () => import('../views/SystemsLibraryView.vue'),
      meta: { title: 'Sistemas', shell: 'app' },
    },
    {
      path: '/tables',
      name: 'tables',
      component: () => import('../views/TablesView.vue'),
      meta: { requiresAuth: true, title: 'Mesas', shell: 'app' },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/ProfileView.vue'),
      meta: { requiresAuth: true, title: 'Perfil', shell: 'app' },
    },
  ],
});

router.beforeEach((to, from, next) => {
  const isLoggedIn = !!authToken.value; // Verifica se o usuário está logado

  if (to.meta.requiresAuth && !isLoggedIn) {
    // Se o usuário NÃO está logado... redireciona para o login preservando a
    // rota de origem (o QR do jogador volta para /play/:id?invite=… após login).
    next({ name: 'login', query: { redirect: to.fullPath } }); // volta para a rota pedida
  } else {
    // Senão, permite que a navegação continue normalmente.
    next();
  }
});

router.afterEach((to) => {
  if (typeof document === 'undefined') return;
  const title = typeof to.meta.title === 'string' ? to.meta.title.trim() : '';
  document.title = title && title !== 'Início' ? `${title} · ${APP_NAME}` : APP_NAME;
});

export default router;
