/**
 * 学习模式插件。
 *
 * 学习业务数据、路由 API 和学习陪练智能体仍由基座提供；插件负责模式入口与页面装载，
 * 这样打包时未选择 learning-mode 就不会带入学习页面，Pro 档位默认包含该插件。
 */
import type { PluginManifest, PluginModule } from '@yan-zhi/core';

export const LEARNING_MODE_ID = 'learning-mode';

export const learningModeManifest: PluginManifest = {
  id: LEARNING_MODE_ID,
  name: '学习模式',
  version: '0.1.0',
  category: '学习',
  description: '22 科零基础课程、医学中医与西医双路径、编程企业交付、算法故事闯关与数千题型实战、原文与出处、实践工作台、AI 陪练与公共图书馆。仅 Pro 档默认包含。',
  contributes: {
    mode: {
      key: 'learning',
      label: '学习模式',
      icon: 'Reading',
      route: '/learning-v2',
      fallbackAgent: 'a_builtin_learning_coach',
    },
    routes: [
      { path: '/learning', name: 'learning', component: 'views/LearningV2.vue' },
      { path: '/learning-v2', name: 'learning-v2', component: 'views/LearningV2.vue' },
    ],
  },
};

const learningModeModule: PluginModule = {
  activate() {
    /* 纯声明式：模式与路由都来自 manifest.contributions；学习数据与 API 留在基座。 */
  },
};

export { learningModeModule };
