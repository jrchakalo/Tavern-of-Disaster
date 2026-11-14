import { ref } from 'vue';
import { jwtDecode } from 'jwt-decode';
import { API_BASE_URL } from './apiBase';

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

/**
 * Renova a sessão via POST /api/auth/refresh com o token atual.
 * Retorna o novo token (já persistido) ou null quando não foi possível renovar.
 * Nunca loga o token.
 */
export async function refreshToken(): Promise<string | null> {
  const current = authToken.value;
  if (!current) return null;
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${current}`,
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { token?: unknown };
    const next = typeof data?.token === 'string' ? data.token : null;
    if (!next) return null;
    setAuthToken(next);
    return next;
  } catch {
    // Falha de rede/parse: apenas sinaliza que não renovou.
    return null;
  }
}