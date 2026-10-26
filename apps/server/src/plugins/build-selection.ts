/**
 * 打包选择集的运行时消费（P5）。
 *
 * 打包脚本按 --plugins 选择集裁出插件目录（未选移出、不进安装包），并把结果写进
 * `edition.json.pluginsExcluded`；`main.cjs` 以 `YZ_BUILD_PLUGINS_EXCLUDED` 注入后端。
 * 后端据此**跳过未选插件的注册** —— 否则源码兜底注册仍会把插件拉起来（目录没了、
 * 插件却还在：包里"看起来有"、实际只有后端没界面，比整块缺席更难查）。
 *
 * 缺省（开发态 / 存量包没有该 env）时集合为空，行为与 P5 之前完全一致。
 */
const PLUGIN_ID_RE = /^[a-z][a-z0-9-]*$/;

/** 解析逗号/空格分隔的插件 id 列表；非法项与空值一律忽略（环境变量来自打包脚本，容忍脏值）。 */
export function parsePluginIdList(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const out: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const id = part.trim();
    if (!id || !PLUGIN_ID_RE.test(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** 本次构建被排除的插件 id 集合（默认读 YZ_BUILD_PLUGINS_EXCLUDED）。 */
export function excludedPluginIds(raw: unknown = process.env.YZ_BUILD_PLUGINS_EXCLUDED): Set<string> {
  return new Set(parsePluginIdList(raw));
}
