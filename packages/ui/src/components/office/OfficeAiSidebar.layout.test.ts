import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'OfficeAiSidebar.vue'), 'utf8');
const CSS = SOURCE.slice(SOURCE.indexOf('<style scoped>'));

describe('OfficeAiSidebar 高度分配', () => {
  it('不显示重复的办公 AI / 当前智能体头部状态块', () => {
    expect(SOURCE).not.toContain('oai-head');
    expect(SOURCE).not.toContain('办公 ·');
  });

  it('最近任务按内容自适应，不再使用固定高度和拖拽分隔条', () => {
    expect(SOURCE).not.toContain('recentHeight');
    expect(SOURCE).not.toContain('oai-recent-resize');
    expect(SOURCE).not.toContain('recentTasks.slice(0, 6)');
    expect(CSS).toMatch(/\.oai-recent\s*\{[\s\S]*?flex:\s*0 1 auto;/);
  });

  it('最近任务默认只展示 20 条，并提供每次 20 条的加载更多', () => {
    expect(SOURCE).toContain('const RECENT_TASK_PAGE_SIZE = 20');
    expect(SOURCE).toContain('visibleRecentTasks');
    expect(SOURCE).toContain('remainingRecentTasks');
    expect(SOURCE).toContain('加载更多');
    expect(SOURCE).not.toContain('v-for="task in recentTasks"');
  });

  it('任务树占满最近任务之后的剩余高度', () => {
    expect(SOURCE).toContain('<div class="oai-directory">');
    expect(CSS).toMatch(/\.oai-directory\s*\{[\s\S]*?flex:\s*1 1 0;[\s\S]*?min-height:\s*0;/);
    expect(CSS).toMatch(/\.oai-directory :deep\(\.conv-list\)\s*\{[\s\S]*?height:\s*100%;/);
    expect(CSS).toMatch(/\.oai-directory :deep\(\.conv-tree\)\s*\{[\s\S]*?min-height:\s*0;/);
  });
});
