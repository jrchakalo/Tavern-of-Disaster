<script setup lang="ts">
import { computed } from 'vue';
import { dieShapeFor, type DieFace, type DieShape } from './dieShapes';

const props = withDefaults(
  defineProps<{
    sides: DieFace;
    value?: number | null;
    /** `false` = dado descartado (opacidade + risco diagonal, nunca só cor). */
    kept?: boolean;
  }>(),
  {
    value: null,
    kept: true,
  },
);

const shape = computed<DieShape>(() => dieShapeFor(props.sides));
const valueLabel = computed(() => (props.value == null ? '—' : String(props.value)));
const isDropped = computed(() => props.kept === false);
</script>

<template>
  <span
    class="die-art"
    :class="[`die-art--${shape}`, { 'is-dropped': isDropped }]"
    :data-shape="shape"
  >
    <svg class="die-art__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <template v-if="shape === 'd4'">
        <polygon class="die-art__face" points="50,5 96,93 4,93" />
        <path class="die-art__facet" d="M50 5 50 93 M27 49 73 49" />
      </template>

      <template v-else-if="shape === 'd6'">
        <rect class="die-art__face" x="9" y="9" width="82" height="82" rx="5" />
        <path class="die-art__facet" d="M9 30h18 M9 70h18 M73 30h18 M73 70h18" />
      </template>

      <template v-else-if="shape === 'd8'">
        <polygon class="die-art__face" points="50,4 95,50 50,96 5,50" />
        <path class="die-art__facet" d="M50 4v92 M5 50h90" />
      </template>

      <template v-else-if="shape === 'd10' || shape === 'd100'">
        <polygon class="die-art__face" points="50,4 89,30 77,85 50,98 23,85 11,30" />
        <path class="die-art__facet" d="M50 4 50 98 M11 30 50 58 89 30" />
        <path v-if="shape === 'd100'" class="die-art__facet" d="M30 92h40" />
      </template>

      <template v-else-if="shape === 'd12'">
        <polygon class="die-art__face" points="50,4 95,38 78,93 22,93 5,38" />
        <path class="die-art__facet" d="M50 4 22 93 M50 4l28 89 M5 38h90" />
      </template>

      <template v-else>
        <polygon class="die-art__face" points="50,4 91,28 91,72 50,96 9,72 9,28" />
        <path class="die-art__facet" d="M50 4v92 M9 28l82 44 M91 28 9 72" />
      </template>
    </svg>

    <span class="die-art__value">{{ valueLabel }}</span>
    <span v-if="isDropped" class="die-art__drop-rule" aria-hidden="true"></span>
  </span>
</template>

<style scoped>
.die-art {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--die-size, 72px);
  block-size: var(--die-size, 72px);
  color: var(--ink-0);
  flex: none;
}

.die-art__svg {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  overflow: visible;
}

.die-art__face {
  fill: var(--paper);
  stroke: currentColor;
  stroke-width: 4;
  stroke-linejoin: round;
}

.die-art__facet {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.32;
}

.die-art__value {
  position: relative;
  z-index: 1;
  font-family: var(--font-data);
  font-size: calc(var(--die-size, 72px) * 0.4);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

/* O triângulo do d4 tem o centro visual abaixo da metade. */
.die-art--d4 .die-art__value {
  transform: translateY(14%);
}

.die-art--d100 .die-art__value {
  font-size: calc(var(--die-size, 72px) * 0.34);
  transform: translateY(-2%);
}

.die-art.is-dropped {
  opacity: 0.45;
}

.die-art__drop-rule {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: -4%;
  right: -4%;
  block-size: 2px;
  background: var(--danger);
  transform: rotate(-45deg);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .die-art {
    transition: none;
  }
}
</style>
