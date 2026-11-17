<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { authToken, clearAuthToken } from './services/authService';
import ToastHost from './components/ui/ToastHost.vue';
import Icon from './components/Icon.vue';

const router = useRouter();
const route = useRoute();

const menuEl = ref<HTMLDetailsElement | null>(null);
const menuToggle = ref<HTMLElement | null>(null);
const isAuthenticated = computed(() => Boolean(authToken.value));

// Rotas de sessão (/table, /play, /display) têm shell próprio e não devem
// carregar a barra global. O meta é a fonte da verdade; o path é fallback.
const isSessionShell = computed(
  () =>
    route.meta.shell === 'session' ||
    /^\/(table|play|display)\//.test(route.path),
);

const showHeader = computed(() => !isSessionShell.value);
const isHome = computed(() => route.path === '/');

interface NavItem {
  to: string;
  label: string;
}

const navItems = computed<NavItem[]>(() =>
  isAuthenticated.value
    ? [
        { to: '/', label: 'Início' },
        { to: '/tables', label: 'Mesas' },
        { to: '/systems', label: 'Sistemas' },
        { to: '/profile', label: 'Perfil' },
      ]
    : [
        { to: '/', label: 'Início' },
        { to: '/systems', label: 'Sistemas' },
      ],
);

function isActive(to: string): boolean {
  if (to === '/') return route.path === '/';
  return route.path === to || route.path.startsWith(`${to}/`);
}

function active(current: string): 'page' | undefined {
  return isActive(current) ? 'page' : undefined;
}

function closeMenu(focusToggle = false) {
  const wasOpen = menuEl.value?.open ?? false;
  if (menuEl.value) menuEl.value.open = false;
  if (wasOpen && focusToggle) menuToggle.value?.focus();
}

function handleLogout() {
  closeMenu();
  clearAuthToken();
  router.push({ name: 'login' });
}

watch(
  () => route.fullPath,
  () => closeMenu(),
);
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

    <header v-if="showHeader" class="app-header">
      <div class="app-header__inner">
        <RouterLink to="/" class="app-wordmark">
          <span class="app-wordmark__tavern">Tavern</span>
          <span class="app-wordmark__of">of</span>
          <span class="app-wordmark__disaster">Disaster</span>
        </RouterLink>

        <!-- Desktop: navegação e conta lado a lado -->
        <nav class="app-nav app-nav--desktop" aria-label="Navegação principal">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="app-nav__link"
            :aria-current="active(item.to)"
          >
            {{ item.label }}
          </RouterLink>
          <template v-if="isAuthenticated">
            <button type="button" class="app-nav__link app-nav__logout" @click="handleLogout">
              Sair
            </button>
          </template>
          <template v-else>
            <RouterLink to="/login" class="app-nav__link" :aria-current="active('/login')">
              Entrar
            </RouterLink>
            <RouterLink
              to="/register"
              class="app-nav__link app-nav__link--cta"
              :aria-current="active('/register')"
            >
              Criar conta
            </RouterLink>
          </template>
        </nav>

        <!-- Celular: menu colapsado -->
        <details
          ref="menuEl"
          class="app-menu"
          @keydown.esc.prevent="closeMenu(true)"
        >
          <summary ref="menuToggle" class="app-menu__toggle">
            <Icon name="menu" :size="18" />
            Menu
          </summary>
          <nav class="app-menu__panel" aria-label="Navegação principal">
            <RouterLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="app-nav__link"
              :aria-current="active(item.to)"
              @click="closeMenu()"
            >
              {{ item.label }}
            </RouterLink>
            <template v-if="isAuthenticated">
              <button type="button" class="app-nav__link app-nav__logout" @click="handleLogout">
                Sair
              </button>
            </template>
            <template v-else>
              <RouterLink
                to="/login"
                class="app-nav__link"
                :aria-current="active('/login')"
                @click="closeMenu()"
              >
                Entrar
              </RouterLink>
              <RouterLink
                to="/register"
                class="app-nav__link app-nav__link--cta"
                :aria-current="active('/register')"
                @click="closeMenu()"
              >
                Criar conta
              </RouterLink>
            </template>
          </nav>
        </details>
      </div>
    </header>

    <main
      id="conteudo"
      tabindex="-1"
      class="app-main"
      :class="{ 'app-main--flush': !showHeader || isHome }"
    >
      <RouterView />
    </main>

    <ToastHost position="bottom-left" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid var(--line);
  background: var(--ink-0);
}

.app-header__inner {
  display: flex;
  align-items: center;
  gap: var(--s-6);
  width: 100%;
  max-width: 1440px;
  min-height: var(--header-h);
  margin-inline: auto;
  padding-inline: var(--s-6);
}

.app-wordmark {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  gap: 0.32em;
  color: var(--text);
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  white-space: nowrap;
  text-decoration: none;
}

.app-wordmark:hover {
  color: var(--text);
  text-decoration: none;
}

.app-wordmark__of {
  color: var(--text-muted);
  font-size: 0.78em;
  font-style: italic;
}

.app-nav--desktop {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  margin-left: auto;
}

.app-nav__link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--s-3);
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  font-weight: 500;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: color var(--dur-hover) var(--ease-out),
    background-color var(--dur-hover) var(--ease-out),
    border-color var(--dur-hover) var(--ease-out);
}

.app-nav__link:hover {
  background: var(--raised);
  color: var(--text);
  text-decoration: none;
}

.app-nav__link[aria-current='page'] {
  border-bottom-color: var(--accent-ink);
  color: var(--text);
}

.app-nav__link--cta {
  margin-left: var(--s-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}

.app-nav__link--cta:hover {
  border-color: var(--accent-ink);
}

.app-nav__logout {
  margin-left: var(--s-2);
  color: var(--text-muted);
}

.app-nav__logout:hover {
  color: var(--text);
}

.app-menu {
  display: none;
  position: relative;
  margin-left: auto;
}

.app-menu__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 40px;
  padding: 0 var(--s-3);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  font-weight: 500;
  line-height: 1;
  list-style: none;
  cursor: pointer;
}

.app-menu__toggle::-webkit-details-marker {
  display: none;
}

.app-menu__toggle::marker {
  content: '';
}

.app-menu[open] .app-menu__toggle {
  background: var(--raised);
}

.app-menu__panel {
  position: absolute;
  top: calc(100% + var(--s-2));
  right: 0;
  z-index: 120;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 232px;
  padding: var(--s-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
}

.app-menu__panel .app-nav__link {
  justify-content: flex-start;
  width: 100%;
  min-height: 44px;
  border-bottom: 0;
}

.app-menu__panel .app-nav__link[aria-current='page'] {
  background: var(--raised);
  color: var(--text);
  box-shadow: inset 3px 0 0 var(--accent-ink);
}

.app-menu__panel .app-nav__link--cta {
  margin-left: 0;
}

.app-menu__panel .app-nav__logout {
  margin-left: 0;
}

.app-main {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: var(--s-6) 0 var(--s-8);
}

.app-main--flush {
  padding: 0;
}

@media (max-width: 519px) {
  .app-header__inner {
    min-height: 48px;
    padding-inline: var(--s-4);
    gap: var(--s-3);
  }

  .app-wordmark {
    font-size: 1.0625rem;
  }

  .app-nav--desktop {
    display: none;
  }

  .app-menu {
    display: block;
  }
}
</style>
