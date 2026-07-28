// 路由定义
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/chat' },
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
    meta: { title: '聊天工作台' },
  },
  {
    path: '/chat/:convId',
    name: 'chat-detail',
    component: () => import('../views/Chat.vue'),
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
    path: '/agents/:id',
    name: 'agent-canvas',
    component: () => import('../views/AgentCanvas.vue'),
    meta: { title: '智能体画布' },
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

export default router;
