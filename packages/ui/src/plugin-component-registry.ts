// 内置插件前端组件解析注册表
// 插件 manifest 中 routes[].component / settingsTabs[].component / layouts[].component
// 使用此处映射的键，由 resolvePluginComponent 解析为懒加载组件。
//
// 解析顺序：
// 1. import.meta.glob 动态扫描 ./views/plugin/**/*.vue 与 ./plugins/**/*.vue（约定目录，新增组件无需登记）
// 2. 显式别名映射（用于 manifest component 路径与实际文件路径不一致的修正）

// 约定目录自动扫描：键标准化为去掉 './' 前缀的相对路径
const globModules = import.meta.glob('./views/plugin/**/*.vue');
const globPluginModules = import.meta.glob('./plugins/**/*.vue');

const globRegistry: Record<string, () => Promise<unknown>> = {};
for (const [k, loader] of Object.entries({ ...globModules, ...globPluginModules })) {
  globRegistry[k.replace(/^\.\//, '')] = loader as () => Promise<unknown>;
}

// 显式别名：manifest component → 实际懒加载（路径不一致时修正）
const aliasRegistry: Record<string, () => Promise<unknown>> = {
  'panels/plugin/GitSettings.vue': () => import('./views/plugin/GitSettings.vue'),
};

/** 按清单组件路径解析为懒加载函数，未登记返回 undefined */
export function resolvePluginComponent(path: string): (() => Promise<unknown>) | undefined {
  return globRegistry[path] || aliasRegistry[path];
}
