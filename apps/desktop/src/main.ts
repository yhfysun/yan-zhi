// 桌面端入口（Electron）
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import App from './App.vue';
import { router } from '@yan-zhi/ui';
import { initPluginHostBridge } from '@yan-zhi/ui';
import { setPlatformAdapter, initSchema, seedBuiltinSkills, seedBuiltinPageCommands } from '@yan-zhi/core';
import { localApiBase } from '@yan-zhi/shared';
import { desktopAdapter } from './platform';

console.log('[desktop] Electron 桌面端启动中...');
console.log(`[desktop] 平台适配器: ${desktopAdapter.platform}`);
console.log(`[desktop] 后端基址: ${localApiBase()}`);
console.log(`[desktop] 实例: ${(window as any).electronAPI?.isDevInstance ? '开发' : '生产'}`);

// 首屏就绪信号：主进程收到后才 show 主窗并销毁 splash。
// 必须等 Vue 真正 mount —— dev 下 vite 重跑依赖预构建时，窗口会先以背景色（近黑）亮出来，
// 提前放行就是用户实报的「脚本启动黑屏」。
const notifyUiReady = () => {
  try { (window as any).electronAPI?.notifyUiReady?.(); } catch { /* 非桌面端忽略 */ }
};

// 注入桌面平台适配器（LLM 请求走后端代理，避免 CORS 且隐藏 API Key）
// ★ 基址随实例（生产 3001 / 开发 3002）—— 由 preload 下发，不写死。
// ★ 轻量壳（无本机后端）：必须跟随生效后端地址（登录页手填 > 打包内置 server-base.json），
//   否则 LLM 代理仍打 127.0.0.1，壳包只能聊天界面打不开模型。
const effectiveApiBase = (): string => {
  try {
    const saved = (localStorage.getItem('yz_server_base') || '').trim().replace(/\/+$/, '');
    if (saved) return `${saved}/api`;
  } catch { /* localStorage 不可用则走默认 */ }
  const baked = String((window as any).electronAPI?.serverBase || '').replace(/\/+$/, '');
  return baked ? `${baked}/api` : localApiBase();
};
setPlatformAdapter({ ...desktopAdapter, llmProxyBase: `${effectiveApiBase()}/llm` });
console.log('[desktop] 平台适配器已注入');

// 插件宿主桥（mode-pluginization）：任何插件前端装载之前必须挂好 window.__YZ_HOST__。
// 桥本身只挂共享依赖命名空间与受控 api 白名单（store 为异步工厂），无需 pinia 就绪。
initPluginHostBridge();
console.log('[desktop] 插件宿主桥已挂载');

function mountApp(): void {
  const app = createApp(App);
  for (const [key, comp] of Object.entries(Icons)) {
    app.component(key, comp as any);
  }
  app.use(createPinia());
  app.use(router);
  app.use(ElementPlus);
  app.mount('#app');
  console.log('[desktop] Vue 应用已挂载');
  notifyUiReady();
}

/** 普通浏览器打开壳的本机 `/remote`：没有 Electron preload，也没有桌面数据库。 */
function isRemoteGuestEntry(): boolean {
  try {
    const pathname = location.pathname.replace(/\/+$/, '');
    const hash = location.hash || '';
    return pathname === '/remote' || hash.startsWith('#/remote');
  } catch {
    return false;
  }
}

if (isRemoteGuestEntry()) {
  console.log('[desktop] 远程控制 guest 入口：跳过桌面数据库初始化');
  mountApp();
} else {
// 初始化数据库 schema，完成后挂载 Vue 应用
  initSchema((sql) => desktopAdapter.db.exec(sql))
    .then(() => seedBuiltinSkills((sql, params) => desktopAdapter.db.exec(sql, params)))
    // 内置「页面指令」种子（页面内对话方案 §5 P1）：与 skill 种子同一条链，幂等 upsert
    .then(() => seedBuiltinPageCommands((sql, params) => desktopAdapter.db.exec(sql, params)))
    .then(() => {
      console.log('[desktop] 数据库 schema 初始化完成');
      mountApp();
    })
    .catch((err) => {
      console.error(`[desktop] 数据库初始化失败: ${String(err)}`);
      mountApp();
      console.error('[desktop] Vue 应用已降级挂载（数据库不可用）');
    });
}
