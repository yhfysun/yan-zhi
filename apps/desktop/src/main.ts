// 桌面端入口（Tauri）
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import { info, error, attachConsole } from '@tauri-apps/plugin-log';
import App from './App.vue';
import { router } from '@yan-zhi/ui';
import { setPlatformAdapter, initSchema } from '@yan-zhi/core';
import { desktopAdapter } from './platform';

// 安全日志包装：非 Tauri 环境（如浏览器预览）下 invoke 不可用，
// 直接调用 info/error 会抛 TypeError，导致 setPlatformAdapter 等后续逻辑被跳过。
// 用 try/catch 包裹确保日志失败不阻断启动流程。
const safeInfo = (msg: string) => { try { info(msg); } catch { /* non-Tauri env */ } };
const safeError = (msg: string) => { try { error(msg); } catch { /* non-Tauri env */ } };

// 将前端日志重定向到 Tauri log（文件 + stdout），
// 日志文件位置: %APPDATA%/com.yan-zhi.desktop/logs/yan-zhi.log
// 用 try/catch 包裹：非 Tauri 环境（如浏览器预览）或日志插件不可用时不阻断启动
try {
  await attachConsole();
} catch (e) {
  console.warn('[desktop] attachConsole 失败，跳过日志重定向', e);
}

safeInfo('Tauri 桌面端启动中...');
safeInfo(`平台适配器: ${desktopAdapter.platform}`);

// 注入桌面平台适配器
setPlatformAdapter(desktopAdapter);
safeInfo('平台适配器已注入');

// 初始化数据库
initSchema((sql) => desktopAdapter.db.exec(sql))
  .then(() => {
    safeInfo('数据库 schema 初始化完成');
    const app = createApp(App);
    for (const [key, comp] of Object.entries(Icons)) {
      app.component(key, comp as any);
    }
    app.use(createPinia());
    app.use(router);
    app.use(ElementPlus);
    app.mount('#app');
    safeInfo('Vue 应用已挂载');
  })
  .catch((err) => {
    safeError(`数据库初始化失败: ${String(err)}`);
    const app = createApp(App);
    for (const [key, comp] of Object.entries(Icons)) {
      app.component(key, comp as any);
    }
    app.use(createPinia());
    app.use(router);
    app.use(ElementPlus);
    app.mount('#app');
    safeError('Vue 应用已降级挂载（数据库不可用）');
  });
