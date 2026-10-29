// 内置插件前端组件解析注册表
// 插件 manifest 中 routes[].component / settingsTabs[].component / layouts[].component
// 使用此处映射的键，由 resolvePluginComponent 解析为懒加载组件。
//
// ★ 构建期裁剪（2026-10-23）：清单来自生成文件 `generated/build-modes.ts`，
//   **不能再用 import.meta.glob** —— glob 会把 `./views/plugin/**` 下所有 .vue 都
//   变成独立 chunk（哪怕路由没注册），`--modes` 裁剪等于白做。
//   生成表只包含「非模式插件视图 + 本次选中模式的插件视图」。
import { PLUGIN_VIEW_LOADERS } from './generated/build-modes';

// 显式别名：manifest component（panels/...）→ 实际懒加载（views/...）。
// ★ 不要写成逐条字面量（`PLUGIN_VIEW_LOADERS['views/plugin/Xxx.vue']`）：那条路径字符串
//   会被打进产物，verify-plugin-prune 按组件名扫描时会把它当成"该插件界面泄漏"
//   （--plugins 不含该插件时误报）。这里按前缀规则批量映射，产物里不留单条视图路径。
const aliasRegistry: Record<string, () => Promise<unknown>> = {};
for (const [path, loader] of Object.entries(PLUGIN_VIEW_LOADERS)) {
  if (path.startsWith('views/')) aliasRegistry[`panels/${path.slice('views/'.length)}`] = loader;
}

/** 按清单组件路径解析为懒加载函数，未登记返回 undefined */
export function resolvePluginComponent(path: string): (() => Promise<unknown>) | undefined {
  return PLUGIN_VIEW_LOADERS[path] || aliasRegistry[path];
}
