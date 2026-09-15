/**
 * 服务端全局常量（零依赖模块）。
 *
 * 为什么要单独一个文件：常量必须能被任意模块安全引入。
 * 之前 DEFAULT_CONTEXT_WINDOW 挂在 agens-platform/service.ts 下，而该模块顶层
 * `import { db }` → 纯逻辑模块（如 mcp/search-backend.ts）一旦引用常量就会连带
 * 加载 better-sqlite3 原生模块，在测试环境（无 ABI 匹配的 .node）直接炸。
 *
 * 前端对应口径：packages/ui/src/utils/context-window.ts 的 DEFAULT_CONTEXT_WINDOW，两处必须同值。
 */

/** 新建/读取模型时的默认上下文窗口：1M（token 数） */
export const DEFAULT_CONTEXT_WINDOW = 1048576;
