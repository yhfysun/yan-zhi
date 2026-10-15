// 场景（模式）图标解析（纯函数，可单测）。
//
// 背景：场景配置 2026-10-12 起搬进后端 scene_config 表，icon 列存的是**图标名字符串**
// （element-plus 组件名）。前端拿到行后要转成 Component 才能 <component :is> 渲染。
// 本模块就是这张「名字 → 组件」映射表；与 config/scenes.ts 内置兜底保持一致。
import { markRaw, type Component } from 'vue';
import {
  Suitcase, Monitor, Brush, Coin, TrendCharts, Promotion, User, Sell,
  ScaleToOriginal, DataAnalysis, Service, Connection, Notebook, Shop, VideoCamera,
} from '@element-plus/icons-vue';

/** 图标名 → 组件。名字必须与 scenes.ts / builtin-scene-defs.ts 里写的字符串一致。
 *  ★★ 一律 markRaw（2026-10-14，用户报 Vue 警告「Component that was made a reactive object」）：
 *     icon 是**组件对象**，解析结果会进 SceneDef 并最终被放进响应式状态
 *     （stores/sceneConfig.ts 的 `ref<SceneDef[]>`，含本函数解析的后端 scene_config 行）→
 *     未标记时每个 icon 被 reactive() 代理，Vue 在 createVNode 里对 `isProxy(type)` 逐次检查
 *     （**不去重**）→ 每次渲染每张卡警告一条，刷新/重挂载再刷一批。
 *     markRaw 的标记落在组件对象自身（__v_skip），标记一次即对任何容器生效。 */
const SCENE_ICON_BY_NAME: Record<string, Component> = {
  Suitcase: markRaw(Suitcase), Monitor: markRaw(Monitor), Brush: markRaw(Brush), Coin: markRaw(Coin),
  TrendCharts: markRaw(TrendCharts), Promotion: markRaw(Promotion), User: markRaw(User), Sell: markRaw(Sell),
  ScaleToOriginal: markRaw(ScaleToOriginal), DataAnalysis: markRaw(DataAnalysis), Service: markRaw(Service),
  Connection: markRaw(Connection), Notebook: markRaw(Notebook), Shop: markRaw(Shop), VideoCamera: markRaw(VideoCamera),
};

/** 兜底图标：名字缺失或查不到时用（与 scenes.ts 的 office 卡同图标，语义中性）。 */
export const SCENE_FALLBACK_ICON: Component = markRaw(Suitcase);

/** 该图标名是否已登记（映射表成员判定；注意 Suitcase 同时是兜底图标，不能用「不是兜底」反推） */
export function isKnownSceneIcon(name?: string | null): boolean {
  return !!name && name in SCENE_ICON_BY_NAME;
}

/** 解析场景图标：名字精确匹配 → 兜底。 */
export function resolveSceneIcon(name?: string | null): Component {
  if (name && SCENE_ICON_BY_NAME[name]) return SCENE_ICON_BY_NAME[name];
  return SCENE_FALLBACK_ICON;
}
