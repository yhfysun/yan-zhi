// 模型上下文窗口档位与格式化单测（2026-09-15 落地「模型选择器 hover 快捷设置」）。
//
// 背景：上下文窗口（model.context_window）此前只能在「配置模型平台」的弹窗里改，
// 现在模型选择器 hover 也能改（输入区下拉 + 顶栏模型菜单共用同一面板）。
// 两条入口共用 packages/ui/src/utils/context-window.ts 这一份口径，本文件钉死：
//   1. token ↔ 展示文案互转（含 1M 边界与默认兜底）
//   2. K 值回填不会出现 0 / 负数
//   3. 档位标签与格式化结果一致（防止改了格式化忘了改档位标签）
import { describe, it, expect } from 'vitest';
import {
  CONTEXT_WINDOW_PRESETS,
  DEFAULT_CONTEXT_WINDOW,
  formatContextWindow,
  toContextWindowK,
} from '../../../packages/ui/src/utils/context-window';

describe('formatContextWindow token → 展示文案', () => {
  it('256K 档位', () => {
    expect(formatContextWindow(262144)).toBe('256K');
  });

  it('1M 边界整值不带小数', () => {
    expect(formatContextWindow(1048576)).toBe('1M');
  });

  it('非整 M 保留一位小数', () => {
    expect(formatContextWindow(1572864)).toBe('1.5M');
  });

  it('小窗口按 K 取整', () => {
    expect(formatContextWindow(32768)).toBe('32K');
    expect(formatContextWindow(65536)).toBe('64K');
  });

  it('不足 1K 时原样输出', () => {
    expect(formatContextWindow(512)).toBe('512');
  });

  it('缺省 / 非法值兜底为默认档 1M（历史数据 context_window 为空时不显示 0K）', () => {
    expect(formatContextWindow(undefined)).toBe('1M');
    expect(formatContextWindow(0)).toBe('1M');
    expect(formatContextWindow(NaN)).toBe('1M');
  });
});

describe('toContextWindowK token → K 值', () => {
  it('与默认档一致（默认 1M = 1024K）', () => {
    expect(toContextWindowK(DEFAULT_CONTEXT_WINDOW)).toBe(1024);
  });

  it('1M 换算为 1024K', () => {
    expect(toContextWindowK(1048576)).toBe(1024);
  });

  it('极小值钳到 1，不回填出 0（输入框 min=1）', () => {
    expect(toContextWindowK(1)).toBe(1);
    expect(toContextWindowK(undefined)).toBe(1024);
  });
});

describe('CONTEXT_WINDOW_PRESETS 档位表', () => {
  it('包含默认档（默认值必须能在档位里被高亮）', () => {
    expect(CONTEXT_WINDOW_PRESETS.some((p) => p.tokens === DEFAULT_CONTEXT_WINDOW)).toBe(true);
    expect(DEFAULT_CONTEXT_WINDOW).toBe(1048576);
  });

  it('档位严格递增且无重复', () => {
    const tokens = CONTEXT_WINDOW_PRESETS.map((p) => p.tokens);
    expect(new Set(tokens).size).toBe(tokens.length);
    expect([...tokens].sort((a, b) => a - b)).toEqual(tokens);
  });

  it('每个档位标签与其 token 的格式化结果一致（防两处口径漂移）', () => {
    for (const p of CONTEXT_WINDOW_PRESETS) {
      expect(formatContextWindow(p.tokens)).toBe(p.label);
    }
  });
});
