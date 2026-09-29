/**
 * spawn-subagent.test.ts 的等价静态断言 runner。
 *
 * ★ 为什么需要它：本机 pnpm 的 vitest 包目录为空（`.pnpm/vitest@*` 内 0 条目，已知环境问题），
 *   正式测试类跑不起来。这个 runner 直接读源码剥注释后断言，脱机即可核验。
 *   ★ 放在 tools/ 而不是 tmp/ —— tmp/ 会被清理（本项目踩过"验证脚本被自己清掉"）。
 *
 * 用法：node tools/assert-spawn-subagent.cjs
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf-8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SPEC = strip(read('apps/server/src/services/subagent-spec.ts'));
const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const PERM = strip(read('apps/server/src/tool-permission.ts'));
const IDX = strip(read('packages/core/src/tool/builtin/index.ts'));
const TOOL = strip(read('packages/core/src/tool/builtin/spawn-sub-agent.ts'));
const DB = strip(read('apps/server/src/db.ts'));

let pass = 0, fail = 0;
const out = [];
const ck = (name, ok, extra = '') => {
  if (ok) { pass++; out.push('  ✅ ' + name + (extra ? ' — ' + extra : '')); }
  else { fail++; out.push('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};
const group = (t, fn) => { out.push(''); out.push('=== ' + t + ' ==='); fn(); };
function anchor(code, needle, label) {
  const i = code.indexOf(needle);
  if (i < 0) { out.push(`  ❌ 锚点失效（源码结构变了）：${label}`); fail++; return -1; }
  return i;
}
function win(code, needle, len, label) {
  const i = anchor(code, needle, label || needle);
  return i < 0 ? '' : code.slice(i, i + len);
}

group('① 不得提权 —— 子智能体工具必须是父级子集', () => {
  const body = win(SPEC, 'export function resolveSpecTools', 2600, 'resolveSpecTools');
  ck('★★★ 越权项同时从 pinned 剔除（只记 dropped 不改 pinned = 提权漏洞）', body.includes('parentSet.has(n)'));
  ck('★★★ 越权项被显式排除', /overreachSet|overreach\.has/.test(body));
  ck('★★ 通配展开以父级集合为全集', /expandToolPatterns\(args\.requested,\s*parentSet\)/.test(SPEC));
  ck('★★ 拒绝时回显原因', body.includes('不得提权获得'));
  const exp = win(SPEC, 'export function expandToolPatterns', 900, 'expandToolPatterns');
  ck('★ 裸 * 被拦（等于一步要到所有权限）', /if \(!prefix\) continue/.test(exp));
  ck('★ 工具数硬上限', SPEC.includes('MAX_PINNED_TOOLS'));
});

group('② 黑名单 —— 派生类 / 定义类工具不可转授', () => {
  const i = anchor(SPEC, 'export const SPEC_TOOL_BLACKLIST', '黑名单');
  const body = i < 0 ? '' : SPEC.slice(i, i + 1200);
  for (const n of ['call_agent', 'spawn_subagent', 'list_sub_agents']) {
    ck(`★★★ 防递归自增殖：黑名单含 ${n}`, body.includes(`'${n}'`));
  }
  for (const n of ['api_agent_create', 'api_agent_update', 'api_agent_mount', 'api_conversation_setup']) {
    ck(`★★★ 防自我提权：黑名单含 ${n}`, body.includes(`'${n}'`));
  }
  const rs = win(SPEC, 'export function resolveSpecTools', 2600, 'resolveSpecTools');
  ck('★★ 黑名单在裁剪时生效', rs.includes('SPEC_TOOL_BLACKLIST.has(name)'));
  ck('★★ 执行侧双保险：spawn 自身深度闸', /depth >= 1\) return '子智能体不能再生成子智能体/.test(LTM));
});

group('③ 预算闸', () => {
  ck('★★ DEFAULT_MAX_SPAWN_PER_TASK 存在', SPEC.includes('DEFAULT_MAX_SPAWN_PER_TASK'));
  const b = win(SPEC, 'export function checkSpawnBudget', 900, 'checkSpawnBudget');
  ck('★★ 上限处真拦下', b.includes('allowed: false'));
  ck('★★ 给出替代方案', /call_agent|自己完成/.test(b));
  ck('★★ 计数在 task 上（非模块级全局）', LTM.includes('spawnCount?: number'));
  ck('★★ 生成后自增', LTM.includes('task.spawnCount = used + 1'));
  ck('★ 可由 config_json 覆盖', LTM.includes('maxSpawnPerTask'));
});

group('④ 权限分级穿透', () => {
  const d = win(PERM, 'DELEGATION_TOOLS', 200, 'DELEGATION_TOOLS');
  ck('★★ spawn_subagent 属委派类（只读会话拒绝）', /'call_agent',\s*'spawn_subagent'/.test(d));
  const c = win(LTM, 'function collectParentToolIds', 2000, 'collectParentToolIds');
  ck('★★ 父级工具按会话权限过滤', /checkToolPermission\(mode, n\)/.test(c));
  ck('★ UI 交互工具不转授', c.includes('INTERACTIVE_TOOLS'));
});

group('⑤ 四元组语义', () => {
  const n = win(SPEC, 'export function normalizeSubAgentSpec', 1600, 'normalize');
  ck('★★ I 必填校验', n.includes('instruction 为必填项'));
  ck('★★ I 过简校验', n.includes('instruction 过于简略'));
  ck('★★ M 可指定（轻量模型省钱）', SPEC.includes('modelId?: string') && TOOL.includes("modelId: { type: 'string'"));
  const r = win(SPEC, 'export function renderSpecSystemPrompt', 2200, 'render');
  ck('★★ 告知看不到主对话', r.includes('看不到主对话'));
  ck('★★ 渲染 context（C 要素）', r.includes('## 上下文'));
  ck('★★ 要求结论可独立理解', r.includes('可独立理解'));
  ck('★ maxSteps 夹紧', /MAX_SPEC_MAX_STEPS, Math\.max\(MIN_SPEC_MAX_STEPS/.test(SPEC));
});

group('⑥ 工具链三段', () => {
  ck('★★ 注册段：import', /import \{ SpawnSubAgentTool \}/.test(IDX));
  ck('★★ 注册段：register', /registry\.register\(new SpawnSubAgentTool\(\)\)/.test(IDX));
  // ★ 用**原文**统计挂载点，不用 strip 后的文本：
  //   db.ts 里有个提示词模板串含 `target/*.jar`（注释形态的星号紧跟斜杠），
  //   会提前闭合 strip 的块注释正则 → 吞掉一段代码 → 统计少 1 处（假红）。
  //   挂载点统计与剥注释无关，直接用原文最可靠。
  const rawDb = read('apps/server/src/db.ts');
  const cnt = (rawDb.match(/'spawn_subagent'/g) || []).length;
  ck(`★★ 挂载段：默认助手/任务模式共 ${cnt} 处`, cnt >= 3);
  ck('★★ 提示词引导段', LTM.includes('现场生成子智能体（spawn_subagent）'));
  ck('★★★ 执行段：executeTool 分支', LTM.includes("toolName === 'spawn_subagent'"));
  ck('★★★ 执行段：后端实现', LTM.includes('async function runSpawnedSubAgent'));
  const sp = win(LTM, 'async function runSpawnedSubAgent', 6000, 'runSpawnedSubAgent');
  ck('★★ 复用同一条子智能体循环', sp.includes('await runSubAgent('));
  ck('★★ runSubAgent 接受 specOverride', /specOverride\?: \{/.test(LTM));
  ck('★★ 不建持久角色（不写 agent 表）', !sp.includes('INSERT INTO agent'));
  ck('★ 空间记忆留痕', LTM.includes('recordSpawnedSubAgent') && LTM.includes('开放工具'));
});

group('⑦ 模型引导质量', () => {
  ck('★★ 讲清与 call_agent 的分工', TOOL.includes('call_agent') && TOOL.includes('能用 call_agent 解决就不必 spawn'));
  const g = win(LTM, '## 缺少合适执行者时：现场生成子智能体', 4000, '使用引导');
  ck('★★ 写了"适合用的场景"', g.includes('适合用的场景'));
  ck('★★ 写了"不要用的场景"（防滥用）', g.includes('不要用的场景'));
  ck('★ 说明工具边界', /已挂载工具的子集/.test(g));
});

console.log(out.join('\n'));
console.log('');
console.log(`结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);