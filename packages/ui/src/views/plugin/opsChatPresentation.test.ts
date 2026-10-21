/**
 * 运维控制台对话区展示口径守门（2026-10-21 用户实报三连）：
 *   1. 「我就发了一句话还自动拼接」—— 现场上下文**不该进用户消息**（前端不拼、后端注入）
 *   2. 「最后面还有工具调用详情」—— 历史各轮步骤全量堆在列表尾部
 *   3. 代码块复制按钮压在正文标题中间（样式问题，此处守 html 契约）
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRoundSteps, buildSteps, type OpsMsg } from './opsSession';

const CONSOLE_SRC = readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8');
const STEP_CARDS_SRC = readFileSync(
  resolve(__dirname, '../../components/ops/OpsStepCards.vue'), 'utf8',
);
/** 模板部分（注释里提到 `{{ m.content }}` 之类旧写法不算实现） */
const CODE_USER = CONSOLE_SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

const t = 1_700_000_000_000;
function msg(p: Partial<OpsMsg> & { id: string; role: string }): OpsMsg {
  return { content: '', createdAt: t, ...p } as OpsMsg;
}

describe('buildRoundSteps —— 只取最后一轮', () => {
  const round1: OpsMsg[] = [
    msg({ id: 'u1', role: 'user', content: '看下磁盘' }),
    msg({ id: 'a1', role: 'assistant', toolCalls: [{ id: 'c1', name: 'plugin_ops-shell__ssh_exec' }] }),
    msg({ id: 'r1', role: 'tool', toolCallId: 'c1', content: '/usr/bin/docker' }),
    msg({ id: 'a1b', role: 'assistant', content: '磁盘占用 80%' }),
  ];
  const round2: OpsMsg[] = [
    msg({ id: 'u2', role: 'user', content: '再看内存' }),
    msg({ id: 'a2', role: 'assistant', toolCalls: [
      { id: 'c2', name: 'plugin_ops-shell__ssh_exec' },
      { id: 'c3', name: 'plugin_ops-shell__docker_ps' },
    ] }),
    msg({ id: 'r2', role: 'tool', toolCallId: 'c2', content: 'free -m 输出' }),
    msg({ id: 'r3', role: 'tool', toolCallId: 'c3', content: '容器列表' }),
  ];

  it('历史轮的步骤不再进入当前轮（原实现全量累加到列表尾部）', () => {
    const all = buildSteps([...round1, ...round2]);
    expect(all.map((s) => s.callId)).toEqual(['c1', 'c2', 'c3']);

    const round = buildRoundSteps([...round1, ...round2]);
    expect(round.map((s) => s.callId)).toEqual(['c2', 'c3']);
    expect(round.map((s) => s.index)).toEqual([1, 2]);
  });

  it('只有一轮时与 buildSteps 等价', () => {
    expect(buildRoundSteps(round1).map((s) => s.callId)).toEqual(['c1']);
  });

  it('一条 user 消息都没有时退化为全量（恢复中的会话）', () => {
    const onlyAssistant: OpsMsg[] = [
      msg({ id: 'a', role: 'assistant', toolCalls: [{ id: 'cx', name: 'ssh_exec' }] }),
    ];
    expect(buildRoundSteps(onlyAssistant).map((s) => s.callId)).toEqual(['cx']);
  });

  it('最后一条 user 之后没有任何工具调用 → 空数组（不残留上一轮）', () => {
    const arr = [...round1, msg({ id: 'u3', role: 'user', content: '你好' })];
    expect(buildRoundSteps(arr)).toEqual([]);
  });
});

describe('用户消息只含用户原话（现场上下文不拼进 userContent）', () => {
  it('提交任务时 userContent 是原话，现场走结构化 opsContext', () => {
    // 两处提交（对话 / 后台）都必须是 userContent: content + opsContext: opsContextOf(w)
    const hits = CONSOLE_SRC.match(/userContent: content,\s*\n\s*agentId: OPS_AGENT_ID,\s*\n\s*opsContext: opsContextOf\(w\),/g) || [];
    expect(hits.length).toBe(2);
  });

  it('前端不再拼接现场字符串（三个 hint 函数已删除）', () => {
    expect(CONSOLE_SRC).not.toMatch(/function winConnHint/);
    expect(CONSOLE_SRC).not.toMatch(/function terminalContextHint/);
    expect(CONSOLE_SRC).not.toMatch(/function releaseProjectHint/);
    // 不再需要「显示时用正则剥离」的补丁
    expect(CONSOLE_SRC).not.toMatch(/OPS_HINT_RES/);
    expect(CONSOLE_SRC).not.toMatch(/visibleUserText/);
  });

  it('opsContextOf 只下发薄描述（id + 终端尾部），不带连接名/host', () => {
    const fn = CONSOLE_SRC.slice(
      CONSOLE_SRC.indexOf('function opsContextOf'),
      CONSOLE_SRC.indexOf('function opsContextOf') + 800,
    );
    expect(fn).toMatch(/connectionId: w\.connectionId/);
    expect(fn).toMatch(/releaseProjectId: w\.releaseProject\?\.id/);
    expect(fn).toMatch(/terminalTail/);
    // 连接详情由服务端回查，前端不得在此拼
    expect(fn).not.toMatch(/\.host|\.username|\.port/);
  });

  it('用户气泡直接渲染用户消息原文（没有剥离层）', () => {
    // 按轮渲染后取的是 rd.user.content（同一份入库原文），不是剥离/清洗后的文本
    const hits = CODE_USER.match(/\{\{ rd\.user\.content \}\}/g) || [];
    expect(hits.length).toBe(2); // AI 模式 + 命令模式折叠条
    expect(CODE_USER).not.toMatch(/\{\{ m\.content \}\}/);
  });
});

describe('代码块复制按钮不参与正文流', () => {
  it('pre 有定位上下文，按钮与语言标签绝对定位', () => {
    const preBlock = CONSOLE_SRC.slice(
      CONSOLE_SRC.indexOf('.ops-md pre {'),
      CONSOLE_SRC.indexOf('.ops-md pre code'),
    );
    expect(preBlock).toMatch(/position:\s*relative/);
    expect(CONSOLE_SRC).toMatch(/\.ops-md pre :deep\(\.code-copy-btn\) \{[^}]*position:\s*absolute/);
    expect(CONSOLE_SRC).toMatch(/\.ops-md pre :deep\(\.code-lang\) \{[^}]*position:\s*absolute/);
  });
});

describe('步骤卡可读性', () => {
  it('工具名去插件前缀，并带参数摘要', () => {
    expect(STEP_CARDS_SRC).toMatch(/replace\(\/\^plugin_\[\\w-\]\+__\/, ''\)/);
    expect(STEP_CARDS_SRC).toMatch(/osc-summary/);
    expect(STEP_CARDS_SRC).toMatch(/function summarizeArgs/);
  });

  it('头部显示失败数与总耗时', () => {
    expect(STEP_CARDS_SRC).toMatch(/failedCount/);
    expect(STEP_CARDS_SRC).toMatch(/totalText/);
  });
});
