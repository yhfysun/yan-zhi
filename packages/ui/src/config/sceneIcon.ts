// 场景（模式）图标解析（纯函数，可单测）。
//
// 背景：场景配置 2026-10-12 起搬进后端 scene_config 表，icon 列存的是**图标名字符串**
// （element-plus 组件名）。前端拿到行后要转成 Component 才能 <component :is> 渲染。
// 本模块就是这张「名字 → 组件」映射表；与 config/scenes.ts 内置兜底保持一致。
import type { Component } from 'vue';
import {
  Suitcase, Monitor, Brush, Coin, TrendCharts, Promotion, User, Sell,
  ScaleToOriginal, DataAnalysis, Service, Connection, Notebook, Shop, VideoCamera,
} from '@element-plus/icons-vue';

/** 图标名 → 组件。名字必须与 scenes.ts / builtin-scene-defs.ts 里写的字符串一致。 */
const SCENE_ICON_BY_NAME: Record<string, Component> = {
  Suitcase, Monitor, Brush, Coin, TrendCharts, Promotion, User, Sell,
  ScaleToOriginal, DataAnalysis, Service, Connection, Notebook, Shop, VideoCamera,
};

/** 兜底图标：名字缺失或查不到时用（与 scenes.ts 的 office 卡同图标，语义中性）。 */
export const SCENE_FALLBACK_ICON: Component = Suitcase;

/** 该图标名是否已登记（映射表成员判定；注意 Suitcase 同时是兜底图标，不能用「不是兜底」反推） */
export function isKnownSceneIcon(name?: string | null): boolean {
  return !!name && name in SCENE_ICON_BY_NAME;
}

/** 解析场景图标：名字精确匹配 → 兜底。 */
export function resolveSceneIcon(name?: string | null): Component {
  if (name && SCENE_ICON_BY_NAME[name]) return SCENE_ICON_BY_NAME[name];
  return SCENE_FALLBACK_ICON;
}
