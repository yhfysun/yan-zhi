// P3 观感收尾守门测试（2026-11-02）
//   ① 暗色：禁止 rgba(15,23,42,…) 硬编码；background:#fff 只允许白名单（网页内容/二维码对比度）
//   ② Element Plus 统一层存在且被 App 引入
//   ③ 动效：hover 走 --motion-fast，面板宽度走 --motion-panel（200ms）
//   ④ 图标：同类动作统一（更多=More，关闭=Close）
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(__dirname, '../../../..');
const UI_SRC = resolve(REPO, 'packages/ui/src');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(vue|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const FILES = walk(UI_SRC).map((p) => ({
  path: p.replace(UI_SRC, '').split(String.fromCharCode(92)).join('/'),
  src: readFileSync(p, 'utf8'),
}));

describe('P3-① 暗色硬编码', () => {
  it('不再出现 rgba(15,23,42,…)', () => {
    const bad = FILES.filter((f) => /rgba\(\s*15\s*,\s*23\s*,\s*42/.test(f.src)).map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it('background:#fff 只剩白名单（网页内容 / 二维码对比度）', () => {
    const allowed = new Set([
      '/components/BrowserPanel.vue', // 内嵌网页视口必须白底
      '/components/FilePreview.vue',  // HTML 预览 iframe 必须白底
      '/views/RemoteControl.vue',     // 主机二维码留白
      '/views/Settings.vue',          // 连接二维码留白
    ]);
    const offenders = FILES
      .filter((f) => /background(-color)?:\s*#fff(?:fff)?\b/.test(f.src))
      .map((f) => f.path)
      .filter((p) => !allowed.has(p));
    expect(offenders).toEqual([]);
  });
});

describe('P3-② Element Plus 统一层', () => {
  it('element-unify.css 存在并被 App.vue 引入', () => {
    expect(existsSync(resolve(UI_SRC, 'styles/element-unify.css'))).toBe(true);
    expect(readRepo('packages/ui/src/App.vue')).toMatch(/element-unify\.css/);
    const css = readRepo('packages/ui/src/styles/element-unify.css');
    expect(css).toMatch(/\.el-table/);
    expect(css).toMatch(/\.el-empty/);
    expect(css).toMatch(/\.el-pagination/);
    expect(css).toMatch(/\.el-button/);
  });
});

describe('P3-③ 动效统一', () => {
  it('token：hover 120ms，面板 200ms', () => {
    const tokens = readRepo('packages/ui/src/styles/tokens.css');
    expect(tokens).toMatch(/--motion-fast:\s*120ms/);
    expect(tokens).toMatch(/--motion-panel:\s*200ms/);
  });

  it('侧栏 / 上下文栏 / 右栏 / 代码分栏的面板过渡走 --motion-panel', () => {
    for (const p of [
      'packages/ui/src/components/SideNav.vue',
      'packages/ui/src/components/chat/ChatContextSidebar.vue',
      'packages/ui/src/views/chat.css',
      'packages/ui/src/views/CodeWorkbench.vue',
    ]) {
      expect(readRepo(p), `${p} 未使用 --motion-panel`).toMatch(/var\(--motion-panel\)/);
    }
  });
});

describe('P3-④ 图标一致性', () => {
  it('「更多」用 More 图标、「关闭」用 Close 图标', () => {
    expect(readRepo('packages/ui/src/components/FilePreview.vue')).toMatch(/<More \/>/);
    expect(readRepo('packages/ui/src/components/KbGraph.vue')).toMatch(/:icon="Close"/);
    expect(readRepo('packages/ui/src/components/browser/PageChatDock.vue')).toMatch(/<Close \/>/);
    expect(readRepo('packages/ui/src/components/dashboard/DashboardWidgetCard.vue')).toMatch(/<Close \/>/);
  });
});
