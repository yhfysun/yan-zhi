// Auth Store：用户登录/注册/状态
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setToken, isElectron } from '../api/client';

export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null);
  const loading = ref(false);
  const error = ref('');

  const isLoggedIn = computed(() => !!user.value);

  // 数据面恒走后端（useServerApi 恒 true：guest token 免登录，后端为唯一数据源）。
  // 各 store 统一经 auth.useServerApi 读取，避免各自维护开关导致分流竞态。
  const useServerApi = true;

  async function loadUser() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      // 桌面端本地模式：自动获取 guest token，使平台等数据走后端 API（data.db），
      // 与聊天代理 /api/llm/* 同库；避免前端 IPC 库（yan-zhi.db）与后端库不同步导致 404
      if (isElectron) {
        const guest = await api.post<{ token: string; user: UserInfo }>('/auth/guest');
        if ('data' in guest) {
          setToken(guest.data.token);
          user.value = guest.data.user;
        }
      }
      return;
    }
    loading.value = true;
    const result = await api.get<{ user: UserInfo }>('/auth/me');
    loading.value = false;
    if ('data' in result) {
      user.value = result.data.user;
    } else {
      // 本地模式：鉴权已屏蔽，/auth/me 失败时不清 token、不强制登出，回退匿名用户
      user.value = { id: 'guest', username: 'guest', email: null };
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

  return { user, loading, error, isLoggedIn, useServerApi, loadUser, login, register, logout };
});
