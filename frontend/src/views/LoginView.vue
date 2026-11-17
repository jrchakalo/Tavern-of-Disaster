<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthShell from '../components/auth/AuthShell.vue'
import PasswordField from '../components/auth/PasswordField.vue'
import Icon from '../components/Icon.vue'
import { setAuthToken } from '../services/authService'
import { toast } from '../services/toast'
import { resolveSafeRedirect } from '../services/safeRedirect'
import { API_BASE_URL } from '../services/apiBase'

const identifier = ref('')
const password = ref('')
const errors = ref<{ identifier?: string; password?: string }>({})
const formError = ref('')
const submitting = ref(false)

const route = useRoute()
const router = useRouter()

const redirectTarget = computed(() => resolveSafeRedirect(route.query.redirect, ''))
const hasRedirect = computed(() => Boolean(redirectTarget.value))
const registerTarget = computed(() =>
  redirectTarget.value
    ? { path: '/register', query: { redirect: redirectTarget.value } }
    : '/register',
)

function validate(): boolean {
  const next: { identifier?: string; password?: string } = {}
  if (!identifier.value.trim()) {
    next.identifier = 'Informe seu usuário ou e-mail.'
  }
  if (!password.value) {
    next.password = 'Informe sua senha.'
  }
  errors.value = next
  return Object.keys(next).length === 0
}

function clearError(field: 'identifier' | 'password') {
  if (errors.value[field]) {
    errors.value = { ...errors.value, [field]: undefined }
  }
  formError.value = ''
}

async function handleLogin() {
  if (submitting.value) return
  formError.value = ''
  if (!validate()) return

  submitting.value = true
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: identifier.value.trim(),
        password: password.value,
      }),
    })

    const data = (await response.json().catch(() => null)) as {
      token?: string
      message?: string
    } | null

    if (response.ok && data?.token) {
      localStorage.setItem('authToken', data.token)
      setAuthToken(data.token)
      toast.success('Você entrou.')
      router.push(resolveSafeRedirect(route.query.redirect))
      return
    }

    if (response.status === 429) {
      formError.value =
        'Muitas tentativas de login. Aguarde alguns minutos antes de tentar de novo.'
    } else if (response.status === 400 || response.status === 401) {
      formError.value =
        'Credenciais inválidas. Confira o usuário ou e-mail e a senha e tente de novo.'
    } else if (response.ok) {
      formError.value = 'O servidor aceitou o login, mas não devolveu uma sessão. Tente de novo.'
    } else {
      formError.value = data?.message || 'Não foi possível entrar agora. Tente de novo.'
    }
  } catch {
    formError.value =
      'Não foi possível conectar ao servidor. Verifique sua conexão e tente de novo.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell :note="hasRedirect ? 'Depois de entrar, você volta para a mesa do convite.' : ''">
    <form class="auth-form" novalidate @submit.prevent="handleLogin">
      <header class="auth-form__head">
        <p class="auth-form__kicker">Acesso à mesa</p>
        <h1>Entrar</h1>
        <p class="auth-form__intro">
          Use o seu login ou e-mail. A mesma conta abre as suas mesas de Mestre e de Jogador.
        </p>
      </header>

      <p v-if="hasRedirect" class="auth-form__context">
        <Icon name="link" :size="16" />
        Você está a um passo de voltar para a mesa do convite.
      </p>

      <p v-if="formError" class="auth-form__alert" role="alert">{{ formError }}</p>

      <div class="field-group" :class="{ 'field-group--error': errors.identifier }">
        <label for="identifier">Usuário ou e-mail</label>
        <input
          id="identifier"
          v-model="identifier"
          type="text"
          autocomplete="username"
          autocapitalize="off"
          spellcheck="false"
          :disabled="submitting"
          :aria-invalid="errors.identifier ? 'true' : undefined"
          :aria-describedby="errors.identifier ? 'identifier-error' : undefined"
          data-autofocus
          @input="clearError('identifier')"
        />
        <p v-if="errors.identifier" id="identifier-error" class="field-error" role="alert">
          {{ errors.identifier }}
        </p>
      </div>

      <PasswordField
        id="password"
        v-model="password"
        label="Senha"
        autocomplete="current-password"
        :error="errors.password"
        :disabled="submitting"
        @input="clearError('password')"
      />

      <button type="submit" class="btn block" :disabled="submitting">
        {{ submitting ? 'Entrando…' : 'Entrar' }}
      </button>

      <p class="auth-form__alt">
        Ainda não tem conta?
        <RouterLink :to="registerTarget">Criar conta</RouterLink>
      </p>
    </form>
  </AuthShell>
</template>

<style scoped>
.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.auth-form__head {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.auth-form__kicker {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.auth-form h1 {
  margin: 0;
  font-size: clamp(1.9rem, 1.4rem + 1.6vw, 2.4rem);
}

.auth-form__intro {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-md);
  line-height: 1.55;
}

.auth-form__context {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  margin: 0;
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--accent-ink);
  background: rgb(47 108 132 / 0.1);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.auth-form__context :deep(svg) {
  margin-top: 2px;
  color: var(--accent-ink);
}

.auth-form__alert {
  margin: 0;
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--danger);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.field-group--error input {
  border-color: var(--danger);
}

.field-group input {
  min-height: 44px;
}

.field-error {
  margin: var(--s-2) 0 0;
  color: var(--danger-ink);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.auth-form__alt {
  margin: 0;
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-align: center;
}
</style>
