/**
 * 宿主内部模块登记表（mode-pluginization P4 前端 bundle 化）。
 *
 * 插件前端 bundle 里对 `stores/*`、`composables/*`、`api/*`、`utils/*` 的 import 在构建期
 * 被改写为 `yz://shared/host/<key>.mjs`（见 build-plugins.mjs 的 yz-host-modules 插件），
 * shim 再从 `window.__YZ_HOST__.mods[key]` 取回**宿主这一份真实模块实例**。
 *
 * 为什么必须单实例：这些模块里有模块级状态（stores/mode 的 activeMode/leads、api/client 的
 * API_BASE 等）。随插件 bundle 复制一份 ⇒ 插件改的 activeMode 宿主看不到，切模式静默错乱。
 *
 * ★ 维护约定：外置目录清单的唯一真相源是 apps/desktop/scripts/lib/host-shims.mjs 的
 *   HOST_MODULE_DIRS，改那里必须同步这里的 glob（两边漂移的后果是插件 import 抛
 *   「宿主模块未登记」—— 有明确报错，不会静默）。
 * ★ 用 glob 而不是生成文件：插件是逐个构建的，生成文件会在"只构建一个插件"时把其他插件的
 *   依赖挤掉。glob 常驻、无跨构建状态。
 */
const modules = import.meta.glob(
  [
    './stores/*.ts',
    '!./stores/*.test.ts',
    './composables/**/*.ts',
    '!./composables/**/*.test.ts',
    './api/*.ts',
    '!./api/*.test.ts',
    './utils/*.ts',
    '!./utils/*.test.ts',
  ],
  { eager: true },
) as Record<string, unknown>;

/** key = 相对 packages/ui/src 的路径去扩展名（如 'stores/mode'） */
export const HOST_MODULES: Record<string, unknown> = Object.fromEntries(
  Object.entries(modules).map(([p, m]) => [p.replace(/^\.\//, '').replace(/\.ts$/, ''), m]),
);

/** 改了外置目录时自检用：key 数量（空 = glob 没匹配上，插件装载会全部失败） */
export const HOST_MODULE_COUNT = Object.keys(HOST_MODULES).length;
