<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { currentUser } from '../auth'; // Importa o usuário logado para saudação
</script>

<template>
  <div class="home-container">
    <h1>Bem-vindo à Tavern of Disaster, {{ currentUser?.username }}!</h1>
    <p>O que você gostaria de fazer?</p>
    <div class="quick-actions">
      <RouterLink to="/tables" class="action-button">Ver Minhas Mesas</RouterLink>
      </div>
  </div>
</template>

<style scoped>
.home-container {
  text-align: center;
  padding-top: 40px;
}
.quick-actions {
  margin-top: 30px;
  display: flex;
  justify-content: center;
  gap: 20px;
}
.action-button {
  padding: 15px 30px;
  border: none;
  border-radius: 4px;
  background-color: #ffc107;
  color: #333;
  font-weight: bold;
  font-size: 1.1em;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.2s;
}
.action-button:hover {
  background-color: #ffca2c;
}
</style>