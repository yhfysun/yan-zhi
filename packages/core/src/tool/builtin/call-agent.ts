// call_agent 内置工具 —— 委派任务给子智能体执行
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（需访问 agent store + LLM runner），
//       此类仅提供 schema 注册，让大模型知道该工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class CallAgentTool implements BuiltInTool {
  name = 'call_agent';
  description = '把子任务委托给指定的子智能体执行。子智能体可以是两种：对话型（以独立的系统提示词与可用工具运行，如 pageAgent 做浏览器自动化）；工作流型（type=workflow，执行一条固定的 DAG 流水线，如「调研报告生成助手」）。两者都由后端按 agentId 自动识别，你不需要区分调用方式，但入参形态不同：对话型传一段任务描述文本；工作流型按其声明的入参 schema 传值，多入参时传 JSON 对象。不确定该用哪个 agentId 时，可以先调用 list_sub_agents 列出可用子智能体及其 ID（其中会标注类型与入参）。';
  inputSchema = {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'The ID of the sub-agent to invoke. Discover available IDs by calling list_sub_agents, or refer to the "可调用子智能体" section in the system prompt which lists each agent with its id in backticks.',
      },
      input: {
        // 允许对象：多入参的工作流型子智能体需要结构化入参，传纯文本会被拒绝并回传 schema
        oneOf: [{ type: 'string' }, { type: 'object' }],
        description: 'The task description / input to pass to the sub-agent. Pass a plain string for conversational sub-agents. For workflow sub-agents with multiple declared inputs, pass a JSON object matching their input schema (a plain string is auto-mapped only when the workflow declares exactly one input field).',
      },
      platformId: {
        type: 'string',
        description: '可选：指定子智能体用哪个模型平台(platform id)。缺省时依次用子智能体自身配置、主智能体当前模型。可先调 list_models 查询可用平台/模型。',
      },
      modelId: {
        type: 'string',
        description: '可选：指定子智能体用哪个模型(model id)。需属于给定 platformId 对应平台（不传 platformId 时自动解析平台）。缺省时依次用子智能体自身配置、主智能体当前模型。图片/视频/视觉等任务建议指定对应能力的模型。',
      },
    },
    required: ['agentId', 'input'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    // 实际执行由 chat.ts dispatchToolCall 拦截，此处仅为占位（正常不会走到）
    return {
      content: [{ type: 'text', text: `call_agent intercepted by dispatch loop. agentId=${args.agentId}` }],
    };
  }
}
