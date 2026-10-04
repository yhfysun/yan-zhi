/**
 * 办公岗位专属内置智能体（翻译助手 / 个人生意助手）定义回归测试。
 *
 * 为什么值得测：
 *   1) 这两个助手是「岗位卡 → 专属智能体」的绑定对象，前端 config/scenes.ts 与
 *      图标映射 agentIcon.ts 都按 id 硬引用；id 改一个字，场景卡就会指向不存在的助手，
 *      而且**前端不报错**（setScene 里有一段 `agents.some(...)` 守卫，找不到就静默不切）。
 *   2) force_sync 必须为 true —— 内置定义以代码为准。少了它，用户机器上的旧库
 *      只会「补空不覆盖」，改了提示词也拿不到新版（这个坑在内置工作流那边踩过）。
 *   3) 挂载的 skill id 必须真实存在（skill 表种子里的 id），否则后端 buildSystemPrompt
 *      查不到该 skill → 静默不注入流程指引，模型不知道该怎么干活却不报错。
 *   4) 生意助手有硬性业务红线（涉赌 / 电动车改装），提示词里必须写死，不能被后续
 *      「精简提示词」的改动顺手删掉。
 *
 * 本测试只 import 纯数据模块（不 import db，避免打开 SQLite / 依赖 better-sqlite3）。
 */
import { describe, it, expect } from 'vitest';
import {
  TRANSLATE_AGENT_ID, BUSINESS_AGENT_ID,
  TRANSLATE_AGENT_BUILTIN_TOOLS, TRANSLATE_AGENT_SKILL_IDS, TRANSLATE_AGENT_SYSTEM_PROMPT,
  BUSINESS_AGENT_BUILTIN_TOOLS, BUSINESS_AGENT_SKILL_IDS, BUSINESS_AGENT_SYSTEM_PROMPT,
  builtinOfficeAgentDefs,
} from '../src/builtin-office-agents';

/** skill 表种子里存在的内置 skill id（apps/server/src/db.ts 与 STANDALONE_SKILL_DEFAULTS） */
const KNOWN_SKILL_IDS = new Set([
  'skill_pptx_creation', 'skill_docx_processing', 'skill_xlsx_data_processing', 'skill_pdf_processing',
  'skill_image_processing', 'skill_file_convert', 'skill_data_visualization', 'skill_markdown_doc',
  'skill_translation_workflow', 'skill_business_ops',
]);

/** 已注册的内置工具名（packages/core 的 registerBuiltInTools + api-tool-executor 的 SUPPORTED_API_TOOLS） */
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
]);

describe('内置办公岗位智能体 · id 与场景卡绑定契约', () => {
  it('两个 id 与前端 scenes.ts / agentIcon.ts 的硬引用一致', () => {
    // 这两个字面量在前端三处被引用，改一处不改全部 = 静默失联
    expect(TRANSLATE_AGENT_ID).toBe('a_builtin_translate_agent');
    expect(BUSINESS_AGENT_ID).toBe('a_builtin_business_agent');
  });

  it('id 唯一且与既有内置智能体不冲突', () => {
    const ids = builtinOfficeAgentDefs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('a_default_assistant');
    expect(ids).not.toContain('a_builtin_page_agent');
  });
});

describe('内置办公岗位智能体 · seed 条目结构', () => {
  it('恰好两个条目（翻译 / 生意），顺序稳定', () => {
    expect(builtinOfficeAgentDefs.map((d) => d.id)).toEqual([TRANSLATE_AGENT_ID, BUSINESS_AGENT_ID]);
  });

  it.each([
    ['翻译助手', TRANSLATE_AGENT_ID],
    ['个人生意助手', BUSINESS_AGENT_ID],
  ])('%s：type=harness / is_builtin=1 / agent_kind=main / category=办公', (_name, id) => {
    const def = builtinOfficeAgentDefs.find((d) => d.id === id)!;
    expect(def.type).toBe('harness');
    expect(def.is_builtin).toBe(1);
    expect(def.agent_kind).toBe('main');
    expect(def.category).toBe('办公');
  });

  it.each([
    ['翻译助手', TRANSLATE_AGENT_ID],
    ['个人生意助手', BUSINESS_AGENT_ID],
  ])('%s：★ force_sync=true（否则旧库改了提示词拿不到新版）', (_name, id) => {
    const def = builtinOfficeAgentDefs.find((d) => d.id === id)!;
    expect(def.force_sync).toBe(true);
  });

  it.each([
    ['翻译助手', TRANSLATE_AGENT_ID, 40],
    ['个人生意助手', BUSINESS_AGENT_ID, 40],
  ])('%s：maxReActSteps 给足（长链路任务）', (_name, id, steps) => {
    const def = builtinOfficeAgentDefs.find((d) => d.id === id)!;
    expect(JSON.parse(String(def.config_json))).toEqual({ maxReActSteps: steps });
  });

  it('两个助手都挂 pageAgent 作为子智能体（查术语 / 查政策）', () => {
    for (const def of builtinOfficeAgentDefs) {
      expect(JSON.parse(String(def.sub_agent_ids))).toEqual(['a_builtin_page_agent']);
    }
  });

  it('name / description / system_prompt 都非空', () => {
    for (const def of builtinOfficeAgentDefs) {
      expect(String(def.name).length).toBeGreaterThan(0);
      expect(String(def.description).length).toBeGreaterThan(20);
      expect(String(def.system_prompt).length).toBeGreaterThan(600);
    }
  });
});

describe('内置办公岗位智能体 · 挂载的工具与技能必须真实存在', () => {
  it('所有挂载工具都在已知工具清单里（拼错 = 静默丢弃）', () => {
    const unknown: string[] = [];
    for (const def of builtinOfficeAgentDefs) {
      for (const t of JSON.parse(String(def.builtin_tool_ids)) as string[]) {
        if (!KNOWN_TOOL_NAMES.has(t)) unknown.push(`${def.id}: ${t}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('所有挂载 skill 都在 skill 表种子里（拼错 = 静默不注入流程指引）', () => {
    const unknown: string[] = [];
    for (const def of builtinOfficeAgentDefs) {
      for (const s of JSON.parse(String(def.skill_ids)) as string[]) {
        if (!KNOWN_SKILL_IDS.has(s)) unknown.push(`${def.id}: ${s}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('两个助手都带基础底座：读写文件 + python + 委派 + 交互', () => {
    for (const def of builtinOfficeAgentDefs) {
      const tools = JSON.parse(String(def.builtin_tool_ids)) as string[];
      for (const t of ['file_read', 'file_write', 'file_to_markdown', 'python_exec', 'call_agent', 'ask_user']) {
        expect(tools, `${def.id} 缺 ${t}`).toContain(t);
      }
    }
  });

  it('★ 不挂数据取数链（翻译/生意不需要本体取数，挂上会让模型在无关工具上打转）', () => {
    for (const def of builtinOfficeAgentDefs) {
      const tools = JSON.parse(String(def.builtin_tool_ids)) as string[];
      for (const t of ['api_data_query', 'api_ontology_search', 'api_ontology_overview']) {
        expect(tools, `${def.id} 不应挂 ${t}`).not.toContain(t);
      }
    }
  });
});

describe('翻译助手 · 能力与硬约束', () => {
  it('挂齐「读资料 + 看图 + 看网页 + 批处理」四类工具', () => {
    for (const t of ['file_to_markdown', 'api_tool_ocr', 'image_analyze', 'browser_get_page_content', 'python_exec']) {
      expect(TRANSLATE_AGENT_BUILTIN_TOOLS, `缺 ${t}`).toContain(t);
    }
  });

  it('挂上行翻译方法论 skill', () => {
    expect(TRANSLATE_AGENT_SKILL_IDS).toContain('skill_translation_workflow');
  });

  it('提示词覆盖：语种判断 / 术语表 / 四项自检 / 免责 / 不编造', () => {
    for (const kw of ['源语言', '目标语言', '术语表', '漏译', '回译', '术语一致性', '仅供参考', '不静默猜']) {
      expect(TRANSLATE_AGENT_SYSTEM_PROMPT, `缺关键词 ${kw}`).toContain(kw);
    }
  });

  it('★ 提示词写死「数字/专有名词零改动」（公告与合同场景的关键约束）', () => {
    expect(TRANSLATE_AGENT_SYSTEM_PROMPT).toContain('零改动');
    expect(TRANSLATE_AGENT_SYSTEM_PROMPT).toContain('禁止漏译');
  });

  it('明确要求先转 md 再读办公文档，不直接读二进制', () => {
    expect(TRANSLATE_AGENT_SYSTEM_PROMPT).toContain('file_to_markdown');
    expect(TRANSLATE_AGENT_SYSTEM_PROMPT).toContain('不要直接读二进制办公文件');
  });
});

describe('个人生意助手 · 业态覆盖与合规红线', () => {
  it('提示词覆盖用户点名的三个行业（餐饮 / 电动车 / 棋牌室）', () => {
    for (const kw of ['餐饮', '电动车', '棋牌室']) {
      expect(BUSINESS_AGENT_SYSTEM_PROMPT, `缺行业 ${kw}`).toContain(kw);
    }
  });

  it('提示词覆盖更多实体业态（便利店 / 美业 / 教培）', () => {
    for (const kw of ['便利店', '美业', '教培']) {
      expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain(kw);
    }
  });

  it('★ 红线：棋牌室不得涉赌（抽头渔利 / 筹码兑现 / 为赌博提供条件）', () => {
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('涉赌');
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('抽头渔利');
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('筹码兑现');
    // 「行业惯例」这类软约束不能覆盖红线
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('红线');
  });

  it('★ 红线：电动车严禁解除限速与违规改装（监管红线，只做合规业务）', () => {
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('严禁解除限速');
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('3C 认证');
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('飞线充电');
  });

  it('红线不可协商：明确「一律不提供实施方案」', () => {
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('合规红线不可协商');
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('不提供实施方案');
  });

  it('测算链条完整：投资预算 / 固定成本 / 盈亏平衡 / 回本周期 / 保本日营业额', () => {
    for (const kw of ['投资预算', '月固定成本', '盈亏平衡', '回本周期', '保本日营业额']) {
      expect(BUSINESS_AGENT_SYSTEM_PROMPT, `缺测算项 ${kw}`).toContain(kw);
    }
    // 公式必须写出来，否则模型会自己即兴发挥
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('月固定成本 ÷ 毛利率');
  });

  it('诊断与经营指标齐备：量价拆解 / 坪效 / 人效 / 翻台率 / 毛利率 / 复购率', () => {
    for (const kw of ['量价', '坪效', '人效', '翻台率', '毛利率', '复购率']) {
      expect(BUSINESS_AGENT_SYSTEM_PROMPT, `缺指标 ${kw}`).toContain(kw);
    }
  });

  it('★ 反空话：禁止「提升服务体验 / 加强管理」这类不可执行建议', () => {
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('不说空话');
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('具体动作');
  });

  it('禁止编造行业数据；数据不足要显式列出缺口', () => {
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('禁止编造行业数据');
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('算不清就说不清');
  });

  it('挂上经营方法论 skill 与测算/交付类 skill', () => {
    expect(BUSINESS_AGENT_SKILL_IDS).toContain('skill_business_ops');
    for (const s of ['skill_xlsx_data_processing', 'skill_markdown_doc']) {
      expect(BUSINESS_AGENT_SKILL_IDS).toContain(s);
    }
  });

  it('视觉物料引导到设计创意场景（不越界做海报/短视频）', () => {
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('设计创意');
  });

  it('专业口径免责：以当地主管部门与税务机关为准', () => {
    expect(BUSINESS_AGENT_SYSTEM_PROMPT).toContain('主管税务机关口径为准');
  });
});