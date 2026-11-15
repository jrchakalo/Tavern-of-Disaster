<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { toDataURL } from 'qrcode';

import Icon from '../Icon.vue';
import { createDisplayToken, revokeDisplayToken } from '../../services/tableAccessService';
import { toast } from '../../services/toast';

const props = withDefaults(
  defineProps<{
    tableId: string;
    inviteCode?: string;
    displayConnected?: boolean;
  }>(),
  {
    inviteCode: '',
    displayConnected: false,
  },
);

const collapsed = ref(false);
const playerQr = ref('');
const displayUrl = ref('');
const displayQr = ref('');
const busy = ref<'generate' | 'rotate' | 'revoke' | null>(null);
const confirmAction = ref<'rotate' | 'revoke' | null>(null);
const errorMessage = ref('');

const playerUrl = computed(
  () =>
    `${window.location.origin}/play/${encodeURIComponent(props.tableId)}?invite=${encodeURIComponent(props.inviteCode)}`,
);

async function renderQr(text: string): Promise<string> {
  return toDataURL(text, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#17111a', light: '#ffffff' },
  });
}

/**
 * O backend devolve `displayUrl` absoluto quando `PUBLIC_APP_URL`/
 * `CORS_ORIGIN` está configurado; sem eles o valor vem como caminho relativo
 * (`/display/...`). QR relativo não escaneia — sempre absolutizar aqui.
 */
function toAbsoluteUrl(url: string): string {
  if (!url) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url; // já tem esquema (http:, https:)
  if (url.startsWith('//')) return `${window.location.protocol}${url}`; // protocolo relativo
  if (url.startsWith('/')) return `${window.location.origin}${url}`;
  return `${window.location.origin}/${url}`;
}

watch(
  playerUrl,
  async (url) => {
    if (!props.inviteCode) {
      playerQr.value = '';
      return;
    }
    try {
      playerQr.value = await renderQr(url);
    } catch {
      playerQr.value = '';
    }
  },
  { immediate: true },
);

function reportError(error: unknown, fallback: string) {
  const message = error instanceof Error && error.message ? error.message : fallback;
  errorMessage.value = message;
  toast.error(message);
}

async function generateDisplayToken() {
  if (busy.value) return;
  busy.value = 'generate';
  errorMessage.value = '';
  try {
    const result = await createDisplayToken(props.tableId);
    displayUrl.value = toAbsoluteUrl(result.displayUrl);
    displayQr.value = await renderQr(displayUrl.value);
    toast.success('Token da TV gerado.');
  } catch (error) {
    reportError(error, 'Não foi possível gerar o token da TV.');
  } finally {
    busy.value = null;
    confirmAction.value = null;
  }
}

async function revokeToken() {
  if (busy.value) return;
  busy.value = 'revoke';
  errorMessage.value = '';
  try {
    await revokeDisplayToken(props.tableId);
    displayUrl.value = '';
    displayQr.value = '';
    toast.success('Token da TV revogado.');
  } catch (error) {
    reportError(error, 'Não foi possível revogar o token da TV.');
  } finally {
    busy.value = null;
    confirmAction.value = null;
  }
}

async function copyLink(url: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard indisponível');
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado.');
    return;
  } catch {
    // Fallback para navegadores sem Clipboard API (http, WebView antiga).
    try {
      const field = document.createElement('textarea');
      field.value = url;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
      document.body.removeChild(field);
      if (copied) {
        toast.success('Link copiado.');
        return;
      }
    } catch {
      // cai para a mensagem abaixo
    }
    toast.error('Não foi possível copiar. Copie o link manualmente.');
  }
}
</script>

<template>
  <div class="share-panel">
    <button
      type="button"
      class="share-toggle"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <h4>Convites</h4>
      <span class="share-toggle__chevron" aria-hidden="true">
        <Icon :name="collapsed ? 'plus' : 'minus'" size="16" />
      </span>
    </button>

    <div v-show="!collapsed" class="share-panel__body">
      <section class="share-block" aria-label="Convite de jogadores">
        <p class="share-block__title">Jogadores</p>
        <div class="share-block__qr">
          <img
            v-if="playerQr"
            :src="playerQr"
            :alt="`QR Code do link de jogadores: ${playerUrl}`"
            width="160"
            height="160"
          />
          <p v-else class="share-block__pending">Gerando QR…</p>
        </div>
        <a class="share-block__link" :href="playerUrl">{{ playerUrl }}</a>
        <div class="share-block__actions">
          <button type="button" class="btn btn-sm" @click="copyLink(playerUrl)">Copiar link</button>
        </div>
      </section>

      <section class="share-block" aria-label="Convite de TV">
        <p class="share-block__title">
          TV
          <span v-if="displayConnected" class="share-badge" role="status">TV conectada</span>
        </p>

        <template v-if="displayUrl">
          <div class="share-block__qr">
            <img
              v-if="displayQr"
              :src="displayQr"
              :alt="`QR Code do link da TV: ${displayUrl}`"
              width="160"
              height="160"
            />
          </div>
          <a class="share-block__link" :href="displayUrl">{{ displayUrl }}</a>
          <div class="share-block__actions">
            <button type="button" class="btn btn-sm" @click="copyLink(displayUrl)">Copiar link</button>
            <button
              type="button"
              class="btn btn-sm"
              :disabled="busy !== null"
              @click="confirmAction = 'rotate'"
            >
              Rotacionar token
            </button>
            <button
              type="button"
              class="btn btn-sm share-block__danger"
              :disabled="busy !== null"
              @click="confirmAction = 'revoke'"
            >
              Revogar token
            </button>
          </div>
          <p v-if="confirmAction" class="share-confirm" role="alert">
            {{
              confirmAction === 'rotate'
                ? 'Rotacionar invalida o link da TV atual. Gerar um novo token?'
                : 'Revogar invalida o link da TV; a TV cai na próxima reconexão. Revogar mesmo assim?'
            }}
            <span class="share-block__actions">
              <button
                type="button"
                class="btn btn-sm"
                :disabled="busy !== null"
                @click="confirmAction === 'rotate' ? generateDisplayToken() : revokeToken()"
              >
                Confirmar
              </button>
              <button type="button" class="btn btn-sm" @click="confirmAction = null">Cancelar</button>
            </span>
          </p>
        </template>

        <div v-else class="share-block__actions">
          <button
            type="button"
            class="btn btn-sm session-start"
            :disabled="busy !== null"
            @click="generateDisplayToken"
          >
            {{ busy === 'generate' ? 'Gerando…' : 'Gerar token da TV' }}
          </button>
        </div>
        <p class="share-block__hint">A TV entra por este link, sem login do Mestre.</p>
      </section>

      <p v-if="errorMessage" class="share-error" role="alert">{{ errorMessage }}</p>
    </div>
  </div>
</template>

<style scoped>
.share-panel {
  min-width: 0;
}

.share-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0;
  margin: 0 0 10px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.share-toggle h4 {
  margin: 0;
  font-size: 0.95rem;
}

.share-toggle__chevron {
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
}

.share-toggle:focus-visible {
  outline: 2px solid var(--color-warning);
  outline-offset: 2px;
}

.share-panel__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.share-block {
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
}

.share-block__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.share-badge {
  padding: 3px 8px;
  border: 1px solid var(--color-accent-alt);
  border-radius: var(--radius-pill);
  background: rgba(152, 115, 79, 0.16);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-accent-alt);
}

.share-block__qr {
  display: flex;
  justify-content: center;
  padding: 8px;
  border-radius: 8px;
  background: #ffffff;
}

.share-block__qr img {
  display: block;
  width: 160px;
  height: 160px;
}

.share-block__pending {
  margin: 0;
  padding: 60px 0;
  text-align: center;
  font-size: 0.8rem;
  color: #555;
}

.share-block__link {
  display: block;
  margin-top: 8px;
  font-size: 0.72rem;
  line-height: 1.35;
  word-break: break-all;
  color: var(--color-accent-alt);
}

.share-block__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.share-block__actions .btn {
  min-height: 44px;
}

.share-block__danger {
  border-color: var(--color-danger, #b3393f);
}

.share-confirm {
  margin: 10px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--color-warning);
  border-radius: 8px;
  background: rgba(210, 156, 68, 0.12);
  font-size: 0.78rem;
}

.share-confirm .share-block__actions {
  margin-top: 8px;
}

.share-block__hint {
  margin: 10px 0 0;
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.share-error {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-danger, #b3393f);
  border-radius: 8px;
  background: rgba(196, 71, 71, 0.14);
  font-size: 0.8rem;
}
</style>
