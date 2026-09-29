/**
 * 权限登记真执行验证 —— 只读会话必须拦住所有写类工具。
 *
 * ═══ 为什么需要"真执行"而不是静态断言 ═══
 * `WRITE_TOOLS` 是**闸门清单**：漏一个都不报错，只是"那个工具在只读会话里静默可写"。
 * 静态断言只能查"清单里有没有某个字符串"，查不出"**该在的没在**"——
 * 因为"该在哪些"这件事本身没有别的真相源。
 * 所以这里的做法是：**在测试里显式列出「必须被拒」与「必须放行」两组**，
 * 直接跑 `checkToolPermission('readonly', name)` 看真实判定。
 *
 * ★ 本项目已因漏登记犯过三次（都是"写着只读实则可写"）：
 *   1. api_space_set_task_type
 *   2. api_space_memory_append
 *   3. api_memory_create / api_memory_delete（2026-09-29 自检抓到，且它们还是
 *      `buildToolsForBackend` 的 alwaysApiTools —— 无条件暴露给**所有**智能体）
 *   另加 api_message_send（同批抓到：名字是 send，实现里有 INSERT INTO message）。
 *
 * 用法：node tools/verify-tool-permission.cjs
 * 依赖：apps/server/dist（先 tsc -p apps/server/tsconfig.json + fix-esm-extensions）
 */
const path = require('path');
const { pathToFileURL } = require('url');

const DIST = path.resolve(__dirname, '..', 'apps/server/dist/apps/server/src/tool-permission.js');

/** 必须被只读会话拒绝的工具（写副作用） */
const MUST_REJECT = [
  // 文件 / 执行
  'file_write', 'file_edit', 'cmd_exec', 'python_exec',
  // 记忆库（2026-09-29 补登记；且在 alwaysApiTools 里无条件暴露）
  'api_memory_create', 'api_memory_delete',
  // 会话与消息
  'api_message_send', 'api_message_delete',
  'api_conversation_create', 'api_conversation_update', 'api_conversation_delete',
  'api_conversation_file_delete',
  // 知识库
  'api_kb_builtin_guide_reset',
  // MCP
  'api_mcp_server_create', 'api_mcp_server_update', 'api_mcp_server_delete', 'api_mcp_tool_toggle',
  // 平台 / 模型
  'api_platform_create', 'api_platform_update', 'api_platform_delete',
  'api_model_create', 'api_model_update', 'api_model_delete',
  'api_ollama_delete',
  // 插件
  'api_plugin_set_config', 'api_plugin_uninstall',
  // 定时任务
  'api_scheduled_task_create', 'api_scheduled_task_update', 'api_scheduled_task_delete',
  // 空间
  'api_space_create', 'api_space_update', 'api_space_delete',
  'api_space_set_task_type', 'api_space_memory_append',
  // 自举（写库 + 改挂载）
  'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_delete', 'api_custom_tool_toggle',
  'api_skill_create', 'api_skill_update', 'api_skill_delete', 'api_skill_toggle', 'api_skill_install',
  'api_tool_install',
  'api_agent_create', 'api_agent_update', 'api_agent_delete', 'api_agent_mount',
  'api_marketplace_add_source', 'api_marketplace_delete_source', 'api_marketplace_install',
  // 会话自配置与委派
  'api_conversation_setup', 'call_agent', 'spawn_subagent',
];

/** 必须放行的（读类/交互类，不能误伤） */
const MUST_ALLOW = [
  'file_read', 'file_list', 'file_grep', 'http_request', 'browser_navigate', 'browser_snapshot',
  'api_memory_search', 'api_memory_list',
  'api_kb_search', 'api_kb_list',
  'api_ollama_list', 'api_space_list', 'api_plugin_get', 'api_scheduled_task_list',
  'api_conversation_file_list', 'api_model_list', 'api_platform_list',
  'api_space_memory_read',
  'ask_user', 'confirm_user', 'task_plan', 'task_step', 'list_models', 'list_sub_agents',
  'get_api_tools',
];

/** 有意放行的媒体生产类（用户 2026-09-29 决策）——只读会话里允许 */
const INTENTIONAL_MEDIA = [
  'api_image_generate', 'api_video_generate', 'api_tts_speak', 'api_srt_generate',
];

(async () => {
  const perm = await import(pathToFileURL(DIST).href);
  let pass = 0, fail = 0;
  const out = [];
  const ck = (n, ok, x = '') => {
    if (ok) { pass++; out.push('  ✅ ' + n + (x ? ' — ' + x : '')); }
    else { fail++; out.push('  ❌ ' + n + (x ? ' — ' + x : '')); }
  };

  out.push('=== ① 只读会话：写类必须全部拒绝 ===');
  out.push(`（共 ${MUST_REJECT.length} 个）`);
  for (const t of MUST_REJECT) {
    const v = perm.checkToolPermission('readonly', t);
    ck('拒 ' + t, !v.allowed, v.allowed ? '★ 漏登记：只读会话可执行' : '');
  }

  out.push('');
  out.push('=== ② 只读会话：读类/交互类必须放行（防误伤）===');
  out.push(`（共 ${MUST_ALLOW.length} 个）`);
  for (const t of MUST_ALLOW) {
    const v = perm.checkToolPermission('readonly', t);
    ck('放 ' + t, v.allowed, v.allowed ? '' : (v.reason || '').slice(0, 50));
  }

  out.push('');
  out.push('=== ③ 媒体生产类：有意放行（别"顺手加回" WRITE_TOOLS）===');
  for (const t of INTENTIONAL_MEDIA) {
    const v = perm.checkToolPermission('readonly', t);
    ck('放 ' + t, v.allowed, v.allowed ? '（符合 2026-09-29 决策）' : '★ 被误登记为写类');
  }

  out.push('');
  out.push('=== ④ default / full 模式不受影响（不能把正常会话也拦了）===');
  for (const t of ['api_memory_create', 'api_space_delete', 'api_message_send', 'file_write']) {
    ck('default 放 ' + t, perm.checkToolPermission('default', t).allowed);
    ck('full 放 ' + t, perm.checkToolPermission('full', t).allowed);
  }

  console.log(out.join('\n'));
  console.log('');
  console.log(`结果: ${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message); process.exit(2); });