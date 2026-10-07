// 移动端入口（Capacitor）
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import App from '@yan-zhi/ui/App.vue';
import { router } from '@yan-zhi/ui';
import { setPlatformAdapter, initSchema, seedBuiltinSkills } from '@yan-zhi/core';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ElMessage } from 'element-plus';
import { mobileAdapter } from './platform';
import { resumeSmsForwardIfEnabled } from './sms-forward';

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

/**
 * Android 物理返回键。优先级：关闭 Element Plus 浮层 → 路由回退 → 首页双击退出。
 * 原先完全没接 backButton：按返回键行为未定义（系统默认直接退出应用），
 * 弹窗开着也会被整个杀掉。
 */
function registerBackButton(): void {
  // web / 预览环境没有原生壳，不注册（@capacitor/app 的 web 实现也不会有硬件返回键）
  if (!Capacitor.isNativePlatform()) return;
  let lastBackAt = 0;
  CapApp.addListener('backButton', () => {
    // 1) 浮层优先：EP 弹窗/抽屉用 .el-overlay（v-show 关闭态带 display:none），
    //    select/日期等下拉 popper 用 aria-hidden 标记。命中即派发 ESC，
    //    交给 Element Plus 自己的全局 Esc 关闭逻辑（关最上层）。
    const overlayOpen = document.querySelector(
      '.el-overlay:not([style*="display: none"]), .el-popper[aria-hidden="false"]',
    );
    if (overlayOpen) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    // 2) 路由能回退就回退：vue-router 在 history.state 写有 back 字段
    const st = window.history.state as { back?: string | null } | null;
    if (st?.back) {
      router.back();
      return;
    }
    // 3) 已在首页：2 秒内连按两次才退出，避免误触直接杀进程
    const now = Date.now();
    if (now - lastBackAt < 2000) {
      void CapApp.exitApp();
      return;
    }
    lastBackAt = now;
    ElMessage({ message: '再按一次退出', type: 'info', duration: 2000 });
  });
}

// ★ 初始化失败必须仍然挂载：原先这条链没有 catch，initSchema / seedBuiltinSkills
//   任意一步 reject（如 SQLite 插件未就绪、原生模块 ABI 不匹配）都会让 .then 短路，
//   app.mount 永远不执行 —— 用户看到的是**纯白屏且无任何提示**，只能在 logcat 里找原因。
//   表结构没建好只影响数据库相关功能，不该连界面一起拖死；界面能出来至少能进设置、
//   能看到报错信息，比白屏可诊断得多。
//   ★ 新增任何 await 初始化步骤时，必须确保最终一定会走到 app.mount（见 issues 台账留档）。
initSchema((sql) => mobileAdapter.db.exec(sql))
  .then(() => seedBuiltinSkills((sql, params) => mobileAdapter.db.exec(sql, params)))
  .catch((err) => {
    console.error('[mobile] 数据库初始化失败，界面仍将启动：', err);
  })
  .finally(() => {
    mountApp();
    try {
      registerBackButton();
    } catch (err) {
      console.error('[mobile] 返回键注册失败（不影响使用）：', err);
    }
    // 短信验证码转发：若用户在设置里开过，App 启动时自动恢复监听
    // （失败不影响使用，只影响自动转发能力）
    void resumeSmsForwardIfEnabled().catch((err) => {
      console.error('[mobile] 短信转发恢复失败（不影响使用）：', err);
    });
  });
