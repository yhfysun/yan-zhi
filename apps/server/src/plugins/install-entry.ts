/**
 * 已安装插件（.yzp）的后端入口解析（P6）。
 *
 * 三种 .yzp 形态并存，入口位置不同：
 *   · 插件包形态（P1 起，本仓第一方插件的分发形态）：`backend/index.js`
 *   · 声明了 main 的第三方插件：manifest.main 指定相对路径
 *   · 早期 .yzp 约定：包根 `index.js`
 *
 * ★ 为什么必须显式解析：安装路由原先固定取 `manifest.main || 'index.js'`，
 *   而插件包 manifest 从不带 main —— 装回来的第一方 .yzp 会指向不存在的 index.js，
 *   激活必然失败（state=error「Cannot find module」），表现为"装上了但用不了"。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PluginManifest } from '@yan-zhi/core';

export class PluginInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginInstallError';
  }
}

/** 插件包形态的后端入口（与 builtin-packages.ts 的扫描约定一致；用 / 写，报错文案跨平台可读） */
export const PACKAGE_ENTRY = 'backend/index.js';
/** 早期 .yzp 的根入口 */
export const LEGACY_ENTRY = 'index.js';

/** 解析已解压插件目录的后端入口绝对路径；找不到可读报错。 */
export function resolveInstalledEntryPath(
  pluginDir: string,
  manifest: PluginManifest,
  exists: (p: string) => boolean = fs.existsSync,
): string {
  if (typeof manifest.main === 'string' && manifest.main.trim()) {
    const declared = path.join(pluginDir, manifest.main.trim());
    if (!exists(declared)) {
      throw new PluginInstallError(`插件包声明的入口不存在: ${manifest.main}`);
    }
    return declared;
  }
  for (const candidate of [PACKAGE_ENTRY, LEGACY_ENTRY]) {
    const abs = path.join(pluginDir, candidate);
    if (exists(abs)) return abs;
  }
  throw new PluginInstallError(
    `插件包缺少后端入口（应有 ${PACKAGE_ENTRY} 或 ${LEGACY_ENTRY}，或在 manifest.main 中声明）`,
  );
}
