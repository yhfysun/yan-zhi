import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { classifyToolAction } from '../src/tool-permission.js';

const ROOT = path.resolve(__dirname, '..');

describe('PageAsset server wiring', () => {
  it('classifies asset mutation and browser execution as writes', () => {
    expect(classifyToolAction('api_page_asset_list')).toBe('read');
    expect(classifyToolAction('api_page_asset_validate')).toBe('read');
    expect(classifyToolAction('api_page_asset_create_draft')).toBe('write');
    expect(classifyToolAction('api_page_asset_activate')).toBe('write');
    expect(classifyToolAction('browser_run_page_operation')).toBe('write');
  });

  it('mounts the page asset API and injects skill references at runtime', () => {
    const index = readFileSync(path.join(ROOT, 'src/index.ts'), 'utf-8');
    const manager = readFileSync(path.join(ROOT, 'src/llm-task-manager.ts'), 'utf-8');
    expect(index).toContain("app.use('/api/page-assets', pageAssetRoutes)");
    expect(manager).toContain('page_asset_refs_json');
    expect(manager).toContain('browser_run_page_operation');
    expect(manager).toContain('PAGE_ASSET_ALWAYS_API_TOOLS');
  });
});
