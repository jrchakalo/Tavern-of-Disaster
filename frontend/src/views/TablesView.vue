<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { authToken, currentUser } from '../auth';
import type { ITable } from '../types';

const router = useRouter();
const newTableName = ref('');
const userTables = ref<ITable[]>([]);

async function fetchMyTables() {
  if (!authToken.value) return; // Não faz nada se não houver token

  try {
    const response = await fetch('http://localhost:3001/api/tables/mytables', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken.value}`, // Envia o token para autenticação
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
      newTableName.value = ''; // Limpa o input
      fetchMyTables(); // Atualiza a lista de mesas para incluir a nova
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

    <div class="tables-list">
      <h2>Suas Mesas Atuais:</h2>
      <div v-if="userTables.length === 0" class="no-tables">
        Você ainda não participa de nenhuma mesa. Crie uma nova ou junte-se a uma!
      </div>
      <ul v-else>
        <li v-for="table in userTables" :key="table._id" @click="goToTable(table._id)">
          <span class="table-name">{{ table.name }}</span>
          <span class="table-role">{{ table.dm === currentUser?.id ? '(Mestre)' : '(Jogador)' }}</span> </li>
      </ul>
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
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 0.2s;
}
.tables-list li:hover {
  background-color: #4a4a4a;
}
.table-name {
  font-weight: bold;
  font-size: 1.2em;
}
.table-role {
  font-style: italic;
  color: #ccc;
}
.no-tables {
  color: #bbb;
  margin-top: 20px;
  text-align: center;
}
</style>