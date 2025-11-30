<script setup lang="ts">
import { ref } from 'vue';
import type { GridSquare, TokenDTO, MeasurementDTO, AuraDTO } from '../types';

const props = defineProps<{
  currentMapUrl: string | null;
  gridWidth: number;
  gridHeight: number;
  metersPerSquare: number;
  squares: GridSquare[];
  tokensOnMap: TokenDTO[];
  measurements: MeasurementDTO[];
  auras?: AuraDTO[];
}>();

const pixiContainer = ref<HTMLDivElement | null>(null);

// TODO: Instantiate PIXI.Application inside onMounted, render map layers, and
// sync with props (tiles, tokens, measurements, auras) once PixiJS wiring lands.
</script>

<template>
  <div ref="pixiContainer" class="map-viewport-pixi">
    <!-- TODO: PixiJS renderer será implementado aqui -->
  </div>
</template>

<style scoped>
.map-viewport-pixi {
  width: 100%;
  height: 100%;
  display: block;
  background: #0f0f0f;
}
</style>
