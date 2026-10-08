/**
 * P2「对齐 WorkBuddy/Trae 的其余能力」守门测试。
 *
 * 2026-09-29 落地四项（方案 docs/长任务续跑与自举能力-对齐WorkBuddy与Trae-方案.md 的 P2）：
 *   · P2-2 记忆分层与优先级（按行选取，不再头部截断）
 *   · P2-3 工具前后置 Hooks（副作用从主循环搬出去）
 *   · P2-4 并行子智能体（同批 call_agent 并发，深度仍限 1 层）
 *   · P2-5 检查点与回滚（按步回滚，含"取最早 before"的关键正确性）
 *
 * ★ 本机 pnpm 的 vitest / typescript 包目录为空（已知环境问题）→ 断言写成静态断言；
 *   等价真跑见 tmp/ 下的自检脚本（每个都做过实测，含反例对照）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** ★ 剥注释 —— 不剥会让注释里的函数名造成 `.not.toMatch` 假红（本项目踩过两次） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HOOKS = strip(read('apps/server/src/services/tool-hooks.ts'));
const ARTIFACT_HOOKS = strip(read('apps/server/src/services/artifact-hooks.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const SPACE_MEM = strip(read('apps/server/src/services/space-memory.ts'));
const WORKSPACE = strip(read('apps/server/src/routes/workspace.ts'));
const DB = strip(read('apps/server/src/db.ts'));

function at(code: string, needle: string, label: string): number {
  const i = code.indexOf(needle);
  expect(i, `★ 锚点失效（源码结构变了）：${label}`).toBeGreaterThan(-1);
  return i;
}
function win(code: string, needle: string, len: number, label?: string): string {
  const i = at(code, needle, label || needle);
  return code.slice(i, i + len);
}

// ────────────────────────────────────────────────────────────
describe('P2-3 工具前后置 Hooks', () => {
  it('★★ 必须提供 before/after 两个钩子点', () => {
    expect(HOOKS, '★ 缺 before 钩子注册').toMatch(/registerBeforeToolHook/);
    expect(HOOKS, '★ 缺 after 钩子注册').toMatch(/registerAfterToolHook/);
  });

  it('★★ before 钩子必须能拦截（block 语义，供危险命令黑名单用）', () => {
    const body = win(HOOKS, 'export async function runBeforeToolHooks', 900, 'runBeforeToolHooks');
    expect(body, '★ 未支持 block 返回值').toMatch(/block/);
  });

  it('★★ 必须 fail-open：钩子抛错不能影响工具结果', () => {
    // 工具已经执行完了，副作用是次要的 —— 一个坏钩子不能带走整条链
    // 2026-10-08 同步：日志统一走 services/logger（createLogger），不再是裸 console.warn
    const cnt = (HOOKS.match(/logger\.warn\(`\[tool-hook\]/g) || []).length;
    expect(cnt, '★ 钩子未做逐个 catch（坏钩子会中断后续钩子/工具链）').toBeGreaterThanOrEqual(2);
    // 前置/后置各有一处 try/catch 兜底
    expect(HOOKS, '★ runBeforeToolHooks 缺 catch').toMatch(/runBeforeToolHooks[\s\S]{0,900}catch/);
    expect(HOOKS, '★ runAfterToolHooks 缺 catch').toMatch(/runAfterToolHooks[\s\S]{0,900}catch/);
  });

  it('★★ 副作用必须搬到钩子（主循环只负责跑钩子）', () => {
    expect(ARTIFACT_HOOKS, '★ 未注册 file_write 登记钩子').toMatch(/artifact:file_write/);
    expect(ARTIFACT_HOOKS, '★ 未注册媒体产物登记钩子').toMatch(/artifact:media/);
    const body = win(LTM, 'await runAfterToolHooks(', 700, '主循环跑钩子');
    expect(body, '★ 未在主循环调用钩子').toMatch(/runAfterToolHooks/);
  });

  it('★★ 登记必须用工具回传的 _meta.path（不能用模型传的 args.path）', () => {
    const body = win(ARTIFACT_HOOKS, 'artifact:file_write', 900, 'file_write 钩子');
    expect(body, '★ 未用 ctx.meta 取路径').toMatch(/ctx\.meta|m\?\.path/);
    expect(body, '★ 用了模型传的 args.path（会登记不存在的路径 → 点开 404）').not.toMatch(/args\?\.path/);
  });
});

// ────────────────────────────────────────────────────────────
describe('P2-4 并行子智能体', () => {
  it('★★ 同批多个 call_agent 必须并发执行', () => {
    expect(LTM, '★ 未用 Promise.all 并发').toMatch(/Promise\.all\(batchToRun\.map/);
  });

  it('★★ 并发范围必须是显式白名单：call_agent + 只读工具（浏览器/UI/写类绝不并行）', () => {
    // ★ 2026-10-08 同步：P0-4（2026-10-07）把并发范围从「只 call_agent」扩到
    //   「call_agent + 只读白名单」。原锚点 `const agentCalls = toolCallAcc.filter` 已重构。
    //   防护意图不变：并发集合必须**显式列举**，绝不能变成「全并行」。
    expect(LTM, '★ 并发筛选逻辑丢失').toMatch(/return n === 'call_agent' \|\| READONLY_PARALLEL_TOOLS\.has\(n\)/);
    const body = win(LTM, 'const READONLY_PARALLEL_TOOLS = new Set<string>([', 300, '只读并发白名单');
    expect(body, '★ 白名单存在').toMatch(/file_read/);
    // 红线：这三类绝不能进并发白名单（浏览器单活动页 / UI 弹框 / 写类有依赖）
    for (const risky of ['browser_', 'ask_user', 'confirm_user', 'file_write', 'file_edit']) {
      expect(body, `★ 危险工具混进并发白名单：${risky}`).not.toContain(`'${risky}'`);
    }
  });

  it('★★ 结果必须按原序取用（tool 消息要与 tool_calls 同序，否则重放 400）', () => {
    expect(LTM, '★ 未按原序取用').toMatch(/const pre = concurrentResults\.get\(String\(tc\.id/);
  });

  it('★★ 嵌套深度仍限 1 层（只放宽同批并发，不放宽嵌套）', () => {
    expect(LTM, '★ depth 限制被误删（子智能体可无限嵌套）').toMatch(/depth >= 1/);
  });

  it('★ 必须有并发上限（防上游 429）', () => {
    expect(LTM, '★ 无并发上限').toMatch(/MAX_CONCURRENT_AGENTS/);
  });
});

// ────────────────────────────────────────────────────────────
describe('P2-5 检查点与回滚', () => {
  it('★★ file_change 必须有 step 列（否则只能按任务撤全部，无法回滚到第 N 步）', () => {
    expect(DB, '★ 缺 step 列迁移').toMatch(/ALTER TABLE file_change ADD COLUMN step INTEGER/);
    expect(LTM, '★ 写入快照时未记 step').toMatch(/'pending', task\.step/);
  });

  it('★★ 必须提供按任务+步号回滚的接口', () => {
    expect(WORKSPACE, '★ 缺按步回滚接口').toMatch(/router\.post\('\/tasks\/:taskId\/rollback'/);
    expect(WORKSPACE, '★ 缺检查点列表接口').toMatch(/router\.get\('\/tasks\/:taskId\/checkpoints'/);
  });

  it('★★★ 必须取"区间内最早的 before_content"（取最后一次会留下中间改动，且不报错）', () => {
    const body = win(WORKSPACE, "router.post('/tasks/:taskId/rollback'", 2200, 'rollback 接口');
    expect(body, '★ 未按 step 升序（无法保证取到"最早"）').toMatch(/ORDER BY step ASC/);
    expect(body, '★ 未用 earliest 去重取首个').toMatch(/if \(!earliest\.has\(r\.path\)\)/);
  });

  it('★★ 只回退 pending（不碰用户已 apply/dismiss 过的）', () => {
    expect(WORKSPACE, "★ 未限定 status='pending'（会覆盖用户确认过的结果）")
      .toMatch(/status = 'pending' AND step IS NOT NULL AND step >= \?/);
  });

  it('★ 回退失败必须上报（危险操作不能静默）', () => {
    expect(WORKSPACE, '★ 失败项未上报').toMatch(/failed: reverted\.filter/);
  });

  it('★ 新建文件（before 为空）应删除而不是留空文件', () => {
    expect(WORKSPACE, '★ 未处理"新建文件"情形').toMatch(/info\.before == null/);
  });
});

// ────────────────────────────────────────────────────────────
describe('P2-2 记忆分层与优先级选取', () => {
  it('★★★ 不得再用头部截断（MEMORY.md 是追加写，头部截断会丢掉最新的任务进展）', () => {
    const body = win(SPACE_MEM, 'export function formatSpaceMemoryContext', 1400, 'formatSpaceMemoryContext');
    expect(body, '★ 仍在做头部截断（会丢掉末尾的任务进展行）').not.toMatch(/\.slice\(0,\s*INJECT_MAX_CHARS\)/);
    expect(body, '★ 未走按行选取').toMatch(/selectMemoryLines\(/);
  });

  it('★★ 加载函数也不得提前截断（两处各截一次必然漂移）', () => {
    const body = win(SPACE_MEM, 'export function loadSpaceMemoryForConversation', 1200, 'loadSpaceMemoryForConversation');
    expect(body, '★ 加载时就截断了（截断应只发生在格式化阶段）')
      .not.toMatch(/content\.slice\(0,\s*INJECT_MAX_CHARS\)/);
  });

  it('★★ 任务进展行与决策行必须单独识别（优先级高于普通流水）', () => {
    const body = win(SPACE_MEM, 'function selectMemoryLines', 2200, 'selectMemoryLines');
    expect(body, '★ 未单独识别进展行').toMatch(/任务【/);
    expect(body, '★ 未单独识别决策行').toMatch(/问：.*→.*答：/);
  });

  it('★★★ 三类都必须从新到旧取（否则预算被最旧的吃光、最近的设定被丢）', () => {
    // 我第一版把 decisions 写成"保持原序"，自检抓出「最近拍板的设定被丢」
    const body = win(SPACE_MEM, 'take(progress, true)', 220, '三类取用');
    const matches = body.match(/take\((\w+),\s*(true|false)\)/g) || [];
    expect(matches.length, '★ 未找到三类取用调用').toBeGreaterThanOrEqual(3);
    const falsy = matches.filter((m) => m.includes('false'));
    expect(falsy, `★ 有类别按"原序"取（旧内容会挤掉新内容）：${falsy.join(', ')}`).toEqual([]);
  });

  it('★ 超限必须报告丢弃条数（用户要知道记忆被裁了）', () => {
    expect(SPACE_MEM, '★ 未报告丢弃条数').toMatch(/另有 \$\{dropped\} 条/);
  });
});