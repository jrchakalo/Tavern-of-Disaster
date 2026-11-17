<script setup lang="ts">
import { computed } from 'vue';
import { iconSet } from '../icons/iconSet';

const props = defineProps<{
  name: string;
  size?: number | string;
  stroke?: number | string;
  /** @deprecated use `label` para ícones com significado */
  title?: string;
  /** Nome acessível. Sem label/title o ícone é decorativo. */
  label?: string;
}>();

const definition = computed(() => iconSet[props.name]);
const box = computed(() => definition.value?.viewBox || '0 0 24 24');

// As entradas do iconSet carregam um <svg> completo. Extraímos apenas o miolo
// para evitar <svg> aninhado e atributos duplicados (width, height, aria).
const inner = computed(() => {
  const raw = definition.value?.svg ?? '';
  const match = raw.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
  return (match ? match[1] : raw).trim();
});

const accessibleName = computed(() => props.label || props.title || '');
const isDecorative = computed(() => accessibleName.value.length === 0);
</script>

<template>
  <svg
    :viewBox="box"
    :width="size || 24"
    :height="size || 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke || 2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :aria-hidden="isDecorative ? 'true' : undefined"
    :aria-label="isDecorative ? undefined : accessibleName"
    :role="isDecorative ? undefined : 'img'"
    :focusable="isDecorative ? 'false' : undefined"
    style="display: inline-block; vertical-align: middle; flex: none"
    v-html="inner"
  />
</template>

<style scoped>
svg {
  color: currentColor;
}
</style>
