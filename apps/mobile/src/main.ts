// 移动端入口（Capacitor）
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import App from '@yan-zhi/ui/App.vue';
import { router } from '@yan-zhi/ui';
import { setPlatformAdapter, initSchema, seedBuiltinSkills } from '@yan-zhi/core';
import { mobileAdapter } from './platform';

setPlatformAdapter(mobileAdapter);

/** 挂载应用。抽成函数是为了让初始化失败时也能走进来 —— 见下方 catch。 */
function mountApp(): void {
  const app = createApp(App);
  for (const [key, comp] of Object.entries(Icons)) {
    app.component(key, comp as any);
  }
  app.use(createPinia());
  app.use(router);
  app.use(ElementPlus);
  app.mount('#app');
}

// ★ 初始化失败必须仍然挂载：原先这条链没有 catch，initSchema / seedBuiltinSkills
//   任意一步 reject（如 SQLite 插件未就绪、原生模块 ABI 不匹配）都会让 .then 短路，
//   app.mount 永远不执行 —— 用户看到的是**纯白屏且无任何提示**，只能在 logcat 里找原因。
//   表结构没建好只影响数据库相关功能，不该连界面一起拖死；界面能出来至少能进设置、
//   能看到报错信息，比白屏可诊断得多。
initSchema((sql) => mobileAdapter.db.exec(sql))
  .then(() => seedBuiltinSkills((sql, params) => mobileAdapter.db.exec(sql, params)))
  .catch((err) => {
    console.error('[mobile] 数据库初始化失败，界面仍将启动：', err);
  })
  .finally(() => {
    mountApp();
  });
