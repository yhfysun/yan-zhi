import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../views/news-app.css'), 'utf8');

describe('移动端资讯页滚动容器', () => {
  it('窄屏由 news-page 自己滚动，不能依赖已被隐藏的父级 overflow', () => {
    const mobile = /@media \(max-width: 900px\)([\s\S]*?)(?=@media \(max-width: 360px\))/.exec(css)?.[1] || '';
    const pageRule = /\.news-page\s*\{([\s\S]*?)\}/.exec(mobile)?.[1] || '';

    expect(pageRule).toContain('height: 100%;');
    expect(pageRule).toContain('min-height: 0;');
    expect(pageRule).toContain('overflow-x: hidden;');
    expect(pageRule).toContain('overflow-y: auto;');
    expect(pageRule).not.toContain('height: auto;');
    expect(pageRule).not.toContain('overflow: visible;');
  });

  it('资讯正文与行情二级页使用同一套 TabBar 底部预留', () => {
    const rules = (selector: string) => [...css.matchAll(
      new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\}`, 'g'),
    )].map((match) => match[1]);
    const reserve = 'calc(var(--mobile-tabbar-h, 60px) + env(safe-area-inset-bottom, 0px))';
    const reader = rules('.news-mobile-reader')
      .find((rule) => rule.includes('position: fixed')) || '';
    const quote = rules('.news-quote-overlay')
      .find((rule) => rule.includes('position: fixed')) || '';

    expect(reader).toContain(`inset: 0 0 ${reserve} 0;`);
    expect(quote).toContain(`inset: 0 0 ${reserve} 0;`);
    expect(reader).toMatch(/overflow:\s*hidden;/);
  });
});
