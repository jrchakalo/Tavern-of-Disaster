<script setup lang="ts">
import { computed } from 'vue';
import { iconSet } from '../icons/iconSet';

const props = defineProps<{ name: string; size?: number | string; stroke?: number | string; title?: string }>();

// Simple inline icon library (stroke-based for scalability)
// Add new icons here as needed.
// Proxy to external iconSet for easier manual editing by user
const paths = iconSet;

const box = computed(() => paths[props.name]?.viewBox || '0 0 24 24');
</script>

<template>
  <svg
    :viewBox="box"
    :width="size || 24"
    :height="size || 24"
    fill="none"
    stroke="currentColor"
    :aria-label="props.title || props.name"
    role="img"
    style="display:inline-block;vertical-align:middle;"
    v-html="paths[props.name]?.svg || ''"
  />
</template>

<style scoped>
svg { color: currentColor; }
</style>
