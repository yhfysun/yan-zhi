/**
 * 模型管理弹窗（PlatformDetail）的搜索 / 分类筛选
 *
 * 背景（用户实报 2026-10-12）：
 *   「管理模型 - 百炼大模型」弹窗里模型一多就没法找，原话"这种管理页面啊很难用啊没有搜索分类"。
 *
 * ★ 为什么分两段测（而不是只测纯函数）：
 *   ① **纯函数真跑**（utils/modelFilter.ts）：过滤是"作用在哪个对象上"的判定，
 *      错了不报错、只是筛错/筛不出 —— 必须真跑才能证伪。
 *   ② **组件接线静态断言**：纯函数对了，宿主 .vue 仍可能压根没调用它
 *      （写了 helper 却忘了把 v-for 从 models 换成 filteredModels ⇒ UI 全量显示，
 *      这正是"断言存在 ≠ 断言生效"的典型）。这层只能读源码断言。
 *   PlatformDetail 依赖 vue-router + pinia，vitest(node) 下无法直接挂载，
 *   故采用与 views/clipWorkbench.test.ts 一致的"读源码结构断言"范式。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  filterModels,
  matchesModelKeyword,
  modelTypeOf,
  modelTypeOptions,
  isFilterActive,
} from './modelFilter';

const here = path.dirname(fileURLToPath(import.meta.url));
const VUE_FILE = path.resolve(here, '../views/PlatformDetail.vue');
const SRC = readFileSync(VUE_FILE, 'utf8');
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '');

/** 夹具：覆盖大小写、空 description、缺 type、以及非 llm 类型 */
const MODELS = [
  { id: 'm1', modelId: 'qwen3.8-omni-flash-realtime', alias: '通义实时语音', type: 'llm', description: '实时语音对话' },
  { id: 'm2', modelId: 'stepfun/step-5-preview', alias: '', type: 'llm', description: '' },
  { id: 'm3', modelId: 'text-embedding-v3', alias: '向量', type: 'embedding', description: '文本向量' },
  { id: 'm4', modelId: 'cosyvoice-v2', alias: 'CosyVoice', type: 'tts', description: '语音合成' },
  // 历史脏数据：没有 type 字段，必须按 llm 归类而不是被类型筛选漏掉
  { id: 'm5', modelId: 'legacy-model', alias: '老模型', description: '' },
];

const ids = (list: Array<{ id: string }>) => list.map((m) => m.id);

describe('modelFilter · 关键字搜索', () => {
  it('空关键字返回全部（不筛掉任何东西）', () => {
    expect(ids(filterModels(MODELS, { keyword: '' }))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    // 纯空白也要视作"没输"——否则用户输入空格会看到列表凭空清空
    expect(ids(filterModels(MODELS, { keyword: '   ' }))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(ids(filterModels(MODELS))).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('命中 modelId / alias / description 三个字段任一即算命中', () => {
    expect(ids(filterModels(MODELS, { keyword: 'qwen' }))).toEqual(['m1']); // modelId
    expect(ids(filterModels(MODELS, { keyword: 'step-5' }))).toEqual(['m2']); // modelId 含斜杠
    expect(ids(filterModels(MODELS, { keyword: '向量' }))).toEqual(['m3']); // alias
    expect(ids(filterModels(MODELS, { keyword: '语音合成' }))).toEqual(['m4']); // description
  });

  it('大小写不敏感（用户习惯小写搜大写 ID）', () => {
    expect(ids(filterModels(MODELS, { keyword: 'QWEN' }))).toEqual(['m1']);
    expect(ids(filterModels(MODELS, { keyword: 'Cosy' }))).toEqual(['m4']);
  });

  it('不命中时返回空数组（前端据此显示"没有匹配的模型"，不是崩）', () => {
    expect(filterModels(MODELS, { keyword: '不存在的模型xyz' })).toEqual([]);
  });

  it('空字段不会误命中（undefined/null 不当作字符串 "undefined"）', () => {
    // ★ 这条是真实会踩的坑：`(m.alias || '')` 漏写时，搜 "undefined" 会把所有空别名模型都命中
    expect(matchesModelKeyword({ modelId: 'a', alias: null, description: undefined }, 'undefined')).toBe(false);
    expect(matchesModelKeyword({ modelId: 'a', alias: null, description: undefined }, 'a')).toBe(true);
  });
});

describe('modelFilter · 分类（类型）筛选', () => {
  it('空类型 = 全部类型', () => {
    expect(ids(filterModels(MODELS, { type: '' }))).toHaveLength(5);
    expect(ids(filterModels(MODELS, {}))).toHaveLength(5);
  });

  it('按类型精确筛选', () => {
    expect(ids(filterModels(MODELS, { type: 'embedding' }))).toEqual(['m3']);
    expect(ids(filterModels(MODELS, { type: 'tts' }))).toEqual(['m4']);
    expect(ids(filterModels(MODELS, { type: 'llm' }))).toEqual(['m1', 'm2', 'm5']);
  });

  it('缺 type 的历史模型按 llm 归类，不会被任何类型筛选漏掉', () => {
    expect(modelTypeOf({ modelId: 'x' })).toBe('llm');
    expect(ids(filterModels(MODELS, { type: 'llm' }))).toContain('m5');
  });

  it('类型 + 关键字是 AND：两个条件都要满足', () => {
    // '语音' 同时出现在 m1 的 description 与 m4 的 alias/description 里 —— 类型一筛就只剩 m4
    expect(ids(filterModels(MODELS, { keyword: '语音', type: 'tts' }))).toEqual(['m4']);
    // 关键字命中的是 llm 模型，但类型选了 embedding ⇒ 交集为空
    expect(filterModels(MODELS, { keyword: 'qwen', type: 'embedding' })).toEqual([]);
  });

  it('类型下拉只列真实出现过的类型（不列零项），且有中文标签', () => {
    const opts = modelTypeOptions(MODELS);
    expect(opts.map((o) => o.value).sort()).toEqual(['embedding', 'llm', 'tts']);
    expect(opts.find((o) => o.value === 'embedding')?.label).toBe('Embedding');
    expect(opts.find((o) => o.value === 'tts')?.label).toBe('语音合成(TTS)');
  });
});

describe('modelFilter · 筛选态（决定计数与重置按钮）', () => {
  it('默认无筛选态', () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ keyword: '', type: '' })).toBe(false);
    expect(isFilterActive({ keyword: '  ' })).toBe(false); // 纯空白不算激活
  });

  it('有任一条件即激活', () => {
    expect(isFilterActive({ keyword: 'qwen' })).toBe(true);
    expect(isFilterActive({ type: 'llm' })).toBe(true);
  });

  it('不修改入参（computed 重算时不能污染 store 里的数组）', () => {
    const input = [...MODELS];
    filterModels(input, { keyword: 'qwen', type: 'llm' });
    expect(input).toEqual(MODELS);
    expect(input).toHaveLength(5);
  });
});

describe('PlatformDetail.vue · 筛选条接线（静态断言：代码存在 ≠ 已生效）', () => {
  it('★ 卡片列表必须遍历 filteredModels，而不是全量 models', () => {
    // 只定义 computed 却忘了换 v-for ⇒ 筛选条形同虚设，这一步就是防这个
    expect(CODE).toMatch(/v-for="m in filteredModels"/);
    expect(CODE).not.toMatch(/v-for="m in models"/);
  });

  it('★ filteredModels 必须接 utils/modelFilter 的 filterModels（唯一实现）', () => {
    expect(CODE).toMatch(/import \{[^}]*filterModels[^}]*\} from '\.\.\/utils\/modelFilter'/);
    expect(CODE).toMatch(/filterModels\(models\.value,\s*\{\s*keyword:\s*modelKeyword\.value,\s*type:\s*modelTypeFilter\.value\s*\}\)/);
  });

  it('搜索框绑 modelKeyword，类型下拉绑 modelTypeFilter', () => {
    // 统一走项目标准 SearchToolbar（v-model:query），不自造输入框
    expect(CODE).toMatch(/<SearchToolbar[\s\S]*?v-model:query="modelKeyword"/);
    expect(CODE).toMatch(/v-model="modelTypeFilter"/);
    // 类型下拉选项来自 modelTypeOptions（含"全部类型"空值项），由 buildModelTypeOptions 构建
    expect(CODE).toMatch(/v-for="t in modelTypeOptions"/);
    expect(CODE).toMatch(/buildModelTypeOptions\(models\.value\)/);
  });

  it('搜索条常驻渲染（不能挂在 v-if 折叠态里，否则"条件在、面板不在"）', () => {
    expect(CODE).toMatch(/<SearchToolbar[\s\S]*?placeholder="搜索模型/);
    // 不能只给个提示文字而不渲染控件
    expect(CODE).not.toMatch(/<SearchToolbar[^>]*v-if=/);
  });

  it('「重置」同时清空两个条件', () => {
    const fn = CODE.match(/function clearModelFilter\(\)\s*\{([\s\S]*?)\}/);
    expect(fn).toBeTruthy();
    expect(fn![1]).toMatch(/modelKeyword\.value = '';/);
    expect(fn![1]).toMatch(/modelTypeFilter\.value = '';/);
  });

  it('无匹配时给空态，而不是留下一个空白面板', () => {
    expect(CODE).toMatch(/v-else-if="filteredModels\.length === 0"/);
  });

  it('搜索条复用项目标准组件，不另起一套输入框样式', () => {
    // 复用 components/common/SearchToolbar.vue：全项目管理页同一套观感与行为
    expect(CODE).toMatch(/import SearchToolbar from '\.\.\/components\/common\/SearchToolbar\.vue'/);
    // 列表仍是 grid 卡片区（筛选条在上、卡片在下，不整页滚动）
    expect(SRC).toMatch(/\.model-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fill/);
  });
});
