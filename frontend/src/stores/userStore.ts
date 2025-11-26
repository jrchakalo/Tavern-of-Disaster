import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { UserProfileDTO } from '../types';
import { getMe, updateMe } from '../services/userService';
import { authToken } from '../services/authService';

export const useUserStore = defineStore('userStore', () => {
  const profile = ref<UserProfileDTO | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  let inflight: Promise<UserProfileDTO | null> | null = null;

  async function fetchProfile(options: { force?: boolean } = {}) {
    if (profile.value && !options.force) {
      return profile.value;
    }
    if (inflight) {
      return inflight;
    }
    isLoading.value = true;
    error.value = null;
    inflight = getMe()
      .then((data) => {
        profile.value = data;
        return data;
      })
      .catch((err) => {
        error.value = err instanceof Error ? err.message : 'Não foi possível carregar o perfil.';
        throw err;
      })
      .finally(() => {
        isLoading.value = false;
        inflight = null;
      });
    return inflight;
  }

  async function updateProfile(payload: Partial<UserProfileDTO>) {
    const data = await updateMe(payload);
    profile.value = data;
    return data;
  }

  function setProfile(data: UserProfileDTO | null) {
    profile.value = data;
  }

  function clear() {
    profile.value = null;
    error.value = null;
  }

  watch(
    () => authToken.value,
    (token) => {
      if (!token) {
        clear();
      }
    }
  );

  return {
    profile,
    isLoading,
    error,
    fetchProfile,
    updateProfile,
    setProfile,
    clear,
  };
});
