<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useSystemStore } from '../stores/systemStore';
import Icon from '../components/Icon.vue';

const systemStore = useSystemStore();
const { systems } = storeToRefs(systemStore);

const isLoading = computed(() => systemStore.isLoading);
const hasSystems = computed(() => systems.value.length > 0);

function openDocs(url?: string | null) {
  if (!url) return;
  window.open(url, '_blank', 'noopener');
}

function attributePreview(system: (typeof systems.value)[number]) {
  return (system.defaultAttributes ?? []).slice(0, 4);
}

onMounted(() => {
  if (!systemStore.isLoaded) {
    systemStore.fetchAll().catch((error) => {
      console.error('[systems] falha ao carregar biblioteca', error);
    });
  }
});
</script>

<template>
  <div class="systems-library">
    <header class="library-hero surface">
      <div>
        <p class="eyebrow">Biblioteca</p>
        <h1>Sistemas suportados</h1>
        <p class="lead">
          Explore presets prontos para configurar atributos, movimentação e rolagens padrão. Escolha um sistema
          na hora de montar sua mesa e deixe o VTT cuidar do resto.
        </p>
      </div>
      <Icon name="book" size="56" class="hero-icon" />
    </header>

    <section class="system-grid" v-if="hasSystems">
      <article v-for="system in systems" :key="system._id" class="system-card surface">
        <div class="card-head">
          <div>
            <p class="system-key">{{ system.key }}</p>
            <h2>{{ system.name }}</h2>
          </div>
          <button v-if="system.docsUrl" type="button" class="ghost" @click="openDocs(system.docsUrl)">
            Abrir livro
            <Icon name="external" size="16" />
          </button>
        </div>
        <p class="description">{{ system.description || 'Sistema genérico pronto para uso imediato.' }}</p>
        <div v-if="system.defaultAttributes?.length" class="attributes">
          <p class="attr-title">Atributos base</p>
          <ul>
            <li v-for="attr in attributePreview(system)" :key="attr.key">
              <span class="attr-label">{{ attr.label }}</span>
              <small>{{ attr.type }}</small>
            </li>
          </ul>
        </div>
        <div class="card-footer">
          <span class="chip" v-if="system.movementRules?.baseSpeedFeet">
            <Icon name="ruler" size="14" /> {{ system.movementRules.baseSpeedFeet }} ft base
          </span>
          <span class="chip neutral">
            <Icon name="dice" size="14" /> {{ system.dicePresets?.length || 0 }} presets
          </span>
        </div>
      </article>
    </section>

    <div v-else class="empty-state surface">
      <p v-if="isLoading">Carregando sistemas...</p>
      <p v-else>Nenhum sistema cadastrado ainda. Em breve adicionaremos mais universos jogáveis.</p>
    </div>
  </div>
</template>

<style scoped>
.systems-library {
  padding: clamp(1.5rem, 4vw, 3rem);
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.surface {
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--color-surface), var(--color-surface-alt));
  box-shadow: var(--elev-2);
}
.library-hero {
  padding: clamp(1.25rem, 3vw, 2rem);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 0 0 0.25rem;
}
.library-hero h1 {
  margin: 0;
  font-size: clamp(1.8rem, 3vw, 2.4rem);
}
.library-hero .lead {
  margin: 0.5rem 0 0;
  color: var(--color-text-muted);
  max-width: 60ch;
}
.hero-icon {
  color: var(--color-accent);
}
.system-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
}
.system-card {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.card-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.system-key {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin: 0;
}
.system-card h2 {
  margin: 0.1rem 0 0;
  font-size: 1.25rem;
}
.system-card .ghost {
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: inherit;
  padding: 6px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.description {
  margin: 0;
  color: var(--color-text-muted);
  min-height: 48px;
}
.attributes {
  border-top: 1px solid var(--color-border);
  padding-top: 0.75rem;
}
.attr-title {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}
.attributes ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.attributes li {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  min-width: 90px;
  background: rgba(255, 255, 255, 0.03);
}
.attr-label {
  font-weight: 600;
}
.attributes small {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.card-footer {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.chip {
  border-radius: 999px;
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
}
.chip.neutral {
  color: var(--color-text-muted);
}
.empty-state {
  padding: 2rem;
  text-align: center;
}
.empty-state p {
  margin: 0;
  color: var(--color-text-muted);
}
@media (max-width: 640px) {
  .library-hero {
    flex-direction: column;
    align-items: flex-start;
  }
  .card-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
