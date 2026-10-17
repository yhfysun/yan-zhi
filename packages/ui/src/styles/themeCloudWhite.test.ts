// 云白主题（openspec 11.1–11.5）契约 + 对比度核验（2026-10-17）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TOKENS = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8');
const SETTINGS = readFileSync(resolve(__dirname, '../stores/settings.ts'), 'utf8');

function lum(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const l1 = Math.max(lum(a), lum(b));
  const l2 = Math.min(lum(a), lum(b));
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('11.1–11.4 · 云白配色', () => {
  it('亮色骨架与主色已切换', () => {
    expect(TOKENS).toContain('--color-bg: #F7F8FA');
    expect(TOKENS).toContain('--color-border: #E7EAF0');
    expect(TOKENS).toContain('--color-text-secondary: #5A6272');
    expect(TOKENS).toContain('--color-primary: #4F46E5');
    expect(TOKENS).toContain('--gradient-primary: linear-gradient(135deg, #4F46E5, #7C5CFC)');
    // accent 与 warning 解耦
    expect(TOKENS).toContain('--color-accent: #7C5CFC');
    expect(TOKENS).toContain('--color-warning: #B45309');
  });

  it('暗色骨架与主色已切换', () => {
    expect(TOKENS).toContain('--color-bg: #101216');
    expect(TOKENS).toContain('--color-primary: #818CF8');
    expect(TOKENS).toContain('--color-primary-dark: #4F46E5');
  });

  it('settings 内置调色板 cloudWhite，且方案 A 默认不启用皮肤', () => {
    expect(SETTINGS).toContain('cloudWhite: {');
    expect(SETTINGS).toMatch(/palette: 'cloudWhite'/);
    expect(SETTINGS).toMatch(/skin: '',/);
  });
});

describe('11.5 · 对比度 ≥ 4.5:1', () => {
  const pairs: Array<[string, string, string]> = [
    ['亮色正文', '#1A1D24', '#F7F8FA'],
    ['亮色次级文字', '#5A6272', '#F7F8FA'],
    ['亮色主色文字', '#4F46E5', '#FFFFFF'],
    ['暗色正文', '#E8EAF0', '#101216'],
    ['暗色次级文字', '#9AA3B2', '#101216'],
    ['暗色主色文字', '#818CF8', '#101216'],
  ];
  for (const [name, fg, bg] of pairs) {
    it(`${name}（${fg} on ${bg}）`, () => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
