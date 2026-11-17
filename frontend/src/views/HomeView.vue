<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { authToken, currentUser } from '../services/authService'
import { toast } from '../services/toast'
import { fetchMyTables, createTable, setTableSystem } from '../services/tableService'
import { isTableDm, resolveTableEntry } from '../services/tableEntry'
import { systemDisplayName } from '../services/systemLabels'
import { useSystemStore } from '../stores/systemStore'
import { useUserStore } from '../stores/userStore'
import Icon from '../components/Icon.vue'
import HeroBoard from '../components/home/HeroBoard.vue'
import SystemDossier from '../components/home/SystemDossier.vue'
import EmptyState from '../components/ui/EmptyState.vue'
import TableRow from '../components/lobby/TableRow.vue'
import CreateTableDialog from '../components/lobby/CreateTableDialog.vue'
import JoinTableDialog from '../components/lobby/JoinTableDialog.vue'
import TvLinkDialog from '../components/lobby/TvLinkDialog.vue'
import type { ITable } from '../types'

const router = useRouter()
const systemStore = useSystemStore()
const userStore = useUserStore()
const { systems } = storeToRefs(systemStore)
const { profile } = storeToRefs(userStore)

const isLoggedIn = computed(() => Boolean(authToken.value))
const userId = computed(() => currentUser.value?.id ?? null)

// --- Landing -------------------------------------------------------------
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

// --- Lobby ---------------------------------------------------------------
const tables = ref<ITable[]>([])
const loading = ref(false)
const loadError = ref('')
const createOpen = ref(false)
const createSubmitting = ref(false)
const createError = ref('')
const tvOpen = ref(false)
const tvTable = ref<ITable | null>(null)

const featured = computed(() => tables.value[0] ?? null)
const otherTables = computed(() => tables.value.slice(1))
const tvCanManage = computed(() => isTableDm(tvTable.value, userId.value))
const preferredSystemKey = computed(
  () => systemStore.getById(profile.value?.preferredSystemId)?.key ?? 'dnd5e',
)

function entryFor(table: ITable): string {
  return resolveTableEntry(table, userId.value) ?? '/tables'
}

function entryLabel(table: ITable): string {
  return isTableDm(table, userId.value) ? 'Mestrar' : 'Jogar'
}

function systemLabel(table: ITable): string {
  const system = systemStore.getById(table.systemId ?? null)
  if (system) return systemDisplayName(system)
  return table.systemName ?? table.systemKey ?? 'Sem sistema'
}

function statusLabel(table: ITable): string {
  const labels: Record<string, string> = {
    PREPARING: 'Preparando',
    LIVE: 'Ao vivo',
    PAUSED: 'Pausado',
    ENDED: 'Encerrado',
  }
  return labels[table.status] ?? 'Preparando'
}

function playerLabel(table: ITable): string {
  const count = table.players?.length ?? 0
  return count === 1 ? '1 jogador' : `${count} jogadores`
}

async function loadLobby(options: { silent?: boolean } = {}) {
  if (!authToken.value) return
  if (!options.silent) loading.value = true
  loadError.value = ''
  try {
    tables.value = await fetchMyTables()
  } catch (err) {
    loadError.value =
      err instanceof TypeError
        ? 'Sem conexão com o servidor. Verifique a rede e tente de novo.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível carregar suas mesas.'
  } finally {
    loading.value = false
  }
}

async function loadProfile() {
  if (!authToken.value || profile.value) return
  try {
    await userStore.fetchProfile()
  } catch {
    // Sem preferência: a criação abre em D&D 5e.
  }
}

function openCreate() {
  createError.value = ''
  createOpen.value = true
}

async function handleCreate(payload: { name: string; systemId: string; systemKey: string }) {
  if (createSubmitting.value) return
  createSubmitting.value = true
  createError.value = ''
  try {
    const table = await createTable(payload.name)
    if (payload.systemId) {
      try {
        await setTableSystem(table._id, payload.systemId)
        table.systemId = payload.systemId
      } catch (error) {
        toast.warning(
          error instanceof Error
            ? `Mesa criada, mas o sistema não foi aplicado: ${error.message}`
            : 'Mesa criada, mas o sistema não foi aplicado.',
        )
      }
    }
    toast.success(`Mesa “${table.name}” criada.`)
    createOpen.value = false
    await loadLobby({ silent: true })
    router.push(resolveTableEntry(table, userId.value) ?? '/tables')
  } catch (err) {
    createError.value =
      err instanceof TypeError
        ? 'Sem conexão com o servidor. Tente de novo.'
        : err instanceof Error
          ? err.message
          : 'Não foi possível criar a mesa.'
  } finally {
    createSubmitting.value = false
  }
}

function openTv(table: ITable) {
  tvTable.value = table
  tvOpen.value = true
}

onMounted(() => {
  if (!systemStore.isLoaded) {
    systemStore.fetchAll().catch(() => {
      // A landing usa o conteúdo canônico dos quatro sistemas como fallback.
    })
  }
  if (isLoggedIn.value) {
    void loadProfile()
    void loadLobby()
  }
})

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    void loadProfile()
    void loadLobby()
  }
})
</script>

<template>
  <div class="home">
    <template v-if="!isLoggedIn">
      <section class="landing-hero">
        <div class="landing-hero__inner">
          <div class="landing-copy">
            <p class="landing-copy__eyebrow">MESA COMPARTILHADA · TV + CELULARES</p>
            <h1>A taverna é a TV. O controle está na mão de cada jogador.</h1>
            <p class="landing-copy__lead">
              Crie a mesa, mostre o código e comece a sessão. Sem instalar nada — presencial ou
              online.
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
                <dt>8 jogadores</dt>
                <dd>por mesa, cada um no próprio celular</dd>
              </div>
              <div>
                <dt>Zero instalação</dt>
                <dd>abre no navegador da TV e do celular</dd>
              </div>
              <div>
                <dt>Um estado</dt>
                <dd>a mesa inteira vê a mesma revisão</dd>
              </div>
            </dl>
          </div>

          <div class="landing-visual">
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
            A ordem importa: primeiro a mesa existe, depois o convite, depois a sessão.
          </p>
        </header>

        <ol class="steps">
          <li class="step">
            <span class="step__num" aria-hidden="true">01</span>
            <div class="step__copy">
              <h3>Crie a mesa</h3>
              <p>
                Dê um nome e escolha o sistema. D&D 5e já vem selecionado; OP2, OPSH e Cyberpunk RED
                mudam atributos, regras de movimento e rolagens.
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
              <h3>Mostre o código ou o QR</h3>
              <p>
                Cada jogador entra pelo link no celular. O mesmo convite funciona na mesa presencial
                e na sessão online; quem chega atrasado não fica de fora.
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
              <h3>Jogue na TV e nos celulares</h3>
              <p>
                A TV mostra o tabuleiro, a iniciativa e a última rolagem. Cada jogador move o
                próprio token, consulta a ficha e rola os dados do aparelho.
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
        <header class="section-head section-head--row">
          <div>
            <p class="section-kicker">Três telas, um só estado</p>
            <h2 id="screens-title">Cada aparelho vê o que precisa ver.</h2>
          </div>
          <p class="section-note">
            O servidor guarda a revisão. A TV, o Mestre e cada jogador leem a mesma mesa.
          </p>
        </header>

        <div class="screen-grid">
          <article class="screen-card screen-card--dm">
            <header>
              <h3>Mestre</h3>
              <code>/table/:id</code>
            </header>
            <p>Prepara a cena, conduz a iniciativa e responde ao grupo.</p>
            <ul>
              <li>Painel de cena, iniciativa e convite.</li>
              <li>Tokens, fichas e grade no mesmo lugar.</li>
              <li>Controle da sessão sem sair do tabuleiro.</li>
            </ul>
            <span class="screen-card__foot">Prepara e conduz</span>
          </article>

          <article class="screen-card screen-card--player">
            <header>
              <h3>Jogador</h3>
              <code>/play/:id</code>
            </header>
            <p>O celular é o controle. O tabuleiro fica na mesa.</p>
            <ul>
              <li>Ficha, dados, chat e movimento.</li>
              <li>Só o próprio token, e só no próprio turno.</li>
              <li>Entra por QR ou link, sem instalar.</li>
            </ul>
            <span class="screen-card__foot">Age no próprio turno</span>
          </article>

          <article class="screen-card screen-card--tv">
            <header>
              <h3>TV da sala</h3>
              <code>/display/:id</code>
            </header>
            <p>Uma tela só de leitura, legível de longe.</p>
            <ul>
              <li>Tabuleiro, iniciativa e última rolagem.</li>
              <li>O dado ganha a tela por alguns segundos.</li>
              <li>Sem controles e sem dado de debug.</li>
            </ul>
            <span class="screen-card__foot">Mostra para todos</span>
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
              A rolagem é validada no servidor e vai para a TV, para o Mestre e para o celular de
              quem rolou. O resultado fica no histórico, não no esquecimento.
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
          <h2 id="closing-title">Abra a mesa. Mostre o código. Deixe a TV acesa.</h2>
          <p>
            Leva menos tempo do que explicar as regras da casa. A conta é a mesma para mestrar e
            jogar.
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
          <p class="landing-footer__wordmark">Tavern <em>of</em> Disaster</p>
          <p>VTT presencial-first para uma TV e vários celulares.</p>
        </div>
        <dl class="landing-footer__facts">
          <div>
            <dt>Sistemas</dt>
            <dd>D&amp;D 5e, OP2, OPSH e Cyberpunk RED</dd>
          </div>
          <div>
            <dt>Aparelhos</dt>
            <dd>TV, notebook e celulares no mesmo estado</dd>
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
    </template>

    <template v-else>
      <div class="lobby">
        <header class="lobby-head">
          <div class="lobby-head__copy">
            <p class="lobby-head__kicker">Lobby</p>
            <h1>Suas mesas</h1>
            <p class="lobby-head__lead">
              Continue de onde parou, entre com um código ou abra uma mesa nova. O papel decide a
              tela: Mestre vai para o cockpit, Jogador vai para o celular.
            </p>
          </div>
          <div class="lobby-head__actions">
            <button type="button" class="btn outline" @click="openCreate">
              <Icon name="plus" :size="16" />
              Criar mesa
            </button>
            <button type="button" class="btn ghost" @click="openJoin">
              <Icon name="link" :size="16" />
              Entrar com código
            </button>
          </div>
        </header>

        <p v-if="loading" class="lobby-status" role="status">Carregando suas mesas…</p>

        <div v-if="loading" class="lobby-skeleton" aria-hidden="true">
          <div v-for="row in 3" :key="row" class="lobby-skeleton__row">
            <span class="lobby-skeleton__name" />
            <span class="lobby-skeleton__meta" />
          </div>
        </div>

        <EmptyState
          v-else-if="loadError && !tables.length"
          tone="error"
          eyebrow="Falha de rede"
          title="Não foi possível carregar suas mesas"
          :description="loadError"
        >
          <button type="button" class="btn" @click="loadLobby()">
            <Icon name="refresh" :size="16" />
            Tentar de novo
          </button>
        </EmptyState>

        <EmptyState
          v-else-if="!tables.length"
          eyebrow="Arquivo vazio"
          title="Sua primeira mesa começa aqui"
          description="Crie a mesa ou entre com o código de um Mestre. Em quatro passos a sessão está pronta para a TV e os celulares."
        >
          <div class="first-table">
            <p class="first-table__title">Checklist da primeira mesa</p>
            <ol>
              <li>Crie a mesa e escolha o sistema.</li>
              <li>Mostre o código ou o link para os jogadores.</li>
              <li>Crie a cena, a grade e os tokens.</li>
              <li>Inicie a sessão e abra a TV na sala.</li>
            </ol>
          </div>
          <div class="lobby-empty-actions">
            <button type="button" class="btn" @click="openCreate">
              <Icon name="plus" :size="16" />
              Criar mesa
            </button>
            <button type="button" class="btn outline" @click="openJoin">
              <Icon name="link" :size="16" />
              Entrar com código
            </button>
            <RouterLink to="/tables" class="btn ghost">Gerenciar mesas</RouterLink>
          </div>
        </EmptyState>

        <template v-else>
          <div v-if="loadError" class="lobby-banner" role="alert">
            <p>{{ loadError }}</p>
            <button type="button" class="btn btn-sm outline" @click="loadLobby()">
              Tentar de novo
            </button>
          </div>

          <section v-if="featured" class="continue" aria-labelledby="continue-title">
            <p class="continue__label">Continuar de onde paramos</p>
            <div class="continue__body">
              <div class="continue__main">
                <h2 id="continue-title">{{ featured.name }}</h2>
                <p class="continue__meta">
                  <span>{{ systemLabel(featured) }}</span>
                  <span>{{ playerLabel(featured) }}</span>
                </p>
                <div class="continue__badges">
                  <span class="badge" :class="isTableDm(featured, userId) ? 'warning' : 'info'">
                    {{ isTableDm(featured, userId) ? 'Mestre' : 'Jogador' }}
                  </span>
                  <span
                    class="badge"
                    :class="{
                      success: featured.status === 'LIVE',
                      warning: featured.status === 'PREPARING',
                      info: featured.status === 'PAUSED',
                    }"
                  >
                    {{ statusLabel(featured) }}
                  </span>
                </div>
              </div>
              <div class="continue__actions">
                <RouterLink :to="entryFor(featured)" class="btn">
                  {{ entryLabel(featured) }}
                  <Icon name="arrow-right" :size="16" />
                </RouterLink>
                <button type="button" class="btn outline" @click="openTv(featured)">
                  <Icon name="tv" :size="16" />
                  TV
                </button>
                <RouterLink :to="`/tables?settings=${featured._id}`" class="btn ghost">
                  Configurações
                </RouterLink>
              </div>
            </div>
          </section>

          <section
            v-if="otherTables.length"
            class="lobby-tables"
            aria-labelledby="lobby-tables-title"
          >
            <header class="lobby-tables__head">
              <h2 id="lobby-tables-title">Outras mesas</h2>
              <p>{{ otherTables.length }} {{ otherTables.length === 1 ? 'mesa' : 'mesas' }}</p>
            </header>
            <ul class="lobby-table-list">
              <TableRow
                v-for="table in otherTables"
                :key="table._id"
                :table="table"
                :user-id="userId"
                variant="lobby"
                @tv="openTv(table)"
              />
            </ul>
          </section>

          <p class="lobby-foot">
            O Mestre abre o cockpit. O jogador abre o celular. A TV fica na sala.
          </p>
        </template>
      </div>

      <CreateTableDialog
        v-model:open="createOpen"
        :systems="systems"
        :default-system-key="preferredSystemKey"
        :submitting="createSubmitting"
        :server-error="createError"
        @submit="handleCreate"
      />
      <JoinTableDialog
        v-model:open="joinOpen"
        :authenticated="true"
        @joined="handleJoined"
        @need-auth="handleNeedAuth"
      />
      <TvLinkDialog v-model:open="tvOpen" :table="tvTable" :can-manage="tvCanManage" />
    </template>

    <JoinTableDialog
      v-if="!isLoggedIn"
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
  font-size: 10px;
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

/* Three screens */
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
  max-width: 30ch;
  margin: var(--s-2) 0 0;
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

/* --- Lobby -------------------------------------------------------------- */
.lobby {
  width: 100%;
  max-width: 1120px;
  margin-inline: auto;
  padding: var(--s-7) var(--s-6) var(--s-9);
}

.lobby-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-6);
  padding-bottom: var(--s-6);
  border-bottom: 2px solid var(--line-strong);
}

.lobby-head__copy {
  max-width: 58ch;
}

.lobby-head__kicker {
  margin: 0 0 var(--s-2);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.lobby-head h1 {
  margin: 0;
}

.lobby-head__lead {
  margin: var(--s-3) 0 0;
  color: var(--text-muted);
  font-size: var(--text-base);
  line-height: 1.6;
}

.lobby-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
}

.lobby-status {
  margin: var(--s-6) 0 0;
  color: var(--text-muted);
  font-size: var(--text-md);
}

.lobby-skeleton {
  display: flex;
  flex-direction: column;
  margin-top: var(--s-5);
}

.lobby-skeleton__row {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding: var(--s-5) 0;
  border-bottom: 1px solid var(--line);
}

.lobby-skeleton__name {
  display: block;
  width: min(300px, 60%);
  height: 20px;
  border-radius: var(--radius-xs);
  background: var(--raised);
}

.lobby-skeleton__meta {
  display: block;
  width: min(190px, 40%);
  height: 11px;
  border-radius: var(--radius-xs);
  background: var(--raised);
}

.lobby-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  margin-top: var(--s-5);
  padding: var(--s-3) var(--s-4);
  border-left: 2px solid var(--danger);
  background: rgb(178 58 50 / 0.1);
}

.lobby-banner p {
  margin: 0;
  color: var(--danger-ink);
  font-size: var(--text-sm);
}

.continue {
  margin-top: var(--s-6);
  padding: var(--s-5);
  border: 1px solid var(--line-strong);
  border-left: 3px solid var(--manila);
  border-radius: var(--radius-xs);
  background: var(--panel);
}

.continue__label {
  margin: 0 0 var(--s-3);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.continue__body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s-5);
}

.continue__main {
  min-width: 0;
}

.continue h2 {
  margin: 0;
  font-size: clamp(1.7rem, 1.3rem + 1.4vw, 2.25rem);
  overflow-wrap: anywhere;
}

.continue__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-5);
  margin: var(--s-2) 0 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.continue__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-3);
}

.continue__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.lobby-tables {
  margin-top: var(--s-7);
}

.lobby-tables__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  padding-bottom: var(--s-2);
  border-bottom: 1px solid var(--line-strong);
}

.lobby-tables__head h2 {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  font-weight: 600;
}

.lobby-tables__head p {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.lobby-table-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.lobby-foot {
  margin: var(--s-7) 0 0;
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
  color: var(--text-muted);
  font-family: var(--font-data);
  font-size: var(--text-2xs);
}

.first-table {
  width: 100%;
  padding: var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--radius-xs);
  background: var(--ink-0);
}

.first-table__title {
  margin: 0 0 var(--s-3);
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 600;
}

.first-table ol {
  display: grid;
  gap: var(--s-2);
  margin: 0;
  padding-left: var(--s-6);
  color: var(--text-muted);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.lobby-empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  width: 100%;
  margin-top: var(--s-5);
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
  .landing-footer,
  .lobby {
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
  .closing__actions,
  .lobby-head__actions {
    width: 100%;
    flex-direction: column;
  }

  .landing-copy__actions .btn,
  .closing__actions .btn,
  .lobby-head__actions .btn {
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

  .section-head,
  .continue__body {
    align-items: flex-start;
  }

  .continue__actions {
    width: 100%;
  }

  .continue__actions .btn {
    flex: 1 1 auto;
    min-height: 44px;
  }

  .lobby-table-list :deep(.table-row__actions .btn) {
    min-height: 44px;
  }

  .lobby-empty-actions {
    flex-direction: column;
  }

  .lobby-empty-actions :deep(.btn) {
    width: 100%;
  }

  .landing-footer {
    grid-template-columns: minmax(0, 1fr);
  }

  .landing-footer__nav {
    grid-column: auto;
  }
}
</style>
