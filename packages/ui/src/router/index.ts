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
    // 独立执行窗口（2026-10-17）：把一个任务单独开 OS 窗口跑给用户/录屏看。
    // 只读执行监视器（状态 + 计划进度 + 消息流），交互仍在主窗口会话页。
    // 同 diff-window：bare 不套应用外壳；guest 免授权门禁（子窗口独立渲染进程）。
    path: '/task-window/:convId',
    name: 'task-window',
    component: () => import('../views/TaskRunWindow.vue'),
    meta: { title: '任务执行', bare: true, guest: true },
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
  {
    // ★ 兜底页（2026-10-16）：**必须留在数组最后**（vue-router 按注册顺序匹配，前面先命中）。
    //
    // 为什么要有（用户实报「切到别的模式还是黑屏、没有任何报错」）：无匹配路径时
    // `<router-view>` 什么都不渲染，深色主题下整个内容区就是一块黑，控制台只有一条
    // `[Vue Router warn]: No match found ...` —— 用户不知道发生了什么，也退不出来。
    // 兜底页把这种状态变成「看得见的一句话 + 一个出口按钮」。
    // 插件贡献的模式路由（/ops、/sec、/shop）冷启动时还没注册，也会先落到这里，
    // 页面文案因此分「插件层还没就绪」与「真的没有这个地址」两种（见 RouteFallback.vue）。
    //
    // ⚠️ meta.fallback 是给守卫认的标记：挂了它之后 `to.matched` 不再为空，
    //    所有「是否没匹配上」的判断都必须改用 isFallbackRoute()（见其注释）。
    path: '/:pathMatch(.*)*',
    name: 'route-fallback',
    component: () => import('../views/RouteFallback.vue'),
    // 不给 guest：未激活授权时，无匹配路径仍应被授权门禁弹到 /license（与挂兜底页之前一致）。
    meta: { title: '页面未就绪', fallback: true },
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
 * 模式路由是否**真的注册在路由表里**（★ 2026-10-16 新增，治「切换模式后黑屏」）。
 *
 * 为什么需要：`/ops`、`/sec`、`/shop` 这类模式路由由插件贡献、冷启动时才 addRoute。
 *   「模式记忆」重定向（下面 beforeEach 里 /chat → modeRoute(activeMode)）此前**不看
 *   目标路由存不存在**就直接把用户送过去 —— 一旦那个插件路由还没注册上（dev 冷启动
 *   后端慢、插件接口 403、插件被禁用），重定向的落点就是一条无匹配路径：
 *   内容区整块空白、控制台只有一条 `No match found` 的 warn，且**每次想去对话都被弹回
 *   同一个空白页** —— 用户看到的就是「切到别的模式还是黑屏」。有了这道判断，
 *   路由没就绪时就不再抢着重定向，用户能正常去 /chat，等插件路由真到了再走模式记忆。
 *
 * ⚠️ 用 getRoutes().some(path 相等) 而不是 router.hasRoute(name)：模式 key 与路由 name
 *   并不总是一致（office→'chat'、dev→'code'、wf→'workflow'），只有 path 口径是统一的。
 *   也不用 router.resolve()：它对无匹配路径同样会打那条 warn（白白刷控制台）。
 */
function isModeRouteRegistered(m: AppMode): boolean {
  const target = modeRoute(m);
  return router.getRoutes().some((r) => r.path === target);
}

/**
 * 「这条导航到底有没有落在一个真页面上」的统一口径（2026-10-16 与兜底页一起引入）。
 *
 * 为什么不能只看 `to.matched.length === 0`：末尾挂了一条 `/:pathMatch(.*)*` 兜底路由之后，
 * 任何无匹配路径都会 matched 到兜底页 ⇒ length 恒 ≥1，旧判断全部失效。所以改成看
 * `meta.fallback` 标记。**凡是要判断"没匹配上"的地方都必须走这里**，别再写 length===0。
 */
function isFallbackRoute(r: { matched: Array<{ meta?: Record<string, unknown> }> }): boolean {
  return r.matched.length === 0 || r.matched.some((m) => !!m.meta?.fallback);
}

/**
 * 插件路由「首次同步完成」的信号 —— 治冷启动竞态，也是兜底页「自动再进一次」的扳机。
 *
 * `/ops`、`/sec`、`/shop` 的模式路由**是插件贡献的**（见各插件 manifest 的
 * `contributes.routes`），RouteRecord 由 `syncPluginRoutes()` 在
 * `onMounted → pluginStore.refresh()` 之后才 addRoute。而冷启动时用户可能一上来
 * 就落在这些路径上：桌面端上次会话的窗口 URL、书签、外部跳转、移动端 deep link、
 * 多窗口的第二个窗口。首次导航跑在 addRoute 之前 → 无匹配。
 *
 * ★★ 2026-10-16 撤掉「守卫里阻塞等插件路由」的旧兜底（用户实报「切到运维模式整块黑屏」
 *    ＋控制台只有一条 `No match found for location with path "/ops"`）。
 * 旧做法：`to.matched` 为空且目标是模式路由时 `await waitForPluginRoutes()`（3s，dev 一度
 *   放宽到 10s）再重导航。两个问题：
 *     ① **等待期间内容区什么都没有** —— 导航挂在 pending，`<router-view>` 不渲染，
 *        深色主题下看就是"黑屏"，且这段时间点什么都没反应（导航被占住）；
 *     ② 等待有上限，超时后照样落在「没这条路由」上 —— 后端慢（dev 现编译）时只是把黑屏推迟。
 * 现做法：**不阻塞**，让这次导航按「没匹配上」走完 → 末尾的兜底路由接住它 → 渲染
 *   RouteFallback（"还在载入 / 没有这个页面" + 重试 + 回对话）；插件路由一注册完就
 *   自动再进一次（本信号 + recoverIfCurrentRouteUnmatched 两条路都盯着）。
 *   冷启动 / 后端慢 / 插件被禁用三种情况走同一条路径，不再有三套时序假设。
 */
let pluginRoutesSynced = false;
let resolvePluginRoutesSynced: (() => void) | null = null;
const pluginRoutesSyncedSignal = new Promise<void>((resolve) => {
  resolvePluginRoutesSynced = resolve;
});

/** 插件路由首次同步完成的信号；已同步则立即 resolve。兜底页据此决定"自动再进一次"的时机。 */
export function whenPluginRoutesSynced(): Promise<void> {
  return pluginRoutesSynced ? Promise.resolve() : pluginRoutesSyncedSignal;
}

/** 插件路由是否已同步过（同步即真值、不回退）。兜底页据此区分「还在加载」与「确实没有」。 */
export function arePluginRoutesSynced(): boolean {
  return pluginRoutesSynced;
}

function markPluginRoutesSynced(): void {
  if (pluginRoutesSynced) return;
  pluginRoutesSynced = true;
  resolvePluginRoutesSynced?.();
  resolvePluginRoutesSynced = null;
}

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
    isModeLicensed(activeMode.value) &&
    // ★ 2026-10-16：目标模式路由还没注册时**不许**抢着重定向 —— 否则落点是空白页，
    //   而且会把每一次「回对话」都弹回同一个空白页（见 isModeRouteRegistered 注释）。
    isModeRouteRegistered(activeMode.value)
  ) {
    return { path: modeRoute(activeMode.value) };
  }
  // ★ 冷启动竞态这里**刻意什么都不做**：/ops 这类插件贡献的模式路由此时还没 addRoute，
  //   本次导航会落到末尾的兜底路由（meta.fallback）→ 渲染 RouteFallback（"还在载入…"），
  //   插件路由一到（syncPluginRoutes → markPluginRoutesSynced）就自动再进一次。
  //   旧的"await 等插件路由再重导航"已撤 —— 见文件上方那段说明（等待期间就是黑屏）。
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
    recoverIfCurrentRouteUnmatched();
  } catch {
    /* plugin store 未就绪 */
  }
}

/**
 * ★ 2026-10-16「迟到注册自愈」：路由注册完，若**当前**停在一条无匹配的路径上，就地重导航一次。
 *
 * 为什么必须有（用户实报「进运维模式再切别的模式还是黑屏、无报错」）：冷启动那条路径
 *   「等插件路由 → 3s(dev 10s) 超时 → 放行 → 导航带着 unmatched 落定」之后，路由表**才**
 *   补上 —— 而 Vue 不会因为你 addRoute 就重跑一次导航，`<router-view>` 便永远渲染空。
 *   页面上没有任何报错、外壳还在，观感就是"黑屏卡住"。
 *   有了这一句，无论注册迟到多久，当前页都会自己恢复。
 *
 * replace 而非 push：这条重导航是修页面，不是用户操作，不该进历史栈。
 * 防环：重导航会再走一遍 beforeEach，此时 matched 已非空（刚注册上）⇒ 不会再次触发；
 *   即便极端情况下仍匹配不上，coldStartRetried 也挡着那次「等待」分支。
 */
function recoverIfCurrentRouteUnmatched(): void {
  const cur = router.currentRoute.value;
  if (!isFallbackRoute(cur)) return;
  // 只捞「本该是模式页」的地址（/ops 这类插件路由）。两条不捞的理由：
  //   · START_LOCATION（首次导航还没落定，path='/'）：捞它就等于把用户**想去 /ops** 的
  //     那次导航改写成回首页 —— 而它随后会正常走完，无需插手；
  //   · 真正的野路径：捞它只会原地再失败一次，交给兜底页自己的「重试」按钮。
  const mode = MODE_ROUTE_KEYS[cur.path];
  if (!mode || !isModeRouteRegistered(mode)) return;
  void router.replace({ path: cur.path, query: cur.query, hash: cur.hash });
}

export default router;
