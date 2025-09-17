import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import { authToken } from '../services/authService';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView // Landing page when logged out; dashboard when authenticated
    },
    {
      path: '/login',
      name: 'login',
      // Lazy-loading: O código desta página só é baixado quando o usuário a visita.
      component: () => import('../views/LoginView.vue')
    },
    {
      path: '/register',
      name: 'register',
      // Lazy-loading também aqui.
      component: () => import('../views/RegisterView.vue')
    },
    {
    path: '/table/:tableId', // Usa um parâmetro dinâmico ':tableId'
    name: 'table',
    component: () => import('../views/TableView.vue'),
    meta: { requiresAuth: true }
    },
    {
      path: '/tables',
      name: 'tables',
      component: () => import('../views/TablesView.vue'),
      meta: { requiresAuth: true }
    },
  ]
});

router.beforeEach((to, from, next) => {
  const isLoggedIn = !!authToken.value; // Verifica se o usuário está logado

  if (to.meta.requiresAuth && !isLoggedIn) {
    // Se o usuário NÃO está logado...
    console.log('Acesso bloqueado. Redirecionando para /login');
    next({ name: 'login' }); // ...redireciona para a página de login.
  } else {
    // Senão, permite que a navegação continue normalmente.
    next();
  }
});

export default router;