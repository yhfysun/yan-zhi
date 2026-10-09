/**
 * 按 key 串行队列（A2，2026-10-10）守门测试。
 *
 * 背景（实测竞态）：`space-memory.ts:appendLineWithHeader` 是
 *   `await readFile` → 拼接 → `await writeFile` —— **中间有真正的 await**（fs 异步）
 *   ⇒ 两个并发调用各自读到同一份旧内容、各自写回 → **后写覆盖先写**（丢更新）。
 * 触发场景（本项目真实路径）：`appendTaskDecision` 是 fire-and-forget（`void ...`）；
 *   两条任务同时收尾（`call_agent` 并行 / 自动接力）写同一空间记忆文件；
 *   `appendTaskProgress` 一次调用连续写两份文件。
 * 后果（静默、不报错）：空间记忆丢条目、计划进度回退 → 模型看到旧状态、重复干活。
 *
 * ★ 与 #34 的区别（**别混淆**）：#34 的 `createTask` 是**纯同步**函数（无 await）⇒ 无竞态；
 *   这里 **有真正的 await**（fs 读写）⇒ 竞态**真实存在**。
 *   ⇒ 判据：判竞态看 ① 是否 `async` ② 临界区之间有没有真正的 await/Promise/回调。
 *
 * 本测试钉：
 *   ① 队列存在且被 space-memory 的三个写入口共用同一条链表；
 *   ② **真跑**：同 key 并发 N 次必须**串行**（互不覆盖，逐个看到前一个的结果）；
 *   ③ 不同 key 可并行（不互相阻塞 —— 并行度最大化）；
 *   ④ 前一个失败必须**放行**后续（不能卡死整条链）；
 *   ⑤ 无 key → 直接执行（退化旧行为，不制造无主队列）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const SM = read('apps/server/src/services/space-memory.ts');
const SERIAL = read('packages/shared/src/utils/keyed-serial-queue.ts');

describe('① 接线：三个写入口必须共用同一条链表', () => {
  it('★★★ space-memory 必须用 runSerial 包住 RMW', () => {
    expect(SM, '★ 未串行化 → 并发写同一文件会互相覆盖（丢条目/进度回退）')
      .toMatch(/runSerial\(memoryFileChains/);
  });

  it('★★★ 三个写入口（追加/整覆盖/蒸馏删除）都必须走同一条链表', () => {
    const n = (SM.match(/runSerial\(memoryFileChains/g) || []).length;
    expect(n, `★ 只有 ${n} 处串行化（应 ≥3：appendLineWithHeader + writeSpaceMemory + 蒸馏写回）`)
      .toBeGreaterThanOrEqual(3);
    // ★ 关键：必须**共用同一个 Map**（各自 new Map 等于没串行）
    const maps = (SM.match(/new Map\(\)/g) || []).length;
    const decl = (SM.match(/const memoryFileChains: SerialChains = new Map\(\)/g) || []).length;
    expect(decl, '★ memoryFileChains 声明数 ≠ 1（多份链表 = 各自为政，等于没串行）').toBe(1);
    expect(maps, '★ 同文件出现多个 Map（可能有人新开了一条链表）').toBeGreaterThanOrEqual(1);
  });

  it('★★ 键必须取**文件绝对路径**（不同文件之间无冲突，并行度最大）', () => {
    expect(SM, '★ 未按文件路径作键').toMatch(/runSerial\(memoryFileChains,\s*filePath/);
    expect(SM, '★ 蒸馏写回未按 progressPath 作键').toMatch(/runSerial\(memoryFileChains,\s*progressPath/);
  });

  it('★★ 必须有链路上限兜底（防链表随文件数无限增长）', () => {
    expect(SM, '★ 无 pruneSerialChains → 链表会随文件数增长').toMatch(/pruneSerialChains\(/);
  });
});

describe('② 队列实现（真跑 —— 串行语义必须真验）', () => {
  it('★★★ 同 key 并发必须串行（后一个看到前一个的结果）', async () => {
    const mod: any = await import('../../../../packages/shared/src/utils/keyed-serial-queue.js').catch(() => null)
      ?? await import('@yan-zhi/shared').catch(() => null);
    const runSerial = mod?.runSerial;
    expect(typeof runSerial, '★ 无法取到 runSerial').toBe('function');

    const chains = new Map();
    let shared = 0;                 // 模拟"文件内容"
    const observed: number[] = [];  // 每次操作读到的值
    const tasks = Array.from({ length: 10 }, () =>
      runSerial(chains, 'same-key', async () => {
        const readVal = shared;        // 读
        await new Promise((r) => setTimeout(r, 1)); // ★ 模拟 fs 异步的 await（竞态窗口）
        observed.push(readVal);
        shared = readVal + 1;          // 改 + 写
      }),
    );
    await Promise.all(tasks);
    // 串行 ⇒ 每次读到的都是"上一次写完的值"（0,1,2,...9），最终值 = 10
    expect(shared, '★ 并发丢了更新（最终值 < 10）→ 后写覆盖先写').toBe(10);
    expect(observed.sort((a, b) => a - b), '★ 读到的值不连续 → 存在并发读同一份旧值')
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('★★★ 对照：不加串行时必然丢更新（证明本机制有效）', async () => {
    // 同样逻辑但**不用** runSerial → 应丢更新。若这里也等于 10，说明测试造的场景不够"竞态"
    let shared = 0;
    const tasks = Array.from({ length: 10 }, async () => {
      const readVal = shared;
      await new Promise((r) => setTimeout(r, 1));
      shared = readVal + 1;
    });
    await Promise.all(tasks);
    expect(shared, '★ 不用串行竟然也没丢（说明测试场景不构成竞态，前面的"通过"没有意义）')
      .toBeLessThan(10);
  });

  it('★★ 不同 key 可并行（不互相阻塞）', async () => {
    const mod: any = await import('../../../../packages/shared/src/utils/keyed-serial-queue.js').catch(() => null)
      ?? await import('@yan-zhi/shared').catch(() => null);
    const runSerial = mod?.runSerial;
    if (typeof runSerial !== 'function') return;
    const chains = new Map();
    const order: string[] = [];
    const a = runSerial(chains, 'A', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('A');
    });
    const b = runSerial(chains, 'B', async () => {
      order.push('B'); // B 应**先**完成（不被 A 阻塞）
    });
    await Promise.all([a, b]);
    expect(order[0], '★ 不同 key 被互相阻塞（并行度丢失）').toBe('B');
  });

  it('★★★ 前一个失败必须放行后续（不能卡死整条链）', async () => {
    const mod: any = await import('../../../../packages/shared/src/utils/keyed-serial-queue.js').catch(() => null)
      ?? await import('@yan-zhi/shared').catch(() => null);
    const runSerial = mod?.runSerial;
    if (typeof runSerial !== 'function') return;
    const chains = new Map();
    const first = runSerial(chains, 'k', async () => { throw new Error('boom'); });
    await expect(first, '★ 失败应向外抛出（调用方要能看见）').rejects.toThrow('boom');
    // 后续必须仍能执行
    const second = await runSerial(chains, 'k', async () => 'ok');
    expect(second, '★ 前一个失败卡死了链（后续无法执行）').toBe('ok');
  });

  it('★★★ 失败**之后立即提交**的任务也必须能跑（不是"隔一个"才行）', async () => {
    // ★★★ 这条是**变异验证补出来的**：把实现改成 `prev.then(fn)`（不带失败 handler）时
    //   上一条**照样通过** —— 因为链尾存的是"吞错版"（`next.then(()=>undefined,()=>undefined)`），
    //   所以**第三个**任务从吞错版开始、能跑。
    //   真正被破坏的是：**紧跟在失败后面的那个任务**（它的 `next = prev.then(fn)` 继承了 rejection）
    //   ⇒ 必须断言"失败后提交的**第一个**任务"本身也能成功。
    const mod: any = await import('../../../../packages/shared/src/utils/keyed-serial-queue.js').catch(() => null)
      ?? await import('@yan-zhi/shared').catch(() => null);
    const runSerial = mod?.runSerial;
    if (typeof runSerial !== 'function') return;
    const chains = new Map();
    const failing = runSerial(chains, 'k2', async () => { throw new Error('boom'); });
    // ★ 关键：**不等** failing 结算，紧接着提交下一个（这才是真实的并发排队形态）
    const following = runSerial(chains, 'k2', async () => 'after-failure');
    await expect(failing).rejects.toThrow('boom');
    await expect(
      following,
      '★ 失败后**紧接**提交的任务被 rejection 传染（.then(fn) 少了失败 handler）→ 该任务静默不执行',
    ).resolves.toBe('after-failure');
  });

  it('★★ 无 key → 直接执行（退化旧行为，不制造无主队列）', async () => {
    const mod: any = await import('../../../../packages/shared/src/utils/keyed-serial-queue.js').catch(() => null)
      ?? await import('@yan-zhi/shared').catch(() => null);
    const runSerial = mod?.runSerial;
    if (typeof runSerial !== 'function') return;
    const chains = new Map();
    const r = await runSerial(chains, undefined, async () => 'direct');
    expect(r).toBe('direct');
    expect(chains.size, '★ 无 key 时不应写入链表（会无限增长）').toBe(0);
  });

  it('★★ 链路上限兜底真的生效', async () => {
    const mod: any = await import('../../../../packages/shared/src/utils/keyed-serial-queue.js').catch(() => null)
      ?? await import('@yan-zhi/shared').catch(() => null);
    const prune = mod?.pruneSerialChains;
    if (typeof prune !== 'function') return;
    const chains = new Map();
    for (let i = 0; i < 60; i++) chains.set('k' + i, Promise.resolve());
    prune(chains, 50);
    expect(chains.size, '★ 上限兜底未生效（链表会无限增长）').toBeLessThanOrEqual(50);
  });
});

describe('③ 与 #34 的区别（防混淆：不是所有"读库再写"都是竞态）', () => {
  it('★★ createTask 仍是同步函数（无 async）—— 那里的"加锁"是无的放矢', () => {
    const LTM = read('apps/server/src/llm-task-manager.ts');
    const i = LTM.indexOf('export function createTask(');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    // 签名结尾 `}): string {`（无 async）—— 若将来变成 async，本判据需重评
    const sig = LTM.slice(i, i + 4000);
    expect(sig, '★ createTask 变成 async 了？需重新评估是否引入竞态').not.toMatch(/^export async function createTask/);
  });

  it('★★ 真正要串行的地方是"中间有 await 的读-改-写"', () => {
    // space-memory 的 RMW 中间必有 await（readFile/writeFile 都是异步）
    const i = SM.indexOf('async function appendLineWithHeader');
    const body = SM.slice(i, i + 1600);
    expect(body, '★ 未看到 await（若已改成同步 API，本判据需重评）').toMatch(/await readFile/);
    expect(body, '★ 未看到 await writeFile').toMatch(/await writeFile/);
  });
});