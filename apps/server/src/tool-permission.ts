// 会话级工具权限：把工具按「是否有副作用」分类，供 readonly 模式裁剪/拦截使用。
// 设计要点：
//  1) 判定方向是「黑名单写操作 + 不可控来源兜底」，而不是穷举读白名单——
//     新工具即便忘了登记，只要它看起来是写操作或未归类，readonly 下默认拒绝（安全默认）。
//  2) 不可控来源（custom_ 自定义代码 / mcp_ 外部服务 / call_agent 委派）一律视为写，
//     因为无法静态判断其副作用。

/** 会话级工具权限模式。all = 全放行且路径守卫/命令授权不再弹窗（由前端随任务下发 pathGuard=off） */
export type PermissionMode = 'readonly' | 'default' | 'full' | 'all';

/**
 * 归一化权限模式。
 * ★ 非法值回落 **readonly**（fail-safe，2026-09-27 起默认档即只读）：
 *   垃圾值/未知的权限宁可误收窄（用户看得见、可手动放开），绝不静默放行。
 */
export function normalizePermissionMode(v: unknown): PermissionMode {
  // 'full' 已并入 'all'（2026-10-07：两者语义重复，all = 全放行 + 路径守卫不弹窗）；存量 full 会话读到即迁移
  return v === 'readonly' || v === 'full' || v === 'all' ? (v === 'full' ? 'all' : v) : v === 'default' ? 'default' : 'readonly';
}

/** 明确有副作用的工具（readonly 模式拒绝执行） */
const WRITE_TOOLS = new Set([
  // —— 文件系统 ——
  'file_write', 'file_edit',
  // —— 任意代码执行 ——
  'cmd_exec', 'python_exec',
  // —— 浏览器：会改变页面/远端状态的操作 ——
  'browser_click', 'browser_type', 'browser_press_key', 'browser_hover',
  'browser_fill_form', 'browser_submit_form', 'browser_select_option',
  'browser_check', 'browser_uncheck', 'browser_drag', 'browser_scroll_into_view',
  'browser_upload', 'browser_download', 'browser_login_saved',
  // —— Git 写操作（pull/fetch 会改动本地工作区，同样算写）——
  'api_git_add', 'api_git_commit', 'api_git_push', 'api_git_pull', 'api_git_fetch',
  'api_git_checkout', 'api_git_restore', 'api_git_stash_save', 'api_git_stash_pop',
  'api_git_tag_create', 'api_git_tag_delete', 'api_git_revert', 'api_git_reset',
  'api_git_cherry_pick', 'api_git_rebase', 'api_git_merge',
  // —— 数据/知识库/文件元信息写入 ——
  'api_file_set_category',
  'api_kb_create', 'api_kb_update', 'api_kb_delete',
  'api_kb_document_add', 'api_kb_document_delete',
  'api_conversation_file_add', 'api_conversation_file_update',
  // —— IM 连接器：发消息与增删配置不可逆 ——
  'api_im_send', 'api_im_connector_create', 'api_im_connector_update',
  'api_im_connector_delete', 'api_im_connector_test',
  // —— 配置变更 ——
  'configure_model_platform',
  // —— 空间任务模式：会改空间配置 + 建磁盘目录（写副作用）——
  // ★ 必须列进写清单：它既改库（space.task_type）又**在用户磁盘上建目录**，
  //   只读会话里放行等于绕过了"不许写"的约束。
  'api_space_set_task_type',
  // —— 记忆库写入 ——
  // ★★ 2026-09-29 自检（tools/audit-safety-gates.cjs）发现：这两个是**写库**操作
  //    （`INSERT INTO memory` / `DELETE FROM memory`），名字也明确是 create/delete，
  //    却**没进本清单** → 只读会话里可执行 → 又一次"写着只读实则可写"。
  //    更值得注意的是：它们出现在 `buildToolsForBackend` 的 **alwaysApiTools**（无条件暴露给
  //    *所有* 智能体），所以影响面比"某个智能体漏登记"更大 —— 任何智能体在任何只读会话里都能写到。
  //    ★ 这是本项目**第三次**同类事故（前两次：api_space_set_task_type、api_space_memory_append）。
  //      三者共同点：名字看着"只是个查询/普通操作"，实际写库；且**没人去数挂载清单**。
  // ★ 与之成对的读类（api_memory_search / api_memory_list）**不进**本清单（只读应放行），
  //   它们已在 checkToolPermission 的兜底分支正确放行 —— 成对工具要逐个判，别"一对全登记"。
  'api_memory_create', 'api_memory_delete',

  // —— ★★ 配置类增删改（2026-09-29 自检补登记，共 20 个）——
  //
  // 【为什么这批以前没登记也不会"被用到"】它们**都不在智能体的挂载清单里**，
  //   平时不会出现在模型的工具面上。但这**不等于安全**，两条路径仍能触达：
  //     ① `get_api_tools` 是"按需发现"入口 —— 模型可以主动查询模块清单、
  //        拿到 name/description/inputSchema 后**直接调用**（执行时不校验"有没有挂载"）；
  //     ② 运行时拦截（executeTool:1831 的 checkToolPermission）**只认本清单** ——
  //        没登记的写工具在只读会话里会被兜底放行。
  //   → 所以"没挂载"只是"平时看不见"，不是权限边界。**权限边界必须是本清单。**
  //
  // 【逐条确认过实现，都是真写】核对手法：抽 `api-tool-executor.ts` 里对应 case 体，
  //   看有没有 `INSERT INTO` / `UPDATE ... SET` / `DELETE FROM` / 写盘 / 卸载动作。
  //   ★ 其中两个名字不含 create/update/delete 但同样是写，**最容易漏**：
  //     · `api_kb_builtin_guide_reset` → `resetBuiltinAppGuide()` 重置知识库内置指南
  //     · `api_ollama_delete`         → `deleteOllamaModel()` 删除本地模型文件
  //   ⇒ 判据：**别按名字判读写，按实现判**。
  //
  // 【成对口径】只登记写的一半：读类（*_list / *_get / *_search）**不进**本清单
  //   （只读会话应放行）；但 create 与 update 必须成对（半开状态既难理解也同样是越权）。
  // 会话
  'api_conversation_create', 'api_conversation_update', 'api_conversation_delete',
  'api_conversation_file_delete',
  'api_message_delete',
  // ★ api_message_send：往会话里**插入消息**（INSERT INTO message + UPDATE conversation.updated_at）。
  //   它属于"以用户身份发言"的写操作，只读会话里不该放行。
  //   ★ 最容易漏的一类：名字是 send（不是 create/update），而且"发消息"看起来像正常动作 ——
  //     判据仍是**按实现判**（有 INSERT 就是写），不是按名字判。
  'api_message_send',
  // 知识库
  'api_kb_builtin_guide_reset',
  // MCP 服务
  'api_mcp_server_create', 'api_mcp_server_update', 'api_mcp_server_delete', 'api_mcp_tool_toggle',
  // 平台 / 模型
  'api_platform_create', 'api_platform_update', 'api_platform_delete',
  'api_model_create', 'api_model_update', 'api_model_delete',
  // 本地模型（Ollama）：delete 会移除本地模型文件
  'api_ollama_delete',
  // 插件：set_config 改配置、uninstall 卸载
  'api_plugin_set_config', 'api_plugin_uninstall',
  // 定时任务
  'api_scheduled_task_create', 'api_scheduled_task_update', 'api_scheduled_task_delete',
  // 空间
  'api_space_create', 'api_space_update', 'api_space_delete',
  // —— 空间记忆追加：在用户磁盘上写 MEMORY.md / progress.md（写副作用）——
  // ★ 与 api_space_memory_read 成对出现，一个读一个写，**不能只登记读的那个**：
  //   read 在 READONLY_SAFE_TOOLS 白名单里（正确），append 若不登记就是"写着只读实则可写"。
  //   实测（2026-09-27）：append 此前既没进写清单、也没进只读白名单 →
  //   落在兜底分支被放行 → 只读会话能往用户磁盘写文件。
  'api_space_memory_append',
  // —— 会话自配置：改当前会话的智能体/技能/模式（会改变后续所有轮次的执行身份）——
  // ★ 与配置变更同类：改完之后整个会话的行为都会变，只读会话里不应放行。
  'api_conversation_setup',
  // —— 自举能力：模型"自己造/装/挂"工具与技能（2026-09-28 随自举工具集挂载一并登记）——
  // ★★ 这批必须全部登记：它们**写库**（custom_tool / skill / agent 三张表）甚至**改智能体挂载**
  //    （改变后续所有轮次的工具面），副作用比一次性写文件更大。漏登记 = 只读会话静默可写
  //    （本项目已犯两次：api_space_set_task_type、api_space_memory_append）。
  // ★ 成对登记：create 与 update、install 与 create 都要在，不能只登记"看起来更危险"的那个 ——
  //    半开状态（能装不能改）既难理解又同样是越权。
  'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_delete', 'api_custom_tool_toggle',
  // ★★★ api_custom_tool_execute（2026-09-29 补登记，**第 4 次同类事故**）：
  //   它执行的是**用户/模型自定义工具**的代码（Node 沙箱或 Python 子进程）——
  //   沙箱虽屏蔽 require/process，但 python 分支可读写工作目录内的文件（file_write 同性质），
  //   且自定义工具本身可声明依赖、产出文件 → **副作用无法静态判定**，必须按写类处理。
  //   ★ 为什么又漏了：它名字里是 execute（不是 create/update/delete），
  //     且"执行一个工具"听起来像正常动作 —— 与 api_message_send / api_ollama_delete 同一类陷阱。
  //   ⇒ 判据（第三次重申）：**按实现判读写，不按名字判**；execute 就是"跑代码"，等于写。
  'api_custom_tool_execute',
  'api_skill_create', 'api_skill_update', 'api_skill_delete', 'api_skill_toggle', 'api_skill_install',
  'api_tool_install',
  'api_agent_create', 'api_agent_update', 'api_agent_delete', 'api_agent_mount',
  'api_marketplace_add_source', 'api_marketplace_delete_source', 'api_marketplace_install',
  // —— 媒体生成/加工类：**明确放行**（用户 2026-09-29 决策：「那就放行啊」）——
  //
  // ★ 现状：这一类**全部不在**本清单里，只读会话里一律可执行：
  //   api_image_generate / api_video_generate / api_tts_speak / api_srt_generate /
  //   media_compose / media_edit / api_media_normalize / api_media_fetch /
  //   media_install_ffmpeg / media_install_ytdlp
  //
  // ★★ 为什么放行是**有意为之**，不是漏登记（后人别"顺手加回去"）：
  //   这些工具不是「改用户文件」，而是「按用户要求生产新素材」——
  //   它们把产物写进**会话交付目录**（mediaTarget → 会话 artifact 目录），
  //   本质与 `file_read` 同类：用户要的就是这份产出，不存在"偷偷改了用户的东西"。
  //   媒体生产本身就该在用户当前会话里正常工作，不该被只读模式挡掉。
  //
  // ★ 由此产生的**边界**（与 file_write 的区别仍然保留）：
  //   - 只读会话里**不能**用 file_write / file_edit 去改用户已有文件；媒体产物是新建，不是覆盖；
  //   - `media_edit` 的输入是本机绝对路径 —— 理论上指向用户已有文件也只**读**它、
  //     产物落新路径，不写回原文件，故与"改文件"不同性质。
  //
  // ★ 与之相对，**工作流**（`wf_*`）侧仍由 `READONLY_SAFE_TOOLS` 白名单兜底；
  //   由于媒体工具不在那个白名单里，**工作流**里的媒体节点在只读会话下仍会被拒 ——
  //   这是既有的另一套口径，本次未改动。
  //
  // ★ novel_tuiwen（有声小说推文视频生成，2026-10-04）同属"按用户要求生产新素材"类：
  //   输入章节 .txt + 背景视频，产物是**新建** mp4（落工作目录 output/），不改用户已有文件
  //   → 与 media_compose 同口径，**有意不登记**本清单（只读会话放行）。后人别"顺手加回去"。
]);

/**
 * 会话挂载但副作用不可静态判定的来源（readonly 模式拒绝执行）。
 *
 * `wf_` 工作流必须算进来：一条 DAG 里可能有 tool 节点（file_write / api_image_generate /
 * 甚至 cmd_exec 类工具），只读会话里放行等于绕过权限 —— 且工作流是**异步后台执行**的，
 * 用户点了之后很难马上意识到它写了文件。与 custom_/mcp_ 同性质，一律拒绝。
 */
const UNCONTROLLABLE_PREFIXES = ['custom_', 'mcp_', 'wf_'];

/** 委派给子智能体：子体可能调用任意写工具，readonly 下必须拒绝（深度>=1 亦由调用侧限制）
 *  ★ spawn_subagent（运行时现场生成子智能体）与 call_agent 同性质：
 *    它虽然自己不在子体里开放写工具，但**继承了父级可用的全部非写工具**，
 *    且是"模型自选能力组合"的入口 —— 只读会话里必须一并拒绝，
 *    否则就成了绕过权限分级的后门（父级只读，却生成一个能写文件的子智能体）。 */
const DELEGATION_TOOLS = new Set([
  'call_agent', 'spawn_subagent',
  // ★★ 多智能体编排（2026-10-08）：plan_tasks / reassign_task 与 call_agent **同性质** ——
  //   它们不自己写文件，但会派发子智能体执行，子体可调用任意写工具（file_write / cmd_exec…）。
  //   只读会话里放行 = 绕过权限分级（父级只读，却编排出一批能写的子体）。
  //   ★ 这是本项目**第 N 次**"新工具忘了登记权限清单"的同族问题（前例：api_space_memory_append、
  //     api_message_send、api_custom_tool_execute）—— 判据仍是**按实现判**：谁最终能写，就登记谁。
  //   get_plan_status 是纯读，进 INTERACTION_TOOLS。
  'plan_tasks', 'reassign_task',
]);

/** 纯交互/规划类工具：不产生外部副作用，任何模式都放行 */
const INTERACTION_TOOLS = new Set([
  'ask_user', 'confirm_user', 'task_plan', 'task_step',
  'image_analyze', 'list_models', 'list_sub_agents',
  // 计划状态查询：纯读 task_plan_item 表，无副作用（2026-10-08）
  'get_plan_status',
]);

export interface ToolPermissionVerdict {
  allowed: boolean;
  /** 拒绝时返回给模型的原因（模型据此改策略，而不是反复重试） */
  reason?: string;
}

/**
 * 判定某个工具在当前权限模式下是否可执行。
 * full / default 一律放行（保持既有行为，权限拦截是 readonly 专属的收窄）。
 */
export function checkToolPermission(mode: PermissionMode, toolName: string): ToolPermissionVerdict {
  if (mode !== 'readonly') return { allowed: true };

  if (INTERACTION_TOOLS.has(toolName)) return { allowed: true };

  if (WRITE_TOOLS.has(toolName)) {
    return { allowed: false, reason: `当前会话为「只读权限」，工具 \`${toolName}\` 具有写副作用，已拒绝执行。` };
  }
  for (const p of UNCONTROLLABLE_PREFIXES) {
    if (toolName.startsWith(p)) {
      return { allowed: false, reason: `当前会话为「只读权限」，外部来源工具 \`${toolName}\`（${p.slice(0, -1)}）的副作用不可判定，已拒绝执行。` };
    }
  }
  if (DELEGATION_TOOLS.has(toolName)) {
    return { allowed: false, reason: `当前会话为「只读权限」，\`${toolName}\` 委派的子智能体可能执行写操作，已拒绝执行。` };
  }
  return { allowed: true };
}

/** 工具 schema 数组裁剪：readonly 模式下把写工具从工具列表里摘掉，模型看不到就不会白试。 */
export function filterToolsByPermission<T extends { name?: string; function?: { name?: string } }>(
  mode: PermissionMode,
  tools: T[],
): T[] {
  if (mode !== 'readonly') return tools;
  return tools.filter((t) => {
    const name = t?.name || t?.function?.name || '';
    return checkToolPermission(mode, name).allowed;
  });
}

/** 生成喂给模型的权限指令段，让模型一开始就按只读方式规划，避免反复撞墙。 */
export function permissionModePrompt(mode: PermissionMode): string {
  if (mode !== 'readonly') return '';
  return [
    '- 只读权限模式：本次会话已被用户限制为只读。禁止创建、修改、删除任何文件，禁止执行命令、运行代码，',
    '禁止执行任何会改变页面或远端状态的操作。可以读取文件、查看目录、联网检索、浏览网页内容、向用户提问。',
    '若任务确实必须写入或修改，先向用户说明需要放开权限，不要尝试绕过限制。',
  ].join('\n');
}

// ============================================================
// 工作流按内容判定（wf_<agentId>）
// ============================================================

/**
 * 只读模式下，工作流 tool 节点**允许**调用的工具白名单。
 *
 * 为什么用白名单而不是复用 WRITE_TOOLS 黑名单（实测踩到）：
 * 我一开始按黑名单判，结果短剧流水线**在只读会话里放行了** —— 它的写操作是
 * `api_image_generate` / `api_tts_speak` / `api_srt_generate`（产图片/音频/字幕文件），
 * 这些媒体生成工具不在写清单里。用黑名单枚举「哪些工具会写」注定漏，而且是静默漏。
 * 反过来只放行「明确只读」的工具，漏掉的最坏结果是误拒（用户看得见、可放开权限），
 * 而不是静默放行一个写操作。
 */
const READONLY_SAFE_TOOLS = new Set([
  // 文件/代码：只读
  'file_read', 'file_list', 'file_grep', 'code_search', 'code_outline',
  // 静态诊断：只跑编译器/linter 读项目，不写任何文件
  'code_diagnostics',
  // 模型与多媒体理解（不产生文件）
  'list_models', 'image_analyze',
  // 纯交互/展示（无副作用）：任务进度、向用户提问
  'task_plan', 'task_step', 'ask_user', 'confirm_user', 'get_plan_status',
  // 查询/读取类 API（按 api-tool-executor 的命名：list / get / search / browse）
  'api_kb_search', 'api_kb_list', 'api_kb_document_list', 'api_kb_chunks', 'api_kb_graph',
  'api_kb_search_all', 'api_kb_multi_hop', 'api_kb_entity_search', 'api_kb_revectorize_status',
  'api_kb_embedding_model', 'api_kb_entity_graph',
  'api_agent_list', 'api_agent_get',
  'api_conversation_list', 'api_conversation_get',
  'api_conversation_file_list',
  'api_message_list',
  'api_platform_list', 'api_model_list',
  'api_mcp_server_list', 'api_mcp_tool_list',
  'api_skill_list', 'api_skill_get',
  'api_custom_tool_list', 'api_custom_tool_get',
  'api_builtin_tool_list',
  'api_workspace_list_dir', 'api_workspace_search_files',
  // 语义代码检索：只读（embedding 相似度，不写任何东西）
  'api_code_semantic_search',
  // 精确跳转定义（tsserver）：只读（跑语言服务，不写任何东西）
  'api_code_definition',
  'api_memory_search', 'api_memory_list',
  'api_file_list',
  'api_git_status', 'api_git_log', 'api_git_diff', 'api_git_branch_list',
  'api_scheduled_task_list',
  'api_marketplace_sources', 'api_marketplace_browse',
  'api_im_connector_list',
  'api_space_memory_read', 'api_browser_memory_read',
]);

/**
 * 工作流工具在 readonly 下的放行判定。
 *
 * 判定口径：
 *   1) tool 节点：工具名必须在 READONLY_SAFE_TOOLS 白名单里，否则拒绝；
 *   2) sub_agent 节点：保守拒绝（子流程可能写）；
 *   3) code 节点：表达式命中危险模式（fs.write / child_process / exec …）→ 拒绝；
 *   4) 拿不到定义 → 拒绝（信息不足时宁可误拒，绝不静默放行）。
 *
 * 前缀拦截仍保留在 checkToolPermission 里作为兜底。
 */
const RISKY_CODE_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bchild_process\b|\bexecSync\b|\bspawnSync?\b/, why: '执行系统命令' },
  { re: /\bfs\s*\.\s*(write|append|unlink|rm|mkdir|rename|copyFile|createWriteStream)/, why: '写文件系统' },
  { re: /\brequire\s*\(\s*['"](node:)?fs['"]/, why: '引入文件系统模块' },
  { re: /\bwriteFileSync\b|\bwriteFile\b|\bappendFile/, why: '写文件' },
];

export function checkWorkflowPermission(
  mode: PermissionMode,
  workflow: { nodes?: Array<{ id?: string; type?: string; config?: Record<string, unknown> }> } | null | undefined,
  toolName = 'wf_',
): ToolPermissionVerdict {
  if (mode !== 'readonly') return { allowed: true };
  const nodes = workflow?.nodes || [];
  // 拿不到定义 → 保守拒绝（宁可误伤也不要静默放行）
  if (!nodes.length) {
    return { allowed: false, reason: `当前会话为「只读权限」，工作流 \`${toolName}\` 的定义不可读，无法确认其是否有写操作，已拒绝执行。` };
  }

  const deny = (nodeId: string, why: string) => ({
    allowed: false,
    reason: `当前会话为「只读权限」，工作流 \`${toolName}\` 的节点 \`${nodeId}\` 会${why}，已拒绝执行。若确需运行，请先放开该会话权限。`,
  });

  for (const n of nodes) {
    const id = String(n?.id || n?.type || '?');
    const type = String(n?.type || '');
    const config = (n?.config || {}) as Record<string, unknown>;

    if (type === 'tool') {
      const name = String(config.toolName || config.tool_name || config.tool || config.name || '');
      // 没写工具名 → 交给运行期判定（静态预检也不报，避免噪音）
      if (!name) continue;
      // mcp_ / custom_ 一律拒（副作用不可静态判定）
      if (name.startsWith('mcp_') || name.startsWith('custom_')) {
        return deny(id, `调用外部来源工具 ${name}（副作用不可判定）`);
      }
      if (!READONLY_SAFE_TOOLS.has(name)) {
        return deny(id, `调用可能产生副作用的工具 ${name}`);
      }
      continue;
    }

    if (type === 'sub_agent') return deny(id, '委派子智能体（其可能执行写操作）');

    // memory_write 节点直接写记忆库 —— 比 tool 节点隐蔽（没有工具名可查），必须显式拦
    if (type === 'memory_write') return deny(id, '写入记忆库');

    if (type === 'code') {
      const expr = String(config.expression || '');
      for (const { re, why } of RISKY_CODE_PATTERNS) {
        if (re.test(expr)) return deny(id, why);
      }
    }
  }
  return { allowed: true };
}
