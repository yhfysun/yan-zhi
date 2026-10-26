/**
 * 宿主版本解析（P6）与 .yzp 的 engine 兼容校验。
 *
 * 宿主版本 = **应用版本**（apps/desktop/package.json 的 version），不是后端包自己的版本：
 * 用户安装的是「应用」，插件声明 engine 也是面向应用版本的（design §2/§8 版本漂移对策）。
 *
 * 三个来源，按可信度排序：
 *   1) `YZ_HOST_VERSION` —— 主进程 spawn 后端时用 app.getVersion() 注入（打包版唯一可靠来源，
 *      resources 里没有 apps/desktop/package.json 可读）；
 *   2) 向上查找 `apps/desktop/package.json` —— dev / tsx 直跑时存在；
 *   3) 向上查找 name=@yan-zhi/server 的 package.json —— 兜底（打包后 resources/server/package.json）。
 * 都拿不到时返回 '0.0.0'：**不是**放行所有插件，而是让带 engine 的包一律被拒（显式失败优于误装）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { satisfiesRange, parseVersion } from '@yan-zhi/core';

export const HOST_VERSION_ENV = 'YZ_HOST_VERSION';
const SERVER_PACKAGE_NAME = '@yan-zhi/server';
const FALLBACK_HOST_VERSION = '0.0.0';

export class PluginEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginEngineError';
  }
}

function readPackageJson(file: string): { name?: unknown; version?: unknown } | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: unknown; version?: unknown };
  } catch {
    return null;
  }
}

function versionOf(pkg: { version?: unknown } | null): string | null {
  if (!pkg || typeof pkg.version !== 'string') return null;
  const v = pkg.version.trim();
  return parseVersion(v) ? v : null;
}

/** 解析宿主版本（env/startDir 可注入，供单测）。 */
export function resolveHostVersion(opts?: {
  env?: Record<string, string | undefined>;
  startDir?: string;
}): string {
  const env = opts?.env ?? process.env;
  const fromEnv = typeof env[HOST_VERSION_ENV] === 'string' ? env[HOST_VERSION_ENV]!.trim() : '';
  if (parseVersion(fromEnv)) return fromEnv;

  const start = opts?.startDir ?? path.dirname(fileURLToPath(import.meta.url));
  let serverFallback = '';
  let cur = start;
  for (let i = 0; i < 10; i++) {
    const desktopVersion = versionOf(readPackageJson(path.join(cur, 'apps', 'desktop', 'package.json')));
    if (desktopVersion) return desktopVersion;

    if (!serverFallback) {
      const pkg = readPackageJson(path.join(cur, 'package.json'));
      if (pkg && pkg.name === SERVER_PACKAGE_NAME) serverFallback = versionOf(pkg) || '';
    }

    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return serverFallback || FALLBACK_HOST_VERSION;
}

/**
 * 校验插件与宿主版本兼容；不兼容/声明非法 → 抛错（文案给用户看）。
 * ★ 缺 engine = 兼容：存量 .yzp 全都没有这个字段，不能因此装不上。
 */
export function assertPluginEngine(
  manifest: { id: string; name?: string; engine?: string },
  hostVersion: string,
): void {
  if (manifest.engine === undefined || manifest.engine === null || manifest.engine === '') return;
  if (typeof manifest.engine !== 'string') {
    throw new PluginEngineError(`插件 ${label(manifest)} 的 engine 声明非法：必须是版本范围字符串`);
  }
  let ok: boolean;
  try {
    ok = satisfiesRange(hostVersion, manifest.engine);
  } catch (e) {
    throw new PluginEngineError(
      `插件 ${label(manifest)} 的 engine 声明非法（${manifest.engine}）：${(e as Error).message}`,
    );
  }
  if (!ok) {
    throw new PluginEngineError(
      `插件 ${label(manifest)} 要求宿主版本 ${manifest.engine}，当前宿主版本 ${hostVersion}，`
        + '版本不兼容，已拒绝安装。请升级应用，或改用与该版本匹配的插件包。',
    );
  }
}

function label(m: { id: string; name?: string }): string {
  return m.name ? `「${m.name}」(${m.id})` : m.id;
}
