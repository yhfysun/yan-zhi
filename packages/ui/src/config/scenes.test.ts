// 场景目录（config/scenes.ts）完整性回归测试（openspec four-mode-workspace 决策 5）。
//
// 钉住的契约：
//   1) 目录 12 项：10 张办公岗位欢迎卡 + code/ops/sec 三个模式场景；
//   2) WELCOME_SCENES 排除 code/ops/sec（欢迎轮播不出现「代码开发」）；
//   3) 所有场景 agentId 均指向既有内置智能体（不新建智能体）；
//   4) 岗位场景提示词带场景标题行；法务带免责声明；ops/sec 带红线措辞；
//   5) sceneByKey 全键可查、空串返回 null。

import { describe, it, expect } from 'vitest';
import { SCENES, WELCOME_SCENES, sceneByKey, type SceneKey } from './scenes';

const KNOWN_AGENT_IDS = new Set([
  'a_default_assistant',
  'a_builtin_design_agent',
  'a_builtin_code_agent',
]);

describe('场景目录完整性', () => {
  it('SCENES 共 13 项：10 办公岗位 + code/ops/sec 三个模式场景', () => {
    expect(SCENES).toHaveLength(13);
  });

  it('WELCOME_SCENES 恰好 10 张，排除 code/ops/sec', () => {
    expect(WELCOME_SCENES).toHaveLength(10);
    const keys = WELCOME_SCENES.map((s) => s.key);
    expect(keys).not.toContain('code');
    expect(keys).not.toContain('ops');
    expect(keys).not.toContain('sec');
    // 用户拍板的岗位集合（决策记录 #16：保留 10 张）
    expect(keys).toEqual(
      expect.arrayContaining([
        'office', 'design', 'admin', 'finance', 'operation',
        'hr', 'sales', 'legal', 'data', 'service',
      ]),
    );
  });

  it('code 场景保留（供开发模式自动切换，只是不出现在欢迎卡）', () => {
    const code = sceneByKey('code');
    expect(code).not.toBeNull();
    expect(code?.agentId).toBe('a_builtin_code_agent');
  });

  it('ops / sec 模式场景存在且提示词含红线措辞', () => {
    const ops = sceneByKey('ops');
    expect(ops?.prompt).toContain('回滚');
    const sec = sceneByKey('sec');
    expect(sec?.prompt).toContain('授权范围');
    expect(sec?.prompt).toContain('不自主触发');
  });

  it('所有场景 agentId 指向既有智能体（不新建）', () => {
    for (const s of SCENES) {
      expect(KNOWN_AGENT_IDS.has(s.agentId)).toBe(true);
    }
  });

  it('法务场景提示词带免责声明', () => {
    const legal = sceneByKey('legal');
    expect(legal?.prompt).toContain('免责声明');
    expect(legal?.prompt).toContain('执业律师');
  });

  it('每个场景结构完整（label/desc/examples/prompt/skillKeywords 非空）', () => {
    for (const s of SCENES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.desc.length).toBeGreaterThan(0);
      expect(s.examples.length).toBeGreaterThanOrEqual(3);
      expect(s.prompt).toContain('## 当前场景');
      expect(s.skillKeywords.length).toBeGreaterThan(0);
    }
  });

  it('sceneByKey：全键可查，空串与未知键返回 null', () => {
    for (const s of SCENES) {
      expect(sceneByKey(s.key as SceneKey)?.key).toBe(s.key);
    }
    expect(sceneByKey('')).toBeNull();
    expect(sceneByKey('nope' as SceneKey)).toBeNull();
  });

  it('键唯一（无重复场景）', () => {
    const keys = SCENES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
