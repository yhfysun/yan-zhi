// spawn_subagent 内置工具 —— 运行时现场生成专项子智能体（对齐 AOrchestra Φ=(I,C,T,M)）
//
// 注意：实际执行逻辑由 llm-task-manager.ts 的 executeTool 拦截处理（需访问 DB / 主循环上下文），
//       此类仅提供 schema 注册与系统提示词说明，让大模型知道该工具的存在与参数格式。
//
// 与 call_agent 的区别（写进 description，模型才不会用错）：
//   · call_agent(agentId)   —— 调用**已存在**的静态子智能体
//   · spawn_subagent(spec)  —— 现场**定制**一个临时执行者，库里不留角色
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class SpawnSubAgentTool implements BuiltInTool {
  name = 'spawn_subagent';
  description =
    '按需**现场生成一个专项子智能体**并把子任务交给它执行（运行时创建，用完即弃，不会在智能体列表里留下角色）。'
    + '当你发现当前任务缺少合适的执行能力（需要专门的调研/核验/聚类/批量处理角色，或已有子智能体都不对口）时使用。'
    + '四个要素现场填：instruction（做什么 + 什么算完成，必填且要自包含——它看不到主对话历史）、'
    + 'context（**只给相关背景**，别粘贴整段历史）、tools（**只开需要的**，必须是父级已挂载工具的子集，支持 `browser_*` 通配）、'
    + 'platformId/modelId（可选，简单活用轻量模型省钱）。'
    + '与 call_agent 的区别：call_agent 调**已存在**的子智能体，spawn_subagent **现场定制**一个；能用 call_agent 解决就不必 spawn。';
  inputSchema = {
    type: 'object',
    properties: {
      instruction: {
        type: 'string',
        description: '必填。子任务定义 + 成功标准。必须自包含（它看不到主对话历史）：做什么、要什么结果、什么算完成。',
      },
      context: {
        type: 'string',
        description: '推荐填。只放与本次子任务相关的信息（关键数据/路径/URL/约束）。不要粘贴整段对话历史——无关历史会分散注意力。',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description: '要给它开放的工具名清单，支持 `browser_*` 这类前缀通配。留空 = 不给工具（纯推理/整理）。★ 只能是父智能体已挂载工具的子集，多要的会被拒绝并回显原因。',
      },
      toolExclude: {
        type: 'array',
        items: { type: 'string' },
        description: '可选。在 tools 展开结果里再排除某几个（如 `browser_*` 里不要 navigate）。',
      },
      platformId: { type: 'string', description: '可选。执行模型所在平台 id；缺省沿用你当前的模型。可先用 list_models 查询。' },
      modelId: { type: 'string', description: '可选。执行模型 id（需属于 platformId）。简单任务建议用轻量模型以省成本。' },
      maxSteps: { type: 'number', description: '可选。该子智能体的步数上限（5-200，默认 60）。' },
      deliverable: { type: 'string', description: '可选。期望产出的形状描述（如"一张三列对比表""一份带出处的清单"），写清楚它才好交付。' },
      purpose: { type: 'string', description: '可选。一句话说明你为什么开这个子智能体（会展示给用户，便于事后理解）。' },
    },
    required: ['instruction'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    // 实际执行由 llm-task-manager 的 executeTool 拦截，此处仅为占位（正常不会走到）
    return {
      content: [{ type: 'text', text: `spawn_subagent intercepted by dispatch loop. spec=${JSON.stringify(args).slice(0, 200)}` }],
    };
  }
}