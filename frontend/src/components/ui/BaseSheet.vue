<script setup lang="ts">
import BaseDialog from './BaseDialog.vue';

/**
 * Bottom sheet reutilizável para as próximas ondas (token, ferramentas,
 * filtros no celular). Compartilha foco/Esc/scroll lock com o BaseDialog.
 */
withDefaults(
  defineProps<{
    open?: boolean;
    title?: string;
    labelledby?: string;
    label?: string;
    dismissible?: boolean;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
  }>(),
  {
    open: false,
    title: '',
    labelledby: '',
    label: '',
    dismissible: true,
    closeOnBackdrop: true,
    closeOnEsc: true,
  },
);

const emit = defineEmits<{
  'update:open': [value: boolean];
  close: [];
}>();
</script>

<template>
  <BaseDialog
    :open="open"
    :title="title"
    :labelledby="labelledby"
    :label="label"
    :dismissible="dismissible"
    :close-on-backdrop="closeOnBackdrop"
    :close-on-esc="closeOnEsc"
    variant="sheet"
    @update:open="emit('update:open', $event)"
    @close="emit('close')"
  >
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </BaseDialog>
</template>
