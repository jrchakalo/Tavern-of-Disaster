<script setup lang="ts">
</script>

<template>
  <main>
    <h1>Primeiro Grid</h1>
    <div class="grid-container">
      <div class="grid-square"></div>
      <div class="grid-square"></div>
      <div class="grid-square"></div>
      <div class="grid-square"></div>
      <div class="grid-square"></div>
      <div class="grid-square"></div>
      <div class="grid-square"></div>
      <div class="grid-square"></div>
      <div class="grid-square"></div>
    </div>
  </main>
</template>

<style>
  body{
      background-color: #5b5b5b;
      margin: 0;
      min-height: 100vh;
  }
</style>

<style scoped>
main{
  font-family: sans-serif;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(3, 100px);
  grid-template-rows: repeat(3, 100px);
  gap: 5px;

  border: 2px solid #333;
  padding: 5px;
  background-color: #eee;
  width: fit-content;
}

.grid-square {
  width: 100px;
  height: 100px;
  background-color: #fff;
  border: 1px solid #ccc;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 2em;
}

</style>