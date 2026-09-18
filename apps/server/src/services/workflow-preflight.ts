// 工作流「运行前预检」——把确定性错误在启动前拦掉（纯函数，不碰 db）。
//
// 为什么要这个：工作流的失败往往发生在跑到第 N 个节点时，用户等了半天才看到
// 「模型不存在」「LLM 节点缺少 platformId/modelId」这类**本来一眼就能看出来**的错误。
// 典型真实故障（库里可查）：某 LLM 节点的 modelId 指向已下线模型 → 跑到那个节点才爆。
//
// 能拦的（确定性）+ 不能拦的（运行期）：
//   ✅ 缺 platformId/modelId、引用了不存在的模型、必填入参缺失/类型不符、
//      tool 节点工具未注册、没有 output 节点、节点 id 重复、边指向不存在的节点
//   ❌ LLM 返回非法 JSON、模型编造字段、循环跑偏 —— 这些只能靠节点重试与失败续跑兜住
//
// blocking=true 的项直接拒绝启动；blocking=false 的只提示、允许继续（如「没有 output 节点，
// 不会产出可用交付」这类在设计上可能是有意的中间态调试）。
import type { Workflow } from '@yan-zhi/shared';
import type { WorkflowInputFieldDef } from './workflow-delegate.js';

export interface PreflightIssue {
  /** true = 严重，直接拒绝启动；false = 提示，可继续 */
  blocking: boolean;
  /** 出问题的节点（全局问题为 undefined） */
  nodeId?: string;
  code:
    | 'NO_NODES'
    | 'NO_OUTPUT'
    | 'DUP_NODE_ID'
    | 'DANGLING_EDGE'
    | 'LLM_NO_MODEL'
    | 'MODEL_NOT_FOUND'
    | 'TOOL_NOT_REGISTERED'
    | 'INPUT_MISSING'
    | 'INPUT_TYPE';
  msg: string;
}

export interface PreflightContext {
  /** 可用的 modelId 集合（含平台校验后的结果） */
  availableModelIds: Set<string>;
  /** 已注册的工具名集合 */
  registeredTools: Set<string>;
}

/** 节点参数里取字符串（兼容 camelCase / snake_case 两种历史写法） */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
}

function pick(config: Record<string, any>, ...keys: string[]): string {
  for (const k of keys) {
    const v = str(config?.[k]);
    if (v) return v;
  }
  return '';
}

/**
 * 预检一个工作流定义 + 本次入参。
 * @returns issues：空数组 = 可以安全启动
 */
export function preflightWorkflow(
  workflow: Workflow | null | undefined,
  inputs: Record<string, unknown>,
  fields: WorkflowInputFieldDef[],
  ctx: PreflightContext,
): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const nodes = (workflow?.nodes || []) as any[];
  const edges = (workflow?.edges || []) as any[];

  if (nodes.length === 0) {
    issues.push({ blocking: true, code: 'NO_NODES', msg: '该工作流没有任何节点，无法运行' });
    return issues; // 后面基于节点的检查都没意义了
  }

  // 1) 节点 id 唯一
  const seenIds = new Set<string>();
  for (const n of nodes) {
    const id = str(n?.id);
    if (!id) {
      issues.push({ blocking: true, code: 'DUP_NODE_ID', msg: `存在没有 id 的节点（type=${str(n?.type) || '未知'}）` });
      continue;
    }
    if (seenIds.has(id)) {
      issues.push({ blocking: true, nodeId: id, code: 'DUP_NODE_ID', msg: `节点 id 重复：${id}` });
    }
    seenIds.add(id);
  }

  // 2) 必须有 output 节点（否则跑完拿不到交付）
  if (!nodes.some((n) => str(n?.type) === 'output')) {
    issues.push({
      blocking: false,
      code: 'NO_OUTPUT',
      msg: '该工作流没有「输出」节点 —— 会执行完但拿不到结构化交付结果',
    });
  }

  // 3) 边指向的节点必须存在
  for (const e of edges) {
    const t = str(e?.target);
    const s = str(e?.source);
    if (t && !seenIds.has(t)) {
      issues.push({ blocking: true, code: 'DANGLING_EDGE', msg: `连线指向不存在的节点：${s || '?'} → ${t}` });
    }
  }

  // 4) 逐个节点检查能静态判定的问题
  for (const n of nodes) {
    const id = str(n?.id) || '(无 id)';
    const type = str(n?.type);
    const config = (n?.config || {}) as Record<string, any>;

    if (type === 'llm') {
      const platformId = pick(config, 'platformId', 'platform_id');
      const modelId = pick(config, 'modelId', 'model_id');
      if (!platformId || !modelId) {
        issues.push({
          blocking: true,
          nodeId: id,
          code: 'LLM_NO_MODEL',
          msg: `LLM 节点「${id}」缺少 platformId/modelId —— 请在画布上为该节点选一个模型`,
        });
      } else if (!ctx.availableModelIds.has(modelId)) {
        // 这条就是库里那个「模型不存在: agnes-2.5-flash」的根因：模型下线了，节点还指着它
        issues.push({
          blocking: true,
          nodeId: id,
          code: 'MODEL_NOT_FOUND',
          msg: `LLM 节点「${id}」引用的模型已不存在（modelId=${modelId}）—— 请在画布上重新选模型，或在运行面板覆盖该节点模型`,
        });
      }
    }

    if (type === 'tool') {
      // 工具名有三种来源，必须都认，否则会把合法工作流拦死（实测踩到）：
      //   1) ToolRegistry 里的内置/插件/自定义工具（file_write、plugin_xxx__yyy）
      //   2) SUPPORTED_API_TOOLS 里的 API 工具（api_image_generate、api_tts_speak…）
      //      —— 这些**不走 ToolRegistry**，只在 executeApiTool 里按名字分发
      //   3) MCP 工具（运行时按 server 前缀解析，静态查不到，一律放行不误报）
      const toolName = pick(config, 'toolName', 'tool_name', 'tool', 'name');
      if (toolName && !ctx.registeredTools.has(toolName) && !toolName.startsWith('mcp_')) {
        issues.push({
          blocking: true,
          nodeId: id,
          code: 'TOOL_NOT_REGISTERED',
          msg: `工具节点「${id}」引用的工具未注册：${toolName} —— 该工具可能未启用（如插件未激活）`,
        });
      }
    }
  }

  // 5) 入参检查（按 input 节点声明的 schema）
  for (const f of fields) {
    const v = inputs[f.key];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (f.required && empty) {
      issues.push({
        blocking: true,
        code: 'INPUT_MISSING',
        msg: `缺少必填入参「${f.label || f.key}」`,
      });
      continue;
    }
    if (empty) continue;
    if (f.type === 'number' && Number.isNaN(Number(v))) {
      issues.push({ blocking: true, code: 'INPUT_TYPE', msg: `入参「${f.label || f.key}」需要是数字，当前值：${String(v)}` });
    }
    if (f.type === 'array' && !Array.isArray(v)) {
      issues.push({
        blocking: true,
        code: 'INPUT_TYPE',
        msg: `入参「${f.label || f.key}」需要是数组（JSON 数组），当前值：${String(v).slice(0, 60)}`,
      });
    }
  }

  return issues;
}

/** 是否可启动：没有任何 blocking 项 */
export function canStart(issues: PreflightIssue[]): boolean {
  return !issues.some((i) => i.blocking);
}