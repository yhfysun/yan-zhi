// 静态断言的等价执行器 —— 复刻 apps/server/test/long-task-continuation.test.ts 的断言逻辑。
// 本机 vitest 不可用（.pnpm/vitest*/node_modules/vitest 为空，项目已知环境问题）时用它即时验证。
//
// ★★ 本项目踩过的坑（导致本次一轮假红，务必保留此注释）：
//    `code.slice(anchor(code, needle), LEN)` —— slice 第二个参数是 **end 下标**，
//    锚点在 10 万字符处时 end=LEN 远小于 start → 返回**空串** → 所有断言必然假红，
//    且报出的错误"像是真功能缺陷"（实测一次假红 10 条）。
//    → 取窗口必须写 `slice(i, i + LEN)`，本脚本统一走 win() 封装。
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf-8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const DB = strip(read('apps/server/src/db.ts'));
const PERM = strip(read('apps/server/src/tool-permission.ts'));
const EXECUTOR = strip(read('apps/server/src/mcp/api-tool-executor.ts'));
const CHAT = strip(read('packages/ui/src/stores/chat.ts'));
const CONV_API = strip(read('packages/core/src/tool/builtin/api-tools/conversation.ts'));
const GET_API = strip(read('packages/core/src/tool/builtin/get-api-tools.ts'));

let pass = 0, fail = 0;
const out = [];
function expect(cond, msg) { if (!cond) throw new Error(msg); }
function it(name, fn) {
  try { fn(); pass++; out.push(`  ✅ ${name}`); }
  catch (e) { fail++; out.push(`  ❌ ${name}\n       ${e.message}`); }
}
function group(title, fn) { out.push(`\n${title}`); fn(); }
function has(code, needle, msg) { expect(code.includes(needle), msg); }
function notHas(code, needle, msg) { expect(!code.includes(needle), msg); }
function matches(code, re, msg) { expect(re.test(code), msg); }
/** 锚点必须存在：锚点失效会让后续窗口偏移，报出"像是真缺陷"的假红（本项目踩过） */
function at(code, needle, label) {
  const i = code.indexOf(needle);
  expect(i > -1, `★ 锚点失效（源码结构变了，测试需同步）：${label}`);
  return i;
}
/** ★ 正确取窗口：slice(i, i+len)。绝不要写 slice(anchor(...), len) —— 那是空串。 */
function win(code, needle, len, label) {
  const i = at(code, needle, label || needle);
  return code.slice(i, i + len);
}

group('① 任务计划必须回注提示词（长任务"接力棒"）', () => {
  it('buildSystemPromptForBackend 注入「当前任务计划（接力棒）」+ 进度', () => {
    const body = win(LTM, 'function buildSystemPromptForBackend', 20000, '提示词构建函数');
    has(body, '当前任务计划（接力棒', '★ 任务计划未回注 → 模型看不到"原计划还剩什么"，长任务只能从头再来');
    matches(body, /已完成/, '★ 未渲染计划进度（模型无从判断还剩几步）');
  });
  it('接力规则写明：不要重做已完成 / 不要从头再来 / 同步 task_step', () => {
    const body = win(LTM, 'function buildSystemPromptForBackend', 22000, '提示词构建函数');
    has(body, '不要重做已完成', '★ 缺"不要重做已完成步骤"的规则');
    has(body, '从头再来', '★ 缺"别从头再来"的规则（长任务最易踩的坑）');
    has(body, 'task_step', '★ 未要求用 task_step 同步进度（下一批接力就失真）');
  });
  it('loadTaskPlan 容错：非法/空计划返回 null，不抛错拖垮提示词构建', () => {
    const body = win(LTM, 'function loadTaskPlan', 900, 'loadTaskPlan');
    matches(body, /catch/, '★ loadTaskPlan 无 try/catch（坏数据会让整个任务起不来）');
    has(body, 'steps', '★ 无 steps 校验（空计划会让提示词出现空壳段落）');
  });
});

group('② 达上限必须「决策 → 接力」，不能直接终止', () => {
  it('decideAutoContinue 已定义且被真实调用', () => {
    at(LTM, 'async function decideAutoContinue', 'decideAutoContinue 定义');
    const i = at(LTM, 'await decideAutoContinue(', 'decideAutoContinue 调用');
    expect(i > 0, '★ 定义了却没人调用（静默失效）');
  });
  it('接力有轮次上限（否则无限烧 token）', () => {
    has(LTM, 'autoContinueMaxRounds', '★ 无 autoContinueMaxRounds 上限');
    matches(LTM, /continuationCount\s*<\s*autoContinueMaxRounds|continuationCount\s*>=\s*autoContinueMaxRounds/,
      '★ 未按上限拦截（上限形同虚设）');
  });
  it('接力前排除"用户已终止"与"空转退化"', () => {
    const i = at(LTM, 'continuationCount++', '接力执行点');
    const around = LTM.slice(Math.max(0, i - 1400), i + 400);
    has(around, 'abortController.signal.aborted', '★ 用户已终止仍会接力');
    has(around, 'consecutiveArgFailures', '★ 空转退化仍会接力（继续烧 token 空转）');
  });
  it('双层循环实现接力（同一任务继续，不开新任务/不重放）', () => {
    matches(LTM, /for\s*\(let batch = 0;/, '★ 缺外层批次循环（接力无从实现）');
    matches(LTM, /for\s*\(let step = 0;\s*step < stepBudget;/, '★ 内层循环未改为按预算走');
    matches(LTM, /stepBudget = liveMaxSteps\(\)/, '★ 接力未重置步数预算（会立刻又到上限）');
  });
  it('接力写入记忆 + 通知前端', () => {
    matches(LTM, /continuation:\s*`自动接力第/, '★ 接力未写入记忆（同目录新会话分不清首轮还是接力）');
    matches(LTM, /type:\s*'continuation'/, '★ 接力未通知前端（前端会误判任务已结束）');
  });
  it('未接力时说明原因', () => {
    has(LTM, '未自动续跑', '★ 未自动续跑时无原因说明（用户不知道被上限还是模型截住）');
  });
});

group('③ 运行参数必须每轮实时读库（编辑后立即生效）', () => {
  it('readLiveParams 覆盖 max_tokens / config_json / maxReActSteps', () => {
    const body = win(LTM, 'const readLiveParams', 2500, 'readLiveParams');
    has(body, 'max_tokens', '★ 未实时读 max_tokens（用户改了最大输出不生效）');
    has(body, 'config_json', '★ 未实时读 config_json（maxReActSteps 在里面）');
    has(body, 'maxReActSteps', '★ 未实时读 maxReActSteps');
  });
  it('显式传入优先，未传才回落实时读', () => {
    const body = win(LTM, 'const effectiveOptions', 1400, 'effectiveOptions');
    matches(body, /!==\s*undefined/, '★ 未做"显式传入优先"判断（会覆盖调用方意图）');
  });
  it('LLM 调用用 effOpts 而非冻结的 options', () => {
    const body = win(LTM, 'const effOpts = effectiveOptions()', 3000, 'effOpts 取值');
    has(body, 'maxTokens: effOpts.maxTokens', '★ chatStream 仍用旧的 options?.maxTokens');
    has(body, 'temperature: effOpts.temperature', '★ chatStream 仍用旧的 options?.temperature');
  });
  it('步数预算每轮重算并回写', () => {
    const body = win(LTM, 'const budgetNow = liveMaxSteps()', 200, '每轮重算预算');
    matches(body, /stepBudget\s*=\s*budgetNow/, '★ 重算后未回写 stepBudget（重算无意义）');
  });
});

group('④ 步数上下限必须放开', () => {
  it('前端不再把 <100 的配置静默抬到 100', () => {
    const body = win(CHAT, 'function getMaxReActSteps', 800, 'getMaxReActSteps');
    notHas(body, 'steps >= 100', '★ 仍有 steps >= 100 的静默抬升（用户调小步数做不到）');
    matches(body, /steps > 0/, '★ 未做下限保护（0/负数会让循环一步都不跑）');
  });
  it('后端子智能体不再封顶 100', () => {
    notHas(LTM, 'Math.min(Math.floor(cfgSteps), 100)', '★ 子智能体步数仍被封顶 100（配置改大无效）');
    matches(LTM, /Math\.min\(Math\.floor\(cfgSteps\),\s*500\)/, '★ 未放开到 500');
  });
});

group('⑤ 自举工具集必须挂载 + 写类必须登记权限', () => {
  const BOOTSTRAP = ['get_api_tools', 'api_builtin_tool_list', 'api_custom_tool_list', 'api_custom_tool_get',
    'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_execute',
    'api_skill_list', 'api_skill_get', 'api_skill_create', 'api_skill_update',
    'api_marketplace_sources', 'api_marketplace_browse', 'api_tool_install', 'api_skill_install', 'api_agent_mount'];
  const WRITE = ['api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_delete', 'api_custom_tool_toggle',
    'api_skill_create', 'api_skill_update', 'api_skill_delete', 'api_skill_toggle', 'api_skill_install',
    'api_tool_install', 'api_agent_create', 'api_agent_update', 'api_agent_delete', 'api_agent_mount',
    'api_marketplace_add_source', 'api_marketplace_delete_source', 'api_marketplace_install'];

  it('自举工具全部挂载到默认助手（挂 0 个 = 模型看不到）', () => {
    const i = at(DB, 'const DEFAULT_AGENT_BUILTIN_TOOLS', '默认助手工具清单');
    const body = DB.slice(i, i + 6000);
    for (const t of BOOTSTRAP) has(body, `'${t}'`, `★ 自举工具 ${t} 未挂载（模型看不到，这条能力等于不存在）`);
  });
  it('写类工具全部登记 WRITE_TOOLS（否则只读会话静默可写）', () => {
    const i = at(PERM, 'const WRITE_TOOLS', 'WRITE_TOOLS 集合');
    const body = PERM.slice(i, PERM.indexOf(']);', i));
    for (const t of WRITE) has(body, `'${t}'`, `★ 写类工具 ${t} 未登记 → 只读会话可静默写库（本项目已犯两次）`);
  });
  it('get_api_tools 自我说明"发现工具总入口"且模块清单联动', () => {
    matches(GET_API, /发现工具|总入口/, '★ 描述未说明"发现工具"职责（模型想不到用它）');
    has(GET_API, 'API_MODULES', '★ 模块清单未与 API_MODULES 联动（会写漏模块）');
  });
});

group('⑥ skill triggers 必须被消费 + 缺技能有去处', () => {
  it('matchSkillTriggers 存在且处理大小写', () => {
    at(LTM, 'function matchSkillTriggers', 'matchSkillTriggers');
    matches(win(LTM, 'function matchSkillTriggers', 800, 'matchSkillTriggers'), /toLowerCase/,
      '★ 未处理大小写（英文触发词会漏）');
  });
  it('读 triggers_json 并据此分流注入 body', () => {
    const body = win(LTM, 'triggers_json', 3000, 'skill 查询取 triggers_json');
    has(body, 'matchSkillTriggers(', '★ 查了 triggers_json 但没用它分流（triggers 形同虚设）');
    has(body, 'shouldInjectBody', '★ 未命中的 skill 仍注入完整 body（挂 8 个塞 16000 字的老问题）');
  });
  it('缺技能指引：去商城找 / 装 / 沉淀本地', () => {
    has(LTM, '技能缺失时的处理', '★ 缺技能无处理指引');
    has(LTM, 'api_marketplace_browse', '★ 未指引去商城搜索');
    has(LTM, 'api_skill_install', '★ 未指引安装');
    has(LTM, 'api_skill_create', '★ 未指引沉淀为本地 skill');
  });
});

group('⑦ 会话级自定义工具挂载（自造工具只作用于当前会话）', () => {
  it('api_conversation_setup 支持 customToolIds', () => {
    has(CONV_API, 'customToolIds', '★ schema 未声明 customToolIds（模型传了也被忽略）');
    has(EXECUTOR, 'args.customToolIds', '★ executor 未实现 customToolIds 分支');
  });
  it('落库 + 迁移齐备（旧库缺列会 500）', () => {
    has(DB, 'ALTER TABLE conversation ADD COLUMN custom_tool_ids_json', '★ 缺列迁移（打包版旧库报 no column）');
    has(EXECUTOR, 'UPDATE conversation SET custom_tool_ids_json', '★ 未写库（挂载等于没挂）');
  });
  it('工具构建并入会话级白名单', () => {
    has(LTM, 'customToolIds: string[]', '★ ConvMounts 未含 customToolIds');
    const i = at(LTM, 'const viaConv = convMounts.customToolIds.includes', '会话级白名单判定');
    expect(i > 0, '★ 会话级工具未参与过滤（挂上了也看不到）');
  });
  it('api_conversation_setup 仍在写清单', () => {
    const i = at(PERM, 'const WRITE_TOOLS', 'WRITE_TOOLS 集合');
    has(PERM.slice(i, PERM.indexOf(']);', i)), "'api_conversation_setup'", '★ 未登记写清单（只读会话可改挂载）');
  });
});

group('⑧ 达上限总结必须同时产出"是否继续"判据', () => {
  it('summarizeOnMaxSteps 返回 shouldContinue 且要求 CONTINUE 行并剥离', () => {
    const body = win(LTM, 'async function summarizeOnMaxSteps', 2600, 'summarizeOnMaxSteps');
    has(body, 'shouldContinue', '★ 返回值未含 shouldContinue（接力决策无依据）');
    has(body, 'CONTINUE:', '★ 未要求模型输出 CONTINUE 行');
    matches(body, /replace\(/, '★ 未剥离 CONTINUE 行（会出现在用户的总结里）');
  });
  it('子智能体调用点改用 .text（返回值结构变了）', () => {
    const i = at(LTM, "summarizeOnMaxSteps(client, systemPrompt, history, maxSteps, 'sub')", '子智能体总结调用');
    has(LTM.slice(i, i + 200), 'summary.text', '★ 子智能体仍按旧结构取 summary（会拿到 undefined）');
  });
  it('计划剩余步骤也促成接力（机械信号比模型自评可靠）', () => {
    at(LTM, 'function readPlanRemainingSteps', 'readPlanRemainingSteps');
    const i = at(LTM, 'const shouldContinue = modelSaysContinue', '接力判定合并');
    has(LTM.slice(i, i + 200), 'planRemaining > 0', '★ 只看模型自评、忽略计划剩余步骤');
  });
});

group('⑨ 收尾必须做一次轻量记忆整理（用户明确要的"记忆整理"）', () => {
  it('收尾调用整理函数 + 标记 digested + fail-safe', () => {
    at(LTM, 'async function consolidateOnTaskEnd', 'consolidateOnTaskEnd 定义');
    has(LTM, 'consolidateOnTaskEnd(task', '★ 收尾未调用整理（用户要的"记忆整理"缺失）');
    const body = win(LTM, 'async function consolidateOnTaskEnd', 1800, 'consolidateOnTaskEnd');
    has(body, 'digested', '★ 未标记 digested（下次收尾会重复整理）');
    matches(body, /catch/, '★ 未做 fail-safe（整理失败会拖垮收尾）');
  });
});


group('⑩ 项目规则文件（AGENTS.md）必须自动读取', () => {
  it('提示词注入「项目规则」段', () => {
    const body = win(LTM, 'function buildSystemPromptForBackend', 24000, '提示词构建');
    has(body, '## 项目规则（自动读取自工作目录', '★ 不读 AGENTS.md');
  });
  it('支持 AGENTS.md 与 .yan-zhi/rules', () => {
    const body = win(LTM, 'function loadProjectRules', 2000, 'loadProjectRules');
    matches(body, /'AGENTS\.md'/, '★ 未读 AGENTS.md');
    matches(body, /'\.yan-zhi',\s*'rules'/, '★ 未读 .yan-zhi/rules');
  });
  it('有 mtime 缓存', () => {
    const body = win(LTM, 'function loadProjectRules', 2000, 'loadProjectRules');
    matches(body, /CACHE\.get|PROJECT_RULES_CACHE/, '★ 无缓存');
    has(body, 'mtimeMs', '★ 指纹未含 mtime');
  });
  it('有长度上限', () => {
    has(LTM, 'RULE_FILE_MAX_CHARS', '★ 无单文件上限');
    has(LTM, 'RULE_TOTAL_MAX_CHARS', '★ 无总量上限');
  });
  it('不递归', () => {
    const body = win(LTM, 'function loadProjectRules', 2000, 'loadProjectRules');
    expect(!/recursive:\s*true/.test(body), '★ 用了递归 readdir');
  });
  it('说明优先级与冲突处理', () => {
    const body = win(LTM, 'function buildSystemPromptForBackend', 24000, '提示词构建');
    has(body, '优先级高于默认行为', '★ 未说明优先级');
    matches(body, /用户当前.*为准|以用户为准/, '★ 未说明冲突处理');
  });
});

console.log(out.join('\n'));
console.log(`\n===== 静态断言结果：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);