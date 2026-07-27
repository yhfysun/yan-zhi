// 移动端入口（Capacitor）
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import App from '@yan-zhi/ui/App.vue';
import router from '@yan-zhi/ui';
import { setPlatformAdapter, initSchema } from '@yan-zhi/core';
import { mobileAdapter } from './platform';

setPlatformAdapter(mobileAdapter);

initSchema((sql) => mobileAdapter.db.exec(sql)).then(() => {
  const app = createApp(App);
  for (const [key, comp] of Object.entries(Icons)) {
    app.component(key, comp as any);
  }
  app.use(createPinia());
  app.use(router);
  app.use(ElementPlus);
  app.mount('#app');
});
