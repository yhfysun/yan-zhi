/**
 * 模型下拉「候选池合并后必须去重」—— 守门测试（2026-10-14，用户报 Vue 警告）。
 *
 * 用户原话：「[Vue warn] Duplicate keys found during update: "3c8f3e1d-…" … 这些警告处理下啊为啥有啊」
 *
 * 根因（已用运行中实例的库核过）：
 *   `matchesModelSlot` 里 llm 的判据是「type=llm 且**不含** image/video 能力」、vision 的判据是
 *   「type=llm 且**含** vision 能力」—— 两者交集非空，一个带 vision 能力的对话模型**同时命中两个槽位**。
 *   实测库（%APPDATA%/yan-zhi/server-data/data.db）：
 *     model      3c8f3e1d-… → deepseek-v4.1-flash, type='llm', capabilities=["vision",…]
 *     平台池     {"llm":[…,"3c8f3e1d-…"], "vision":["3c8f3e1d-…",…]}
 *   后端 resolvePool 按**槽位**各自解析（这是对的，failover 链要分槽位），
 *   前端 ChatInputArea 把 llm+vision 两池合成**一条**选择器列表 → 同一模型出现两次：
 *     · 下拉里两个一模一样的条目；
 *     · `:key="m.id"` 撞重复 key → 警告刷屏，且列表更新会复用错节点。
 *   未配池时同样会撞：auto 兜底按槽位各筛一遍，视觉模型两边都进（零配置用户也见这个警告）。
 *
 * ★ 判据一律"读源码剥注释后再断言"—— 注释里出现同一个词会让断言假红/假绿（见 modelPopoverScroll.test.ts）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_SRC = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(UI_SRC, p), 'utf8');

/** 剥注释：整行注释与块注释，保留行尾注释所在行的代码 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '')
   .replace(/<!--[\s\S]*?-->/g, ' ');

const CODE = strip(read('components/chat/ChatInputArea.vue'));

/** 取函数体：从锚点起到下一个顶层 `}` 行（缩进为 0 的 `}` 收口） */
function bodyOf(src: string, startAnchor: string): string {
  const start = src.indexOf(startAnchor);
  expect(start, `★ 找不到锚点: ${startAnchor}`).toBeGreaterThan(-1);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end > 0 ? end : undefined);
}

describe('① 候选池合并后按 modelId 去重', () => {
  const fn = bodyOf(CODE, 'async function loadPoolForAgent');

  it('★ 合并 llm+vision 之后必须去重（否则同一模型两个条目 + 重复 :key）', () => {
    // 去重判据：一个 Set 收集已见 modelId，命中则丢弃
    expect(fn, '★ 缺少按 modelId 去重（seen Set）').toMatch(/new Set<string>\(\)/);
    expect(fn, '★ 缺少"已见即丢弃"判据').toMatch(/seen\.has\(e\.modelId\)/);
    expect(fn, '★ 缺少登记已见 modelId').toMatch(/seen\.add\(e\.modelId\)/);
  });

  it('★ 去重必须作用在 llm/vision 合并结果上，而不是只看单个池', () => {
    // 单池内部后端已 sanitizeIds 去重；跨槽位的重复只有合并后才看得见
    const visIdx = fn.indexOf('effective.vision');
    const dedupeIdx = fn.indexOf('new Set<string>()');
    expect(fn.indexOf('effective.llm'), '★ 找不到 llm 池合并').toBeGreaterThan(-1);
    expect(visIdx, '★ 找不到 vision 池合并').toBeGreaterThan(-1);
    expect(dedupeIdx, '★ 去重写在合并之前 → 看不见跨槽位重复').toBeGreaterThan(visIdx);
  });

  it('去重保序（留首个）——下拉顺序仍是 llm 池在前', () => {
    // `filter` + 首个登记即保留，天然保序；断言用的是 filter 而非 Set-from-array 之类的重排写法
    expect(fn).toMatch(/poolEntries\.value\s*=\s*merged\.filter\(/);
  });
});

describe('② 渲染键唯一性依据', () => {
  it('模型项 :key 用 m.id —— 去重的目标就是这个键', () => {
    expect(CODE).toMatch(/:key="m\.id"/);
  });

  it('候选池数据源只经 dropdownModelGroups / filteredModelGroups（都出自同一去重后的池）', () => {
    const uses = (CODE.match(/in (dropdownModelGroups|filteredModelGroups)/g) || []).length;
    expect(uses, '★ 下拉数据源数量变了 → 需重新核对去重是否覆盖新入口').toBeGreaterThanOrEqual(2);
  });
});