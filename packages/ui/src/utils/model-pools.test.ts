/**
 * 模型候选池：前端分组口径 + 元数据唯一实现（model-candidate-pools P4 收口）。
 *
 * 背景（用户实报 2026-10-13）：
 *   「？？？平台级别的设置不了？进入管理按钮没用啊。。。」+「设置页面都有问题了？」
 *   —— 截图表现为**候选池下拉全空**、提示文字与「保存候选池」挤在一行。
 *
 * 两个真实根因（都已修）：
 *   ① **数据源错**：候选池选项原先取自 `platformStore.models`，而 `loadModels(pid)`
 *      会**整体替换**这份共享缓存为单平台清单（设置页切平台 / 平台详情页进详情都会触发）
 *      ⇒ 候选池要跨所有平台选，却被喂了单平台（甚至为空）的清单 ⇒ 下拉全空。
 *      正解：候选池走 `useModelPoolStore.allModels` 自己的独立全量清单。
 *   ② **口径漂移**：四个视图各写一份「按槽位过滤」与 `POOL_LABELS`
 *      （设置页漏了平台 `llm_enabled` 过滤；智能体编辑漏了 `visible` 过滤；
 *       智能体编辑的 label 带「候选」后缀 → 80px 下折行 + placeholder 出现「视觉候选 候选」）。
 *      正解：收口到本文件 = 唯一实现。
 *
 * ★ 为什么分两段测：
 *   ① 纯函数真跑（本文件）：过滤是"作用在哪个对象上"的判定，错了不报错、只是筛空 —— 必须真跑。
 *   ② 组件接线静态断言：纯函数对了，宿主 .vue 仍可能没用它（写了 helper 没人调 = 摆设）。
 *      Settings/Models/PlatformDetail/AgentEditDialog 依赖 pinia/vue-router，vitest(node) 下
 *      无法直接挂载，故采用与 views/modelFilter.test.ts 一致的"读源码结构断言"范式。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  POOL_SLOTS,
  POOL_LABELS,
  isEffectiveModel,
  groupModelsForSlot,
  flatModelsForSlot,
} from './model-pools';
import type { Model, Platform } from '@yan-zhi/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
const UI_SRC = path.resolve(here, '..');
/** 剥注释：只剥整行注释与块注释，保留行尾注释所在行的代码（见 TESTING-NOTES） */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
const read = (rel: string) => strip(readFileSync(path.join(UI_SRC, rel), 'utf8'));

// ---------- 夹具 ----------
const P = (id: string, name: string, llmEnabled?: boolean): Platform => ({
  id, name, protocol: 'openai', apiUrl: 'https://x', apiKeyEnc: '',
  status: 'healthy', llmEnabled, createdAt: 0,
});
const M = (o: Partial<Model> & { id: string; platformId: string }): Model => ({
  modelId: o.id, type: 'llm', contextWindow: null, enabled: true, isDefault: false, ...o,
} as Model);

const PLATFORMS = [
  P('p1', '平台一'),
  P('p2', '平台二'),
  P('p3', '已关闭LLM调用', false), // llm_enabled=false → 平台下模型对候选池不可见
];

const MODELS = [
  // llm 槽位：普通 llm（纯文本）
  M({ id: 'a-plain', platformId: 'p1', type: 'llm' }),
  // vision 槽位：llm + vision 能力（视作 llm 但有媒体能力 → **不进** llm 槽，见 matchesModelSlot）
  M({ id: 'b-vision', platformId: 'p1', type: 'llm', capabilities: ['vision'] }),
  // image 槽位
  M({ id: 'c-image', platformId: 'p2', type: 'image', capabilities: ['image'] }),
  // video 槽位
  M({ id: 'd-video', platformId: 'p2', type: 'video', capabilities: ['video'] }),
  // 各种应被排除的
  M({ id: 'e-disabled', platformId: 'p1', type: 'llm', enabled: false }),
  M({ id: 'f-hidden', platformId: 'p1', type: 'llm', visible: false }),
  M({ id: 'g-platform-off', platformId: 'p3', type: 'llm' }),
  M({ id: 'h-embedding', platformId: 'p2', type: 'embedding' }),
];

const llmEnabled = (p: Platform) => p.llmEnabled !== false;
const enabledOf = new Map(PLATFORMS.map((p) => [p.id, llmEnabled(p)]));

describe('POOL_SLOTS / POOL_LABELS · 元数据唯一实现', () => {
  it('槽位顺序固定 llm → vision → image → video（顺序即语义：后端回退链按它遍历）', () => {
    expect([...POOL_SLOTS]).toEqual(['llm', 'vision', 'image', 'video']);
  });

  it('★ 槽位短名必须短 —— 「智能体编辑」弹窗 label-width 仅 80px', () => {
    // 反例：曾用「生视频候选」（5 字）→ 80px 下折成两行，且 placeholder 拼出「视觉候选 候选」
    for (const slot of POOL_SLOTS) {
      const label = POOL_LABELS[slot];
      expect(label.length, `${slot} 的槽位名过长会折行`).toBeLessThanOrEqual(3);
      expect(label).not.toMatch(/候选/); // 后缀由 placeholder 负责，避免重复
    }
    expect(POOL_LABELS.video).toBe('生视频');
  });

  it('★ 四个视图都从 utils/model-pools 取 POOL_LABELS，不得再有本地副本', () => {
    for (const f of [
      'views/Settings.vue', 'views/Models.vue', 'views/PlatformDetail.vue',
      'components/AgentEditDialog.vue',
    ]) {
      const src = read(f);
      expect(src, `${f} 未从 utils/model-pools 导入 POOL_LABELS`).toMatch(
        /import\s*\{[^}]*POOL_LABELS[^}]*\}\s*from\s*['"][^'"]*utils\/model-pools['"]/,
      );
      // 本地再写一份 Record 定义 = 漂移源头（这正是修复前的病根）
      expect(src, `${f} 仍存在本地 POOL_LABELS 定义`).not.toMatch(
        /const\s+POOL_LABELS\s*[:=]/,
      );
    }
  });
});

describe('isEffectiveModel · 生效模型口径（须与后端 loadEffectiveModels 一致）', () => {
  it('enabled + visible + 平台 llm_enabled 同时满足才生效', () => {
    expect(isEffectiveModel(MODELS[0], (pid) => enabledOf.get(pid) !== false)).toBe(true);
    expect(isEffectiveModel(MODELS[4], (pid) => enabledOf.get(pid) !== false), 'enabled=false').toBe(false);
    expect(isEffectiveModel(MODELS[5], (pid) => enabledOf.get(pid) !== false), 'visible=false').toBe(false);
    expect(isEffectiveModel(MODELS[6], (pid) => enabledOf.get(pid) !== false), '平台 llm_enabled=false').toBe(false);
  });

  it('visible 未声明（undefined/null）视为可见 —— 存量数据多为缺列', () => {
    const m = M({ id: 'x', platformId: 'p1', type: 'llm' });
    delete (m as any).visible;
    expect(isEffectiveModel(m, () => true)).toBe(true);
  });
});

describe('groupModelsForSlot · 按槽位分组（跨平台）', () => {
  it('llm 槽：收 llm 类型且无「媒体」能力者；vision 不是媒体能力 ⇒ 视觉模型同时在 llm 槽', () => {
    // ★ 槽位**可重叠**是有意为之（与后端 matchesSlot 同源）：
    //   `matchesModelSlot` 里 hasMedia 只看 image/video，vision 模型既能当视觉模型、
    //   也能当普通对话模型 —— 若强行互斥，「视觉候选」配了模型后普通对话就没模型可用。
    const groups = groupModelsForSlot(MODELS, PLATFORMS, 'llm');
    const ids = groups.flatMap((g) => g.models.map((m) => m.id));
    expect(ids).toEqual(['a-plain', 'b-vision']);
  });

  it('vision 槽：收 llm + vision 能力', () => {
    const ids = groupModelsForSlot(MODELS, PLATFORMS, 'vision').flatMap((g) => g.models.map((m) => m.id));
    expect(ids).toEqual(['b-vision']);
  });

  it('image / video 槽：按 type 或能力命中', () => {
    expect(groupModelsForSlot(MODELS, PLATFORMS, 'image').flatMap((g) => g.models.map((m) => m.id))).toEqual(['c-image']);
    expect(groupModelsForSlot(MODELS, PLATFORMS, 'video').flatMap((g) => g.models.map((m) => m.id))).toEqual(['d-video']);
  });

  it('★ 分组保留平台归属与平台名（跨平台时下拉要按平台分组显示）', () => {
    const groups = groupModelsForSlot(MODELS, PLATFORMS, 'image');
    expect(groups[0].platformId).toBe('p2');
    expect(groups[0].platformName).toBe('平台二');
  });

  it('★ 传入 platformId 时只列该平台模型（平台级候选池的边界）', () => {
    const ids = flatModelsForSlot(MODELS, PLATFORMS, 'llm', 'p1').map((m) => m.id);
    expect(ids).toEqual(['a-plain', 'b-vision']); // p1 下两个 llm 类型模型；p2 的 c-image 不在内
    expect(flatModelsForSlot(MODELS, PLATFORMS, 'image', 'p1')).toEqual([]); // p1 无生图模型
    expect(flatModelsForSlot(MODELS, PLATFORMS, 'image', 'p2').map((m) => m.id)).toEqual(['c-image']);
  });

  it('★ llm_enabled=false 的平台，其模型在所有槽位都不出现（与后端读路径一致）', () => {
    const all = POOL_SLOTS.flatMap((s) => groupModelsForSlot(MODELS, PLATFORMS, s).flatMap((g) => g.models.map((m) => m.id)));
    expect(all).not.toContain('g-platform-off');
    expect(all).not.toContain('h-embedding'); // embedding 不属于任何槽位
  });
});

describe('候选池数据源 · 必须独立于 platformStore.models', () => {
  it('★ 四个视图的候选池都不以 platformStore.models 作为数据源', () => {
    // 修复前病根：loadModels(pid) 会把 store.models 整体替换成单平台清单 → 候选池下拉变空
    const files = {
      'views/Settings.vue': 'poolSlotGroups',
      'views/Models.vue': 'platformModelsForSlot',
      'views/PlatformDetail.vue': 'poolModelsForSlot',
      'components/AgentEditDialog.vue': 'poolSlotGroups',
    };
    for (const [f] of Object.entries(files)) {
      const src = read(f);
      expect(src, `${f} 未使用 poolModelsOf 兜底数据源`).toMatch(/poolModelsOf\s*\(/);
    }
  });

  it('★ 候选池 store 自己拉全量模型（/platforms/all-models），且幂等', () => {
    const src = read('stores/model-pool.ts');
    expect(src).toMatch(/allModels/);
    expect(src).toMatch(/ensureModels\s*\(/);
    expect(src).toMatch(/\/platforms\/all-models/);
    // 幂等：已加载则直接返回，避免每次开弹窗都发请求
    expect(src).toMatch(/if\s*\(\s*modelsLoaded\.value\s*\)\s*return/);
  });

  it('★ 候选池的打开/取数函数体内不得出现 loadModels(单平台)（会污染共享缓存）', () => {
    // ★ 必须切片：`onMounted` 里 `loadModels(platformId.value)` 是**合法**的
    //   （平台详情页的模型卡片本来就要按平台拉），只有候选池取数路径才禁止。
    //   对整文件断言会把合法调用一起判红 —— 断言范围不锁死 = 假红。
    const cases: [string, string, string][] = [
      ['views/Models.vue', 'async function openPools', 'function platformModelsForSlot'],
      ['views/PlatformDetail.vue', 'async function openPools', 'async function savePools'],
      ['stores/model-pool.ts', 'async function ensureModels', 'async function load'],
    ];
    for (const [f, startAnchor, endAnchor] of cases) {
      const src = read(f);
      const start = src.indexOf(startAnchor);
      expect(start, `${f} 未找到锚点 ${startAnchor}`).toBeGreaterThan(-1);
      const end = src.indexOf(endAnchor, start + startAnchor.length);
      const body = src.slice(start, end > 0 ? end : undefined);
      expect(body, `${f} 的候选池取数路径不应调用 loadModels(单平台)`).not.toMatch(/loadModels\s*\(/);
    }
  });
});

describe('渲染接线 · 设置页排版与平台入口', () => {
  it('★ 设置页：提示独占一行、按钮独立成行（不得挤在同一行，用户截图实报）', () => {
    const src = read('views/Settings.vue');
    // 结构：hint 与 button-row 是两个块级兄弟，不再共处一个 flex 行
    expect(src).toMatch(/class="pool-global-hint"/);
    expect(src).toMatch(/class="pool-global-btn-row"/);
    expect(src).toMatch(/\.pool-global-hint\s*\{[^}]*display:\s*block/);
    expect(src).toMatch(/\.pool-global-btn-row\s*\{[^}]*justify-content:\s*flex-end/);
    // 旧的「同一行塞提示 + 按钮」类名不得再用于该处
    expect(src).not.toMatch(/class="pool-first-tag"/);
  });

  it('★ 平台详情页（「管理模型」进入的页面）必须有候选池入口', () => {
    const src = read('views/PlatformDetail.vue');
    expect(src).toMatch(/class="llm-expose-bar pool-bar"/);
    expect(src).toMatch(/openPools\s*\(/);
    expect(src).toMatch(/savePools\s*\(/);
    // 保存必须走 store（唯一的写出口），不得自己拼 api.put
    expect(src).toMatch(/modelPoolStore\.savePlatform\s*\(/);
  });

  it('★ 智能体编辑：placeholder 里「候选」只出现一次（不得「视觉候选 候选」）', () => {
    const src = read('components/AgentEditDialog.vue');
    // 精确截出 placeholder 那一行（锚点必须带 POOL_LABELS，别用整文件 toMatch —— 注释里也有「候选」）
    const line = src.split('\n').find((l) => l.includes('placeholder=') && l.includes('POOL_LABELS[slot]'));
    expect(line, '未找到候选池 placeholder 行').toBeTruthy();
    const occurrences = (line!.match(/候选/g) || []).length;
    expect(occurrences, `placeholder 里「候选」出现了 ${occurrences} 次：${line!.trim()}`).toBe(1);
    expect(line).toMatch(/\$\{POOL_LABELS\[slot\]\}候选：/);
  });
});