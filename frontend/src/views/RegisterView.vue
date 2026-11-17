<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthShell from '../components/auth/AuthShell.vue'
import PasswordField from '../components/auth/PasswordField.vue'
import { setAuthToken } from '../services/authService'
import { toast } from '../services/toast'
import { resolveSafeRedirect } from '../services/safeRedirect'
import { API_BASE_URL } from '../services/apiBase'

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const errors = ref<{
  username?: string
  email?: string
  password?: string
  confirmPassword?: string
}>({})
const formError = ref('')
const submitting = ref(false)

const route = useRoute()
const router = useRouter()

const redirectTarget = computed(() => resolveSafeRedirect(route.query.redirect, '/tables'))
const hasRedirect = computed(() => Boolean(resolveSafeRedirect(route.query.redirect, '')))
const loginTarget = computed(() =>
  hasRedirect.value
    ? { path: '/login', query: { redirect: resolveSafeRedirect(route.query.redirect, '') } }
    : '/login',
)

function validate(): boolean {
  const next: typeof errors.value = {}
  const login = username.value.trim()

  if (!login) {
    next.username = 'Escolha o login que você vai usar para entrar.'
  } else if (login.length < 3 || login.length > 50) {
    next.username = 'O login precisa ter de 3 a 50 caracteres.'
  }

  const address = email.value.trim()
  if (!address) {
    next.email = 'Informe seu e-mail.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    next.email = 'Confira o e-mail: falta algo no formato (nome@dominio.com).'
  }

  if (!password.value) {
    next.password = 'Crie uma senha.'
  } else if (password.value.length < 6) {
    next.password = 'A senha precisa ter pelo menos 6 caracteres.'
  }

  if (!confirmPassword.value) {
    next.confirmPassword = 'Repita a senha para confirmar.'
  } else if (confirmPassword.value !== password.value) {
    next.confirmPassword = 'As senhas não são iguais.'
  }

  errors.value = next
  return Object.keys(next).length === 0
}

function clearError(field: keyof typeof errors.value) {
  if (errors.value[field]) {
    errors.value = { ...errors.value, [field]: undefined }
  }
  formError.value = ''
}

interface AuthResponse {
  token?: string
  message?: string
}

async function autoLogin(login: string, secret: string): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: login, password: secret }),
  })
  const data = (await response.json().catch(() => null)) as AuthResponse | null
  if (!response.ok || !data?.token) return null
  localStorage.setItem('authToken', data.token)
  setAuthToken(data.token)
  return data.token
}

async function handleRegister() {
  if (submitting.value) return
  formError.value = ''
  if (!validate()) return

  submitting.value = true
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value.trim(),
        email: email.value.trim(),
        password: password.value,
      }),
    })

    const data = (await response.json().catch(() => null)) as AuthResponse | null

    if (!response.ok) {
      if (response.status === 429) {
        formError.value =
          'Muitas tentativas de criação. Aguarde alguns minutos antes de tentar de novo.'
      } else {
        formError.value = data?.message || 'Não foi possível criar a conta agora. Tente de novo.'
      }
      return
    }

    const token = await autoLogin(username.value.trim(), password.value)
    if (!token) {
      toast.warning(
        'Conta criada, mas não foi possível entrar automaticamente. Entre com seu login.',
      )
      router.push(loginTarget.value)
      return
    }

    toast.success('Conta criada. Você já está dentro.')
    router.push(redirectTarget.value)
  } catch {
    formError.value =
      'Não foi possível conectar ao servidor. Verifique sua conexão e tente de novo.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell :note="hasRedirect ? 'Sua conta nova volta direto para a mesa do convite.' : ''">
    <form class="auth-form" novalidate @submit.prevent="handleRegister">
      <header class="auth-form__head">
        <p class="auth-form__kicker">Abrir uma conta</p>
        <h1>Criar conta</h1>
        <p class="auth-form__intro">
          Uma conta serve para mestrar e jogar. Depois de criar, você já entra direto.
        </p>
      </header>

      <p v-if="formError" class="auth-form__alert" role="alert">{{ formError }}</p>

      <div class="field-group" :class="{ 'field-group--error': errors.username }">
        <label for="username">Login</label>
        <input
          id="username"
          v-model="username"
          type="text"
          autocomplete="username"
          autocapitalize="off"
          spellcheck="false"
          maxlength="50"
          :disabled="submitting"
          :aria-invalid="errors.username ? 'true' : undefined"
          aria-describedby="username-hint username-error"
          data-autofocus
          @input="clearError('username')"
        />
        <p id="username-hint" class="field-hint">É o nome que você usa para entrar.</p>
        <p v-if="errors.username" id="username-error" class="field-error" role="alert">
          {{ errors.username }}
        </p>
      </div>

      <div class="field-group" :class="{ 'field-group--error': errors.email }">
        <label for="email">E-mail</label>
        <input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          inputmode="email"
          spellcheck="false"
          :disabled="submitting"
          :aria-invalid="errors.email ? 'true' : undefined"
          :aria-describedby="errors.email ? 'email-error' : undefined"
          @input="clearError('email')"
        />
        <p v-if="errors.email" id="email-error" class="field-error" role="alert">
          {{ errors.email }}
        </p>
      </div>

      <PasswordField
        id="password"
        v-model="password"
        label="Senha"
        autocomplete="new-password"
        hint="Mínimo de 6 caracteres."
        :error="errors.password"
        :disabled="submitting"
        @input="clearError('password')"
      />

      <PasswordField
        id="confirmPassword"
        v-model="confirmPassword"
        label="Confirmar senha"
        autocomplete="new-password"
        :error="errors.confirmPassword"
        :disabled="submitting"
        @input="clearError('confirmPassword')"
      />

      <button type="submit" class="btn block" :disabled="submitting">
        {{ submitting ? 'Criando conta…' : 'Criar conta e entrar' }}
      </button>

      <p class="auth-form__alt">
        Já tem conta?
        <RouterLink :to="loginTarget">Entrar</RouterLink>
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

.field-hint {
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.45;
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
