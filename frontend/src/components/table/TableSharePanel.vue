<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { toDataURL } from 'qrcode';

import Icon from '../Icon.vue';
import BaseDialog from '../ui/BaseDialog.vue';
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

const PLAYER_QR_SIZE = 140;
const DISPLAY_STORAGE_PREFIX = 'tod:display-url:';

const collapsed = ref(false);
const playerQr = ref('');
const playerQrOpen = ref(false);
const displayUrl = ref('');
const displayQr = ref('');
const showDisplayLink = ref(false);
const busy = ref<'generate' | 'rotate' | 'revoke' | null>(null);
const confirmAction = ref<'rotate' | 'revoke' | null>(null);
const displayConfigured = ref(false);
const errorMessage = ref('');

const hasDisplayLink = computed(() => Boolean(displayUrl.value));
const rotateConfirmLabel = computed(() =>
  hasDisplayLink.value ? 'Rotacionar e desconectar' : 'Gerar e desconectar',
);
const confirmTitle = computed(() => {
  if (confirmAction.value === 'revoke') return 'Revogar link da TV?';
  return hasDisplayLink.value ? 'Rotacionar link da TV?' : 'Gerar novo link da TV?';
});

const playerUrl = computed(
  () =>
    `${window.location.origin}/play/${encodeURIComponent(props.tableId)}?invite=${encodeURIComponent(props.inviteCode)}`,
);

const canNativeShare = computed(
  () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
);

function storageKey(): string {
  return `${DISPLAY_STORAGE_PREFIX}${props.tableId}`;
}

function readStoredDisplayUrl(): string {
  try {
    return sessionStorage.getItem(storageKey()) ?? '';
  } catch {
    return '';
  }
}

function storeDisplayUrl(url: string) {
  try {
    sessionStorage.setItem(storageKey(), url);
  } catch {
    // sessionStorage indisponível (modo privado): o link segue só na memória.
  }
}

function clearStoredDisplayUrl() {
  try {
    sessionStorage.removeItem(storageKey());
  } catch {
    // ignorado
  }
}

async function renderQr(text: string): Promise<string> {
  return toDataURL(text, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0b0d0f', light: '#ffffff' },
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

async function ensureDisplayQr() {
  if (displayQr.value || !displayUrl.value) return;
  try {
    displayQr.value = await renderQr(displayUrl.value);
  } catch {
    displayQr.value = '';
  }
}

async function rehydrateDisplay() {
  const stored = readStoredDisplayUrl();
  if (!stored) return;
  displayUrl.value = toAbsoluteUrl(stored);
  displayConfigured.value = true;
  showDisplayLink.value = false;
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

onMounted(() => {
  void rehydrateDisplay();
});

function reportError(error: unknown, fallback: string) {
  const message = error instanceof Error && error.message ? error.message : fallback;
  errorMessage.value = message;
  toast.error(message);
}

async function generateDisplayToken() {
  if (busy.value) return;
  if (displayUrl.value || props.displayConnected) {
    // Nunca rotaciona silenciosamente: com link existente ou TV conectada,
    // pede confirmação antes de invalidar o token atual.
    confirmAction.value = 'rotate';
    return;
  }
  busy.value = 'generate';
  errorMessage.value = '';
  try {
    const result = await createDisplayToken(props.tableId);
    displayUrl.value = toAbsoluteUrl(result.displayUrl);
    displayQr.value = await renderQr(displayUrl.value);
    storeDisplayUrl(displayUrl.value);
    displayConfigured.value = true;
    showDisplayLink.value = true;
    toast.success('Link da TV gerado.');
  } catch (error) {
    reportError(error, 'Não foi possível gerar o link da TV.');
  } finally {
    busy.value = null;
  }
}

async function rotateDisplayToken() {
  if (busy.value) return;
  busy.value = 'rotate';
  errorMessage.value = '';
  try {
    const result = await createDisplayToken(props.tableId);
    displayUrl.value = toAbsoluteUrl(result.displayUrl);
    displayQr.value = await renderQr(displayUrl.value);
    storeDisplayUrl(displayUrl.value);
    displayConfigured.value = true;
    showDisplayLink.value = true;
    toast.success('Link da TV rotacionado. A TV anterior foi desconectada.');
  } catch (error) {
    reportError(error, 'Não foi possível rotacionar o link da TV.');
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
    displayConfigured.value = false;
    showDisplayLink.value = false;
    clearStoredDisplayUrl();
    toast.success('Link da TV revogado.');
  } catch (error) {
    reportError(error, 'Não foi possível revogar o link da TV.');
  } finally {
    busy.value = null;
    confirmAction.value = null;
  }
}

async function copyText(text: string, successMessage: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard indisponível');
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
    return;
  } catch {
    // Fallback para navegadores sem Clipboard API (http, WebView antiga).
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
      document.body.removeChild(field);
      if (copied) {
        toast.success(successMessage);
        return;
      }
    } catch {
      // cai para a mensagem abaixo
    }
    toast.error('Não foi possível copiar. Copie manualmente.');
  }
}

async function sharePlayerInvite() {
  if (!canNativeShare.value) return;
  try {
    await navigator.share({
      title: 'Tavern of Disaster',
      text: 'Entre na mesa como jogador.',
      url: playerUrl.value,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    reportError(error, 'Não foi possível compartilhar.');
  }
}

async function openPlayerQr() {
  playerQrOpen.value = true;
}

async function openDisplayLink() {
  showDisplayLink.value = true;
  await ensureDisplayQr();
}

function openRotate() {
  confirmAction.value = 'rotate';
}

function openRevoke() {
  confirmAction.value = 'revoke';
}

function closeConfirmDialog() {
  if (busy.value) return;
  confirmAction.value = null;
}

function confirmDisplayAction() {
  if (confirmAction.value === 'rotate') {
    void rotateDisplayToken();
  } else if (confirmAction.value === 'revoke') {
    void revokeToken();
  }
}
</script>

<template>
  <div class="share-panel">
    <header class="share-head">
      <h4>Convidar</h4>
      <button
        type="button"
        class="share-toggle"
        :aria-expanded="!collapsed"
        aria-controls="share-panel-body"
        :aria-label="collapsed ? 'Expandir convites' : 'Recolher convites'"
        @click="collapsed = !collapsed"
      >
        <Icon :name="collapsed ? 'plus' : 'minus'" :size="16" aria-hidden="true" />
      </button>
    </header>

    <div id="share-panel-body" v-show="!collapsed" class="share-panel__body">
      <section class="share-block" aria-labelledby="share-players-title">
        <div class="share-block__head">
          <h5 id="share-players-title">Jogadores</h5>
          <span class="share-hint">Cada celular entra pelo link ou pelo código.</span>
        </div>

        <div class="invite-player">
          <button
            type="button"
            class="invite-qr"
            aria-label="Ampliar QR Code do convite de jogadores"
            @click="openPlayerQr"
          >
            <img
              v-if="playerQr"
              :src="playerQr"
              alt="QR Code para entrar como jogador"
              :width="PLAYER_QR_SIZE"
              :height="PLAYER_QR_SIZE"
            />
            <span v-else class="invite-qr__pending">Gerando QR…</span>
          </button>

          <div class="invite-player__meta">
            <div class="invite-code-row">
              <span class="invite-label">Código</span>
              <code class="invite-code">{{ inviteCode || '—' }}</code>
              <button
                type="button"
                class="btn btn-xs alt"
                :disabled="!inviteCode"
                @click="copyText(inviteCode, 'Código copiado.')"
              >Copiar código</button>
            </div>

            <a class="share-block__link" :href="playerUrl" :title="playerUrl">{{ playerUrl }}</a>

            <div class="invite-actions">
              <button type="button" class="btn btn-sm" @click="copyText(playerUrl, 'Link copiado.')">
                Copiar link
              </button>
              <button
                v-if="canNativeShare"
                type="button"
                class="btn btn-sm alt"
                @click="sharePlayerInvite"
              >Compartilhar</button>
              <button type="button" class="btn btn-sm alt" @click="openPlayerQr">Ampliar</button>
            </div>

            <a class="invite-preview" :href="playerUrl" target="_blank" rel="noopener noreferrer">
              <Icon name="external" :size="14" aria-hidden="true" />
              Entrar como jogador
            </a>
          </div>
        </div>
      </section>

      <section class="share-block" aria-labelledby="share-tv-title">
        <div class="share-block__head">
          <h5 id="share-tv-title">TV</h5>
          <span class="share-badges">
            <span v-if="displayConfigured" class="share-badge share-badge--configured">TV configurada</span>
            <span v-if="displayConnected" class="share-badge" role="status">TV conectada</span>
          </span>
        </div>

        <ol class="tv-steps">
          <li>Abra o link da TV no navegador do computador ligado à TV.</li>
          <li>Coloque a página em tela cheia (tecla F ou o botão da TV).</li>
          <li>Mantenha aberta: a TV segue tabuleiro, iniciativa e rolagens.</li>
        </ol>

        <template v-if="displayUrl">
          <div v-if="showDisplayLink" class="share-display">
            <div class="invite-qr invite-qr--display">
              <img
                v-if="displayQr"
                :src="displayQr"
                alt="QR Code do link da TV"
                :width="PLAYER_QR_SIZE"
                :height="PLAYER_QR_SIZE"
              />
            </div>
            <a class="share-block__link" :href="displayUrl" :title="displayUrl">{{ displayUrl }}</a>
          </div>

          <div class="invite-actions">
            <button
              v-if="!showDisplayLink"
              type="button"
              class="btn btn-sm"
              @click="openDisplayLink"
            >Reexibir link</button>
            <button type="button" class="btn btn-sm alt" @click="copyText(displayUrl, 'Link da TV copiado.')">
              Copiar link
            </button>
            <button
              type="button"
              class="btn btn-sm alt"
              :disabled="busy !== null"
              @click="openRotate"
            >Rotacionar link…</button>
            <button
              type="button"
              class="btn btn-sm share-block__danger"
              :disabled="busy !== null"
              @click="openRevoke"
            >Revogar…</button>
          </div>
        </template>

        <template v-else>
          <p class="share-tv-pending">
            Gere o link uma única vez. Ele fica guardado nesta sessão do navegador
            e pode ser reexibido sem rotacionar.
          </p>
          <p v-if="displayConnected" class="share-warning" role="status">
            Uma TV está conectada, mas este navegador não guarda o link atual.
            Gerar um novo link desconecta a TV.
          </p>
          <div class="invite-actions">
            <button
              type="button"
              class="btn btn-sm"
              :disabled="busy !== null"
              @click="generateDisplayToken"
            >
              {{ busy === 'generate' ? 'Gerando…' : displayConnected ? 'Gerar novo link…' : 'Gerar link da TV' }}
            </button>
          </div>
        </template>

        <p class="share-block__hint">
          O link contém um token de acesso à TV. Não publique fora da mesa; rotacionar
          invalida o link anterior e desconecta a TV.
        </p>
      </section>

      <p v-if="errorMessage" class="share-error" role="alert">{{ errorMessage }}</p>
    </div>

    <BaseDialog
      :open="playerQrOpen"
      title="Convite de jogadores"
      @update:open="playerQrOpen = $event"
      @close="playerQrOpen = false"
    >
      <div class="qr-dialog">
        <img
          v-if="playerQr"
          class="qr-dialog__image"
          :src="playerQr"
          alt="QR Code para entrar como jogador"
        />
        <p class="qr-dialog__code">
          Código: <code>{{ inviteCode }}</code>
        </p>
        <a class="share-block__link" :href="playerUrl" :title="playerUrl">{{ playerUrl }}</a>
        <div class="invite-actions">
          <button type="button" class="btn btn-sm" @click="copyText(playerUrl, 'Link copiado.')">
            Copiar link
          </button>
          <button
            v-if="canNativeShare"
            type="button"
            class="btn btn-sm alt"
            @click="sharePlayerInvite"
          >Compartilhar</button>
        </div>
      </div>
    </BaseDialog>

    <BaseDialog
      :open="Boolean(confirmAction)"
      :title="confirmTitle"
      @update:open="(open) => { if (!open) closeConfirmDialog(); }"
      @close="closeConfirmDialog"
    >
      <p class="share-dialog-copy">
        <template v-if="confirmAction === 'revoke'">
          A TV perde o acesso na próxima reconexão e precisará de um novo link. Continuar?
        </template>
        <template v-else>
          Rotacionar <strong>desconecta a TV</strong> que estiver aberta agora e invalida o link atual.
          Será preciso abrir o novo link na TV.
        </template>
      </p>
      <p v-if="displayConnected" class="share-dialog-warning">
        Há uma TV conectada neste momento.
      </p>
      <template #footer>
        <button type="button" class="btn btn-sm alt" :disabled="busy !== null" @click="confirmAction = null">
          Cancelar
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="{ danger: confirmAction === 'revoke' }"
          :disabled="busy !== null"
          @click="confirmDisplayAction"
        >
          {{ confirmAction === 'revoke' ? 'Revogar link' : rotateConfirmLabel }}
        </button>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.share-panel {
  min-width: 0;
}

.share-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  min-height: 44px;
  margin-bottom: var(--s-2);
}

.share-head h4 {
  margin: 0;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}

.share-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  min-height: 44px;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  cursor: pointer;
}

.share-toggle:hover {
  border-color: var(--line);
  background: var(--raised);
  color: var(--text);
}

.share-toggle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.share-panel__body {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.share-block {
  padding: var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--raised);
  min-width: 0;
}

.share-block__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  margin-bottom: var(--s-3);
}

.share-block__head h5 {
  margin: 0;
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 600;
}

.share-hint {
  color: var(--text-faint);
  font-size: var(--text-2xs);
}

.share-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.share-badge {
  padding: 2px var(--s-2);
  border: 1px solid rgb(92 155 133 / 0.5);
  border-radius: var(--radius-xs);
  background: rgb(92 155 133 / 0.14);
  color: var(--success-ink);
  font-size: var(--text-2xs);
  font-weight: 600;
}

.share-badge--configured {
  border-color: rgb(127 182 201 / 0.5);
  background: rgb(47 108 132 / 0.16);
  color: var(--accent-ink);
}

.invite-player {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  align-items: flex-start;
  min-width: 0;
}

.invite-qr {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 140px;
  height: 140px;
  padding: 4px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: #ffffff;
  cursor: zoom-in;
}

.invite-qr:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.invite-qr img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.invite-qr--display {
  cursor: default;
}

.invite-qr__pending {
  padding: var(--s-2);
  color: #3a3a3a;
  font-size: var(--text-2xs);
  text-align: center;
}

.invite-player__meta {
  display: flex;
  flex: 1 1 180px;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.invite-code-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}

.invite-label {
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

.invite-code {
  padding: 2px var(--s-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-sm);
  letter-spacing: 0.04em;
}

.share-block__link {
  display: block;
  overflow-wrap: anywhere;
  color: var(--accent-ink);
  font-size: var(--text-2xs);
  line-height: var(--leading-body);
}

.invite-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-2);
}

.invite-actions .btn {
  min-height: 40px;
}

.invite-preview {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  align-self: flex-start;
  min-height: 32px;
  color: var(--accent-ink);
  font-size: var(--text-xs);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.invite-preview:hover {
  color: var(--text);
}

.tv-steps {
  margin: 0 0 var(--s-3);
  padding-left: var(--s-5);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.tv-steps li + li {
  margin-top: var(--s-1);
}

.share-display {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  align-items: flex-start;
  margin-bottom: var(--s-2);
}

.share-tv-pending {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.share-warning {
  margin: 0 0 var(--s-2);
  padding: var(--s-2) var(--s-3);
  border: 1px solid rgb(217 180 91 / 0.5);
  border-radius: var(--radius-xs);
  background: rgb(217 180 91 / 0.1);
  color: var(--manila);
  font-size: var(--text-xs);
  line-height: var(--leading-body);
}

.share-block__danger {
  --btn-bg: transparent;
  --btn-bg-hover: rgb(178 58 50 / 0.16);
  --btn-fg: var(--danger-ink);
  --btn-border: rgb(178 58 50 / 0.55);
}

.share-block__hint {
  margin: var(--s-3) 0 0;
  color: var(--text-faint);
  font-size: var(--text-2xs);
  line-height: var(--leading-body);
}

.share-error {
  margin: 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid rgb(178 58 50 / 0.55);
  border-radius: var(--radius-xs);
  background: rgb(178 58 50 / 0.12);
  color: var(--danger-ink);
  font-size: var(--text-xs);
}

.qr-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
}

.qr-dialog__image {
  width: min(320px, 78vw);
  height: auto;
  padding: var(--s-2);
  border-radius: var(--radius-xs);
  background: #ffffff;
}

.qr-dialog__code {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.qr-dialog__code code {
  color: var(--text);
  font-family: var(--font-data);
}

.share-dialog-copy {
  margin: 0;
  color: var(--text-muted);
  line-height: var(--leading-body);
}

.share-dialog-warning {
  margin: var(--s-3) 0 0;
  padding: var(--s-2) var(--s-3);
  border: 1px solid rgb(217 180 91 / 0.5);
  border-radius: var(--radius-xs);
  background: rgb(217 180 91 / 0.1);
  color: var(--manila);
  font-size: var(--text-sm);
}

@media (max-width: 1023px), (pointer: coarse) {
  .invite-actions .btn,
  .invite-code-row .btn {
    min-height: 44px;
  }
}

@media (max-width: 420px) {
  .invite-player {
    flex-direction: column;
    align-items: stretch;
  }

  .invite-qr {
    align-self: center;
  }

  .invite-preview {
    min-height: 44px;
  }
}
</style>
