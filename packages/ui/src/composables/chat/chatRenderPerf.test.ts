// 卡片顿修复的源码守门测试（2026-10-11）—— 防「热函数退回 O(n) 全表扫描」回归。
//
// 背景（用户实报）：「最近运行的任务报错啊啊，而且页面很卡根本滚动不了」+「停掉任务就不卡了」
//
// 根因：任务流式期间每 50ms flush 一次 → `messageRounds` 重算（返回全新对象引用）
//   → 整棵消息列表重渲 → 模板里的**函数调用**（`getToolResult`/`isToolError` 等）
//   每帧重新执行；而这些函数内部是 `store.currentMessages.find(...)`（O(n) 全表扫描）
//   + `JSON.parse` ⇒ 每帧数百次 find + 数千次 parse ⇒ 主线程占死。
//   第二主因：`ChatMessageList.vue` 本地 `renderAssistantMarkdown` 的**正则预处理**
//   不受 markdown LRU 缓存保护，每帧对 15.8KB 正文重跑 4 次贪婪正则。
//
// 修法：① `useChat` 加 `toolResultIndex` computed（一次遍历建索引），热函数 O(1) 查表；
//       ② `renderAssistantMarkdown` 移入 useChat 并整体接入 LRU 缓存；
//       ③ 解析规则抽到 `utils/tool-result.ts` 纯函数（可单测，避免平行实现）。
//
// 本测试扫源码钉死上述三条 —— 若有人把热函数改回 find()，这里立刻红。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// __dirname = packages/ui/src/composables/chat → 上溯 5 层到 repo 根
const REPO = resolve(__dirname, '../../../../..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '').replace(/<!--[\s\S]*?-->/g, '');

const USE_CHAT = strip(read('packages/ui/src/composables/chat/useChat.ts'));
const MSG_LIST_RAW = read('packages/ui/src/components/chat/ChatMessageList.vue');
const MSG_LIST = strip(MSG_LIST_RAW);

/** 提取某个函数体的文本：从签名处找到**函数体起始的 `{`**（跳过参数/返回类型注解里的花括号），
 *  再括号配平截取到函数体结束。 */
function fnBody(src: string, signature: string): string {
  const i = src.indexOf(signature);
  if (i < 0) return '';
  // 先找到签名的右括号 ')' —— 它之前的花括号属于类型/参数，不算函数体
  const paren = src.indexOf(')', i);
  if (paren < 0) return '';
  // 右括号之后第一个 '{' 才是函数体（如 `): {a:string} {` → 取最后那个）
  const start = src.indexOf('{', src.indexOf('{', paren) === paren ? paren : paren);
  if (start < 0) return '';
  // 更稳：从 paren 起，找**第一个 '{' 且其后不会立刻 ':' 的** —— 简化：从 paren 起逐字符找配平起点，
  // 即 ': ... {' 形式里跳过类型对象。做法：从 paren 后扫描，遇到第一个 '{' 后做配平；
  // 但若是返回类型对象（形如 `): { x: T } {`），配平会提前结束 —— 用一个启发式：
  // 找 paren 之后所有 '{'，取那个「配平后其后的非空白字符是 '{' 或行尾」的。
  const candidates: number[] = [];
  for (let k = paren; k < src.length; k++) if (src[k] === '{') candidates.push(k);
  for (const cs of candidates) {
    let depth = 0;
    for (let j = cs; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) {
          // 该 '{' 配平结束；若其后（跳过空白）紧跟 '{'，说明这是返回类型标注，继续下一个候选
          const after = src.slice(j + 1);
          if (/^\s*\{/.test(after)) break; // 是标注 → 试下一个候选
          return src.slice(i, j + 1);
        }
      }
    }
  }
  return '';
}

describe('① getToolResult / isToolError 不得再全表扫描 + JSON.parse', () => {
  it('★★★ getToolResult 只查索引（O(1)），禁止出现 currentMessages.find', () => {
    const body = fnBody(USE_CHAT, 'function getToolResult(');
    expect(body, '未找到 getToolResult 函数体').toBeTruthy();
    expect(body, '★ getToolResult 仍在对 currentMessages 做 find —— 卡顿会回归')
      .not.toMatch(/currentMessages\s*\.\s*find/);
    expect(body, '★ getToolResult 不再查 toolResultIndex').toMatch(/toolResultIndex/);
    expect(body, '★ getToolResult 不应再自己 JSON.parse').not.toMatch(/JSON\.parse/);
  });

  it('★★★ isToolError 只查索引（O(1)），禁止 find + JSON.parse', () => {
    const body = fnBody(USE_CHAT, 'function isToolError(');
    expect(body, '未找到 isToolError 函数体').toBeTruthy();
    expect(body).not.toMatch(/currentMessages\s*\.\s*find/);
    expect(body).toMatch(/toolResultIndex/);
    expect(body).not.toMatch(/JSON\.parse/);
  });

  it('★★ toolResultIndex 存在且由纯函数 buildToolResultIndex 构建', () => {
    expect(USE_CHAT).toMatch(/const\s+toolResultIndex\s*=\s*computed/);
    expect(USE_CHAT).toMatch(/buildToolResultIndex\s*\(/);
  });

  it('★ toolResultIndex 与 messageRounds 同源（都依赖 store.currentMessages）', () => {
    const idxBlock = fnBody(USE_CHAT, 'const toolResultIndex = computed');
    // computed 内通过 buildToolResultIndex(store.currentMessages) 取数 ⇒ 同源
    expect(idxBlock + USE_CHAT).toMatch(/buildToolResultIndex\(\s*store\.currentMessages\s*\)/);
  });
});

describe('② renderAssistantMarkdown 的正则预处理必须被缓存', () => {
  it('★★★ 实现移入 useChat 并带 LRU 缓存（assistantMdCache）', () => {
    const body = fnBody(USE_CHAT, 'function renderAssistantMarkdown(');
    expect(body, '未找到 useChat 的 renderAssistantMarkdown').toBeTruthy();
    expect(body, '★ 未接入缓存').toMatch(/assistantMdCache/);
    expect(body, '★ 缺少缓存命中短路').toMatch(/assistantMdCache\.get\(/);
    expect(body, '★ 缺少缓存写入').toMatch(/assistantMdCache\.set\(/);
  });

  it('★★★ ChatMessageList.vue 不得再有本地 renderAssistantMarkdown 定义', () => {
    expect(MSG_LIST, '★ 组件又出现了本地 renderAssistantMarkdown 定义 —— 正则预处理会重新不受缓存保护')
      .not.toMatch(/function\s+renderAssistantMarkdown\s*\(/);
  });

  it('★ ChatMessageList.vue 从 useChat 导入 renderAssistantMarkdown', () => {
    expect(MSG_LIST).toMatch(/renderAssistantMarkdown/);
    // 解构导入区出现（与 renderMarkdown 同列）
    expect(MSG_LIST).toMatch(/renderMarkdown,\s*renderAssistantMarkdown,/);
  });

  it('★ useChat 导出 renderAssistantMarkdown', () => {
    expect(USE_CHAT).toMatch(/renderMarkdown,\s*renderAssistantMarkdown,/);
  });
});

describe('③ 解析规则单一真相源（utils/tool-result.ts）', () => {
  it('★ 热函数路径（getToolResult/isToolError）不再自己写解析分支', () => {
    const g = fnBody(USE_CHAT, 'function getToolResult(');
    const e = fnBody(USE_CHAT, 'function isToolError(');
    for (const b of [g, e]) {
      expect(b).not.toMatch(/parsed\?\.isError\s*\)\s*return\s+JSON\.stringify/);
    }
  });

  it('★ 纯函数模块被导入', () => {
    expect(USE_CHAT).toMatch(/from\s+['"]\.\.\/\.\.\/utils\/tool-result['"]/);
  });

  it('★ 保留的 getToolResultUncached 仅作对照，且不在模板调用路径（组件不引用它）', () => {
    expect(USE_CHAT).toMatch(/function\s+getToolResultUncached\s*\(/);
    expect(MSG_LIST, '组件不应引用 Uncached 版').not.toMatch(/getToolResultUncached/);
  });
});

describe('④ P1 纯函数缓存（resolveToolDisplay / resolveToolArgs / toolTargetHint）', () => {
  it('★★★ resolveToolDisplay 用 WeakMap 缓存，且带 servers 引用比对（防 MCP 改名后脏读）', () => {
    const body = fnBody(USE_CHAT, 'function resolveToolDisplay(');
    expect(body, '未找到 resolveToolDisplay').toBeTruthy();
    expect(body, '★ 未使用 WeakMap 缓存').toMatch(/toolDisplayCache/);
    expect(body, '★ 缓存未比对 servers 引用 —— MCP 改名/新增后会显示脏数据')
      .toMatch(/hit\.servers\s*===\s*servers/);
    // 原逻辑必须保留（未删功能）
    expect(USE_CHAT).toMatch(/function\s+resolveToolDisplayUncached\s*\(/);
  });

  it('★★ resolveToolArgs 用 WeakMap 缓存', () => {
    const body = fnBody(USE_CHAT, 'function resolveToolArgs(');
    expect(body).toBeTruthy();
    expect(body).toMatch(/toolArgsCache/);
    expect(body).toMatch(/toolArgsCache\.get\(/);
    expect(body).toMatch(/toolArgsCache\.set\(/);
  });

  it('★★ toolTargetHint 用 WeakMap 缓存', () => {
    const body = fnBody(USE_CHAT, 'function toolTargetHint(');
    expect(body).toBeTruthy();
    expect(body).toMatch(/toolTargetHintCache/);
  });

  it('★ 缓存 key 必须是对象（WeakMap 约束）—— 对非对象 tc 要跳过缓存读写', () => {
    for (const sig of ['function resolveToolArgs(', 'function toolTargetHint(']) {
      const body = fnBody(USE_CHAT, sig);
      expect(body, `${sig} 缺少 typeof tc === 'object' 守卫（WeakMap 只接受对象 key）`)
        .toMatch(/typeof\s+tc\s*===\s*['"]object['"]/);
    }
  });
});

