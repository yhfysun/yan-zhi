// Auth Store：用户登录/注册/状态
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, setToken, isLocalClient } from '../api/client';
import { waitForBackend } from '../api/backend-ready';
import { setPermittedModes, allModeDefs } from './mode';

export interface UserInfo {
  id: string;
  username: string;
  email: string | null;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(null);
  const loading = ref(false);
  const error = ref('');

  // ===== 服务鉴权状态（multi 模式 = 后端作为共享服务，远程连接必须登录） =====
  const authMode = ref<'guest' | 'multi'>('guest');
  const authRequired = ref(false);
  const setupRequired = ref(false);
  const permissions = ref<string[]>([]);
  const isAdmin = ref(false);
  /** 首次登录未改密码（默认管理员）：true 时登录页弹出强制改密表单（2026-11-01） */
  const mustChangePassword = ref(false);
  const statusLoaded = ref(false);

  /** 把权限清单映射为"模式放行清单"：menu.<modeKey> 命中 → 该模式放行。
   *  admin 权限点全放行；清单为空（guest/未加载）→ null 不收敛。 */
  function applyPermissionToModes(): void {
    if (!permissions.value.length || permissions.value.includes('admin')) {
      setPermittedModes(null);
      return;
    }
    const modes = allModeDefs.value
      .filter((d) => hasPermission('menu.' + d.key))
      .map((d) => d.key);
    setPermittedModes(modes.length ? modes : ['__none__']);
  }

  /** 拉取 /auth/status（幂等可重复调；失败按 guest 处理，不阻断启动）。 */
  async function fetchStatus(): Promise<void> {
    try {
      const result = await api.get<{ mode: 'guest' | 'multi'; authRequired: boolean; setupRequired: boolean }>('/auth/status');
      if ('data' in result) {
        authMode.value = result.data.mode;
        authRequired.value = !!result.data.authRequired;
        setupRequired.value = !!result.data.setupRequired;
      }
    } catch { /* 后端未就绪等，保持默认 guest */ }
    statusLoaded.value = true;
  }

  /** 首次安装：创建管理员（仅 multi 模式且未初始化时后端才放行）。 */
  async function setupAdmin(username: string, password: string): Promise<boolean> {
    error.value = '';
    loading.value = true;
    const result = await api.post<{ token: string; user: UserInfo }>('/auth/setup', { username, password });
    loading.value = false;
    if ('error' in result) {
      error.value = result.error;
      return false;
    }
    setToken(result.data.token);
    user.value = result.data.user;
    setupRequired.value = false;
    authRequired.value = true;
    await loadUser();
    return true;
  }

  /**
   * 本地模式的**内部数据归属身份**（不是"登录用户"）。
   *
   * ★★★ 为什么不把 guest 当登录态（2026-09-22 用户反馈「不应该默认登录 guest 账号」）：
   *
   *   本应用是本地单机应用，`apps/server/src/auth.ts` 的 authMiddleware **恒定**把请求身份
   *   置为 `{ userId:'guest', username:'guest' }`（全库 seed 数据的 `user_id` 都是 'guest'，
   *   恢复到多用户鉴权才需要改回「有 token 用其身份」）。
   *   所以 guest 是**数据归属的固定身份**，后端层面不可或缺，**不能删**。
   *
   *   但前端此前把它当成"已登录"：
   *     · `isLoggedIn = !!user`，而 `loadUser()` 在桌面端无 token 时会主动
   *       `POST /auth/guest` 拿 token 并把 user 填成 guest；
   *     · 于是侧栏/移动顶栏渲染出「g」头像 + **绿点（登录指示）** + 「guest」，
   *       点开是「退出登录」—— 用户看到的就是「默认帮我登录了一个 guest 账号」。
   *
   *   正解：**保留 guest 作为内部身份，但不算登录态**。
   *   判定用 username（后端 /auth/me 返回的是 user 行，`id` 在本地/远端可能不同写法，
   *   username 是更稳的判据），并兼容 id === 'guest' 的旧回退值（见 loadUser 的兜底分支）。
   */
  function isGuestIdentity(u: UserInfo | null): boolean {
    if (!u) return false;
    return u.username === 'guest' || u.id === 'guest';
  }

  const isLoggedIn = computed(() => !!user.value && !isGuestIdentity(user.value));

  /** 当前是否以内部 guest 身份运行（UI 据此显示"未登录"，而不是显示 guest 账号）。 */
  const isGuest = computed(() => isGuestIdentity(user.value));

  // 数据源收敛后后端为唯一数据源（桌面端 guest token 免登录，与 /api/llm/* 同库）。
  // 各 store 的 isServerMode()/on() 依赖此标志判断是否走后端 API；
  // 被误删会导致会话/平台等创建回退到渲染端本地库，任务写 message 撞 conversation 外键。
  // 恒为 true（纯本地无后端场景已不再支持）。
  const useServerApi = true;

  async function loadUser() {
    // ★ 先等后端就绪再判定身份。移动端冷启动时（WebView 先加载、内嵌后端后起）
    //   若直接请求，会拿到 NETWORK_UNREACHABLE → 走到下面"回退匿名用户"分支 →
    //   身份被误标成 guest（表现为"莫名其妙已登录"）。见 api/backend-ready.ts。
    await waitForBackend();

    // 先探服务鉴权模式（multi = 远程共享后端）：multi 下未登录绝不取 guest token，
    // 否则壳端会把"guest"当成身份、请求全部 401 后表现为"数据全空"（与 2026-09-13 教训同族）。
    await fetchStatus();
    if (authRequired.value) {
      const hasToken = !!localStorage.getItem('auth_token');
      if (!hasToken) return; // 留给路由守卫重定向 /login 或 /setup
    }

    const token = localStorage.getItem('auth_token');
    if (!token) {
      // 本机单机端（桌面 / 移动）本地模式：取 guest token，使平台等数据走后端 API（data.db），
      // 与聊天代理 /api/llm/* 同库；避免前端 IPC 库（yan-zhi.db）与后端库不同步导致 404。
      //
      // ★ 这**不是"登录"** —— guest 是内部数据归属身份（见 isGuestIdentity 注释）。
      //   前端已用 `isLoggedIn`/`isGuest` 把"身份"与"登录态"拆开，
      //   UI 不会再把它渲染成「已登录的 guest 账号」。
      //
      // ★★★ 判定必须是 `isLocalClient`（Desktop ∪ Capacitor）而不是 `isElectron`（2026-09-27 修）：
      //   移动端同样跑内嵌后端、同样恒定 guest 身份，原写法只覆盖桌面端 →
      //   移动端 `user` 恒为 null → App.vue 移动顶栏 / ChatTopbar 的「未登录 → 登录」
      //   v-else 分支**稳定渲染**，用户看到的就是「移动端要我登录」（而 Web 端才是真有
      //   登录需求的那一端）。判据：本地自带身份 ≠ 用户登录态。
      if (isLocalClient) {
        const guest = await api.post<{ token: string; user: UserInfo }>('/auth/guest');
        if ('data' in guest) {
          setToken(guest.data.token);
          user.value = guest.data.user;
        }
        // ★ 不提前 return（2026-11-01）：guest 模式 /auth/me 现在返回"本机管理员"全树权限，
        //   首次启动（无旧 token）也必须走一遍 me —— 否则 permissions 恒空，
        //   管理菜单 / 共享开关 / 账号区全都静默不显示（"功能存在但不可发现"）。
        //   非本地客户端（Web）无 token 仍直接返回：未登录状态无权限语义，交给路由守卫。
      } else {
        return;
      }
    }
    loading.value = true;
    const result = await api.get<{ user: UserInfo; isAdmin?: boolean; permissions?: string[]; authMode?: 'guest' | 'multi' }>('/auth/me');
    loading.value = false;
    if ('data' in result) {
      user.value = result.data.user;
      isAdmin.value = !!result.data.isAdmin;
      permissions.value = result.data.permissions || [];
      if (result.data.authMode) authMode.value = result.data.authMode;
      mustChangePassword.value = !!(result.data as any).mustChangePassword;
      applyPermissionToModes();
    } else {
      // 鉴权失败：multi 模式（后端要求登录）时清 token 引导去登录页；
      // 本地 guest 模式鉴权已屏蔽，/auth/me 失败时不清 token、不强制登出，回退内部 guest 身份。
      // ★ 这个回退值会被 `isGuestIdentity` 识别 → `isLoggedIn` 为 false（不显示成已登录）。
      if (authRequired.value) {
        setToken(null);
        user.value = null;
        return;
      }
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
    mustChangePassword.value = !!(result.data as any).mustChangePassword;
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
    permissions.value = [];
    isAdmin.value = false;
    mustChangePassword.value = false;
    setPermittedModes(null);
  }

  /** 是否拥有某权限点（admin 权限点拥有一切由后端保证，这里含树形前缀判断）。 */
  function hasPermission(key: string): boolean {
    if (!permissions.value.length) return false;
    if (permissions.value.includes('admin')) return true;
    if (permissions.value.includes(key)) return true;
    return permissions.value.some((p) => key.startsWith(p + '.'));
  }

  return {
    user, loading, error, isLoggedIn, isGuest, useServerApi,
    authMode, authRequired, setupRequired, permissions, isAdmin, statusLoaded,
    fetchStatus, setupAdmin, loadUser, login, register, logout, hasPermission, mustChangePassword,
  };
});
