<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { toast } from '../services/toast'
import { useSystemStore } from '../stores/systemStore'
import Icon from '../components/Icon.vue'
import HeroBoard from '../components/home/HeroBoard.vue'
import SystemDossier from '../components/home/SystemDossier.vue'
import JoinTableDialog from '../components/lobby/JoinTableDialog.vue'

const router = useRouter()
const systemStore = useSystemStore()
const { systems } = storeToRefs(systemStore)

const joinOpen = ref(false)

function openJoin() {
  joinOpen.value = true
}

function handleNeedAuth(code: string) {
  router.push({
    name: 'login',
    query: { redirect: `/tables?join=${encodeURIComponent(code)}` },
  })
}

function handleJoined(target: string) {
  toast.success('Você entrou na mesa.')
  router.push(target)
}

onMounted(() => {
  if (!systemStore.isLoaded) {
    systemStore.fetchAll().catch(() => {
      // A landing usa o conteúdo canônico dos quatro sistemas como fallback.
    })
  }
})
</script>

<template>
  <div class="home">
    <section class="landing-hero">
      <div class="landing-hero__inner">
        <div class="landing-copy">
          <p class="landing-copy__eyebrow">Mesa compartilhada: presencial e online</p>
          <h1>A mesma mesa, na sala ou na tela.</h1>
          <p class="landing-copy__lead">
            Crie a mesa, convide por link ou QR e jogue no navegador. Cada jogador usa o próprio
            celular, na sala ou de qualquer lugar; a TV é opcional, para quando a sala tiver uma.
          </p>
          <div class="landing-copy__actions">
            <RouterLink to="/register" class="btn btn-lg">Criar minha mesa</RouterLink>
            <button type="button" class="btn outline btn-lg" @click="openJoin">
              <Icon name="link" :size="16" />
              Entrar com código
            </button>
          </div>
          <dl class="landing-facts">
            <div>
              <dt>Até 8 jogadores</dt>
              <dd>por mesa, na sala ou cada um na própria tela</dd>
            </div>
            <div>
              <dt>Sem instalação</dt>
              <dd>abre no navegador do celular, do notebook ou da TV</dd>
            </div>
            <div>
              <dt>Um estado</dt>
              <dd>quem joga presencial e quem joga online veem a mesma revisão</dd>
            </div>
          </dl>
        </div>

        <div class="landing-visual">
          <p class="landing-visual__label">Mesa</p>
          <HeroBoard />
        </div>
      </div>
    </section>

    <section class="home-section steps-section" aria-labelledby="how-title">
      <header class="section-head">
        <div>
          <p class="section-kicker">Como a mesa funciona</p>
          <h2 id="how-title">Três passos, e a sessão está no ar.</h2>
        </div>
        <p class="section-note">
          A ordem importa: primeiro a mesa existe, depois o convite, depois a sessão — na sala ou
          online.
        </p>
      </header>

      <ol class="steps">
        <li class="step">
          <span class="step__num" aria-hidden="true">01</span>
          <div class="step__copy">
            <h3>Crie a mesa</h3>
            <p>
              Dê um nome e escolha o sistema. D&amp;D 5e já vem selecionado; OP2, OPSH e Cyberpunk
              RED mudam atributos, regras de movimento e rolagens.
            </p>
          </div>
          <div class="step__fragment" aria-hidden="true">
            <span class="fragment__label">Nova mesa</span>
            <span class="fragment__field">
              <span>Nome da mesa</span>
              <span class="mono">A Cripta do Rei</span>
            </span>
            <span class="fragment__field">
              <span>Sistema</span>
              <span>D&amp;D 5e</span>
            </span>
            <span class="fragment__button">Criar e abrir</span>
          </div>
        </li>

        <li class="step">
          <span class="step__num" aria-hidden="true">02</span>
          <div class="step__copy">
            <h3>Convide por link ou QR</h3>
            <p>
              Cada jogador entra pelo link no próprio navegador ou lê o QR da tela. O mesmo convite
              serve para quem está sentado ao lado e para quem joga de casa; quem chega atrasado não
              fica de fora.
            </p>
          </div>
          <div class="step__fragment" aria-hidden="true">
            <span class="fragment__label">Convite da mesa</span>
            <span class="fragment__code">K7F2-9Q</span>
            <span class="fragment__link">/play/68f2…?invite=K7F2-9Q</span>
            <span class="fragment__stamp">Copiado</span>
          </div>
        </li>

        <li class="step">
          <span class="step__num" aria-hidden="true">03</span>
          <div class="step__copy">
            <h3>Jogue no navegador</h3>
            <p>
              Cada jogador abre o celular para mover o token, consultar a ficha e rolar os dados.
              Na sala, a TV opcional mostra o tabuleiro para todos; online, cada um joga na própria
              tela com a mesma mesa.
            </p>
          </div>
          <div class="step__fragment step__fragment--rail" aria-hidden="true">
            <span class="fragment__label">Rodada 2</span>
            <span class="fragment__initiative fragment__initiative--current">
              <span>Ghoul</span>
              <span class="mono">18</span>
            </span>
            <span class="fragment__initiative">
              <span>Ana</span>
              <span class="mono">15</span>
            </span>
            <span class="fragment__initiative">
              <span>Kuro</span>
              <span class="mono">11</span>
            </span>
            <span class="fragment__dice">1d20 + 5 = 23</span>
          </div>
        </li>
      </ol>
    </section>

    <section class="home-section screens-section" aria-labelledby="screens-title">
      <header class="section-head">
        <div>
          <p class="section-kicker">Presencial, online ou híbrido</p>
          <h2 id="screens-title">O mesmo convite serve para a sala e para a tela.</h2>
        </div>
        <p class="section-note">
          A mesa e a revisão são as mesmas; o que muda é de onde cada um entra. A TV só entra se a
          sala tiver uma.
        </p>
      </header>

      <div class="screen-grid">
        <article class="screen-card screen-card--dm">
          <header>
            <h3>Mestre</h3>
            <code>/table/:id</code>
          </header>
          <p>Prepara a cena, conduz a iniciativa e responde ao grupo — na sala ou a distância.</p>
          <ul>
            <li>Painel de cena, iniciativa e convite.</li>
            <li>Tokens, fichas e grade no mesmo lugar.</li>
            <li>Convite por link ou QR para quem joga de fora.</li>
          </ul>
          <span class="screen-card__foot">Prepara e conduz</span>
        </article>

        <article class="screen-card screen-card--player">
          <header>
            <h3>Jogador</h3>
            <code>/play/:id</code>
          </header>
          <p>O celular é o controle, dentro da sala ou do outro lado da cidade.</p>
          <ul>
            <li>Ficha, dados, chat e movimento.</li>
            <li>Só o próprio token, e só no próprio turno.</li>
            <li>Entra por link ou QR, sem instalar.</li>
          </ul>
          <span class="screen-card__foot">Age no próprio turno</span>
        </article>

        <article class="screen-card screen-card--tv">
          <header>
            <h3>TV opcional</h3>
            <code>/display/:id</code>
          </header>
          <p>Opcional, para a sala: uma tela só de leitura, legível de longe.</p>
          <ul>
            <li>Tabuleiro, iniciativa e última rolagem.</li>
            <li>O dado ganha a tela por alguns segundos.</li>
            <li>Sem controles; quem joga online não precisa dela.</li>
          </ul>
          <span class="screen-card__foot">Opcional, para a sala</span>
        </article>
      </div>
    </section>

    <section class="home-section systems-section" aria-labelledby="systems-title">
      <header class="section-head">
        <div>
          <p class="section-kicker">Sistemas</p>
          <h2 id="systems-title">Um arquivo por sistema, a mesma mesa.</h2>
        </div>
        <p class="section-note">
          Os quatro sistemas do beta usam o mesmo tabuleiro, iniciativa e dados
          server-authoritative.
        </p>
      </header>
      <SystemDossier :systems="systems" />
    </section>

    <section class="home-section dice-section" aria-labelledby="dice-title">
      <div class="dice-moment">
        <div class="dice-moment__visual">
          <svg
            class="d20"
            viewBox="0 0 120 120"
            role="img"
            aria-label="Dado de vinte faces mostrando 18"
          >
            <polygon points="60,6 110,34 110,86 60,114 10,86 10,34" />
            <path d="M60 6 60 42 110 34" />
            <path d="M60 42 10 34" />
            <path d="M60 42 60 114" />
            <path d="M60 42 110 86" />
            <path d="M60 42 10 86" />
            <text x="60" y="76" text-anchor="middle" class="d20__value">18</text>
          </svg>
          <span class="dice-moment__die-label mono">d20</span>
        </div>

        <div class="dice-moment__copy">
          <p class="section-kicker">O momento do dado</p>
          <h2 id="dice-title">O dado interrompe a mesa uma vez — e todo mundo vê.</h2>
          <p>
            A rolagem é validada no servidor e vai para a mesa inteira: Mestre, jogadores e, se a
            sala tiver, a TV. O resultado fica no histórico, não no esquecimento.
          </p>
          <div class="dice-result">
            <span class="mono">1d20 + 5</span>
            <span aria-hidden="true">=</span>
            <strong>23</strong>
            <span class="dice-stamp">Registrado</span>
          </div>
          <p class="dice-moment__context">Ana, ataque contra CA 15</p>
        </div>
      </div>
    </section>

    <section class="closing" aria-labelledby="closing-title">
      <div>
        <p class="section-kicker">Próxima sessão</p>
        <h2 id="closing-title">Crie a mesa. Convide. Jogue de onde estiver.</h2>
        <p>
          Leva menos tempo do que explicar as regras da casa. A conta é a mesma para mestrar e
          jogar, na sala ou online.
        </p>
      </div>
      <div class="closing__actions">
        <RouterLink to="/register" class="btn btn-lg">Criar minha mesa</RouterLink>
        <button type="button" class="btn outline btn-lg" @click="openJoin">
          Entrar com código
        </button>
      </div>
    </section>

    <footer class="landing-footer">
      <div class="landing-footer__brand">
        <div class="landing-footer__brand-row">
          <img
            class="landing-footer__seal"
            src="/logotof.png"
            alt="Tavern of Disaster"
            width="88"
            height="88"
            loading="lazy"
            decoding="async"
          />
          <p class="landing-footer__wordmark">Tavern <em>of</em> Disaster</p>
        </div>
        <p>VTT para jogar na sala ou online: uma mesa, um estado, cada jogador no próprio aparelho.</p>
      </div>
      <dl class="landing-footer__facts">
        <div>
          <dt>Sistemas</dt>
          <dd>D&amp;D 5e, OP2, OPSH e Cyberpunk RED</dd>
        </div>
        <div>
          <dt>Onde jogar</dt>
          <dd>Presencial, online ou híbrido, com TV opcional</dd>
        </div>
        <div>
          <dt>Dados</dt>
          <dd>rolagens e estado validados no servidor</dd>
        </div>
      </dl>
      <nav class="landing-footer__nav" aria-label="Rodapé">
        <RouterLink to="/systems">Sistemas</RouterLink>
        <RouterLink to="/login">Entrar</RouterLink>
        <RouterLink to="/register">Criar conta</RouterLink>
      </nav>
      <p class="landing-footer__note">
        Beta aberto. As fichas cobrem D&amp;D 5e, Ordem Paranormal e Cyberpunk RED.
      </p>
    </footer>

    <JoinTableDialog
      v-model:open="joinOpen"
      :authenticated="false"
      @joined="handleJoined"
      @need-auth="handleNeedAuth"
    />
  </div>
</template>

<style scoped>
.home {
  width: 100%;
}

/* --- Landing ------------------------------------------------------------ */
.landing-hero {
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  padding: clamp(var(--s-7), 5vw, var(--s-10)) var(--s-6) clamp(var(--s-8), 5vw, var(--s-10));
}

.landing-hero__inner {
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(0, 0.98fr);
  gap: clamp(var(--s-7), 5vw, var(--s-10));
  align-items: center;
}

.landing-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-5);
}

.landing-copy__eyebrow {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.landing-copy h1 {
  max-width: 22ch;
  margin: 0;
  font-size: clamp(2.35rem, 1.15rem + 3.6vw, 3.5rem);
  line-height: 1.03;
  letter-spacing: -0.02em;
}

.landing-copy__lead {
  max-width: 52ch;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-lg);
  line-height: 1.55;
}

.landing-copy__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-2);
}

.btn-lg {
  min-height: 48px;
  padding-inline: var(--s-6);
}

.landing-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
  margin: var(--s-5) 0 0;
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
}

.landing-facts > div {
  padding-right: var(--s-4);
}

.landing-facts > div + div {
  padding-left: var(--s-4);
  border-left: 1px solid var(--line);
}

.landing-facts dt {
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 500;
}

.landing-facts dd {
  margin: var(--s-1) 0 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: 1.45;
}

.landing-visual {
  min-width: 0;
  padding-bottom: var(--s-5);
}

.landing-visual__label {
  margin: 0 0 var(--s-3);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

/* --- Sections ----------------------------------------------------------- */
.home-section {
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  padding: clamp(var(--s-8), 6vw, var(--s-10)) var(--s-6);
  border-top: 1px solid var(--line);
}

.section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-5) var(--s-8);
  margin-bottom: var(--s-7);
}

.section-head > div {
  max-width: 46ch;
}

.section-head h2 {
  margin: var(--s-2) 0 0;
  font-size: clamp(1.7rem, 1.2rem + 1.6vw, 2.35rem);
  line-height: 1.12;
}

.section-kicker {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.section-note {
  max-width: 34ch;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.6;
}

/* Steps */
.steps {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line-strong);
}

.step {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) minmax(220px, 320px);
  gap: var(--s-6);
  align-items: start;
  padding: var(--s-6) 0;
  border-bottom: 1px solid var(--line);
}

.step__num {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xl);
  line-height: 1;
}

.step__copy h3 {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  font-weight: 600;
}

.step__copy p {
  max-width: 54ch;
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: 1.6;
}

.step__fragment {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
  padding: var(--s-3) var(--s-4) var(--s-4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--panel);
}

.fragment__label {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.fragment__field {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-2) 0;
  border-bottom: 1px solid var(--line);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.fragment__field > span:last-child {
  color: var(--text);
  text-align: right;
}

.fragment__button {
  display: block;
  margin-top: var(--s-2);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--radius-xs);
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--text-sm);
  font-weight: 500;
  text-align: center;
}

.fragment__code {
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-lg);
  letter-spacing: 0.1em;
}

.fragment__link {
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fragment__stamp {
  align-self: flex-end;
  padding: 1px 6px;
  transform: rotate(-2deg);
  border: 1px solid var(--manila);
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.step__fragment--rail {
  gap: 0;
  padding-bottom: 0;
}

.fragment__initiative {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-2) 0;
  border-bottom: 1px solid var(--line);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.fragment__initiative--current {
  padding-left: var(--s-2);
  border-left: 2px solid var(--manila);
  color: var(--text);
}

.fragment__dice {
  padding: var(--s-3) 0;
  color: var(--success-ink);
  font-family: var(--font-data);
  font-size: var(--text-xs);
}

/* Modes and roles */
.screen-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-5);
}

.screen-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  min-width: 0;
  padding: var(--s-5);
  border: 1px solid var(--line);
  border-top: 2px solid var(--line-strong);
  border-radius: var(--radius-xs);
  background: var(--panel);
}

.screen-card--dm {
  border-top-color: var(--manila);
}

.screen-card--player {
  border-top-color: var(--accent-ink);
}

.screen-card--tv {
  border-top-color: var(--success-ink);
  background: var(--raised);
}

.screen-card header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-2);
}

.screen-card h3 {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  font-weight: 600;
}

.screen-card code {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.screen-card p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.55;
}

.screen-card ul {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: var(--s-2) 0 0;
  padding: 0;
  list-style: none;
  color: var(--text);
  font-size: var(--text-sm);
}

.screen-card li {
  position: relative;
  padding-left: var(--s-4);
  line-height: 1.5;
}

.screen-card li::before {
  content: '';
  position: absolute;
  top: 0.62em;
  left: 0;
  inline-size: 5px;
  block-size: 1px;
  background: var(--line-strong);
}

.screen-card__foot {
  margin-top: auto;
  padding-top: var(--s-3);
  border-top: 1px solid var(--line);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

/* Dice moment */
.dice-section {
  padding-top: 0;
  border-top: 0;
}

.dice-moment {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  gap: clamp(var(--s-6), 5vw, var(--s-9));
  align-items: center;
  padding: clamp(var(--s-6), 4vw, var(--s-8));
  border-top: 1px solid var(--line-strong);
  border-bottom: 1px solid var(--line-strong);
  background: var(--panel);
}

.dice-moment__visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
}

.d20 {
  width: min(220px, 100%);
  animation: dice-settle 480ms var(--ease-settle) 120ms both;
}

.d20 polygon {
  fill: none;
  stroke: var(--line-strong);
  stroke-width: 2;
}

.d20 path {
  fill: none;
  stroke: var(--line);
  stroke-width: 1;
}

.d20__value {
  fill: var(--text);
  font-family: var(--font-data);
  font-size: 34px;
  font-weight: 500;
}

.dice-moment__die-label {
  color: var(--text-muted);
  font-size: var(--text-2xs);
}

.dice-moment__copy h2 {
  max-width: 26ch;
  margin: var(--s-2) 0 0;
  font-size: clamp(1.6rem, 1.2rem + 1.2vw, 2.1rem);
  line-height: 1.15;
}

.dice-moment__copy p {
  max-width: 58ch;
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: 1.6;
}

.dice-result {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-3);
  margin-top: var(--s-5);
  color: var(--text-muted);
}

.dice-result strong {
  color: var(--text);
  font-family: var(--font-data);
  font-size: clamp(2.5rem, 1.8rem + 2vw, 3.75rem);
  font-weight: 500;
  line-height: 1;
}

.dice-stamp {
  padding: 2px 8px;
  transform: rotate(-3deg);
  border: 2px solid var(--manila);
  color: var(--manila);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.dice-moment__context {
  font-family: var(--font-data);
  font-size: var(--text-2xs) !important;
}

@keyframes dice-settle {
  from {
    opacity: 0;
    transform: scale(0.9) rotate(-6deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

/* Closing + footer */
.closing {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-7);
  align-items: end;
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  padding: clamp(var(--s-8), 6vw, var(--s-10)) var(--s-6);
}

.closing h2 {
  max-width: 22ch;
  margin: var(--s-2) 0 0;
  font-size: clamp(1.9rem, 1.3rem + 2vw, 2.8rem);
  line-height: 1.08;
}

.closing p {
  max-width: 52ch;
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: 1.6;
}

.closing__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
}

.landing-footer {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr) auto;
  gap: var(--s-7);
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  padding: var(--s-7) var(--s-6) var(--s-8);
  border-top: 1px solid var(--line-strong);
}

.landing-footer__brand-row {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  min-width: 0;
}

.landing-footer__seal {
  flex: none;
  inline-size: 88px;
  block-size: 88px;
  object-fit: contain;
}

.landing-footer__wordmark {
  margin: 0;
  color: var(--text);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 600;
}

.landing-footer__wordmark em {
  color: var(--text-muted);
  font-size: 0.72em;
}

.landing-footer__brand p:last-child {
  max-width: 34ch;
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.55;
}

.landing-footer__facts {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  margin: 0;
}

.landing-footer__facts dt {
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.landing-footer__facts dd {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.landing-footer__nav {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-1);
  font-size: var(--text-sm);
}

.landing-footer__nav a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding-inline: var(--s-2);
  margin-inline: calc(var(--s-2) * -1);
}

.landing-footer__note {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

/* Alvos de 44 px em telas de toque (tablet incluso, não só celular). */
@media (max-width: 900px) {
  .closing__actions .btn {
    min-height: 44px;
  }
}

@media (max-width: 1000px) {
  .landing-hero__inner {
    grid-template-columns: minmax(0, 1fr);
  }

  .landing-copy h1 {
    max-width: 26ch;
  }

  .landing-visual {
    max-width: 680px;
  }

  .step {
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .step__fragment {
    grid-column: 2;
    max-width: 420px;
  }
}

@media (max-width: 860px) {
  .landing-hero,
  .home-section,
  .closing,
  .landing-footer {
    padding-inline: var(--s-5);
  }

  .screen-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .dice-moment {
    grid-template-columns: minmax(0, 1fr);
  }

  .dice-moment__visual {
    flex-direction: row;
    justify-content: flex-start;
  }

  .d20 {
    width: 150px;
  }

  .closing {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .landing-footer {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .landing-footer__nav {
    grid-column: 1 / -1;
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--s-4);
  }
}

@media (max-width: 640px) {
  .landing-copy h1 {
    font-size: clamp(2rem, 1.3rem + 4vw, 2.6rem);
  }

  .landing-copy__lead {
    font-size: var(--text-base);
  }

  .landing-copy__actions,
  .closing__actions {
    width: 100%;
    flex-direction: column;
  }

  .landing-copy__actions .btn,
  .closing__actions .btn {
    width: 100%;
  }

  .landing-facts {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-3);
  }

  .landing-facts > div {
    padding-right: 0;
  }

  .landing-facts > div + div {
    padding-top: var(--s-3);
    padding-left: 0;
    border-top: 1px solid var(--line);
    border-left: 0;
  }

  .step {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-3);
    padding: var(--s-5) 0;
  }

  .step__fragment {
    grid-column: auto;
    max-width: none;
  }

  .section-head {
    align-items: flex-start;
  }

  .landing-footer {
    grid-template-columns: minmax(0, 1fr);
  }

  .landing-footer__nav {
    grid-column: auto;
  }
}
</style>
