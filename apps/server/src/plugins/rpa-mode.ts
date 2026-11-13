import type { PluginManifest, PluginModule } from '@yan-zhi/core';
import { applyBuiltinSeed } from '../host-bridge.js';
import { rpaModeScene } from './rpa-mode/seed.js';

export const RPA_MODE_ID = 'rpa-mode';

export const rpaModeManifest: PluginManifest = {
  id: RPA_MODE_ID,
  name: '自动化模式',
  version: '0.1.0',
  category: '操作',
  description: '固定脚本 RPA 工作台：脚本库、录制、时间线编辑、试跑、发布与运行记录。',
  contributes: {
    mode: {
      key: 'rpa',
      label: '自动化模式',
      icon: 'MagicStick',
      route: '/automation',
      fallbackAgent: 'a_builtin_rpa_builder',
    },
    routes: [
      { path: '/automation', name: 'automation', component: 'views/AutomationWorkbench.vue' },
    ],
  },
};

const rpaModeModule: PluginModule = {
  activate() {
    applyBuiltinSeed({
      scenes: [rpaModeScene],
      agentModes: { a_builtin_rpa_builder: 'rpa' },
    });
  },
};

export { rpaModeModule };
