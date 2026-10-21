/**
 * 运维对话「思考 / 工具 / 回复」三段式呈现 —— 守门测试（2026-10-21）。
 *
 * 用户实报（贴 WorkBuddy 截图）：「参考人家交互样式？思考内容，工具内容，响应内容的展示」。
 *
 * 此前的形态：消息**按条平铺**（assistant 的过渡句和最终答复混在一起，多次工具后出现好几段
 * 互不相干的话），步骤卡整体堆在列表**底部**，思考内容**根本没渲染**。
 * 用户无法回答"这句指令对应的思考/工具/结论分别在哪"。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpsRounds, type OpsMsg } from './opsSession';

const CONSOLE = readFileSync(resolve(__dirname, 'OpsConsole.vue'), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const CODE = strip(CONSOLE);

const t = 1_700_000_000_000;
function msg(p: Partial<OpsMsg> & { id: string; role: string }): OpsMsg {
  return { content: '', createdAt: t, ...p } as OpsMsg;
}

describe('buildOpsRounds —— 按轮聚合', () => {
  const conversation: OpsMsg[] = [
    msg({ id: 'u1', role: 'user', content: '更新镜像' }),
    msg({ id: 'a1', role: 'assistant', content: '我先读一下目录。', reasoning: '需要先确认有哪些文件', toolCalls: [
      { id: 'c1', name: 'plugin_ops-shell__sftp_list', arguments: '{"path":"/x"}' },
      { id: 'c2', name: 'plugin_ops-shell__ssh_exec', arguments: '{"command":"ls"}' },
    ] }),
    msg({ id: 'r1', role: 'tool', toolCallId: 'c1', content: 'a.txt\nb.txt' }),
    msg({ id: 'r2', role: 'tool', toolCallId: 'c2', content: 'total 2' }),
    msg({ id: 'a2', role: 'assistant', content: '已确认：需要改 3.12 → 3.13。', reasoning: '对比两个文件后确定是本 patch' }),
  ];

  it('一轮 = 一条用户消息 + 该轮思考 / 工具 / 最终回复', () => {
    const rounds = buildOpsRounds(conversation);
    expect(rounds).toHaveLength(1);
    const r = rounds[0];
    expect(r.user?.content).toBe('更新镜像');
    expect(r.steps.map((s) => s.callId)).toEqual(['c1', 'c2']);
    expect(r.steps.map((s) => s.index)).toEqual([1, 2]);
    expect(r.answer).toBe('已确认：需要改 3.12 → 3.13。');
  });

  it('思考内容按顺序拼接（多步推理不丢）', () => {
    const r = buildOpsRounds(conversation)[0];
    expect(r.reasoning).toContain('需要先确认有哪些文件');
    expect(r.reasoning).toContain('对比两个文件后确定是本 patch');
  });

  it('过渡叙述并入思考区，不出现在正文（避免"答非所问"的多段话）', () => {
    const r = buildOpsRounds(conversation)[0];
    expect(r.answer).not.toContain('我先读一下目录');
    expect(r.reasoning).toContain('我先读一下目录');
  });

  it('多轮各自独立，不把上轮工具带进本轮', () => {
    const two = [
      ...conversation,
      msg({ id: 'u2', role: 'user', content: '那重启一下', createdAt: t + 1000 }),
      msg({ id: 'a3', role: 'assistant', content: '已重启。', createdAt: t + 2000 }),
    ];
    const rounds = buildOpsRounds(two);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].steps).toHaveLength(2);
    expect(rounds[1].steps).toHaveLength(0);
    expect(rounds[1].answer).toBe('已重启。');
  });

  it('流式中的轮标记 streaming，供 UI 显示「执行中」', () => {
    const live = [
      msg({ id: 'u1', role: 'user', content: 'hi' }),
      msg({ id: 'a1', role: 'assistant', content: '正在', streaming: true }),
    ];
    expect(buildOpsRounds(live)[0].streaming).toBe(true);
  });

  it('只有工具没有正文的轮也能成轮（answer 为空，不误判成空轮）', () => {
    const onlyTools = [
      msg({ id: 'u1', role: 'user', content: '看看' }),
      msg({ id: 'a1', role: 'assistant', toolCalls: [{ id: 'c1', name: 'ssh_exec', arguments: '{}' }] }),
      msg({ id: 'r1', role: 'tool', toolCallId: 'c1', content: 'ok' }),
    ];
    const rounds = buildOpsRounds(onlyTools);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].steps).toHaveLength(1);
    expect(rounds[0].answer).toBe('');
  });

  it('流式期的过渡叙述单独留一份（liveNarration），供回答区兜底显示', () => {
    const live = [
      msg({ id: 'u1', role: 'user', content: 'hi' }),
      msg({ id: 'a1', role: 'assistant', content: '我先看看目录', streaming: true,
        toolCalls: [{ id: 'c1', name: 'ssh_exec' }] }),
    ];
    const r = buildOpsRounds(live)[0];
    expect(r.answer, '★ 过渡叙述不能当最终答复').toBe('');
    expect(r.liveNarration).toBe('我先看看目录');
    expect(r.reasoning).toContain('我先看看目录');
  });

  it('最终答复到达后 liveNarration 清空（正文只留结论）', () => {
    const r = buildOpsRounds(conversation)[0];
    expect(r.liveNarration).toBe('');
  });

  it('工具失败状态沿用同一套判定（与 buildSteps 不漂移）', () => {
    const failed = [
      msg({ id: 'u1', role: 'user', content: 'x' }),
      msg({ id: 'a1', role: 'assistant', toolCalls: [{ id: 'c1', name: 'ssh_exec' }] }),
      msg({ id: 'r1', role: 'tool', toolCallId: 'c1', content: '执行失败：权限不足' }),
    ];
    expect(buildOpsRounds(failed)[0].steps[0].status).toBe('failed');
  });
});

describe('思考接收链路（此前完全没接）', () => {
  it('SSE chunk 的 reasoning 增量要写进消息', () => {
    expect(CODE, '★ chunk 只接 content 不接 reasoning → 运维模式永远看不到思考')
      .toMatch(/if \(event\.reasoning\) list\[i\]\.reasoning = \(list\[i\]\.reasoning \|\| ''\) \+ event\.reasoning/);
  });

  it('历史消息读取 reasoning_content（后端一直有落库）', () => {
    expect(CODE).toMatch(/reasoning: m\.reasoning_content \|\| undefined/);
  });
});

describe('三段式 UI 结构', () => {
  it('按轮渲染（roundsOf），不是按条平铺', () => {
    expect(CODE).toMatch(/v-for="\(rd, ri\) in roundsOf\(w\)"/);
    expect(CODE).not.toMatch(/v-for="m in w\.chatMessages"/);
  });

  it('思考用主对话同一个 DeepThinkBadge（默认收起）', () => {
    expect(CODE).toContain("import DeepThinkBadge from '../../components/chat/DeepThinkBadge.vue'");
    expect(CODE).toMatch(/<DeepThinkBadge[\s\S]{0,260}:state="rd\.streaming/);
    expect(CODE).toMatch(/v-if="expandedReasoning\[/);
  });

  it('工具默认收成一行摘要，点开才是步骤明细', () => {
    expect(CODE).toContain('ops-tool-summary');
    expect(CODE).toMatch(/v-if="stepsOpen\[/);
    expect(CODE).toMatch(/<OpsStepCards :steps="rd\.steps" \/>/);
    // 旧形态：步骤卡无条件挂在列表末尾（已删）
    expect(CODE).not.toMatch(/<OpsStepCards :steps="stepsOf\(w\)" \/>/);
  });

  it('摘要文案按语义归类（检索/读取/修改/其它），不堆工具名', () => {
    const fn = CODE.slice(CODE.indexOf('function roundToolSummary'), CODE.indexOf('function roundToolSummary') + 900);
    expect(fn).toMatch(/检索/);
    expect(fn).toMatch(/读取文件/);
    expect(fn).toMatch(/执行中 · /);
  });

  it('回复区仍在，且流式期用过渡叙述兜底（不留空白回答区）', () => {
    expect(CODE).toMatch(/v-if="roundAnswerText\(rd\)" class="ops-msg-content ops-md"/);
    const fn = CODE.slice(CODE.indexOf('function roundAnswerText'), CODE.indexOf('function roundAnswerText') + 260);
    expect(fn, '★ 最终答复优先').toMatch(/if \(rd\.answer\) return rd\.answer/);
    expect(fn, '★ 流式中没有答复时用过渡叙述顶上').toMatch(/rd\.streaming \? rd\.liveNarration/);
  });
});
