// 内置工具类型定义
import type { McpCallResult } from '../mcp/client';

/** 工具定义元数据（JSON Schema 参数描述） */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** 输出结构描述（JSON Schema），可选 */
  outputSchema?: Record<string, unknown>;
  /**
   * 该工具的**输出取决于外部可变状态**（页面 / 网络 / 文件系统的当前快照），
   * 而非仅由入参决定。缺省 false。
   *
   * ★★★ 为什么需要（2026-10-14 实报，high）：防失控循环闸门的 A 线判据是
   *   "**相同输入**不会产生新结果"，成立的前提是"结果由输入决定"。对读页类工具这个前提
   *   **不成立**：`browser_get_page_content({maxTextLength:4000})` 连调三次，读的是页面
   *   **三个不同时刻**的状态 —— 参数相同、结果不同。于是 A 线必然在第 3 次拦下，而拦截
   *   文案（"相同输入不会产生新结果"）是**错的**，模型照做、不再读页面。
   *   实测链路（conv 96125908）：读页与截图相继被拦 ⇒ 视觉/读页两条路同时断 ⇒ 只剩
   *   `browser_run_script` 反复探查 ⇒ 撞 B 线连续拦截 ⇒ 拦满 3 次硬停，任务在**收尾处**被掐死。
   *
   * ★ 判据必须是**工具性质**（读外部状态），**不是"参数是否为空"**：实测模型恰恰是带着
   *   `maxTextLength` / `tabId` 这类参数重复调用的，按"空参才放行"等于没修（这条弯路
   *   2026-10-14 走过一次，被代码审查拦下）。
   * ★ 语义边界：只关掉 A 线（同参去重）；B 线（严格连续连刷）照常兜底，失控仍会被拦。
   */
  readsExternalState?: boolean;
}

/**
 * 工具执行上下文 —— 由执行器在**调用点直接算好、直接传入**，模型看不到也传不了。
 *
 * ★★★ 为什么需要（2026-09-23 用户反馈「文件写入还是不对啊，路径不应该方法里面自己判断？
 *     还用大模型传？」「代码层面直接传入啊」）：
 *
 *   `file_write` 原先把 `path` 作为 required 交给模型填。但产物位置在本系统里是
 *   **确定性可推导**的（产物目录规范，见 @yan-zhi/shared 的 artifact-paths）：
 *     <根>/.yan-zhi/tasks/<conversationId>/{intermediate,deliverables}
 *   调用方（llm-task-manager）手里就有 conversationId，**直接算出目录传进来即可**，
 *   不该让模型编路径。让模型填的实测后果：
 *     · 文件写到工作区任意位置（各处一份）；
 *     · 服务端静态媒体路由只认规范目录 → 登记的文件预览/另存为一律 404；
 *     · 读取时产物根还随工作目录漂移（见 issues/产物根目录漂移导致媒体404-20260919.md）。
 *
 * ★ 设计取向（按用户口径「代码层面直接传入」）：
 *   **不做回调注入**，只传**已经算好的绝对路径**。工具侧零业务知识，只管拼文件名。
 *   —— 回调（resolveArtifactPath(...)）会把"产物目录怎么算"的决策权反向留在 core，
 *      而 core 是平台无关层，不该知道 serverState / 会话表 / 空间目录的约定。
 */
export interface ToolContext {
  /** 会话 id：产物目录的主键（目录按会话 id 归档，而非标题）。 */
  conversationId?: string;
  /** 用户 id（数据归属）。 */
  userId?: string;
  /**
   * 本会话各分类产物目录的**绝对路径**，调用方直接传入。
   * key 为分类（intermediate / deliverable / upload），未提供的分类表示该场景不支持。
   */
  artifactDirs?: {
    intermediate?: string;
    deliverable?: string;
    upload?: string;
  };
  /**
   * ★★★ 当前**工作目录**的绝对路径（2026-09-30 新增，用户报「不是工作目录是当前目录？」）。
   *
   * 为什么必须补：此前读类工具（file_read / file_list / code_search / file_grep …）
   * 与 code_* 系列各自 `const root = args.path || '.'` 后**直接交给 fs** ——
   * 而 fs 适配器用的是**进程 cwd**（后端启动目录），不是用户的工作目录。
   * 实测后果（生产库 09-30 08:27~08:28）：`02-work` / `.yan-zhi/tasks/<convId>`
   * 等相对路径一律 `directory not found`，模型只能改用长绝对路径绕过 →
   * 用户侧表现为"工具时好时坏"。
   *
   * ★ 与 `artifactDirs` 同一设计取向：**调用方算好、直接传**，工具侧零业务知识。
   *   core 不知道 serverState / 会话表 / 空间目录的约定，也不该知道。
   * ★ 工具侧统一用 `resolveToolPath(args.path, ctx?.workspaceDir)` 解析，
   *   不要各自拼路径（否则基准再次漂移）。
   */
  workspaceDir?: string;
  /**
   * 任务中止信号（2026-10-23）：用户点「停止」时触发。
   * 长时间子进程工具（python_exec / cmd_exec / novel_tuiwen…）把它透传给 shell 适配器，
   * 由执行层按进程树杀掉子进程；否则停止只让上层不再等，python/ffmpeg 继续跑。
   */
  signal?: AbortSignal;
  /**
   * 任务级环境变量（2026-10-23）：页面设置（如小说推文并发 YZ_TTS_CONCURRENCY）随任务下发，
   * 工具把它并入子进程 env —— 免得只靠全局 process.env 而"设置页改了不生效"。
   * 工具自身的显式入参优先于这里的值。
   */
  env?: Record<string, string>;
}

/** 内置工具 = 定义 + 执行逻辑 */
export interface BuiltInTool extends ToolDefinition {
  execute(args: Record<string, unknown>, ctx?: ToolContext): Promise<McpCallResult>;
}
