import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const SKIN_CSS = read('packages/ui/src/styles/skin.css');
const LEARNING_THEME = read('packages/ui/src/styles/learning-theme.css');

describe('skin readability surfaces', () => {
  it('derives glass and chrome from the skin surface instead of neutral white', () => {
    expect(SKIN_CSS).toContain(
      '--glass-bg: color-mix(in srgb, var(--skin-surface, var(--skin-glass-tint',
    );
    expect(SKIN_CSS).toContain('--skin-chrome-bg:');
    expect(SKIN_CSS).toContain('--skin-panel-bg:');
    expect(SKIN_CSS).toContain('--skin-panel-bg-strong:');
    expect(SKIN_CSS).toContain('html[data-skin="on"] .title-bar');
  });

  it('veils dark plugin artwork in text-bearing menus for both themes', () => {
    for (const theme of ['light', 'dark']) {
      expect(SKIN_CSS).toContain(`html[data-theme="${theme}"][data-skin="on"]`);
      expect(SKIN_CSS).toMatch(
        new RegExp(
          `html\\[data-theme="${theme}"\\]\\[data-skin="on"\\][\\s\\S]*?linear-gradient\\(var\\(--skin-menu-veil\\)`,
        ),
      );
      expect(SKIN_CSS).toMatch(
        new RegExp(
          `html\\[data-theme="${theme}"\\]\\[data-skin="on"\\][\\s\\S]*?var\\(--skin-menu-pattern`,
        ),
      );
    }
    for (const selector of [
      '.el-popper.is-light.yz-menu-popper',
      '.el-dropdown-menu',
      '.el-select-dropdown',
      '.hm-sub',
      '.app-menu-list',
      '.ctx-menu',
    ]) {
      expect(SKIN_CSS).toContain(selector);
    }
  });

  it('keeps learning workspace text on a skin-tinted readable panel', () => {
    expect(LEARNING_THEME).toContain('--lp-panel: var(--skin-panel-bg');
    expect(LEARNING_THEME).toContain('--lp-panel-strong: var(--skin-panel-bg-strong');
    expect(LEARNING_THEME).toContain('--lp-surface: var(--skin-panel-bg-strong');
    expect(LEARNING_THEME).toContain('background-color: var(--lp-panel);');
    expect(LEARNING_THEME).toContain('--lp-border: color-mix');
  });

  it('keeps browser chrome on one skin-tinted surface with a distinct active tab', () => {
    expect(SKIN_CSS).toMatch(
      /html\[data-skin="on"\] \.browser-tabbar,[\s\S]*?html\[data-skin="on"\] \.browser-toolbar,[\s\S]*?html\[data-skin="on"\] \.bookmarks-bar[\s\S]*?background-color: var\(--skin-chrome-bg\) !important;/,
    );
    expect(SKIN_CSS).toMatch(
      /html\[data-skin="on"\] \.tab-item\.active[\s\S]*?color-mix\(in srgb, var\(--color-primary\)[\s\S]*?var\(--skin-surface-raised/,
    );
  });

  it('keeps image-skin panels translucent enough to reveal the wallpaper', () => {
    expect(SKIN_CSS).toContain(
      '--skin-panel-bg: color-mix(in srgb, var(--skin-surface, var(--skin-glass-tint, #f5f1ea)) 16%, transparent);',
    );
    expect(SKIN_CSS).toContain(
      '--skin-panel-bg: color-mix(in srgb, var(--skin-surface, var(--skin-glass-tint, #1d1d1c)) 12%, transparent);',
    );
    expect(SKIN_CSS).toContain('--skin-glass-alpha: 0.18;');
    expect(SKIN_CSS).toContain('--skin-glass-alpha: 0.14;');
  });
});
