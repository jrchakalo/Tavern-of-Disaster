<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { currentUser } from '../services/authService';
import { ref, computed, onMounted, nextTick, watch } from 'vue';

import Icon from '../components/Icon.vue';
// Simplified feature list (icons mapped to existing stroke set where possible)
const features = [
  { icon: 'square', title: 'Grid & Medições', desc: 'Movimento e alcance visíveis em tempo real.' },
  { icon: 'beam', title: 'Formas Táticas', desc: 'Cone, raio, linha, círculo e mais para efeitos.' },
  { icon: 'aura', title: 'Auras Persistentes', desc: 'Gerencie zonas e condições contínuas.' },
  { icon: 'wrench', title: 'Ferramentas do Mestre', desc: 'Controle iniciativa, ordem e ajustes rápidos.' },
  { icon: 'users', title: 'Para o Grupo', desc: 'Interface minimalista focada na sessão.' },
];

const isLoggedIn = computed(() => Boolean(currentUser?.value?.id || (currentUser as any)?.id));

// Refs para animação da linha entre tokens
const gridRef = ref<HTMLDivElement | null>(null);
const allyRef = ref<HTMLDivElement | null>(null);
const enemyRef = ref<HTMLDivElement | null>(null);
const selectionRef = ref<HTMLDivElement | null>(null);
const linePath = ref('');
const animActive = ref(false); // controla desenho da linha + movimento aliado
const enemyPhase = ref(false); // reação inimigo
const selectionPhase = ref(false); // seleção aparece somente ao final
let cycleTimers: number[] = [];
const pathRef = ref<SVGPathElement | null>(null);

function computeLine() {
  if (!gridRef.value || !allyRef.value || !enemyRef.value) return;
  const gridBox = gridRef.value.getBoundingClientRect();
  const a = allyRef.value.getBoundingClientRect();
  const e = enemyRef.value.getBoundingClientRect();
  const ax = a.left + a.width / 2 - gridBox.left;
  const ay = a.top + a.height / 2 - gridBox.top;
  const ex = e.left + e.width / 2 - gridBox.left;
  const ey = e.top + e.height / 2 - gridBox.top;
  linePath.value = `M ${ax} ${ay} L ${ex} ${ey}`;
  nextTick(() => {
    if (pathRef.value) {
      const len = pathRef.value.getTotalLength();
      pathRef.value.style.setProperty('--len', String(len));
    }
  });
}

const LINE_DURATION = 1800; // ms linha mais rápida
const SELECTION_DURATION = 2500; // ms rotação da seleção
const GAP_BETWEEN = 400; // pequena pausa antes de reiniciar

function clearCycleTimers() {
  cycleTimers.forEach(id => clearTimeout(id));
  cycleTimers = [];
}

function runCycle() {
  clearCycleTimers();
  // reset estados
  animActive.value = false;
  enemyPhase.value = false;
  selectionPhase.value = false;
  // forçar reflow removendo classes um frame antes
  requestAnimationFrame(() => {
    computeLine();
    animActive.value = true; // inicia desenho linha + aliado
    // inimigo reage antes de terminar totalmente (80% do traçado)
    cycleTimers.push(window.setTimeout(() => {
      enemyPhase.value = true;
    }, Math.round(LINE_DURATION * 0.8)));
    // seleção e efeitos finais quando linha termina
    cycleTimers.push(window.setTimeout(() => {
      selectionPhase.value = true;
    }, LINE_DURATION));
    // reinício após seleção
    cycleTimers.push(window.setTimeout(() => {
      runCycle();
    }, LINE_DURATION + SELECTION_DURATION + GAP_BETWEEN));
  });
}

onMounted(() => {
  nextTick(() => {
    computeLine();
    runCycle();
    window.addEventListener('resize', computeLine);
  });
});

import { onBeforeUnmount } from 'vue';
onBeforeUnmount(() => {
  window.removeEventListener('resize', computeLine);
  clearCycleTimers();
});

</script>

<template>
  <div class="home-wrapper">
    <!-- Logged OUT landing -->
    <div v-if="!isLoggedIn" class="landing">
      <section class="hero fade-in-up">
        <div class="hero-inner">
          <div class="hero-copy">
            <img src="/logotof.png" alt="Logo" class="site-logo" width="140" height="140" />
            <h1 class="brand">Tavern of Disaster</h1>
            <p class="lead">Um tabletop virtual enxuto para jogar rápido com seus amigos. Mova tokens, meça efeitos, acompanhe iniciativa e mantenha a história fluindo.</p>
            <ul class="value-points">
              <li>
                <Icon name="select" size="18" /> Simples de usar — foco no jogo
              </li>
              <li>
                <Icon name="beam" size="18" /> Ferramentas táticas visuais
              </li>
              <li>
                <Icon name="users" size="18" /> Perfeito para campanhas casuais
              </li>
            </ul>
            <div class="hero-actions">
              <RouterLink to="/register" class="btn">Começar Agora</RouterLink>
              <RouterLink to="/login" class="btn outline">Entrar</RouterLink>
            </div>
          </div>
          <div class="hero-visual">
            <div class="preview-card surface elev">
              <div class="mini-grid" ref="gridRef">
                <div v-for="n in 36" :key="n" class="cell"></div>

                <!-- Overlay SVG para linha -->
                  <svg class="attack-overlay" :class="{ active: animActive }" v-if="linePath" :width="gridRef?.offsetWidth || 0" :height="gridRef?.offsetHeight || 0" :viewBox="'0 0 ' + gridRef!.clientWidth + ' ' + gridRef!.clientHeight">
                    <path ref="pathRef" class="attack-line" :d="linePath"/>
                </svg>

                <!-- Tokens -->
                <div ref="allyRef" class="token ally" :class="{ moveStart: animActive }"></div>
                <div ref="enemyRef" class="token enemy" :class="{ moveEnd: enemyPhase }"></div>

                <!-- Seleção sobre inimigo -->
                <div ref="selectionRef" class="selection" :class="{ appear: selectionPhase }"></div>
              </div>
              <p class="caption text-muted">Prepare-se para o combate!</p>
            </div>
          </div>
        </div>
      </section>
      <section class="features-band fade-in-up" style="animation-delay:.15s">
        <div class="feature-grid">
          <div v-for="f in features" :key="f.title" class="surface feature-card hoverable">
            <div class="feature-icon"><Icon :name="f.icon" size="28" /></div>
            <h3>{{ f.title }}</h3>
            <p class="text-muted" style="margin-top:-4px">{{ f.desc }}</p>
          </div>
        </div>
      </section>
      <footer class="site-footer fade-in-up dark" style="animation-delay:.3s">
        <div class="container">© 2025 Tavern of Disaster</div>
      </footer>
    </div>

    <!-- Logged IN dashboard -->
    <div v-else class="dashboard fade-in-up">
      <section class="dashboard-header">
        <div class="dash-top">
          <div class="dash-greeting">
            <div class="dash-logo-wrap">
              <img src="/logotof.png" alt="Logo" class="site-logo small" width="72" height="72" />
            </div>
            <h1 class="mb-0">Bem-vindo, {{ (currentUser as any)?.username || 'Aventureiro' }}!</h1>
            <p class="text-muted" style="margin-top:4px">Continue de onde parou ou crie uma nova mesa.</p>
          </div>
          <div class="quick-actions">
            <RouterLink to="/tables" class="btn">Minhas Mesas</RouterLink>
            <RouterLink to="/tables" class="btn outline">Criar / Entrar</RouterLink>
          </div>
        </div>
      </section>
      <section class="dashboard-panels">
        <div class="panel surface">
          <h3>Atalhos</h3>
          <ul class="shortcut-list">
            <li><RouterLink to="/tables">Ver todas as mesas</RouterLink></li>
            <li><RouterLink to="/tables">Criar nova mesa</RouterLink></li>
            <li><RouterLink to="/tables">Entrar com código</RouterLink></li>
          </ul>
        </div>
        <div class="panel surface">
          <h3>Recursos Chave</h3>
          <ul class="mini-features">
            <li v-for="f in features.slice(0,4)" :key="f.title"><Icon :name="f.icon" size="16" /> {{ f.title }}</li>
          </ul>
        </div>
      </section>
      <footer>
        <div class="container">© 2025 Tavern of Disaster</div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.home-wrapper {
  min-height:100vh;
  display:flex;
  flex-direction:column;
}
.home-wrapper { width:100%; }
.landing { display:flex; flex-direction:column; gap:var(--space-8); }
.hero { padding: clamp(2rem,5vw,4rem) 1rem 0; }
.hero-inner { display:grid; grid-template-columns: repeat(auto-fit,minmax(300px,1fr)); align-items:center; gap:clamp(2rem,4vw,4rem); max-width:1180px; margin:0 auto; width:100%; }
.hero-copy { display:flex; flex-direction:column; gap:var(--space-4); align-items:center; text-align:center; }
.brand { font-family: var(--font-display); letter-spacing:1px; font-size: clamp(2.4rem,5vw,3.4rem); margin:0; background:var(--gradient-accent); -webkit-background-clip:text; background-clip:text; color:transparent; }
.site-logo { filter:drop-shadow(0 4px 10px rgba(0 0 0 / .45)); animation: floaty 6s ease-in-out infinite; }
.site-logo.small { animation:none; filter:drop-shadow(0 2px 6px rgba(0 0 0 / .4)); }
.lead { font-size:1.05rem; line-height:1.5; max-width:54ch; }
.value-points { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; font-size:.9rem; }
.value-points li { display:flex; align-items:center; gap:8px; color:var(--color-text-muted); }
.hero-actions { display:flex; gap:var(--space-3); flex-wrap:wrap; margin-top:4px; }
.hero-visual { display:flex; justify-content:center; }
.preview-card {
  padding:16px 18px 20px;
  border:1px solid var(--color-border);
  border-radius:16px;
  background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt));
  width:340px;
  box-shadow:var(--elev-3);
  display:flex;
  flex-direction:column;
  gap:12px;
}
.mini-grid {
  position:relative;
  display:grid;
  grid-template-columns:repeat(6,1fr);
  grid-template-rows:repeat(6,1fr);
  aspect-ratio:1/1;
  gap:2px;
}
.attack-overlay { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.attack-line { 
  stroke:#ff3366; 
  stroke-width:4px; 
  stroke-linecap:round; 
  fill:none; 
  stroke-dasharray: var(--len, 0); 
  stroke-dashoffset: var(--len, 0); 
  filter:drop-shadow(0 0 6px rgba(255 51 102 / .85));
  opacity:0;
  transition:opacity .25s ease;
}
.attack-overlay.active .attack-line { animation: drawLine 1.8s ease forwards; opacity:1; }
.mini-grid .cell {
  background:var(--color-surface);
  border:1px solid var(--color-border-strong);
  border-radius:2px;
}
.mini-grid .token {
  position:absolute;
  width:calc(100% / 6 - 4px);
  height:calc(100% / 6 - 4px);
  border-radius:50%;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:.6rem;
  font-weight:bold;
  color:white;
  box-shadow:0 3px 8px rgba(0 0 0 / .5);
}
.mini-grid .token.ally {
  grid-column:2; grid-row:2;
  top:calc(100% / 4.9 * 1 + 2px);
  left:calc(100% / 4.8 * 1 + 2px);
  background:var(--color-accent);
  border:2px solid white;
}
.mini-grid .token.enemy {
  top:calc(100% / 6 * 4 + 2px);
  left:calc(100% / 6 * 4 + 2px);
  background:var(--color-danger);
  border:2px solid white;
}
.mini-grid .token.ally.moveStart { animation: allyNudge 1.1s ease forwards; }
.mini-grid .token.enemy.moveEnd { animation: enemyReact .6s ease forwards; }
.mini-grid .selection {
  position:absolute;
  top:calc(100% / 6 * 4 + 2px - 6px);
  left:calc(100% / 6 * 4 + 2px - 6px);
  width:calc(100% / 6 + 8px);
  height:calc(100% / 6 + 8px);
  border:2px dashed var(--color-accent);
  border-radius:50%;
  background:rgba(0,0,0,.05);
  pointer-events:none;
  opacity:0;
  transform:scale(.55) rotate(0deg);
  transition:opacity .4s ease, transform .6s cubic-bezier(.22,1.4,.36,1);
}
.mini-grid .selection.appear { opacity:1; transform:scale(1) rotate(180deg); animation: selectionSpin 2.5s linear forwards; }

@keyframes drawLine {
  0% { stroke-dashoffset: var(--len); opacity:0; }
  12% { stroke-dashoffset: var(--len); opacity:1; }
  100% { stroke-dashoffset: 0; opacity:1; }
}
@keyframes allyNudge {
  0% { transform:translate(0,0) scale(1); }
  30% { transform:translate(5px,-5px) scale(1.12); }
  55% { transform:translate(2px,-2px) scale(1.05); }
  100% { transform:translate(0,0) scale(1); }
}
@keyframes enemyReact {
  0% { transform:scale(1); }
  55% { transform:scale(1.18); box-shadow:0 5px 14px rgba(0 0 0 / .65); }
  100% { transform:scale(1); }
}
@keyframes selectionSpin {
  0% { opacity:0; transform:scale(.4) rotate(0deg); }
  10% { opacity:1; transform:scale(1) rotate(60deg); }
  40% { opacity:1; transform:scale(1) rotate(160deg); }
  70% { opacity:1; transform:scale(1) rotate(260deg); }
  90% { opacity:0.25; transform:scale(.85) rotate(320deg); }
  100% { opacity:0; transform:scale(.4) rotate(360deg); }
}
.caption { font-size:.75rem; text-align:center; }
.features-band { padding:0 1rem 3rem; max-width:1180px; margin:0 auto; width:100%; }
.feature-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:var(--space-4); }
.feature-card { padding:16px 18px 18px; border:1px solid var(--color-border); border-radius:12px; display:flex; flex-direction:column; gap:4px; }
.feature-icon { width:42px; height:42px; display:flex; align-items:center; justify-content:center; border-radius:10px; background:var(--color-surface-alt); color:var(--color-accent); box-shadow:inset 0 0 0 1px var(--color-border); }
.feature-card:hover { background:var(--color-surface-alt); }

/* Dashboard */
.dashboard { max-width:1180px; margin:0 auto; padding: clamp(2rem,4vw,3rem) 1rem 3rem; display:flex; flex-direction:column; gap:var(--space-6); }
.dash-top { display:flex; flex-wrap:wrap; justify-content:space-between; gap:var(--space-4); align-items:flex-end; }
.quick-actions { display:flex; gap:var(--space-3); flex-wrap:wrap; }
.dashboard-panels { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:var(--space-4); }
.panel { padding:18px 20px 22px; border:1px solid var(--color-border); border-radius:14px; background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); box-shadow:var(--elev-2); display:flex; flex-direction:column; gap:12px; }
.panel:hover { transform:translateY(-2px); box-shadow:var(--elev-3); transition:transform .25s, box-shadow .25s; }
.shortcut-list, .mini-features { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; font-size:.85rem; }
.mini-features li { display:flex; align-items:center; gap:6px; color:var(--color-text-muted); }

@media (max-width: 760px) {
  .hero-inner { grid-template-columns:1fr; }
  .dash-top { flex-direction:column; align-items:flex-start; }
  .preview-card { width:100%; }
}
</style>