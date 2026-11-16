<script setup lang="ts">
import { ref, watch } from 'vue';
import { useMediaStore } from '../../stores/mediaStore';
import type { MediaDeviceKind } from '../../types';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const store = useMediaStore();
const devices = ref<MediaDeviceInfo[]>([]);
const micId = ref('');
const cameraId = ref('');
const speakerId = ref('');
const loading = ref(false);
const error = ref('');
const saving = ref(false);

function devicesOf(kind: MediaDeviceKind): MediaDeviceInfo[] {
  return devices.value.filter((device) => device.kind === kind);
}

function labelOf(device: MediaDeviceInfo, index: number): string {
  const fallback: Record<string, string> = {
    audioinput: 'Microfone',
    videoinput: 'Câmera',
    audiooutput: 'Saída de áudio',
  };
  return device.label || `${fallback[device.kind] ?? 'Dispositivo'} ${index + 1}`;
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    devices.value = await store.listDevices();
    micId.value = store.selectedDevices.audioinput ?? '';
    cameraId.value = store.selectedDevices.videoinput ?? '';
    speakerId.value = store.selectedDevices.audiooutput ?? '';
  } catch {
    error.value = 'Não foi possível listar os dispositivos de áudio e vídeo.';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void load();
  },
  { immediate: true },
);

async function save(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    if (micId.value !== (store.selectedDevices.audioinput ?? '')) {
      await store.setDevice('audioinput', micId.value);
    }
    if (cameraId.value !== (store.selectedDevices.videoinput ?? '')) {
      await store.setDevice('videoinput', cameraId.value);
    }
    if (speakerId.value !== (store.selectedDevices.audiooutput ?? '')) {
      await store.setDevice('audiooutput', speakerId.value);
    }
    emit('close');
  } catch {
    error.value = 'Não foi possível aplicar o dispositivo selecionado.';
  } finally {
    saving.value = false;
  }
}

function close(): void {
  emit('close');
}
</script>

<template>
  <div v-if="open" class="device-settings-backdrop" @click.self="close">
    <div
      class="device-settings"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-settings-title"
    >
      <header class="device-settings__header">
        <h2 id="device-settings-title">Áudio e vídeo</h2>
        <button type="button" class="device-settings__close" aria-label="Fechar configurações" @click="close">×</button>
      </header>

      <p v-if="loading" class="device-settings__hint" role="status">Carregando dispositivos…</p>
      <p v-else-if="error" class="device-settings__error" role="alert">{{ error }}</p>

      <label class="device-settings__field">
        <span>Microfone</span>
        <select v-model="micId" aria-label="Microfone">
          <option value="">Padrão do sistema</option>
          <option v-for="(device, index) in devicesOf('audioinput')" :key="device.deviceId" :value="device.deviceId">
            {{ labelOf(device, index) }}
          </option>
        </select>
      </label>

      <label class="device-settings__field">
        <span>Câmera</span>
        <select v-model="cameraId" aria-label="Câmera">
          <option value="">Padrão do sistema</option>
          <option v-for="(device, index) in devicesOf('videoinput')" :key="device.deviceId" :value="device.deviceId">
            {{ labelOf(device, index) }}
          </option>
        </select>
      </label>

      <label class="device-settings__field">
        <span>Saída de áudio</span>
        <select v-model="speakerId" aria-label="Saída de áudio">
          <option value="">Padrão do sistema</option>
          <option v-for="(device, index) in devicesOf('audiooutput')" :key="device.deviceId" :value="device.deviceId">
            {{ labelOf(device, index) }}
          </option>
        </select>
      </label>

      <footer class="device-settings__actions">
        <button type="button" class="device-btn" @click="close">Cancelar</button>
        <button type="button" class="device-btn device-btn--save" :disabled="saving" @click="save">
          {{ saving ? 'Salvando…' : 'Salvar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.device-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(10, 7, 9, 0.68);
}

.device-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(380px, 100%);
  padding: 18px;
  border: 1px solid var(--color-border, #4b3a44);
  border-radius: 16px;
  background: var(--color-surface, #2b2028);
  color: var(--color-text, #f3e9ef);
  box-shadow: var(--elev-3, 0 18px 44px rgba(0, 0, 0, 0.5));
}

.device-settings__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.device-settings__header h2 {
  margin: 0;
  font-size: 1.05rem;
}

.device-settings__close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border, #4b3a44);
  border-radius: 999px;
  background: var(--color-surface-alt, #3a2c34);
  color: inherit;
  font-size: 1.2rem;
  cursor: pointer;
}

.device-settings__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.82rem;
  font-weight: 600;
}

.device-settings__field select {
  min-height: 44px;
  padding: 8px 10px;
  border: 1px solid var(--color-border-strong, #6b5561);
  border-radius: 10px;
  background: var(--color-surface-alt, #3a2c34);
  color: inherit;
  font: inherit;
}

.device-settings__hint,
.device-settings__error {
  margin: 0;
  font-size: 0.78rem;
}

.device-settings__error {
  color: #ffb4b0;
}

.device-settings__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.device-btn {
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid var(--color-border-strong, #6b5561);
  border-radius: 10px;
  background: var(--color-surface-alt, #3a2c34);
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.device-btn--save {
  background: var(--color-accent-alt, #c9a227);
  border-color: #ab865c;
  color: #1b120c;
}

.device-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
