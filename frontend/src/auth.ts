import { ref } from 'vue';
import { jwtDecode } from 'jwt-decode';

export interface UserPayload {
  id: string;
  username: string;
}

export const authToken = ref<string | null>(null);
export const currentUser = ref<UserPayload | null>(null);

function updateUserState(token: string | null) {
  if (token) {
    localStorage.setItem('authToken', token);
    authToken.value = token;
    try {
      // Decodifica o token para extrair as informações do usuário
      const decoded = jwtDecode<{ user: UserPayload }>(token);
      currentUser.value = decoded.user;
    } catch (error) {
      console.error("Token inválido:", error);
      // Limpa tudo se o token for inválido
      localStorage.removeItem('authToken');
      authToken.value = null;
      currentUser.value = null;
    }
  } else {
    localStorage.removeItem('authToken');
    authToken.value = null;
    currentUser.value = null;
  }
}

updateUserState(localStorage.getItem('authToken'));

// Função para definir o token (fazer login)
export function setAuthToken(token: string) {
  updateUserState(token);
}

// Função para remover o token (fazer logout)
export function clearAuthToken() {
  updateUserState(null);
}