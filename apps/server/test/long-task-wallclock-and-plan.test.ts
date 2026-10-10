/**
 * 长任务「一趟跑不出来」三项根因的守门测试（2026-10-09）。
 *
 * 背景（全部有实据，不是推测）：
 *   ① **墙钟 15 分钟是硬瓶颈**：`TASK_WALL_CLOCK_BUDGET_MS = 15min`，且按**任务创建**的墙钟算，
 *      而等待外部子进程（python_exec 跑 edge-tts 22 段 + ffmpeg 合成）照样计时。
 *      实测会话 84412558：17.2 分钟触达；最近 40 个任务里 7 个卡在 15~18 分钟区间。
 *   ② **预算触达无条件否决接力**：`!budgetExhausted` 横在接力分支前 → 计划还剩 7 步也不接力
 *      （库里「自动接力第」0 次）。与 2026-09-29 修掉的"reason 说该继续、结论却不续"同类复发。
 *   ③ **计划接力棒被 clearPlan 抹掉**：`send()` 里的 `clearPlan` 读的是**自己刚清空的 map**
 *      → 恒 `PATCH taskPlan:null` → 服务端连带 `unlink plan.md`。实测：计划三处落盘点全空。
 *
 * 本测试钉：
 *   A. 等待抵扣（子进程等待不计入墙钟）—— 行为断言 + 封顶断言；
 *   B. 预算触达后仍可接力，且接力前重置基线（不会立刻再触达 → 无限空转）；
 *   C. 总墙钟失控闸存在（弹性墙钟的必要兜底）；
 *   D. 文案口径：墙钟真因不得被"最大循环数"掩盖；
 *   E. `send()` 不得再 PATCH null 抹掉跨会话计划；用户显式清除仍必须落盘。
 *
 * ★ 风格与 long-task-continuation.test.ts 一致：静态断言读源码（本机 vitest 环境受限，
 *   但 A 项额外做**纯函数行为断言**，因为"抵扣算术"必须真跑，静态查字符串是自欺）。
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
const POLICY_SRC = read('packages/shared/src/utils/context-policy.ts');

function anchor(s: string, needle: string, what: string): number {
  const i = s.indexOf(needle);
  expect(i, `锚点不存在（后续断言会假红）：${what} → ${needle}`).toBeGreaterThan(-1);
  return i;
}
function win(s: string, needle: string, len: number, what: string): string {
  const i = anchor(s, needle, what);
  return s.slice(i, i + len);
}

// ────────────────────────────────────────────────────────────
describe('A 等待抵扣：等外部子进程不该吃墙钟（真跑算术，不查字符串）', () => {
  it('★★ 必须导出等待抵扣的常量与两个纯函数', async () => {
    const mod = await import('@yan-zhi/shared');
    expect((mod as any).TASK_WAIT_CREDIT_CAP_MS, '★ 无抵扣总量封顶').toBeGreaterThan(0);
    expect((mod as any).TASK_WAIT_CREDIT_PER_CALL_CAP_MS, '★ 无单次抵扣封顶').toBeGreaterThan(0);
    expect(typeof (mod as any).resolveWaitCredit, '★ 缺 resolveWaitCredit').toBe('function');
    expect(typeof (mod as any).addWaitCredit, '★ 缺 addWaitCredit').toBe('function');
  });

  it('★★ 单次抵扣必须封顶（否则工具卡死时墙钟被架空成不设限）', async () => {
    const { resolveWaitCredit, TASK_WAIT_CREDIT_PER_CALL_CAP_MS } = await import('@yan-zhi/shared');
    const cap = TASK_WAIT_CREDIT_PER_CALL_CAP_MS as number;
    expect(resolveWaitCredit(0), '零耗时应为 0').toBe(0);
    expect(resolveWaitCredit(-5), '负值应为 0').toBe(0);
    expect(resolveWaitCredit(1000), '1 秒应全额抵扣').toBe(1000);
    // ★ 关键：单次超过封顶只抵扣到封顶（防"卡住 2 小时也算成等待"）
    expect(resolveWaitCredit(cap * 10), '超长单次必须封到单次上限').toBe(cap);
  });

  it('★★ 累计抵扣必须有总量封顶', async () => {
    const { addWaitCredit, TASK_WAIT_CREDIT_CAP_MS, TASK_WAIT_CREDIT_PER_CALL_CAP_MS } = await import('@yan-zhi/shared');
    const totalCap = TASK_WAIT_CREDIT_CAP_MS as number;
    const perCap = TASK_WAIT_CREDIT_PER_CALL_CAP_MS as number;
    let acc = 0;
    for (let i = 0; i < 100; i++) acc = addWaitCredit(acc, perCap);
    expect(acc, '累计抵扣必须封顶（不能把墙钟彻底架空）').toBe(totalCap);
  });

  it('★★ 预算判定必须扣除等待抵扣（本次修复的核心语义）', async () => {
    const { checkTaskBudgetHit } = await import('@yan-zhi/shared');
    const budgets = { tokenBudget: 1_000_000, wallClockMs: 15 * 60 * 1000 };
    const start = 1_000_000;
    const now = start + 20 * 60 * 1000; // 墙钟已过 20 分钟（> 15）
    // 无抵扣 → 触达墙钟
    const hit = checkTaskBudgetHit(budgets, 0, start, now);
    expect(hit?.kind, '无抵扣时应触达墙钟').toBe('wallclock');
    // ★ 抵扣 10 分钟（正是"等 TTS/ffmpeg"的量）→ 不再触达
    const hit2 = checkTaskBudgetHit(budgets, 0, start, now, 10 * 60 * 1000);
    expect(hit2, '★ 等待时间仍被算进墙钟 → 出片类长任务必然每批超时').toBeNull();
  });

  it('★★ 抵扣必须是 fail-safe（非法值不炸、不反向放大）', async () => {
    const { checkTaskBudgetHit } = await import('@yan-zhi/shared');
    const budgets = { tokenBudget: 1_000_000, wallClockMs: 15 * 60 * 1000 };
    const start = 1_000_000;
    const now = start + 30 * 60 * 1000;
    expect(checkTaskBudgetHit(budgets, 0, start, now, NaN)?.kind, 'NaN 抵扣应视为 0').toBe('wallclock');
    expect(checkTaskBudgetHit(budgets, 0, start, now, -999)?.kind, '负抵扣不得反向放大').toBe('wallclock');
  });

  it('★★★ 接线必须真通：server 侧必须把 waitCredit 传给预算判定', () => {
    // ★★★ 这条是**变异验证补出来的**（教训）：上面几条只钉了 shared 的纯函数，
    //   把 server 侧改成 `..., 0)`（即"抵扣算了但不传给判定"）时测试**全绿** —— 典型的
    //   「纯函数对、接线断」盲区。守门测试必须同时钉**接线**，不能只钉被调用的函数。
    const i = anchor(LTM, 'function checkTaskBudgetHit(task: LlmTask)', 'server 预算判定适配');
    const body = LTM.slice(i, i + 320);
    expect(body, '★ server 未把 waitCreditMs 传给预算判定（抵扣白算，墙钟仍被外部等待吃满）')
      .toMatch(/task\.waitCreditMs\s*\|\|\s*0/);
    // 且基线必须用独立字段（不能回退成 createdAt，否则接力前移会拖垮回收看门狗）
    expect(body, '★ 预算基线未用 budgetBaselineAt').toMatch(/task\.budgetBaselineAt/);
  });

  it('★★★ 接线必须真通：工具出口必须真的累加抵扣', () => {
    // 同上的另一半：只算不传 / 只传不算，都是"看起来修了"。
    const i = anchor(LTM, 'const execStartedAt = Date.now();', '工具出口计时点');
    const body = LTM.slice(i, i + 320);
    expect(body, '★ 工具出口未累加等待抵扣').toMatch(/addWaitCredit\(task\.waitCreditMs/);
    expect(body, '★ 未用真实耗时（累计值恒 0 → 抵扣无效）')
      .toMatch(/Date\.now\(\)\s*-\s*execStartedAt/);
  });
});

// ────────────────────────────────────────────────────────────
describe('B 预算触达后仍可接力（不再无条件否决）', () => {
  it('★★ 接力分支不得再被 budgetExhausted 挡在门外', () => {
    const i = anchor(LTM, 'const budgetExhausted = !!taskBudgetHit;', 'budgetExhausted 定义');
    const after = LTM.slice(i, i + 260);
    // ★ 反面断言：条件里不能再出现 budgetExhausted
    expect(after, '★ 预算触达仍无条件否决接力（计划剩 7 步也不接力）')
      .not.toMatch(/if\s*\(expectedContinue\s*&&\s*!aborted\s*&&\s*!degenerate\s*&&\s*!budgetExhausted\)/);
    expect(after, '★ 接力分支消失').toMatch(/if\s*\(expectedContinue\s*&&\s*!aborted\s*&&\s*!degenerate\)/);
  });

  it('★★ 接力前必须重置预算基线（否则下一批立刻再触达 → 无限空转）', () => {
    const i = anchor(LTM, 'if (budgetExhausted) {', '预算基线重置块');
    const body = LTM.slice(i, i + 500);
    // token：对齐到上限（本批为最后一次）；墙钟：基线前移（每批一份完整预算）
    expect(body, '★ token 触达后未对齐累计值 → 下批第一步立刻再触达')
      .toMatch(/totalTokens\s*=\s*taskBudgetHit!\.limit/);
    expect(body, '★ 墙钟触达后未前移基线 → 长任务依旧一批就断')
      .toMatch(/budgetBaselineAt\s*=\s*Date\.now\(\)/);
    expect(body, '★ 基线重置后未清等待抵扣（会把上批的抵扣带进下批）')
      .toMatch(/waitCreditMs\s*=\s*0/);
  });

  it('★★ 墙钟基线必须与 createdAt 分开（createdAt 兼着回收看门狗基准）', () => {
    // ★ 这是"一个字段两种语义"的坑：直接改 createdAt 会让 cleanupTasks 的 2h 看门狗永远不触发
    expect(LTM, '★ 预算判定读 createdAt（接力前移会让任务收不回）')
      .not.toMatch(/sharedCheckTaskBudgetHit\(task\.budgets,\s*task\.totalTokens\s*\|\|\s*0,\s*task\.createdAt\s*\|\|\s*Date\.now\(\)/);
    expect(LTM, '★ 缺独立预算基线字段').toMatch(/budgetBaselineAt/);
    // 看门狗仍必须读 createdAt（不能被误改）
    expect(LTM, '★ 任务回收看门狗基准被破坏').toMatch(/now\s*-\s*task\.createdAt\s*>\s*maxRunMs/);
  });
});

// ────────────────────────────────────────────────────────────
describe('C 总墙钟失控闸（弹性墙钟的必要兜底）', () => {
  it('★★ 必须存在独立于批次数的总时长硬顶', () => {
    expect(LTM, '★ 无总时长硬顶：弹性墙钟 + 停滞闸在"无计划"时失效 → 最坏 30 批 x 15 分钟')
      .toMatch(/TASK_TOTAL_WALL_CLOCK_HARD_CAP_MS\s*=\s*\d+/);
  });

  it('★★ 总时长闸必须在接力分支内真实拦截', () => {
    const i = anchor(LTM, 'const totalElapsedMs', '总时长闸使用点');
    const body = LTM.slice(i, i + 400);
    expect(body, '★ 常量定义了却没用来拦截（形同虚设）')
      .toMatch(/totalElapsedMs\s*>=\s*TASK_TOTAL_WALL_CLOCK_HARD_CAP_MS/);
  });

  it('★ 总时长闸的口径必须含等待（与预算口径刻意不同）', () => {
    const i = anchor(LTM, 'const totalElapsedMs', '总时长口径');
    const body = LTM.slice(i, i + 200);
    expect(body, '★ 总时长闸误用抵扣口径（那就不是"机器被占多久"了）')
      .toMatch(/Date\.now\(\)\s*-\s*\(task\.createdAt/);
  });
});

// ────────────────────────────────────────────────────────────
describe('D 文案口径：真因不得被"最大循环数"掩盖', () => {
  it('★★ 模型总结覆盖 tipText 时必须按真实闸门措辞', () => {
    const i = anchor(LTM, 'summaryText = judged.summary;', '总结赋值点');
    const body = LTM.slice(i, i + 900);
    expect(body, '★ 总结仍无条件写成"单批最大循环步数"（掩盖墙钟真因，用户去加步数是错方向）')
      .not.toMatch(/tipText\s*=\s*`\$\{summaryText\}\\n\\n（注：本次任务已达到单批最大循环步数/);
    expect(body, '★ 未按预算口径写注脚').toMatch(/taskBudgetHit\.kind\s*===\s*'tokens'/);
  });

  it('★ 墙钟文案要说明已扣除等待（否则用户以为"15 分钟就干了 15 分钟活"）', () => {
    const i = anchor(LTM, '已达到任务墙钟时间上限', '墙钟文案');
    const body = LTM.slice(i, i + 220);
    expect(body, '★ 墙钟文案未说明扣除等待').toMatch(/扣除等外部进程/);
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