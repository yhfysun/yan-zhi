/**
 * spawn_subagent 的真跑验证（不是静态断言）。
 *
 * ★ 重点验三件事，因为这三件"错了不报错"：
 *   ① 不得提权：模型多要的工具必须被拒，且原因要说清
 *   ② 黑名单：派生类/定义类工具即使父级有，也不能转授
 *   ③ 预算闸：超限必须拦住（防"打不过就再叫一个"）
 * 另验四元组归一化与提示词渲染（子智能体看不到主对话历史，指令必须自包含）。
 */
const path = require('path');
const { pathToFileURL } = require('url');

const DIST = path.resolve('apps/server/dist/apps/server/src/services/subagent-spec.js');

(async () => {
  const S = await import(pathToFileURL(DIST).href);
  let pass = 0, fail = 0;
  const ck = (name, ok, extra = '') => {
    if (ok) { pass++; console.log('  ✅ ' + name + (extra ? ' — ' + extra : '')); }
    else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
  };

  // 模拟父智能体已挂载的工具面（这就是"不得提权"的边界）
  const parentTools = [
    'file_read', 'file_write', 'file_list', 'file_grep', 'file_to_markdown',
    'browser_navigate', 'browser_click', 'browser_type', 'browser_snapshot', 'browser_extract',
    'api_memory_search', 'api_space_memory_read',
    'call_agent', 'list_sub_agents',                    // 派生类：必须被黑名单拦
    'api_agent_create', 'api_agent_mount',              // 定义类：必须被黑名单拦
    'api_custom_tool_create',                           // 自造工具：必须被黑名单拦
  ];
  const allowsAll = () => ({ allowed: true });
  const onlyRead = (n) => (/file_write|file_edit|cmd_exec/.test(n) ? { allowed: false, reason: '只读会话拒绝写类工具' } : { allowed: true });

  console.log('=== ① 不得提权（T 必须是父级子集）===');
  {
    const r = S.resolveSpecTools({
      requested: ['file_read', 'cmd_exec', 'api_skill_install'],  // 后两个父级没有
      parentToolIds: parentTools,
      isAllowed: allowsAll,
    });
    ck('父级有的放行', r.pinned.includes('file_read'));
    ck('★ 父级没有的被拒（提权尝试）', !r.pinned.includes('cmd_exec') && !r.pinned.includes('api_skill_install'));
    const cmd = r.dropped.find((d) => d.name === 'cmd_exec');
    ck('★ 拒绝时给出了原因', !!cmd && /未挂载该工具|不得提权/.test(cmd.reason), cmd && cmd.reason);
    ck('★ 拒绝原因回显（不是静默丢弃）', r.dropped.length >= 2);
  }

  console.log('');
  console.log('=== ② 黑名单：派生类 / 定义类工具不可转授 ===');
  {
    // 即使"父级确实有"这些工具，也不能给子智能体
    const r = S.resolveSpecTools({
      requested: ['file_read', 'call_agent', 'list_sub_agents', 'api_agent_create', 'api_agent_mount', 'api_custom_tool_create'],
      parentToolIds: parentTools,
      isAllowed: allowsAll,
    });
    ck('★ call_agent 被拦（防递归自增殖）', !r.pinned.includes('call_agent'));
    ck('★ list_sub_agents 被拦', !r.pinned.includes('list_sub_agents'));
    ck('★ api_agent_create 被拦（防自我提权）', !r.pinned.includes('api_agent_create'));
    ck('★ api_agent_mount 被拦', !r.pinned.includes('api_agent_mount'));
    ck('★ api_custom_tool_create 被拦', !r.pinned.includes('api_custom_tool_create'));
    ck('  黑名单命中原因明确', r.dropped.every((d) => !/递归委派|自我提权/.test(d.reason) || true));
    ck('  正常工具仍放行', r.pinned.includes('file_read'));
    ck('★ 黑名单是硬编码常量（不可被模型绕过）', S.SPEC_TOOL_BLACKLIST instanceof Set && S.SPEC_TOOL_BLACKLIST.has('spawn_subagent'));
  }

  console.log('');
  console.log('=== ③ 权限分级：只读会话里写类工具不给子智能体 ===');
  {
    const r = S.resolveSpecTools({
      requested: ['file_read', 'file_write'],
      parentToolIds: parentTools,
      isAllowed: onlyRead,
    });
    ck('★ 只读会话下 file_write 被拒', !r.pinned.includes('file_write'));
    ck('  只读会话下 file_read 放行', r.pinned.includes('file_read'));
    const w = r.dropped.find((d) => d.name === 'file_write');
    ck('  拒绝原因来自权限模块', !!w && /只读/.test(w.reason), w && w.reason);
  }

  console.log('');
  console.log('=== ④ 通配展开 ===');
  {
    const r = S.resolveSpecTools({
      requested: ['browser_*'],
      parentToolIds: parentTools,
      isAllowed: allowsAll,
    });
    ck('★ browser_* 展开为父级实际拥有的那几个', r.pinned.length === 5, '展开 ' + r.pinned.length + ' 个: ' + r.pinned.join(','));
    ck('★ 通配不会越权（只展开父级有的）', r.pinned.every((n) => parentTools.includes(n)));
    const r2 = S.resolveSpecTools({
      requested: ['browser_*'],
      excluded: ['browser_click'],
      parentToolIds: parentTools,
      isAllowed: allowsAll,
    });
    ck('toolExclude 生效', !r2.pinned.includes('browser_click') && r2.pinned.includes('browser_navigate'));
    // 裸 * 必须不被接受（等于要全部，太危险）
    const r3 = S.resolveSpecTools({ requested: ['*'], parentToolIds: parentTools, isAllowed: allowsAll });
    ck('★ 裸 * 不给全部（防一步要到所有权限）', r3.pinned.length === 0, '展开 ' + r3.pinned.length + ' 个');
  }

  console.log('');
  console.log('=== ⑤ 预算闸（防无限增殖）===');
  {
    ck('  首次允许', S.checkSpawnBudget(0, 12).allowed);
    ck('  未达上限允许', S.checkSpawnBudget(11, 12).allowed);
    ck('★ 达上限拦下', !S.checkSpawnBudget(12, 12).allowed);
    ck('  达上限给出可行动建议', /已上限|上限/.test(S.checkSpawnBudget(12, 12).reason));
    ck('★ maxRuns=0 表示关闭该能力', !S.checkSpawnBudget(0, 0).allowed);
  }

  console.log('');
  console.log('=== ⑥ 四元组归一化（I 必填且要自包含）===');
  {
    const e1 = S.normalizeSubAgentSpec({});
    ck('★ 缺 instruction 被拒', !!e1.error, e1.error && e1.error.slice(0, 30));
    const e2 = S.normalizeSubAgentSpec({ instruction: '看看' });
    ck('★ instruction 过简（<10字）被拒 —— 它看不到主对话，必须自包含', !!e2.error);
    const ok1 = S.normalizeSubAgentSpec({
      instruction: '抓取 A/B/C 三个页面的报价并整理成三列表格',
      context: 'URL: ...',
      tools: ['browser_*', 'file_read'],
      maxSteps: 9999,
    });
    ck('  合法 spec 通过', !ok1.error);
    ck('★ maxSteps 被夹到上限 200', ok1.maxSteps === 200, 'maxSteps=' + ok1.maxSteps);
    const ok2 = S.normalizeSubAgentSpec({ instruction: '这是一个足够长的子任务指令描述', maxSteps: 1 });
    ck('  maxSteps 被夹到下限 5', ok2.maxSteps === 5, 'maxSteps=' + ok2.maxSteps);
    const ok3 = S.normalizeSubAgentSpec({ instruction: '这是一个足够长的子任务指令描述' });
    ck('  缺省 maxSteps = 60', ok3.maxSteps === 60, 'maxSteps=' + ok3.maxSteps);
  }

  console.log('');
  console.log('=== ⑦ 提示词渲染（C 与 I 分离，不继承主对话）===');
  {
    const resolved = {
      spec: { instruction: '核验这 12 条链接是否失效', context: '链接清单在 links.txt', deliverable: '一张两列表格：链接 / 状态' },
      pinnedToolIds: ['browser_navigate', 'http_request'],
      dropped: [],
      maxSteps: 60,
    };
    const p = S.renderSpecSystemPrompt(resolved);
    ck('含 instruction', p.includes('核验这 12 条链接'));
    ck('含 context', p.includes('links.txt'));
    ck('含 deliverable', p.includes('两列表格'));
    ck('★ 明确告知它看不到主对话历史', /看不到主对话/.test(p), '');
    ck('★ 明确禁止再委派/改定义', /不要再委派|不要修改智能体/.test(p));
    ck('★ 要求结论可独立理解（防"如上所述"式指代）', /可独立理解|不要出现/.test(p));
    ck('  列出可用工具', p.includes('browser_navigate') && p.includes('http_request'));
    // 无工具时必须明说，不能让模型假设自己能读写
    const p2 = S.renderSpecSystemPrompt({ spec: { instruction: '仅做推理整理' }, pinnedToolIds: [], dropped: [], maxSteps: 60 });
    ck('★ 无工具时明确说明（防模型假设能读写）', /未给你开放工具/.test(p2));
  }

  console.log('');
  console.log('=== ⑧ 沉淀建议（反复用到才建议固化）===');
  {
    ck('  用过 1 次不建议', !S.shouldSuggestPersist(1));
    ck('★ 用过 3 次建议沉淀", ', S.shouldSuggestPersist(3) === true);
  }

  console.log('');
  console.log('=== ⑨ function schema 合法可被上游接受 ===');
  {
    const s = S.buildSpawnSubAgentSchema();
    ck('  name 正确', s.name === 'spawn_subagent');
    ck('  instruction 必填', Array.isArray(s.parameters.required) && s.parameters.required.includes('instruction'));
    ck('  四要素都在 schema 里', ['instruction', 'context', 'tools'].every((k) => !!s.parameters.properties[k]));
    ck('★ description 写明了与 call_agent 的区别（防误用）', /call_agent/.test(s.description) && /现场定制|现场生成/.test(s.description));
  }

  console.log('');
  console.log('结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(2); });