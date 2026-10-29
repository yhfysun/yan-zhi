import { describe, it, expect } from 'vitest';
import { parseKeySequence } from './gamePlan';

describe('parseKeySequence（一键开跑的按键序列）', () => {
  it('单个按键 → 点一下', () => {
    expect(parseKeySequence('Down').steps).toEqual([{ type: 'key', key: 'Down' }]);
  });

  it('逗号分隔（中英文逗号都认）→ 按顺序多个动作', () => {
    const r = parseKeySequence('Down，Left, Right');
    expect(r.error).toBeUndefined();
    expect(r.steps.map((s) => s.key)).toEqual(['Down', 'Left', 'Right']);
  });

  it('`Key*ms` → 长按（蓄力）', () => {
    expect(parseKeySequence('Space*800').steps).toEqual([{ type: 'hold', keys: ['Space'], ms: 800 }]);
  });

  it('`A+B*ms` → 双键同按（斜向移动）', () => {
    expect(parseKeySequence('Right+Up*600').steps).toEqual([{ type: 'hold', keys: ['Right', 'Up'], ms: 600 }]);
  });

  it('`A+B`（不带 ms）→ 默认按住 500ms，而不是点一下', () => {
    expect(parseKeySequence('Left+Down').steps).toEqual([{ type: 'hold', keys: ['Left', 'Down'], ms: 500 }]);
  });

  it('空输入 / 非法按键名 / 超长按住 → 返回可读错误，不产出半成品步骤', () => {
    expect(parseKeySequence('').error).toBeTruthy();
    expect(parseKeySequence('Down, 上').error).toMatch(/不合法/);
    expect(parseKeySequence('Space*99999').error).toMatch(/0–10000ms/);
    expect(parseKeySequence(' . ').error).toBeTruthy();
  });

  it('一轮超过 20 个动作 → 拒绝（防止一条输入把循环撑爆）', () => {
    const many = Array.from({ length: 21 }, () => 'Down').join(',');
    expect(parseKeySequence(many).error).toMatch(/最多 20 个/);
  });
});
