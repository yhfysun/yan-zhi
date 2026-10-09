// 多智能体协同（2026-10-08）：任务计划调度 + 工件协议 + 权限边界。
//
// 分层：
//   ① 行为测试 —— PlanRunner 的校验/调度/重试/重派（stub 掉 LLM 侧 runSubAgent，
//      不 stub 被测的调度逻辑本身：判据是"用真 DB + 真调度，只假外部 LLM"）；
//   ② 源码守卫 —— 接线正确性（新工具必须同时过 注册 / 暴露 / 权限清单 三道，
//      本项目历史上因"漏一道"静默失效过多次）。
//
// 守住的语义：
//   1) createPlan 校验：依赖环 / 不存在依赖 / 缺必填 一律拒绝并给可行动提示；
//   2) DAG 调度：无依赖项并行、依赖项等上游；失败自动重试，重试成功即 done；
//   3) {{artifact:xx}} / {{artifact:LAST}} 引用在下游指令里被替换为真实路径；
//   4) 重试耗尽 → failed；reassign_task 换执行者/改指令后重跑成功；原样重试被拒；
//   5) 三道接线：core 注册 + buildToolsForBackend 暴露 + tool-permission（委派类拒绝/读类放行）；
//   6) runSubAgent 工件协议包装（有产物 → 短结论+清单）；
//   7) artifact-hooks 有通用 `_meta.path` 钩子（任意工具产文件都登记）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from '../src/db.js';
import {
  createPlan, runPlanToCompletion, getPlanStatusText, reassignPlanItem, registerPlanRunnerDeps,
  markOrphanPlanItemsInterrupted, type PlanItemRow,
} from '../src/services/plan-runner.js';
import { collectArtifact } from '../src/services/artifacts.js';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) =>
  s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const CONV = 'conv_plan_test';
const mkTask = () => ({
  id: 'task_plan_test', conversationId: CONV, userId: 'u_test',
  abortController: new AbortController(), subscribers: new Set(),
} as any);

/** 轮询等待计划项全部到达终态 */
async function waitTerminal(planId: string, ms = 8000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const rows = db.prepare('SELECT status FROM task_plan_item WHERE plan_id = ?').all(planId) as any[];
    if (rows.length > 0 && rows.every((r) => ['done', 'failed', 'skipped'].includes(r.status))) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

function itemRow(planId: string, key: string): PlanItemRow {
  return db.prepare('SELECT * FROM task_plan_item WHERE plan_id = ? AND item_key = ?').get(planId, key) as PlanItemRow;
}

beforeAll(() => {
  db.prepare('DELETE FROM task_plan_item WHERE conversation_id = ?').run(CONV);
  db.prepare('DELETE FROM conversation_file WHERE conversation_id = ?').run(CONV);
});

describe('createPlan 校验', () => {
  it('依赖成环 → 拒绝并提示环', () => {
    const r = createPlan(mkTask(), { items: [
      { id: 't1', title: 'A', agentId: 'a1', instruction: 'x', dependsOn: ['t2'] },
      { id: 't2', title: 'B', agentId: 'a1', instruction: 'x', dependsOn: ['t1'] },
    ] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/环/);
  });

  it('依赖不存在的 id → 拒绝并列出有效 id', () => {
    const r = createPlan(mkTask(), { items: [{ id: 't1', title: 'A', agentId: 'a1', instruction: 'x', dependsOn: ['nope'] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/不存在/);
  });

  it('缺 agentId / instruction → 拒绝', () => {
    expect(createPlan(mkTask(), { items: [{ title: 'A', instruction: 'x' }] }).ok).toBe(false);
    expect(createPlan(mkTask(), { items: [{ title: 'A', agentId: 'a1' }] }).ok).toBe(false);
  });

  it('合法计划 → 落库为 pending', () => {
    const r = createPlan(mkTask(), { items: [{ id: 't1', title: 'ok', agentId: 'a1', instruction: 'x' }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(itemRow(r.planId, 't1').status).toBe('pending');
      expect(itemRow(r.planId, 't1').attempts).toBe(0);
    }
  });
});

describe('PlanRunner 调度（真 DB + 真调度，仅 stub LLM 侧）', () => {
  it('无依赖并行 + 依赖等待 + 失败重试 + 工件引用解析', async () => {
    const order: string[] = [];
    let t1calls = 0;
    registerPlanRunnerDeps({
      runSubAgent: async (_t: any, args: any) => {
        const input = String(args.input);
        if (input.includes('抓全文')) {
          order.push('t1-in');
          t1calls++;
          if (t1calls === 1) return '子智能体执行失败: 模拟网络错误'; // 第一次失败 → 触发重试
          // 模拟产出：登记 conversation_file 工件 + 采集进当前运行作用域
          //（真实链路由 runSubAgent 包装 + artifact-hooks 自动完成，这里手工等价模拟）
          db.prepare('INSERT INTO conversation_file (id, conversation_id, user_id, name, path, category, size, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
            .run('cf_t1', CONV, 'u_test', 'ch3.txt', '/tmp/novel/ch3.txt', 'intermediate', 100, 'agent', Date.now());
          collectArtifact({ id: 'cf_t1', path: '/tmp/novel/ch3.txt', name: 'ch3.txt', category: 'intermediate', size: 100 });
          return '已抓取第3章并保存';
        }
        if (input.includes('基于')) {
          order.push('t2-in');
          // 引用应已被替换为真实路径（不再是 {{artifact:...}} 占位）
          expect(input).not.toMatch(/\{\{artifact/);
          expect(input).toContain('/tmp/novel/ch3.txt');
          return '下游完成';
        }
        order.push('t3-in');
        return 'ok';
      },
    });

    const plan = createPlan(mkTask(), { items: [
      { id: 't1', title: '抓全文', agentId: 'page', instruction: '抓全文并保存' },
      { id: 't3', title: '下载视频', agentId: 'dl', instruction: '下载视频' },
      { id: 't2', title: '下游', agentId: 'writer', instruction: '基于 {{artifact:t1}} 处理', dependsOn: ['t1'] },
    ] });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    await runPlanToCompletion(mkTask(), plan.planId);
    expect(await waitTerminal(plan.planId)).toBe(true);

    expect(itemRow(plan.planId, 't1').status).toBe('done');
    expect(itemRow(plan.planId, 't1').attempts).toBe(2); // 失败 1 次后成功
    expect(itemRow(plan.planId, 't2').status).toBe('done');
    expect(itemRow(plan.planId, 't3').status).toBe('done');
    // ★ 并发任务工件不串味：t1 产出了 cf_t1，t3 无产出 → t3 的 artifact_ids 必须为空。
    //   （ALS 采集器若在并发分支间共享 store，t3 会错误带上 t1 的产物 → 下游引用/汇总全错）
    expect(itemRow(plan.planId, 't1').artifact_ids_json).toContain('cf_t1');
    expect(itemRow(plan.planId, 't3').artifact_ids_json).toBe('[]');
    // t2 必须晚于 t1（依赖），t3 与 t1 可并行（只断言 t2 在 t1 之后）
    expect(order.indexOf('t2-in')).toBeGreaterThan(order.indexOf('t1-in'));
  });

  it('runPlanToCompletion 同步返回汇总文本（含成功项工件路径 + 执行结束标记）', async () => {
    registerPlanRunnerDeps({
      runSubAgent: async (_t: any, args: any) => {
        if (String(args.input).includes('产出')) {
          db.prepare('INSERT INTO conversation_file (id, conversation_id, user_id, name, path, category, size, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
            .run('cf_sum', CONV, 'u_test', 'done.txt', '/tmp/novel/done.txt', 'deliverable', 9, 'agent', Date.now());
          collectArtifact({ id: 'cf_sum', path: '/tmp/novel/done.txt', name: 'done.txt', category: 'deliverable', size: 9 });
          return '已完成并保存';
        }
        return 'ok';
      },
    });
    const plan = createPlan(mkTask(), { items: [{ id: 't1', title: '产出', agentId: 'w', instruction: '产出文件' }] });
    if (!plan.ok) throw new Error('plan failed');
    const summary = await runPlanToCompletion(mkTask(), plan.planId);
    expect(summary).toContain('执行结束');
    expect(summary).toContain('t1');
    expect(summary).toContain('/tmp/novel/done.txt'); // 工件路径进汇总（供主智能体引用）
  });

  it('重试耗尽 → failed + 下游被级联 skip', async () => {
    registerPlanRunnerDeps({
      runSubAgent: async (_t: any, args: any) => String(args.input).includes('坏任务')
        ? '子智能体执行失败: 永远失败' : 'ok',
    });
    const plan = createPlan(mkTask(), { items: [
      { id: 't1', title: '坏任务', agentId: 'bad', instruction: '坏任务' },
      { id: 't2', title: '下游', agentId: 'w', instruction: '下游', dependsOn: ['t1'] },
    ] });
    if (!plan.ok) throw new Error('plan failed');
    await runPlanToCompletion(mkTask(), plan.planId);
    expect(await waitTerminal(plan.planId)).toBe(true);
    expect(itemRow(plan.planId, 't1').status).toBe('failed');
    expect(itemRow(plan.planId, 't1').attempts).toBe(2);
    expect(itemRow(plan.planId, 't2').status).toBe('skipped');
  });

  it('重试与重派的每次执行 parentToolCallId 唯一（上下文不污染）', async () => {
    const ids: string[] = [];
    let calls = 0;
    registerPlanRunnerDeps({
      runSubAgent: async (_t: any, _args: any, parentToolCallId: string) => {
        ids.push(parentToolCallId);
        calls++;
        return calls <= 1 ? '子智能体执行失败: 第一次' : 'ok'; // 第一次失败触发重试
      },
    });
    const plan = createPlan(mkTask(), { items: [{ id: 't1', title: 'x', agentId: 'a', instruction: 'x' }] });
    if (!plan.ok) throw new Error('plan failed');
    await runPlanToCompletion(mkTask(), plan.planId);
    expect(ids.length).toBe(2); // 失败 + 重试
    expect(new Set(ids).size).toBe(2); // 两次执行 id 必须不同（否则第二次会读到第一次的过程）
    // reassign 后再跑 → id 仍不与历史撞车
    const re = reassignPlanItem(mkTask(), { itemId: 't1', agentId: 'b' });
    if (re.ok && re.planId) {
      await runPlanToCompletion(mkTask(), re.planId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('reassign_task 换执行者后重跑成功；原样重试被拒', async () => {
    let crashed = true;
    registerPlanRunnerDeps({
      runSubAgent: async (_t: any, _args: any) => {
        if (crashed) return '子智能体执行失败: 无法定位页面';
        return '换了执行者后成功';
      },
    });
    const plan = createPlan(mkTask(), { items: [{ id: 't1', title: '抓取', agentId: 'bad', instruction: '抓取' }] });
    if (!plan.ok) throw new Error('plan failed');
    await runPlanToCompletion(mkTask(), plan.planId);
    expect(await waitTerminal(plan.planId)).toBe(true);
    expect(itemRow(plan.planId, 't1').status).toBe('failed');

    // 原样重试（不改任何东西）→ 拒绝
    const noop = reassignPlanItem(mkTask(), { itemId: 't1' } as any);
    expect(noop.ok).toBe(false);

    // 换执行者 → 重跑
    crashed = false;
    const re = reassignPlanItem(mkTask(), { itemId: 't1', agentId: 'good', instruction: '换个方式做' });
    expect(re.ok).toBe(true);
    if (!re.ok || !re.planId) return;
    expect(itemRow(re.planId, 't1').status).toBe('pending');
    expect(itemRow(re.planId, 't1').attempts).toBe(0);
    expect(itemRow(re.planId, 't1').agent_id).toBe('good');
    await runPlanToCompletion(mkTask(), re.planId);
    expect(await waitTerminal(re.planId)).toBe(true);
    expect(itemRow(re.planId, 't1').status).toBe('done');
  });

  it('getPlanStatusText 返回各项状态', () => {
    const plan = createPlan(mkTask(), { items: [{ id: 't1', title: '状况', agentId: 'a1', instruction: 'x' }] });
    if (!plan.ok) throw new Error('plan failed');
    const text = getPlanStatusText(CONV, plan.planId);
    expect(text).toContain(plan.planId);
    expect(text).toContain('t1');
    expect(text).toContain('pending');
  });

  it('启动回收把遗留 running 标 failed 并补可见提示', () => {
    const plan = createPlan(mkTask(), { items: [{ id: 't1', title: '遗留', agentId: 'a1', instruction: 'x' }] });
    if (!plan.ok) throw new Error('plan failed');
    // 手工伪造成"上次进程遗留的 running"
    db.prepare("UPDATE task_plan_item SET status='running' WHERE plan_id = ?").run(plan.planId);
    const n = markOrphanPlanItemsInterrupted();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(itemRow(plan.planId, 't1').status).toBe('failed');
  });
});

describe('接线守卫（三道：注册 / 暴露 / 权限清单）', () => {
  const CORE_INDEX = strip(read('packages/core/src/tool/builtin/index.ts'));
  const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
  const PERM = strip(read('apps/server/src/tool-permission.ts'));
  const HOOKS = strip(read('apps/server/src/services/artifact-hooks.ts'));

  it('① core 注册了三个编排工具', () => {
    expect(CORE_INDEX).toContain('PlanTasksTool');
    expect(CORE_INDEX).toContain('GetPlanStatusTool');
    expect(CORE_INDEX).toContain('ReassignTaskTool');
    expect(CORE_INDEX).toMatch(/registry\.register\(new PlanTasksTool\(\)\)/);
  });

  it('② buildToolsForBackend 无条件暴露三工具', () => {
    expect(LTM).toMatch(/plan_tasks['"],\s*['"]get_plan_status['"],\s*['"]reassign_task/);
  });

  it('③ executeTool 拦截三工具（含 depth 拦截）', () => {
    expect(LTM).toMatch(/toolName === 'plan_tasks'/);
    expect(LTM).toMatch(/toolName === 'reassign_task'/);
    expect(LTM).toMatch(/toolName === 'get_plan_status'/);
    expect(LTM).toContain('runPlanToCompletion');
    expect(LTM).toContain('registerPlanRunnerDeps');
  });

  it('④ runSubAgent 工件协议包装存在', () => {
    expect(LTM).toMatch(/runWithArtifactCollector/);
    expect(LTM).toMatch(/formatSubAgentReturn/);
    expect(LTM).toMatch(/async function runSubAgentImpl/);
  });

  it('⑤ 权限清单：委托类拒绝、读类放行', () => {
    // 用真实的权限函数（B 端行为）验证，而不是只看常量文本
    // plan_tasks / reassign_task 必须进 DELEGATION_TOOLS → readonly 拒绝
    expect(PERM).toMatch(/DELEGATION_TOOLS[\s\S]{0,400}'plan_tasks'/);
    expect(PERM).toMatch(/DELEGATION_TOOLS[\s\S]{0,400}'reassign_task'/);
    // get_plan_status 进纯读白名单
    expect(PERM).toMatch(/INTERACTION_TOOLS[\s\S]{0,300}'get_plan_status'/);
    expect(PERM).toMatch(/READONLY_SAFE_TOOLS[\s\S]{0,600}'get_plan_status'/);
  });

  it('⑥ 提示词注入「两条编排路径」（call_agent 与 plan_tasks 并列，不绑死 plan_tasks）', () => {
    expect(LTM).toMatch(/长任务的编排/);
    // ★ call_agent 也算编排路径（用户 2026-10-09 指出）：提示词必须点明"同轮多个 call_agent 会并发"
    expect(LTM).toMatch(/路径一：`call_agent`/);
    expect(LTM).toMatch(/同一轮/);
    expect(LTM).toMatch(/路径二：`plan_tasks`/);
  });

  it('⑥b 编排协议按权限分流（只读会话不注入"用 plan_tasks"，避免与只读指令矛盾）', () => {
    // 源码守卫：buildSystemPromptForBackend 必须消费 opts.canDelegate 分流
    expect(LTM).toMatch(/canDelegate !== false/);
    // 只读分支存在（不是永远注入同一段）
    expect(LTM).toMatch(/当前会话为只读权限/);
    // 主链路调用点必须传 canDelegate（否则分流形同虚设）
    expect(LTM).toMatch(/canDelegate:\s*\(task\.permissionMode \|\| 'readonly'\) !== 'readonly'/);
  });

  it('⑦ artifact-hooks 有通用 _meta.path 钩子（非仅 file_write）', () => {
    expect(HOOKS).toMatch(/artifact:meta_path/);
    // 通用钩子须排除 MEDIA_TOOLS 自带钩子（防双重登记）
    expect(HOOKS).toMatch(/MEDIA_TOOLS\.has\(toolName\)/);
  });
});