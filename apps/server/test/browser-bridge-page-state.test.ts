import { describe, expect, it } from 'vitest';
import { computePageStateSignature } from '@yan-zhi/core';
import { formatBridgeResult } from '../src/browser-bridge.js';

describe('桌面浏览器读页回执 PageState', () => {
  it('get_page_content 回执带稳定签名，元素变化后签名随之变化', () => {
    const before = {
      url: 'https://example.com/list',
      title: '商品列表',
      text: '暂无结果',
      interactiveCount: 1,
      interactive: [{ index: 0, tag: 'input' }],
    };
    const after = {
      ...before,
      interactiveCount: 2,
      interactive: [
        { index: 0, tag: 'input' },
        { index: 1, tag: 'button' },
      ],
    };

    const text = formatBridgeResult('get_page_content', before);
    expect(text).toContain(`PageState: ${computePageStateSignature(before)}`);
    expect(computePageStateSignature(after)).not.toBe(computePageStateSignature(before));
  });
});
