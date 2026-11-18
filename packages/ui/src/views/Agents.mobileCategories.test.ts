import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(resolve(__dirname, 'Agents.vue'), 'utf8');

describe('智能体移动端分类轨道', () => {
  it('分类固定单行横向滚动，不再换行占三排', () => {
    expect(SOURCE).toMatch(
      /\.cat-sidebar\s*\{[\s\S]*?flex-direction:\s*row;[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?overflow-x:\s*auto;/,
    );
    expect(SOURCE).toMatch(/\.cat-sidebar::-webkit-scrollbar\s*\{\s*display:\s*none/);
  });

  it('分类标题隐藏，chip 不收缩且保留触控高度', () => {
    expect(SOURCE).toMatch(/\.cat-sidebar-title\s*\{\s*display:\s*none/);
    expect(SOURCE).toMatch(
      /\.cat-side-item\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?min-height:\s*40px;/,
    );
  });
});
