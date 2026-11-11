// 语义按钮皮肤契约：普通 / 主操作 / 警告 / 危险 / 成功 / 信息必须有同一套
// 皮肤贴图入口，语义分类只改变色层与文字，不允许退回 Element Plus 默认纯色。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const SKIN_CSS = read('packages/ui/src/styles/skin.css');
const SETTINGS = read('packages/ui/src/stores/settings.ts');
const CORE_TYPES = read('packages/core/src/plugin/types.ts');

describe('语义按钮皮肤契约', () => {
  it('深浅模式都定义语义色层、高光与分类文字色', () => {
    for (const token of [
      '--skin-btn-sheen',
      '--skin-btn-normal-veil',
      '--skin-btn-primary-veil',
      '--skin-btn-warning-veil',
      '--skin-btn-danger-veil',
      '--skin-btn-success-veil',
      '--skin-btn-info-veil',
      '--skin-btn-warning-text',
      '--skin-btn-danger-text',
      '--skin-btn-success-text',
      '--skin-btn-info-text',
    ]) {
      expect(SKIN_CSS.match(new RegExp(token, 'g'))?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
    expect(SKIN_CSS).toMatch(/\[data-theme="dark"\]\[data-skin="on"\][\s\S]*--skin-btn-danger-veil/);
  });

  it('Element Plus 与业务自定义按钮都接入同一张皮肤按钮底图', () => {
    for (const selector of [
      '.el-button:not(.is-text):not(.is-link):not(.is-plain)',
      '.lp-primary',
      '.cp-btn:not(.ghost)',
      '.wf-btn',
      '.sec-cta',
      '.ops-tool-btn',
      'button.nav-btn',
    ]) {
      expect(SKIN_CSS).toContain(selector);
    }
    expect(SKIN_CSS).toContain('var(--skin-btn-local-pattern, var(--skin-btn-pattern, none))');
  });

  it('警告 / 危险 / 成功 / 信息各自有分类色和分类贴图回落', () => {
    for (const kind of ['primary', 'warning', 'danger', 'success', 'info']) {
      expect(SKIN_CSS).toContain(`.el-button--${kind}`);
      expect(SKIN_CSS).toContain(`--skin-btn-${kind}-pattern`);
      expect(SKIN_CSS).toContain(`--skin-btn-local-pattern: var(--skin-btn-${kind}-pattern`);
    }
  });

  it('插件契约与 settings 下发支持每个分类的浅色 / 暗色贴图', () => {
    for (const kind of ['Primary', 'Warning', 'Danger', 'Success', 'Info']) {
      expect(CORE_TYPES).toContain(`button${kind}Pattern?: string`);
      expect(CORE_TYPES).toContain(`button${kind}PatternDark?: string`);
      expect(SETTINGS).toContain(`button${kind}Pattern?: string`);
      expect(SETTINGS).toContain(`button${kind}PatternDark?: string`);
      expect(SETTINGS).toContain(
        `setPattern('--skin-btn-${kind.toLowerCase()}-pattern', themedPattern(sf.button${kind}Pattern, sf.button${kind}PatternDark));`,
      );
    }
  });
});
