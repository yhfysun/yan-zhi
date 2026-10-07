/**
 * 运行时子智能体「四元组」—— 对齐 AOrchestra (ICML 2026) 的 Φ = (Instruction, Context, Tools, Model)。
 *
 * ═══ 为什么要有这个模块（与既有 call_agent 的区别）═══
 *
 * 既有 `call_agent(agentId, input)` 是**静态委派**：只能调用 agent 表里**已经存在**的角色。
 * 真实长任务里子任务的形态是**现场涌现**的 —— 今天要"抓这三个页面的报价"，明天要
 * "把这堆日志按错误类型聚类"，都不是预先能设计成角色的。结果是主智能体要么硬扛
 * （把上下文撑爆、步数烧光），要么临时写脚本（能力被沙箱限制）。
 *
 * AOrchestra 的解法：把子智能体从"静态角色"降级为一个**可组合可实例化的能力配方**，
 * 由主智能体在运行时按当前子任务**现场填四元组**：
 *   · I (Instruction) 子任务定义与成功标准 —— 决定它做什么
 *   · C (Context)     只给这个子任务需要的上下文 —— 不是整段对话历史（防上下文腐化）
 *   · T (Tools)       只开这个子任务需要的工具 —— 收缩权限面，减少误用与分心
 *   · M (Model)       按难度选执行模型 —— 简单活给轻量模型，省成本
 *
 * 编排与执行解耦：主智能体只负责"拆解 / 配上下文 / 选工具 / 选模型"，不亲自下场。
 *
 * ═══ ★★ 安全边界（三条，都是不可省的）★★
 *
 * ① **不得提权**：子智能体的工具必须是**父智能体已挂载工具的子集**。
 *    模型可以自由"少要"，不能"多要" —— 否则一个只读会话里的智能体就能通过
 *    现场生成子智能体拿到 file_write / cmd_exec，权限分级形同虚设。
 * ② **黑名单**：子智能体不得再生成子智能体、不得改动智能体定义
 *    （否则递归自增殖 + 自我提权，本项目记忆里记过 5+ 执行入口漂移的教训）。
 * ③ **预算闸**：单个任务内现场生成次数有上限（防"打不过就再叫一个"的无限增殖）。
 *
 * 本模块刻意做成**纯函数、零 DB 依赖**：便于真跑测试，也便于被 core 侧复用。
 */

/** 运行时子智能体的四元组（LLM 侧传入的原始形态，允许字段缺失） */
export interface SubAgentSpec {
  /** I —— 子任务定义 + 成功标准（必填） */
  instruction: string;
  /** C —— 只给该子任务需要的上下文（推荐填；缺失时由调用方兜底） */
  context?: string;
  /** T —— 需要的工具名清单，支持 `browser_*` 这类前缀通配；留空 = 不给工具（纯推理） */
  tools?: string[];
  /** T 的减项（通配优先级：先按 tools 展开，再剔除 exclude） */
  toolExclude?: string[];
  /** M —— 指定执行模型（缺省沿用父任务模型） */
  platformId?: string;
  modelId?: string;
  /** 子智能体步数上限（缺省 DEFAULT_SPEC_MAX_STEPS） */
  maxSteps?: number;
  /** 期望产出物描述（写进提示词，让子智能体知道"交付什么形状的结果"） */
  deliverable?: string;
  /** 用途说明（落库供用户回看：这次为什么开这个子智能体） */
  purpose?: string;
}

/** 归一化 + 安全裁剪后的结果 */
export interface ResolvedSubAgentSpec {
  spec: SubAgentSpec;
  /** 实际开放的工具名（已过白名单/权限/父挂载三重裁剪） */
  pinnedToolIds: string[];
  /** 被裁剪掉的（附原因），会回显给模型 —— 让它知道"我要的能力为什么没给" */
  dropped: Array<{ name: string; reason: string }>;
  platformId?: string;
  modelId?: string;
  maxSteps: number;
}

/** ★ 子智能体绝对拿不到的工具：再生成子智能体 / 改动智能体定义 / 会话自配置 */
export const SPEC_TOOL_BLACKLIST: ReadonlySet<string> = new Set([
  // 递归自增殖：子智能体不能再委派（深度仍限 1 层，与既有口头约定保持一致并用代码钉死）
  'call_agent',
  'spawn_subagent',
  'list_sub_agents',
  'api_agent_create',
  'api_agent_update',
  'api_agent_delete',
  'api_agent_mount',
  // 自我提权：改会话的智能体/技能/模式 = 改后续所有轮次的执行身份
  'api_conversation_setup',
  // 定义类写入：现场造子智能体不应该顺手改全局工具/skill 定义
  'api_custom_tool_create',
  'api_custom_tool_update',
  'api_custom_tool_delete',
  'api_custom_tool_toggle',
  'api_skill_create',
  'api_skill_update',
  'api_skill_delete',
  'api_skill_toggle',
]);

export const DEFAULT_SPEC_MAX_STEPS = 60;
export const MIN_SPEC_MAX_STEPS = 5;
/** 2026-10-05 与子智能体兜底上限同步放大到 500（长任务靠上下文压缩承载，不靠截断） */
export const MAX_SPEC_MAX_STEPS = 500;
/** 单个任务内现场生成子智能体的上限（预算闸；0 = 关闭该能力） */
export const DEFAULT_MAX_SPAWN_PER_TASK = 12;

/** 工具清单的硬上限（防止模型一口气列 100 个工具把提示词撑爆） */
const MAX_PINNED_TOOLS = 40;

/**
 * 把带通配的清单展开成具体工具名。
 *
 * 支持 `browser_*` / `api_media_*` 这类前缀通配（`*` 只能在末尾，避免写出
 * 让人看不懂的正则式模式）。返回**保持 patterns 的顺序**、去重后的结果。
 */
export function expandToolPatterns(patterns: string[], universe: Iterable<string>): string[] {
  const all = [...universe];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of patterns) {
    const p = String(raw || '').trim();
    if (!p) continue;
    const push = (n: string) => {
      if (!n || seen.has(n)) return;
      seen.add(n);
      out.push(n);
    };
    if (p.endsWith('*')) {
      const prefix = p.slice(0, -1);
      if (!prefix) continue; // 光一个 `*` 不给（等于要全部，太危险）
      for (const n of all) if (n.startsWith(prefix)) push(n);
      continue;
    }
    push(p);
  }
  return out;
}

/**
 * 解析四元组里的 **T（工具）** —— 三重裁剪，缺一不可。
 *
 * @param requested  模型请求的工具清单（可含通配）
 * @param excluded   显式排除
 * @param parentToolIds ★★ 父智能体**当前可用**的工具全集 —— 这是"不得提权"的边界
 * @param isAllowed  权限判定（只读会话拒写类），由调用方注入 checkToolPermission
 */
export function resolveSpecTools(args: {
  requested: string[];
  excluded?: string[];
  parentToolIds: Iterable<string>;
  isAllowed: (toolName: string) => { allowed: boolean; reason?: string };
}): { pinned: string[]; dropped: Array<{ name: string; reason: string }> } {
  const parentSet = new Set([...args.parentToolIds]);
  const dropped: Array<{ name: string; reason: string }> = [];

  // 模型请求了但父级根本没有的（提权尝试 / 名字写错）—— 单独回显，两种原因分开说。
  // ★★★ 这里必须**先把越权项挑出来并从展开结果里剔除**：单纯往 dropped 里记一笔是不够的 ——
  //   第一版就是这么写的，实测 `pinned` 与 `dropped` **同时**包含了 cmd_exec
  //   （原因记了、工具也给了），正是"错了不报错"的形态。真跑验证才抓出来。
  const overreach: string[] = [];
  for (const raw of args.requested) {
    const p = String(raw || '').trim();
    if (!p || p.endsWith('*')) continue;
    if (!parentSet.has(p)) {
      overreach.push(p);
      dropped.push({
        name: p,
        reason: SPEC_TOOL_BLACKLIST.has(p)
          ? '该工具被禁止在子智能体中使用（防递归委派 / 防自我提权）'
          : '父智能体未挂载该工具，子智能体不得提权获得',
      });
    }
  }
  const overreachSet = new Set(overreach);

  // ★ expandToolPatterns 只负责"按前缀展开"，不做归属判定（保持它是通用函数）；
  //   归属边界由这里把守：展开结果必须与 parentSet 求交集，越权项直接排除。
  const expanded = expandToolPatterns(args.requested, parentSet)
    .filter((n) => parentSet.has(n) && !overreachSet.has(n));
  const excludeSet = new Set(expandToolPatterns(args.excluded || [], parentSet));

  const pinned: string[] = [];
  for (const name of expanded) {
    if (pinned.length >= MAX_PINNED_TOOLS) {
      dropped.push({ name, reason: `工具数超过上限 ${MAX_PINNED_TOOLS}，已截断` });
      continue;
    }
    if (excludeSet.has(name)) continue;
    if (SPEC_TOOL_BLACKLIST.has(name)) {
      dropped.push({ name, reason: '该工具被禁止在子智能体中使用（防递归委派 / 防自我提权）' });
      continue;
    }
    const verdict = args.isAllowed(name);
    if (!verdict.allowed) {
      dropped.push({ name, reason: verdict.reason || '当前会话权限不允许该工具' });
      continue;
    }
    pinned.push(name);
  }
  return { pinned, dropped };
}

/** 归一化：把 LLM 传的松散对象收敛成合法 Spec（并夹紧数值区间） */
export function normalizeSubAgentSpec(raw: Partial<SubAgentSpec>): SubAgentSpec | { error: string } {
  const instruction = String(raw?.instruction || '').trim();
  if (!instruction) {
    return { error: 'instruction 为必填项：必须说明这个子智能体要做什么、以及什么算完成（成功标准）。' };
  }
  if (instruction.length < 10) {
    return { error: 'instruction 过于简略（<10 字）。子智能体看不到主对话，指令必须自包含：做什么、要什么结果、什么算完成。' };
  }
  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
  };
  const maxSteps = Math.min(MAX_SPEC_MAX_STEPS, Math.max(MIN_SPEC_MAX_STEPS, num(raw?.maxSteps, DEFAULT_SPEC_MAX_STEPS)));
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [];
  return {
    instruction,
    context: raw?.context ? String(raw.context) : undefined,
    tools: strArr(raw?.tools),
    toolExclude: strArr(raw?.toolExclude),
    platformId: raw?.platformId ? String(raw.platformId) : undefined,
    modelId: raw?.modelId ? String(raw.modelId) : undefined,
    maxSteps,
    deliverable: raw?.deliverable ? String(raw.deliverable) : undefined,
    purpose: raw?.purpose ? String(raw.purpose) : undefined,
  };
}

/**
 * 预算闸（serious business：防"打不过就再叫一个"的无限增殖）。
 * @param runsSoFar  本任务内已生成的子智能体次数
 * @param maxRuns    上限；0 = 关闭现场生成能力
 */
export function checkSpawnBudget(runsSoFar: number, maxRuns: number): { allowed: boolean; reason: string } {
  if (maxRuns <= 0) {
    return { allowed: false, reason: '本会话已关闭「运行时生成子智能体」能力（可在智能体配置里开启）。请用 call_agent 调用已有子智能体，或自己完成。' };
  }
  if (runsSoFar >= maxRuns) {
    return { allowed: false, reason: `本次任务现场生成子智能体已达上限（${maxRuns} 次）。请把剩余工作自己完成，或改用 call_agent 调用已有子智能体。` };
  }
  return { allowed: true, reason: '' };
}

/**
 * 渲染子智能体的系统提示词（四元组的 I + C + 交付约定）。
 *
 * ★ 关键：**不做整段对话继承**。子智能体只看到 instruction + context ——
 *   这正是 AOrchestra 强调的"working memory 与 capabilities 分离"：
 *   给够信息但不给整段历史（否则上下文腐化、注意力被无关历史分走）。
 */
export function renderSpecSystemPrompt(resolved: ResolvedSubAgentSpec): string {
  const s = resolved.spec;
  const parts: string[] = [];
  parts.push('你是一个**按需生成的专项子智能体**。你看不到主对话历史，只掌握下面这些信息，请严格据此完成任务。');
  parts.push(`## 你的任务\n${s.instruction}`);
  if (s.context && s.context.trim()) {
    parts.push(`## 上下文（主智能体为你准备的、与本次任务相关的信息）\n${s.context.trim()}`);
  }
  if (s.deliverable && s.deliverable.trim()) {
    parts.push(`## 期望产出\n${s.deliverable.trim()}`);
  }
  parts.push(
    [
      '## 工作约定',
      '- 你是**执行者**不是编排者：不要再委派子智能体，也不要修改智能体/技能定义（相关工具未开放）。',
      '- 完成任务后，用一段**结构化的结论**回复：做了什么、得到的关键结果（含具体数值/路径/URL）、还有什么没做完。',
      '- 结论会被主智能体直接使用，请写成**可独立理解**的形式 —— 不要出现"如上所述""刚才那个"这类只有你看得懂的指代。',
      resolved.pinnedToolIds.length === 0
        ? '- 本次未给你开放工具：请只做推理与整理，不要假设自己能读写文件或访问网络。'
        : `- 可用工具：${resolved.pinnedToolIds.join('、')}。未列出的工具你没有权限，需要时请在结论里说明"需要 X 能力"。`,
    ].join('\n'),
  );
  return parts.join('\n\n');
}

/**
 * 子任务指纹 —— 用来判断"这是不是同一类子任务又出现了"。
 *
 * 用途：同一类子任务如果被反复**现场生成**，说明它其实是**稳定的能力需求**，
 * 该固化成正式子智能体（有预设提示词、能被 call_agent 直接点名、省一次编排开销）。
 *
 * 规范化口径：去空白 → 转小写 → 去数字 → 去标点 → 取前 24 字符。
 *
 * ★★ 刻意**保守**（宁可漏报，不要误报）：
 *   字符串级归并**无法**可靠判断「抓取 A/B/C 的报价」与「抓取 X/Y 的报价」是同类 ——
 *   只差几个实体名，前缀就分叉了。硬做模糊匹配（比如去掉单个拉丁字母）会把
 *   「查 API 文档」与「查 SQL 文档」也并到一起，误报更烦人。
 *   · 漏报的代价：少给一次"要不要固化"的提示（无害）；
 *   · 误报的代价：在无关任务上蹦出固化建议（烦人，且会诱导建无用角色）。
 *   → 所以只识别**真正重复**（规范化后前缀一致）的情形。这是能力边界，不是缺陷。
 */
export function specFingerprint(instruction: string): string {
  return String(instruction || '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/[0-9]/g, '')
    .replace(/[，。、；：！？（）【】《》"'`~!@#$%^&*()\-_=+\[\]{}|\\/<>.,;:?]/g, '')
    .slice(0, 24);
}

/**
 * 是否值得把这套四元组**沉淀成正式子智能体**（AOrchestra 之外的通用实践：
 * 反复用到同一套配置就会固化，不必每次现场生成）。
 *
 * ★ 刻意保守：只在同一 instruction 指纹上重复出现时建议沉淀，且**只建议不自动建**
 *   （自动建会在库里堆一堆一次性角色，反而污染 sub_agents 列表）。
 */
export function shouldSuggestPersist(priorHitCount: number): boolean {
  return priorHitCount >= 2;
}

/** 给 LLM 的 function schema（spawn_subagent 工具定义） */
export function buildSpawnSubAgentSchema() {
  return {
    name: 'spawn_subagent',
    description:
      '按需**现场生成一个专项子智能体**并把子任务交给它执行（运行时创建，用完即弃；不会在智能体列表里留下角色）。'
      + '当你发现当前任务缺少合适的执行能力（需要专门的调研/核验/聚类/批量处理角色，或某个已有子智能体都不对口）时使用。'
      + '四个要素你要现场填：instruction（做什么+什么算完成）、context（**只给相关背景**，它看不到主对话历史）、tools（**只开需要的工具**，必须是父级已挂载工具的子集，支持 browser_* 这类通配）、'
      + 'platformId/modelId（可选，简单活用轻量模型省钱）。'
      + '与 call_agent 的区别：call_agent 调用**已存在**的子智能体，spawn_subagent **现场定制**一个。能用 call_agent 解决就不必 spawn。',
    parameters: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: '必填。子任务定义 + 成功标准。必须自包含（它看不到主对话历史）：做什么、要什么结果、什么算完成。',
        },
        context: {
          type: 'string',
          description: '推荐填。只放与本次子任务相关的信息（关键数据/路径/URL/约束）。不要粘贴整段对话历史 —— 无关历史会分散注意力。',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: '要给它开放的工具名清单，支持 `browser_*` 这类前缀通配。留空=不给工具（纯推理/整理）。★ 只能是父智能体已挂载工具的子集，多要的会被拒绝并回显原因。',
        },
        toolExclude: {
          type: 'array',
          items: { type: 'string' },
          description: '可选。在 tools 展开结果里再排除掉某几个（如 `browser_*` 里不要 navigate）。',
        },
        platformId: { type: 'string', description: '可选。执行模型所在平台 id；缺省沿用你的当前模型。可先用 list_models 查询。' },
        modelId: { type: 'string', description: '可选。执行模型 id（需属于 platformId）。简单任务建议用轻量模型以省成本。' },
        maxSteps: { type: 'number', description: `可选。该子智能体的步数上限（${MIN_SPEC_MAX_STEPS}-${MAX_SPEC_MAX_STEPS}，默认 ${DEFAULT_SPEC_MAX_STEPS}）。` },
        deliverable: { type: 'string', description: '可选。期望产出的形状描述（如"一张三列对比表""一份带出处的清单"），写清楚它才好交付。' },
        purpose: { type: 'string', description: '可选。一句话说明你为什么开这个子智能体（会展示给用户，便于事后理解）。' },
      },
      required: ['instruction'],
    },
  };
}