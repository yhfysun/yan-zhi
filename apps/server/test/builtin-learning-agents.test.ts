// 英语学习陪练定义回归测试（范式照抄 builtin-douyin-agents.test.ts，只 import 纯数据模块）。
// 为什么值得测：
//   1) id 是前端 /learning 工作区与场景卡的绑定对象，改一字 = 静默失联（宠物伴星方案同款坑）；
//   2) force_sync 必须为 true —— 提示词是教学产品的核心资产，旧库改了拿不到新版 = 白改；
//   3) P0 不挂业务工具（对话形态不需要，挂了让 ReAct 在无关工具上打转）；
//   4) 教学宪法红线（纠错上限/回复长度/中文兜底/SCENE_END 降级）必须写死在提示词里。
import { describe, it, expect } from 'vitest';
import {
  LEARNING_AGENT_ID,
  LEARNING_AGENT_BUILTIN_TOOLS,
  LEARNING_AGENT_SYSTEM_PROMPT,
  LEARNING_PROMPT_CONTEXT_MARK,
  builtinLearningAgentDefs,
} from '../src/builtin-learning-agents';

describe('英语学习陪练 · id 与 seed 结构', () => {
  it('id 契约：前端按它绑定（改 id 必须同步前端）', () => {
    expect(LEARNING_AGENT_ID).toBe('a_builtin_learning_coach');
  });

  it('恰好一个条目，且不与既有内置 id 冲突', () => {
    expect(builtinLearningAgentDefs.map((d) => d.id)).toEqual([LEARNING_AGENT_ID]);
    const taken = ['a_default_assistant', 'a_builtin_page_agent', 'a_builtin_douyin_agent', 'a_builtin_data_agent'];
    for (const t of taken) expect(LEARNING_AGENT_ID).not.toBe(t);
  });

  it('type=harness / is_builtin=1 / agent_kind=main / category=学习', () => {
    const def = builtinLearningAgentDefs[0];
    expect(def.type).toBe('harness');
    expect(def.is_builtin).toBe(1);
    expect(def.agent_kind).toBe('main');
    expect(def.category).toBe('学习');
  });

  it('★ force_sync=true（否则旧库改了提示词拿不到新版）', () => {
    expect(builtinLearningAgentDefs[0].force_sync).toBe(true);
  });

  it('P1 挂 3 个只读学习查询工具（白名单与 learning/tools.ts 成对维护）', () => {
    expect(LEARNING_AGENT_BUILTIN_TOOLS).toEqual(['learning_get_profile', 'learning_query_words', 'learning_get_history']);
    expect(JSON.parse(String(builtinLearningAgentDefs[0].builtin_tool_ids))).toEqual(LEARNING_AGENT_BUILTIN_TOOLS);
  });

  it('maxReActSteps 兜底 200（防跑飞，非工作预算）', () => {
    expect(JSON.parse(String(builtinLearningAgentDefs[0].config_json))).toEqual({ maxReActSteps: 200 });
  });

  it('name / description / system_prompt 非空', () => {
    const def = builtinLearningAgentDefs[0];
    expect(String(def.name).length).toBeGreaterThan(0);
    expect(String(def.description).length).toBeGreaterThan(20);
    expect(String(def.system_prompt).length).toBeGreaterThan(600);
  });
});

describe('英语学习陪练 · 教学宪法红线', () => {
  it('上下文注入标记出现在提示词里（与 context.ts 成对维护）', () => {
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain(LEARNING_PROMPT_CONTEXT_MARK);
  });

  it('CEFR 锁级 + i+1 + 摸底流程', () => {
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('CEFR');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('i+1');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('摸底');
  });

  it('★ 纠错上限：单轮最多 2 处 + 三段式格式', () => {
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('单轮最多挑 2 个');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('三段式');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('recast');
  });

  it('★ 回复长度纪律：≤3 句英语', () => {
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('≤ 3 句英语');
  });

  it('★ 中文兜底：不强推英语', () => {
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('要试试用英语说吗');
  });

  it('★ 场景结束标记 [SCENE_END] + JSON 降级策略', () => {
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('[SCENE_END]');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('不要为凑 JSON 硬编造评分');
  });

  it('词本边界：只读工具 + 不能替用户加词/改进度（写路径在应用 UI 与收尾钩子）', () => {
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('只读');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('**不能**替用户加词');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('learning_query_words');
  });

  it('不惩罚错误、新词限量', () => {
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('不嘲笑、不惩罚');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('新词一次 ≤ 5 个');
  });
});
