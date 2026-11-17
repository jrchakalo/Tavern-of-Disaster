<script setup lang="ts">
/**
 * Cena de imagem na TV: handout/exploração em tela cheia, sem grade, tokens,
 * iniciativa ou ticker. Read-only por definição — nenhum controle de escrita.
 */
withDefaults(
  defineProps<{
    imageUrl?: string | null;
    sceneName?: string;
  }>(),
  { imageUrl: null, sceneName: '' },
);
</script>

<template>
  <div
    class="display-image"
    :class="{ 'is-empty': !imageUrl }"
    :role="imageUrl ? 'img' : 'group'"
    :aria-label="imageUrl ? `Imagem da cena${sceneName ? `: ${sceneName}` : ''}` : 'Imagem da cena ainda não definida'"
  >
    <img v-if="imageUrl" class="display-image__img" :src="imageUrl" alt="" draggable="false" />
    <div v-else class="display-image__empty">
      <p class="display-image__empty-title">Imagem da cena ainda não definida</p>
      <p class="display-image__empty-copy">
        O Mestre prepara a imagem. Ela aparece aqui assim que a cena for ativada.
      </p>
    </div>
  </div>
</template>

<style scoped>
.display-image {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  /* Letterbox escuro: a imagem nunca é cortada nem esticada. */
  background: var(--ink-0);
}

.display-image__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.display-image__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-2);
  width: min(560px, calc(100% - 48px));
  padding: var(--s-5) var(--s-6);
  border: 1px solid var(--line-strong);
  border-top: 3px solid var(--manila);
  border-radius: var(--radius-sm);
  background: var(--panel);
}

.display-image__empty-title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: clamp(1.375rem, 0.6vw + 1rem, 1.75rem);
  font-weight: 600;
  line-height: 1.15;
}

.display-image__empty-copy {
  max-width: 52ch;
  margin: 0;
  color: var(--text-muted);
  font-size: clamp(1rem, 0.3vw + 0.85rem, 1.25rem);
  line-height: 1.45;
}

@media (prefers-reduced-motion: reduce) {
  .display-image__img {
    transition: none;
  }
}
</style>
