// 场景目录（config/scenes.ts）完整性回归测试（openspec four-mode-workspace 决策 5）。
//
// 钉住的契约：
//   1) 目录 16 项：12 张办公岗位欢迎卡 + code/ops/sec/wf 四个模式场景；
//   2) WELCOME_SCENES 排除 code/ops/sec/wf（欢迎轮播不出现「代码开发」）；
//   3) 所有场景 agentId 均指向既有内置智能体（岗位卡默认复用 a_default_assistant，
//      translate/business 两个岗位例外 —— 各有专属内置智能体）；
//   4) 岗位场景提示词带场景标题行；法务带免责声明；ops/sec 带红线措辞；
//      翻译带免责与四项自检；生意带合规红线；
//   5) sceneByKey 全键可查、空串返回 null。

import { describe, it, expect } from 'vitest';
import { SCENES, WELCOME_SCENES, sceneByKey, type SceneKey } from './scenes';

const KNOWN_AGENT_IDS = new Set([
  'a_default_assistant',
  'a_builtin_design_agent',
  'a_builtin_code_agent',
  // 工作流模式的宿主：新建的工作流助手（type=harness，非工作流型）
  'a_builtin_workflow_assistant',
  // 两个新岗位的专属内置智能体
  'a_builtin_translate_agent',
  'a_builtin_business_agent',
]);

describe('场景目录完整性', () => {
  it('SCENES 共 16 项：12 办公岗位 + code/ops/sec/wf 四个模式场景', () => {
    expect(SCENES).toHaveLength(16);
  });

  it('WELCOME_SCENES 恰好 12 张，排除 code/ops/sec/wf', () => {
    expect(WELCOME_SCENES).toHaveLength(12);
    const keys = WELCOME_SCENES.map((s) => s.key);
    expect(keys).not.toContain('code');
    expect(keys).not.toContain('ops');
    expect(keys).not.toContain('sec');
    // 工作流场景是模式场景，不进欢迎卡轮播
    expect(keys).not.toContain('wf');
    // 用户拍板的岗位集合（决策记录 #16：保留 10 张；后续新增 translate / business 两张）
    expect(keys).toEqual(
      expect.arrayContaining([
        'office', 'design', 'admin', 'finance', 'operation',
        'hr', 'sales', 'legal', 'data', 'service',
        'translate', 'business',
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

  it('wf 模式场景存在，提示词围绕「运行」而不是「闲聊」', () => {
    const wf = sceneByKey('wf');
    expect(wf).not.toBeNull();
    expect(wf?.prompt).toContain('## 当前场景：工作流');
    expect(wf?.prompt).toContain('入参'); // 参数补全
    expect(wf?.prompt).toContain('节点'); // 节点级排障视角
  });

  it('★ translate 岗位挂专属内置智能体（不是 a_default_assistant）', () => {
    const s = sceneByKey('translate');
    expect(s).not.toBeNull();
    expect(s?.agentId).toBe('a_builtin_translate_agent');
    expect(s?.prompt).toContain('## 当前场景：多语翻译');
    // 术语一致性 + 四项自检 + 专业文本免责
    expect(s?.prompt).toContain('术语');
    expect(s?.prompt).toContain('自检');
    expect(s?.prompt).toContain('仅供参考');
  });

  it('★ business 岗位挂专属内置智能体，且覆盖多业态与合规红线', () => {
    const s = sceneByKey('business');
    expect(s).not.toBeNull();
    expect(s?.agentId).toBe('a_builtin_business_agent');
    expect(s?.prompt).toContain('## 当前场景：生意经营');
    // 用户点名的三个行业必须在场景说明里可感知（业态覆盖写在提示词/示例里）
    expect(s?.desc).toBeTruthy();
    // 合规红线：涉赌与电动车改装不可做
    expect(s?.prompt).toContain('红线');
    expect(s?.examples.join(' ')).toMatch(/电动车|棋牌室|餐饮|面馆/);
  });

  it('所有场景 agentId 指向既有智能体（不新建未登记 id）', () => {
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
