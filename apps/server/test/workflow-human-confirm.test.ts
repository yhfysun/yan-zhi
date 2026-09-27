/**
 * human_confirm 工作流节点 —— 守门测试。
 *
 * 用户需求（2026-09-27：「一步步完成，每步让用户确认」）：
 *   流水线必须在确认点**真的停下来**等用户回答，不确认就走不到下一个节点。
 *   这是**结构保证**，不能靠提示词约束模型自觉（模型可能一路跑完跳过确认）。
 *
 * 关键设计（为什么这么做，不是随便选的）：
 *   ① 挂起状态**落 workflow_run.pending_confirm_json**——
 *      用户可能刷新页面/关掉应用过一会儿再回答；只放内存的话刷新就丢了，
 *      用户回来看到"运行中"却不知道在等什么，流水线永久卡死。
 *   ② 不设短超时（与 ask_user 同一口径）：用户"思考要不要确认"的时间不可预知；
 *      给 7 天兜底只为避免服务端永久驻留死等待者。
 *   ③ 无人值守（定时任务）不能静默跳过确认 —— 那正是这个节点要防的事；
 *      如实返回 confirmed=false 并留痕，由下游自行判断。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 桩掉 db：本测试只做静态断言 + 纯函数行为断言，不需要真库
const box = vi.hoisted(() => {
  const pending = new Map<string, string | null>();
  return {
    pending,
    setPending: (id: string, v: string | null) => pending.set(id, v),
  };
});

vi.mock('../src/db.js', () => ({
  db: {
    prepare: (sql: string) => ({
      get: (id?: string) => {
        if (/pending_confirm_json/.test(sql)) {
          const v = box.pending.get(String(id));
          return v === undefined ? undefined : { pending_confirm_json: v };
        }
        return undefined;
      },
      all: () => [],
      run: (v: unknown, _ts?: unknown, id?: unknown) => {
        if (/pending_confirm_json/.test(sql)) box.pending.set(String(id), (v as string | null) ?? null);
      },
    }),
  },
  hasSqliteVec: false,
}));

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(SERVER_SRC, p), 'utf8');
const readRepo = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** 剥注释再断言（本轮踩过：注释里写了正确写法会让断言假绿） */
// ★ 只剥「整行注释」与「块注释」，**绝不**把行尾的 // 也剥掉 ——
//   上一版正则过于激进，把 `eng.register(...)  // 说明` 这类**代码行**整行吃掉了，
//   导致「未注册」断言假红（本轮实测）。判据：剥注释后代码行数不能显著减少。
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const RUNNER = read('src/workflow-runner.ts');
const RUNNER_CODE = strip(RUNNER);
const ROUTE = strip(read('src/routes/workflow.ts'));
const SERVER_DB = read('src/db.ts');
const DRAMA = read('src/builtin-workflow-agents.ts');
const SHARED_TYPES = readRepo('packages/shared/src/types/index.ts');
const STORE_WF = strip(readRepo('packages/ui/src/stores/workflow.ts'));
const MONITOR = strip(readRepo('packages/ui/src/components/workflow/RunMonitor.vue'));
const CANVAS = strip(readRepo('packages/ui/src/views/AgentCanvas.vue'));

describe('① 节点存在且已注册', () => {
  it('★ 后端有 human_confirm handler 并注册进引擎', () => {
    expect(RUNNER, '★ 缺 ServerHumanConfirmNodeHandler').toMatch(/class ServerHumanConfirmNodeHandler/);
    expect(RUNNER, '★ handler 未声明 type = human_confirm').toMatch(/type = 'human_confirm'/);
    // ★ 必须真的 register（只写 class 不注册 = 摆设，跑起来会"未知节点类型"）。
    //   注意 register 的实参是 `wrap(new XxxHandler(run))` —— 与其它节点一致（走 wrap 才有
    //   node:start/node:ok 事件，运行台才看得到这个节点）。正则要容忍 wrap 包裹，
    //   否则会在"正确实现"上假红（本轮实测踩到）。
    expect(RUNNER_CODE, '★★ human_confirm 未注册进引擎（写了但用不上）')
      .toMatch(/eng\.register\(\s*wrap\(\s*new ServerHumanConfirmNodeHandler\s*\(/);
    // 反向判据：必须是 wrap 版本（裸注册会让节点在运行台隐身）
    expect(RUNNER_CODE, '★★ 确认节点未走 wrap（运行台上看不到它，用户不知道卡在哪）')
      .not.toMatch(/eng\.register\(new ServerHumanConfirmNodeHandler\(/);
  });

  it('★ 类型定义前后端都要有（缺一处就存不进/渲染不出）', () => {
    expect(SHARED_TYPES, '★ shared NodeType 缺 human_confirm').toMatch(/'human_confirm'/);
    expect(CANVAS, '★ 画布节点清单缺 human_confirm（用户添加不到）').toMatch(/type: 'human_confirm' as NodeType/);
    expect(CANVAS, '★ 缺节点渲染组件注册').toMatch(/human_confirm: makeNodeComponent/);
    expect(CANVAS, '★ 缺配置面板').toMatch(/selectedNode\.type === 'human_confirm'/);
  });
});

describe('② 确认点必须"结构上拦住"流水线', () => {
  it('★★ 节点要真的挂起等回答（不能立刻返回）', () => {
    const fn = RUNNER.slice(RUNNER.indexOf('class ServerHumanConfirmNodeHandler'), RUNNER.indexOf('// ── human_confirm 的等待与恢复 ──'));
    expect(fn, '★★ 未 await 用户回答（会直接跑过去，确认形同虚设）').toMatch(/await waitForHumanConfirm\(/);
    // 等待者注册在 waitForHumanConfirm 内（另一个函数），按整文件断言其真的登记了
    expect(RUNNER_CODE, '★ 未登记等待者（resolveHumanConfirm 永远找不到人）')
      .toMatch(/humanConfirmWaiters\.set\(callId/);
  });

  it('★ 支持取消：abort 时释放等待者（否则节点永久卡住）', () => {
    const fn = RUNNER.slice(RUNNER.indexOf('function waitForHumanConfirm'), RUNNER.indexOf('export function resolveHumanConfirm'));
    expect(fn, '★ 未监听 abort 信号').toMatch(/abort\.signal\.addEventListener\('abort'/);
    // 释放时必须清理监听与定时器（否则泄漏）
    expect(fn, '★ 释放时未移除 abort 监听（泄漏）').toMatch(/removeEventListener\('abort'/);
    expect(fn, '★ 释放时未清定时器').toMatch(/clearTimeout\(timer\)/);
  });

  it('★ onReject 语义：abort 要中断整条流水线', () => {
    const fn = RUNNER.slice(RUNNER.indexOf('class ServerHumanConfirmNodeHandler'), RUNNER.indexOf('// ── human_confirm 的等待与恢复 ──'));
    expect(fn, '★ 缺 onReject 分支').toMatch(/onReject === 'abort'/);
    expect(fn, '★ 中止时未 throw（会继续往下跑）').toMatch(/throw new Error\(`用户拒绝/);
    // retry 形态返回 rejected 标记给下游判断
    expect(fn, '★ retry 未返回 rejected 标记').toMatch(/rejected: true/);
  });

  it('★ 取消时抛 AbortError（与其它节点的取消语义一致）', () => {
    const fn = RUNNER.slice(RUNNER.indexOf('class ServerHumanConfirmNodeHandler'), RUNNER.indexOf('// ── human_confirm 的等待与恢复 ──'));
    expect(fn, '★ 取消未抛 AbortError').toMatch(/new DOMException\('Aborted', 'AbortError'\)/);
  });
});

describe('③ 跨刷新/重启存活（这是本节点的关键价值）', () => {
  it('★★ 挂起状态必须落库，不能只在内存', () => {
    expect(RUNNER, '★ 缺 persistPendingConfirm').toMatch(/function persistPendingConfirm/);
    expect(RUNNER_CODE, '★★ 未写入 pending_confirm_json（刷新后查不到在等什么）')
      .toMatch(/UPDATE workflow_run SET pending_confirm_json/);
    // 挂起时写、结束时清
    const fn = RUNNER.slice(RUNNER.indexOf('class ServerHumanConfirmNodeHandler'), RUNNER.indexOf('// ── human_confirm 的等待与恢复 ──'));
    expect(fn, '★ 挂起前未落库').toMatch(/persistPendingConfirm\(run\.id, payload\)/);
    expect(fn, '★ 拿到回答后未清除标记（会一直显示"等待确认"）').toMatch(/persistPendingConfirm\(run\.id, null\)/);
  });

  it('★ 表必须有该列（迁移 + 旧库 ALTER）', () => {
    expect(SERVER_DB, '★ 缺 pending_confirm_json 迁移').toMatch(/ALTER TABLE workflow_run ADD COLUMN pending_confirm_json/);
  });

  it('★ 运行状态接口要回显 pendingConfirm（前端刷新后靠它恢复 UI）', () => {
    expect(ROUTE, '★ /runs/:id 未回显 pendingConfirm').toMatch(/pendingConfirm: getPendingConfirm\(runId\)/);
    // ★ 回落 DB 的分支也要有（重启后走这条）。用**代码特征**定位而不是注释
    //   （注释已被剥掉，且用注释做锚点正是本轮踩过的坑）。
    //   该分支的特征：还原 restored: true + 从 result_json/logs_json 解析
    const dbBranch = ROUTE.slice(ROUTE.indexOf('restored: true'));
    expect(dbBranch.slice(0, 400), '★ 回落 DB 分支未回显（重启后前端拿不到）').toMatch(/pendingConfirm/);
  });

  it('★ 前端订阅时要主动查一次待确认（SSE 缓冲重启后为空）', () => {
    expect(STORE_WF, '★ store 缺 fetchPendingConfirm').toMatch(/async function fetchPendingConfirm/);
    expect(MONITOR, '★★ 订阅后未查待确认状态（重启场景确认 UI 不出现）')
      .toMatch(/wf\.fetchPendingConfirm\(props\.runId\)/);
  });

  it('★ 超时要宽（用户思考时间不可预知），不能设短超时', () => {
    const fn = RUNNER.slice(RUNNER.indexOf('function waitForHumanConfirm'), RUNNER.indexOf('export function resolveHumanConfirm'));
    // ★ 行为判据：**解析出实际的超时毫秒数**再比大小，而不是拿正则去猜源码里的写法。
    //   正则版踩了两次坑：`/60 \* 1000/` 被 `7*24*60*60*1000` 的子串误命中；
    //   加负向断言后又拦不住 `60 * 60 * 1000` 这种组合。数值比较才是可靠的。
    const exprs = [...fn.matchAll(/setTimeout\([\s\S]*?,\s*([^)]+?)\)\s*;/g)].map((m) => m[1].trim());
    expect(exprs.length, '★ 未找到超时设置（等待者会永久驻留）').toBeGreaterThan(0);
    const ms = exprs.map((e) => {
      // 只允许纯数字与四则运算，避免误求值（用 Function 而不是 eval，语义相同但更显式）
      expect(e, `★ 超时表达式含非算术内容，无法静态核对: ${e}`).toMatch(/^[\d\s*+]+$/);
      return Number(Function(`return (${e});`)());
    });
    const minMs = Math.min(...ms);
    // 一天以上：远大于"用户思考几分钟"的量级；短于 1 小时即视为回归
    expect(minMs, `★★ 存在分钟级短超时（${minMs}ms）—— 用户在思考或离开时被判超时，确认白等`)
      .toBeGreaterThan(60 * 60 * 1000);
    // 同时要有兜底上限（有超时设置即满足，避免"完全没有 timer"的相反缺陷）
    expect(ms.length, '★ 缺兜底上限（会永久驻留）').toBeGreaterThan(0);
  });
});

describe('④ 提交结果：失效要如实告知，不能不响', () => {
  it('★★ 没有等待者时返回 409（超时/重启），不能假装成功', () => {
    expect(ROUTE, '★ 缺 /confirm 接口').toMatch(/runs\/:id\/confirm/);
    expect(ROUTE, '★ 调用 resolveHumanConfirm 未判返回值').toMatch(/const ok = resolveHumanConfirm/);
    // ★★ 必须锚到**confirm 接口自身**的那处 409。整个文件里 409 有两处
    //   （confirm 一处、cancel 一处，cancel 紧跟在 confirm 之后）——
    //   只写 /status\(409\)/ 或切片切到文件尾，都会在"confirm 的 409 被删掉"时
    //   仍然命中 cancel 那处 → 断言假绿（本轮变异实测抓到的"断言写太宽"）。
    //   正解：切片终点取**下一个 router 声明**，把范围锁死在本接口内。
    const start = ROUTE.indexOf("router.post('/runs/:id/confirm'");
    const nextRoute = ROUTE.indexOf('router.', ROUTE.indexOf('\n', start) + 1);
    const body = ROUTE.slice(start, nextRoute > 0 ? nextRoute : undefined);
    expect(body, '★ confirm 接口内缺 409 分支').toMatch(/status\(409\)/);
    // 且该分支必须在 `if (!ok)` 里（语义：没有等待者 = 已失效）
    expect(body, '★★ 409 未挂在 !ok 分支上（失效判定没接上）')
      .toMatch(/if\s*\(!ok\)\s*\{[\s\S]{0,160}?status\(409\)/);
    // 反向判据：不能是"一律 200"的假成功
    expect(body, '★★ 缺 ok 判定（会把失效也当成功返回）').toMatch(/if\s*\(!ok\)/);
  });

  it('★ 按用户归属校验运行（不能跨用户确认别人的流水线）', () => {
    const fn = ROUTE.slice(ROUTE.indexOf("router.post('/runs/:id/confirm'"));
    expect(fn, '★ 未校验运行属于当前用户').toMatch(/user_id = \?/);
  });

  it('★ 前端失败时要把错误显示出来（不能静默清掉 UI）', () => {
    expect(MONITOR, '★ 提交失败未展示错误').toMatch(/errorMsg\.value = r\.error/);
    // 失败时不得清空 pendingConfirm（清了就再也提交不了）
    const fn = MONITOR.slice(MONITOR.indexOf('async function submitConfirm'), MONITOR.indexOf('function subscribe'));
    const failBranch = fn.slice(fn.indexOf('if (!r.ok)'), fn.indexOf('pendingConfirm.value = null'));
    expect(failBranch, '★★ 提交失败却清空了确认 UI（用户无法重试）').not.toMatch(/pendingConfirm\.value = null/);
  });
});

describe('⑤ 无人值守：不能静默跳过确认', () => {
  it('★★ 无 run 上下文时必须如实标记未确认（而不是假装已确认）', () => {
    const fn = RUNNER.slice(RUNNER.indexOf('class ServerHumanConfirmNodeHandler'), RUNNER.indexOf('// ── human_confirm 的等待与恢复 ──'));
    expect(fn, '★ 缺无人值守分支').toMatch(/if \(!run\)/);
    expect(fn, '★★ 无人值守时未标记 confirmed=false（下游会以为用户确认过）').toMatch(/confirmed: false/);
    expect(fn, '★ 未留痕说明原因').toMatch(/skipped: true/);
  });
});

describe('⑥ 短剧流水线要在"花钱之前"插确认点', () => {
  it('★★ 分镜后必须有人工确认，且排在出图/配音之前', () => {
    expect(DRAMA, '★ 短剧流水线缺 human_confirm 节点').toMatch(/type: 'human_confirm'/);
    // 顺序判据：确认节点的位置必须在到「逐镜出图」的路径上 ——
    // d_shots → d_confirm → d_list → d_loop（出图在 loop body 里）
    expect(DRAMA, '★ 分镜未先接确认节点').toMatch(/source: 'd_shots', target: 'd_confirm'/);
    expect(DRAMA, '★ 确认节点未接到后续流程').toMatch(/source: 'd_confirm', target: 'd_list'/);
    // 确认必须在 loop（出图/配音）之前：确认节点不能挂在 loop 的下游
    expect(DRAMA, '★★ 确认点挂在了 loop 之后（图都生成了才问，白花钱）')
      .not.toMatch(/source: 'd_loop', target: 'd_confirm'/);
  });

  it('★ 定义版本要提升（否则库里旧副本不会被覆盖，用户看不到新节点）', () => {
    // 判据用「版本号 ≥ 6」而不是写死 `= 6`：v6 是引入确认点的那一版，之后每加一条内置工作流
    // 都会继续升版。写死等于值会让**后续任何一次正常升版**都把这个测试弄红（本轮新增三类 SOP
    // 流水线升到 v7 时就踩到了）—— 断言的是「不会停留在 5 或更低」，不是「恰好等于 6」。
    const m = DRAMA.match(/WF_DEF_VERSION\s*=\s*(\d+)/);
    expect(m, '★ 找不到 WF_DEF_VERSION').toBeTruthy();
    expect(Number(m![1]), '★★ WF_DEF_VERSION 未提升（旧库不会更新，用户看不到新确认节点）').toBeGreaterThanOrEqual(6);
  });

  it('★ 打回要能中止（避免用户打回后仍继续烧算力）', () => {
    const i = DRAMA.indexOf("id: 'd_confirm'");
    const block = DRAMA.slice(i, i + 900);
    expect(block, '★ 短剧确认节点未设 onReject: abort').toMatch(/onReject: 'abort'/);
  });
});