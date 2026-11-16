/**
 * 周易学科（课程主线 + 测算实践）**移动端滚动契约**守卫。
 *
 * 背景（2026-11-16 真机实报「周易课程页面无法滑动」）：
 *   学习页在 ≤900px 转单列布局，.lp-col-mid 变 height:auto。此时任何「height:100%
 *   + 内层 flex:1 + overflow:auto」的固定高度链都会塌成 0 高度 ⇒ 内容被压扁、
 *   页面不长高 ⇒ 整页滑不动。本文件把「窄屏必须交出高度链」这条契约钉死，
 *   防止后续改样式时又把它改回去。
 *
 * 为什么用源码锚点而不是 jsdom 布局：jsdom 不做布局计算，高度链类问题只能靠
 * 源码契约断言（本仓 learning 各组件的既有做法）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ZY_SRC = readFileSync(resolve(__dirname, 'ZhouyiWorkbench.vue'), 'utf8');
const DV_SRC = readFileSync(resolve(__dirname, 'DivinationWorkbench.vue'), 'utf8');
const LEARNING_SRC = readFileSync(resolve(__dirname, '../../../views/Learning.vue'), 'utf8');

/** 取某个 @media 块的内容（按最大宽度关键字定位）。 */
function mediaBlock(src: string, maxWidth: number): string {
  const start = src.indexOf(`@media (max-width: ${maxWidth}px)`);
  if (start < 0) return '';
  // 从开括号起做括号配平，取出该 @media 的完整内容
  let depth = 0;
  let i = src.indexOf('{', start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(open, i + 1);
}

describe('周易 · 移动端滚动契约', () => {
  it('★ 课程主线：≤900px 窄屏必须交出高度链（否则列表塌成 0 高度、滑不动）', () => {
    const block = mediaBlock(ZY_SRC, 900);
    expect(block, '★ ZhouyiWorkbench 缺少 ≤900px 的窄屏高度链修复块').not.toBe('');
    expect(block).toMatch(/\.zy-root\s*\{[^}]*height:\s*auto/);
    expect(block).toMatch(/\.zy-list\s*\{[^}]*overflow-y:\s*visible/);
    // 不再是「flex:1 1 0」的滚动容器（那正是塌陷源）
    expect(block).toMatch(/\.zy-list\s*\{[^}]*flex:\s*0 0 auto/);
  });

  it('★ 窄屏断点必须是 900px：学习页 ≤900px 就转单列，761~900 区间同样会塌陷', () => {
    expect(mediaBlock(ZY_SRC, 900)).not.toBe('');
    // 不得只在 760px 断点里修（761~900px 会漏）
    const narrow760 = mediaBlock(ZY_SRC, 760);
    expect(narrow760).not.toMatch(/\.zy-list\s*\{[^}]*overflow-y:\s*visible/);
  });

  it('★ 测算实践台：≤900px 窄屏必须交出高度链（.dv-root / .dv-main 同病）', () => {
    const block = mediaBlock(DV_SRC, 900);
    expect(block, '★ DivinationWorkbench 缺少 ≤900px 的窄屏高度链修复块').not.toBe('');
    expect(block).toMatch(/\.dv-root\s*\{[^}]*height:\s*auto/);
    expect(block).toMatch(/\.dv-main\s*\{[^}]*overflow-y:\s*visible/);
  });

  it('★★ 中栏的「桌面态 overflow:hidden」必须由**类名**驱动（:has() 特异性压不过媒体查询）', () => {
    // 类名版规则存在
    expect(LEARNING_SRC).toContain('.lp-col-mid--coach');
    expect(LEARNING_SRC).toContain('.lp-col-mid--dv');
    // 模板按 tab 挂类名
    expect(LEARNING_SRC).toContain("'lp-col-mid--coach': tab === 'coach'");
    expect(LEARNING_SRC).toContain("'lp-col-mid--dv': tab === 'divination'");
    // 窄屏必须有同名覆盖（否则桌面态的 overflow:hidden 在移动端仍然裁切内容）
    const mobile = mediaBlock(LEARNING_SRC, 900);
    expect(mobile).toMatch(/\.lp-col-mid--coach\s*\{[^}]*overflow:\s*visible/);
    expect(mobile).toMatch(/\.lp-col-mid--dv\s*\{[^}]*overflow:\s*visible/);
  });
});
