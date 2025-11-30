<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useUserStore } from '../stores/userStore';
import { useSystemStore } from '../stores/systemStore';
import { toast } from '../services/toast';
import { uploadAvatar } from '../services/storageService';
import Icon from '../components/Icon.vue';

const userStore = useUserStore();
const systemStore = useSystemStore();
const { profile, isLoading: profileLoading } = storeToRefs(userStore);
const { systems, isLoading: systemsLoading, isLoaded: systemsLoaded } = storeToRefs(systemStore);

const form = reactive({
  displayName: '',
  avatarUrl: '',
  bio: '',
  preferredSystemId: '',
  measurementColorEnabled: false,
  measurementColorHex: '#ff8c00',
});

const isSaving = ref(false);
const hasChanges = ref(false);
const isUploadingAvatar = ref(false);

function applyProfile() {
  if (!profile.value) return;
  form.displayName = profile.value.displayName || '';
  form.avatarUrl = profile.value.avatarUrl || '';
  form.bio = profile.value.bio || '';
  form.preferredSystemId = profile.value.preferredSystemId || '';
  form.measurementColorEnabled = Boolean(profile.value.measurementColor);
  form.measurementColorHex = profile.value.measurementColor || form.measurementColorHex || '#ff8c00';
  hasChanges.value = false;
}

watch(profile, () => {
  applyProfile();
}, { immediate: true });

const avatarPreview = computed(() => form.avatarUrl?.trim() || '');
const disabled = computed(() => isSaving.value || profileLoading.value);
const colorValue = computed({
  get: () => form.measurementColorHex || '#ff8c00',
  set: (val: string) => {
    form.measurementColorHex = val || '#ff8c00';
    hasChanges.value = true;
  },
});

function normalizeColor(value: string) {
  if (!value) return '';
  return value.startsWith('#') ? value : `#${value}`;
}

async function loadInitialData() {
  try {
    if (!systemsLoaded.value) {
      await systemStore.fetchAll();
    }
  } catch (error) {
    console.error('[profile] erro ao carregar sistemas', error);
  }
  try {
    if (!profile.value) {
      await userStore.fetchProfile();
    }
    applyProfile();
  } catch (error) {
    console.error('[profile] erro ao carregar perfil', error);
    const message = error instanceof Error ? error.message : 'Não foi possível carregar o perfil.';
    toast.error(message);
  }
}

function buildPayload() {
  const payload: Record<string, unknown> = {};
  payload.displayName = form.displayName?.trim() || null;
  payload.avatarUrl = form.avatarUrl?.trim() || null;
  payload.bio = form.bio?.trim() || null;
  payload.preferredSystemId = form.preferredSystemId || null;
  if (form.measurementColorEnabled) {
    payload.measurementColor = normalizeColor(form.measurementColorHex || '#ff8c00');
  } else {
    payload.measurementColor = null;
  }
  return payload;
}

async function handleSubmit() {
  try {
    isSaving.value = true;
    const payload = buildPayload();
    await userStore.updateProfile(payload);
    toast.success('Perfil atualizado.');
    hasChanges.value = false;
  } catch (error) {
    console.error('[profile] erro ao salvar', error);
    const message = error instanceof Error ? error.message : 'Não foi possível salvar o perfil.';
    toast.error(message);
  } finally {
    isSaving.value = false;
  }
}

function handleFieldInput() {
  hasChanges.value = true;
}

function clearMeasurementColor() {
  form.measurementColorEnabled = false;
  hasChanges.value = true;
}

function handleAvatarError(event: Event) {
  const target = event.target as HTMLImageElement | null;
  if (target) {
    target.style.display = 'none';
  }
}

async function handleAvatarFileSelected(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    isUploadingAvatar.value = true;
    const url = await uploadAvatar(file);
    form.avatarUrl = url;
    handleFieldInput();
    toast.success('Avatar enviado com sucesso.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível enviar o avatar.';
    toast.error(message);
  } finally {
    if (input) input.value = '';
    isUploadingAvatar.value = false;
  }
}

onMounted(() => {
  loadInitialData();
});
</script>

<template>
  <div class="profile-view">
    <header class="profile-header">
      <div>
        <p class="eyebrow">Configurações</p>
        <h1>Perfil do usuário</h1>
        <p class="text-muted">Personalize seu nome, avatar e preferências para as mesas.</p>
      </div>
      <button class="primary" :disabled="disabled || !hasChanges" @click="handleSubmit">
        <Icon name="check" size="18" />
        {{ isSaving ? 'Salvando...' : 'Salvar' }}
      </button>
    </header>

    <section class="profile-section surface">
      <h2>Identidade</h2>
      <div class="form-grid">
        <label class="form-field">
          <span>Nome público</span>
          <input type="text" v-model="form.displayName" :disabled="disabled" maxlength="80" placeholder="ex.: Mestre Arcano" @input="handleFieldInput" />
        </label>
        <label class="form-field">
          <span>URL do avatar</span>
          <input type="text" v-model="form.avatarUrl" :disabled="disabled" maxlength="1024" placeholder="https://..." @input="handleFieldInput" />
          <div class="file-actions">
            <label class="upload-btn" :class="{ disabled: disabled || isUploadingAvatar }">
              <input type="file" accept="image/*" :disabled="disabled || isUploadingAvatar" @change="handleAvatarFileSelected" />
              <span>{{ isUploadingAvatar ? 'Enviando…' : 'Enviar arquivo' }}</span>
            </label>
            <small>O link será preenchido automaticamente após o envio.</small>
          </div>
        </label>
        <label class="form-field">
          <span>Bio</span>
          <textarea v-model="form.bio" :disabled="disabled" maxlength="1024" rows="4" placeholder="Conte brevemente sobre seus jogos." @input="handleFieldInput"></textarea>
        </label>
        <div v-if="avatarPreview" class="avatar-preview">
          <span>Prévia do avatar</span>
          <img :src="avatarPreview" alt="Avatar preview" loading="lazy" @error="handleAvatarError" />
        </div>
      </div>
    </section>

    <section class="profile-section surface">
      <h2>Preferências</h2>
      <div class="form-grid">
        <label class="form-field">
          <span>Sistema favorito</span>
          <select v-model="form.preferredSystemId" :disabled="disabled || systemsLoading" @change="handleFieldInput">
            <option value="">Nenhum</option>
            <option v-for="system in systems" :key="system._id" :value="system._id">
              {{ system.name }}
            </option>
          </select>
        </label>
        <label class="form-field">
          <span>Cor padrão das medições</span>
          <div class="color-row">
            <input type="checkbox" id="enable-color" v-model="form.measurementColorEnabled" :disabled="disabled" @change="handleFieldInput" />
            <label for="enable-color">Definir cor personalizada</label>
          </div>
          <div class="color-picker" :class="{ disabled: !form.measurementColorEnabled }">
            <input type="color" v-model="colorValue" :disabled="disabled || !form.measurementColorEnabled" @input="handleFieldInput" />
            <button type="button" class="ghost" :disabled="disabled || !form.measurementColorEnabled" @click="clearMeasurementColor">Limpar</button>
          </div>
        </label>
      </div>
      <p class="text-muted small">
        A cor personalizada será usada como padrão para a régua em todas as mesas.
      </p>
    </section>
  </div>
</template>

<style scoped>
.profile-view {
  max-width: 960px;
  margin: 0 auto;
  padding: 1.5rem 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.profile-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}
.eyebrow {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin: 0;
}
.profile-header h1 {
  margin: 0.2rem 0;
}
.profile-header button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-accent);
  color: #000;
  font-weight: 600;
  cursor: pointer;
}
.profile-header button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.surface {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  box-shadow: var(--elev-1);
}
.profile-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.profile-section h2 {
  margin: 0;
  font-size: 1.15rem;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.95rem;
}
.form-field span {
  font-weight: 600;
}
input,
select,
textarea {
  width: 100%;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-alt);
  color: var(--color-text);
  padding: 0.5rem 0.65rem;
  font: inherit;
}
textarea {
  resize: vertical;
}
textarea:focus,
input:focus,
select:focus {
  outline: 2px solid var(--color-border-strong);
  outline-offset: 2px;
}
.avatar-preview {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.avatar-preview img {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--color-border);
}
.file-actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.35rem;
  font-size: 0.85rem;
}
.file-actions small {
  color: var(--color-text-muted);
}
.upload-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  background: var(--color-surface-alt);
}
.upload-btn input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.upload-btn.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.upload-btn.disabled input {
  cursor: not-allowed;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}
.color-picker {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.color-picker input[type="color"] {
  width: 48px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.color-picker.disabled {
  opacity: 0.6;
}
button.ghost {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  padding: 0.35rem 0.7rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
button.ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.text-muted {
  color: var(--color-text-muted);
}
.small {
  font-size: 0.85rem;
}
@media (max-width: 640px) {
  .profile-header {
    flex-direction: column;
    align-items: stretch;
  }
  .profile-header button {
    align-self: flex-start;
  }
}
</style>
