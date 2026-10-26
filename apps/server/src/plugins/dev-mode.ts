/**
 * 开发模式插件（mode-pluginization P4）。
 *
 * 本模式**没有后端接口**（code 工具、workflow 执行器等公共能力留在基座），
 * 插件只贡献两样东西：
 *  · `contributes.mode`：dev 的 label/icon/route/兜底智能体（前端运行时合并）；
 *  · `contributes.routes`：/code 路由（组件由构建期 PLUGIN_VIEW_LOADERS 解析）。
 *
 * ★ 为什么"纯视图模式"也要做成插件：模式 = 能力开关。打包时未选 dev 就不带视图与入口，
 *   装回插件即恢复；这与 ops/sec/shop 的语义一致，P5 的 `--plugins=` 裁剪才有统一口径。
 *   停用只让入口与页面消失，**会话与代码工程都在**（数据不随插件走）。
 */
import type { PluginManifest, PluginModule } from '@yan-zhi/core';
import { devModeScene } from './dev-mode/seed.js';
import { applyBuiltinSeed } from '../host-bridge.js';

export const DEV_MODE_ID = 'dev-mode';

export const devModeManifest: PluginManifest = {
  id: DEV_MODE_ID,
  name: '开发模式',
  version: '0.1.0',
  category: '操作',
  description: '代码工作台：读写项目、改 Bug、看差异；内置开发助手智能体。「开发模式」入口打开 /code。',
  contributes: {
    mode: {
      key: 'dev',
      label: '开发模式',
      icon: 'Monitor',
      route: '/code',
      fallbackAgent: 'a_builtin_code_agent',
    },
    routes: [
      { path: '/code', name: 'dev', component: 'views/CodeWorkbench.vue' },
    ],
  },
};

const devModeModule: PluginModule = {
  activate() {
    applyBuiltinSeed({ scenes: [devModeScene] });
    /* 纯声明式：模式与路由都来自 manifest.contributions，无需后端注册 */
  },
};

export { devModeModule };
