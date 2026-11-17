<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseDialog from '../ui/BaseDialog.vue'
import Icon from '../Icon.vue'
import { createDisplayToken } from '../../services/tableAccessService'
import { copyToClipboard } from '../../services/clipboard'
import { toast } from '../../services/toast'
import type { ITable } from '../../types'

const props = withDefaults(
  defineProps<{
    open: boolean
    table: ITable | null
    canManage: boolean
  }>(),
  { table: null, canManage: false },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const displayUrl = ref('')
const loading = ref(false)
const error = ref('')
const copied = ref(false)

watch(
  () => [props.open, props.table?._id] as const,
  ([open]) => {
    if (!open) return
    displayUrl.value = ''
    error.value = ''
    copied.value = false
    loading.value = false
  },
)

function close() {
  emit('update:open', false)
}

async function generate() {
  if (!props.table || loading.value) return
  loading.value = true
  error.value = ''
  copied.value = false
  try {
    const result = await createDisplayToken(props.table._id)
    displayUrl.value = result.displayUrl
  } catch (err) {
    error.value =
      err instanceof TypeError
        ? 'Sem conexão com o servidor. Verifique a rede e tente de novo.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível gerar o link da TV agora.'
  } finally {
    loading.value = false
  }
}

async function copy() {
  if (!displayUrl.value) return
  const ok = await copyToClipboard(displayUrl.value)
  copied.value = ok
  if (ok) toast.success('Link da TV copiado.')
  else toast.error('Não foi possível copiar. Selecione o endereço manualmente.')
}
</script>

<template>
  <BaseDialog :open="open" title="Abrir na TV" @update:open="emit('update:open', $event)">
    <div class="tv-dialog">
      <div class="tv-dialog__visual" aria-hidden="true">
        <span class="tv-dialog__screen">
          <span class="tv-dialog__rail" />
          <span class="tv-dialog__board" />
        </span>
      </div>

      <p class="tv-dialog__lead">
        A TV é uma tela só de leitura. Abra o link no navegador da TV e deixe em tela cheia; o
        tabuleiro, a iniciativa e as rolagens aparecem ali.
      </p>

      <ol class="tv-dialog__steps">
        <li>Abra o navegador da TV.</li>
        <li>Cole o link da TV e entre em tela cheia.</li>
        <li>Deixe a mesa rolar no celular de cada jogador.</li>
      </ol>

      <template v-if="canManage">
        <div class="tv-dialog__warning">
          <Icon name="alert" :size="16" />
          <p>
            Gerar um link novo <strong>desconecta a TV que já estiver aberta</strong>. Use o link
            abaixo para a TV desta sessão.
          </p>
        </div>

        <button type="button" class="btn outline" :disabled="loading" @click="generate">
          <Icon name="tv" :size="16" />
          {{ loading ? 'Gerando…' : displayUrl ? 'Gerar outro link' : 'Gerar link da TV' }}
        </button>

        <div v-if="displayUrl" class="tv-dialog__result">
          <label for="tv-display-url">Link da TV</label>
          <div class="tv-dialog__url-row">
            <input id="tv-display-url" :value="displayUrl" readonly class="mono" />
            <button type="button" class="btn btn-sm" @click="copy">
              {{ copied ? 'Copiado' : 'Copiar' }}
            </button>
          </div>
          <a :href="displayUrl" target="_blank" rel="noopener" class="tv-dialog__open">
            Abrir em uma nova aba para testar
            <Icon name="external" :size="14" />
          </a>
          <p class="tv-dialog__hint">
            O token fica no fragmento do endereço (#token=…). Ele não aparece nos logs do servidor.
          </p>
        </div>

        <p v-if="error" class="tv-dialog__error" role="alert">{{ error }}</p>
      </template>

      <p v-else class="tv-dialog__note">
        Só o Mestre pode gerar o link da TV. Peça a ele para abrir a aba
        <strong>Convidar</strong> na mesa. O caminho da tela é <code>/display/:id</code>, mas ele só
        conecta com o link completo.
      </p>
    </div>

    <template #footer>
      <button type="button" class="btn ghost" @click="close">Fechar</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.tv-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.tv-dialog__visual {
  display: flex;
  justify-content: center;
  padding: var(--s-4) 0 var(--s-2);
}

.tv-dialog__screen {
  position: relative;
  display: grid;
  grid-template-columns: 22% 1fr;
  width: min(320px, 100%);
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
}

.tv-dialog__rail {
  border-right: 1px solid var(--line-strong);
  background: var(--panel);
}

.tv-dialog__board {
  margin: var(--s-4);
  border: 1px solid var(--line-strong);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M16 0H0V16' fill='none' stroke='%2356656F' stroke-opacity='.35'/%3E%3C/svg%3E");
  background-size: 16px 16px;
}

.tv-dialog input {
  min-height: 44px;
}

.tv-dialog__lead {
  margin: 0;
  color: var(--text);
  font-size: var(--text-md);
  line-height: 1.55;
}

.tv-dialog__steps {
  margin: 0;
  padding-left: var(--s-6);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.tv-dialog__steps li + li {
  margin-top: var(--s-1);
}

.tv-dialog__warning {
  display: flex;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--manila);
  background: rgb(217 180 91 / 0.08);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.tv-dialog__warning :deep(svg) {
  margin-top: 2px;
  color: var(--manila);
}

.tv-dialog__warning p {
  margin: 0;
}

.tv-dialog__result {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.tv-dialog__url-row {
  display: flex;
  gap: var(--s-3);
}

.tv-dialog__url-row input {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--text-sm);
}

.tv-dialog__open {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  width: fit-content;
  font-size: var(--text-sm);
}

.tv-dialog__hint {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.5;
}

.tv-dialog__error {
  margin: 0;
  color: var(--danger-ink);
  font-size: var(--text-sm);
}

.tv-dialog__note {
  margin: 0;
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--line-strong);
  background: var(--raised);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.tv-dialog__note code {
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-sm);
}

@media (max-width: 640px) {
  .tv-dialog .btn {
    min-height: 44px;
  }

  .tv-dialog__url-row {
    flex-direction: column;
  }

  .tv-dialog__url-row .btn {
    width: 100%;
  }
}
</style>
