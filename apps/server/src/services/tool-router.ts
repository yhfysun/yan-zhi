/**
 * 动态工具路由（P2-1，2026-10-07）—— 工具面超过阈值时按任务相关性裁剪。
 *
 * ═══ 为什么要有 ═══
 * 2026 共识（多项生产实测一致）：模型可用的工具超过 ~20-30 个后，误选率显著上升，
 * 且工具定义本身每步都占 prompt token。但全靠人工挂载太僵硬 —— 用户挂了一堆工具后
 * 「工具太多反而变笨」是真实痛点。
 *
 * 取舍（刻意保守，三道防线防误伤）：
 *   ① **常驻核心集**不参与裁剪（子智能体委派 / 任务计划 / 文件底座 / 浏览器四件套 /
 *      会话级显式挂载的 api_* / 用户自建 custom_*）—— 这些是任务能跑通的底线；
 *   ② 只有**超出阈值**才裁，且最多裁到阈值（绝不满裁）；
 *   ③ 打分依据 = 工具名 + 描述 与任务文本的关键词重合度；**拿不到任务文本就不裁**
 *      （无信号时不做主观决策，宁可多给）。
 *
 * 纯函数、零 DB 依赖：可独立真跑测试（与 subagent-spec.ts 同一取向）。
 */

/**
 * 触发路由的工具面阈值：超过才裁。
 * ★ 必须大于常驻核心集规模（当前 23）+ 常见 custom_/mcp_ 挂载数，否则核心集直接占满
 *   阈值、裁剪永远不触发（首版设 24 被测试抓出这个 bug）。取 30 = 误选率上升带（20-30）的上沿。
 */
export const TOOL_ROUTE_THRESHOLD = 30;

/**
 * 常驻核心集：无论打分高低都不裁。
 * 判据：缺了任务就跑不通 / 属于编排与安全底座。
 */
export const TOOL_ROUTE_CORE = new Set<string>([
  // 编排底座
  'call_agent', 'list_sub_agents', 'spawn_subagent',
  'task_plan', 'task_step',
  // 交互（在线任务）
  'ask_user', 'confirm_user',
  // 文件与执行底座
  'file_read', 'file_list', 'file_write', 'file_edit',
  'cmd_exec', 'python_exec',
  // 浏览器四件套 + 代码模式 + 截图（pageAgent 主链路）
  'browser_navigate', 'browser_click', 'browser_type', 'browser_get_page_content',
  'browser_run_script', 'browser_screenshot', 'browser_upload',
  // 视觉识别（纯视觉兜底路线的执行件）
  'image_analyze',
  // 记忆底座（收尾沉淀用）
  'api_memory_search', 'api_memory_create', 'api_memory_list',
]);

/**
 * 从任务文本提取关键词（小写、去重）。
 * ★ 中英文都覆盖：拉丁词按非字母数字切分；CJK 按字保留单字（打分时用包含匹配，
 *   单字 CJK 只做加分项权重低，不会主导排序）。
 */
export function extractTaskKeywords(taskText: string | undefined | null): string[] {
  const t = String(taskText || '').toLowerCase();
  if (!t.trim()) return [];
  const words = t.split(/[^a-z0-9\u4e00-\u9fa5]+/).filter((w) => w.length >= 2);
  const cjk = (t.match(/[\u4e00-\u9fa5]/g) || []);
  return [...new Set([...words, ...cjk])];
}

/**
 * 单个工具与任务的相关性打分（越高越该保留）。
 *   · 名字命中关键词：每命中 +5（工具名是模型选路的首要依据）；
 *   · 描述命中关键词：每命中 +1（封顶 +10，防长描述刷分）。
 */
export function scoreToolRelevance(toolName: string, description: string, keywords: string[]): number {
  return nameScore(toolName, keywords) + descScore(description, keywords);
}

/** 名字分：每个命中关键词 +5 */
function nameScore(toolName: string, keywords: string[]): number {
  const name = String(toolName || '').toLowerCase();
  let s = 0;
  for (const k of keywords) if (k && name.includes(k)) s += 5;
  return s;
}

/** 描述分：每个命中关键词 +1，封顶 10（防长描述刷分） */
function descScore(description: string, keywords: string[]): number {
  const desc = String(description || '').toLowerCase();
  let s = 0;
  for (const k of keywords) if (k && desc.includes(k)) s += 1;
  return Math.min(s, 10);
}

/**
 * 动态路由主入口。
 * @returns { tools, dropped } —— dropped 供调用方打日志（模型侧不可见，执行面不受影响：
 *          被裁工具模型看不到自然不会调；即使调了 registry 仍能执行，不炸）。
 */
export function dynamicToolRoute(
  tools: Array<{ function: { name: string; description?: string } }>,
  taskText: string | undefined | null,
  opts?: { threshold?: number },
): { tools: typeof tools; dropped: string[] } {
  const threshold = opts?.threshold ?? TOOL_ROUTE_THRESHOLD;
  if (!Array.isArray(tools) || tools.length <= threshold) return { tools, dropped: [] };
  const keywords = extractTaskKeywords(taskText);
  // 无任务文本 → 无打分信号，不裁（宁可多给，不做无信号的主观决策）
  if (keywords.length === 0) return { tools, dropped: [] };

  const kept: typeof tools = [];
  const scored: Array<{ t: typeof tools[number]; s: number }> = [];
  for (const t of tools) {
    const n = t?.function?.name || '';
    // 常驻不裁：核心集 + 用户自建（custom_）+ 用户显式挂载的 MCP（mcp_）
    if (TOOL_ROUTE_CORE.has(n) || n.startsWith('custom_') || n.startsWith('mcp_')) {
      kept.push(t);
      continue;
    }
    scored.push({ t, s: scoreToolRelevance(n, t?.function?.description || '', keywords) });
  }
  if (kept.length >= threshold) return { tools, dropped: [] }; // 核心集已满 → 无裁剪空间，不硬裁
  const budget = threshold - kept.length;
  scored.sort((a, b) => b.s - a.s);
  const drop = scored.slice(budget).map((x) => x.t);
  kept.push(...scored.slice(0, budget).map((x) => x.t));
  // 保持原有相对顺序（prompt cache 前缀稳定 + tool 消息回填顺序无关此处，纯整洁）
  const rank = new Map(drop.map((t) => [t, 1] as const));
  const out = tools.filter((t) => !rank.has(t));
  return { tools: out, dropped: drop.map((t) => t.function.name) };
}
