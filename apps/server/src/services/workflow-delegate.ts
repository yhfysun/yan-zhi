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
 * 节点「运行时可覆盖」字段的默认白名单（按节点类型）。
 *
 * 为什么需要默认表：运行台让用户临时改模型/温度这类参数，但节点参数动辄七八项，
 * 全放开会把表单撑爆。所以默认只放行「改了不会破坏上下游契约」的少数几项：
 *   - llm 的模型/采样参数：换模型、调温度是最常见的临时调整，且不影响下游字段
 *   - loop 的迭代上限、memory_read 的召回条数：纯数值，安全
 *   - **不放开** code.expression / condition.expression / tool.toolName：
 *     改这些等于改流程逻辑或换工具，会让下游 arguments 与输出结构对不上，
 *     属于「改画布」而不是「改一次运行」—— 要改请回画布。
 * 节点若在 config.runtimeOverridable 里显式声明，则以声明为准（声明优先，默认表兜底）。
 */
export const DEFAULT_OVERRIDABLE: Record<string, string[]> = {
  llm: ['platformId', 'modelId', 'temperature', 'maxTokens'],
  loop: ['maxIterations'],
  memory_read: ['topK'],
};

/**
 * 可覆盖项的字段元数据（运行面板据此渲染正确的控件）。
 *
 * 关键点：**必须带上画布当前值**。运行面板要显示「当前：xxx」，让用户知道不填会用哪个模型；
 * 只给字段名的话，用户面对一个空输入框根本不知道默认值是什么，只能瞎填。
 */
export interface OverridableFieldMeta {
  key: string;
  label: string;
  /** 控件类型：model/platform = 下拉（选项由前端 store 提供）；number/string = 输入框 */
  control: 'model' | 'platform' | 'number' | 'string' | 'boolean';
  /** 画布上的当前值（"不覆盖就用这个"） */
  current?: unknown;
}

export interface OverridableNodeDef {
  nodeId: string;
  nodeType: string;
  /** 节点显示名（画布 label/title，缺省用 nodeId） */
  label: string;
  fields: OverridableFieldMeta[];
}

/** 覆盖字段的中文标签 */
const OVERRIDE_LABELS: Record<string, string> = {
  platformId: '模型平台',
  modelId: '模型',
  temperature: '温度（0~2）',
  maxTokens: '最大输出长度',
  maxIterations: '最大迭代次数',
  topK: '召回条数',
};

/** 每个字段该用什么控件 */
const OVERRIDE_CONTROLS: Record<string, OverridableFieldMeta['control']> = {
  platformId: 'platform',
  modelId: 'model',
  temperature: 'number',
  maxTokens: 'number',
  maxIterations: 'number',
  topK: 'number',
};

function metaOf(nodeConfig: Record<string, unknown> | null | undefined, key: string): OverridableFieldMeta {
  return {
    key,
    label: OVERRIDE_LABELS[key] || key,
    control: OVERRIDE_CONTROLS[key] || 'string',
    current: nodeConfig ? (nodeConfig as Record<string, unknown>)[key] : undefined,
  };
}

/** 取某节点允许运行时覆盖的字段（显式声明优先，否则按节点类型给默认值） */
export function overridableFieldsOf(node: { type?: string; config?: Record<string, unknown> | null }): string[] {
  const declared = (node?.config as any)?.runtimeOverridable;
  if (Array.isArray(declared)) return declared.filter((k: unknown) => typeof k === 'string');
  return DEFAULT_OVERRIDABLE[node?.type || ''] || [];
}

/**
 * 收集工作流里所有「有可覆盖字段」的节点，供运行台渲染「覆盖节点配置」折叠区。
 * 只有真正有字段的节点才返回 —— 否则每个工作流都会拖出一堆空分组。
 */
export function collectOverridableNodes(workflowJson: string | null | undefined): OverridableNodeDef[] {
  if (!workflowJson) return [];
  try {
    const wf = JSON.parse(workflowJson) as { nodes?: any[] };
    const out: OverridableNodeDef[] = [];
    for (const n of Array.isArray(wf?.nodes) ? wf!.nodes : []) {
      const keys = overridableFieldsOf(n);
      if (!n?.id || keys.length === 0) continue;
      const label = String(n?.config?.label || n?.config?.title || n?.id || '');
      out.push({
        nodeId: String(n.id),
        nodeType: String(n.type || ''),
        label,
        fields: keys.map((k) => metaOf(n?.config, k)),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** 运行表单字段定义（供运行台生成表单 / 工作流注册为工具的 inputSchema） */
export interface WorkflowInputFieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
  options?: string[];
  default?: unknown;
}

/**
 * 常见入参 key 的中文标签兜底。
 *
 * 为什么需要：简写 schema（`{ topic: 'string' }`）里没有人类可读的名字，
 * 运行表单直接把 key 甩出去就是「topic / roles」这种英文，用户看不懂要填什么。
 * 这里给高频 key 兜一层中文；更准确的名字应由工作流作者在 schema 里用 label 显式声明
 * （富写法 `{ topic: { type:'string', label:'短剧主题' } }`），显式声明永远优先。
 */
const INPUT_LABEL_HINTS: Record<string, string> = {
  topic: '主题',
  subject: '主题',
  title: '标题',
  roles: '角色名单',
  characters: '角色名单',
  name: '名称',
  names: '名称列表',
  content: '内容',
  text: '文本',
  query: '查询内容',
  keyword: '关键词',
  keywords: '关键词',
  url: '链接',
  urls: '链接列表',
  lang: '语言',
  language: '语言',
  style: '风格',
  format: '输出格式',
  count: '数量',
  num: '数量',
  size: '数量',
  duration: '时长',
  scenes: '镜头/场景列表',
  shots: '镜头列表',
  prompt: '提示词',
  instruction: '指令',
  city: '城市',
  date: '日期',
  file: '文件路径',
  path: '文件路径',
  target: '目标',
  goal: '目标',
  audience: '目标受众',
};

/** 从 'string[]（可选，限定角色名…）' 里拆出类型与括号内说明 */
function splitShorthand(raw: string): { typePart: string; note: string } {
  const m = raw.match(/^(.*?)[（(]([\s\S]*)[）)]\s*$/);
  if (!m) return { typePart: raw.trim(), note: '' };
  return { typePart: m[1].trim(), note: m[2].trim() };
}

/**
 * 简写类型推断：{ topic: 'string' } / { roles: 'string[]（可选）' } 这类写法。
 * 注意：括号里的内容**不是类型**，是作者写给使用者的说明，必须当描述用而不是拿去判类型。
 */
function inferTypeFromShorthand(v: string): WorkflowInputFieldDef['type'] {
  const s = splitShorthand(v).typePart.toLowerCase();
  if (/boolean|布尔|是否/.test(s)) return 'boolean';
  if (/number|int|float|数字|数值/.test(s)) return 'number';
  if (/\[\]|array|数组|列表/.test(s)) return 'array';
  if (/object|json|对象/.test(s)) return 'object';
  return 'string';
}

function normalizeType(t: unknown): WorkflowInputFieldDef['type'] {
  const s = String(t || '').toLowerCase();
  if (s === 'boolean') return 'boolean';
  if (s === 'number' || s === 'integer') return 'number';
  if (s === 'array') return 'array';
  if (s === 'object') return 'object';
  return 'string';
}

/** 取 input 节点的原始 schema 对象（内置工作流落在 workflow_json 的 input 节点 config.schema） */
function readInputSchemaObject(agent: { inputs_schema_json?: string | null; workflow_json?: string | null }): Record<string, unknown> | null {
  const tryParse = (raw?: string | null): unknown => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };
  const fromColumn = tryParse(agent?.inputs_schema_json);
  if (fromColumn && typeof fromColumn === 'object' && !Array.isArray(fromColumn) && Object.keys(fromColumn).length > 0) {
    return fromColumn as Record<string, unknown>;
  }
  const wf = tryParse(agent?.workflow_json) as { nodes?: unknown[] } | null;
  const nodes = Array.isArray(wf?.nodes) ? wf!.nodes : [];
  for (const n of nodes) {
    if ((n as any)?.type !== 'input') continue;
    const schema = (n as any)?.config?.schema;
    if (schema && typeof schema === 'object' && !Array.isArray(schema) && Object.keys(schema).length > 0) {
      return schema as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * 生成运行表单的字段定义。
 *
 * 与 extractWorkflowInputFields 的区别：那个只回字段名（委派时映射用），
 * 这个要回类型/是否必填/说明/枚举，运行台据此渲染表单、工作流注册为工具时据此生成 inputSchema。
 * schema 两种写法都支持：简写 { topic: 'string' } 与 JSON Schema { properties: {...}, required: [...] }。
 */
export function buildWorkflowInputFieldDefs(agent: {
  inputs_schema_json?: string | null;
  workflow_json?: string | null;
} | null | undefined): WorkflowInputFieldDef[] {
  const schema = readInputSchemaObject(agent || {});
  if (!schema) return [];
  const props = schema.properties;
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    const requiredList = Array.isArray(schema.required) ? schema.required.map(String) : [];
    return Object.entries(props as Record<string, any>).map(([key, p]) => {
      // 富写法的两种形态：{ topic: { type, label, description } } 或 { topic: { title, ... } }
      const v = p && typeof p === 'object' && !Array.isArray(p) ? p : {};
      const desc = v.description || v.hint || '';
      // 标签优先级：显式 label/title（作者最懂） > 中文兜底表（短、专为标签设计）> description > 裸 key。
      // 把 description 排在兜底表之后是刻意的：description 往往是整句话，当标签会撑破表单。
      const label = v.label || v.title || INPUT_LABEL_HINTS[key] || desc || key;
      return {
        key,
        label: String(label),
        type: normalizeType(v.type),
        required: requiredList.includes(key),
        // description 与 label 相同时不再重复（否则表单里标签和提示一模一样）
        description: desc && desc !== label ? String(desc) : undefined,
        options: Array.isArray(v.enum) ? v.enum.map(String) : undefined,
        default: v.default,
      };
    });
  }
  return Object.entries(schema).map(([key, v]) => {
    const raw = typeof v === 'string' ? v : (v && typeof v === 'object' ? '' : String(v ?? ''));
    const { note } = splitShorthand(raw);
    const explicitLabel = v && typeof v === 'object' && !Array.isArray(v)
      ? ((v as any).label || (v as any).title)
      : '';
    const label = explicitLabel || INPUT_LABEL_HINTS[key] || key;
    // 说明优先级：schema 里的描述 > 括号内说明 > label 兜底
    const description = (v && typeof v === 'object' && (v as any).description)
      || note
      || (label !== key ? label : undefined);
    return {
      key,
      label: String(label),
      type: inferTypeFromShorthand(raw),
      // 「（可选…）」是作者显式写的可选标记；没写就按必填处理（保守：宁可多问一次）
      required: !/可选|optional|非必填|可省略/i.test(raw),
      description: description ? String(description) : undefined,
    };
  });
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
