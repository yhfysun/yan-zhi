// 会话级工具权限：把工具按「是否有副作用」分类，供 readonly 模式裁剪/拦截使用。
// 设计要点：
//  1) 判定方向是「黑名单写操作 + 不可控来源兜底」，而不是穷举读白名单——
//     新工具即便忘了登记，只要它看起来是写操作或未归类，readonly 下默认拒绝（安全默认）。
//  2) 不可控来源（custom_ 自定义代码 / mcp_ 外部服务 / call_agent 委派）一律视为写，
//     因为无法静态判断其副作用。

/** 会话级工具权限模式 */
export type PermissionMode = 'readonly' | 'default' | 'full';

/**
 * 归一化权限模式。
 * ★ 非法值回落 **readonly**（fail-safe，2026-09-27 起默认档即只读）：
 *   垃圾值/未知的权限宁可误收窄（用户看得见、可手动放开），绝不静默放行。
 */
export function normalizePermissionMode(v: unknown): PermissionMode {
  return v === 'readonly' || v === 'full' ? v : v === 'default' ? 'default' : 'readonly';
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
  // —— 会话自配置：改当前会话的智能体/技能/模式（会改变后续所有轮次的执行身份）——
  // ★ 与配置变更同类：改完之后整个会话的行为都会变，只读会话里不应放行。
  'api_conversation_setup',
]);

/**
 * 会话挂载但副作用不可静态判定的来源（readonly 模式拒绝执行）。
 *
 * `wf_` 工作流必须算进来：一条 DAG 里可能有 tool 节点（file_write / api_image_generate /
 * 甚至 cmd_exec 类工具），只读会话里放行等于绕过权限 —— 且工作流是**异步后台执行**的，
 * 用户点了之后很难马上意识到它写了文件。与 custom_/mcp_ 同性质，一律拒绝。
 */
const UNCONTROLLABLE_PREFIXES = ['custom_', 'mcp_', 'wf_'];

/** 委派给子智能体：子体可能调用任意写工具，readonly 下必须拒绝（深度>=1 亦由调用侧限制） */
const DELEGATION_TOOLS = new Set(['call_agent']);

/** 纯交互/规划类工具：不产生外部副作用，任何模式都放行 */
const INTERACTION_TOOLS = new Set([
  'ask_user', 'confirm_user', 'task_plan', 'task_step',
  'image_analyze', 'list_models', 'list_sub_agents',
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
  // 模型与多媒体理解（不产生文件）
  'list_models', 'image_analyze',
  // 纯交互/展示（无副作用）：任务进度、向用户提问
  'task_plan', 'task_step', 'ask_user', 'confirm_user',
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
