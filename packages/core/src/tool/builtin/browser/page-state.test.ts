// P1-6 测试：页面状态签名（computePageStateSignature）
// 2026-10-07 —— pageAgent 的"操作未生效"硬判据，签名相同 = 页面没变。
import { describe, it, expect } from 'vitest';
import { computePageStateSignature } from './index';

describe('computePageStateSignature（P1-6）', () => {
  it('相同输入 → 签名稳定（可跨步对比）', () => {
    const page = {
      url: 'https://example.com/list',
      title: '列表页',
      interactive: [{ index: 1, tag: 'a' }, { index: 2, tag: 'input' }],
      interactiveCount: 2,
    };
    expect(computePageStateSignature(page)).toBe(computePageStateSignature(page));
  });

  it('元素清单变化（懒加载多出一项）→ 签名变化', () => {
    const before = { url: 'u', title: 't', interactive: [{ index: 1, tag: 'a' }], interactiveCount: 1 };
    const after = { url: 'u', title: 't', interactive: [{ index: 1, tag: 'a' }, { index: 2, tag: 'button' }], interactiveCount: 2 };
    expect(computePageStateSignature(before)).not.toBe(computePageStateSignature(after));
  });

  it('标题变化 → 签名变化', () => {
    const before = { url: 'u', title: 'a', interactive: [], interactiveCount: 0 };
    const after = { url: 'u', title: 'b', interactive: [], interactiveCount: 0 };
    expect(computePageStateSignature(before)).not.toBe(computePageStateSignature(after));
  });

  it('URL 变化 → 签名变化（pageAgent 跳转判据）', () => {
    const before = { url: 'https://a.com', title: 't', interactive: [], interactiveCount: 0 };
    const after = { url: 'https://b.com', title: 't', interactive: [], interactiveCount: 0 };
    expect(computePageStateSignature(before)).not.toBe(computePageStateSignature(after));
  });

  it('格式形如 sig<hex>#<元素数>（回执可读）', () => {
    const sig = computePageStateSignature({ url: 'u', title: 't', interactive: [{ index: 1, tag: 'a' }], interactiveCount: 1 });
    expect(sig).toMatch(/^sig[0-9a-f]+#\d+$/);
    expect(sig.endsWith('#1')).toBe(true);
  });

  it('空页面 / 缺字段不抛错（防御）', () => {
    expect(computePageStateSignature({})).toMatch(/^sig[0-9a-f]+#0$/);
  });
});
