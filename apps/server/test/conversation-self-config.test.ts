/**
 * 会话自配置（`api_conversation_setup`）+ 会话身份注入 —— 守门测试。
 *
 * 用户要求（2026-09-27）：「智能体可以自己设置当前会话的智能体和 skill 和工作流程」。
 *
 * 这条链的失败模式全是**静默失效**，所以断言必须钉住"拦得住"而不是"字段填了"：
 *   ① 设了个不存在的 agentId → 后端查不到 agent 行 → 工具挂载/子智能体/技能全线降级为空（不报错）；
 *   ② 技能 id 悬空 → 不注入，不报错；
 *   ③ mode 写非法值 → 会话在哪个模式的列表里都看不到；
 *   ④ 换了身份但**模型自己不知道** → 下一轮仍按旧身份说话（换了等于没换）。
 * 前三条靠"明确报错"，第四条靠"提示词注入当前身份"。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const EXECUTOR = read('src/mcp/api-tool-executor.ts');
const LTM = read('src/llm-task-manager.ts');
const DB = read('src/db.ts');
const PERM = read('src/tool-permission.ts');
const SCHEMA = readRepo('packages/core/src/tool/builtin/api-tools/conversation.ts');
const TASK_AGENTS = read('src/builtin-task-mode-agents.ts');

/** 取某 case 的实现体（到下一个 case 为止） */
function caseBody(name: string): string {
  const start = EXECUTOR.indexOf(`case '${name}'`);
  expect(start, `★ 找不到 case ${name}`).toBeGreaterThan(-1);
  const rest = EXECUTOR.slice(start + 10);
  const next = rest.indexOf("\n      case '");
  return rest.slice(0, next > 0 ? next : 20000);
}

describe('① 工具存在且可被模型看到', () => {
  it('★★ 实现 + 可执行集合 + schema 三处都要有（缺一处就是"注册了但模型看不到/执行不到"）', () => {
    expect(EXECUTOR, '★ 缺 case 实现').toMatch(/case 'api_conversation_setup'/);
    expect(EXECUTOR, '★★ 未登记进 SUPPORTED_API_TOOLS（模型调到也执行不到）')
      .toMatch(/'api_conversation_update', 'api_conversation_delete',\s*\n\s*'api_conversation_setup'/);
    expect(SCHEMA, '★ 缺 schema（模型根本看不到这个工具）').toMatch(/name: 'api_conversation_setup'/);
  });

  it('★★ 要挂到智能体上（默认助手 + 任务模式智能体）', () => {
    expect(DB, '★★ 默认助手未挂 api_conversation_setup').toMatch(/'api_conversation_setup'/);
    expect(TASK_AGENTS, '★★ 任务模式智能体未挂').toMatch(/COMMON_SPACE_TOOLS[\s\S]{0,200}api_conversation_setup/);
  });

  it('★★ 只读会话必须拦住（换了身份会改变后续所有轮次的执行）', () => {
    const writeBlock = PERM.slice(PERM.indexOf('const WRITE_TOOLS'), PERM.indexOf('const UNCONTROLLABLE_PREFIXES'));
    expect(writeBlock, '★★ 未列进写工具黑名单').toMatch(/api_conversation_setup/);
  });
});

describe('② 三条校验：都得"明确报错"，不能静默吞', () => {
  it('★★ 智能体必须校验存在性（悬空 id 会让工具/子智能体/技能全线静默降级）', () => {
    const body = caseBody('api_conversation_setup');
    expect(body, '★★ 未校验 agent 行存在').toMatch(/FROM agent WHERE id = \?/);
    expect(body, '★★ 不存在时未报错（设了悬空 id 会静默降级为空挂载）').toMatch(/不存在或不可用/);
  });

  it('★★ 工作流型智能体要拦下并给出正确用法（它没有对话人格与工具）', () => {
    const body = caseBody('api_conversation_setup');
    expect(body, '★★ 未拦工作流型智能体（ReAct 里会退化成"零工具空谈"且不报错）')
      .toMatch(/row\.type === 'workflow'/);
    expect(body, '★ 未说明正确用法').toMatch(/wf_\$\{row\.id\}|call_agent 委派/);
  });

  it('★★ 技能必须校验存在性 + enabled', () => {
    const body = caseBody('api_conversation_setup');
    expect(body, '★★ 未校验技能存在').toMatch(/FROM skill WHERE id = \? AND enabled = 1/);
    expect(body, '★★ 悬空技能未报错（不注入且不报错）').toMatch(/技能不存在或已禁用/);
    expect(body, '★ 未提示可用清单入口').toMatch(/api_skill_list/);
  });

  it('★★ mode 必须校验白名单（非法值会让会话在哪个模式列表都看不到）', () => {
    const body = caseBody('api_conversation_setup');
    // 2026-10-08 同步：白名单已含 clip（剪辑模式，第六模式，见 license.ts EDITION_MODES）
    expect(body, '★★ 未定义合法模式').toMatch(/\['office', 'dev', 'ops', 'sec', 'wf', 'clip'\]/);
    expect(body, '★★ 非法 mode 未报错').toMatch(/未知的工作模式/);
  });

  it('★★ 一项都没落地必须返回失败（不能 applied:{} + isError:false）', () => {
    // 实测踩到：只传工作流型智能体时返回 applied:{} + rejected:[…] + isError:false，
    // 模型很可能当成"设置成功"继续跑 —— 换身份失败却以为换成功了。
    const body = caseBody('api_conversation_setup');
    expect(body, '★★ 全被拒时未返回 fail').toMatch(/if \(!Object\.keys\(applied\)\.length && denied\.length\)[\s\S]{0,200}return fail\(denied\.join/);
  });

  it('★ 缺省作用于当前会话（模型不该去设别人的会话）', () => {
    const body = caseBody('api_conversation_setup');
    expect(body, '★ 未回落当前会话').toMatch(/str\(args, 'conversationId'\) \|\| conversationId/);
  });
});

describe('③ 会话身份必须注入（否则模型换完身份自己不知道）', () => {
  it('★★ 提示词要注入"当前智能体/技能/模式"', () => {
    expect(LTM, '★★ 未注入会话身份（模型答不出"你现在是谁"，换完身份下一轮仍按旧的说）')
      .toMatch(/当前会话身份/);
    expect(LTM, '★ 未注入智能体名').toMatch(/当前智能体：/);
    expect(LTM, '★ 未注入会话级技能').toMatch(/本会话额外挂载的技能/);
    expect(LTM, '★ 未注入工作模式').toMatch(/工作模式：/);
  });

  it('★ 注入要提示模型"改身份用 api_conversation_setup"', () => {
    expect(LTM, '★ 未告诉模型怎么改身份').toMatch(/api_conversation_setup/);
  });
});