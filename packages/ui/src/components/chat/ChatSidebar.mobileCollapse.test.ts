import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'ChatSidebar.vue'), 'utf8');

describe('移动任务抽屉收起按钮', () => {
  it('按钮走统一处理函数，不再只改桌面折叠态', () => {
    expect(SOURCE).toContain('@click="collapseTaskSidebar"');
    expect(SOURCE).not.toContain('@click="convCollapsed = true"');
  });

  it('触屏外壳关闭 drawerOpen，桌面外壳仍切换 convCollapsed', () => {
    const start = SOURCE.indexOf('function collapseTaskSidebar');
    const block = SOURCE.slice(start, SOURCE.indexOf('\n}', start) + 2);
    expect(block).toContain('if (isTouchShell.value)');
    expect(block).toContain('drawerOpen.value = false');
    expect(block).toContain('convCollapsed.value = true');
  });

  it('平台移动样式提供至少 44px 触控区', () => {
    expect(SOURCE).toMatch(
      /:global\(\.platform-mobile\)\s+\.sidebar-collapse-btn\s*\{[\s\S]*?width:\s*44px;[\s\S]*?min-height:\s*44px;/,
    );
  });
});
