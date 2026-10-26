// 插件模块加载器（仅后端 Node 环境使用）
import type { PluginModule } from './types';

export class PluginLoadError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'PluginLoadError';
  }
}

/** 是否已是带 scheme 的 URL（file://… / data:… / node:…）——这类 specifier 直接喂给 import。 */
const HAS_URL_SCHEME = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;
/**
 * Windows 盘符绝对路径（`C:\…` / `C:/…`）。
 * ★ 它**也**匹配上面的 scheme 正则（单字母 `C:`），必须先判：否则会被当成 URL 原样喂给
 *   import，照样走 require 回退（这条链就是远控 500 的成因，别再踩第二次）。
 */
const WIN_DRIVE_PATH = /^[a-zA-Z]:[\\/]/;

/**
 * entryPath → 可喂给 dynamic import 的 specifier。
 *
 * ★ 为什么必须转（2026-10-25 实报，远控 /hostkey 500 的真凶）：
 *   内置插件包装载给的是 `path.join(...)` 的 **Windows 绝对路径**（`C:\...\backend\index.js`），
 *   它不是合法 ESM specifier —— `import('C:\\...')` 抛
 *   「Only URLs with a scheme in: file, data, and node…」⇒ 落到下面的 require 回退；
 *   而 Node 22 的 **require(esm) 在独立模块图里加载**（实测：同一 `@yan-zhi/core`
 *   在 ESM 侧与 require 侧是两个实例，`getPluginManager` 函数不相等）⇒ 插件拿到
 *   **第二份** core ⇒ 模块级单例 `_mgr` 为空 ⇒ 插件内每次 `getPluginManager()` 抛
 *   「PluginManager 未初始化」⇒ 管理接口 500、前端按"插件未启用"渲染、二维码不出现
 *   （现象与真实状态相反：插件其实已启用）。
 *   ⇒ 绝对路径一律转 file:// URL，让它走 ESM 正路，与服务端共享同一份模块实例。
 */
export async function toEntrySpecifier(entryPath: string): Promise<string> {
  if (!entryPath) return entryPath;
  if (!WIN_DRIVE_PATH.test(entryPath)) {
    if (HAS_URL_SCHEME.test(entryPath)) return entryPath; // 已是 URL 或 bare specifier
    const { isAbsolute } = await import('node:path');
    if (!isAbsolute(entryPath)) return entryPath; // 相对路径交给 loader 按 importer 解析
  }
  const { pathToFileURL } = await import('node:url');
  return pathToFileURL(entryPath).href;
}

/**
 * 后端加载插件入口模块。
 * 优先 ESM dynamic import（绝对路径先转 file:// URL），失败回退 CJS createRequire。
 * 前端（有 window）禁止调用。
 */
export async function loadPluginModule(entryPath: string): Promise<PluginModule> {
  if (typeof window !== 'undefined') {
    throw new PluginLoadError('前端不支持加载后端插件模块');
  }
  try {
    const specifier = await toEntrySpecifier(entryPath);
    const mod = await import(/* @vite-ignore */ specifier);
    return (mod as { default?: PluginModule }).default || (mod as unknown as PluginModule);
  } catch (e) {
    try {
      // ★ 回退只能用于真正的 CJS 插件：require(esm) 会另起模块图（宿主单例全成第二份），
      //   出现即说明上面 URL 转换没兜住 —— 打出来，别再让它在运行期静默降级。
      console.warn(`[plugin] ESM 加载失败，回退 require(${entryPath})：${(e as Error).message}`);
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      const m = req(entryPath) as { default?: PluginModule };
      return m.default || (m as unknown as PluginModule);
    } catch (e2) {
      throw new PluginLoadError(`加载插件入口失败 ${entryPath}: ${(e as Error).message} / ${(e2 as Error).message}`);
    }
  }
}
