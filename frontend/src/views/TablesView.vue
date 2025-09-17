<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { authToken, currentUser } from '../services/authService';
import type { ITable } from '../types';

const router = useRouter();
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
    const response = await fetch('http://localhost:3001/api/tables/mytables', {
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
    const res = await fetch(`http://localhost:3001/api/tables/${editingTable.value._id}`, {
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
  if (!confirm('Remover este jogador da mesa?')) return;
  const res = await fetch(`http://localhost:3001/api/tables/${managingPlayers.value._id}/players/${playerId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken.value}` }});
  const data = await res.json();
  if (res.ok) { fetchMyTables(); } else alert(data.message || 'Erro');
}
function openLeave(table: ITable) { leaving.value = table; }
async function confirmLeave() {
  if (!leaving.value || !authToken.value) return;
  const res = await fetch(`http://localhost:3001/api/tables/${leaving.value._id}/leave`, { method: 'POST', headers: { Authorization: `Bearer ${authToken.value}` }});
  const data = await res.json();
  if (res.ok) { leaving.value = null; fetchMyTables(); } else alert(data.message || 'Erro');
}
function openDelete(table: ITable) { deleting.value = table; }
async function confirmDelete() {
  if (!deleting.value || !authToken.value) return;
  const res = await fetch(`http://localhost:3001/api/tables/${deleting.value._id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${authToken.value}` }});
  const data = await res.json();
  if (res.ok) { deleting.value = null; fetchMyTables(); } else alert(data.message || 'Erro');
}
function copyInvite(invite: string) {
  navigator.clipboard.writeText(invite).then(()=>{ feedback.value = 'Código copiado!'; setTimeout(()=>feedback.value='',2000); });
}

async function handleCreateTable() {
  if (!newTableName.value.trim() || !authToken.value) return;

  try {
    const response = await fetch('http://localhost:3001/api/tables/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.value}`, // Envia o token para autenticação
      },
      body: JSON.stringify({ name: newTableName.value }),
    });

    const newTableData = await response.json();

    if (response.ok) {
      alert(`Mesa "${newTableData.name}" criada! Código de convite: ${newTableData.inviteCode}`);
  newTableName.value = '';
  fetchMyTables();
    } else {
      alert(`Erro ao criar mesa: ${newTableData.message}`);
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
    const response = await fetch('http://localhost:3001/api/tables/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken.value}`,
      },
      body: JSON.stringify({ inviteCode: inviteCodeInput.value }),
    });

    const data = await response.json();

    if (response.ok) {
  alert(data.message);
  inviteCodeInput.value = '';
  fetchMyTables();
    } else {
      alert(`Erro ao entrar na mesa: ${data.message}`);
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
            <button @click.stop="copyInvite(table.inviteCode)" title="Copiar código">📋</button>
            <button v-if="table.dm._id === currentUser?.id" @click.stop="openEdit(table)" title="Renomear">✏️</button>
            <button v-if="table.dm._id === currentUser?.id" @click.stop="managePlayers(table)" title="Gerenciar jogadores">👥</button>
            <button v-if="table.dm._id === currentUser?.id" @click.stop="openDelete(table)" title="Excluir mesa" class="danger">🗑️</button>
            <button v-else @click.stop="openLeave(table)" title="Sair da mesa" class="danger">🚪</button>
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
}

.create-table-form input {
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #555;
  width: 300px;
}

.create-table-form button {
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  background-color: #ffc107;
  color: #333;
  font-weight: bold;
  cursor: pointer;
}

.tables-list {
  margin-top: 40px;
  text-align: left;
}

.tables-list ul {
  list-style-type: none;
  padding: 0;
}

.tables-list li {
  background-color: #3a3a3a;
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 4px;
  cursor: default;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  transition: background-color 0.2s;
}

.table-details {
  display: flex;
  align-items: center;
  gap: 20px;
}

.invite-code {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
  color: #ddd;
}

.invite-code code {
  background-color: #2c2c2c;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
  color: #ffc107;
  font-weight: bold;
}

.tables-list li:hover {
  background-color: #4a4a4a;
}

.table-name {
  font-weight: bold;
  font-size: 1.2em;
}
.row-main { display:flex; gap:12px; align-items:center; cursor:pointer; }
.row-actions { display:flex; gap:8px; }
.row-actions button { background:#555; border:1px solid #777; color:#eee; cursor:pointer; padding:6px 8px; border-radius:4px; }
.row-actions button:hover { background:#666; }
.row-actions button.danger { background:#7a3333; }
.feedback { margin-top:16px; color:#ffc107; font-size:0.9em; }

/* Modais */
.modal { position:fixed; inset:0; background:rgba(0,0,0,0.55); display:flex; justify-content:center; align-items:center; z-index:200; }
.modal-content { background:#2f2f2f; padding:24px; border-radius:8px; width:360px; max-width:90%; display:flex; flex-direction:column; gap:14px; border:1px solid #555; }
.modal-content h3 { margin:0; }
.modal-content input { padding:8px; border-radius:4px; border:1px solid #555; background:#444; color:#fff; }
.modal-actions { display:flex; justify-content:flex-end; gap:10px; }
.modal-actions button { background:#555; border:1px solid #777; color:#eee; padding:8px 14px; border-radius:4px; cursor:pointer; }
.modal-actions button.danger { background:#7a3333; }
.modal-actions button:hover { background:#666; }
.players-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
.players-list li { display:flex; justify-content:space-between; align-items:center; background:#3d3d3d; padding:6px 10px; border-radius:4px; }
.players-list button.small { padding:4px 8px; font-size:0.75rem; }

.table-role {
  font-style: italic;
  color: #ccc;
  min-width: 80px;
  text-align: right;
}

.no-tables {
  color: #bbb;
  margin-top: 20px;
  text-align: center;
}

.join-table-form {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  justify-content: center;
}

.join-table-form input {
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #555;
  width: 300px;
}

.join-table-form button {
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  background-color: #5cb85c; 
  color: white;
  font-weight: bold;
  cursor: pointer;
}
</style>