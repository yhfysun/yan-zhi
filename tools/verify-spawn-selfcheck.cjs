/**
 * 自检修复的验证（2026-09-29 第二轮）。
 *
 * 本轮自检发现并修的三个问题：
 *   ① ★★★ `collectParentToolIds` 的**兜底放行**是 fail-open ——
 *      拿不到父级清单就填入通用工具（含 file_write/cmd_exec），
 *      **绕过"不得提权"边界**。安全闸必须 fail-closed，已删除兜底。
 *   ② `spawn_subagent` 未排除在子智能体工具构建之外 ——
 *      虽运行时被深度闸拦住，但工具会先暴露给子智能体（白烧 token + 诱导重试）。
 *   ③ `shouldSuggestPersist` 是死代码 —— 已补 `specFingerprint` 并接进留痕链路。
 *
 * 用法：node tools/verify-spawn-selfcheck.cjs
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf-8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const SPEC = strip(read('apps/server/src/services/subagent-spec.ts'));

let pass = 0, fail = 0;
const out = [];
const ck = (name, ok, extra = '') => {
  if (ok) { pass++; out.push('  ✅ ' + name + (extra ? ' — ' + extra : '')); }
  else { fail++; out.push('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};
const group = (t, fn) => { out.push(''); out.push('=== ' + t + ' ==='); fn(); };
function win(code, needle, len, label) {
  const i = code.indexOf(needle);
  if (i < 0) { out.push(`  ❌ 锚点失效（源码结构变了）：${label || needle}`); fail++; return ''; }
  return code.slice(i, i + len);
}

group('① ★★★ 安全闸必须 fail-closed（自检发现并修复）', () => {
  // ★ fail-closed 的理由写在**注释**里，strip 后看不到 → 这块必须用原文
  const RAW_LTM = read('apps/server/src/llm-task-manager.ts');
  const rawBody = win(RAW_LTM, 'function collectParentToolIds', 2600, 'collectParentToolIds(原文)');
  const body = win(LTM, 'function collectParentToolIds', 2200, 'collectParentToolIds');
  ck('★★★ 已删除"兜底放行"（拿不到父级清单不再填入通用工具）',
    !/if \(ids\.size === 0\) for \(const n of/.test(body));
  ck('★★★ 兜底常量已整块移除（不留死代码）', !LTM.includes('SPEC_REUSABLE_BUILTIN_TOOLS'));
  ck('★★ 明确写明 fail-closed 的理由（防以后有人"好心"加回来）',
    /fail-closed/.test(rawBody));
  ck('★★ 说明"父级无能力时子智能体纯推理是正确行为"', /纯推理/.test(body));
  ck('★ 权限过滤仍在（只读会话写类工具不进全集）', /checkToolPermission\(mode, n\)/.test(body));
  ck('★ UI 工具与交互工具仍被排除', body.includes('INTERACTIVE_TOOLS'));
});

group('② 子智能体不得看到派生类工具（自检发现并修复）', () => {
  // ★ 锚点必须用**代码**（那是注释，strip 后没了）
  const body = win(LTM, "if (name === 'call_agent'", 700, '排除逻辑');
  ck('★★ spawn_subagent 已被排除（不暴露给子智能体）', body.includes("name === 'spawn_subagent'"));
  ck('★★ call_agent 仍被排除', body.includes("name === 'call_agent'"));
  ck('★★ list_sub_agents 仍被排除', body.includes("name === 'list_sub_agents'"));
  const rawExcl = win(read('apps/server/src/llm-task-manager.ts'), "// 子智能体不能再派生", 700, '排除说明(原文)');
  ck('★ 说明了为何要排除（先暴露再拒绝会白烧 token 并诱导重试）', /白烧 token/.test(rawExcl));
});

group('③ 沉淀建议链路已接通（原为死代码）', () => {
  ck('★★ specFingerprint 已实现', SPEC.includes('export function specFingerprint'));
  ck('★★ LTM 已导入 specFingerprint', LTM.includes('specFingerprint'));
  ck('★★ task 上有指纹计数（任务级，不跨任务串味）', LTM.includes('specFingerprints?: Map<string, number>'));
  ck('★★ 生成时累计并用 shouldSuggestPersist 判定', LTM.includes('shouldSuggestPersist(fpCount - 1)'));
  ck('★★ 事件里带上 suggestPersist（前端/日志可见）', LTM.includes('suggestPersist,'));
  ck('★★ 返回值里给模型可行动建议（让它转告用户）', /建议固化成正式子智能体/.test(LTM));
  ck('★ 只建议不自动建（不污染用户角色列表）', LTM.includes('api_agent_create') && !/INSERT INTO agent/.test(win(LTM, 'async function runSpawnedSubAgent', 7000, 'run')));
});

group('④ 指纹的保守口径（宁可漏报不误报）', () => {
  const body = win(SPEC, 'export function specFingerprint', 900, 'specFingerprint');
  ck('  去数字（同一类不同批次归并）', /replace\(\/\[0-9\]\/g/.test(body));
  ck('  去标点', /replace\(\/\[，。、；：/.test(body));
  ck('  截断 24 字符', /slice\(0, 24\)/.test(body));
  const rawSpec = read('apps/server/src/services/subagent-spec.ts');
  const commentBefore = rawSpec.slice(Math.max(0, rawSpec.indexOf('export function specFingerprint') - 1400), rawSpec.indexOf('export function specFingerprint'));
  ck('★★ 注释写明"无法可靠判断同类"是能力边界（防后人过度优化）', /宁可漏报/.test(commentBefore));
});

console.log(out.join('\n'));
console.log('');
console.log(`结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);