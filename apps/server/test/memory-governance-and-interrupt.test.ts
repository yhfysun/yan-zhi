/**
 * 记忆治理 + 中断归因 + 提示词一致性的守门测试（2026-10-09）。
 *
 * 背景（全部有实测证据）：
 *   ① 「同一目录会话太多导致后面的任务执行不了」**不成立** —— 实测 16 次中断里 13 次是
 *      「服务重启，任务被中断」，时间聚集在开发日（dev 用 `tsx watch`，改一次代码重启一次）。
 *   ② `progress.md` 读取**取错方向**：`slice(0, MAX)` 取头部，而文件是追加写（最新在尾部）
 *      → 实测 14840 字符的文件里最新 8 条（含当天进度）全被丢掉，模型看到的进度停在两天前。
 *   ③ 记忆文件**没有上限治理**：decisions.md 超 1.16x（决策行永不淘汰）、progress.md 超 1.85x
 *      （写入侧根本没传淘汰参数）。
 *   ④ pageAgent 提示词**推荐了未挂载的工具** → 模型反复撞"工具不存在"。
 *   ⑤ system prompt 尾部拼 `new Date()` → Anthropic 前缀缓存**跨任务 100% 失效**（成本）。
 *
 * 本测试钉上述五条，且**每条都断言"修好的语义"**（不是"代码里有没有这段"）。
 * ★ 风格同 long-task-continuation.test.ts：静态断言读源码（本机 vitest 环境受限）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SM = strip(read('apps/server/src/services/space-memory.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const DB = strip(read('apps/server/src/db.ts'));
const BROWSER = strip(read('apps/server/src/routes/browser.ts'));
const DEV = read('apps/server/scripts/dev.cjs');
// ★ 其余两条 dev 启动路径：桌面 dev（bin/dev.mjs desktop → main.cjs 的 dev 分支 spawn 后端）
//   与 `dev.mjs server` 的直启分支。**用户日常跑的是 desktop 那条** —— 只测 dev.cjs 会漏掉它。
const MAIN_CJS = read('apps/desktop/main.cjs');
const DEV_MJS = read('bin/dev.mjs');

function anchor(s: string, needle: string, what: string): number {
  const i = s.indexOf(needle);
  expect(i, `锚点不存在（后续断言会假红）：${what} → ${needle}`).toBeGreaterThan(-1);
  return i;
}
/** 截取"从 needle 起到该函数结束（顶格 }）"的片段 —— 避免切到下一个函数造成假红/假绿 */
function bodyOf(s: string, needle: string, what: string): string {
  const i = anchor(s, needle, what);
  const rest = s.slice(i);
  const end = rest.indexOf('\n}');
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 2000);
}

// ────────────────────────────────────────────────────────────
describe('① 中断归因：dev 热重载必须与真实重启区分（13/16 中断来源）', () => {
  it('★★ 启动器必须注入热重载标记（与启动方式同源，不臆造判据）', () => {
    expect(DEV, '★ dev.cjs 未注入 YZ_HOT_RELOAD → 无法区分热重载与真实重启')
      .toMatch(/YZ_HOT_RELOAD:\s*'1'/);
    // 必须确实用 watch（这是"每改一次代码就重启"的事实依据）
    expect(DEV, '★ 启动方式变化，本判据需复核').toMatch(/tsxCli,\s*'watch'/);
  });

  it('★★ 所有 dev 启动路径都必须注入热重载标记（只注入一处 = 另一条路径静默退化）', () => {
    // ★★★ 2026-10-09 真缺口（实测）：标记只在 dev.cjs 注入，而用户跑的是
    //   `bin/dev.mjs desktop` → main.cjs 的 dev 分支 spawn 后端（**没注入**）
    //   → 任务被当"真中断"标 interrupted（DB 实测落「服务重启，任务被中断」），
    //   用户看到「刚发了个继续直接失败」。
    //   ★ 判据：**同一语义的标记必须覆盖所有启动路径** —— 容器是"每个 spawn 后端的地方"。
    //
    // ★★ 断言粒度：**逐 spawn 点**，不是"文件里有没有"。
    //   变异验证教训（2026-10-09 本测试前两版）：
    //     ① 只断言"文件含 YZ_HOT_RELOAD" → 删掉其中一个 spawn 点的注入仍然全绿（假绿）；
    //     ② 改用"就近 900 字符窗口" → main.cjs 两个 spawn 点仅相距 550 字符，
    //        窗口**跨到下一个点了**，删第一处仍绿（又一次假绿）。
    //   ⇒ 正确切法：**从本 spawn 点到下一个 spawn 点**（或文件末），逐段检查，
    //     段与段不重叠 → 任一处缺失必被抓住。
    for (const [file, src] of [['apps/desktop/main.cjs', MAIN_CJS], ['bin/dev.mjs', DEV_MJS]] as const) {
      const needle = "'watch', 'src/index.ts'";
      const starts: number[] = [];
      let idx = -1;
      while ((idx = src.indexOf(needle, idx + 1)) !== -1) starts.push(idx);
      expect(starts.length, `★ ${file} 未找到 dev spawn 点，本断言失效`).toBeGreaterThan(0);
      for (let i = 0; i < starts.length; i++) {
        const seg = src.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : src.length);
        expect(seg, `★ ${file} 第 ${i + 1} 个 dev spawn 点未注入 YZ_HOT_RELOAD（该路径会退化成"真中断"文案）`)
          .toMatch(/YZ_HOT_RELOAD:\s*'1'/);
      }
    }
    // 反面断言：生产分支绝不能注入（打包版行为必须完全不变）
    const prodIdx = MAIN_CJS.indexOf('生产模式：用 Electron 作为 Node.js');
    expect(prodIdx, '★ 生产分支锚点消失，本断言失效').toBeGreaterThan(-1);
    const prodBranch = MAIN_CJS.slice(prodIdx);
    expect(prodBranch.slice(0, prodBranch.indexOf('serverProcess.stdout')),
      '★ 生产分支被注入了 YZ_HOT_RELOAD → 打包版会把真重启当热重载').not.toMatch(/YZ_HOT_RELOAD/);
  });

  it('★★ 回收必须按标记分流：热重载可续、真实重启保持原状', () => {
    const body = bodyOf(LTM, 'export function markOrphanTasksInterrupted', '孤儿回收');
    expect(body, '★ 未读取热重载标记（分流失效）').toMatch(/process\.env\.YZ_HOT_RELOAD/);
    expect(body, '★ 热重载未标为可续状态 resumable').toMatch(/resumable/);
    // ★ 反面断言：生产（无标记）行为必须完全不变
    expect(body, '★ 真实重启分支被改坏（生产行为必须不变）').toMatch(/服务重启，任务被中断/);
    expect(body, '★ 未标记 interrupted（真实重启分支消失）').toMatch(/'interrupted'/);
  });

  it('★★ 热重载提示必须告诉用户"东西还在、可直接继续"', () => {
    const body = bodyOf(LTM, 'export function markOrphanTasksInterrupted', '孤儿回收');
    expect(body, '★ 热重载提示未说明"计划与进度已保留"（用户会以为要重头再来）')
      .toMatch(/保留/);
    expect(body, '★ 热重载提示未给"继续"指引').toMatch(/继续/);
  });

  it('★ 必须提供 isResumableTask 供前端/后续入口判断', () => {
    expect(LTM, '★ 缺 isResumableTask（前端无法区分"可继续"与"已中断"）')
      .toMatch(/export function isResumableTask/);
  });
});

// ────────────────────────────────────────────────────────────
describe('② progress 读取必须取"最新"那一端（此前取最旧）', () => {
  it('★★ 读取侧不得再用 slice 取头部', () => {
    const body = bodyOf(SM, 'export function readTaskProgressForConversation', 'progress 读取');
    expect(body, '★ 仍在用 slice(0, MAX) 取头部 → 模型看到的是最旧进度（实测漏掉最新 8 条）')
      .not.toMatch(/slice\(0,\s*PROGRESS_READ_MAX_CHARS\)/);
  });

  it('★★ 读取侧必须与注入侧共用同一个选取实现（消除漂移根因）', () => {
    const body = bodyOf(SM, 'export function readTaskProgressForConversation', 'progress 读取');
    expect(body, '★ 未复用 selectMemoryLines → 又会出现第二处实现（漂移根因）')
      .toMatch(/selectMemoryLines\(/);
  });

  it('★★ 选取函数必须"从新到旧"取（这是"取最新"的机制保证）', () => {
    const body = bodyOf(SM, 'function selectMemoryLines', 'selectMemoryLines');
    expect(body, '★ 未从新到旧取（newestFirst）→ 超限时会丢掉最新内容').toMatch(/newestFirst/);
    // 三类都必须 newestFirst=true
    const calls = body.match(/take\([^)]*\)/g) || [];
    expect(calls.length, '★ take 调用数量异常（选取逻辑被改）').toBeGreaterThanOrEqual(3);
    for (const c of calls) {
      expect(c, `★ 存在未按从新到旧取的调用：${c}`).toMatch(/true/);
    }
  });
});

// ────────────────────────────────────────────────────────────
describe('③ 记忆文件必须有上限治理（对齐 WorkBuddy 的"有界"）', () => {
  it('★★ progress.md 写入侧必须带滚动淘汰（此前完全没传）', () => {
    const body = bodyOf(SM, 'export async function appendTaskProgress', '任务收尾写入');
    // 两处 appendLineWithHeader 都必须带 keepPerMark（注入版 + 明细版）
    const seg = body.slice(body.indexOf('getTaskProgressPath'), body.indexOf('return { ok: true, path: getTaskProgressPath'));
    expect(seg, '★ progress.md 明细分支未传 keepPerMark → 文件无界增长（实测 1.85x 超限）')
      .toMatch(/PROGRESS_ENTRY_MARK/);
  });

  it('★★ decisions.md 必须有保留上限（此前决策行永不淘汰）', () => {
    expect(SM, '★ 缺 DECISION_ENTRY_KEEP 常量').toMatch(/DECISION_ENTRY_KEEP\s*=\s*\d+/);
    const body = bodyOf(SM, 'export async function appendTaskDecision', '决策写入');
    expect(body, '★ 决策写入未传淘汰参数 → 实测已超上限 1.16x')
      .toMatch(/keep:\s*DECISION_ENTRY_KEEP/);
  });

  it('★★ 决策条目特征正则必须含行首 "- "（否则一条都匹配不到＝淘汰静默失效）', () => {
    expect(SM, '★ DECISION_ENTRY_MARK 未锚行首 "- "（这个坑在 PROGRESS_ENTRY_MARK 上踩过）')
      .toMatch(/DECISION_ENTRY_MARK\s*=\s*\/\^-\s/);
  });

  it('★ 必须暴露记忆体积（让"记忆多大"不再靠感觉）', () => {
    const body = bodyOf(SM, 'export async function readSpaceMemory', '空间记忆读取');
    expect(body, '★ 未返回 usage（体积/上限）→ 用户无法判断该不该清记忆')
      .toMatch(/usage/);
    expect(body, '★ usage 未含原始字符数').toMatch(/rawChars/);
    expect(body, '★ usage 未含注入上限').toMatch(/injectMaxChars/);
  });
});

// ────────────────────────────────────────────────────────────
describe('④ pageAgent 提示词与工具面必须一致（推荐了就要挂）', () => {
  it('★★ 提示词推荐的三件读页工具必须都在挂载清单里', () => {
    const mountIdx = anchor(DB, 'const PAGE_AGENT_BUILTIN_TOOLS = [', '挂载清单');
    const mount = DB.slice(mountIdx, DB.indexOf('];', mountIdx));
    for (const t of ['browser_get_page_info', 'browser_get_dom', 'browser_get_visible_text']) {
      expect(mount, `★ 提示词推荐了 ${t} 却没挂载 → 模型照提示词调用却撞"工具不存在"`)
        .toMatch(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('★★ 提示词里声明的工具必须与挂载清单逐项一致（不能少声明已挂的）', () => {
    const mountIdx = anchor(DB, 'const PAGE_AGENT_BUILTIN_TOOLS = [', '挂载清单');
    const mount = DB.slice(mountIdx, DB.indexOf('];', mountIdx));
    const promptIdx = anchor(DB, 'const PAGE_AGENT_SYSTEM_PROMPT =', 'pageAgent 提示词');
    const prompt = DB.slice(promptIdx, DB.indexOf('工作流程：', promptIdx));
    // 逐个核：挂载清单里的 browser_* 必须都在提示词里出现（否则模型不知道自己有这个工具）
    const mounted = (mount.match(/'browser_[a-z_]+'/g) || []).map((s) => s.replace(/'/g, ''));
    expect(mounted.length, '★ 挂载清单解析失败').toBeGreaterThan(5);
    for (const t of mounted) {
      expect(prompt, `★ 挂了 ${t} 但提示词里没声明 → 模型不知道能用它`).toContain(t);
    }
  });

  it('★★ 提示词不得再写"仅以下九个"这类与实际挂载不符的表述', () => {
    const promptIdx = anchor(DB, 'const PAGE_AGENT_SYSTEM_PROMPT =', 'pageAgent 提示词');
    const prompt = DB.slice(promptIdx, promptIdx + 6000);
    expect(prompt, '★ 仍有"仅以下九个"的过期表述（实际挂了 14+ 个）').not.toMatch(/仅以下九个/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑤ 提示词缓存：system 尾部不得有逐次变动的内容', () => {
  it('★★ system prompt 不得再拼动态时间戳（缓存杀手）', () => {
    const body = bodyOf(LTM, 'function buildSystemPromptForBackend', '提示词构建');
    expect(body, '★ system prompt 里仍有 new Date() → 跨任务前缀缓存 100% 失效（成本数量级）')
      .not.toMatch(/当前时间：\$\{new Date\(\)/);
  });

  it('★★ 必须能观测到缓存命中（先能看见再优化）', () => {
    expect(LTM, '★ 未记录缓存命中量（无法判断前缀缓存是否生效）')
      .toMatch(/cachedTokensTotal|cachedTokens/);
    // 类型层必须有该字段
    const TYPES = strip(read('packages/shared/src/types/index.ts'));
    expect(TYPES, '★ ChatChunk.usage 缺 cachedTokens 字段').toMatch(/cachedTokens\?:/);
    // 解析层必须真的读上游字段（否则上层永远拿不到）
    const STREAM = strip(read('packages/core/src/llm/stream.ts'));
    expect(STREAM, '★ OpenAI 流式未解析 prompt_tokens_details.cached_tokens')
      .toMatch(/cached_tokens/);
    const ANTH = strip(read('packages/core/src/llm/anthropic.ts'));
    expect(ANTH, '★ Anthropic 未解析 cache_read_input_tokens').toMatch(/cache_read_input_tokens/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑥ 浏览器写路由必须全覆盖串行锁（漏一个就跨会话错页）', () => {
  it('★★ /render 必须进锁（它用 GET 却在 page.goto —— 导航就是写）', () => {
    const i = anchor(BROWSER, "router.get('/render'", '/render 路由');
    const line = BROWSER.slice(i, i + 200);
    expect(line, '★ /render 未包 withBrowserLock → 与并发 /action 抢同一 pageInstance')
      .toMatch(/withBrowserLock/);
  });

  it('★★ login-saved / passwords fill 必须进锁', () => {
    for (const p of ["router.post('/login-saved'", "router.post('/passwords/:id/fill'"]) {
      const i = anchor(BROWSER, p, p);
      const line = BROWSER.slice(i, i + 200);
      expect(line, `★ ${p} 未包 withBrowserLock（goto/fill/click 都是写）`).toMatch(/withBrowserLock/);
    }
  });

  it('★★ 路径参数路由必须能被判定（Set 匹不上，需正则）', () => {
    expect(BROWSER, '★ 缺 BROWSER_SERIAL_PATTERN（/passwords/:id/fill 这类带参路由无法进锁）')
      .toMatch(/BROWSER_SERIAL_PATTERN/);
    // 判定必须走统一出口 isBrowserSerialPath
    expect(BROWSER, '★ 未收敛到 isBrowserSerialPath（两处判定会漂移）')
      .toMatch(/isBrowserSerialPath/);
  });

  it('★★★ 白名单必须真的包含新增的三条路径（只包 handler 不够，白名单漏了照样直通）', () => {
    // ★★★ 这条是**变异验证补出来的**（教训）：第一版只断言 "路由行里有 withBrowserLock"，
    //   把白名单里的 '/render' 删掉时测试**全绿** —— 因为 `withBrowserLock` 会先查
    //   `isBrowserSerialPath(req.path)`，**不在白名单就直通**，包了等于没包。
    //   ⇒ 守门测试必须断言"**判定集合真的包含它**"，而不是"有没有包这层壳"。
    //   （这与本项目"安全闸要验证结果集合里没有/有，不能只验证有没有报告原因"是同一族判据。）
    const i = anchor(BROWSER, 'const BROWSER_SERIAL_PATHS = new Set([', '串行白名单');
    const setBody = BROWSER.slice(i, BROWSER.indexOf(']);', i));
    for (const p of ['/render', '/login-saved']) {
      expect(setBody, `★ 白名单缺 ${p} → withBrowserLock 会因"不在集合"而直接放行（静默失效）`)
        .toContain(`'${p}'`);
    }
    // 带参路由必须在正则里（Set 匹不上）
    const patIdx = anchor(BROWSER, 'const BROWSER_SERIAL_PATTERN', '带参路由正则');
    const patLine = BROWSER.slice(patIdx, patIdx + 200);
    expect(patLine, '★ 带参正则未覆盖 /passwords/:id/fill')
      .toMatch(/passwords/);
  });

  it('★★ 原有 7 条写路由不得被误删（回归保护）', () => {
    const i = anchor(BROWSER, 'const BROWSER_SERIAL_PATHS = new Set([', '串行白名单');
    const setBody = BROWSER.slice(i, BROWSER.indexOf(']);', i));
    for (const p of ['/navigate', '/action', '/back', '/forward', '/refresh', '/close', '/focus']) {
      expect(setBody, `★ 原有写路由 ${p} 丢失（回归）`).toContain(`'${p}'`);
    }
  });
});