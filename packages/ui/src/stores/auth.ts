// Auth Store：用户登录/注册/状态
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setToken } from '../api/client';

interface UserInfo {
  id: string;
  username: string;
  email: string | null;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null);
  const loading = ref(false);
  const error = ref('');

  const isLoggedIn = computed(() => !!user.value);

  async function loadUser() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    loading.value = true;
    const result = await api.get<{ user: UserInfo }>('/auth/me');
    loading.value = false;
    if ('data' in result) {
      user.value = result.data.user;
    } else {
      setToken(null);
      user.value = null;
    }
  }

  async function login(username: string, password: string): Promise<boolean> {
    error.value = '';
    loading.value = true;
    const result = await api.post<{ token: string; user: UserInfo }>('/auth/login', { username, password });
    loading.value = false;
    if ('error' in result) {
      error.value = result.error;
      return false;
    }
    setToken(result.data.token);
    user.value = result.data.user;
    return true;
  }

  async function register(username: string, password: string, email?: string): Promise<boolean> {
    error.value = '';
    loading.value = true;
    const result = await api.post<{ token: string; user: UserInfo }>('/auth/register', { username, password, email });
    loading.value = false;
    if ('error' in result) {
      error.value = result.error;
      return false;
    }
    setToken(result.data.token);
    user.value = result.data.user;
    return true;
  }

  function logout() {
    setToken(null);
    user.value = null;
  }

  return { user, loading, error, isLoggedIn, loadUser, login, register, logout };
});
