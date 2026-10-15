// 右键菜单图标不得被响应式代理 —— 守门测试（2026-10-14，与 config/sceneIconsMarkRaw.test.ts 同源）。
//
// 用户原话：「Vue received a Component that was made a reactive object … 这刷新后警告越来越多？」
// 触发点在 SceneCarousel（图标来自场景 store），排查同类时发现这两个组件的右键菜单**同一缺陷**：
//   · components/chat/ChatGitPanel.vue      —— contextMenu 是 ref，openContextMenu 把 items 数组塞进去
//   · components/chat/ScheduledTaskDialog.vue —— ctxMenu 是 ref，四处菜单构造都塞 items
//   MenuItem.icon 是组件对象，进 ref 后被 reactive() 深度代理 → `<component :is="item.icon">`
//   拿到 Proxy → Vue 在 createVNode 的 isProxy(type) 检查里每次渲染都警告（**不去重**）。
//
// ★ 本仓库组件测试是纯文本契约（node 环境无 DOM，见 sceneCarousel.downgrade.test.ts 说明），
//   故这里断言"items 进 ref 时套了 markRaw"；判据剥注释后再匹配（注释里出现同一个词会假绿）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const GIT = strip(read('components/chat/ChatGitPanel.vue'));
const DLG = strip(read('components/chat/ScheduledTaskDialog.vue'));

describe('右键菜单 items 必须 markRaw（MenuItem.icon 是组件对象）', () => {
  it('★ ChatGitPanel：菜单 items 进 ref 时 markRaw', () => {
    expect(GIT, '★ 源码管理面板右键菜单的 items 未 markRaw').toMatch(/items:\s*markRaw\(items\)/);
  });

  it('★ ScheduledTaskDialog：菜单 items 进 ref 时 markRaw', () => {
    expect(DLG, '★ 定时任务右键菜单的 items 未 markRaw').toMatch(/items:\s*markRaw\(items\)/);
  });

  it('两个组件都真的把 markRaw 从 vue 里 import 了（漏 import = 运行时 ReferenceError）', () => {
    expect(GIT).toMatch(/import\s*\{[^}]*\bmarkRaw\b[^}]*\}\s*from\s*'vue'/);
    expect(DLG).toMatch(/import\s*\{[^}]*\bmarkRaw\b[^}]*\}\s*from\s*'vue'/);
  });

  it('ctxMenu/contextMenu 的 visible 仍可被点掉（markRaw 只作用于 items，不能把外层也冻了）', () => {
    // 若有人图省事改成 shallowRef，这两行就地改 visible 的关闭逻辑会静默失效（菜单关不掉）
    expect(GIT).toMatch(/contextMenu\.value\.visible\s*=\s*false/);
    expect(DLG).toMatch(/ctxMenu\.value\.visible\s*=\s*false/);
  });
});