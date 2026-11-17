<script setup lang="ts">
/**
 * Shell dividido das telas de autenticação. O lado esquerdo é o "índice do
 * arquivo": a mesa é a mesma na sala ou online, com TV opcional. O lado
 * direito recebe o formulário e é a única área com h1.
 */
withDefaults(
  defineProps<{
    /** Linha de contexto curta, ex.: "Você foi convidado para uma mesa." */
    note?: string
  }>(),
  { note: '' },
)
</script>

<template>
  <div class="auth-shell">
    <aside class="auth-shell__index" aria-label="A mesa e seus papéis">
      <div class="auth-shell__brand">
        <p class="auth-shell__kicker">Arquivo de mesa</p>
        <div class="auth-shell__brand-row">
          <img
            class="auth-shell__mark"
            src="/logotof.png"
            alt="Tavern of Disaster"
            width="64"
            height="64"
            decoding="async"
          />
          <p class="auth-shell__wordmark">
            <span>Tavern</span>
            <span class="auth-shell__of">of</span>
            <span>Disaster</span>
          </p>
        </div>
        <p class="auth-shell__tagline">
          A mesa é a mesma na sala ou na tela. O celular é o controle de cada jogador.
        </p>
      </div>

      <dl class="auth-shell__routes">
        <div class="auth-shell__route">
          <dt>Mestre</dt>
          <dd>Prepara a cena e conduz o turno</dd>
        </div>
        <div class="auth-shell__route">
          <dt>Jogador</dt>
          <dd>Move o token e rola pelo celular</dd>
        </div>
        <div class="auth-shell__route">
          <dt>TV opcional</dt>
          <dd>Para a sala, quando houver uma</dd>
        </div>
      </dl>

      <p class="auth-shell__fact">
        D&D 5e é o sistema padrão. OP2, OPSH e Cyberpunk RED usam a mesma mesa.
      </p>
      <p v-if="note" class="auth-shell__note">{{ note }}</p>
    </aside>

    <section class="auth-shell__main" aria-label="Formulário de acesso">
      <slot />
    </section>
  </div>
</template>

<style scoped>
.auth-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 432px);
  gap: clamp(var(--s-7), 6vw, var(--s-10));
  align-items: start;
  width: 100%;
  max-width: 1120px;
  margin-inline: auto;
  padding: clamp(var(--s-6), 5vw, var(--s-10)) var(--s-6) var(--s-9);
}

.auth-shell__index {
  display: flex;
  flex-direction: column;
  gap: var(--s-7);
  padding-top: var(--s-4);
}

.auth-shell__brand {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.auth-shell__brand-row {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  min-width: 0;
}

.auth-shell__mark {
  flex: none;
  inline-size: 64px;
  block-size: 64px;
  object-fit: contain;
}

.auth-shell__kicker {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.auth-shell__wordmark {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.28em;
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: clamp(2rem, 1.2rem + 2.2vw, 2.75rem);
  font-weight: 600;
  line-height: 1.05;
  letter-spacing: -0.01em;
}

.auth-shell__of {
  color: var(--text-muted);
  font-size: 0.72em;
  font-style: italic;
}

.auth-shell__tagline {
  max-width: 34ch;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-lg);
  line-height: 1.5;
}

.auth-shell__routes {
  margin: 0;
  border-top: 1px solid var(--line-strong);
}

.auth-shell__route {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: baseline;
  gap: var(--s-4);
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--line);
}

.auth-shell__route dt {
  color: var(--text);
  font-size: var(--text-md);
  font-weight: 500;
}

.auth-shell__route dd {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-sm);
}

.auth-shell__fact,
.auth-shell__note {
  max-width: 42ch;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.auth-shell__note {
  padding-left: var(--s-4);
  border-left: 2px solid var(--manila);
  color: var(--text);
}

.auth-shell__main {
  width: 100%;
  padding: var(--s-7);
  border: 1px solid var(--line);
  border-top: 2px solid var(--line-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
}

@media (max-width: 860px) {
  .auth-shell {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-6);
    padding: var(--s-6) var(--s-5) var(--s-8);
  }

  .auth-shell__index {
    gap: var(--s-4);
    padding-top: 0;
  }

  .auth-shell__routes,
  .auth-shell__fact {
    display: none;
  }

  .auth-shell__wordmark {
    display: none;
  }

  .auth-shell__tagline {
    max-width: 48ch;
    font-size: var(--text-base);
  }

  .auth-shell__main {
    padding: var(--s-5);
    max-width: 520px;
  }
}
</style>
