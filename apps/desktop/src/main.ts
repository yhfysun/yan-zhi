// 桌面端入口（Electron）
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import App from './App.vue';
import { router } from '@yan-zhi/ui';
import { setPlatformAdapter, initSchema, seedBuiltinSkills } from '@yan-zhi/core';
import { desktopAdapter } from './platform';

console.log('[desktop] Electron 桌面端启动中...');
console.log(`[desktop] 平台适配器: ${desktopAdapter.platform}`);

// 注入桌面平台适配器（LLM 请求走本地后端代理，避免 CORS 且隐藏 API Key）
setPlatformAdapter({ ...desktopAdapter, llmProxyBase: 'http://127.0.0.1:3001/api/llm' });
console.log('[desktop] 平台适配器已注入');

// 初始化数据库 schema，完成后挂载 Vue 应用
initSchema((sql) => desktopAdapter.db.exec(sql))
  .then(() => seedBuiltinSkills((sql, params) => desktopAdapter.db.exec(sql, params)))
  .then(() => {
    console.log('[desktop] 数据库 schema 初始化完成');
    const app = createApp(App);
    for (const [key, comp] of Object.entries(Icons)) {
      app.component(key, comp as any);
    }
    app.use(createPinia());
    app.use(router);
    app.use(ElementPlus);
    app.mount('#app');
    console.log('[desktop] Vue 应用已挂载');
  })
  .catch((err) => {
    console.error(`[desktop] 数据库初始化失败: ${String(err)}`);
    const app = createApp(App);
    for (const [key, comp] of Object.entries(Icons)) {
      app.component(key, comp as any);
    }
    app.use(createPinia());
    app.use(router);
    app.use(ElementPlus);
    app.mount('#app');
    console.error('[desktop] Vue 应用已降级挂载（数据库不可用）');
  });
