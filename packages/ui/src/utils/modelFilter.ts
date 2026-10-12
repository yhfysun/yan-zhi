/**
 * 模型列表的搜索 / 分类筛选 —— **纯函数**（无 Vue、无 DOM 依赖）
 *
 * ★ 为什么抽成纯函数模块（而不是把过滤逻辑直接写在 .vue 的 computed 里）：
 *   过滤是"作用在哪个对象上"的判定，错了不会报错、只是筛错 / 筛不出 ——
 *   而 PlatformDetail.vue 依赖 vue-router + pinia，**在 vitest(node) 里无法直接挂载**，
 *   静态断言只能证明"这段代码存在"，证明不了"过滤真的按预期生效"。
 *   抽出来后宿主 require 它、测试真跑它，两头都验证得到。
 *
 * 字段口径与 UI 一致：
 *   · 关键字匹配 modelId / alias / description，大小写不敏感
 *   · 类型筛选为空串 = 全部；模型自身 type 缺失时按 'llm' 归类
 */

/** 模型类型中文名（与「添加模型」表单的下拉选项同一套叫法） */
export const MODEL_TYPE_LABELS: Record<string, string> = {
  llm: 'LLM',
  embedding: 'Embedding',
  rerank: 'Rerank',
  image: '图片生成',
  video: '视频生成',
  audio: '音频生成',
  tts: '语音合成(TTS)',
};

export interface ModelFilterOptions {
  /** 关键字：匹配 modelId / alias / description，大小写不敏感 */
  keyword?: string;
  /** 类型：空串 / undefined = 全部类型 */
  type?: string;
}

/** 模型归类：历史数据可能没写 type，一律按 llm 归类（与后端一致） */
export function modelTypeOf(model: any): string {
  return (model && model.type) || 'llm';
}

/** 关键字命中 modelId / alias / description；空关键字视为全部命中 */
export function matchesModelKeyword(model: any, keyword: string): boolean {
  const kw = (keyword || '').trim().toLowerCase();
  if (!kw) return true;
  return [model?.modelId, model?.alias, model?.description].some((v) =>
    String(v || '').toLowerCase().includes(kw),
  );
}

/** 搜索 + 分类筛选的主入口：两个条件同时生效（AND） */
export function filterModels<T>(models: T[], opts: ModelFilterOptions = {}): T[] {
  const type = opts.type || '';
  const list = models || [];
  return list.filter((m: any) => {
    if (type && modelTypeOf(m) !== type) return false;
    return matchesModelKeyword(m, opts.keyword || '');
  });
}

/** 类型下拉只列本平台真实出现过的类型（不列零项选项） */
export function modelTypeOptions<T>(models: T[]): { value: string; label: string }[] {
  const seen = new Set((models || []).map((m: any) => modelTypeOf(m)));
  return [...seen].map((t) => ({ value: t, label: MODEL_TYPE_LABELS[t] || t }));
}

/** 筛选是否处于激活态（决定"显示 N / M"计数与「重置」按钮是否出现） */
export function isFilterActive(opts: ModelFilterOptions): boolean {
  return !!(opts.keyword || '').trim() || !!opts.type;
}
