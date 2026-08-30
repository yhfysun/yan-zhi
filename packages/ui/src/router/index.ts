// 路由定义
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { useLicenseStore } from '../stores/license';
import { usePluginStore } from '../stores/plugin';
import { resolvePluginComponent } from '../plugin-component-registry';

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
    meta: { title: '对话工作台' },
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
    path: '/mcp',
    name: 'mcp',
    component: () => import('../views/Mcp.vue'),
    meta: { title: 'MCP 服务' },
  },
  {
    path: '/mcp/:id',
    name: 'mcp-detail',
    component: () => import('../views/Mcp.vue'),
    meta: { title: 'MCP 服务详情' },
  },
  {
    path: '/tools',
    name: 'tools',
    component: () => import('../views/ToolMarket.vue'),
    meta: { title: '工具管理' },
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

router.beforeEach(async (to) => {
  // 授权码门禁：未激活时拦截到授权页（license/login 页本身放行）
  if (to.path !== '/license' && to.path !== '/login' && !to.meta.guest) {
    const licenseStore = useLicenseStore();
    await licenseStore.init();
    if (!licenseStore.verified) {
      return { path: '/license' };
    }
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
