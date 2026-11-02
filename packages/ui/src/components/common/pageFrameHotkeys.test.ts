// P1 桌面骨架守门测试（2026-11-02）：
//   ① 统一 PageFrame 存在且四页已接入（固定页头 → 工具条 → 自滚内容）；
//   ② ⌘K 面板的命令条目与 Ctrl+B/J/N 快捷键接线；
//   ③ 窗口尺寸/位置记忆与聊天列表滚动记忆的落点仍在。
// 手法同 conversationLifecycleWiring.test.ts：读源码 + 剥注释后断言。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../..');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const PAGE_FRAME = strip(readRepo('packages/ui/src/components/common/PageFrame.vue'));
const MODELS = strip(readRepo('packages/ui/src/views/Models.vue'));
const AGENTS = strip(readRepo('packages/ui/src/views/Agents.vue'));
const TOOLS = strip(readRepo('packages/ui/src/views/ToolMarket.vue'));
const LOCAL_SKILLS = strip(readRepo('packages/ui/src/views/skill-market/LocalSkillMarket.vue'));
const PALETTE = strip(readRepo('packages/ui/src/components/common/CommandPalette.vue'));
const TOPBAR = strip(readRepo('packages/ui/src/components/WebTopBar.vue'));
const SIDEBAR = strip(readRepo('packages/ui/src/components/chat/ChatSidebar.vue'));
const MAIN = strip(readRepo('apps/desktop/main.cjs'));

describe('P1-1 统一页面骨架', () => {
  it('PageFrame 提供固定页头 / 工具条 / 自滚内容区', () => {
    expect(PAGE_FRAME).toMatch(/class="pf-header"/);
    expect(PAGE_FRAME).toMatch(/class="pf-toolbar"/);
    expect(PAGE_FRAME).toMatch(/class="pf-body"/);
    expect(PAGE_FRAME).toMatch(/\.pf-body[\s\S]{0,120}overflow-y:\s*auto/);
  });

  it('四个高频页已接入 PageFrame', () => {
    for (const [name, src] of [
      ['Models', MODELS], ['Agents', AGENTS], ['ToolMarket', TOOLS], ['LocalSkillMarket', LOCAL_SKILLS],
    ] as const) {
      expect(src, `${name} 未使用 PageFrame`).toMatch(/<PageFrame/);
      expect(src, `${name} 未 import PageFrame`).toMatch(/import PageFrame from/);
    }
  });
});

describe('P1-2 管理页分栏', () => {
  it('Models 宽屏用右侧详情容器 + useResizable 拖拽（窄屏回落弹窗）', () => {
    expect(MODELS).toMatch(/useResizable\('models_detail'/);
    expect(MODELS).toMatch(/platform-detail-pane/);
    expect(MODELS).toMatch(/splitOpen/);
    expect(MODELS).toMatch(/v-if="!wide"/);
  });
});

describe('P1-4 快捷键与命令面板', () => {
  it('⌘K 面板带命令组与四类动作', () => {
    expect(PALETTE).toMatch(/label: '命令'/);
    expect(PALETTE).toMatch(/'cmd:new'/);
    expect(PALETTE).toMatch(/'cmd:settings'/);
    expect(PALETTE).toMatch(/'cmd:sidebar'/);
    expect(PALETTE).toMatch(/'cmd:context'/);
    expect(PALETTE).toMatch(/'mode:' \+ m\.key/);
  });

  it('Ctrl+B / Ctrl+J / Ctrl+N 接线，输入框内不抢键', () => {
    expect(TOPBAR).toMatch(/key === 'b'/);
    expect(TOPBAR).toMatch(/key === 'j'/);
    expect(TOPBAR).toMatch(/key === 'n'/);
    expect(TOPBAR).toMatch(/isContentEditable/);
    expect(TOPBAR).toMatch(/toggleContextSidebar\(\)/);
    expect(TOPBAR).toMatch(/startNewChat\(\)/);
  });
});

describe('P1-3 状态记忆', () => {
  it('主窗口尺寸/位置/最大化落盘并可恢复', () => {
    expect(MAIN).toMatch(/window-state\.json/);
    expect(MAIN).toMatch(/saveWindowState/);
    expect(MAIN).toMatch(/getNormalBounds/);
    expect(MAIN).toMatch(/restoreMaximized/);
    expect(MAIN).toMatch(/windowStateValid/);
  });

  it('聊天任务列表按模式记忆滚动位置', () => {
    expect(SIDEBAR).toMatch(/yz:conv_tree_scroll/);
    expect(SIDEBAR).toMatch(/onConvTreeScroll/);
    expect(SIDEBAR).toMatch(/restoreConvTreeScroll/);
  });
});
