import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf-8');

describe('page assets workbench wiring', () => {
  it('registers the page asset route and desktop/mobile navigation entry', () => {
    expect(read('src/router/index.ts')).toContain("path: '/page-assets'");
    expect(read('src/components/SideNav.vue')).toContain("path: '/page-assets'");
    expect(read('src/components/MobileNavDrawer.vue')).toContain("go('/page-assets')");
  });

  it('keeps asset editing on explicit draft and activation actions', () => {
    const source = read('src/views/page-assets/PageAssets.vue');
    expect(source).toContain('PageAssetEditorDialog');
    expect(source).toContain('pageAssetsStore.activate');
    expect(source).toContain('pageAssetsStore.rollback');
    expect(source).toContain('pageAssetsStore.validate');
  });
});
