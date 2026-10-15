/**
 * 预览面板「Git 文件」的仓库根目录解析。
 *
 * ★ 三级归属模型（2026-10-15 用户澄清，权威口径）：
 *   预览面板里的三类资源分属不同层级，**不能混用同一份目录来源** ——
 *   ① 浏览器 = 应用级（整个应用一份，切工作空间/切任务都不销毁）；
 *   ② Git / 文件 = 工作空间级（跟随当前空间的绑定目录，空间内所有会话共享）；
 *   ③ 控制台 = 会话级。
 *
 *   原实现的错法：`props.repo || codeStore.projectDir || settingsStore.workspaceDir`
 *   —— `codeStore.projectDir` 是 **IDE（/code）当前项目目录**，与当前工作空间无关
 *   且长期驻留（上次打开的项目，往往正是那个"有 git 记录的目录"）。
 *   预览面板（对话页）没传 repo 时直接落到它 ⇒ 用户实报「当前工作空间目录里没有 git，
 *   预览面板里的 git 却是别的有 git 记录的目录」。
 *
 *   新优先级：显式指定 > 当前会话所属空间目录 > 工作目录设置 >（仅代码模式）IDE 项目目录。
 *   代码模式（/code）仍由 CodeSidebar 显式传 code.projectDir，兜底链只为老调用方保留。
 *
 * ★ 必须抽成纯函数：宿主依赖 pinia store / 路由，vitest 里加载不动 ⇒ 静态断言抓不住
 *   分支顺序。抽出来后测试与 ChatGitPanel 共用同一份实现（记忆里
 *   browser-target.cjs / modelFilter.ts 的同款模式）。
 */

export interface GitRepoSourceInput {
  /** 调用方显式指定（tab.repoPath / 父级传入），优先级最高 */
  explicitRepo?: string;
  /** 当前会话所属空间的绑定目录（space.dir_path） */
  spaceDir?: string;
  /** 设置里的工作目录（选中空间时由 selectSpaceAndSyncDir 同步） */
  workspaceDir?: string;
  /** 仅代码模式：IDE 当前项目目录。非代码模式必须传空串，否则跨工作空间污染 */
  codeModeProjectDir?: string;
}

/** 去掉首尾空白与尾部斜杠（\ 或 /）——路径作为缓存 key，同目录两种写法会分裂成两份 */
export function normalizeRepoDir(dir: string): string {
  return String(dir || '').trim().replace(/[\\/]+$/, '');
}

/**
 * 解析仓库根目录。空串 = 无从解析（面板据此跳过请求，不发空 repo 的 API）。
 *
 * ⚠️ 用 `||` 而非 `??`：空串 prop 不应遮蔽后面的来源（调用方传 repo="" 时继续往下找）。
 */
export function resolveGitRepoSource(s: GitRepoSourceInput): string {
  return (
    normalizeRepoDir(s.explicitRepo || '') ||
    normalizeRepoDir(s.spaceDir || '') ||
    normalizeRepoDir(s.workspaceDir || '') ||
    normalizeRepoDir(s.codeModeProjectDir || '')
  );
}
