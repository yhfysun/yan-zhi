/**
 * 剪辑模式插件（mode-pluginization P4）。
 *
 * 职责收拢：
 *  · 后端：`/api/plugin/clip-mode/*` 剪辑工程/素材/字幕/音效/预览接口（薄壳在
 *    routes/clip.ts，纯逻辑在 services/clip-*、mcp/{ffmpeg,whisper}-runtime、subtitle-style）；
 *  · 模式元数据：contributes.mode 声明 clip（label/icon/route/兜底智能体），前端运行时合并；
 *  · 前端路由：contributes.routes 提供 /clip（组件由构建期 PLUGIN_VIEW_LOADERS 解析）。
 *
 * ★ 为什么要包化（而不是继续挂 /api/clip 的宿主路由）：
 *   剪辑所需的 ffmpeg/whisper 运行时、音效合成、字幕样式是一整套**可选能力** ——
 *   打包时未选 clip 就物理不存在（P5），装回插件即恢复（"装了就有"）。
 *   会话数据不随插件消失：工程文件在会话产物目录，停用只是入口与接口消失。
 *
 * ★ 宿主能力一律经 host-bridge：db / 鉴权 / 会话硬删 / 产物目录解析都是宿主单例，
 *   复制第二份会造出第二个 SQLite 实例或算错根目录（见 build-plugins 的宿主边界硬闸）。
 */
import type { PluginManifest, PluginModule } from '@yan-zhi/core';
import { clipModeAgentDefs } from './clip-mode/seed.js';
import { applyBuiltinSeed } from '../host-bridge.js';
import clipRoutes from '../routes/clip.js';

export const CLIP_MODE_ID = 'clip-mode';

export const clipModeManifest: PluginManifest = {
  id: CLIP_MODE_ID,
  name: '剪辑模式',
  version: '0.1.0',
  category: '操作',
  description:
    '剪辑工作台：时间轴剪辑、多段拼接、字幕（含动画样式）、音效库、音乐节拍、语音转字幕、实时预览与导出成片。'
    + '「剪辑模式」入口打开 /clip；内置剪辑师智能体（clip_project 工具）与人工剪辑共用同一份工程文件。',
  permissions: ['shell', 'fs', 'network'],
  contributes: {
    mode: {
      key: 'clip',
      label: '剪辑模式',
      icon: 'VideoCamera',
      route: '/clip',
      fallbackAgent: 'a_builtin_clip_agent',
    },
    routes: [
      { path: '/clip', name: 'clip', component: 'views/ClipWorkbench.vue' },
    ],
  },
};

const clipModeModule: PluginModule = {
  activate(ctx) {
    applyBuiltinSeed({ agents: clipModeAgentDefs });
    // 路由挂载点 = /api/plugin/clip-mode（宿主 index.ts 统一挂），内部路径与迁移前一致
    ctx.registerBackendRoute((app: unknown) => {
      const r = app as { use: (h: unknown) => void };
      r.use(clipRoutes);
    });
  },
};

export { clipModeModule };
