// P2-1 测试：动态工具路由（services/tool-router.ts，纯函数零 DB 依赖）
import { describe, it, expect } from 'vitest';
import {
  extractTaskKeywords,
  scoreToolRelevance,
  dynamicToolRoute,
  TOOL_ROUTE_THRESHOLD,
  TOOL_ROUTE_CORE,
} from '../src/services/tool-router.js';

const t = (name: string, description = '') => ({ function: { name, description } });

describe('extractTaskKeywords', () => {
  it('中英混合：拉丁词 ≥2 保留，CJK 保留单字', () => {
    const kws = extractTaskKeywords('抓取 Playwright 报价 数据');
    expect(kws).toContain('抓取');
    expect(kws).toContain('playwright');
    expect(kws).toContain('报');
  });
  it('空文本 → 空数组（无信号不裁的判据）', () => {
    expect(extractTaskKeywords('')).toEqual([]);
    expect(extractTaskKeywords(undefined)).toEqual([]);
  });
});

describe('scoreToolRelevance', () => {
  it('名字命中权重（+5）高于描述命中（+1）', () => {
    const kws = ['news'];
    expect(scoreToolRelevance('web_news_search', '', kws))
      .toBeGreaterThan(scoreToolRelevance('web_search', 'searches news', kws));
  });
  it('描述命中封顶 +10（防长描述刷分）', () => {
    const kws = Array.from({ length: 30 }, (_, i) => `kw${i}`);
    const desc = kws.map((k) => `关于${k}的说明`).join(' ');
    expect(scoreToolRelevance('some_tool', desc, kws)).toBeLessThanOrEqual(10);
  });
});

describe('dynamicToolRoute', () => {
  it('不超阈值 → 原样返回（不裁）', () => {
    const tools = Array.from({ length: 10 }, (_, i) => t(`tool_${i}`));
    const r = dynamicToolRoute(tools, '调研 playwright', { threshold: TOOL_ROUTE_THRESHOLD });
    expect(r.tools).toHaveLength(10);
    expect(r.dropped).toEqual([]);
  });

  it('超阈值：核心集与 custom_/mcp_ 全保留，其余按相关性裁到阈值', () => {
    const coreTools = [...TOOL_ROUTE_CORE].map((n) => t(n));
    const customs = [t('custom_abc_mytool'), t('mcp_xx__query')];
    // 40 个与任务无关的候选 → 应被裁掉大半
    const noise = Array.from({ length: 40 }, (_, i) => t(`plugin_misc_${i}`, '无关功能'));
    const hot = t('web_price_monitor', '抓取报价 价格监控 报价');
    const tools = [...coreTools, ...customs, ...noise, hot];
    const r = dynamicToolRoute(tools, '帮我做 报价 价格监控', {});
    expect(r.tools.length).toBeLessThanOrEqual(TOOL_ROUTE_THRESHOLD);    // 核心集一个不少
    for (const c of [...coreTools, ...customs]) {
      expect(r.tools).toContainEqual(c);
    }
    // 高相关工具存活
    expect(r.tools).toContainEqual(hot);
    // 被裁的都在 dropped 里且确实是噪声
    expect(r.dropped.length).toBeGreaterThan(0);
    expect(r.dropped.every((n) => n.startsWith('plugin_misc_'))).toBe(true);
  });

  it('无任务文本 → 不裁（无信号不做主观决策）', () => {
    const tools = Array.from({ length: 60 }, (_, i) => t(`tool_${i}`));
    const r = dynamicToolRoute(tools, undefined);
    expect(r.tools).toHaveLength(60);
    expect(r.dropped).toEqual([]);
  });

  it('核心集已超阈值 → 不硬裁', () => {
    const coreTools = [...TOOL_ROUTE_CORE, ...Array.from({ length: 30 }, (_, i) => `custom_x${i}`)].map((n) => t(n));
    const r = dynamicToolRoute([...coreTools, t('noise_a', '无关')], '随便');
    expect(r.dropped).toEqual([]);
  });
});
