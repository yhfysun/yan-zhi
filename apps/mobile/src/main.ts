// 移动端入口（Capacitor）
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as Icons from '@element-plus/icons-vue';
import App from '@yan-zhi/ui/App.vue';
import { initPluginHostBridge, router } from '@yan-zhi/ui';
import { setPlatformAdapter, initSchema, seedBuiltinSkills, seedBuiltinPageCommands } from '@yan-zhi/core';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { ElMessageBox } from 'element-plus';
import { mobileAdapter } from './platform';
import { resumeSmsForwardIfEnabled } from './sms-forward';
import { registerAndroidM1NfcDriver } from './m1-nfc';
import { createHistoryBackGuard } from './back-navigation';

setPlatformAdapter(mobileAdapter);
// 插件前端 bundle 依赖宿主桥提供共享依赖；必须在挂载/同步插件路由前就绪。
initPluginHostBridge();
// M1 NFC 真机驱动：只有 Android 原生壳会注册，其余平台保持无驱动 → 课程自动走模拟器
registerAndroidM1NfcDriver();

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
 * Android 物理返回键。优先级：关闭 Element Plus 浮层 → 路由回退 → 首页退出确认。
 * 原先完全没接 backButton：按返回键行为未定义（系统默认直接退出应用），
 * 弹窗开着也会被整个杀掉。
 */
function registerBackButton(): void {
  // web / 预览环境没有原生壳，不注册（@capacitor/app 的 web 实现也不会有硬件返回键）
  if (!Capacitor.isNativePlatform()) return;
  let exitPromptOpen = false;
  const historyBackGuard = createHistoryBackGuard();
  window.addEventListener('popstate', historyBackGuard.noteHistoryPop);
  CapApp.addListener('backButton', () => {
    // Android 16 预测返回在部分厂商 WebView 上会先提交历史回退，再送原生回调。
    // 同一次手势只能消费一个页面层级，否则资讯会从“正文 → 资讯列表”变成“正文 → 上一菜单”。
    if (historyBackGuard.shouldIgnoreNativeBack()) return;
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
    // 2) 设置子页回到所属分组，而不是直接掉回设置首层
    const current = router.currentRoute.value;
    if (current.meta?.mobileSettingsChild) {
      const group = typeof current.query.group === 'string' ? current.query.group : '';
      void router.replace({ path: '/settings', query: group ? { group } : {} });
      return;
    }
    // 3) 允许页面先处理自己的页内层级（如“设置分组 → 设置首层”）
    const pageBack = new CustomEvent('yz:mobile-back', { cancelable: true });
    document.dispatchEvent(pageBack);
    if (pageBack.defaultPrevented) return;
    // 4) 路由能回退就回退：vue-router 在 history.state 写有 back 字段
    const st = window.history.state as { back?: string | null } | null;
    if (st?.back) {
      router.back();
      return;
    }
    // 5) 已在首页：给出明确选择，避免连续返回的隐式退出规则误关应用
    if (exitPromptOpen) return;
    exitPromptOpen = true;
    void ElMessageBox.confirm('确定退出言智吗？', '退出应用', {
      confirmButtonText: '退出应用',
      cancelButtonText: '继续使用',
      type: 'warning',
      closeOnClickModal: false,
    })
      .then(() => CapApp.exitApp())
      .catch(() => {})
      .finally(() => {
        exitPromptOpen = false;
      });
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
  // 内置「页面指令」种子（页面内对话方案 §5 P1）—— 与 skill 种子同链，仍在 .catch 之前
  .then(() => seedBuiltinPageCommands((sql, params) => mobileAdapter.db.exec(sql, params)))
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
