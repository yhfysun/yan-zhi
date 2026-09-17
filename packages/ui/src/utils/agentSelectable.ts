// 会话智能体选择器的过滤规则 —— 纯函数层（不碰 pinia，便于单测）。
//
// 背景（真 bug）：原规则只写 `agentKind !== 'sub'`，于是 **workflow 型智能体混进了聊天智能体列表**。
// workflow 的 agent_kind 是数据库列默认值 'main'（不是 'sub'），所以只按 agentKind 过滤拦不住它。
//
// 后果不是「多一个选项」这么轻：用户选中「短剧流水线」当会话智能体后，后端主链路
// （createTask/runReActLoop）没有类型判定，会按 harness 跑 ReAct —— 而工作流型智能体的
// system_prompt 为 NULL、builtin_tool_ids 为 []，于是系统提示词里既没有角色定义也没有工具段，
// 模型拿到一句闲聊就按闲聊答：**不反问、不产出、DAG 永不启动，而且全程不报错**。
// 实测「龙珠里面打斗名场面」那条会话就是这样：4 条消息、tool_calls 全为 None、workflow_run 无记录。
//
// 因此这里必须同时排掉两类，语义各自独立：
//   1) sub 子智能体 —— 只能被其他智能体通过 subAgentIds 引用委派，不属于会话选择器；
//   2) workflow 工作流型 —— 跑固定 DAG，其触发入口是「智能体页画布运行 / 定时任务 workflow 类型 /
//      对话智能体 call_agent 委派」三条，都不经过会话智能体选择器。
//
// 智能体管理页仍展示全部（agents），工作流在那里可见、可编辑、可运行。

/** 会话智能体选择器的最小结构依赖（Agent 与后端行对象都能满足） */
export interface SelectableAgentLike {
  agentKind?: string | null;
  type?: string | null;
  /** workflow_json 原始字符串（后端行对象形态） */
  workflowJson?: string | null;
  workflow_json?: string | null;
  /** 已解析的 workflow 对象（前端 Agent 形态，rowToAgent 把 workflow_json 解析到这里） */
  workflow?: { nodes?: unknown[] } | null;
}

/** 从各种形态里取「是否有实际节点」 */
function hasWorkflowNodes(a: SelectableAgentLike): boolean {
  // 前端 Agent：workflow 已解析成对象
  if (a.workflow && Array.isArray(a.workflow.nodes) && a.workflow.nodes.length > 0) return true;
  // 后端行对象：workflow_json 是字符串
  const raw = a.workflow_json || a.workflowJson;
  if (!raw) return false;
  try {
    const nodes = (JSON.parse(raw) as { nodes?: unknown })?.nodes;
    return Array.isArray(nodes) && nodes.length > 0;
  } catch {
    return false;
  }
}

/**
 * 是否工作流型智能体（与后端 services/workflow-delegate.ts 的 isWorkflowAgent 同口径）。
 *
 * ️ 关键：`workflow_json` 的列默认值是 `{"nodes":[],"edges":[]}`（见 db.ts 建表语句），
 * **不是 NULL** —— 所有 harness 对话智能体的该字段都非空。所以不能只判「字段非空」，
 * 必须判 type，或（type 缺失时）判 workflow 里是否真有节点。
 * 只看非空会把「日常办公助手」等全部误判成工作流，从选择器里全部隐藏。
 */
export function isWorkflowAgentLike(a: SelectableAgentLike | null | undefined): boolean {
  if (!a) return false;
  if (a.type === 'workflow') return true;
  if (a.type) return false; // harness 或其它已识别类型：不是工作流
  return hasWorkflowNodes(a);
}

/**
 * 该智能体是否应出现在会话智能体选择器（智能体下拉 / 斜杠命令 / 「+」菜单三处共用）。
 * @returns true=可作为会话智能体；false=应从选择器隐藏
 */
export function isChatSelectableAgent(a: SelectableAgentLike | null | undefined): boolean {
  if (!a) return false;
  if (a.agentKind === 'sub') return false;
  if (isWorkflowAgentLike(a)) return false;
  return true;
}