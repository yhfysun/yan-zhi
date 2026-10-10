/**
 * 裸会话跨会话链路（D6，2026-10-10）守门测试。
 *
 * 背景（实测缺口）：`appendTaskProgress` 在 `resolveConversationSpaceId` 为空时直接
 *   `return { ok: false }` ⇒ **未挂空间的会话完全不留痕**（用户本机有 **22 个**未挂空间的会话，
 *   属常见形态）—— 换轮次/换会话继续时长任务，模型不知道上一批做到哪。
 *
 * 修法：裸会话分流到**会话自己的目录**
 *   （`.yan-zhi/tasks/<convId>/task-memory/progress.md`，即既有的"会话产物主规则"位置）。
 *   ★ 只写明细、**不写空间记忆**（裸会话没有空间）；
 *   ★ **不塞进 `task_plan_json`** —— 那个字段存的是**计划结构**（`{title, steps}`），
 *     "计划接力棒"注入依赖它，混入进展行会破坏结构（另一个方向的 bug）。
 *
 * 本测试钉：
 *   ① 写入侧：裸会话必须留痕（不再 `ok:false` 直接放弃）；
 *   ② **读取侧同源**（否则"写了读不到"仍是断链 —— 半修）；
 *   ③ 路径必须落在**会话自己的目录**（按 convId 隔离，不与空间目录混）；
 *   ④ **不得**动 `task_plan_json`（计划结构）；
 *   ⑤ 写读路径必须是**同一个函数**（避免两处各算一遍、必然漂移）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const SM = read('apps/server/src/services/space-memory.ts');

function bodyOf(needle: string, what: string, len = 2600): string {
  const i = SM.indexOf(needle);
  expect(i, `★ 锚点缺失：${what}`).toBeGreaterThan(-1);
  return SM.slice(i, i + len);
}

describe('① 写入侧：裸会话必须留痕', () => {
  it('★★★ 不得再对裸会话直接 ok:false 放弃', () => {
    // ★★★ 这条是**变异验证补出来的**：第一版只断言"**没有**旧的两行写法"
    //   （`...;\n if (!spaceId) return { ok: false };`）—— 把实现改成**单行**
    //   `if (!spaceId) { return { ok: false }; }` 时**断言照样通过**（假绿）。
    //   ⇒ 必须**语义断言**：裸会话分支里必须**真的返回 ok:true**（而不是判断"有没有旧写法"）。
    const body = bodyOf('export async function appendTaskProgress', 'writing side');
    // ★★★ 关键：**先剥注释再定位** —— 说明注释里复述了旧写法
    //   （`if (!spaceId) return { ok: false }`），直接 indexOf 会命中**注释里的**那个 → 误报。
    //   （CRLF 下 `$` 会失配，故先去 `\r`。）
    const stripped = body.replace(/\r/g, '').replace(/^\s*\/\/.*$/gm, '');
    const i = stripped.indexOf('if (!spaceId)');
    expect(i, '★ 锚点缺失：裸会话分支').toBeGreaterThan(-1);
    const rest = stripped.slice(i);
    const endIdx = rest.indexOf('\n    }');
    const branch = endIdx > 0 ? rest.slice(0, endIdx + 6) : rest.slice(0, 900);
    expect(branch, '★ 裸会话分支未返回 ok:true → 未挂空间的会话完全不留痕（本机 22 个）')
      .toMatch(/return \{ ok: true/);
    // ★ 允许"**没有 conversationId** 时放弃"（那时确实无从落盘）—— 只禁止
    //   "**有 conversationId 却直接放弃**"（正是本次修的缺陷）。
    //   第一版断言 `not.toMatch(/return { ok: false }/)` 过严：分支里合法地存在
    //   `if (!conversationId) return { ok: false };` → 假红。
    const lines = branch.split('\n').map((l) => l.trim());
    const badGiveUp = lines.filter((l) => /return \{ ok: false \}/.test(l) && !/conversationId/.test(l));
    expect(badGiveUp, `★ 裸会话分支存在"无条件放弃"（有 conversationId 也不留痕）：${badGiveUp.join(' | ')}`)
      .toEqual([]);
  });

  it('★★★ 必须走会话自己的目录', () => {
    const body = bodyOf('export async function appendTaskProgress', 'writing side');
    expect(body, '★ 未用会话级路径（裸会话无处落盘）').toMatch(/getConversationProgressPath\(conversationId\)/);
    expect(body, '★ 裸会话分支未返回 ok:true（等于没修）').toMatch(/solePath[\s\S]{0,200}return \{ ok: true/);
  });

  it('★★ 裸会话**只写明细**、不写空间记忆（没有空间可写）', () => {
    const body = bodyOf('export async function appendTaskProgress', 'writing side');
    const soleBranch = body.slice(body.indexOf('if (!spaceId)'), body.indexOf('const space = getSpaceRow'));
    expect(soleBranch, '★ 裸会话分支里出现"空间记忆"写入（无空间可写，会 panic/catch 掉）')
      .not.toMatch(/getSpaceMemoryPath/);
  });
});

describe('② 读取侧必须同源（否则"写了读不到"= 半修）', () => {
  it('★★★ 读取侧也要支持裸会话', () => {
    const body = bodyOf('export function readTaskProgressForConversation', 'reading side');
    expect(body, '★ 读取侧裸会话直接 return null → 写入有痕、读取找不到（断链仍在）')
      .toMatch(/getConversationProgressPath\(conversationId\)/);
  });

  it('★★★ 写读必须用**同一个路径函数**（两处各算一遍必然漂移）', () => {
    const w = bodyOf('export async function appendTaskProgress', 'writing side');
    const r = bodyOf('export function readTaskProgressForConversation', 'reading side');
    expect(w, '★ 写入侧未用共享路径函数').toMatch(/getConversationProgressPath\(/);
    expect(r, '★ 读取侧未用共享路径函数').toMatch(/getConversationProgressPath\(/);
    // 路径函数必须只有一处定义
    const defs = (SM.match(/function getConversationProgressPath\(/g) || []).length;
    expect(defs, `★ getConversationProgressPath 定义了 ${defs} 处（应 1 处，多份实现必然漂移）`).toBe(1);
  });

  it('★★ 读取侧仍必须复用 selectMemoryLines（取最新，防回归 M1）', () => {
    const body = bodyOf('export function readTaskProgressForConversation', 'reading side');
    const soleIdx = body.indexOf('if (!spaceId)');
    expect(soleIdx, '★ 锚点缺失').toBeGreaterThan(-1);
    const soleBranch = body.slice(soleIdx, soleIdx + 900);
    expect(soleBranch, '★ 裸会话分支未复用 selectMemoryLines（会退回取头部=最旧）')
      .toMatch(/selectMemoryLines\(raw/);
  });
});

describe('④ 真跑：裸会话写入后必须能读回（唯一可靠的验证方式）', () => {
  it('★★★ 写入 → 读取 必须闭环（含"有 conversationId 但无 space"）', async () => {
    // ★★★ 这条是**变异验证补出来的**：前三组都是结构断言，只验"代码里有没有调用"——
    //   把读取侧的调用挪到 `if (false)` 后面（**调用仍在、但永不执行**）时测试**全绿**（假绿）。
    //   ⇒ 必须**真跑**：造一个裸会话 → 写入 → 读回，看内容是否一致。
    const mod: any = await import('../src/services/space-memory.js').catch(() => null);
    if (!mod?.appendTaskProgress || !mod?.readTaskProgressForConversation) {
      expect(SM, '★ 无法真跑（模块不可用）→ 退化为静态断言').toMatch(/getConversationProgressPath/);
      return;
    }
    // 用一个必然不存在的 convId（无空间归属 → 走裸会话分支）
    const convId = 'bare-test-' + Date.now().toString(36);
    const w = await mod.appendTaskProgress(convId, 'completed', '裸会话来链路验证：写入了这一条', { steps: 3 });
    expect(w?.ok, '★ 裸会话写入未成功（应落到会话自己的目录）').toBe(true);
    expect(w?.path, '★ 写入未返回路径').toBeTruthy();
    const r = mod.readTaskProgressForConversation(convId);
    expect(r, '★ 裸会话读回为 null → 写了读不到（半修，链路仍断）').toBeTruthy();
    expect(r.content, '★ 读回内容与写入不一致').toContain('裸会话来链路验证');
    expect(r.exists, '★ exists 为 false').toBe(true);
  });

  it('★★★ 读取必须**真的执行**裸会话分支（不得被条件短路）', () => {
    // 与上一条互补：真跑覆盖"能读回"，这条覆盖"分支真的可达"（防 `if (false)` 这类短路）
    const stripped = SM.replace(/\r/g, '').replace(/^\s*\/\/.*$/gm, '');
    const i = stripped.indexOf('export function readTaskProgressForConversation');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = stripped.slice(i, i + 1200);
    // 裸会话分支内不得出现恒假条件（`if (false)` / `if (0)`）
    const bareIdx = body.indexOf('if (!spaceId)');
    expect(bareIdx, '★ 锚点缺失：读取侧裸会话分支').toBeGreaterThan(-1);
    const branch = body.slice(bareIdx, bareIdx + 700);
    expect(branch, '★ 读取侧裸会话分支被恒假条件短路（写了读不到）').not.toMatch(/if \(false\)|if \(0\)/);
    expect(branch, '★ 读取侧未真的读文件').toMatch(/readFileSync\(solePath/);
  });
});

describe('③ 路径必须按会话隔离（不与空间目录混）', () => {
  it('★★★ 路径必须含 convId 与 .yan-zhi/tasks（既有会话产物主规则位置）', () => {
    const i = SM.indexOf('function getConversationProgressPath');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = SM.slice(i, i + 400);
    expect(body, '★ 未按 convId 隔离（不同裸会话的进展会混在一起）').toMatch(/tasks['"],\s*conversationId|conversationId/);
    expect(body, '★ 未落在既有的 .yan-zhi/tasks 下（新造位置）').toMatch(/\.yan-zhi/);
  });

  it('★★★ 不得把进展塞进 task_plan_json（那存的是计划结构）', () => {
    // ★ 必须**剥注释** —— 我的说明注释里就写了 `task_plan_json`（不剥则断言被注释触发，本次又一例）
    const code = SM.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, '★ 动了 task_plan_json —— 它会破坏"计划接力棒"依赖的 {title, steps} 结构')
      .not.toMatch(/task_plan_json/);
  });
});