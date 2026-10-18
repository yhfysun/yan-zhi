/**
 * 长任务守门测试（2026-10-09 建；2026-10-18 随「预算闸退役」大修）。
 *
 * ★ 2026-10-18 决策（用户原话）：「不要程序自动停，这样效果不好，就费用提醒就好了」。
 *   原 P1-9 任务预算闸（token 总预算 + 墙钟，触达自动停）连同 wait-credit 抵扣一并退役：
 *   · 原 describe A（等待抵扣）—— 消费方没了，纯函数已删，测试随之删除；
 *   · 原 describe B（预算触达后接力 + 基线重置）—— 机制整体退役，改为钉「预算闸不得复活」
 *     （见 cost-ledger-wiring.test.ts 的静态守卫）。
 *
 * 本文件现在钉：
 *   C. 总墙钟失控闸存在（批次维度唯一上限之后的必要兜底，**保留**）；
 *   D. 文案口径：真因不得被"最大循环数"掩盖（现在是费用硬停 vs 最大循环数两分支）；
 *   E. `send()` 不得再 PATCH null 抹掉跨会话计划；用户显式清除仍必须落盘；
 *   F. 子进程静默（ffmpeg 不再弹黑框）。
 *
 * ★ 风格与 long-task-continuation.test.ts 一致：静态断言读源码（本机 vitest 环境受限）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const CHAT_STORE = strip(read('packages/ui/src/stores/chat.ts'));

function anchor(s: string, needle: string, what: string): number {
  const i = s.indexOf(needle);
  expect(i, `锚点不存在（后续断言会假红）：${what} → ${needle}`).toBeGreaterThan(-1);
  return i;
}

// ────────────────────────────────────────────────────────────
describe('C 总墙钟失控闸（批次维度唯一上限的必要兜底）', () => {
  it('★★ 必须存在独立于批次数的总时长硬顶', () => {
    expect(LTM, '★ 无总时长硬顶：停滞闸在"无计划"时失效 → 最坏 30 批 × 无限步数')
      .toMatch(/TASK_TOTAL_WALL_CLOCK_HARD_CAP_MS\s*=\s*\d+/);
  });

  it('★★ 总时长闸必须在接力分支内真实拦截', () => {
    const i = anchor(LTM, 'const totalElapsedMs', '总时长闸使用点');
    const body = LTM.slice(i, i + 400);
    expect(body, '★ 常量定义了却没用来拦截（形同虚设）')
      .toMatch(/totalElapsedMs\s*>=\s*TASK_TOTAL_WALL_CLOCK_HARD_CAP_MS/);
  });

  it('★ 总时长闸的口径必须含等待（"机器被占多久"，与任何抵扣口径无关）', () => {
    const i = anchor(LTM, 'const totalElapsedMs', '总时长口径');
    const body = LTM.slice(i, i + 200);
    expect(body, '★ 总时长闸误用抵扣口径（那就不是"机器被占多久"了）')
      .toMatch(/Date\.now\(\)\s*-\s*\(task\.createdAt/);
  });
});

// ────────────────────────────────────────────────────────────
describe('D 文案口径：真因不得被"最大循环数"掩盖', () => {
  it('★★ 模型总结覆盖 tipText 时必须按真实闸门措辞（费用硬停 ≠ 最大循环数）', () => {
    const i = anchor(LTM, 'summaryText = judged.summary;', '总结赋值点');
    const body = LTM.slice(i, i + 900);
    expect(body, '★ 总结仍无条件写成"单批最大循环步数"（掩盖费用硬停真因，用户去调步数是错方向）')
      .not.toMatch(/tipText\s*=\s*`\$\{summaryText\}\\n\\n（注：本次任务已达到单批最大循环步数/);
    expect(body, '★ 注脚未按费用硬停口径分支').toMatch(/costHardStop\s*\?/);
  });

  it('★ 费用硬停文案必须点明"这是你自己设的上限"（D4 语义：默认 0 = 用户永远看不到）', () => {
    const i = anchor(LTM, '已达到费用硬停上限', '费用硬停文案');
    const body = LTM.slice(i, i + 260);
    expect(body, '★ 硬停文案未给出继续路径（用户会被困死在硬停里）').toMatch(/费用预算/);
  });
});

// ────────────────────────────────────────────────────────────
describe('E 计划接力棒不得被 send() 抹掉（跨会话接力的命门）', () => {
  it('★★ send() 开跑新任务必须只清界面、不落盘 null', () => {
    // ★ 锚点用 send 里真正的那一行（`runningConvIds.value.add(convId);` 在别处也出现）
    const i = anchor(CHAT_STORE, 'clearPlanDisplayOnly(convId);', 'send 起跑点的计划清理');
    const body = CHAT_STORE.slice(Math.max(0, i - 500), i + 200);
    expect(body, '★ 仍用会落盘的 clearPlan（PATCH null → 服务端删 plan.md → 跨会话接力失效）')
      .not.toMatch(/^\s*clearPlan\(convId\);/m);
  });

  it('★★ 必须存在"只清展示"的函数，且它不落盘', () => {
    // ★ 切窗必须**停在函数结束**（切到下一个函数会把 persistPlan 的 api.patch 误判进来 → 假红）
    const i = anchor(CHAT_STORE, 'function clearPlanDisplayOnly', 'clearPlanDisplayOnly');
    const rest = CHAT_STORE.slice(i);
    const end = rest.indexOf('\n  }');
    const body = end > 0 ? rest.slice(0, end) : rest;
    expect(body, '★ 只清展示的函数竟然写了 api.patch（还是会把计划删掉）')
      .not.toMatch(/api\.patch/);
    expect(body, '★ 只清展示的函数未真正移除内存计划').toMatch(/removePlan\(plansByConv\.value/);
  });

  it('★★ 用户显式「清除计划」仍必须落盘 null（不能一刀切禁掉）', () => {
    // 同样停在函数结束（否则会切到 clearPlanDisplayOnly / persistPlan 造成假红/假绿）
    const i = anchor(CHAT_STORE, 'function clearPlan(convId?', 'clearPlan');
    const rest = CHAT_STORE.slice(i);
    const end = rest.indexOf('\n  }');
    const body = end > 0 ? rest.slice(0, end) : rest.slice(0, 700);
    expect(body, '★ 用户显式清除不落盘了 → 服务端 task_plan_json 永远清不掉')
      .toMatch(/api\.patch\(`\/conversations\/\$\{key\}`,\s*\{\s*taskPlan:\s*plan\s*\}\)/);
  });

  it('★ 两个函数都必须导出（TaskPlanCard 用 clearPlan，send 用 clearPlanDisplayOnly）', () => {
    const i = anchor(CHAT_STORE, 'planSteps, planTitle, clearPlan', 'store 导出段');
    const body = CHAT_STORE.slice(i, i + 200);
    expect(body, '★ clearPlan 未导出').toMatch(/clearPlan/);
    expect(body, '★ clearPlanDisplayOnly 未导出（send 调不到）').toMatch(/clearPlanDisplayOnly/);
  });
});

// ────────────────────────────────────────────────────────────
describe('F 子进程静默（ffmpeg 不再弹黑框）', () => {
  const SCRIPTS = 'packages/core/src/tool/builtin/python-scripts/novel_tuiwen';

  it('★★ 三个脚本都必须接入静默补丁', () => {
    for (const f of ['run_pipeline.py', 'tts_gen.py', 'compose_video.py']) {
      const src = read(`${SCRIPTS}/${f}`);
      expect(src, `★ ${f} 未接入 _winquiet → 该脚本起的 ffmpeg 仍会闪黑框`)
        .toMatch(/_winquiet\.apply_popen_defaults\(\)/);
    }
  });

  it('★★ 静默模块必须用 CREATE_NO_WINDOW（而不是只靠 windowsHide）', () => {
    const q = read(`${SCRIPTS}/_winquiet.py`);
    expect(q, '★ 缺 CREATE_NO_WINDOW 常量').toMatch(/CREATE_NO_WINDOW/);
    expect(q, '★ 未给 Popen 打默认补丁（逐个调用点手写必然漏）').toMatch(/subprocess\.Popen\.__init__\s*=/);
    expect(q, '★ 缺少 startuptinfo 双保险').toMatch(/STARTF_USESHOWWINDOW/);
    // 非 Windows 必须是空操作（不能被 Windows 常量炸掉）
    expect(q, '★ 未做平台判定').toMatch(/sys\.platform\s*==\s*'win32'/);
  });

  it('★★ 静默必须幂等（重复调用不叠补丁）', () => {
    const q = read(`${SCRIPTS}/_winquiet.py`);
    expect(q, '★ 未做幂等守卫（重复 apply 会套多一层包装）').toMatch(/_yz_quiet_patched/);
  });
});
