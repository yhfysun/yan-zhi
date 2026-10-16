// 路由定义
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { useLicenseStore } from '../stores/license';
import { usePluginStore } from '../stores/plugin';
import { resolvePluginComponent } from '../plugin-component-registry';
import { isElectron, isCapacitor } from '../api/client';
import { activeMode, modeRoute, visibleModeDefs, isModeLicensed, type AppMode } from '../stores/mode';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/chat' },
  {
    // 独立子窗口承载的差异查看器（桌面端开真窗口时加载这条路由）。
    // meta.bare = 不套应用外壳（无侧栏/顶栏），整窗交给页面自己画标题栏。
    path: '/diff-window',
    name: 'diff-window',
    component: () => import('../views/DiffWindow.vue'),
    meta: { title: '差异', bare: true, guest: true },
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('../views/Home.vue'),
    meta: { title: '首页' },
  },
  {
    path: '/license',
    name: 'license',
    component: () => import('../views/License.vue'),
    meta: { title: '授权激活', guest: true },
  },
  {
    // 授权管理（已激活后从「更多」进）：看当前码/版本档位/机器绑定，并可换码。
    // 与 /license 的分工见 LicenseManage.vue 顶部注释。
    path: '/license-manage',
    name: 'license-manage',
    component: () => import('../views/LicenseManage.vue'),
    meta: { title: '授权管理' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录', guest: true },
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('../views/Chat.vue'),
    meta: { title: '任务' },
  },
  {
    path: '/code',
    name: 'code',
    component: () => import('../views/CodeWorkbench.vue'),
    meta: { title: '代码' },
  },
  {
    // 工作流模式（第五模式，stores/mode.ts 的 wf）：运行台 + 任务对话，两形态由 LeadToggle 切换
    path: '/workflow',
    name: 'workflow',
    component: () => import('../views/WorkflowWorkbench.vue'),
    meta: { title: '工作流' },
  },
  {
    // 剪辑模式（第六模式，stores/mode.ts 的 clip）：时间轴工作台 + 对话，两形态由 LeadToggle 切换
    path: '/clip',
    name: 'clip',
    component: () => import('../views/ClipWorkbench.vue'),
    meta: { title: '剪辑' },
  },
  {
    path: '/chat-hub',
    name: 'chat-hub',
    component: () => import('../views/ChatHub.vue'),
    meta: { title: '消息' },
  },
  {
    path: '/chat/:convId',
    name: 'chat-detail',
    component: () => import('../views/Chat.vue'),
  },
  {
    path: '/peers',
    name: 'peers',
    component: () => import('../views/Peers.vue'),
    meta: { title: '客户端节点' },
  },
  {
    path: '/connections',
    name: 'connections',
    component: () => import('../views/Connections.vue'),
    meta: { title: 'IM 连接' },
  },
  {
    path: '/knowledge',
    name: 'knowledge',
    component: () => import('../views/Knowledge.vue'),
    meta: { title: '知识库', guest: true },
  },
  {
    path: '/models',
    name: 'models',
    component: () => import('../views/Models.vue'),
    meta: { title: '模型平台' },
  },
  {
    path: '/models/:platformId',
    name: 'platform-detail',
    component: () => import('../views/PlatformDetail.vue'),
    meta: { title: '平台详情' },
  },
  {
    // MCP 管理已并入 /tools 工具页「MCP 服务」tab；旧路由重定向兼容历史链接与插件注入
    path: '/mcp',
    redirect: { path: '/tools', query: { tab: 'mcp' } },
  },
  {
    path: '/mcp/:id',
    redirect: (to) => ({ path: '/tools', query: { tab: 'mcp', focus: String(to.params.id ?? '') } }),
  },
  {
    path: '/tools',
    name: 'tools',
    component: () => import('../views/ToolMarket.vue'),
    meta: { title: '工具与连接' },
  },
  {
    path: '/skills',
    name: 'skills',
    component: () => import('../views/Skills.vue'),
    meta: { title: 'Skill 商店' },
  },
  {
    path: '/skills/:id',
    name: 'skill-detail',
    component: () => import('../views/Skills.vue'),
    meta: { title: 'Skill 详情' },
  },
  {
    path: '/agents',
    name: 'agents',
    component: () => import('../views/Agents.vue'),
    meta: { title: '智能体' },
  },
  {
    path: '/browser',
    name: 'browser',
    component: () => import('../views/Browser.vue'),
    meta: { title: '浏览器' },
  },
  {
    path: '/agents/:id',
    name: 'agent-canvas',
    component: () => import('../views/AgentCanvas.vue'),
    meta: { title: '智能体画布' },
  },
  {
    path: '/distill',
    name: 'distill',
    component: () => import('../views/SkillDistill.vue'),
    meta: { title: 'Skill 蒸馏' },
  },
  {
    path: '/memory',
    name: 'memory',
    component: () => import('../views/MemoryPage.vue'),
    meta: { title: '记忆管理' },
  },
  {
    path: '/plugins',
    name: 'plugins',
    component: () => import('../views/PluginsPage.vue'),
    meta: { title: '插件管理' },
  },
  {
    path: '/data-sources',
    name: 'data-sources',
    component: () => import('../views/DataSourcesPage.vue'),
    meta: { title: '数据源' },
  },
  {
    path: '/ontologies',
    name: 'ontologies',
    component: () => import('../views/OntologyPage.vue'),
    meta: { title: '本体管理' },
  },
  {
    path: '/std-attributes',
    name: 'std-attributes',
    component: () => import('../views/StdAttributesPage.vue'),
    meta: { title: '标准属性' },
  },
  {
    path: '/sql-console',
    name: 'sql-console',
    component: () => import('../views/DataConsolePage.vue'),
    meta: { title: 'SQL 控制台' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/Settings.vue'),
    // mobilePageShell（Task 11.2）：移动端用页面自带四段式骨架（MobilePageShell），
    // 共享壳据此隐藏 mobile-topbar；仅移动外壳消费，桌面端无感。
    meta: { title: '设置', mobilePageShell: true },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 移动端（Capacitor）屏蔽的重功能路由：开发模式/浏览器/Skill蒸馏/本体/SQL控制台/数据源/节点/IM连接
const MOBILE_BLOCKED_PATHS = new Set([
  '/code', '/browser', '/distill', '/ontologies', '/std-attributes',
  '/sql-console', '/data-sources', '/peers', '/connections',
]);

/**
 * 模式路由 → 模式 key。授权分级（版本档）据此拦截**未授权模式**的路由。
 *
 * 为什么要在这里拦：前端隐藏入口只挡住了"点得着"的路径，手输 `#/ops`、
 * 历史书签、外部跳转仍能直达 —— 这层是「前端入口禁用」的兜底，缺了它等于没禁。
 * 注意运维/安全是插件贡献的路由（`syncPluginRoutes` 动态加），也要一并覆盖。
 */
const MODE_ROUTE_KEYS: Record<string, AppMode> = {
  '/chat': 'office',
  '/workflow': 'wf',
  '/code': 'dev',
  '/clip': 'clip',
  '/ops': 'ops',
  '/sec': 'sec',
  '/shop': 'shop',
};

/** 未授权模式的重定向落点：第一个可见模式的路由（阉割版 = /chat）。 */
function firstLicensedRoute(): string {
  const first = visibleModeDefs.value[0];
  return first ? modeRoute(first.key) : '/chat';
}

/**
 * 插件路由「首次同步完成」的信号 —— 治冷启动竞态。
 *
 * `/ops`、`/sec`、`/shop` 的模式路由**是插件贡献的**（见各插件 manifest 的
 * `contributes.routes`），RouteRecord 由 `syncPluginRoutes()` 在
 * `onMounted → pluginStore.refresh()` 之后才 addRoute。而冷启动时用户可能一上来
 * 就落在这些路径上：桌面端上次会话的窗口 URL、书签、外部跳转、移动端 deep link、
 * 多窗口的第二个窗口。首次导航跑在 addRoute 之前 → `to.matched` 为空 → 无匹配 →
 * 空白页（观感是「点了一下没反应 / 白屏」，而不是什么错误提示）。
 * 处置见 `beforeEach` 末尾：等这个信号（带上限）再重导航一次。
 */
let pluginRoutesSynced = false;
let resolvePluginRoutesSynced: (() => void) | null = null;
const pluginRoutesSyncedSignal = new Promise<void>((resolve) => {
  resolvePluginRoutesSynced = resolve;
});

/** 插件路由首次同步完成的信号；已同步则立即 resolve。 */
export function whenPluginRoutesSynced(): Promise<void> {
  return pluginRoutesSynced ? Promise.resolve() : pluginRoutesSyncedSignal;
}

function markPluginRoutesSynced(): void {
  if (pluginRoutesSynced) return;
  pluginRoutesSynced = true;
  resolvePluginRoutesSynced?.();
  resolvePluginRoutesSynced = null;
}

/** 冷启动等待上限：插件层 403（授权门禁未放行）或接口挂了时，不能把用户无限期按在空白页上。 */
const PLUGIN_ROUTES_SYNC_TIMEOUT_MS = 3000;

/**
 * 等插件路由首次同步，最多等 maxMs。
 * 超时不是错误分支：到点就放行，让这次导航按「确实没有这条路由」走完 ——
 * 好过一直挂在空白页上（用户至少还能从侧栏去到别处）。
 */
function waitForPluginRoutes(maxMs = PLUGIN_ROUTES_SYNC_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, maxMs);
    whenPluginRoutesSynced().then(done, done);
  });
}

/**
 * 冷启动重试过的路径 —— 防重导航成环。
 *
 * 等完（或超时）后路由仍没注册上时，重导航会再次走到同一个分支：没有这个集合就是
 * 「等 → 重导航 → 再等」的死循环。注意 vue-router 的无限重定向保护**只在 dev 生效**
 * （`process.env.NODE_ENV !== 'production'`），线上会真的转不出来。
 */
const coldStartRetried = new Set<string>();

router.beforeEach(async (to) => {
  // 移动端重功能路由重定向到对话页，避免手动输 URL 进入
  if (isCapacitor && MOBILE_BLOCKED_PATHS.has(to.path)) {
    return { path: '/chat' };
  }
  // 桌面端本地单机应用无登录概念：/login 直接回对话页
  if (isElectron && to.path === '/login') {
    return { path: '/chat' };
  }
  // 授权码门禁：未激活时拦截到授权页（license/login 页本身放行）
  if (to.path !== '/license' && to.path !== '/login' && !to.meta.guest) {
    const licenseStore = useLicenseStore();
    await licenseStore.init();
    if (!licenseStore.verified) {
      return { path: '/license' };
    }
  }
  // ★ 版本档门禁：目标路由属于未授权模式 → 挡回首个可见模式。
  //   必须在 licenseStore.init() 之后 —— 授权信息（放行模式清单）是 init 时拿到的，
  //   放在前面会因 modes 未就绪而全部放行（等于没拦）。
  const targetMode = MODE_ROUTE_KEYS[to.path];
  if (targetMode && !isModeLicensed(targetMode)) {
    return { path: firstLicensedRoute() };
  }
  // 模式记忆（泛化）：停留在非办公模式时去了别的页面，再回「任务」应恢复该模式工作台。
  // 四模式是同一份工作上下文的四个视图，切换入口统一在顶栏模式下拉（原「任务」项）。
  if (
    to.path !== '/code' &&
    (to.path === '/chat' || to.path.startsWith('/chat/')) &&
    activeMode.value !== 'office' &&
    // 当前模式已失权时不再跳回它（否则换低档码后 /chat 会被弹到一个不该存在的模式）
    isModeLicensed(activeMode.value)
  ) {
    return { path: modeRoute(activeMode.value) };
  }
  // ★ 冷启动竞态兜底：`/ops` 这类**插件贡献的模式路由**在冷启动时还没 addRoute，
  //   此刻 `to.matched` 为空（无匹配）→ 空白页。等首次同步完成（上限 3s）再重导航一次，
  //   这次路由表已就绪就能正常进。同一个路径只重试一次（见 coldStartRetried）。
  //   ★ 位置：必须放在上面两条门禁**之后** —— 未激活授权 / 未授权模式该当场弹走，
  //     不该陪跑这几秒（授权门禁未放行时 /plugins 是 403，永远等不到同步完成）。
  if (to.matched.length === 0 && MODE_ROUTE_KEYS[to.path] && !coldStartRetried.has(to.fullPath)) {
    coldStartRetried.add(to.fullPath);
    await waitForPluginRoutes();
    // replace：冷启动的首次导航不该在历史里多留一条（否则「返回」会退到同一个页面）
    return { path: to.path, query: to.query, hash: to.hash, replace: true };
  }
});

/** 动态挂载插件贡献的前端路由（在 usePluginStore.refresh 之后调用） */
export async function syncPluginRoutes(): Promise<void> {
  try {
    const pluginStore = usePluginStore();
    for (const r of pluginStore.routes) {
      if (router.hasRoute(r.name)) continue;
      const comp = resolvePluginComponent(r.component);
      if (!comp) continue;
      router.addRoute({
        path: r.path,
        name: r.name,
        component: comp as () => Promise<unknown>,
        meta: r.meta,
      });
    }
    // 首次同步完成 → 放行冷启动里等着的导航（见 whenPluginRoutesSynced）
    markPluginRoutesSynced();
  } catch {
    /* plugin store 未就绪 */
  }
}

export default router;
