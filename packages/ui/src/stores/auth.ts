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

  /**
   * 数据面分流：桌面端（Electron）恒走后端 API —— 后端鉴权已屏蔽（无 token 回退 guest）。
   * 后端是所有数据唯一来源（智能体/会话/文件/平台/MCP 等），前端只负责展示与交互。
   * web 端未登录也默认以 guest 身份连后端（guest 密码为空，无需登录），因此 useServerApi 恒 true；
   * 本地 Dexie 仅在后端不可达时兜底，不作为主数据源。
   * 不直接用 isLoggedIn 分流：loadUser 的 guest token 获取是异步的，页面先加载时会把
   * 桌面数据写进前端 IPC 本地库（yan-zhi.db），与服务端库分裂（agnes 等服务端种子数据"消失"）。
   */
  const useServerApi = computed(() => isElectron || !!user.value);

  async function loadUser() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      // 本地模式：无登录概念，所有端默认以 guest 身份连后端（guest 密码为空，不需要登录）。
      // 先持有本地 guest 身份（UI 不出现"登录"入口），再异步取 guest token（后端库数据归属对齐）；
      // 后端由 Electron 主进程拉起，应用窗口先于后端监听，这里做有限重试。
      user.value = { id: 'guest', username: 'guest', email: null };
      for (let i = 0; i < 5; i++) {
        const guest = await api.post<{ token: string; user: UserInfo }>('/auth/guest');
        if ('data' in guest) {
          setToken(guest.data.token);
          user.value = guest.data.user;
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
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
