// Web 端入口
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import App from '@yan-zhi/ui/App.vue';
import { router } from '@yan-zhi/ui';
import { setPlatformAdapter, initSchema } from '@yan-zhi/core';
import { webAdapter } from './platform';

const log = (...args: unknown[]) => console.log('[Web]', ...args);
const logErr = (...args: unknown[]) => console.error('[Web]', ...args);

log('Web 端启动中...');
log('平台适配器:', webAdapter.platform);

// 注入 Web 平台适配器
setPlatformAdapter(webAdapter);
log('平台适配器已注入');

// 初始化数据库
initSchema((sql) => webAdapter.db.exec(sql))
  .then(() => {
    log('数据库 schema 初始化完成');
    const app = createApp(App);
    for (const [key, comp] of Object.entries(Icons)) {
      app.component(key, comp as any);
    }
    app.use(createPinia());
    app.use(router);
    app.use(ElementPlus);
    app.mount('#app');
    log('Vue 应用已挂载');
  })
  .catch((err) => {
    logErr('数据库初始化失败:', err);
    const app = createApp(App);
    for (const [key, comp] of Object.entries(Icons)) {
      app.component(key, comp as any);
    }
    app.use(createPinia());
    app.use(router);
    app.use(ElementPlus);
    app.mount('#app');
    logErr('Vue 应用已降级挂载（数据库不可用）');
  });
