/**
 * 抖音运营助手（带货 + 引流一体）定义回归测试。
 *
 * 为什么值得测：
 *   1) 它是「抖音运营场景卡 → 专属智能体」的绑定对象：前端 config/scenes.ts 的 douyin 卡、
 *      agentIcon.ts 的图标登记、scene_config 种子的 douyin 行都按 id 硬引用；
 *      id 改一个字，场景卡就指向不存在的助手，而前端 setScene 有 `agents.some(...)` 守卫，
 *      **找不到就静默不切**（不报错）。
 *   2) force_sync 必须为 true —— 内置定义以代码为准。少了它，旧库只「补空不覆盖」，
 *      改了提示词拿不到新版（内置工作流那边踩过）。
 *   3) 挂载的 skill id 必须真实存在于 skill 表种子（skill_douyin_sell / skill_douyin_traffic），
 *      否则后端 buildSystemPrompt 查不到 → 静默不注入流程指引。
 *   4) 挂载的工具必须在注册表 / SUPPORTED_API_TOOLS 里（api_image_generate 是 api_* 工具，
 *      不在 core registry，漏判 = 静默丢弃）。
 *   5) 抖音业务红线（不承诺涨粉/收益、不刷量、极限词、不代发布）必须写死在提示词里，
 *      不能被后续「精简提示词」顺手删掉。
 *
 * 本测试只 import 纯数据模块（不 import db，避免打开 SQLite / 依赖 better-sqlite3）。
 */
import { describe, it, expect } from 'vitest';
import {
  DOUYIN_AGENT_ID,
  DOUYIN_AGENT_BUILTIN_TOOLS,
  DOUYIN_AGENT_SKILL_IDS,
  DOUYIN_AGENT_SYSTEM_PROMPT,
  builtinDouyinAgentDefs,
} from '../src/builtin-douyin-agents';

/** skill 表种子里存在的内置 skill id（db.ts builtinSkillDefaults + STANDALONE_SKILL_DEFAULTS） */
const KNOWN_SKILL_IDS = new Set([
  'skill_pptx_creation', 'skill_docx_processing', 'skill_xlsx_data_processing', 'skill_pdf_processing',
  'skill_image_processing', 'skill_file_convert', 'skill_data_visualization', 'skill_markdown_doc',
  'skill_translation_workflow', 'skill_business_ops',
  // 2026-10-12 新增：抖音两条线（本测试的被测对象）
  'skill_douyin_sell', 'skill_douyin_traffic',
]);

/** 已注册的内置工具名（core registerBuiltInTools + api-tool-executor 的 SUPPORTED_API_TOOLS） */
const KNOWN_TOOL_NAMES = new Set([
  // 核心内置工具
  'file_read', 'file_write', 'file_edit', 'file_grep', 'file_list', 'file_to_markdown',
  'code_search', 'code_outline', 'code_diagnostics', 'cmd_exec', 'js_exec', 'python_exec',
  'call_agent', 'spawn_subagent', 'list_sub_agents', 'list_models',
  'ask_user', 'confirm_user', 'task_plan', 'task_step',
  'image_analyze',
  // 浏览器
  'browser_navigate', 'browser_get_page_content',
  // api_* 直查工具（不走 ToolRegistry，但必须并入判定集合）
  'api_tool_ocr',
  // AI 媒体生成（api-tool-executor 的 SUPPORTED_API_TOOLS，短剧导演同款挂载）
  'api_image_generate', 'api_video_generate', 'api_video_status',
]);

describe('抖音运营助手 · id 与场景卡绑定契约', () => {
  it('id 与前端 scenes.ts / agentIcon.ts / scene_config 种子的硬引用一致', () => {
    // 这几处按 id 硬引用，改一处不改全部 = 静默失联
    expect(DOUYIN_AGENT_ID).toBe('a_builtin_douyin_agent');
  });

  it('id 与既有内置智能体不冲突', () => {
    const ids = builtinDouyinAgentDefs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const taken of ['a_default_assistant', 'a_builtin_page_agent', 'a_builtin_translate_agent', 'a_builtin_business_agent']) {
      expect(ids).not.toContain(taken);
    }
  });
});

describe('抖音运营助手 · seed 条目结构', () => {
  it('恰好一个条目（带货与引流共用一个智能体，用户拍板）', () => {
    expect(builtinDouyinAgentDefs.map((d) => d.id)).toEqual([DOUYIN_AGENT_ID]);
  });

  it('type=harness / is_builtin=1 / agent_kind=main / category=办公', () => {
    const def = builtinDouyinAgentDefs[0];
    expect(def.type).toBe('harness');
    expect(def.is_builtin).toBe(1);
    expect(def.agent_kind).toBe('main');
    expect(def.category).toBe('办公');
  });

  it('★ force_sync=true（否则旧库改了提示词拿不到新版）', () => {
    expect(builtinDouyinAgentDefs[0].force_sync).toBe(true);
  });

  it('maxReActSteps=40（选题+脚本+选品+复盘一条长链路）', () => {
    expect(JSON.parse(String(builtinDouyinAgentDefs[0].config_json))).toEqual({ maxReActSteps: 40 });
  });

  it('挂 pageAgent 作为子智能体（查平台规则 / 热点 / 竞品）', () => {
    expect(JSON.parse(String(builtinDouyinAgentDefs[0].sub_agent_ids))).toEqual(['a_builtin_page_agent']);
  });

  it('name / description / system_prompt 都非空', () => {
    const def = builtinDouyinAgentDefs[0];
    expect(String(def.name).length).toBeGreaterThan(0);
    expect(String(def.description).length).toBeGreaterThan(20);
    expect(String(def.system_prompt).length).toBeGreaterThan(600);
  });
});

describe('抖音运营助手 · 挂载的工具与技能必须真实存在', () => {
  it('所有挂载工具都在已知工具清单里（拼错 = 静默丢弃）', () => {
    const unknown: string[] = [];
    for (const t of DOUYIN_AGENT_BUILTIN_TOOLS) {
      if (!KNOWN_TOOL_NAMES.has(t)) unknown.push(t);
    }
    expect(unknown).toEqual([]);
  });

  it('★ api_image_generate 已挂（图文封面/商品图素材；短剧导演同款）', () => {
    expect(DOUYIN_AGENT_BUILTIN_TOOLS).toContain('api_image_generate');
  });

  it('所有挂载 skill 都在 skill 表种子里（拼错 = 静默不注入流程指引）', () => {
    const unknown: string[] = [];
    for (const s of DOUYIN_AGENT_SKILL_IDS) {
      if (!KNOWN_SKILL_IDS.has(s)) unknown.push(s);
    }
    expect(unknown).toEqual([]);
  });

  it('带货 + 引流两个 skill 都挂上（一体两线的分工靠它们收敛）', () => {
    expect(DOUYIN_AGENT_SKILL_IDS).toContain('skill_douyin_sell');
    expect(DOUYIN_AGENT_SKILL_IDS).toContain('skill_douyin_traffic');
  });

  it('带基础底座：读写文件 + python 测算 + 看图 + 委派 + 交互', () => {
    for (const t of ['file_read', 'file_write', 'file_list', 'python_exec', 'image_analyze', 'call_agent', 'list_sub_agents', 'ask_user', 'confirm_user', 'task_plan']) {
      expect(DOUYIN_AGENT_BUILTIN_TOOLS, `缺 ${t}`).toContain(t);
    }
  });

  it('★ 不挂数据取数链（抖音运营不需要本体取数，挂上会让模型在无关工具上打转）', () => {
    for (const t of ['api_data_query', 'api_ontology_search', 'api_ontology_overview']) {
      expect(DOUYIN_AGENT_BUILTIN_TOOLS, `不应挂 ${t}`).not.toContain(t);
    }
  });
});

describe('抖音运营助手 · 提示词覆盖与业务红线', () => {
  it('两线一体：引流线 + 带货线 + 咬合关系', () => {
    for (const kw of ['引流', '带货', '人群']) {
      expect(DOUYIN_AGENT_SYSTEM_PROMPT, `缺关键词 ${kw}`).toContain(kw);
    }
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('图文带货');
  });

  it('覆盖两条 skill 的方法论关键词（选题/脚本/选品/挂车/漏斗复盘）', () => {
    for (const kw of ['选题', '脚本', '选品', '挂车', '转化']) {
      expect(DOUYIN_AGENT_SYSTEM_PROMPT, `缺关键词 ${kw}`).toContain(kw);
    }
  });

  it('开工先诊断账号现状（粉丝/定位/人群/目标一次问全）', () => {
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('账号现状');
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('一次问全');
  });

  it('★ 红线一：不承诺涨粉/收益数据', () => {
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('不承诺');
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('保证涨粉');
  });

  it('★ 红线二：不刷量不搬运、极限词与功效宣称不写', () => {
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('不刷量');
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('极限词');
  });

  it('★ 红线三：不代发布（不登录用户抖音号）', () => {
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('不代发布');
  });

  it('平台规则委派 pageAgent 核实，不凭记忆下结论', () => {
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('pageAgent');
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('a_builtin_page_agent');
  });

  it('交付落盘纪律：file_write（deliverable）+ 对话给摘要与路径', () => {
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('file_write');
    expect(DOUYIN_AGENT_SYSTEM_PROMPT).toContain('deliverable');
  });
});
