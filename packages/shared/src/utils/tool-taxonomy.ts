// 工具分类单一真相源（2026-10-22）
//
// ★★★ 为什么需要这张表：
//   在此之前「有哪些工具」只有两处松散信息 ——
//   · `get_api_tools` 按**代码模块名**（agent/git/media…）分组，
//     但模块名是按源码文件切的，不是按用户意图切的：`api_tts_speak` 在 media 里，
//     `media_install_ffmpeg` 也在 media 里 —— 模型搜「语音」会漏掉装 ffmpeg 的路径。
//   · `api_builtin_tool_list` 干脆硬编码 8 条（实际 58 个内置工具），
//     模型问「有哪些文件工具」只能看到 file_read / file_write。
//   结果是模型经常"看不见"本来就有的能力，转而让用户自己动手。
//
// ★ 归类原则：按**使用者意图**分，不按代码文件分。
//   `api_tts_speak` → media-audio（不是 platform）
//   `media_install_ffmpeg` → media-install（不是 media-video）
//   这样"我要生成一段语音"和"我要装个能出声的东西"都搜得到。
//
// ★ 硬约束：每个分类成员数 ≤ MAX_TOOLS_PER_CATEGORY（20）。
//   超了就必须拆子类 —— 一屏塞 30 个工具，模型反而选不准。
//   git 因此拆成 git-read / git-write / git-advanced 三个（26 个图标量）。
//   守门测试 `tool-taxonomy-complete.test.ts` 钉死这条。
//
// ★ 新增工具时：必须同时在 TOOL_CATEGORY 里登记，否则测试红。

/** 分类枚举。命名即语义，不额外解释；顺序即 UI 展示顺序。 */
export const TOOL_CATEGORIES = [
  // 文件与代码
  'file', 'code', 'python-runtime',
  // 媒体
  'media-image', 'media-video', 'media-audio', 'media-compose', 'media-install',
  // 版本控制（git 拆三类：26 个超过上限）
  'git-read', 'git-write', 'git-advanced',
  // 数据与知识
  'data', 'knowledge', 'memory', 'experience',
  // 平台与配置
  'platform', 'agent', 'skill', 'plugin', 'mcp', 'task-type', 'space',
  'marketplace', 'tool-mgmt', 'scheduled-task', 'ollama',
  // 通信
  'conversation', 'message', 'peer', 'im', 'verification',
  // 系统与网络
  'system', 'network', 'browser',
  // 编排与交互
  'orchestrate', 'interaction', 'task', 'content-gen', 'discovery',
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

/** 单个分类的成员数上限（含）。超了拆子类。 */
export const MAX_TOOLS_PER_CATEGORY = 20;

/** 工具来源：api（服务端 executeApiTool）/ builtin（core registry）/ custom / mcp */
export type ToolSource = 'api' | 'builtin' | 'custom' | 'mcp';

/**
 * 工具名 → 分类。
 *
 * ⚠️ 只登记「名字→分类」，不登记描述（描述在各自定义处，避免双份漂移）。
 * ⚠️ 不在表里的工具视为未归类 → 守门测试报错。
 */
export const TOOL_CATEGORY: Record<string, ToolCategory> = {
  // ═══ 文件 ═══
  file_read: 'file',
  file_write: 'file',
  file_edit: 'file',
  file_list: 'file',
  file_grep: 'file',
  file_to_markdown: 'file',
  file_transcode: 'file',
  fs_walk: 'file',
  api_file_list: 'file',
  api_file_set_category: 'file',
  api_workspace_list_dir: 'file',
  api_workspace_search_files: 'file',
  api_conversation_file_list: 'file',
  api_conversation_file_add: 'file',
  api_conversation_file_update: 'file',
  api_conversation_file_delete: 'file',

  // ═══ 代码 ═══
  code_search: 'code',
  code_outline: 'code',
  code_refs: 'code',
  code_graph: 'code',
  code_diagnostics: 'code',
  code_ast: 'code',
  code_symbols: 'code',
  apply_patch: 'code',
  api_code_semantic_search: 'code',
  api_code_definition: 'code',
  api_git_blame: 'code',   // blame 是"谁改的这行"，纯代码考古，归 code 比归 git 更贴意图

  // ═══ 运行时 ═══
  python_exec: 'python-runtime',
  python_repair: 'python-runtime',
  job_status: 'python-runtime',
  js_exec: 'python-runtime',
  cmd_exec: 'python-runtime',

  // ═══ 媒体 · 图像 ═══
  image_analyze: 'media-image',
  api_image_generate: 'media-image',
  api_tool_ocr: 'media-image',
  api_media_normalize: 'media-image',

  // ═══ 媒体 · 视频 ═══
  api_video_generate: 'media-video',
  api_video_status: 'media-video',
  clip_project: 'media-video',
  clip_jianying: 'media-video',
  media_edit: 'media-video',
  media_compose: 'media-video',
  api_srt_generate: 'media-video',
  media_asr_transcribe: 'media-video',
  api_media_fetch: 'media-video',
  screen_record: 'media-video',
  demo_compose: 'media-video',
  anim_compose: 'media-video',

  // ═══ 媒体 · 音频 ═══
  api_tts_speak: 'media-audio',
  api_tts_voices: 'media-audio',
  api_sfx: 'media-audio',

  // ═══ 媒体 · 音乐创作 ═══
  music_compose: 'media-compose',
  music_generate: 'media-compose',
  music_sing: 'media-compose',

  // ═══ 媒体 · 安装/下载 ═══
  media_install_ffmpeg: 'media-install',
  media_install_ytdlp: 'media-install',
  media_install_singing: 'media-install',
  whisper_install: 'media-install',
  install_resource: 'media-install',

  // ═══ Git · 只读 ═══
  api_git_status: 'git-read',
  api_git_diff: 'git-read',
  api_git_log: 'git-read',
  api_git_branches: 'git-read',
  api_git_show: 'git-read',
  api_git_read_file: 'git-read',
  api_git_remote_branches: 'git-read',
  api_git_stash_list: 'git-read',
  api_git_tag_list: 'git-read',
  api_git_hunks: 'git-read',

  // ═══ Git · 写 ═══
  api_git_add: 'git-write',
  api_git_commit: 'git-write',
  api_git_stage_hunks: 'git-write',
  api_git_push: 'git-write',
  api_git_pull: 'git-write',
  api_git_fetch: 'git-write',
  api_git_checkout: 'git-write',
  api_git_restore: 'git-write',
  api_git_merge: 'git-write',
  api_git_tag_create: 'git-write',
  api_git_tag_delete: 'git-write',

  // ═══ Git · 进阶（历史改写）═══
  api_git_stash_save: 'git-advanced',
  api_git_stash_pop: 'git-advanced',
  api_git_revert: 'git-advanced',
  api_git_reset: 'git-advanced',
  api_git_cherry_pick: 'git-advanced',
  api_git_rebase: 'git-advanced',

  // ═══ 数据 ═══
  api_datasource_list: 'data',
  api_ontology_search: 'data',
  api_ontology_list: 'data',
  api_ontology_overview: 'data',
  api_ontology_brief: 'data',
  api_ontology_detail: 'data',
  api_ontology_values: 'data',
  api_data_query: 'data',
  api_data_preview: 'data',
  api_data_paginate: 'data',
  api_document_type_list: 'data',

  // ═══ 知识库 ═══
  api_kb_list: 'knowledge',
  api_kb_create: 'knowledge',
  api_kb_update: 'knowledge',
  api_kb_delete: 'knowledge',
  api_kb_document_add: 'knowledge',
  api_kb_document_list: 'knowledge',
  api_kb_document_delete: 'knowledge',
  api_kb_search: 'knowledge',
  api_kb_search_all: 'knowledge',
  api_kb_multi_hop: 'knowledge',
  api_kb_entity_search: 'knowledge',
  api_kb_chunks: 'knowledge',
  api_kb_graph: 'knowledge',
  api_kb_entity_graph: 'knowledge',
  api_kb_embedding_model: 'knowledge',
  api_kb_revectorize_status: 'knowledge',
  api_kb_builtin_guide_reset: 'knowledge',

  // ═══ 记忆 ═══
  api_memory_search: 'memory',
  api_memory_list: 'memory',
  api_memory_create: 'memory',
  api_memory_delete: 'memory',
  api_space_memory_read: 'memory',
  api_space_memory_append: 'memory',
  api_browser_memory_read: 'memory',

  // ═══ 经验 ═══
  api_experience_read: 'experience',
  api_experience_write: 'experience',

  // ═══ 平台与模型 ═══
  api_platform_list: 'platform',
  api_platform_create: 'platform',
  api_platform_update: 'platform',
  api_platform_delete: 'platform',
  api_model_list: 'platform',
  api_model_create: 'platform',
  api_model_update: 'platform',
  api_model_delete: 'platform',
  configure_model_platform: 'platform',
  compare_products: 'platform',
  list_models: 'platform',

  // ═══ 智能体 ═══
  api_agent_list: 'agent',
  api_agent_get: 'agent',
  api_agent_create: 'agent',
  api_agent_update: 'agent',
  api_agent_delete: 'agent',
  api_agent_mount: 'agent',

  // ═══ 技能 ═══
  api_skill_list: 'skill',
  api_skill_get: 'skill',
  api_skill_toggle: 'skill',
  api_skill_install: 'skill',
  api_skill_delete: 'skill',
  api_skill_create: 'skill',
  api_skill_update: 'skill',

  // ═══ 插件 ═══
  api_plugin_list: 'plugin',
  api_plugin_get: 'plugin',
  api_plugin_enable: 'plugin',
  api_plugin_disable: 'plugin',
  api_plugin_set_config: 'plugin',
  api_plugin_uninstall: 'plugin',

  // ═══ MCP ═══
  api_mcp_server_list: 'mcp',
  api_mcp_server_create: 'mcp',
  api_mcp_server_update: 'mcp',
  api_mcp_server_delete: 'mcp',
  api_mcp_tool_list: 'mcp',
  api_mcp_tool_toggle: 'mcp',

  // ═══ 任务类型 ═══
  api_task_type_list: 'task-type',
  api_task_type_create: 'task-type',
  api_task_type_update: 'task-type',
  api_task_type_delete: 'task-type',

  // ═══ 空间 ═══
  api_space_list: 'space',
  api_space_create: 'space',
  api_space_update: 'space',
  api_space_delete: 'space',
  api_space_set_task_type: 'space',

  // ═══ 市场 ═══
  api_marketplace_sources: 'marketplace',
  api_marketplace_add_source: 'marketplace',
  api_marketplace_delete_source: 'marketplace',
  api_marketplace_browse: 'marketplace',
  api_marketplace_install: 'marketplace',

  // ═══ 工具管理 ═══
  api_custom_tool_list: 'tool-mgmt',
  api_custom_tool_get: 'tool-mgmt',
  api_custom_tool_create: 'tool-mgmt',
  api_custom_tool_update: 'tool-mgmt',
  api_custom_tool_delete: 'tool-mgmt',
  api_custom_tool_toggle: 'tool-mgmt',
  api_custom_tool_execute: 'tool-mgmt',
  api_tool_install: 'tool-mgmt',
  api_builtin_tool_list: 'discovery',

  // ═══ 定时任务 ═══
  api_scheduled_task_list: 'scheduled-task',
  api_scheduled_task_create: 'scheduled-task',
  api_scheduled_task_update: 'scheduled-task',
  api_scheduled_task_delete: 'scheduled-task',
  api_scheduled_task_run: 'scheduled-task',

  // ═══ Ollama ═══
  api_ollama_list: 'ollama',
  api_ollama_pull: 'ollama',
  api_ollama_pull_status: 'ollama',
  api_ollama_delete: 'ollama',
  api_ollama_test: 'ollama',

  // ═══ 会话 ═══
  api_conversation_list: 'conversation',
  api_conversation_get: 'conversation',
  api_conversation_create: 'conversation',
  api_conversation_update: 'conversation',
  api_conversation_delete: 'conversation',
  api_conversation_setup: 'conversation',

  // ═══ 消息 ═══
  api_message_list: 'message',
  api_message_send: 'message',
  api_message_delete: 'message',

  // ═══ 点对点 ═══
  api_peer_register: 'peer',
  api_peer_list: 'peer',
  api_peer_ping: 'peer',
  api_chat_send: 'peer',
  api_chat_poll: 'peer',

  // ═══ IM 连接器 ═══
  api_im_connector_list: 'im',
  api_im_connector_create: 'im',
  api_im_connector_update: 'im',
  api_im_connector_delete: 'im',
  api_im_send: 'im',
  api_im_connector_test: 'im',
  api_im_status: 'im',
  api_im_send_message: 'im',
  api_im_contact_search: 'im',
  api_im_chat_list: 'im',

  // ═══ 验证码中继 ═══
  api_verification_code_latest: 'verification',
  api_verification_code_list: 'verification',

  // ═══ 系统 ═══
  doyz: 'system',
  security: 'system',
  http_request: 'network',

  // ═══ 网络 ═══
  port_scan: 'network',
  lan_scan: 'network',
  tcp_send: 'network',
  udp_send: 'network',
  dns_lookup: 'network',
  net_scan: 'network',

  // ═══ 编排 ═══
  call_agent: 'orchestrate',
  list_sub_agents: 'orchestrate',
  spawn_subagent: 'orchestrate',
  get_sub_task_detail: 'orchestrate',
  plan_tasks: 'orchestrate',
  get_plan_status: 'orchestrate',
  reassign_task: 'orchestrate',

  // ═══ 交互 ═══
  ask_user: 'interaction',
  confirm_user: 'interaction',
  app_open_window: 'interaction',

  // ═══ 任务 ═══
  task_plan: 'task',
  task_step: 'task',
  app_create_task: 'task',
  app_get_task_status: 'task',

  // ═══ 内容生产 ═══
  novel_tuiwen: 'content-gen',
  design_asset_sites: 'content-gen',
  publish_enqueue: 'content-gen',
  publish_mark_published: 'content-gen',
  publish_record_stats: 'content-gen',

  // ═══ 工具发现 ═══
  get_api_tools: 'discovery',
  api_tool_search: 'discovery',
  api_tool_detail: 'discovery',

  // ═══ 内置管理工具（management.ts，名字不带 api_ 前缀但由 executeApiTool 执行）═══
  list_platforms: 'platform',
  list_tools: 'tool-mgmt',
  enable_tool: 'tool-mgmt',
  disable_tool: 'tool-mgmt',
  list_skills: 'skill',
  list_agents: 'agent',
  search_marketplace: 'marketplace',
  web_search: 'network',
};

/** 取某工具的分类；未登记返回 null（守门测试据此报错）。 */
export function categoryOf(toolName: string): ToolCategory | null {
  return TOOL_CATEGORY[toolName] ?? null;
}

/** 按分类聚合（保持 TOOL_CATEGORIES 的展示顺序）。 */
export function groupByCategory(
  tools: Array<{ name: string; source: ToolSource }>,
): Array<{ category: ToolCategory; tools: Array<{ name: string; source: ToolSource }> }> {
  const map = new Map<ToolCategory, Array<{ name: string; source: ToolSource }>>();
  for (const t of tools) {
    const c = categoryOf(t.name);
    if (!c) continue;
    if (!map.has(c)) map.set(c, []);
    map.get(c)!.push(t);
  }
  return TOOL_CATEGORIES.filter((c) => map.has(c)).map((c) => ({ category: c, tools: map.get(c)! }));
}

/** 通用分页（工具清单统一走它，保证 page/pageSize 语义一致）。 */
export function paginate<T>(
  items: T[],
  page = 1,
  pageSize = MAX_TOOLS_PER_CATEGORY,
): { items: T[]; page: number; pageSize: number; total: number; totalPages: number } {
  const size = Math.max(1, Math.min(pageSize, MAX_TOOLS_PER_CATEGORY));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const p = Math.max(1, Math.min(page, totalPages));
  return { items: items.slice((p - 1) * size, p * size), page: p, pageSize: size, total, totalPages };
}
