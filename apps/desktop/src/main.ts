// 桌面端入口（Tauri）
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import { info, error, attachConsole } from '@tauri-apps/plugin-log';
import App from '@yan-zhi/ui/App.vue';
import { router } from '@yan-zhi/ui';
import { setPlatformAdapter, initSchema } from '@yan-zhi/core';
import { desktopAdapter } from './platform';

// 将前端日志重定向到 Tauri log（文件 + stdout），
// 日志文件位置: %APPDATA%/com.yan-zhi.desktop/logs/yan-zhi.log
await attachConsole();

info('Tauri 桌面端启动中...');
info(`平台适配器: ${desktopAdapter.platform}`);

// 注入桌面平台适配器
setPlatformAdapter(desktopAdapter);
info('平台适配器已注入');

// 初始化数据库
initSchema((sql) => desktopAdapter.db.exec(sql))
  .then(() => {
    info('数据库 schema 初始化完成');
    const app = createApp(App);
    for (const [key, comp] of Object.entries(Icons)) {
      app.component(key, comp as any);
    }
    app.use(createPinia());
    app.use(router);
    app.use(ElementPlus);
    app.mount('#app');
    info('Vue 应用已挂载');
  })
  .catch((err) => {
    error(`数据库初始化失败: ${String(err)}`);
    const app = createApp(App);
    for (const [key, comp] of Object.entries(Icons)) {
      app.component(key, comp as any);
    }
    app.use(createPinia());
    app.use(router);
    app.use(ElementPlus);
    app.mount('#app');
    error('Vue 应用已降级挂载（数据库不可用）');
  });
