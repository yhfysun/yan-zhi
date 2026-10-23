// 守门测试：编辑智能体弹窗里，`el-form` 内的原生 <button> 必须显式 type="button"。
//
// 背景（2026-10-23 用户实测）：头像选择器的 <button> 没写 type，HTML 默认是 submit，
// 点一下就把 el-form 提交掉 → 页面整页刷新、弹窗消失、回到对话页。
// 这类问题编译期与类型检查都发现不了，只能靠结构断言守。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(__dirname, 'AgentEditDialog.vue'), 'utf8');

describe('编辑智能体弹窗 · 表单内按钮不得触发提交', () => {
  it('el-form 内所有原生 button 都带 type="button"', () => {
    const start = SRC.indexOf('<el-form');
    const end = SRC.indexOf('</el-form>');
    expect(start, '未找到 el-form').toBeGreaterThan(0);
    expect(end, '未找到 </el-form>').toBeGreaterThan(start);

    const block = SRC.slice(start, end);
    const buttons = [...block.matchAll(/<button[\s\S]*?>/g)].map((m) => m[0]);
    expect(buttons.length, '表单内应至少有头像选择器的按钮').toBeGreaterThan(0);

    const bad = buttons.filter((b) => !/type="button"/.test(b));
    expect(bad, '以下按钮缺少 type="button"（点击会提交表单并刷新页面）：' + bad.join('\n')).toEqual([]);
  });
});
