// 会话级工具权限：把工具按「是否有副作用」分类，供 readonly 模式裁剪/拦截使用。
// 设计要点：
//  1) 判定方向是「黑名单写操作 + 不可控来源兜底」，而不是穷举读白名单——
//     新工具即便忘了登记，只要它看起来是写操作或未归类，readonly 下默认拒绝（安全默认）。
//  2) 不可控来源（custom_ 自定义代码 / mcp_ 外部服务 / call_agent 委派）一律视为写，
//     因为无法静态判断其副作用。

/** 会话级工具权限模式 */
export type PermissionMode = 'readonly' | 'default' | 'full';

export function normalizePermissionMode(v: unknown): PermissionMode {
  return v === 'readonly' || v === 'full' ? v : 'default';
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
]);

/** 会话挂载但副作用不可静态判定的来源（readonly 模式拒绝执行） */
const UNCONTROLLABLE_PREFIXES = ['custom_', 'mcp_'];

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
