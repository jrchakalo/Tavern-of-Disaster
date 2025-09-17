<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { currentUser } from '../services/authService';
import { ref, computed } from 'vue';

import Icon from '../components/Icon.vue';
// Simplified feature list (icons mapped to existing stroke set where possible)
const features = [
  { icon: 'square', title: 'Grid & Medições', desc: 'Movimento e alcance visíveis em tempo real.' },
  { icon: 'beam', title: 'Formas Táticas', desc: 'Cone, raio, linha, círculo e mais para efeitos.' },
  { icon: 'aura', title: 'Auras Persistentes', desc: 'Gerencie zonas e condições contínuas.' },
  { icon: 'wrench', title: 'Ferramentas do Mestre', desc: 'Controle iniciativa, ordem e ajustes rápidos.' },
  { icon: 'users', title: 'Para o Grupo', desc: 'Interface minimalista focada na sessão.' },
  { icon: 'pin', title: 'Clareza Visual', desc: 'Fácil de ler, sem distrações — só jogo.' }
];

const isLoggedIn = computed(() => Boolean(currentUser?.value?.id || (currentUser as any)?.id));

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
              <div class="mini-grid">
                <div v-for="n in 36" :key="n" class="cell" />
                <div class="token t1" />
                <div class="token t2" />
                <div class="measure" />
              </div>
              <p class="caption text-muted">Visual limpo para combate tático.</p>
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
      <footer class="site-footer fade-in-up" style="animation-delay:.3s">
        <div class="container">© {{ new Date().getFullYear() }} Tavern of Disaster</div>
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
    </div>
  </div>
</template>

<style scoped>
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
.preview-card { padding:16px 18px 20px; border:1px solid var(--color-border); border-radius:16px; background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); width:320px; box-shadow:var(--elev-3); display:flex; flex-direction:column; gap:12px; }
.mini-grid { position:relative; display:grid; grid-template-columns:repeat(6,1fr); grid-template-rows:repeat(6,1fr); aspect-ratio:1/1; gap:2px; }
.mini-grid .cell { background:var(--color-surface-alt); border:1px solid var(--color-border); border-radius:2px; }
.mini-grid .token { position:absolute; width:calc(33% - 4px); height:calc(33% - 4px); border-radius:6px; background:var(--gradient-accent); top:8%; left:10%; box-shadow:0 2px 6px rgba(0 0 0 / .4); }
.mini-grid .token.t2 { top:54%; left:55%; background:var(--color-success); }
.mini-grid .measure { position:absolute; left:10%; top:10%; width:60%; height:4px; background:var(--color-accent); transform:rotate(18deg); transform-origin:left center; box-shadow:0 0 0 1px var(--color-border-strong); }
.caption { font-size:.7rem; text-align:center; }
.features-band { padding:0 1rem 3rem; max-width:1180px; margin:0 auto; width:100%; }
.feature-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:var(--space-4); }
.feature-card { padding:16px 18px 18px; border:1px solid var(--color-border); border-radius:12px; display:flex; flex-direction:column; gap:4px; }
.feature-icon { width:42px; height:42px; display:flex; align-items:center; justify-content:center; border-radius:10px; background:var(--color-surface-alt); color:var(--color-accent); box-shadow:inset 0 0 0 1px var(--color-border); }
.feature-card:hover { background:var(--color-surface-alt); }
.site-footer { padding:32px 1rem 48px; text-align:center; font-size:.75rem; color:var(--color-text-muted); }

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