import { describe, expect, it } from 'vitest';
import { getApiToolRegistry } from './index';
import { BROWSER_TOOL_NAMES } from '../browser';

describe('PageAsset tools', () => {
  it('exposes read and maintenance APIs to the agent tool registry', () => {
    const names = (getApiToolRegistry().get('page-asset') || []).map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      'api_page_asset_list',
      'api_page_asset_get',
      'api_page_asset_resolve',
      'api_page_asset_create_draft',
      'api_page_asset_update_draft',
      'api_page_asset_validate',
      'api_page_asset_activate',
      'api_page_asset_archive',
      'api_page_asset_versions',
      'api_page_asset_probe',
      'api_page_asset_rollback',
    ]));
  });

  it('exposes the controlled operation executor as a browser tool', () => {
    expect(BROWSER_TOOL_NAMES).toContain('browser_run_page_operation');
  });
});
