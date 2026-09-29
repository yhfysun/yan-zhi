/**
 * 长任务续跑 + 自举能力的守门测试。
 *
 * 背景（2026-09-28 用户报）：
 *   ① 「100 步就自动总结（达到最大步数）应该有个记忆整理，然后根据整理的记忆进行任务，不要一直断」
 *   ② 「大模型做任务发现没有对应的工具，会不会自己用 Python/Node 搞个自定义工具挂上去调用？
 *      发现没有对应的 skill 会去下载？」
 *   ③ 「在输入框编辑智能体改了最大步数 / 最大 Token 输出不会立马生效」
 *
 * 源码实况（已核查）：
 *   · 达 maxSteps 后是**纯收尾**（总结 → task:completed），全仓库无自动续跑 → 用户必须手动说"继续"；
 *   · `conversation.task_plan_json` **落盘但从不回注**（`grep -c taskPlan llm-task-manager.ts` = 0）
 *     → 模型知道"上批做到第 3 章"，看不到"计划还剩第 4-10 章"；
 *   · 自举工具（get_api_tools / api_custom_tool_create / api_skill_install / api_tool_install /
 *     api_agent_mount）**实现都在、挂载 0 个** → 模型看不到 → 全部空转；
 *   · 前端把 maxReActSteps 下限**静默抬到 100**（`if (steps >= 100) return steps; return 100;`）。
 *
 * 本测试钉六件事（每条都对应一个真实缺陷，防止回归）：
 *   ① 任务计划必须回注提示词（含"不要重做已完成"的接力规则）；
 *   ② 达上限必须走「决策 → 接力」而不是直接终止，且接力有轮次上限；
 *   ③ 参数必须**每轮实时读库**（编辑智能体后下一轮即生效，不是等重发）；
 *   ④ 步数下限必须放开（前端不再静默抬 100、后端不再封顶 100）；
 *   ⑤ 自举工具集必须挂载，且写类必须登记 WRITE_TOOLS（否则只读会话静默可写）；
 *   ⑥ skill triggers 必须被消费（命中注入 body、未命中只给描述）。
 *
 * ★ 本机 vitest 跑不起来（`.pnpm` 下 vitest 包目录为空，本项目已知环境问题），
 *   所以断言刻意做成**读源码剥注释的静态断言**（与 space-memory-progress.test.ts 同风格）：
 *   不依赖 db mock 完整性，换台机器必定可跑。等价的即时验证见 tools/assert-long-task-and-rules.cjs。
 *   ⚠️ 避坑：块注释里不能出现「星号 + 斜杠」这个两字符序列（哪怕是 glob 写法），
 *   它会提前闭合注释、把后面所有内容当成代码解析（本项目踩过：报了一串 Invalid character）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVER_SRC = resolve(__dirname, '..');
const REPO = resolve(SERVER_SRC, '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');
/** ★ 剥注释 —— 不剥的话注释里提到函数名会让 `.not.toMatch` 断言假红（本项目踩过两次） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LTM = strip(read('apps/server/src/llm-task-manager.ts'));
const DB = strip(read('apps/server/src/db.ts'));
const PERM = strip(read('apps/server/src/tool-permission.ts'));
const EXECUTOR = strip(read('apps/server/src/mcp/api-tool-executor.ts'));
const CHAT_STORE = strip(read('packages/ui/src/stores/chat.ts'));
const CONV_API = strip(read('packages/core/src/tool/builtin/api-tools/conversation.ts'));
const GET_API_TOOLS = strip(read('packages/core/src/tool/builtin/get-api-tools.ts'));

/** 断言锚点存在（不存在的锚点会让后续 slice 变空串 → 报出"像是真缺陷"的假红，本项目踩过） */
function anchor(code: string, needle: string, label: string): number {
  const i = code.indexOf(needle);
  expect(i, `★ 锚点失效（源码结构变了，测试需同步）：${label} —— 找不到 ${JSON.stringify(needle.slice(0, 60))}`)
    .toBeGreaterThan(-1);
  return i;
}

/**
 * 取「从锚点开始的一段源码窗口」（供 within-file 断言）。
 *
 * ★★★ 必须写成 `slice(i, i + len)`（2026-09-29 修）：
 *   此前本文件多处调用了一个**从未定义**的 `win()`，导致 5 条断言直接报
 *   `win is not defined` —— 测试**从来没真正跑通过**（静态断言"写了但没跑"等于没写）。
 *   顺带把另一个本项目踩过多次的坑固化在这里：`slice(i, len)` 的第二个参数是 **end 下标**，
 *   锚点在 10 万字符处时 `end=len` 远小于 `start` → 返回**空串** → 断言全假红且像真缺陷。
 */
function win(code: string, needle: string, len: number, label: string): string {
  const i = anchor(code, needle, label);
  return code.slice(i, i + len);
}

// ────────────────────────────────────────────────────────────
describe('① 任务计划必须回注提示词（长任务"接力棒"）', () => {
  it('★★ buildSystemPromptForBackend 必须注入「当前任务计划（接力棒）」', () => {
    const i = anchor(LTM, 'function buildSystemPromptForBackend', '提示词构建函数');
    const body = LTM.slice(i, i + 20000);
    expect(body, '★ 任务计划未回注 → 模型看不到"原计划还剩什么"，长任务只能从头再来')
      .toMatch(/当前任务计划（接力棒/);
    expect(body, '★ 未渲染计划进度（模型无从判断还剩几步）').toMatch(/已完成/);
  });

  it('★★ 接力规则必须写明：不要重做已完成、不要因为"没有上下文"就从头再来', () => {
    const i = anchor(LTM, 'function buildSystemPromptForBackend', '提示词构建函数');
    // ★ 必须是 slice(i, i+N)：slice(i, N) 的第二个参数是 end 下标，锚点在 10 万字符处时返回空串 → 假红
    const body = LTM.slice(i, i + 22000);
    expect(body, '★ 缺"不要重做已完成步骤"的规则').toMatch(/不要重做已完成/);
    expect(body, '★ 缺"别从头再来"的规则（长任务最容易踩的坑）').toMatch(/从头再来/);
    expect(body, '★ 未要求用 task_step 同步进度（下一批接力就失真）').toMatch(/task_step/);
  });

  it('★ loadTaskPlan 必须容错：非法/空计划返回 null，不能抛错拖垮提示词构建', () => {
    const i = anchor(LTM, 'function loadTaskPlan', 'loadTaskPlan');
    const body = LTM.slice(i, i + 900);
    expect(body, '★ loadTaskPlan 无 try/catch（坏数据会让整个任务起不来）').toMatch(/catch/);
    expect(body, '★ 无 steps 校验（空计划会让提示词出现空壳段落）').toMatch(/steps/);
  });
});

// ────────────────────────────────────────────────────────────
describe('② 达上限必须「决策 → 接力」，不能直接终止', () => {
  it('★★ 必须存在自动接力决策函数且被收尾分支真实调用', () => {
    anchor(LTM, 'async function decideAutoContinue', 'decideAutoContinue 定义');
    const callIdx = anchor(LTM, 'await decideAutoContinue(', 'decideAutoContinue 调用');
    expect(callIdx, '★ decideAutoContinue 定义了却没人调用（静默失效）').toBeGreaterThan(0);
  });

  it('★★ 接力必须有轮次上限（否则无限烧 token）', () => {
    expect(LTM, '★ 无 autoContinueMaxRounds 上限').toMatch(/autoContinueMaxRounds/);
    expect(LTM, '★ 未按上限拦截（上限形同虚设）').toMatch(/continuationCount\s*<\s*autoContinueMaxRounds|continuationCount\s*>=\s*autoContinueMaxRounds/);
    expect(LTM, '★ 上限不可配置（用户无法关闭自动接力）').toMatch(/autoContinueMaxRounds/);
  });

  it('★★ 接力前必须排除"用户已终止"与"空转退化"两种不该接力的情形', () => {
    const at = anchor(LTM, 'continuationCount++', '接力执行点');
    const around = LTM.slice(Math.max(0, at - 1200), at + 400);
    expect(around, '★ 用户已终止仍会接力').toMatch(/abortController\.signal\.aborted/);
    expect(around, '★ 空转退化仍会接力（会继续烧 token 空转）').toMatch(/consecutiveArgFailures/);
  });

  it('★★ 必须用双层循环实现接力（同一任务继续，而不是开新任务 / 从 step 0 重放）', () => {
    expect(LTM, '★ 缺外层批次循环（接力无从实现）').toMatch(/for\s*\(let batch = 0;/);
    expect(LTM, '★ 内层单批循环未改为按预算走').toMatch(/for\s*\(let step = 0;\s*step < stepBudget;/);
    expect(LTM, '★ 接力未重置步数预算（会立刻又到上限）').toMatch(/stepBudget = liveMaxSteps\(\)/);
  });

  it('★ 接力要把「第几批」落进记忆/消息，否则用户看不出这是中间批', () => {
    expect(LTM, '★ 接力未写入记忆（同目录新会话分不清首轮还是接力）').toMatch(/continuation:\s*`自动接力第/);
    expect(LTM, '★ 接力未通知前端（前端会误判任务已结束）').toMatch(/type:\s*'continuation'/);
  });

  it('★★ 未接力时必须说明原因（否则用户不知道是被上限还是被模型截住）', () => {
    expect(LTM, '★ 未自动续跑时无原因说明').toMatch(/未自动续跑/);
  });
});

// ────────────────────────────────────────────────────────────
describe('③ 运行参数必须每轮实时读库（编辑后立即生效）', () => {
  it('★★ 必须存在实时读参函数，且同时覆盖 maxReActSteps 与 maxTokens', () => {
    const i = anchor(LTM, 'const readLiveParams', 'readLiveParams');
    const body = LTM.slice(i, i + 1800);
    expect(body, '★ 未实时读 max_tokens（用户改了最大输出不生效）').toMatch(/max_tokens/);
    expect(body, '★ 未实时读 config_json（maxReActSteps 在里面）').toMatch(/config_json/);
    expect(body, '★ 未实时读 maxReActSteps').toMatch(/maxReActSteps/);
  });

  it('★★ 语义边界：显式传入的值优先，未被显式传入的才回落实时读库', () => {
    const i = anchor(LTM, 'const effectiveOptions', 'effectiveOptions');
    const body = LTM.slice(i, i + 1200);
    expect(body, '★ 未做"显式传入优先"判断（会覆盖调用方意图）').toMatch(/!==\s*undefined/);
  });

  it('★★ LLM 调用必须用每轮生效值，而不是冻结的 options', () => {
    const i = anchor(LTM, 'const effOpts = effectiveOptions()', 'effOpts 取值');
    const body = LTM.slice(i, i + 3000);
    expect(body, '★ chatStream 仍用旧的 options?.maxTokens（实时读参白做）').toMatch(/maxTokens:\s*effOpts\.maxTokens/);
    expect(body, '★ chatStream 仍用旧的 options?.temperature').toMatch(/temperature:\s*effOpts\.temperature/);
  });

  it('★★ 步数预算必须每轮重算（运行中调大即可续跑更多步）', () => {
    const i = anchor(LTM, 'const budgetNow = liveMaxSteps()', '每轮重算预算');
    const body = LTM.slice(i, i + 200);
    expect(body, '★ 重算后未回写 stepBudget（重算无意义）').toMatch(/stepBudget\s*=\s*budgetNow/);
  });
});

// ────────────────────────────────────────────────────────────
describe('④ 步数上下限必须放开', () => {
  it('★★ 前端不得再把小于 100 的配置静默抬到 100', () => {
    const i = anchor(CHAT_STORE, 'function getMaxReActSteps', 'getMaxReActSteps');
    const body = CHAT_STORE.slice(i, i + 800);
    expect(body, '★ 仍存在 steps >= 100 的静默抬升（用户调小步数做不到）').not.toMatch(/steps\s*>=\s*100/);
    expect(body, '★ 仍然无条件 return 100（配置被忽略）').not.toMatch(/return 100;\s*\/\/\s*默认 100，低于/);
    expect(body, '★ 未做下限保护（0/负数会让循环一步都不跑）').toMatch(/steps > 0/);
  });

  it('★★ 后端子智能体步数不得封顶 100', () => {
    expect(LTM, '★ 子智能体步数仍被封顶 100（配置改大无效）').not.toMatch(/Math\.min\(Math\.floor\(cfgSteps\),\s*100\)/);
    expect(LTM, '★ 未放开到更高上限').toMatch(/Math\.min\(Math\.floor\(cfgSteps\),\s*500\)/);
  });

  it('★★★ 默认步数必须是 500（用户 2026-09-29：「默认 500 步吧，50 步不太够啊」）', () => {
    // 后端：共享常量 + 两处使用（liveMaxSteps 与 getAgentLiveParams）
    expect(LTM, '★ 未定义默认步数常量').toMatch(/DEFAULT_MAX_REACT_STEPS\s*=\s*500/);
    expect(LTM, '★ liveMaxSteps 未使用默认常量').toMatch(/params\.maxSteps \|\| live \|\| DEFAULT_MAX_REACT_STEPS/);
    expect(LTM, '★ 智能体参数回显仍写死 100（界面与实际执行不一致）')
      .not.toMatch(/maxReActSteps: config\?\.maxReActSteps \|\| 100/);
    // 前端：回落值必须与后端同值
    const i = anchor(CHAT_STORE, 'function getMaxReActSteps', 'getMaxReActSteps');
    const body = CHAT_STORE.slice(i, i + 900);
    expect(body, '★ 前端默认仍是 100（与后端 500 不一致）').toMatch(/return 500;/);
    expect(body, '★ 前端仍回落 100').not.toMatch(/return 100;/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑤ 自举工具集必须挂载 + 写类必须登记权限', () => {
  const BOOTSTRAP_TOOLS = [
    'get_api_tools',
    'api_builtin_tool_list',
    'api_custom_tool_list', 'api_custom_tool_get',
    'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_execute',
    'api_skill_list', 'api_skill_get', 'api_skill_create', 'api_skill_update',
    'api_marketplace_sources', 'api_marketplace_browse',
    'api_tool_install', 'api_skill_install',
    'api_agent_mount',
  ];

  it('★★ 自举工具必须出现在默认助手的挂载清单里（挂 0 个 = 模型看不到 = 全部空转）', () => {
    const i = anchor(DB, 'const DEFAULT_AGENT_BUILTIN_TOOLS', '默认助手工具清单');
    const body = DB.slice(i, i + 6000);
    for (const t of BOOTSTRAP_TOOLS) {
      expect(body, `★ 自举工具 ${t} 未挂载（模型看不到，这条能力等于不存在）`).toContain(`'${t}'`);
    }
  });

  it('★★ 自举里的**写类**工具必须全部登记进 WRITE_TOOLS（否则只读会话静默可写）', () => {
    const WRITE = [
      'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_delete', 'api_custom_tool_toggle',
      'api_skill_create', 'api_skill_update', 'api_skill_delete', 'api_skill_toggle', 'api_skill_install',
      'api_tool_install',
      'api_agent_create', 'api_agent_update', 'api_agent_delete', 'api_agent_mount',
      'api_marketplace_add_source', 'api_marketplace_delete_source', 'api_marketplace_install',
    ];
    const i = anchor(PERM, 'const WRITE_TOOLS', 'WRITE_TOOLS 集合');
    const body = PERM.slice(i, PERM.indexOf(']);', i));
    for (const t of WRITE) {
      expect(body, `★ 写类工具 ${t} 未登记 WRITE_TOOLS → 只读会话可静默写库（本项目已犯两次）`)
        .toContain(`'${t}'`);
    }
  });

  it('★ get_api_tools 必须自我说明"是发现工具的总入口"（否则模型想不到用它）', () => {
    expect(GET_API_TOOLS, '★ get_api_tools 描述未说明其"发现工具"的职责')
      .toMatch(/发现工具|总入口/);
    expect(GET_API_TOOLS, '★ get_api_tools 的模块清单未与 API_MODULES 联动（会写漏模块）')
      .toMatch(/API_MODULES/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑥ skill triggers 必须被消费 + 缺技能有去处', () => {
  it('★★ 注入时必须按触发词分流（命中注入 body / 未命中只给描述）', () => {
    const i = anchor(LTM, 'function matchSkillTriggers', 'matchSkillTriggers');
    expect(i, '★ 无触发词匹配函数 → triggers 永远不被消费').toBeGreaterThan(0);
    const body = LTM.slice(i, i + 800);
    expect(body, '★ 匹配函数未处理大小写（中文触发词没问题，英文触发词会漏）').toMatch(/toLowerCase/);
  });

  it('★★ 必须真的读取 triggers_json 并据此决定是否注入 body', () => {
    const i = anchor(LTM, 'triggers_json', 'skill 查询取 triggers_json');
    const body = LTM.slice(i, i + 3000);
    expect(body, '★ 查了 triggers_json 但没用它分流').toMatch(/matchSkillTriggers\(/);
    expect(body, '★ 未命中的 skill 仍注入完整 body（挂 8 个塞 16000 字的老问题）')
      .toMatch(/shouldInjectBody/);
  });

  it('★★ 缺技能时模型必须知道可以去商城找装（而不是硬编流程或停下问用户）', () => {
    expect(LTM, '★ 缺技能无处理指引').toMatch(/技能缺失时的处理/);
    expect(LTM, '★ 未指引去商城搜索').toMatch(/api_marketplace_browse/);
    expect(LTM, '★ 未指引安装').toMatch(/api_skill_install/);
    expect(LTM, '★ 未指引沉淀为本地 skill').toMatch(/api_skill_create/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑦ 会话级自定义工具挂载（自造工具只作用于当前会话）', () => {
  it('★★ api_conversation_setup 必须支持 customToolIds', () => {
    expect(CONV_API, '★ schema 未声明 customToolIds（模型传了也被忽略）').toMatch(/customToolIds/);
    expect(EXECUTOR, '★ executor 未实现 customToolIds 分支').toMatch(/args\.customToolIds/);
  });

  it('★★ 会话级挂载必须落到 DB 并有迁移（旧库缺列会 500）', () => {
    expect(DB, '★ conversation 缺 custom_tool_ids_json 列的迁移（打包版旧库会报 no column）')
      .toMatch(/ALTER TABLE conversation ADD COLUMN custom_tool_ids_json/);
    expect(EXECUTOR, '★ 未写库（挂载等于没挂）').toMatch(/UPDATE conversation SET custom_tool_ids_json/);
  });

  it('★★ 工具构建必须把会话级白名单并进可见列表', () => {
    expect(LTM, '★ ConvMounts 未含 customToolIds').toMatch(/customToolIds: string\[\]/);
    const i = anchor(LTM, 'const viaConv = convMounts.customToolIds.includes', '会话级白名单判定');
    expect(i, '★ 会话级工具未参与过滤（挂上了也看不到）').toBeGreaterThan(0);
  });

  it('★★ 会话级挂载的写操作同样受只读权限约束', () => {
    // api_conversation_setup 已在 WRITE_TOOLS（改会话身份/挂载），必须仍在
    const i = anchor(PERM, 'const WRITE_TOOLS', 'WRITE_TOOLS 集合');
    const body = PERM.slice(i, PERM.indexOf(']);', i));
    expect(body, '★ api_conversation_setup 未登记写清单（只读会话可改挂载）').toContain("'api_conversation_setup'");
  });
});

// ────────────────────────────────────────────────────────────
describe('⑧ 达上限总结必须同时产出"是否继续"判据', () => {
  it('★★ summarizeOnMaxSteps 必须返回 shouldContinue（否则接力决策没有依据）', () => {
    const i = anchor(LTM, 'async function summarizeOnMaxSteps', 'summarizeOnMaxSteps');
    const body = LTM.slice(i, i + 2600);
    expect(body, '★ 返回值未含 shouldContinue').toMatch(/shouldContinue/);
    expect(body, '★ 未要求模型输出 CONTINUE 行').toMatch(/CONTINUE:/);
  });

  it('★ CONTINUE 信号行必须从给用户看的正文里剥掉（不能泄漏到回复里）', () => {
    const i = anchor(LTM, 'async function summarizeOnMaxSteps', 'summarizeOnMaxSteps');
    const body = LTM.slice(i, i + 2600);
    expect(body, '★ 未剥离 CONTINUE 行（会出现在用户的总结里）').toMatch(/replace\(/);
  });

  it('★ 子智能体调用点必须改用 .text（返回值结构变了）', () => {
    const i = anchor(LTM, "summarizeOnMaxSteps(client, systemPrompt, history, maxSteps, 'sub')", '子智能体总结调用');
    const body = LTM.slice(i, i + 200);
    expect(body, '★ 子智能体仍按旧结构取 summary（会拿到 undefined）').toMatch(/summary\.text/);
  });

  it('★★ 计划里还有未完成步骤时也必须接力（机械信号比模型自评可靠）', () => {
    anchor(LTM, 'function readPlanRemainingSteps', 'readPlanRemainingSteps');
    // ★ 2026-09-29：判定式从 `const shouldContinue = modelSaysContinue || planRemaining > 0`
    //   改为 `wanted = ...` + `shouldContinue = wanted && !disabled && !roundsExhausted`
    //   （轮次闸并入判定，避免提前 return 丢掉总结正文）。锚点随之更新。
    const i = anchor(LTM, 'const wanted = modelSaysContinue', '接力判定合并');
    const body = LTM.slice(i, i + 260);
    expect(body, '★ 只看模型自评、忽略计划剩余步骤').toMatch(/planRemaining > 0/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑪ 接力闸门与空转断路器判据必须一致（2026-09-29 生产事故）', () => {
  /**
   * ★★★ 守的 bug：判据在两处**各写各的** —— 断路器 `>= 3`、接力闸门 `> 0`。
   *   实测后果（生产库会话 aaa84c6c）：任务跑满 100 步、计划里还剩 7 个未完成步骤，
   *   末尾偶发一次空参 → 接力被一刀否决 → 任务终止，用户看到自相矛盾的一句
   *   「（未自动续跑：任务计划尚有 7 个未完成步骤）」。
   */
  it('★★★ 阈值必须由同一个常量提供，两处不得各写数字字面量', () => {
    expect(LTM, '★ 未定义共享阈值常量').toMatch(/EMPTY_ARGS_DEGENERATE_THRESHOLD\s*=\s*3/);
    // 两处引用（断路器 + 接力闸门）
    const refs = LTM.match(/EMPTY_ARGS_DEGENERATE_THRESHOLD/g) || [];
    expect(refs.length, '★ 共享阈值常量未被两处同时引用（判据又漂移了）').toBeGreaterThanOrEqual(3);
  });

  it('★★★ 接力闸门不得再用 `consecutiveArgFailures > 0`（偶发一次空参不否决接力）', () => {
    expect(LTM, '★ 接力闸门仍是 >0 → 末尾偶发一次空参就会否决整个接力')
      .not.toMatch(/consecutiveArgFailures\s*>\s*0/);
  });

  it('★★ 断路器与接力闸门必须用同一比较方式（>= 阈值）', () => {
    const uses = LTM.match(/consecutiveArgFailures\s*>=\s*EMPTY_ARGS_DEGENERATE_THRESHOLD/g) || [];
    expect(uses.length, '★ 未两处统一为 >= 阈值').toBeGreaterThanOrEqual(2);
  });

  it('★★ 轮次上限/开关不得提前 return（否则总结正文整段丢失）', () => {
    const i = anchor(LTM, 'async function decideAutoContinue', 'decideAutoContinue');
    const body = LTM.slice(i, i + 1800);
    // 提前 return 会把后面的 summarizeOnMaxSteps 整段跳过 → 用户只拿到一行固定文案
    expect(body, '★ 仍在提前 return（长任务收尾会丢掉模型给出的进展总结）')
      .not.toMatch(/if \(autoContinueMaxRounds <= 0\) \{\s*return \{ shouldContinue: false, summary: ''/);
    expect(body, '★ 未记录"该继续但被闸门挡住"的真实原因').toMatch(/blockedBy/);
  });

  it('★ 不接力时必须按真实闸门分支说明原因（不能只回放 judged.reason）', () => {
    const i = anchor(LTM, '未自动续跑：', '不接力文案');
    const body = LTM.slice(Math.max(0, i - 700), i + 400);
    expect(body, '★ 未区分"空转退化"这一原因').toMatch(/空转退化/);
    expect(body, '★ 未区分"用户已中止"').toMatch(/用户已中止/);
  });
});

// ────────────────────────────────────────────────────────────
describe('⑨ 收尾必须做一次轻量记忆整理（用户明确要的"记忆整理"）', () => {
  it('★★ 收尾必须调用整理函数', () => {
    anchor(LTM, 'async function consolidateOnTaskEnd', 'consolidateOnTaskEnd 定义');
    expect(LTM, '★ 收尾未调用整理（用户要的"记忆整理"缺失）').toMatch(/consolidateOnTaskEnd\(task/);
  });

  it('★ 整理必须是轻量的（只做消化标记，不跑每日 dreaming 那套重流程）', () => {
    const i = anchor(LTM, 'async function consolidateOnTaskEnd', 'consolidateOnTaskEnd');
    const body = LTM.slice(i, i + 1800);
    expect(body, '★ 未标记 digested（下次收尾会重复整理）').toMatch(/digested/);
    expect(body, '★ 未做 fail-safe（整理失败会拖垮收尾）').toMatch(/catch/);
  });
});
// ────────────────────────────────────────────────────────────
describe('⑩ 项目规则文件（AGENTS.md）必须自动读取', () => {
  it('★★ 提示词必须注入「项目规则」段（此前完全不识别）', () => {
    const i = anchor(LTM, 'function buildSystemPromptForBackend', '提示词构建函数');
    const body = LTM.slice(i, i + 24000);
    expect(body, '★ 不读 AGENTS.md → 用户写好的项目规则模型看不到，每次都要重复交代')
      .toMatch(/## 项目规则（自动读取自工作目录/);
  });

  it('★★ 必须同时支持 AGENTS.md 与 .yan-zhi/rules 两个位置', () => {
    const body = win(LTM, 'function loadProjectRules', 2000, 'loadProjectRules');
    expect(body, '★ 未读 AGENTS.md').toMatch(/'AGENTS\.md'/);
    expect(body, '★ 未读 .yan-zhi/rules').toMatch(/'\.yan-zhi',\s*'rules'/);
  });

  it('★★ 必须有 mtime 缓存（提示词每轮都构建，不缓存等于每轮都读盘）', () => {
    const body = win(LTM, 'function loadProjectRules', 2000, 'loadProjectRules');
    expect(body, '★ 无缓存 → 每轮 ReAct 都 readdir+stat+readFile').toMatch(/CACHE\.get|PROJECT_RULES_CACHE/);
    expect(body, '★ 指纹未含 mtime（文件改了不会重新读）').toMatch(/mtimeMs/);
  });

  it('★★ 必须有长度上限（规则不能吃掉提示词预算）', () => {
    expect(LTM, '★ 无单文件上限').toMatch(/RULE_FILE_MAX_CHARS/);
    expect(LTM, '★ 无总量上限').toMatch(/RULE_TOTAL_MAX_CHARS/);
  });

  it('★★ 必须只读根一层，不递归（递归会把 node_modules 里的 md 吸进来）', () => {
    const body = win(LTM, 'function loadProjectRules', 2000, 'loadProjectRules');
    expect(body, '★ 用了递归 readdir（会吸入依赖包的说明文档）').not.toMatch(/recursive:\s*true/);
  });

  it('★ 注入时必须说明优先级与冲突处理（规则 vs 用户当前要求）', () => {
    const body = win(LTM, 'function buildSystemPromptForBackend', 24000, '提示词构建');
    expect(body, '★ 未说明优先级高于默认行为').toMatch(/优先级高于默认行为/);
    expect(body, '★ 未说明与用户当前要求冲突时以用户为准').toMatch(/用户当前.*为准|以用户为准/);
  });
});
