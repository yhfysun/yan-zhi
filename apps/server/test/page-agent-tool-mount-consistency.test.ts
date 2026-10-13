/**
 * pageAgent「三处一致性」守门测试（2026-10-13）。
 *
 * ★★★ 这个文件本该早就存在：`apps/server/src/db.ts:1128-1129` 的注释明确写着
 *   「守门测试见 apps/server/test/page-agent-tool-mount-consistency.test.ts」，
 *   但该文件**从来不存在**。于是这条铁律无人把守，漂移反复发生：
 *
 *   铁律（db.ts:1198-1200 原文）：「提示词推荐了却没挂 = 模型照提示词调用却撞
 *   '工具不存在'，是最常见的『白跑一轮 / 看起来卡住』来源。」
 *
 *   实测漂移三例：
 *   ① 提示词【站点经验自进化（重要）】要求用 api_experience_read/write，而子智能体
 *      工具面只补「记忆四件套」→ 作为子智能体被委派时必然撞空（2026-10-13 已修，
 *      见 llm-task-manager.ts 的 SUB_ALWAYS_API_TOOLS）。
 *   ② `apps/server/test/page-agent.test.ts` 里手抄了一份**过时清单**：含 36 个
 *      browser_* 且包含**根本不存在**的 `browser_get_a11y_tree`，同时缺
 *      browser_fill_form / browser_run_script / browser_get_page_content 等
 *      —— 文档里的「一致性」被这份抄件冒充成了"已覆盖"。
 *   ③ 前端副本 `packages/ui/src/stores/agent.ts` 的 PAGE_AGENT_BUILTIN_TOOLS
 *      与提示词描述都与服务端漂移。
 *
 * 本测试**从源码文本派生**两侧清单（不手抄），因此不会自己变成新的漂移源：
 *   A 提示词里提到的工具 ⊆ 挂载清单 ∪ 子智能体公共补充（防"推荐了却没挂"）
 *   B 挂载的 browser_* 都真实存在（在 browser/index.ts 里有声明，防"挂了却没实现"）
 *   C 前端副本的挂载清单与服务端逐项相同（防两端漂移）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..', '..'); // apps/server/test → 仓库根
const DB_SRC = path.join(ROOT, 'apps', 'server', 'src', 'db.ts');
const BROWSER_IMPL = path.join(ROOT, 'packages', 'core', 'src', 'tool', 'builtin', 'browser', 'index.ts');
const UI_AGENT_SRC = path.join(ROOT, 'packages', 'ui', 'src', 'stores', 'agent.ts');

/** 子智能体的公共 api_* 补充（llm-task-manager.ts 的 SUB_ALWAYS_API_TOOLS）——
 *  这些不在挂载清单里但确实可用，所以「提示词提到」不算漂移。 */
const SUB_AGENT_SUPPLEMENT = [
  'api_memory_search', 'api_memory_list', 'api_memory_create', 'api_memory_delete',
  'api_experience_read', 'api_experience_write',
];

function readOrFail(p: string): string {
  expect(fs.existsSync(p), `缺少源文件：${path.relative(ROOT, p)}`).toBe(true);
  return fs.readFileSync(p, 'utf8');
}

/** 取字符串字面量清单（跳过注释行，避免把注释里举例的工具名当成真实项） */
function parseStringList(body: string): string[] {
  const cleaned = body
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  return [...cleaned.matchAll(/'([A-Za-z0-9_]+)'/g)].map((x) => x[1]);
}

/** db.ts 里 PAGE_AGENT_BUILTIN_TOOLS 数组 */
function parseMountedTools(dbSrc: string): string[] {
  const m = dbSrc.match(/const PAGE_AGENT_BUILTIN_TOOLS = \[([\s\S]*?)\n\];/);
  expect(m, 'db.ts 里找不到 PAGE_AGENT_BUILTIN_TOOLS 数组（改名/改格式后本测试需同步）').toBeTruthy();
  return parseStringList((m as RegExpMatchArray)[1]);
}

/** db.ts 里 PAGE_AGENT_SYSTEM_PROMPT 模板字符串正文 */
function parsePrompt(dbSrc: string): string {
  const m = dbSrc.match(/const PAGE_AGENT_SYSTEM_PROMPT = `([\s\S]*?)`;/);
  expect(m, 'db.ts 里找不到 PAGE_AGENT_SYSTEM_PROMPT 模板字符串（改名/改格式后本测试需同步）').toBeTruthy();
  return (m as RegExpMatchArray)[1];
}

/** 提示词正文里出现的工具名（只认 browser_* / api_* 两个前缀，避免误抓正文里的普通词） */
function mentionedTools(prompt: string): string[] {
  return [...new Set([...prompt.matchAll(/\b((?:browser|api)_[a-z0-9_]+)\b/g)].map((x) => x[1]))];
}

/** browser/index.ts 里声明的工具名（每个工具类都有 name = 'browser_xxx'） */
function declaredBrowserTools(src: string): Set<string> {
  return new Set([...src.matchAll(/name\s*[:=]\s*'(browser_[a-z0-9_]+)'/g)].map((x) => x[1]));
}

/** packages/ui/src/stores/agent.ts 里的前端副本 */
function parseUiCopy(src: string): string[] {
  const m = src.match(/PAGE_AGENT_BUILTIN_TOOLS\s*=\s*\[([\s\S]*?)\n\];/);
  if (!m) return [];
  return parseStringList((m as RegExpMatchArray)[1]);
}

describe('pageAgent 三处一致性（守门）', () => {
  it('A. 提示词提到的工具，必须都在挂载清单或子智能体公共补充里', () => {
    const dbSrc = readOrFail(DB_SRC);
    const mounted = new Set(parseMountedTools(dbSrc));
    const allowed = new Set([...mounted, ...SUB_AGENT_SUPPLEMENT]);

    const dangling = mentionedTools(parsePrompt(dbSrc)).filter((t) => !allowed.has(t));
    expect(
      dangling,
      `提示词推荐了但没挂（模型调用会撞「工具不存在」）：${dangling.join(', ')}。` +
        `要么加进 PAGE_AGENT_BUILTIN_TOOLS / SUB_ALWAYS_API_TOOLS，要么从提示词里删掉。`,
    ).toEqual([]);
  });

  it('B. 挂载的 browser_* 都必须真实存在（防「挂了却没实现」）', () => {
    const mounted = parseMountedTools(readOrFail(DB_SRC));
    const declared = declaredBrowserTools(readOrFail(BROWSER_IMPL));

    const missing = mounted.filter((t) => t.startsWith('browser_') && !declared.has(t));
    expect(
      missing,
      `挂载清单里有 browser/index.ts 未声明的工具：${missing.join(', ')}（调用必然失败）`,
    ).toEqual([]);
  });

  it('C. 前端副本的挂载清单必须与服务端逐项一致', () => {
    const server = parseMountedTools(readOrFail(DB_SRC));
    const ui = parseUiCopy(readOrFail(UI_AGENT_SRC));

    expect(ui.length, '前端 agent.ts 里没解析到 PAGE_AGENT_BUILTIN_TOOLS（改名后本测试需同步）').toBeGreaterThan(0);
    expect([...new Set(ui)].sort()).toEqual([...new Set(server)].sort());
  });

  it('D. 两处提示词模板串必须完整（防「正文里出现反引号把模板提前截断」）', () => {
    // ★ 2026-10-13 真实事故：给 agent.ts 的 systemPrompt 补文案时在正文里写了
    //   `PAGE_AGENT_BUILTIN_TOOLS`（带反引号）→ 模板串提前闭合 → vite/esbuild 直接
    //   "Expected \"}\" but found ..." 构建失败，整个前端起不来。
    //   这是本仓已知雷区（db.ts:1200 与 task-mode-agent-binding.test.ts:157-163 都写过），
    //   但只在**运行时**炸，任何"两个清单是否相等"的断言都拦不住。
    //   判据：模板串尾部的小节必须在**截取到的正文**里出现 —— 一旦提前闭合，尾部小节
    //   就跑到字符串外面去了，这里必然取不到。
    const dbPrompt = parsePrompt(readOrFail(DB_SRC));
    for (const tail of ['【防循环硬约束】', '终止条件', 'browser_get_visible_text']) {
      expect(dbPrompt.includes(tail), `db.ts 的 PAGE_AGENT_SYSTEM_PROMPT 里找不到尾部小节「${tail}」= 模板串疑似被提前截断`).toBe(true);
    }
    expect(dbPrompt.includes('`'), 'db.ts 提示词正文里出现了反引号（模板串会被截断）').toBe(false);

    // 前端副本：agent.ts 里有多个智能体的 systemPrompt，必须锚定 pageAgent 那句开头，
    //   否则非贪婪匹配会抓到本文件里**第一个** systemPrompt（别的智能体）而误判。
    const uiSrc = readOrFail(UI_AGENT_SRC);
    const m = uiSrc.match(/systemPrompt:\s*`(你是一个浏览器自动化助手[\s\S]*?)`/);
    expect(m, 'agent.ts 里找不到 pageAgent 的 systemPrompt 模板串').toBeTruthy();
    const uiPrompt = (m as RegExpMatchArray)[1];
    expect(
      uiPrompt.includes('【防循环硬约束】'),
      'agent.ts 的 systemPrompt 里找不到尾部小节「【防循环硬约束】」= 模板串疑似被提前截断（vite 会直接构建失败）',
    ).toBe(true);
    expect(uiPrompt.includes('`'), 'agent.ts 提示词正文里出现了反引号（模板串会被截断）').toBe(false);
  });
});