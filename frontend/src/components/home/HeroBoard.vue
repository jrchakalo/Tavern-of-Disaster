<script setup lang="ts">
/**
 * Fragmento de tabuleiro real (não um card de marketing): grade, dois tokens,
 * uma linha de medição, rail de iniciativa e o resultado de um dado. A entrada
 * é orquestrada uma vez; depois nada se move. Sem loop, sem blur, sem vídeo.
 */
</script>

<template>
  <figure
    class="hero-board"
    role="img"
    aria-label="Prévia da mesa: tabuleiro com dois tokens, uma medição de 4,5 metros, iniciativa com Ghoul, Ana e Kuro, e o resultado 23 em 1d20 + 5."
  >
    <div class="hero-board__head">
      <span class="hero-board__scene">Cena 01: Cripta</span>
      <span class="hero-board__live">Ao vivo</span>
    </div>

    <div class="hero-board__frame">
      <div class="board">
        <div class="board__cells" aria-hidden="true">
          <span v-for="cell in 48" :key="cell" />
        </div>

        <svg
          class="board__measure"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M27 31 L62 59" />
          <rect x="26" y="30" width="2" height="2" />
          <rect x="61" y="58" width="2" height="2" />
        </svg>

        <div class="token token--ally">
          <span class="token__initial">A</span>
          <span class="token__name">Ana</span>
        </div>
        <div class="token token--enemy">
          <span class="token__initial">G</span>
          <span class="token__name">Ghoul</span>
        </div>

        <span class="board__distance">4,5 m</span>
      </div>

      <aside class="rail" aria-label="Iniciativa">
        <p class="rail__title">Iniciativa</p>
        <ol class="rail__list">
          <li class="rail__item rail__item--current">
            <span class="rail__name">Ghoul</span>
            <span class="rail__value">18</span>
          </li>
          <li class="rail__item">
            <span class="rail__name">Ana</span>
            <span class="rail__value">15</span>
          </li>
          <li class="rail__item">
            <span class="rail__name">Kuro</span>
            <span class="rail__value">11</span>
          </li>
        </ol>
        <p class="rail__foot">Rodada 2</p>
      </aside>
    </div>

    <figcaption class="dice-slip">
      <span class="dice-slip__who">Ana, ataque</span>
      <span class="dice-slip__total">23</span>
      <span class="dice-slip__expr">1d20 + 5</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.hero-board {
  position: relative;
  width: 100%;
  max-width: 620px;
  margin: 0;
}

.hero-board__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--line);
  border-bottom: 0;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  background: var(--panel);
}

.hero-board__scene {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.hero-board__live {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--success-ink);
  font-size: var(--text-xs);
  font-weight: 500;
}

.hero-board__live::before {
  content: '';
  inline-size: 6px;
  block-size: 6px;
  border-radius: var(--radius-pill);
  background: var(--success-ink);
}

.hero-board__frame {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  border: 1px solid var(--line-strong);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  background: var(--ink-0);
}

.board {
  position: relative;
  aspect-ratio: 4 / 3;
  min-width: 0;
  overflow: hidden;
}

.board__cells {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(6, 1fr);
  opacity: 0;
  animation: board-in 500ms var(--ease-out) 80ms both;
}

.board__cells span {
  border-right: 1px solid rgb(86 101 111 / 0.28);
  border-bottom: 1px solid rgb(86 101 111 / 0.28);
}

.board__cells span:nth-child(8n) {
  border-right: 0;
}

.board__cells span:nth-last-child(-n + 8) {
  border-bottom: 0;
}

.board__measure {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  overflow: visible;
  pointer-events: none;
}

.board__measure path {
  fill: none;
  stroke: var(--manila);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 5 4;
}

.board__measure rect {
  fill: var(--manila);
}

.token {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-1);
  opacity: 0;
  transform: scale(0.94);
  animation: token-in 160ms var(--ease-out) both;
}

.token--ally {
  top: 21%;
  left: 17%;
  animation-delay: 380ms;
}

.token--enemy {
  top: 49%;
  left: 53%;
  animation-delay: 460ms;
}

.token__initial {
  display: grid;
  place-items: center;
  inline-size: 42px;
  block-size: 42px;
  border: 2px solid var(--text);
  border-radius: var(--radius-pill);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  box-shadow: 0 0 0 3px var(--ink-0);
}

.token--ally .token__initial {
  background: var(--accent);
}

.token--enemy .token__initial {
  background: var(--danger);
}

.token__name {
  padding: 1px 5px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
  color: var(--text);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  line-height: 1.3;
  white-space: nowrap;
}

.board__distance {
  position: absolute;
  top: 46%;
  left: 49%;
  padding: 1px 5px;
  transform: translate(-50%, 8px);
  border: 1px solid rgb(217 180 91 / 0.5);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  white-space: nowrap;
}

.rail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-left: 1px solid var(--line-strong);
  background: var(--panel);
}

.rail__title {
  margin: 0;
  padding: var(--s-3);
  border-bottom: 1px solid var(--line);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 500;
}

.rail__list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rail__item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-2);
  padding: var(--s-3);
  border-bottom: 1px solid var(--line);
  border-left: 3px solid transparent;
  font-size: var(--text-sm);
}

.rail__item--current {
  border-left-color: var(--manila);
  background: var(--raised);
}

.rail__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail__value {
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-xs);
}

.rail__foot {
  margin: 0;
  padding: var(--s-3);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.dice-slip {
  position: absolute;
  bottom: -22px;
  left: var(--s-6);
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-4);
  transform: rotate(-1deg);
  border: 1px solid var(--paper-line);
  border-radius: var(--radius-xs);
  background: var(--paper);
  color: var(--ink-0);
  box-shadow: 0 12px 24px -18px #000;
  opacity: 0;
  animation: slip-in 180ms var(--ease-out) 620ms both;
}

.dice-slip__who {
  font-size: var(--text-2xs);
  font-weight: 500;
}

.dice-slip__total {
  font-family: var(--font-data);
  font-size: var(--text-xl);
  font-weight: 500;
  line-height: 1;
}

.dice-slip__expr {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  opacity: 0.7;
}

@keyframes board-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes token-in {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes slip-in {
  from {
    opacity: 0;
    transform: translateY(8px) rotate(-1deg);
  }
  to {
    opacity: 1;
    transform: translateY(0) rotate(-1deg);
  }
}

@media (max-width: 720px) {
  .hero-board__frame {
    grid-template-columns: minmax(0, 1fr);
  }

  .rail {
    border-top: 1px solid var(--line-strong);
    border-left: 0;
  }

  .rail__list {
    flex-direction: row;
  }

  .rail__item {
    flex: 1 1 0;
    min-width: 0;
    border-bottom: 0;
    border-left: 3px solid transparent;
  }

  .rail__item + .rail__item {
    border-left: 1px solid var(--line);
  }

  .rail__item--current {
    border-left-color: var(--manila);
  }

  .rail__foot {
    display: none;
  }

  .dice-slip {
    position: static;
    width: fit-content;
    margin: var(--s-4) 0 0 var(--s-4);
    transform: none;
    animation-name: slip-in-mobile;
  }
}

@keyframes slip-in-mobile {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
