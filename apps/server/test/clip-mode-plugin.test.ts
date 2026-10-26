// 剪辑模式插件（mode-pluginization P4）—— 清单契约 + 路由挂载口径守门。
//
// 钉住三件事（任何一条破了，界面表现都是「插件已启用但剪辑页空白/接口 404」）：
//   1) manifest 合法且声明 contributes.mode（key=clip / route=/clip / 兜底智能体）；
//   2) contributes.routes 提供的组件路径必须能被构建期 PLUGIN_VIEW_LOADERS 解析；
//   3) activate 只登记一条后端路由挂载，挂的就是剪辑 router（接口路径与迁移前一致，
//      差异只在挂载前缀 /api/plugin/clip-mode）。
import { describe, it, expect } from 'vitest';
import { validateManifest } from '@yan-zhi/core';
import { PLUGIN_VIEW_LOADERS } from '../../../packages/ui/src/generated/build-modes';
import { clipModeManifest, clipModeModule, CLIP_MODE_ID } from '../src/plugins/clip-mode.js';

describe('clip-mode 插件清单', () => {
  it('manifest 通过校验且 id/mode 对齐', () => {
    expect(() => validateManifest(clipModeManifest)).not.toThrow();
    expect(clipModeManifest.id).toBe(CLIP_MODE_ID);
    expect(clipModeManifest.contributes?.mode).toMatchObject({
      key: 'clip',
      route: '/clip',
      fallbackAgent: 'a_builtin_clip_agent',
    });
  });

  it('contributes.routes 的组件路径必须出现在前端插件视图装载表里', () => {
    const routes = clipModeManifest.contributes?.routes || [];
    expect(routes.map((r) => r.path)).toContain('/clip');
    for (const r of routes) {
      expect(typeof r.component).toBe('string');
      expect(
        PLUGIN_VIEW_LOADERS[r.component as string],
        `${r.component} 不在 PLUGIN_VIEW_LOADERS —— 运行时会解析到空组件（页面空白）`,
      ).toBeTypeOf('function');
    }
  });
});

describe('clip-mode 激活', () => {
  it('只登记一条后端路由挂载，且挂载的是剪辑 router（接口路径不变）', async () => {
    const setups: Array<(app: unknown) => void> = [];
    const ctx = {
      id: CLIP_MODE_ID,
      log: () => {},
      adapter: {},
      config: {},
      storage: { get: async () => undefined, set: async () => {}, delete: async () => {} },
      registerTool: () => ({ dispose: () => {} }),
      registerBackendRoute: (setup: (app: unknown) => void) => {
        setups.push(setup);
        return { dispose: () => {} };
      },
      registerWebSocket: () => ({ dispose: () => {} }),
    };
    await clipModeModule.activate(ctx as never);

    expect(setups).toHaveLength(1);
    const mounted: unknown[] = [];
    setups[0]({ use: (h: unknown) => mounted.push(h) });
    expect(mounted).toHaveLength(1);
    const router = mounted[0] as { stack?: Array<{ route?: { path?: string } }> };
    const paths = (router.stack || []).map((l) => l.route?.path).filter(Boolean);
    // 迁移前的接口路径原样保留（仅挂载前缀变 /api/plugin/clip-mode）
    expect(paths).toEqual(expect.arrayContaining(['/project', '/projects', '/probe', '/asr']));
  });
});
