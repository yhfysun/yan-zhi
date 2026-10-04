// P2-6 后台并行子智能体：闸门与文案（行为测试）+ 主链路接线（源码守卫）。
//
// 纯逻辑在 services/background-subagents.ts（可行为测试）；主链路的"何时调用/接到哪"
// 用源码扫描钉住 —— 后台 ReAct 循环要真跑 LLM/DB，单测里没法执行，
// 但"分支接没接、收尾提没提示、投递走没走注入通道"是接线正确性的关键点。
//
// 守住的语义：
//   1) 并发闸：< 3 可启动，= 3 拒绝且不排队（文案引导等待或改同步）；
//   2) 启动回执明确"不要空转等待"；收尾提示列出在跑任务名；投递文案带统一前缀；
//   3) executeTool 的 call_agent 分支：async→startBackgroundSubAgent，缺省同步；
//   4) 投递：任务在跑走 injectUserMessage（唤醒下一轮），已收尾落库普通消息；
//   5) 工作任务型子智能体不套后台壳（防双重投递）；
//   6) 任务级 Map 初始化存在。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAX_BACKGROUND_SUBAGENTS, canStartBackgroundSubAgent, makeBackgroundId,
  buildBackgroundReceipt, buildConcurrencyFullMessage, buildFinishNote, buildDeliveryText,
  type BackgroundSubAgentInfo,
} from '../src/services/background-subagents.js';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) =>
  // ★ 顺序敏感：先剥行注释再剥块注释 —— 行注释里若出现「星号紧跟斜杠」（如 glob 写法
  //   `skills/` + `*.md`），朴素的块注释正则会把它当块注释起点，吞掉后面大段源码
  //   （本文件诞生当天就踩到：行注释里的该序列让 LTM 剥注释后少了 600+ 行，多个守卫假红）。
  s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const CORE_CALL_AGENT = strip(read('packages/core/src/tool/builtin/call-agent.ts'));

function mkInfo(name: string): BackgroundSubAgentInfo {
  return { bgId: makeBackgroundId(), agentId: 'a_x', agentName: name, toolCallId: 'tc_1', startedAt: Date.now() };
}

describe('后台子智能体闸门与文案', () => {
  it('并发闸：0/2 个在跑允许启动，达到上限拒绝', () => {
    expect(canStartBackgroundSubAgent(new Map())).toBe(true);
    const two = new Map([['a', mkInfo('A')], ['b', mkInfo('B')]]);
    expect(canStartBackgroundSubAgent(two)).toBe(true);
    const full = new Map(Array.from({ length: MAX_BACKGROUND_SUBAGENTS }, (_, i) => [`bg${i}`, mkInfo(`S${i}`)]));
    expect(canStartBackgroundSubAgent(full)).toBe(false);
  });

  it('并发满文案：列出在跑任务名，给"等待/改同步"两条出路（不排队）', () => {
    const full = new Map([['x', mkInfo('网页助手')]]);
    const msg = buildConcurrencyFullMessage(full);
    expect(msg).toContain('后台并发已满');
    expect(msg).toContain('网页助手');
    expect(msg).toContain('同步调用');
    expect(msg).not.toContain('排队');
  });

  it('启动回执：包含任务号与"不要空转"指令', () => {
    const msg = buildBackgroundReceipt('代码助手', 'bg_abc');
    expect(msg).toContain('代码助手');
    expect(msg).toContain('bg_abc');
    expect(msg).toContain('不要为等待它而空转');
  });

  it('收尾提示：数量 + 名字 + 会自动发回', () => {
    const m = new Map([['a', mkInfo('甲')], ['b', mkInfo('乙')]]);
    const note = buildFinishNote(m);
    expect(note).toContain('2 个');
    expect(note).toContain('甲');
    expect(note).toContain('乙');
    expect(note).toContain('自动发回');
  });

  it('投递文案带统一前缀（模型/用户能识别这是后台结果，不是新指令）', () => {
    expect(buildDeliveryText('甲', 'done')).toBe('【后台子智能体「甲」完成】\n\ndone');
  });

  it('任务号可读且同毫秒不撞号', () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeBackgroundId(1700000000000)));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.startsWith('bg_')).toBe(true);
  });
});

describe('主链路接线（源码守卫）', () => {
  it('executeTool 的 call_agent 分支：async: true → startBackgroundSubAgent，缺省同步', () => {
    const i = LTM.indexOf("if (toolName === 'call_agent')");
    expect(i).toBeGreaterThan(-1);
    const win = LTM.slice(i, i + 700);
    expect(win).toContain('startBackgroundSubAgent');
    expect(win).toContain('async');
    expect(win).toContain('runSubAgent(task, args, toolCallId, depth, uiTools)');
  });

  it('工作任务型不套后台壳（防 runWorkflowSubAgent 反写 + 后台投递双重投递）', () => {
    const i = LTM.indexOf('async function startBackgroundSubAgent');
    expect(i).toBeGreaterThan(-1);
    const win = LTM.slice(i, LTM.indexOf('async function runSubAgent', i));
    expect(win).toContain('isWorkflowAgent(agentRow)');
  });

  it('投递走注入通道：任务在跑 injectUserMessage（唤醒下一轮），否则落库普通消息', () => {
    const i = LTM.indexOf('async function deliverSubAgentResult');
    expect(i).toBeGreaterThan(-1);
    const win = LTM.slice(i, i + 1200);
    expect(win).toContain('injectUserMessage(');
    expect(win).toContain('insertMessage(');
    expect(win).toContain('aborted');
  });

  it('主循环收尾前有后台在跑提示（不等待、照常 finish）', () => {
    const i = LTM.indexOf('buildFinishNote(task.backgroundSubAgents)');
    expect(i).toBeGreaterThan(-1);
    // 提示必须出现在 task:completed 之前（收尾时给用户看的）
    const finish = LTM.indexOf("emit(task, { type: 'task:completed' })", i);
    expect(finish).toBeGreaterThan(i);
  });

  it('任务级 backgroundSubAgents Map 初始化存在', () => {
    expect(LTM).toMatch(/backgroundSubAgents:\s*new Map<string,\s*BackgroundSubAgentInfo>\(\)/);
    expect(LTM).toMatch(/backgroundSubAgents:\s*Map<string,\s*BackgroundSubAgentInfo>/);
  });

  it('call_agent schema 暴露 async 参数（否则模型不知道有这条通道）', () => {
    expect(CORE_CALL_AGENT).toContain('async:');
    expect(CORE_CALL_AGENT).toContain('后台并行执行');
  });
});