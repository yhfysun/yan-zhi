/**
 * human_confirm 节点 —— **真机集成测试**（真实引擎 + 临时库，跑一条真 DAG）。
 *
 * 为什么必须集成测试而不是纯静态断言：
 *   本节点的全部价值是「**流水线在确认点真的停住**，不确认就走不到下一个节点」。
 *   静态断言只能证明"写了 await"，证明不了"下游确实没执行"——
 *   而"模型一路跑完跳过确认"正是用户要防的事，也是这个节点存在的理由。
 *
 * 用真实 WorkflowEngine 跑：input → human_confirm → code(读确认输出) → output，
 * 断言：① 挂起且落库；② 挂起期间下游节点未执行；③ 提交后继续；④ 确认内容传到下游；
 *      ⑤ 完成后标记清除；⑥ 重复提交被拒。
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 独立沙箱库（不碰用户 data.db）
const box = vi.hoisted(() => {
  const fsMod = require('node:fs');
  const osMod = require('node:os');
  const pathMod = require('node:path');
  const dir = fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'yz-hc-'));
  return { dir };
});
process.env.DATA_DIR = box.dir;

const runner = () => import('../src/workflow-runner');

function makeBundle() {
  return {
    agent: {
      id: 'a_hc_it', name: 'HC 集成测试', type: 'workflow',
      workflow: {
        nodes: [
          { id: 'n_in', type: 'input', config: { schema: { topic: 'string' } }, position: { x: 0, y: 0 } },
          {
            id: 'n_confirm', type: 'human_confirm',
            config: {
              kind: 'ask',
              question: '可以开始制作吗？',
              pages: [{ question: '先做几个镜头？', allowText: true }],
              onReject: 'abort',
            },
            position: { x: 200, y: 0 },
          },
          {
            id: 'n_after', type: 'code',
            // 读确认节点的输出 —— 只有真的等到回答才会跑到这里
            config: { expression: "const r = ctx.get('n_confirm'); return { got: !!(r && r.confirmed), answer: (r && r.answer) || '' };" },
            position: { x: 400, y: 0 },
          },
          { id: 'n_out', type: 'output', config: { key: 'result' }, position: { x: 600, y: 0 } },
        ],
        edges: [
          { id: 'e1', source: 'n_in', target: 'n_confirm' },
          { id: 'e2', source: 'n_confirm', target: 'n_after' },
          { id: 'e3', source: 'n_after', target: 'n_out' },
        ],
      },
    },
    subAgents: {},
  };
}

/** 轮询等挂起（最多约 8s） */
async function waitPending(m: typeof import('../src/workflow-runner'), runId: string) {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const p = m.getPendingConfirm(runId);
    if (p) return p as any;
  }
  return null;
}

describe('human_confirm 真机：流水线必须在确认点停住', () => {
  beforeAll(async () => {
    const { db } = await import('../src/db');
    const ts = Date.now();
    db.prepare('INSERT OR IGNORE INTO agent (id, user_id, name, type, workflow_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .run('a_hc_it', 'guest', 'HC 集成测试', 'workflow', JSON.stringify({ nodes: [], edges: [] }), ts, ts);
    // 挂起状态落在 workflow_run 上，需要该列存在（迁移由 db.ts 负责）
  });

  it('★★ 挂起 → 下游未跑 → 提交后继续 → 内容传到下游 → 标记清除 → 重复提交被拒', async () => {
    const m = await runner();
    const runId = m.startWorkflowRun(makeBundle() as any, { topic: '测试' }, 'guest');
    expect(runId, '运行未启动').toBeTruthy();

    // ① 真的停下来等确认（且状态已落库 —— 刷新/重启后靠它恢复）
    const pending = await waitPending(m, runId);
    expect(pending, '★★ 流水线没有停下来等确认（确认形同虚设）').toBeTruthy();
    expect(pending.callId, '待确认缺 callId（前端无法提交）').toBeTruthy();
    expect(pending.nodeId, '未记录卡在哪个节点').toBe('n_confirm');

    // ② 挂起期间下游不能已经跑过 —— 这是「不确认走不到下一步」的核心判据。
    //    ★ 用 events（node:*）而不是 logs：logs 只记 __start__/__end__ 两个哨兵，
    //      节点级进度走 events（2026-09-27 实测踩到，误用 logs 导致断言永远 false）。
    const nodeOk = (st: any, id: string) => ((st?.events || []) as any[])
      .some((e) => e.type === 'node:ok' && e.nodeId === id);
    expect(nodeOk(m.getWorkflowRun(runId), 'n_after'),
      '★★ 未确认前下游节点已执行 —— 确认点没有拦住流水线').toBe(false);
    // 确认节点本身应该已经"开始执行"（node:start 应已发出，说明它在图上可见）
    expect(nodeOk(m.getWorkflowRun(runId), 'n_confirm'),
      '★ 确认节点尚未执行（应已挂起）').toBe(false); // 还在等，未 ok
    expect(((m.getWorkflowRun(runId)?.events || []) as any[])
      .some((e) => e.type === 'node:start' && e.nodeId === 'n_confirm'),
      '★ 确认节点未发 node:start（运行台上看不到这个节点）').toBe(true);

    // ③ 提交确认 → 继续
    expect(m.resolveHumanConfirm(runId, pending.callId, { rejected: false, text: '可以做，先做 3 个镜头' }),
      '提交确认未找到等待者').toBe(true);

    // ④ 等跑完
    const run = m.getWorkflowRun(runId);
    if (run) await Promise.race([run.finished, new Promise((r) => setTimeout(r, 8000))]);
    const st2 = m.getWorkflowRun(runId);
    expect(nodeOk(st2, 'n_after'), '★ 确认后下游节点未执行（流水线卡死了）').toBe(true);
    expect(st2?.status, '★ 运行未完成').toBe('completed');

    // ⑤ 确认内容传到下游（不能"确认了但下游不知道"）
    const got = (st2?.result as any)?.result?.got;
    expect(got, '★ 确认结果未传到下游节点').toBe(true);

    // ⑥ 完成后待确认标记必须清除（否则 UI 永远显示"等待确认"）
    expect(m.getPendingConfirm(runId), '★ 完成后 pendingConfirm 未清除').toBeNull();

    // ⑦ 重复提交必须被拒（否则会把流水线推两次）
    expect(m.resolveHumanConfirm(runId, pending.callId, { text: '再来一次' }),
      '★★ 重复提交被接受了 —— 会把流水线重复推进').toBe(false);
  }, 30000);

  it('★ 用户打回 + onReject=abort → 流水线中止（不继续烧算力）', async () => {
    const m = await runner();
    const runId = m.startWorkflowRun(makeBundle() as any, { topic: '打回测试' }, 'guest');
    const pending = await waitPending(m, runId);
    expect(pending).toBeTruthy();

    m.resolveHumanConfirm(runId, pending.callId, { rejected: true, text: '分镜不行' });
    const run = m.getWorkflowRun(runId);
    if (run) await Promise.race([run.finished, new Promise((r) => setTimeout(r, 8000))]);

    const st = m.getWorkflowRun(runId);
    const okOf = (id: string) => ((st?.events || []) as any[]).some((e) => e.type === 'node:ok' && e.nodeId === id);
    expect(okOf('n_after'), '★★ 用户打回后下游仍在执行（打回没生效）').toBe(false);
    expect(st?.status, '★ 打回后运行状态应为失败/中止').toMatch(/failed|aborted/);
  }, 30000);

  it('★ 取消运行要能释放等待者（否则节点永久卡住不结束）', async () => {
    const m = await runner();
    const runId = m.startWorkflowRun(makeBundle() as any, { topic: '取消测试' }, 'guest');
    const pending = await waitPending(m, runId);
    expect(pending).toBeTruthy();

    m.cancelWorkflowRun(runId);
    const run = m.getWorkflowRun(runId);
    if (run) await Promise.race([run.finished, new Promise((r) => setTimeout(r, 8000))]);
    // 关键：运行必须**结束**（等待者被 abort 释放），而不是永远 running
    const st = m.getWorkflowRun(runId);
    if (st) expect(st.status, '★★ 取消后仍停在 running（等待者未被释放）').not.toBe('running');
  }, 30000);
});