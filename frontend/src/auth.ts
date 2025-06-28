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
    try {
      // Decodifica o token para ler seu conteúdo e data de expiração
      const decoded = jwtDecode<{ user: UserPayload, exp: number }>(token);

      // Se a data de expiração for no passado, o token está expirado.
      if (decoded.exp * 1000 < Date.now()) {
        console.log('Token encontrado no localStorage, mas está expirado. Limpando...');
        throw new Error('Token expirado'); // Lança um erro para cair no bloco catch
      }

      // Se chegou aqui, o token é válido e não expirado
      localStorage.setItem('authToken', token);
      authToken.value = token;
      currentUser.value = decoded.user;
      console.log('Estado de autenticação inicializado com token válido.');

    } catch (error) {
      console.error("Não foi possível processar o token:", error);
      // Limpa o estado e o localStorage para garantir
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