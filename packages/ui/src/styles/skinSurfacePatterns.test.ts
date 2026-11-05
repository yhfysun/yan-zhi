import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('皮肤 surface 扩展图案', () => {
  it('类型、下发变量、内置自动值、CSS 消费四处齐全', () => {
    const settings = read('packages/ui/src/stores/settings.ts');
    const skins = read('apps/server/src/plugins/skins.ts');
    const css = read('packages/ui/src/styles/skin.css');

    for (const key of ['bannerPattern', 'taskCardPattern', 'dropdownPattern']) {
      expect(settings, `settings 缺 ${key}`).toContain(`${key}?: string`);
    }
    for (const cssVar of ['--skin-banner-pattern', '--skin-task-card-pattern', '--skin-dropdown-pattern']) {
      expect(settings, `settings 未下发 ${cssVar}`).toContain(cssVar);
      expect(css, `CSS 未消费 ${cssVar}`).toMatch(new RegExp(`var\\(${cssVar}[,)]`));
    }
    for (const key of ['bannerPattern:', 'taskCardPattern:', 'dropdownPattern:']) {
      expect(skins, `内置皮肤缺 ${key}`).toContain(key);
    }
  });
});
