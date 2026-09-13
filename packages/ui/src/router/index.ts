// 路由定义
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { useLicenseStore } from '../stores/license';
import { usePluginStore } from '../stores/plugin';
import { resolvePluginComponent } from '../plugin-component-registry';
import { isElectron, isCapacitor } from '../api/client';
import { isCodeModeActive } from '../stores/code';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/chat' },
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
    meta: { title: '设置' },
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
  // 代码模式记忆：停留在代码模式时去了别的页面，再回「任务」应恢复代码工作台。
  // 只有代码模式里的「返回任务」按钮（先清标记再跳 /chat）才能回到普通聊天布局。
  if (
    to.path !== '/code' &&
    (to.path === '/chat' || to.path.startsWith('/chat/')) &&
    isCodeModeActive()
  ) {
    return { path: '/code' };
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
  } catch {
    /* plugin store 未就绪 */
  }
}

export default router;
