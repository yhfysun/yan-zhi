import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SHOP_AGENT_BUILTIN_TOOLS,
  SHOP_AGENT_SYSTEM_PROMPT,
} from '../src/plugins/shop-ops/seed.js';

const mounted = new Set(SHOP_AGENT_BUILTIN_TOOLS);
const SHOP_OPS_SRC = fs.readFileSync(path.resolve(__dirname, '../src/plugins/shop-ops.ts'), 'utf8');
const BUILTIN_INDEX_SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../packages/core/src/tool/builtin/index.ts'),
  'utf8',
);
const registered = new Set(
  [...SHOP_OPS_SRC.matchAll(/name:\s*'((?:shop|conn)_[a-z0-9_]+)'/g)].map((match) => match[1]),
);

/** 从零开店到持续经营必须由主智能体直接看到的工具。 */
const REQUIRED_WORKFLOW_TOOLS = [
  'conn_create',
  'conn_update',
  'shop_sp_api_check',
  'shop_listing_create',
  'shop_campaign_apply',
  'shop_reply_send',
  'shop_order_place',
];

describe('店铺助手工具面一致性', () => {
  it('完整开店与运营流程需要的工具必须真的挂给店铺助手', () => {
    const missing = REQUIRED_WORKFLOW_TOOLS.filter((name) => !mounted.has(name));
    expect(
      missing,
      `这些工具已注册但模型看不到，调用时会误判为“工具不存在”：${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('系统提示词提到的 shop_* 工具必须都在挂载清单里', () => {
    const mentioned = [...new Set(
      [...SHOP_AGENT_SYSTEM_PROMPT.matchAll(/\b(shop_[a-z0-9_]+)\b/g)].map((match) => match[1]),
    )];
    const dangling = mentioned.filter((name) => !mounted.has(name));
    expect(
      dangling,
      `提示词推荐了未挂载工具：${dangling.join(', ')}`,
    ).toEqual([]);
  });

  it('页面未就绪时必须停止重复导航，改用标签页工具等待', () => {
    expect(SHOP_AGENT_SYSTEM_PROMPT).toContain('同一 URL 只调用一次 browser_navigate');
    expect(SHOP_AGENT_SYSTEM_PROMPT).toContain('不得再次 navigate');
    expect(SHOP_AGENT_SYSTEM_PROMPT).toContain('browser_get_tabs');
  });

  it('主体规则必须区分个人身份、个体工商户与企业', () => {
    expect(SHOP_AGENT_SYSTEM_PROMPT).toContain('个人身份（身份证开店）');
    expect(SHOP_AGENT_SYSTEM_PROMPT).toContain('个体工商户');
    expect(SHOP_AGENT_SYSTEM_PROMPT).toContain('个人身份店不得要求营业执照');
    expect(SHOP_AGENT_SYSTEM_PROMPT).toContain('不得用历史记忆否定');
  });

  it('选品核心工具 compare_products 必须真实注册并挂载', () => {
    expect(SHOP_AGENT_BUILTIN_TOOLS).toContain('compare_products');
    const activeRegistration = BUILTIN_INDEX_SRC
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(
      activeRegistration,
      '提示词要求用 compare_products，但内置注册表没有注册它；模型会反复撞“工具不存在”',
    ).toMatch(/registry\.register\(new CompareProductsTool\(\)\)/);
  });

  it('挂载的店铺工具必须真实注册', () => {
    const shopTools = SHOP_AGENT_BUILTIN_TOOLS.filter((name) =>
      name.startsWith('shop_') || name.startsWith('conn_'));
    const unknown = shopTools.filter((name) => !registered.has(name));
    expect(unknown, `挂载了未实现工具：${unknown.join(', ')}`).toEqual([]);
  });

  it('连接删除仍不挂给主智能体，避免误删店铺配置', () => {
    expect(mounted.has('conn_delete')).toBe(false);
    expect(registered.has('conn_delete')).toBe(true);
  });
});
