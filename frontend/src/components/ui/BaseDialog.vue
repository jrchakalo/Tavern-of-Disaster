<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '../Icon.vue';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    title?: string;
    /** id de um elemento já existente que nomeia o diálogo */
    labelledby?: string;
    /** nome acessível quando não há título visível */
    label?: string;
    dismissible?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    variant?: 'dialog' | 'sheet';
  }>(),
  {
    open: false,
    title: '',
    labelledby: '',
    label: '',
    dismissible: true,
    closeOnBackdrop: true,
    closeOnEsc: true,
    variant: 'dialog',
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  close: [];
}>();

const dialogEl = ref<HTMLDialogElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const uid = `base-dialog-${Math.random().toString(36).slice(2, 9)}`;

const titleId = computed(() => props.labelledby || `${uid}-title`);
const ariaLabelledby = computed(() =>
  props.labelledby || props.title ? titleId.value : undefined,
);
const ariaLabel = computed(() =>
  !props.labelledby && !props.title && props.label ? props.label : undefined,
);

let isOpen = false;
let selfClosed = false;
let previouslyFocused: HTMLElement | null = null;
let pageRoot: HTMLElement | null = null;

function lockPage() {
  pageRoot = document.getElementById('app');
  if (pageRoot) pageRoot.setAttribute('inert', '');
  document.documentElement.classList.add('has-open-dialog');
}

function unlockPage() {
  if (pageRoot) {
    pageRoot.removeAttribute('inert');
    pageRoot = null;
  }
  document.documentElement.classList.remove('has-open-dialog');
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const selector = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'audio[controls]',
    'video[controls]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((element) => {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function focusInitial() {
  const el = dialogEl.value;
  if (!el) return;
  const body = el.querySelector<HTMLElement>('.base-dialog__body');
  const target =
    el.querySelector<HTMLElement>('[data-autofocus], [autofocus]') ??
    focusableElements(body)[0] ??
    focusableElements(el)[0] ??
    panelEl.value ??
    el;
  target.focus();
}

/**
 * Prende o Tab dentro do painel. O `<dialog>` nativo já isola o resto da
 * página em navegadores modernos, mas o fallback sem `showModal` (e alguns
 * WebViews) deixa o foco escapar; o ciclo explícito cobre os dois casos.
 */
function isTopmostDialog(): boolean {
  const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'));
  return dialogs.length === 0 || dialogs[dialogs.length - 1] === dialogEl.value;
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (!isOpen || event.key !== 'Tab') return;
  // Diálogo empilhado (ex.: Ajustes dentro da Chamada): só o do topo prende
  // o Tab; os de baixo voltam a valer quando o topo fechar.
  if (!isTopmostDialog()) return;
  const panel = panelEl.value;
  if (!panel) return;
  const list = focusableElements(panel);
  if (!list.length) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !panel.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function restoreFocus() {
  const target = previouslyFocused;
  previouslyFocused = null;
  if (!target) return;
  nextTick(() => {
    if (target.isConnected) target.focus();
  });
}

async function showDialog() {
  const el = dialogEl.value;
  if (!el || isOpen) return;
  isOpen = true;
  selfClosed = false;
  previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (typeof el.showModal === 'function') {
    try {
      el.showModal();
    } catch {
      el.setAttribute('open', '');
    }
  } else {
    el.setAttribute('open', '');
  }

  lockPage();
  document.addEventListener('keydown', onDocumentKeydown, true);
  await nextTick();
  if (isOpen) focusInitial();
}

function closeDialog(restoreFocusToTrigger = true) {
  const el = dialogEl.value;
  if (!isOpen || !el) return;
  isOpen = false;
  selfClosed = true;

  if (typeof el.close === 'function' && el.open) {
    el.close();
  } else {
    el.removeAttribute('open');
  }
  unlockPage();
  document.removeEventListener('keydown', onDocumentKeydown, true);
  if (restoreFocusToTrigger) restoreFocus();
}

function onDialogClosed() {
  unlockPage();
  document.removeEventListener('keydown', onDocumentKeydown, true);
  // Fechamento iniciado pelo próprio componente: o estado já está sincronizado.
  if (selfClosed) {
    selfClosed = false;
    return;
  }
  // Fechamento nativo (ex.: form method="dialog"): apenas sincroniza o pai.
  isOpen = false;
  emit('update:open', false);
  emit('close');
  restoreFocus();
}

function requestClose() {
  emit('update:open', false);
  emit('close');
  closeDialog(true);
}

function onCancel(event: Event) {
  event.preventDefault();
  if (!props.closeOnEsc) return;
  requestClose();
}

function onBackdropClick(event: MouseEvent) {
  if (event.target !== dialogEl.value) return;
  if (!props.closeOnBackdrop) return;
  requestClose();
}

watch(
  () => props.open,
  (value) => {
    if (value) {
      void showDialog();
    } else {
      closeDialog(false);
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (props.open) void showDialog();
});

onBeforeUnmount(() => {
  if (isOpen) {
    const el = dialogEl.value;
    if (el?.open && typeof el.close === 'function') el.close();
    isOpen = false;
  }
  unlockPage();
  document.removeEventListener('keydown', onDocumentKeydown, true);
});
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogEl"
      class="base-dialog"
      :class="`base-dialog--${variant}`"
      :aria-labelledby="ariaLabelledby"
      :aria-label="ariaLabel"
      @cancel="onCancel"
      @close="onDialogClosed"
      @click="onBackdropClick"
    >
      <div ref="panelEl" class="base-dialog__panel" tabindex="-1">
        <span v-if="variant === 'sheet'" class="base-dialog__handle" aria-hidden="true" />
        <header v-if="title || $slots.header" class="base-dialog__head">
          <slot name="header">
            <h2 :id="titleId" class="base-dialog__title">{{ title }}</h2>
          </slot>
          <button
            v-if="dismissible"
            type="button"
            class="base-dialog__close"
            aria-label="Fechar"
            @click="requestClose"
          >
            <Icon name="close" :size="18" />
          </button>
        </header>
        <div class="base-dialog__body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="base-dialog__footer">
          <slot name="footer" />
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.base-dialog {
  width: min(480px, calc(100vw - 32px));
  max-width: 480px;
  max-height: min(88dvh, 760px);
  margin: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  overflow: visible;
}

.base-dialog::backdrop {
  background: rgb(4 6 7 / 0.72);
}

.base-dialog[open] {
  animation: dialog-in var(--dur-pop) var(--ease-out);
}

.base-dialog--sheet {
  width: min(560px, 100vw);
  max-width: none;
  margin: auto auto 0;
}

.base-dialog--sheet[open] {
  animation: sheet-in var(--dur-sheet) var(--ease-out);
}

.base-dialog__panel {
  display: flex;
  flex-direction: column;
  max-height: inherit;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-md);
  background: var(--panel);
  box-shadow: var(--shadow-overlay);
}

.base-dialog__panel:focus {
  outline: none;
}

.base-dialog--sheet .base-dialog__panel {
  max-height: 90dvh;
  border-bottom: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.base-dialog__handle {
  flex: none;
  width: 32px;
  height: 3px;
  margin: var(--s-3) auto var(--s-1);
  border-radius: var(--radius-pill);
  background: var(--line-strong);
}

.base-dialog__head {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: var(--s-4);
  padding: var(--s-5) var(--s-6) var(--s-3);
  border-bottom: 1px solid var(--line);
}

.base-dialog--sheet .base-dialog__head {
  padding-top: var(--s-4);
}

.base-dialog__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
  line-height: var(--leading-snug);
}

.base-dialog__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  inline-size: 44px;
  block-size: 44px;
  margin: -8px -8px 0 auto;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
}

.base-dialog__close:hover {
  background: var(--raised);
  color: var(--text);
}

.base-dialog__body {
  flex: 1 1 auto;
  padding: var(--s-5) var(--s-6);
  overflow: auto;
  overscroll-behavior: contain;
}

.base-dialog__footer {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-6);
  border-top: 1px solid var(--line);
  background: var(--panel);
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(32px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .base-dialog {
    width: calc(100vw - 24px);
  }

  .base-dialog--sheet {
    width: 100vw;
  }

  .base-dialog__head,
  .base-dialog__body,
  .base-dialog__footer {
    padding-inline: var(--s-5);
  }

  .base-dialog__close {
    inline-size: 44px;
    block-size: 44px;
  }
}
</style>
