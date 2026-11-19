// 英语学习陪练定义回归测试（范式照抄 builtin-douyin-agents.test.ts，只 import 纯数据模块）。
// 为什么值得测：
//   1) id 是前端 /learning 工作区与场景卡的绑定对象，改一字 = 静默失联（宠物伴星方案同款坑）；
//   2) force_sync 必须为 true —— 提示词是教学产品的核心资产，旧库改了拿不到新版 = 白改；
//   3) P0 不挂业务工具（对话形态不需要，挂了让 ReAct 在无关工具上打转）；
//   4) 教学宪法红线（纠错上限/回复长度/中文兜底/SCENE_END 降级）必须写死在提示词里。
import { describe, it, expect } from 'vitest';
import {
  LEARNING_AGENT_ID,
  CULTURE_COACH_AGENT_ID,
  MUSIC_COACH_AGENT_ID,
  SUBJECT_COACH_AGENT_ID,
  LEARNING_AGENT_BUILTIN_TOOLS,
  LEARNING_AGENT_SYSTEM_PROMPT,
  CULTURE_COACH_SYSTEM_PROMPT,
  MUSIC_COACH_SYSTEM_PROMPT,
  SUBJECT_COACH_SYSTEM_PROMPT,
  LEARNING_PROMPT_CONTEXT_MARK,
  builtinLearningAgentDefs,
  learningSubjectOfAgentId,
} from '../src/builtin-learning-agents';

describe('英语学习陪练 · id 与 seed 结构', () => {
  it('id 契约：前端按它绑定（改 id 必须同步前端）', () => {
    expect(LEARNING_AGENT_ID).toBe('a_builtin_learning_coach');
  });

  it('学习类内置条目 id 互不冲突且不占既有内置 id', () => {
    const ids = builtinLearningAgentDefs.map((d) => d.id);
    expect(ids).toContain(LEARNING_AGENT_ID);
    expect(new Set(ids).size).toBe(ids.length);
    const taken = ['a_default_assistant', 'a_builtin_page_agent', 'a_builtin_douyin_agent', 'a_builtin_data_agent'];
    for (const id of ids) expect(taken).not.toContain(id);
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

describe('全科学习陪练 · 21 科通用入口', () => {
  it('注册通用陪练 id，且使用同一套只读学习工具', () => {
    expect(SUBJECT_COACH_AGENT_ID).toBe('a_builtin_learning_subject_coach');
    const def = builtinLearningAgentDefs.find((item) => item.id === SUBJECT_COACH_AGENT_ID);
    expect(def).toBeTruthy();
    expect(JSON.parse(String(def?.builtin_tool_ids))).toEqual(LEARNING_AGENT_BUILTIN_TOOLS);
    expect(def?.force_sync).toBe(true);
    expect(String(def?.system_prompt)).toContain(LEARNING_PROMPT_CONTEXT_MARK);
  });

  it('提示词钉住零基础、不伪造来源与高风险实践边界', () => {
    expect(SUBJECT_COACH_SYSTEM_PROMPT).toContain('零基础');
    expect(SUBJECT_COACH_SYSTEM_PROMPT).toContain('绝不伪造原文');
    expect(SUBJECT_COACH_SYSTEM_PROMPT).toContain('网络安全只讨论授权靶场');
    expect(SUBJECT_COACH_SYSTEM_PROMPT).toContain('占卜只作文化、象征、概率与心理复盘');
    expect(SUBJECT_COACH_SYSTEM_PROMPT).toContain('不能替用户修改进度');
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
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('自由陪练与场景陪练是两条链路');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('不能一问一答就结束');
    expect(LEARNING_AGENT_SYSTEM_PROMPT).toContain('完成全部 mission');
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

describe('传统文化/音乐陪练 · 契约（§4.6 P1）', () => {
  it('★ id 注册存在（扩展表/场景卡按它绑定，改一字 = 静默失联）', () => {
    expect(CULTURE_COACH_AGENT_ID).toBe('a_builtin_culture_coach');
    expect(MUSIC_COACH_AGENT_ID).toBe('a_builtin_music_coach');
    const ids = builtinLearningAgentDefs.map((d) => d.id);
    expect(ids).toContain(CULTURE_COACH_AGENT_ID);
    expect(ids).toContain(MUSIC_COACH_AGENT_ID);
  });

  it('★ 教学宪法红线写死在提示词（不虚构典籍原文 / 不打分 / 三项口径 / 分域口径）', () => {
    expect(CULTURE_COACH_SYSTEM_PROMPT).toContain('不虚构典籍原文');
    expect(CULTURE_COACH_SYSTEM_PROMPT).toContain('此篇暂无人工注解');
    expect(CULTURE_COACH_SYSTEM_PROMPT).toContain('字数、词性、平仄');
    expect(MUSIC_COACH_SYSTEM_PROMPT).toContain('不打分');
    expect(MUSIC_COACH_SYSTEM_PROMPT).toContain('宫=1=上=C');
    // 分域硬闸（音乐双方向重构方案 2026-11-15 §七）：两方向术语不串味 + 工具≠体系
    expect(MUSIC_COACH_SYSTEM_PROMPT).toContain('分域口径');
    expect(MUSIC_COACH_SYSTEM_PROMPT).toContain('不把《小星星》这类西方大调儿歌说成宫调式');
  });

  it('挂载与英语陪练相同的 3 个只读工具 + force_sync + 注入标记成对', () => {
    const cultureDef = builtinLearningAgentDefs.find((d) => d.id === CULTURE_COACH_AGENT_ID)!;
    const musicDef = builtinLearningAgentDefs.find((d) => d.id === MUSIC_COACH_AGENT_ID)!;
    for (const def of [cultureDef, musicDef]) {
      expect(JSON.parse(String(def.builtin_tool_ids))).toEqual(LEARNING_AGENT_BUILTIN_TOOLS);
      expect(def.force_sync).toBe(true);
      expect(String(def.system_prompt)).toContain(LEARNING_PROMPT_CONTEXT_MARK);
    }
  });

  it('科目推断：陪练 id → 科目，其余（含英语陪练/空）回 undefined 走缺省语义', () => {
    expect(learningSubjectOfAgentId(CULTURE_COACH_AGENT_ID)).toBe('传统文化');
    expect(learningSubjectOfAgentId(MUSIC_COACH_AGENT_ID)).toBe('音乐');
    expect(learningSubjectOfAgentId(LEARNING_AGENT_ID)).toBeUndefined();
    expect(learningSubjectOfAgentId(null)).toBeUndefined();
  });
});
