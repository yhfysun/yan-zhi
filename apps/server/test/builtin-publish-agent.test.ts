/**
 * 发布执行员（三层编排的执行层）定义与接线回归测试。
 *
 * 为什么值得测：
 *   1) 它是「策划层 → 执行层」委派链的枢纽：代言官提示词、小说推文提示词、
 *      发布队列 dispatch 指令三处都按 id 硬引用 a_builtin_publish_agent——
 *      id 改一个字，三处全部指向不存在的智能体（call_agent 会报"不存在或不可用"）。
 *   2) force_sync 必须为 true —— 内置定义以代码为准，改了提示词旧库必须拿到新版。
 *   3) 挂载的 skill（skill_novel_tuiwen）必须真实存在——配方库挂空 = 执行员两手空空，
 *      退化为又一个"从零摸索平台页面"的通用 agent（正是本拆分要消灭的形态）。
 *   4) 工具面收口：浏览器全家桶必须有（upload/fill_form 是发布刚需），
 *      本地执行面（python/js/cmd）必须没有——执行员是"手"不是"脑"。
 *   5) 业务红线必须写死在提示词：真实键盘输入、browser_upload only、3 次重试上限、
 *      汇报纪律（回执必带证据）。
 *
 * 本测试只 import 纯数据模块（不 import db，避免打开 SQLite / 依赖 better-sqlite3）。
 */
import { describe, it, expect } from 'vitest';
import {
  PUBLISH_AGENT_ID,
  PUBLISH_AGENT_BUILTIN_TOOLS,
  PUBLISH_AGENT_SKILL_IDS,
  PUBLISH_AGENT_SYSTEM_PROMPT,
  builtinPublishAgentDefs,
} from '../src/builtin-publish-agent';
import { YANZHI_AGENT_ID, builtinYanzhiAgentDefs } from '../src/builtin-yanzhi-agent';
import { NOVEL_TUIWEN_AGENT_ID, builtinTaskModeAgentDefs } from '../src/builtin-task-mode-agents';

/** skill 表种子里存在的内置 skill id（db.ts builtinSkillDefaults + STANDALONE_SKILL_DEFAULTS） */
const KNOWN_SKILL_IDS = new Set([
  'skill_pptx_creation', 'skill_docx_processing', 'skill_xlsx_data_processing', 'skill_pdf_processing',
  'skill_image_processing', 'skill_file_convert', 'skill_data_visualization', 'skill_markdown_doc',
  'skill_translation_workflow', 'skill_business_ops',
  'skill_douyin_sell', 'skill_douyin_traffic',
  // ★ 发布执行员的配方库（平台页面实测配方全在它的 references/pages/ 下）
  'skill_novel_tuiwen',
]);

/** 已注册的内置工具名（core registerBuiltInTools + api-tool-executor 的 SUPPORTED_API_TOOLS） */
const KNOWN_TOOL_NAMES = new Set([
  // 核心内置工具
  'file_read', 'file_write', 'file_edit', 'file_grep', 'file_list',
  'cmd_exec', 'js_exec', 'python_exec',
  'call_agent', 'spawn_subagent', 'list_sub_agents', 'list_models',
  'ask_user', 'confirm_user', 'task_plan', 'task_step',
  'image_analyze',
  // 浏览器（与 pageAgent 挂载同口径，见 db.ts PAGE_AGENT_BUILTIN_TOOLS）
  'browser_navigate', 'browser_type', 'browser_click', 'browser_get_page_content',
  'browser_get_page_info', 'browser_get_dom', 'browser_get_visible_text',
  'browser_scroll', 'browser_run_script',
  'browser_upload', 'browser_fill_form', 'browser_submit_form',
  'browser_screenshot',
]);

describe('发布执行员 · id 与三层编排接线', () => {
  it('id 稳定（代言官提示词 / 小说推文 sub_agent_ids / dispatch 指令三处硬引用）', () => {
    expect(PUBLISH_AGENT_ID).toBe('a_builtin_publish_agent');
  });

  it('id 与既有内置智能体不冲突', () => {
    const taken = [
      'a_default_assistant', 'a_builtin_page_agent', 'a_builtin_yanzhi_agent',
      'a_builtin_novel_tuiwen_agent', 'a_builtin_douyin_agent', 'a_builtin_data_agent',
    ];
    expect(taken).not.toContain(PUBLISH_AGENT_ID);
  });

  it('★ 言智代言官已挂发布执行员为子智能体（发布/复盘委派链的前提）', () => {
    const def = builtinYanzhiAgentDefs.find((d) => d.id === YANZHI_AGENT_ID);
    expect(def).toBeTruthy();
    const subs = JSON.parse(String(def!.sub_agent_ids)) as string[];
    expect(subs).toContain(PUBLISH_AGENT_ID);
    expect(subs).toContain('a_builtin_page_agent'); // pageAgent 保留（查规则/竞品）
  });

  it('★ 代言官提示词发布执行与数据复盘都指向发布执行员（不再委派 pageAgent 摸发布页）', () => {
    const def = builtinYanzhiAgentDefs.find((d) => d.id === YANZHI_AGENT_ID)!;
    const prompt = String(def.system_prompt);
    expect(prompt).toContain('a_builtin_publish_agent');
    expect(prompt).toContain('发布执行员');
  });

  it('★ 小说推文助手已挂发布执行员（页面层可整体委派）', () => {
    const def = builtinTaskModeAgentDefs.find((d) => d.id === NOVEL_TUIWEN_AGENT_ID);
    expect(def).toBeTruthy();
    const subs = JSON.parse(String(def!.sub_agent_ids)) as string[];
    expect(subs).toContain(PUBLISH_AGENT_ID);
    // 提示词里要有委派选项（允许自己直接操作，不强制）
    expect(String(def!.system_prompt)).toContain('a_builtin_publish_agent');
  });
});

describe('发布执行员 · seed 条目结构', () => {
  it('恰好一个条目', () => {
    expect(builtinPublishAgentDefs.map((d) => d.id)).toEqual([PUBLISH_AGENT_ID]);
  });

  it('type=harness / is_builtin=1 / force_sync=true', () => {
    const def = builtinPublishAgentDefs[0];
    expect(def.type).toBe('harness');
    expect(def.is_builtin).toBe(1);
    expect(def.force_sync).toBe(true);
  });

  it('maxReActSteps=80（登录态判断→上传→转码→表单→提交→核验，链路长）', () => {
    expect(JSON.parse(String(builtinPublishAgentDefs[0].config_json))).toEqual({ maxReActSteps: 80 });
  });

  it('叶子执行者：不挂子智能体（防委派链膨胀）', () => {
    expect(JSON.parse(String(builtinPublishAgentDefs[0].sub_agent_ids))).toEqual([]);
  });

  it('name / description / system_prompt 都非空', () => {
    const def = builtinPublishAgentDefs[0];
    expect(String(def.name).length).toBeGreaterThan(0);
    expect(String(def.description).length).toBeGreaterThan(20);
    expect(String(def.system_prompt).length).toBeGreaterThan(600);
  });
});

describe('发布执行员 · 工具面收口', () => {
  it('所有挂载工具都在已知工具清单里（拼错 = 静默丢弃）', () => {
    const unknown = PUBLISH_AGENT_BUILTIN_TOOLS.filter((t) => !KNOWN_TOOL_NAMES.has(t));
    expect(unknown).toEqual([]);
  });

  it('★ 发布刚需工具齐全：upload / fill_form / run_script / 截图兜底', () => {
    for (const t of ['browser_upload', 'browser_fill_form', 'browser_run_script', 'browser_screenshot', 'image_analyze']) {
      expect(PUBLISH_AGENT_BUILTIN_TOOLS, `缺 ${t}`).toContain(t);
    }
  });

  it('★ 本地执行面收窄：不挂 python/js/cmd（执行员是"手"不是"脑"）', () => {
    for (const t of ['python_exec', 'js_exec', 'cmd_exec']) {
      expect(PUBLISH_AGENT_BUILTIN_TOOLS, `不应挂 ${t}`).not.toContain(t);
    }
  });

  it('★ 不挂 call_agent（叶子执行者，不再向下委派）', () => {
    expect(PUBLISH_AGENT_BUILTIN_TOOLS).not.toContain('call_agent');
  });

  it('读媒体与落盘回执证据：file_read / file_list / file_write 必须有', () => {
    for (const t of ['file_read', 'file_list', 'file_write']) {
      expect(PUBLISH_AGENT_BUILTIN_TOOLS, `缺 ${t}`).toContain(t);
    }
  });

  it('配方库 skill 真实存在（挂空 = 两手空空摸平台）', () => {
    const unknown = PUBLISH_AGENT_SKILL_IDS.filter((s) => !KNOWN_SKILL_IDS.has(s));
    expect(unknown).toEqual([]);
    expect(PUBLISH_AGENT_SKILL_IDS).toContain('skill_novel_tuiwen');
  });
});

describe('发布执行员 · 提示词红线', () => {
  it('上传只用 browser_upload，禁自造替代通道', () => {
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('browser_upload');
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('file://');
  });

  it('contenteditable 真实键盘输入（JS 设 innerText 必然失效）', () => {
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('真实键盘');
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('innerText');
  });

  it('3 次重试上限（禁止无限硬试）', () => {
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('3 次');
  });

  it('汇报纪律：回执必带证据，严禁没证据报成功', () => {
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('汇报纪律');
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('证据');
  });

  it('只做指令内的动作（不做账号设置/删除等越权操作）', () => {
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('不做指令外');
  });

  it('先读配方再动手（references/pages/ 配方库用法）', () => {
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('references/pages');
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('实抓复核');
  });

  it('预览面板收起假死的判断（页面假死头号根因，别误判站点故障）', () => {
    expect(PUBLISH_AGENT_SYSTEM_PROMPT).toContain('面板收起');
  });
});
