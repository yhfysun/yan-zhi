/**
 * 工作流模式插件（mode-pluginization P4）。
 *
 * workflow 引擎（packages/core 的 workflow 执行器 + 定时调度）留在基座，
 * 插件只贡献模式元数据与 /workflow 路由 —— 与 dev-mode 同一形态。
 */
import type { PluginManifest, PluginModule } from '@yan-zhi/core';
import { wfModeScene, wfModeAgentDefs } from './wf-mode/seed.js';
import { applyBuiltinSeed } from '../host-bridge.js';

export const WF_MODE_ID = 'wf-mode';

export const wfModeManifest: PluginManifest = {
  id: WF_MODE_ID,
  name: '工作流模式',
  version: '0.1.0',
  category: '操作',
  description: '工作流工作台：编排运行、调试、定时触发；引擎在基座，插件贡献入口与模式元数据。',
  contributes: {
    mode: {
      key: 'wf',
      label: '工作流模式',
      icon: 'Connection',
      route: '/workflow',
      fallbackAgent: 'a_builtin_workflow_assistant',
    },
    routes: [
      { path: '/workflow', name: 'wf', component: 'views/WorkflowWorkbench.vue' },
    ],
  },
};

const wfModeModule: PluginModule = {
  activate() {
    applyBuiltinSeed({ scenes: [wfModeScene], agents: wfModeAgentDefs, agentModes: { a_builtin_workflow_assistant: 'workflow' } });
    /* 纯声明式：模式与路由都来自 manifest.contributions */
  },
};

export { wfModeModule };
