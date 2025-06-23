import { ref } from 'vue';

// Este ref reativo irá rastrear o token.
// Se encontrar um token salvo, o usuário já começa "logado".
export const authToken = ref<string | null>(localStorage.getItem('authToken'));

// Função para definir o token (fazer login)
export function setAuthToken(token: string) {
  localStorage.setItem('authToken', token);
  authToken.value = token;
}

// Função para remover o token (fazer logout)
export function clearAuthToken() {
  localStorage.removeItem('authToken');
  authToken.value = null;
}