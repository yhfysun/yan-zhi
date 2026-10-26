// 任务模式智能体共用的工具集（纯数据模块，**不 import db / 不 import 任何智能体定义**）。
//
// 为什么单独一个文件（mode-pluginization P4「种子归位」）：
//   这些集合既被基座的 builtin-task-mode-agents.ts 使用，也被**插件目录里的**种子使用
//   （如 plugins/clip-mode/seed.ts 的剪辑师）。如果集合留在基座文件里、插件种子再反向 import，
//   就会形成「基座 import 插件种子 ← 插件种子 import 基座」的运行期循环 —— ESM 下顶层数组
//   求值时对方还在 TDZ，直接 ReferenceError。抽成中立模块，两边单向依赖，环从结构上消失。
//
// 改这里的工具名 = 改所有任务模式智能体的工具面，必须同步相关守门测试
// （media-fetch-tools / space-memory-progress / conversation-self-config）。

/** 任务模式共用的交互与规划工具（确认点全靠它们落地） */
export const COMMON_TALK_TOOLS = ['task_plan', 'task_step', 'ask_user', 'confirm_user'];
/** 任务模式共用的读资料与交付工具 */
export const COMMON_FILE_TOOLS_BASE = ['file_list', 'file_read', 'file_write', 'file_grep'];
/**
 * 工具发现与安装（2026-10-22，所有任务模式共用）。
 *
 * ★ 为什么挂在公共集而不是逐个模式加：
 *   ① 用户要求「默认挂载」—— 挂在这里，所有任务模式一次性获得，不需要逐个改
 *      （逐个改要动 db.ts 里 40+ 智能体的 builtin_tool_ids，既易漏又与并行开发冲突）。
 *   ② 三个发现工具的成本极低（合计约 600 token），收益是**任何模式下都能查到
 *      自己没挂的能力** —— 这正是「即使没挂载也能找到工具」的落地。
 *   ③ `install_resource` 必须和发现工具一起挂：发现到"缺 ffmpeg / 缺语音包"之后，
 *      下一步就得能装。否则模型只能回头让用户手动点 —— 那正是要消灭的断点。
 *      ★ 它自带强制确认卡（见 llm-task-manager.confirmResourceInstall），
 *        任何权限模式都会先问用户，不会静默下 100MB+。
 */
export const COMMON_DISCOVERY_TOOLS = [
  'get_api_tools',      // 分类浏览 / 全量分页
  'api_tool_search',    // 关键词搜索
  'api_tool_detail',    // 查参数详情
  'install_resource',   // 统一安装（弹确认）
];
/**
 * ★ 合并：发现工具跟着"文件工具"一起下发。
 *   合成一个常量而不是改 6 处工具数组 —— 少改一处就少一个冲突点，
 *   而且以后新增模式只要用 COMMON_FILE_TOOLS 就自动带上发现能力。
 */
export const COMMON_FILE_TOOLS = [...COMMON_FILE_TOOLS_BASE, ...COMMON_DISCOVERY_TOOLS];
/**
 * 任务模式共用的**素材获取与规格统一**工具。
 *
 * ★ 为什么要进任务模式智能体（2026-09-27 用户诉求「让大模型去下载公开的解压视频」）：
 *   此前这些智能体只有 `call_agent`（委派 pageAgent 查资料），**没有任何"把素材取回本机"的手段**，
 *   于是缺素材时一律回"请上传"。而任务模式的素材约定就在本目录的 00-source ——
 *   下载工具带 `category:"source"` 正好落在那儿，模型就地取材形成闭环。
 * ★ `media_normalize` 是"多个视频拼成长视频"的**必做前置步**（concat 走 -c copy 直拼，
 *   参数不一致直接报错），挂在同一批智能体上，避免模型下载完发现拼不上又回头找人。
 */
export const COMMON_MEDIA_FETCH_TOOLS = ['api_media_fetch', 'api_media_normalize', 'media_install_ytdlp'];
/**
 * 任务模式共用：空间与任务模式 + 会话自配置。
 * ★ `api_space_set_task_type` 让模型能直接改这个目录的任务模式（会同步建资源目录骨架），
 *   用户说"这个目录以后都按配音来"时不必再让用户自己去 UI 里点。
 * ★ `api_space_list` 让它能看出当前有哪些目录、各自是什么模式（避免重复设置/设错目录）。
 * ★ `api_conversation_setup` 让它能设**当前会话**的智能体 / 技能 / 工作模式
 *   （用户说"你现在按 XX 来""挂上 XX 技能"时直接落，不必让用户去 UI 点）。
 */
export const COMMON_SPACE_TOOLS = ['api_space_list', 'api_space_set_task_type', 'api_conversation_setup'];
/**
 * 任务模式共用：空间记忆读写（MEMORY.md，跨会话、所有智能体共享）。
 *
 * ★ 为什么必须挂：任务模式的 SOP 明确要求「用户确认过的内容记入本目录任务记忆、
 *   同目录新开会话先复述再继续」，而模型要**主动**查/写这份记忆就必须有工具。
 *   此前这两个工具只注册了 schema 与 executor 却没挂给任何智能体 → 模型看不到 → 静默失效，
 *   长任务跨会话断线无法靠模型自愈（2026-09-27 用户报「长任务没完整需要总结记忆进入空间记忆」）。
 *   ⚠️ `api_space_memory_append` 已列进 `tool-permission.ts` 的 WRITE_TOOLS（它写磁盘），
 *   只读会话里会被拦 —— 这是对的，声明与实现一致。
 */
export const COMMON_MEMORY_TOOLS = ['api_space_memory_read', 'api_space_memory_append'];

/** 委派目标：浏览器操作助手（各任务模式智能体共用） */
export const PAGE_AGENT_ID = 'a_builtin_page_agent';
