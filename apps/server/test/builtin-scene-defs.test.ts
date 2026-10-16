/**
 * 场景（模式）配置内置种子回归测试（apps/server/src/builtin-scene-defs.ts）。
 *
 * 为什么值得测：
 *   1) 本文件是 scene_config 表的**运行时权威种子**，与前端 packages/ui/src/config/scenes.ts
 *      **双源维护**（后端=运行时权威 / 前端=首屏离线兜底）。两边漂移的后果不是报错，而是
 *      「后端加了模式但前端兜底没有」或反过来 —— 只有这种结构性断言能兜住。
 *   2) 每行的 agent_id 是「点场景卡切换到哪个智能体」的绑定对象：指向不存在的 id 时，
 *      前端 setScene 的 `agents.some(...)` 守卫会**静默不切**（不报错，用户点了没反应）。
 *   3) is_mode 决定进不进欢迎卡轮播：标错的后果是「代码开发」出现在欢迎区，或模式场景
 *      （ops/sec/wf）在欢迎区里消失导致模式激活时挂不上场景人格。
 *   4) seed 用数组下标作 sort_order：顺序即欢迎卡/选择器里的展示顺序，改动要可见可控。
 *
 * 本测试只 import 纯数据模块（不 import db，避免打开 SQLite / 依赖 better-sqlite3）。
 */
import { describe, it, expect } from 'vitest';
import { builtinSceneDefs, type BuiltinSceneDef } from '../src/builtin-scene-defs';
import { DOUYIN_AGENT_ID } from '../src/builtin-douyin-agents';

/** 场景卡允许绑定的内置智能体 id（与前端 scenes.test.ts 的 KNOWN_AGENT_IDS 同集合） */
const KNOWN_AGENT_IDS = new Set([
  'a_default_assistant',
  'a_builtin_design_agent',
  'a_builtin_code_agent',
  'a_builtin_workflow_assistant',
  'a_builtin_translate_agent',
  'a_builtin_business_agent',
  DOUYIN_AGENT_ID,
  // 店铺运营助手（亚马逊/淘宝/1688/跨境中转仓）
  'a_builtin_shop_agent',
]);

/** 与前端 scenes.ts 的内置键集合一一对应（双源守门） */
const EXPECTED_KEYS = [
  'office', 'design', 'admin', 'finance', 'operation', 'hr', 'sales', 'legal',
  'data', 'service', 'translate', 'business', 'douyin',
  'shop',
  'code', 'ops', 'sec', 'wf',
];

describe('场景配置种子 · 目录结构', () => {
  it('共 18 条：13 办公岗位 + code/ops/sec/wf/shop 五个模式场景', () => {
    expect(builtinSceneDefs).toHaveLength(18);
  });

  it('键集合与前端 scenes.ts 完全一致（双源不漂移）', () => {
    expect(builtinSceneDefs.map((s) => s.key)).toEqual(EXPECTED_KEYS);
  });

  it('键唯一（UNIQUE(key) 的代码侧前提）', () => {
    const keys = builtinSceneDefs.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('恰好 5 个模式场景（is_mode=true）：code/ops/sec/wf/shop', () => {
    const modeKeys = builtinSceneDefs.filter((s) => s.isMode).map((s) => s.key);
    expect(modeKeys).toEqual(['shop', 'code', 'ops', 'sec', 'wf']);
  });

  it('douyin 是办公岗位场景（进欢迎卡轮播，不是模式场景）', () => {
    const douyin = builtinSceneDefs.find((s) => s.key === 'douyin')!;
    expect(douyin.isMode).toBe(false);
  });
});

describe('场景配置种子 · 每行结构完整', () => {
  it('name / description / agentId / prompt 非空，examples≥3，skillKeywords 非空', () => {
    for (const s of builtinSceneDefs) {
      expect(s.name.length, `${s.key} name`).toBeGreaterThan(0);
      expect(s.description.length, `${s.key} description`).toBeGreaterThan(0);
      expect(s.agentId.length, `${s.key} agentId`).toBeGreaterThan(0);
      expect(s.examples.length, `${s.key} examples`).toBeGreaterThanOrEqual(3);
      expect(s.skillKeywords.length, `${s.key} skillKeywords`).toBeGreaterThan(0);
      expect(s.prompt, `${s.key} prompt`).toContain('## 当前场景');
      expect(s.color, `${s.key} color`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('所有 agentId 都指向已知内置智能体（拼错 = 点卡静默不切）', () => {
    const unknown = builtinSceneDefs.filter((s) => !KNOWN_AGENT_IDS.has(s.agentId)).map((s) => `${s.key}: ${s.agentId}`);
    expect(unknown).toEqual([]);
  });

  it('三个专属智能体岗位的绑定正确（translate/business/douyin 不复用默认助手）', () => {
    const byKey = (k: string) => builtinSceneDefs.find((s) => s.key === k)!;
    expect(byKey('translate').agentId).toBe('a_builtin_translate_agent');
    expect(byKey('business').agentId).toBe('a_builtin_business_agent');
    expect(byKey('douyin').agentId).toBe(DOUYIN_AGENT_ID);
  });

  it('icon 都是 sceneIcon.ts 映射表里的合法名字（空=自动兜底，不报错但丢语义）', () => {
    // 与前端 config/sceneIcon.ts 的 SCENE_ICON_BY_NAME 键集合对应
    const KNOWN_ICONS = new Set([
      'Suitcase', 'Monitor', 'Brush', 'Coin', 'TrendCharts', 'Promotion', 'User', 'Sell',
      'ScaleToOriginal', 'DataAnalysis', 'Service', 'Connection', 'Notebook', 'Shop', 'VideoCamera',
    ]);
    for (const s of builtinSceneDefs) {
      expect(KNOWN_ICONS.has(s.icon), `${s.key} icon=${s.icon}`).toBe(true);
    }
  });
});

describe('场景配置种子 · 抖音运营行（2026-10-12 新增）', () => {
  const douyin = builtinSceneDefs.find((s) => s.key === 'douyin') as BuiltinSceneDef;

  it('绑定抖音运营助手，图标 VideoCamera', () => {
    expect(douyin.agentId).toBe(DOUYIN_AGENT_ID);
    expect(douyin.icon).toBe('VideoCamera');
  });

  it('提示词两线一体：引流 + 带货 + 咬合', () => {
    expect(douyin.prompt).toContain('引流');
    expect(douyin.prompt).toContain('带货');
    expect(douyin.prompt).toContain('人群决定带什么货');
  });

  it('skill 关键词覆盖带货/引流两侧（决定自动挂载哪两个 skill）', () => {
    for (const k of ['抖音', '带货', '引流', 'douyin']) {
      expect(douyin.skillKeywords, `缺关键词 ${k}`).toContain(k);
    }
  });

  it('硬约束写进场景提示词：不承诺数据 + 合规', () => {
    expect(douyin.prompt).toContain('不承诺');
    expect(douyin.prompt).toContain('极限词');
  });
});
