// 一次性盘点：API 工具 / 内置工具的「注册 vs 挂载」缺口
const fs = require('fs');
const path = require('path');

const apiDir = 'packages/core/src/tool/builtin/api-tools';
let apiNames = [];
for (const f of fs.readdirSync(apiDir)) {
  if (f === 'index.ts') continue;
  const t = fs.readFileSync(path.join(apiDir, f), 'utf-8');
  for (const m of t.matchAll(/name:\s*'((?:api_|media_)[a-z0-9_]+)'/g)) apiNames.push(m[1]);
}
const exec = fs.readFileSync('apps/server/src/mcp/api-tool-executor.ts', 'utf-8');
const supported = [...exec.matchAll(/'(api_[a-z0-9_]+|media_[a-z0-9_]+)'/g)].map((m) => m[1]);
const all = new Set([...apiNames, ...supported]);

const mountFiles = [
  'apps/server/src/db.ts',
  'apps/server/src/builtin-office-agents.ts',
  'apps/server/src/builtin-task-mode-agents.ts',
  'apps/server/src/builtin-workflow-agents.ts',
  'apps/server/src/constants.ts',
  'apps/server/src/builtin-task-mode-agents.ts',
];
let mountText = '';
for (const f of mountFiles) {
  if (fs.existsSync(f)) mountText += fs.readFileSync(f, 'utf-8') + '\n';
}

const unmounted = [...all].filter((n) => !mountText.includes("'" + n + "'"));
console.log('API 工具总数:', all.size);
console.log('在种子/挂载清单里出现过:', all.size - unmounted.length);
console.log('\n=== 从未出现在任何种子/挂载清单里的 API 工具 ===');
console.log(unmounted.sort().join('\n'));

console.log('\n=== 关键「自举 / 长任务」类工具挂载状态 ===');
const key = [
  'get_api_tools', 'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_execute',
  'api_tool_install', 'api_skill_create', 'api_skill_install', 'api_skill_update',
  'api_agent_create', 'api_agent_update', 'api_agent_mount', 'api_agent_delete',
  'api_space_memory_read', 'api_space_memory_append', 'api_memory_create',
  'api_conversation_setup', 'api_marketplace_browse', 'api_marketplace_install',
  'task_plan', 'task_step', 'call_agent', 'list_sub_agents',
];
for (const n of key) {
  console.log(n.padEnd(30), mountText.includes("'" + n + "'") ? '✅ 已在种子清单' : '❌ 未挂载');
}