<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { authToken, currentUser } from '../services/authService';
import { toast } from '../services/toast';
import Icon from '../components/Icon.vue';
import type { ITable } from '../types';

const router = useRouter();
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const newTableName = ref('');
const userTables = ref<ITable[]>([]);
const inviteCodeInput = ref('');
const editingTable = ref<ITable | null>(null);
const editName = ref('');
const managingPlayers = ref<ITable | null>(null);
const removing = ref(false);
const leaving = ref<ITable | null>(null);
const deleting = ref<ITable | null>(null);
const feedback = ref('');


async function fetchMyTables() {
  if (!authToken.value) return; // Sem token

  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/mytables`, {
      method: 'GET',
      headers: {
  'Authorization': `Bearer ${authToken.value}`,
      },
    });
    if (response.ok) {
      userTables.value = await response.json();
    } else {
      console.error('Falha ao buscar mesas.');
    }
  } catch (error) {
    console.error('Erro de rede ao buscar mesas:', error);
  }
}

function openEdit(table: ITable) {
  editingTable.value = table;
  editName.value = table.name;
}
async function saveEdit() {
  if (!editingTable.value || !authToken.value) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/tables/${editingTable.value._id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken.value}` }, body: JSON.stringify({ name: editName.value })
    });
    const data = await res.json();
    if (res.ok) { feedback.value = 'Mesa atualizada.'; editingTable.value = null; fetchMyTables(); }
    else feedback.value = data.message || 'Erro.';
  } catch (e) { feedback.value = 'Falha rede.'; }
}
function managePlayers(table: ITable) { managingPlayers.value = table; }
async function removePlayer(playerId: string) {
  if (!managingPlayers.value || !authToken.value) return;
  // Non-blocking flow: action proceeds and feedback via toast
  const res = await fetch(`${API_BASE_URL}/api/tables/${managingPlayers.value._id}/players/${playerId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken.value}` }});
  const data = await res.json();
  if (res.ok) { 
    toast.success('Jogador removido.');
    fetchMyTables(); 
  } else {
    toast.error(data.message || 'Erro');
  }
}
function openLeave(table: ITable) { leaving.value = table; }
async function confirmLeave() {
  if (!leaving.value || !authToken.value) return;
  const res = await fetch(`${API_BASE_URL}/api/tables/${leaving.value._id}/leave`, { method: 'POST', headers: { Authorization: `Bearer ${authToken.value}` }});
  const data = await res.json();
  if (res.ok) { 
    toast.success('Você saiu da mesa.');
    leaving.value = null; 
    fetchMyTables(); 
  } else {
    toast.error(data.message || 'Erro');
  }
}
function openDelete(table: ITable) { deleting.value = table; }
async function confirmDelete() {
  if (!deleting.value || !authToken.value) return;
  const res = await fetch(`${API_BASE_URL}/api/tables/${deleting.value._id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken.value}` }});
  const data = await res.json();
  if (res.ok) { 
    toast.success('Mesa excluída.');
    deleting.value = null; 
    fetchMyTables(); 
  } else {
    toast.error(data.message || 'Erro');
  }
}
function copyInvite(invite: string) {
  navigator.clipboard.writeText(invite).then(()=>{ feedback.value = 'Código copiado!'; setTimeout(()=>feedback.value='',2000); });
}

async function handleCreateTable() {
  if (!newTableName.value.trim() || !authToken.value) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.value}`, // Envia o token para autenticação
      },
      body: JSON.stringify({ name: newTableName.value }),
    });

    const newTableData = await response.json();

    if (response.ok) {
  toast.success(`Mesa "${newTableData.name}" criada! Código: ${newTableData.inviteCode}`);
  newTableName.value = '';
  fetchMyTables();
    } else {
  toast.error(`Erro ao criar mesa: ${newTableData.message}`);
    }
  } catch (error) {
    console.error('Erro de rede ao criar mesa:', error);
  }
}

function goToTable(tableId: string) {
  router.push({ name: 'table', params: { tableId: tableId } });
}

async function handleJoinTable() {
  if (!inviteCodeInput.value.trim() || !authToken.value) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/tables/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.value}`,
      },
      body: JSON.stringify({ inviteCode: inviteCodeInput.value }),
    });

    const data = await response.json();

    if (response.ok) {
  toast.info(data.message || 'Operação realizada.');
  inviteCodeInput.value = '';
  fetchMyTables();
    } else {
  toast.error(`Erro ao entrar na mesa: ${data.message}`);
    }
  } catch (error) {
    console.error('Erro de rede ao entrar na mesa:', error);
  }
}

onMounted(() => {
  fetchMyTables();
});

</script>

<template>
  <div class="lobby-container">
    <h1>Minhas Mesas</h1>

    <form class="create-table-form" @submit.prevent="handleCreateTable">
      <input type="text" v-model="newTableName" placeholder="Nome da nova mesa" required />
      <button type="submit">Criar Nova Mesa</button>
    </form>

    <form class="join-table-form" @submit.prevent="handleJoinTable">
      <input type="text" v-model="inviteCodeInput" placeholder="Código de convite da mesa" required />
      <button type="submit">Entrar na Mesa</button>
    </form>

    <div class="tables-list">
      <h2>Suas Mesas Atuais:</h2>
      <div v-if="userTables.length === 0" class="no-tables">
        Você ainda não participa de nenhuma mesa. Crie uma nova ou junte-se a uma!
      </div>
      <ul v-else>
        <li v-for="table in userTables" :key="table._id">
          <div class="row-main" @click="goToTable(table._id)">
            <span class="table-name">{{ table.name }}</span>
            <span class="table-role">{{ table.dm._id === currentUser?.id ? '(Mestre)' : '(Jogador)' }}</span>
          </div>
          <div class="row-actions">
            <button @click.stop="copyInvite(table.inviteCode)" title="Copiar código"><Icon name="copy" size="18" /></button>
            <button v-if="table.dm._id === currentUser?.id" @click.stop="openEdit(table)" title="Renomear"><Icon name="edit" size="18" /></button>
            <button v-if="table.dm._id === currentUser?.id" @click.stop="managePlayers(table)" title="Gerenciar jogadores"><Icon name="users" size="18" /></button>
            <button v-if="table.dm._id === currentUser?.id" @click.stop="openDelete(table)" title="Excluir mesa" class="danger"><Icon name="delete" size="18" /></button>
            <button v-else @click.stop="openLeave(table)" title="Sair da mesa" class="danger"><Icon name="exit" size="18" /></button>
          </div>
        </li>
      </ul>
      <div class="feedback" v-if="feedback">{{ feedback }}</div>
    </div>

    <!-- Modal editar nome -->
    <div v-if="editingTable" class="modal">
      <div class="modal-content">
        <h3>Renomear Mesa</h3>
        <input v-model="editName" />
        <div class="modal-actions">
          <button @click="saveEdit">Salvar</button>
          <button @click="editingTable=null">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Modal gerenciar jogadores -->
    <div v-if="managingPlayers" class="modal">
      <div class="modal-content">
        <h3>Jogadores</h3>
        <ul class="players-list">
          <li v-for="p in managingPlayers.players" :key="p._id">
            <span>{{ p.username }} <em v-if="p._id === managingPlayers.dm._id">(Mestre)</em></span>
            <button v-if="p._id !== managingPlayers.dm._id" @click="removePlayer(p._id)" class="danger small">Remover</button>
          </li>
        </ul>
        <div class="modal-actions">
          <button @click="managingPlayers=null">Fechar</button>
        </div>
      </div>
    </div>

    <!-- Modal sair -->
    <div v-if="leaving" class="modal">
      <div class="modal-content">
        <h3>Sair da mesa "{{ leaving.name }}"?</h3>
        <div class="modal-actions">
          <button class="danger" @click="confirmLeave">Confirmar</button>
          <button @click="leaving=null">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Modal excluir -->
    <div v-if="deleting" class="modal">
      <div class="modal-content">
        <h3>Excluir mesa "{{ deleting.name }}"?</h3>
        <p>Esta ação remove cenas e tokens definitivamente.</p>
        <div class="modal-actions">
          <button class="danger" @click="confirmDelete">Excluir</button>
          <button @click="deleting=null">Cancelar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lobby-container {
  width: 100%;
  max-width: 800px;
  text-align: center;
}

.create-table-form {
  margin: 20px 0;
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.create-table-form input { padding:10px; border-radius:var(--radius-sm); border:1px solid var(--color-border); width:100%; max-width:420px; background:var(--color-surface-alt); color:var(--color-text); }
.create-table-form input:focus { outline:2px solid var(--color-border-strong); outline-offset:2px; }

.create-table-form button { padding:10px 15px; border:1px solid var(--color-border-strong); border-radius:var(--radius-sm); background:var(--color-accent); color:var(--color-text); font-weight:600; cursor:pointer; }
.create-table-form button:hover { background:var(--color-accent-alt); }

.tables-list {
  margin-top: 40px;
  text-align: left;
}

.tables-list ul {
  list-style-type: none;
  padding: 0;
}

.tables-list li { background:var(--color-surface); padding:15px; margin-bottom:10px; border-radius:var(--radius-sm); cursor:default; display:grid; grid-template-columns:1fr auto; gap:10px; transition:background var(--transition-fast), border-color var(--transition-fast); border:1px solid var(--color-border); }
.tables-list li:hover { background:var(--color-surface-alt); border-color:var(--color-border-strong); }

.table-details {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.invite-code {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
  color: #ddd;
}

.invite-code code { background:var(--color-surface-alt); padding:4px 8px; border-radius:var(--radius-sm); font-family:'Courier New', monospace; color:var(--color-accent); font-weight:600; border:1px solid var(--color-border); }

.feedback { margin-top:16px; color:var(--color-accent); font-size:0.9em; }

.table-name {
  font-weight: bold;
  font-size: 1.2em;
}
.row-main { display:flex; gap:12px; align-items:center; cursor:pointer; }
.row-actions { display:flex; gap:8px; flex-wrap: wrap; }
.row-actions button { background:var(--color-surface-alt); border:1px solid var(--color-border); color:var(--color-text); cursor:pointer; padding:6px 8px; border-radius:var(--radius-sm); transition:background var(--transition-fast); }
.row-actions button:hover { background:var(--color-surface); }
.row-actions button.danger { background:var(--color-danger); border-color:#d06060; }
.row-actions button.danger:hover { background:#d06060; }

/* Modais */
.modal { position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; justify-content:center; align-items:center; z-index:200; }
.modal-content { background:linear-gradient(180deg,var(--color-surface),var(--color-surface-alt)); padding:24px 20px; border-radius:var(--radius-md); width:380px; max-width:90%; display:flex; flex-direction:column; gap:14px; border:1px solid var(--color-border); box-shadow:var(--elev-3); }
.modal-content h3 { margin:0; }
.modal-content input { padding:8px; border-radius:var(--radius-sm); border:1px solid var(--color-border); background:var(--color-surface-alt); color:var(--color-text); }
.modal-content input:focus { outline:2px solid var(--color-border-strong); outline-offset:2px; }
.modal-actions { display:flex; justify-content:space-between; gap:10px; }
.modal-actions button { background:var(--color-surface-alt); border:1px solid var(--color-border); color:var(--color-text); padding:8px 14px; border-radius:var(--radius-sm); cursor:pointer; font-weight:500; }
.modal-actions button:hover { background:var(--color-surface); }
.modal-actions button.danger { background:var(--color-danger); border-color:#d06060; }
.modal-actions button.danger:hover { background:#d06060; }
.players-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
.players-list li { display:flex; justify-content:space-between; align-items:center; background:var(--color-surface-alt); padding:6px 10px; border-radius:var(--radius-sm); border:1px solid var(--color-border); }
.players-list button.small { padding:4px 8px; font-size:0.75rem; }

.table-role { font-style:italic; color:var(--color-text-muted); min-width:80px; text-align:right; }

.no-tables { color:var(--color-text-muted); margin-top:20px; text-align:center; }

.join-table-form {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.join-table-form input { padding:10px; border-radius:var(--radius-sm); border:1px solid var(--color-border); width:100%; max-width:420px; background:var(--color-surface-alt); color:var(--color-text); }

@media (max-width: 560px) {
  .tables-list li { grid-template-columns: 1fr; }
  .table-role { min-width: auto; text-align: left; }
}
.join-table-form input:focus { outline:2px solid var(--color-border-strong); outline-offset:2px; }

.join-table-form button { padding:10px 15px; border:1px solid #63b887; border-radius:var(--radius-sm); background:var(--color-success); color:var(--color-text); font-weight:600; cursor:pointer; }
.join-table-form button:hover { background:#63b887; }

/* Mobile sizing reductions */
@media (max-width: 560px) {
  .create-table-form input,
  .join-table-form input { max-width: 300px; font-size: 0.95rem; padding: 8px; }
  .create-table-form button,
  .join-table-form button { padding: 8px 12px; font-size: 0.95rem; }
}
</style>