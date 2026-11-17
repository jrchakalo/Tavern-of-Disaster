<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUserStore } from '../stores/userStore'
import { useSystemStore } from '../stores/systemStore'
import { clearAuthToken } from '../services/authService'
import { toast } from '../services/toast'
import { uploadAvatar } from '../services/storageService'
import { systemDisplayName } from '../services/systemLabels'
import {
  buildProfilePayload,
  isProfileDirty,
  MEASUREMENT_SWATCHES,
  profileFormFromProfile,
  validateProfileForm,
  type ProfileErrors,
  type ProfileForm,
} from '../services/profileDraft'
import BaseDialog from '../components/ui/BaseDialog.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import Icon from '../components/Icon.vue'

const userStore = useUserStore()
const systemStore = useSystemStore()
const router = useRouter()

const { profile, isLoading: profileLoading } = storeToRefs(userStore)
const { systems, isLoading: systemsLoading, isLoaded: systemsLoaded } = storeToRefs(systemStore)

const form = reactive<ProfileForm>(profileFormFromProfile(null))
const errors = ref<ProfileErrors>({})
const formError = ref('')
const loadError = ref('')
const saving = ref(false)
const uploadProgress = ref<number | null>(null)
const avatarBroken = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const leaveOpen = ref(false)
const pendingPath = ref<string | null>(null)
const pendingLogout = ref(false)
let leaveAllowed = false

const hasChanges = computed(() => isProfileDirty(form, profile.value))
const isUploading = computed(() => uploadProgress.value !== null)
const avatarPreview = computed(() => form.avatarUrl.trim())
const avatarInitial = computed(() => {
  const base = form.displayName.trim() || profile.value?.username || '?'
  return base.slice(0, 1).toUpperCase()
})
const canSave = computed(() => hasChanges.value && !saving.value && !isUploading.value)

function applyProfile() {
  Object.assign(form, profileFormFromProfile(profile.value))
  errors.value = {}
  formError.value = ''
  avatarBroken.value = false
}

watch(profile, (next) => {
  if (next) applyProfile()
})

function clearFieldError(field: keyof ProfileForm) {
  if (!errors.value[field]) return
  const next = { ...errors.value }
  delete next[field]
  errors.value = next
  formError.value = ''
}

function validateNow(): boolean {
  const next = validateProfileForm(form)
  errors.value = next
  if (Object.keys(next).length === 0) return true
  formError.value = 'Confira os campos destacados antes de salvar.'
  const focusMap: Partial<Record<keyof ProfileForm, string>> = {
    displayName: 'profile-display-name',
    avatarUrl: 'profile-avatar-url',
    bio: 'profile-bio',
    measurementColorHex: 'profile-color-custom',
  }
  const first = (Object.keys(next) as Array<keyof ProfileForm>)[0]
  if (first) document.getElementById(focusMap[first] ?? 'profile-display-name')?.focus()
  return false
}

async function save() {
  if (!canSave.value) return
  formError.value = ''
  if (!validateNow()) return

  saving.value = true
  try {
    await userStore.updateProfile(buildProfilePayload(form))
    toast.success('Perfil atualizado.')
    applyProfile()
  } catch (err) {
    formError.value =
      err instanceof TypeError
        ? 'Sem conexão com o servidor. Verifique a rede e tente de novo.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível salvar o perfil agora.'
    toast.error(formError.value)
  } finally {
    saving.value = false
  }
}

function reset() {
  applyProfile()
}

function toggleMeasurementColor() {
  form.measurementColorEnabled = !form.measurementColorEnabled
  clearFieldError('measurementColorHex')
  if (form.measurementColorEnabled && !form.measurementColorHex) {
    form.measurementColorHex = '#7FB6C9'
  }
}

function pickColor(hex: string) {
  form.measurementColorEnabled = true
  form.measurementColorHex = hex
  clearFieldError('measurementColorHex')
}

function onColorPicked(event: Event) {
  const value = (event.target as HTMLInputElement).value
  form.measurementColorEnabled = true
  form.measurementColorHex = value
  clearFieldError('measurementColorHex')
}

function onAvatarUrlInput() {
  avatarBroken.value = false
  clearFieldError('avatarUrl')
}

function triggerUpload() {
  if (isUploading.value) return
  fileInput.value?.click()
}

async function handleAvatarFile(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    toast.error('Escolha um arquivo de imagem.')
    if (input) input.value = ''
    return
  }

  uploadProgress.value = 0
  avatarBroken.value = false
  try {
    const url = await uploadAvatar(file, (percent) => {
      uploadProgress.value = percent
    })
    form.avatarUrl = url
    toast.success('Avatar enviado. Salve para aplicar no perfil.')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Não foi possível enviar o avatar.')
  } finally {
    uploadProgress.value = null
    if (input) input.value = ''
  }
}

async function loadInitialData(force = false) {
  loadError.value = ''
  if (!systemsLoaded.value) {
    try {
      await systemStore.fetchAll()
    } catch {
      // O select continua com "Nenhum"; o resto do perfil funciona.
    }
  }
  try {
    await userStore.fetchProfile({ force })
    applyProfile()
  } catch (err) {
    loadError.value =
      err instanceof TypeError
        ? 'Sem conexão com o servidor. Verifique a rede e tente de novo.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível carregar o perfil.'
  }
}

function logout() {
  if (hasChanges.value) {
    pendingLogout.value = true
    leaveOpen.value = true
    return
  }
  performLogout()
}

function performLogout() {
  leaveAllowed = true
  clearAuthToken()
  userStore.clear()
  toast.info('Você saiu.')
  router.push({ name: 'login' })
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  void loadInitialData()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})

onBeforeRouteLeave((to) => {
  if (!hasChanges.value || leaveAllowed) return true
  pendingPath.value = to.fullPath
  leaveOpen.value = true
  return false
})

function confirmLeave() {
  leaveAllowed = true
  leaveOpen.value = false
  if (pendingLogout.value) {
    pendingLogout.value = false
    pendingPath.value = null
    performLogout()
    return
  }
  const target = pendingPath.value
  pendingPath.value = null
  if (target) router.push(target)
}

function cancelLeave() {
  leaveOpen.value = false
  pendingPath.value = null
  pendingLogout.value = false
}
</script>

<template>
  <div class="profile-page">
    <header class="profile-head">
      <div>
        <p class="profile-head__kicker">Conta</p>
        <h1>Perfil</h1>
        <p class="profile-head__lead">
          Este é o seu registro na mesa: nome público, avatar e a cor das suas medições.
        </p>
      </div>
      <p class="profile-head__user mono">
        {{ profile?.username || '—' }}
      </p>
    </header>

    <p v-if="profileLoading && !profile" class="profile-status" role="status">Carregando perfil…</p>

    <EmptyState
      v-else-if="loadError && !profile"
      tone="error"
      eyebrow="Falha de rede"
      title="O perfil não abriu"
      :description="loadError"
    >
      <button type="button" class="btn" @click="loadInitialData(true)">
        <Icon name="refresh" :size="16" />
        Tentar de novo
      </button>
    </EmptyState>

    <template v-else>
      <p v-if="formError" class="profile-alert" role="alert">{{ formError }}</p>

      <div class="profile-grid">
        <section class="profile-panel" aria-labelledby="profile-identity-title">
          <header class="profile-panel__head">
            <h2 id="profile-identity-title">Identidade</h2>
            <p>Como você aparece no convite, no chat e na mesa.</p>
          </header>

          <div class="avatar-block">
            <div class="avatar-preview" :aria-hidden="true">
              <img
                v-if="avatarPreview && !avatarBroken"
                :src="avatarPreview"
                alt=""
                @error="avatarBroken = true"
              />
              <span v-else>{{ avatarInitial }}</span>
            </div>
            <div class="avatar-actions">
              <button
                type="button"
                class="btn btn-sm outline"
                :disabled="isUploading || saving"
                @click="triggerUpload"
              >
                <Icon name="upload" :size="14" />
                {{ isUploading ? 'Enviando…' : 'Enviar avatar' }}
              </button>
              <input
                ref="fileInput"
                type="file"
                accept="image/*"
                class="sr-only"
                @change="handleAvatarFile"
              />
              <p class="field-hint">
                A mesma imagem pode virar o seu token quando o Mestre vincular sua ficha.
              </p>
            </div>
          </div>

          <div
            v-if="uploadProgress !== null"
            class="upload-progress"
            role="progressbar"
            aria-label="Envio do avatar"
            :aria-valuenow="uploadProgress"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span
              class="upload-progress__fill"
              :style="{ transform: `scaleX(${uploadProgress / 100})` }"
            />
            <span class="upload-progress__label mono">{{ uploadProgress }}%</span>
          </div>

          <div class="profile-fields">
            <div class="field-group">
              <label for="profile-username">Login</label>
              <input id="profile-username" :value="profile?.username || ''" type="text" readonly />
              <p class="field-hint">O login de entrada não muda por aqui.</p>
            </div>

            <div class="field-group" :class="{ 'field-group--error': errors.displayName }">
              <label for="profile-display-name">Nome público</label>
              <input
                id="profile-display-name"
                v-model="form.displayName"
                type="text"
                maxlength="80"
                placeholder="Ex.: Ana, a Ladina"
                :disabled="saving"
                :aria-invalid="errors.displayName ? 'true' : undefined"
                :aria-describedby="errors.displayName ? 'profile-display-name-error' : undefined"
                @input="clearFieldError('displayName')"
              />
              <p
                v-if="errors.displayName"
                id="profile-display-name-error"
                class="field-error"
                role="alert"
              >
                {{ errors.displayName }}
              </p>
            </div>

            <div class="field-group" :class="{ 'field-group--error': errors.avatarUrl }">
              <label for="profile-avatar-url">URL do avatar</label>
              <input
                id="profile-avatar-url"
                v-model="form.avatarUrl"
                type="text"
                maxlength="1024"
                placeholder="https://… ou /uploads/…"
                :disabled="saving"
                :aria-invalid="errors.avatarUrl ? 'true' : undefined"
                :aria-describedby="errors.avatarUrl ? 'profile-avatar-url-error' : undefined"
                @input="onAvatarUrlInput"
              />
              <p
                v-if="errors.avatarUrl"
                id="profile-avatar-url-error"
                class="field-error"
                role="alert"
              >
                {{ errors.avatarUrl }}
              </p>
            </div>

            <div class="field-group" :class="{ 'field-group--error': errors.bio }">
              <label for="profile-bio">Bio</label>
              <textarea
                id="profile-bio"
                v-model="form.bio"
                rows="4"
                maxlength="1024"
                placeholder="Duas linhas sobre o seu jeito de jogar."
                :disabled="saving"
                :aria-invalid="errors.bio ? 'true' : undefined"
                :aria-describedby="
                  errors.bio ? 'profile-bio-hint profile-bio-error' : 'profile-bio-hint'
                "
                @input="clearFieldError('bio')"
              />
              <p id="profile-bio-hint" class="field-hint">{{ form.bio.length }} / 1024</p>
              <p v-if="errors.bio" id="profile-bio-error" class="field-error" role="alert">
                {{ errors.bio }}
              </p>
            </div>
          </div>
        </section>

        <div class="profile-side">
          <section class="profile-panel" aria-labelledby="profile-prefs-title">
            <header class="profile-panel__head">
              <h2 id="profile-prefs-title">Preferências</h2>
              <p>O que acompanha você de uma mesa para outra.</p>
            </header>

            <div class="profile-fields">
              <div class="field-group">
                <label for="profile-system">Sistema favorito</label>
                <select
                  id="profile-system"
                  v-model="form.preferredSystemId"
                  :disabled="saving || systemsLoading"
                >
                  <option value="">Nenhum</option>
                  <option v-for="system in systems" :key="system._id" :value="system._id">
                    {{ systemDisplayName(system) }}
                  </option>
                </select>
                <p class="field-hint">
                  {{
                    systemsLoading
                      ? 'Carregando sistemas…'
                      : 'Abre primeiro quando você criar uma mesa.'
                  }}
                </p>
              </div>

              <fieldset class="color-field">
                <legend>Cor da régua</legend>
                <p class="field-hint">
                  A régua e as formas que você cria usam esta cor para mostrar quem mediu.
                </p>

                <button
                  type="button"
                  class="color-switch"
                  role="switch"
                  :aria-checked="form.measurementColorEnabled"
                  :disabled="saving"
                  @click="toggleMeasurementColor"
                >
                  <span class="color-switch__track" aria-hidden="true">
                    <span class="color-switch__thumb" />
                  </span>
                  <span>Usar uma cor personalizada</span>
                </button>

                <div class="swatches" role="group" aria-label="Cores de medição">
                  <button
                    v-for="color in MEASUREMENT_SWATCHES"
                    :key="color"
                    type="button"
                    class="swatch"
                    :class="{
                      'swatch--active':
                        form.measurementColorEnabled &&
                        form.measurementColorHex.toLowerCase() === color,
                    }"
                    :style="{ backgroundColor: color }"
                    :aria-label="`Usar a cor ${color}`"
                    :aria-pressed="
                      form.measurementColorEnabled &&
                      form.measurementColorHex.toLowerCase() === color
                    "
                    :disabled="saving"
                    @click="pickColor(color)"
                  />
                </div>

                <div
                  class="color-custom"
                  :class="{ 'color-custom--error': errors.measurementColorHex }"
                >
                  <label for="profile-color-custom">Escolher outra cor</label>
                  <div class="color-custom__controls">
                    <input
                      id="profile-color-custom"
                      type="color"
                      :value="form.measurementColorHex"
                      :disabled="saving"
                      aria-describedby="profile-color-current"
                      @input="onColorPicked"
                    />
                    <span id="profile-color-current" class="color-custom__current">
                      <span
                        class="color-custom__chip"
                        :style="{ backgroundColor: form.measurementColorHex }"
                        aria-hidden="true"
                      />
                      <span>
                        Selecionada
                        <span class="mono">{{ form.measurementColorHex.toUpperCase() }}</span>
                      </span>
                    </span>
                  </div>
                </div>

                <p v-if="errors.measurementColorHex" class="field-error" role="alert">
                  {{ errors.measurementColorHex }}
                </p>

                <p class="dm-note">
                  A cor do Mestre é fixa no tabuleiro. Escolha outra cor para a sua régua.
                </p>
              </fieldset>
            </div>
          </section>

          <section class="profile-panel" aria-labelledby="profile-account-title">
            <header class="profile-panel__head">
              <h2 id="profile-account-title">Conta</h2>
              <p>Dados de acesso e saída deste navegador.</p>
            </header>

            <dl class="account-list">
              <div>
                <dt>Login</dt>
                <dd class="mono">{{ profile?.username || '—' }}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd class="mono">{{ profile?.email || 'Não informado pela API' }}</dd>
              </div>
            </dl>

            <p class="field-hint">
              O e-mail é somente leitura nesta versão. Troca de senha e exclusão de conta ainda não
              estão disponíveis.
            </p>

            <button type="button" class="btn btn-sm btn-danger-outline" @click="logout">
              <Icon name="exit" :size="14" />
              Sair da conta
            </button>
          </section>
        </div>
      </div>

      <div class="save-bar" :class="{ 'save-bar--dirty': hasChanges }">
        <p class="save-bar__status" role="status" aria-live="polite">
          {{ hasChanges ? 'Alterações não salvas' : 'Tudo salvo' }}
        </p>
        <div class="save-bar__actions">
          <button
            type="button"
            class="btn btn-sm ghost"
            :disabled="!hasChanges || saving"
            @click="reset"
          >
            Descartar
          </button>
          <button type="button" class="btn" :disabled="!canSave" @click="save">
            {{ saving ? 'Salvando…' : 'Salvar alterações' }}
          </button>
        </div>
      </div>
    </template>

    <BaseDialog
      :open="leaveOpen"
      title="Sair sem salvar?"
      @update:open="
        (open) => {
          if (!open) cancelLeave()
        }
      "
    >
      <p class="leave-copy">
        Você tem alterações no perfil que ainda não foram salvas. Se sair agora, elas são
        descartadas.
      </p>
      <template #footer>
        <button type="button" class="btn ghost" @click="cancelLeave">Continuar editando</button>
        <button type="button" class="btn danger" @click="confirmLeave">Sair sem salvar</button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.profile-page {
  width: 100%;
  max-width: 1120px;
  margin-inline: auto;
  padding: var(--s-7) var(--s-6) var(--s-9);
}

.profile-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-5);
  padding-bottom: var(--s-6);
  border-bottom: 2px solid var(--line-strong);
}

.profile-head__kicker {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.profile-head h1 {
  margin: 0;
}

.profile-head__lead {
  max-width: 56ch;
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: 1.6;
}

.profile-head__user {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.profile-status {
  margin: var(--s-6) 0 0;
  color: var(--text-muted);
  font-size: var(--text-md);
}

.profile-alert {
  margin: var(--s-5) 0 0;
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--danger);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: var(--s-6);
  align-items: start;
  margin-top: var(--s-6);
}

.profile-side {
  display: flex;
  flex-direction: column;
  gap: var(--s-6);
}

.profile-panel {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  padding: var(--s-6);
  border: 1px solid var(--line);
  border-top: 2px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
}

.profile-panel__head h2 {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  font-weight: 600;
}

.profile-panel__head p {
  margin: var(--s-1) 0 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.avatar-block {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--s-5);
}

.avatar-preview {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: 96px;
  block-size: 96px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--raised);
  color: var(--text-muted);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 600;
}

.avatar-preview img {
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}

.avatar-actions {
  display: flex;
  flex: 1 1 200px;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.avatar-actions .btn {
  min-height: 44px;
}

.upload-progress {
  position: relative;
  height: 24px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
}

.upload-progress__fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  background: var(--accent);
  transition: transform var(--dur-hover) var(--ease-out);
}

.upload-progress__label {
  position: absolute;
  right: var(--s-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--on-accent);
  font-size: var(--text-2xs);
}

.profile-fields {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.profile-fields .field-group input,
.profile-fields .field-group select,
.profile-fields .field-group textarea {
  width: 100%;
}

.profile-fields .field-group input:not([type='color']),
.profile-fields .field-group select {
  min-height: 44px;
}

.field-group--error input,
.field-group--error textarea {
  border-color: var(--danger);
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

.color-field {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
}

.color-field legend {
  margin-bottom: var(--s-1);
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 600;
}

.color-switch {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: 44px;
  padding: 0;
  color: var(--text);
  font-size: var(--text-sm);
  text-align: left;
}

.color-switch__track {
  position: relative;
  flex: none;
  inline-size: 40px;
  block-size: 22px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-pill);
  background: var(--ink-0);
}

.color-switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  inline-size: 14px;
  block-size: 14px;
  border-radius: var(--radius-pill);
  background: var(--text-muted);
  transition:
    transform var(--dur-hover) var(--ease-out),
    background-color var(--dur-hover) var(--ease-out);
}

.color-switch[aria-checked='true'] .color-switch__track {
  border-color: var(--accent-ink);
}

.color-switch[aria-checked='true'] .color-switch__thumb {
  transform: translateX(18px);
  background: var(--accent-ink);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.swatch {
  inline-size: 44px;
  block-size: 44px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
}

.swatch--active {
  outline: 2px solid var(--text);
  outline-offset: 2px;
}

.color-custom {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
}

.color-custom--error {
  border-color: var(--danger);
}

.color-custom label {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 500;
}

.color-custom__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
}

.color-custom input[type='color'] {
  inline-size: 44px;
  block-size: 44px;
  padding: 2px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
  cursor: pointer;
}

.color-custom__current {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.color-custom__chip {
  flex: none;
  inline-size: 14px;
  block-size: 14px;
  border: 1px solid var(--line-strong);
  border-radius: 2px;
}

.dm-note {
  margin: 0;
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--manila);
  background: rgb(217 180 91 / 0.07);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.55;
}

.account-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  border-top: 1px solid var(--line);
}

.account-list > div {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--line);
}

.account-list dt {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.account-list dd {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.save-bar {
  position: sticky;
  bottom: var(--s-5);
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  margin-top: var(--s-7);
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
}

.save-bar--dirty {
  border-left: 3px solid var(--manila);
}

.save-bar__status {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.save-bar--dirty .save-bar__status {
  color: var(--manila);
}

.save-bar__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.leave-copy {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-md);
  line-height: 1.55;
}

@media (max-width: 900px) {
  .profile-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .profile-page {
    padding: var(--s-6) var(--s-5) calc(var(--s-10) + var(--s-8));
  }

  .profile-panel {
    padding: var(--s-5);
  }

  .save-bar {
    bottom: var(--s-3);
    padding: var(--s-3);
  }

  .save-bar__actions {
    width: 100%;
  }

  .save-bar__actions .btn {
    flex: 1 1 auto;
    min-height: 44px;
  }

  .profile-side :deep(.btn) {
    min-height: 44px;
  }
}
</style>
