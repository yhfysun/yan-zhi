/**
 * 显示器清单接线守门（2026-10-26 报障「最开始有个下拉框可以选，改着改着就没了」）。
 *
 * 清单原本只由被控端在协商完成后**单向推一次**：推丢 / 被控端渲染层晚到 /
 * 会话从 JPEG 升级成 WebRTC 重新采集 —— 任意一种，控制端就永远看不到「显示器」入口。
 * 现在补成可主动要：控制端发 `displays.refresh` → 服务端转给被控端（WebRTC）
 * 或自己问代理（JPEG）→ 被控端重新枚举后回推 `displays`。
 *
 * 三条链路缺一条，入口就会在某些会话里静默消失 —— 所以用源码锚点钉死。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const SERVER = readFileSync(resolve(ROOT, 'apps/server/src/plugins/remote-control.ts'), 'utf8');
const HOST = readFileSync(resolve(ROOT, 'packages/ui/src/components/RemoteControlHost.vue'), 'utf8');
const CLIENT = readFileSync(resolve(ROOT, 'packages/ui/src/views/RemoteControl.vue'), 'utf8');

describe('显示器清单：控制端可主动刷新', () => {
  it('★ 服务端有 displays.refresh 分支，按模式走「被控端渲染层 / 代理」两条路', () => {
    const idx = SERVER.indexOf("case 'displays.refresh'");
    expect(idx, '★ 服务端缺 displays.refresh 分支').toBeGreaterThan(0);
    const block = SERVER.slice(idx, idx + 700);
    expect(block, '★ WebRTC 下必须转给被控端重新枚举').toMatch(
      /notifyHost\(\{ type: 'displays\.request', sessionId: s\.id \}\)/,
    );
    expect(block, '★ JPEG 下必须自己问代理').toMatch(/await sendJpegDisplays\(s, a\)/);
  });

  it('★ 被控端渲染层响应 displays.request 并回推清单', () => {
    const idx = HOST.indexOf("case 'displays.request'");
    expect(idx, '★ 被控端没有处理 displays.request').toBeGreaterThan(0);
    expect(HOST.slice(idx, idx + 400)).toMatch(/refreshDisplays\(\)\.then\(\(\) => announceDisplays\(/);
  });

  it('★ 控制端进会话自动要一次，操作抽屉里有「刷新」入口', () => {
    expect(CLIENT, '★ 缺 requestDisplays → 清单丢了就永远补不回来').toMatch(/'displays\.refresh'/);
    expect(CLIENT, '★ 进会话/升级成 WebRTC 后没有自动补要').toMatch(/askDisplaysIfEmpty\(\);/);
    expect(CLIENT, '★ 操作抽屉缺「刷新」按钮').toMatch(/@click="requestDisplays"/);
  });

  it('★ 显示器行在会话中恒可见（不再被 displays.length > 1 挡在门外）', () => {
    // 电脑会话里恒可见；安卓镜像会话没有「显示器」概念，按来源隐藏
    expect(CLIENT).toMatch(
      /<div v-if="phase === 'live' && linkKind !== 'android'" class="rc-sheet-row">\s*\n\s*<span class="rc-sheet-label">显示器<\/span>/,
    );
    // 顶栏下拉仍要求 >1，但窄屏不能被压成看不见
    expect(CLIENT).toMatch(/\.rc-select-disp \{ max-width: 44vw; min-width: 84px; \}/);
  });
});
