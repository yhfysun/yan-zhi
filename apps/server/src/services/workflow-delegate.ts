// 工作流型子智能体委派 —— 纯函数层（不碰 db / LLM，便于单测）
//
// 背景：call_agent 原本只支持对话型子智能体（独立系统提示词 + 工具集，跑 ReAct 循环）。
// 工作流型智能体（type='workflow'）既没有系统提示词也没有工具，走 ReAct 会退化成
// 「你是一个智能助手」+ 零工具，返回一段与任务无关的空谈，而且完全不报错。
// 因此 harness 委派工作流时需要一层类型转换：文本入参 → 结构化 inputs，DAG 产物 → 工具结果文本。
//
// 本模块只放这些「无副作用」的转换，执行编排留在 llm-task-manager.ts。
// 单独成文件的理由：这些是最容易出错的部分（入参猜错会让整条 DAG 跑出无意义结果），必须可单测。

/**
 * 是否为工作流型智能体。
 *
 * ️ 兜底口径必须看 `workflow_json` **里是否真有节点**，不能只看「字段非空」。
 *
 * 原因（真 bug，实测踩到）：`agent.workflow_json` 的**列默认值是 `{"nodes":[],"edges":[]}`**
 * （见 db.ts 建表语句），不是 NULL。所以每个 harness 对话智能体（日常办公助手、代码编写助手…）
 * 的该列都非空 —— 原来的 `!!agent?.workflow_json` 对它们**全部返回 true**。
 * 这在既有两条调用路径（runSubAgent / list_sub_agents）上恰好都被 `type === 'workflow'`
 * 抢先命中或未走到，所以一直没暴露；一旦有新的调用方直接用这个函数做拦截，
 * 就会把所有对话智能体一起拦死（本次给 runReActLoop 加拦截时被测试抓到）。
 *
 * 因此判定顺序：type 明确是 workflow → true；type 明确是 harness → false；
 * 只有 type 缺失/无法识别时，才用「workflow_json 里确有 nodes」兜底历史脏数据。
 */
export function isWorkflowAgent(agent: { type?: string | null; workflow_json?: string | null } | null | undefined): boolean {
  if (!agent) return false;
  if (agent.type === 'workflow') return true;
  if (agent.type) return false; // harness 或其它已识别类型：不是工作流
  const raw = agent.workflow_json;
  if (!raw) return false;
  try {
    const nodes = (JSON.parse(raw) as { nodes?: unknown })?.nodes;
    return Array.isArray(nodes) && nodes.length > 0;
  } catch {
    return false;
  }
}

/**
 * 解析工作流入参 schema，返回字段名列表。
 * 兼容两种写法：{ topic: 'string' }（简写）与 { type: 'object', properties: { topic: {...} } }（JSON Schema）。
 */
export function parseInputsSchema(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const props = (v as Record<string, unknown>).properties;
      if (props && typeof props === 'object' && !Array.isArray(props)) return Object.keys(props);
      return Object.keys(v);
    }
  } catch {
    // schema 写坏了不该让委派整体失败 —— 退回「未声明」，按单键 input 处理
  }
  return [];
}

export type WorkflowInputsResult =
  | { ok: true; inputs: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * 从 input 节点的 config.schema 提取字段名（内置工作流的 schema 形状）。
 * config.schema 支持两种写法，与 parseInputsSchema 一致：
 *   { topic: 'string', roles: 'string[]（可选…）' }  → ['topic','roles']
 *   { properties: { topic: {...} } }                  → ['topic']
 */
function fieldsFromInputConfig(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const props = (schema as Record<string, unknown>).properties;
  if (props && typeof props === 'object' && !Array.isArray(props)) return Object.keys(props);
  return Object.keys(schema as Record<string, unknown>);
}

/**
 * 取工作流智能体的入参字段名。
 *
 * 优先 agent.inputs_schema_json；**为空时回落到 workflow_json 里 input 节点的 config.schema**。
 *
 * 这条回落是必须的：内置工作流（seedBuiltinWorkflowAgents 写入）只填 workflow_json，
 * inputs_schema_json 恒为 NULL。不回落的话 parseInputsSchema 返回 []，mapWorkflowInputs 就按
 * 「未声明入参」把整段文本塞进 key=input —— 而 DAG 读的是 ctx.inputs.topic，
 * 于是 topic 变 undefined、主题退化成「未命名主题」，跑完返回一份看似正常实则无意义的产出。
 * 正是本模块开头警告的那种「不抛异常的错」，所以必须在这里对齐。
 */
export function extractWorkflowInputFields(agent: {
  inputs_schema_json?: string | null;
  workflow_json?: string | null;
} | null | undefined): string[] {
  const fromColumn = parseInputsSchema(agent?.inputs_schema_json);
  if (fromColumn.length > 0) return fromColumn;
  try {
    const wf = JSON.parse(agent?.workflow_json || '{}');
    const inputs = (Array.isArray(wf?.nodes) ? wf.nodes : []).filter((n: any) => n?.type === 'input');
    // 多 input 节点时合并（同一 DAG 的入参节点通常只有一个，这里只为不丢字段）
    const merged = new Set<string>();
    for (const n of inputs) {
      for (const f of fieldsFromInputConfig(n?.config?.schema)) merged.add(f);
    }
    return [...merged];
  } catch {
    // workflow_json 坏了不该让委派整体失败 —— 退回「未声明」，由 mapWorkflowInputs 按单键处理
    return [];
  }
}

/**
 * 把 call_agent 的 input 映射成工作流的结构化 inputs。
 *
 * 关键约定：映射不出来就**明确报错并把 schema 回给模型**，绝不静默兜底猜 ——
 * 猜错不会抛异常，只会在若干分钟后返回一份看似正常、实则无意义的产出，比报错难查得多。
 */
export function mapWorkflowInputs(input: unknown, fields: string[]): WorkflowInputsResult {
  // 模型直接传了对象：原样使用（多入参工作流的推荐用法）
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return { ok: true, inputs: input as Record<string, unknown> };
  }
  const text = typeof input === 'string' ? input : input == null ? '' : String(input);
  if (fields.length === 1) return { ok: true, inputs: { [fields[0]]: text } };
  if (fields.length === 0) return { ok: true, inputs: { input: text } };
  const sample = Object.fromEntries(fields.map((f) => [f, '...']));
  return {
    ok: false,
    error: `该工作流需要 ${fields.length} 个入参（${fields.join(', ')}）。请把 input 传成 JSON 对象，例如：${JSON.stringify(sample)}`,
  };
}

/** 后台启动回执：call_agent 立即返回，不阻塞 ReAct 循环。 */
export function buildWorkflowReceipt(agentName: string, runId: string): string {
  return [
    `[工作流已在后台启动] ${agentName}`,
    `runId: ${runId}`,
    '该工作流为异步执行，不阻塞当前对话。执行完成后结果会自动写入本对话：文字直接输出，文件写入交付目录并登记。',
    '你现在可以继续处理其他事情，不必等待。',
  ].join('\n');
}

/** 工作流产物形态：文字直接输出成消息；文件落盘并登记为交付物。 */
export type WorkflowDeliverable =
  | { kind: 'text'; text: string }
  | { kind: 'file'; name: string; path?: string; content?: string; encoding?: 'utf8' | 'base64' };

const EMPTY_OUTPUT_NOTE = '[工作流已执行完成，但没有 output 节点产物]';

function isAbsoluteLike(v: string): boolean {
  return /^([A-Za-z]:[\\/]|\/|\\\\)/.test(v);
}

/** 单个 output 值的形态判定。文件路径与「内容 + 文件名」都能识别为文件。 */
function classifyOne(v: unknown): WorkflowDeliverable | null {
  if (v == null) return null;
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const p = typeof o.path === 'string' ? o.path : typeof o.file === 'string' ? o.file : '';
    const name = typeof o.name === 'string' ? o.name : typeof o.filename === 'string' ? o.filename : '';
    const content = typeof o.content === 'string' ? o.content : typeof o.data === 'string' ? o.data : '';
    if (p || (content && name)) {
      return {
        kind: 'file',
        name: name || (p ? p.split(/[\\/]/).pop() || 'output' : 'output'),
        path: p || undefined,
        content: content || undefined,
        encoding: o.encoding === 'base64' ? 'base64' : 'utf8',
      };
    }
    return { kind: 'text', text: JSON.stringify(v, null, 2) };
  }
  if (typeof v === 'string') {
    // 绝对路径 + 有扩展名 → 视为文件（是否真实存在由调用方确认）
    if (isAbsoluteLike(v) && v.length < 512 && /\.[A-Za-z0-9]{1,8}$/.test(v)) {
      return { kind: 'file', name: v.split(/[\\/]/).pop() || 'output', path: v };
    }
    return { kind: 'text', text: v };
  }
  return { kind: 'text', text: JSON.stringify(v, null, 2) };
}

/** 把 output 节点产物切成「文字 / 文件」两类，供反写对话时分路处理。 */
export function classifyWorkflowOutput(output: Record<string, unknown>): WorkflowDeliverable[] {
  const list: WorkflowDeliverable[] = [];
  for (const v of Object.values(output || {})) {
    const d = classifyOne(v);
    if (d) list.push(d);
  }
  return list.length ? list : [{ kind: 'text', text: EMPTY_OUTPUT_NOTE }];
}

/**
 * 给 Promise 套上超时与中止。
 *
 * 已知限制：超时/中止只让 call_agent 提前返回错误，DAG 本身没有中断机制，仍会在后台跑完。
 * 这是引擎当前的边界（节点 handler 无取消点），不是遗漏 —— 真要做到可中断需要给引擎加取消传播。
 */
export async function withAbortAndTimeout<T>(
  p: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  // 同步前置检查：Promise.race 无法保证这一点 —— 若 p 已 settled，它的 then 回调会排在中止分支之前，
  // 导致「信号已中止却仍然返回结果」。中止契约必须是无条件的。
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timed = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`工作流执行超时（${Math.round(timeoutMs / 1000)}s）`)), timeoutMs);
  });
  const aborted = new Promise<never>((_, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  try {
    return await Promise.race([p, timed, aborted]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
