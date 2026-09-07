// task_plan / task_step 内置工具 —— 任务规划与实时进度展示
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（更新 UI 任务进度面板），
//       此类仅提供 schema 注册，让大模型知道这两个工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class TaskPlanTool implements BuiltInTool {
  name = 'task_plan';
  description =
    '在多步骤任务开始时创建（或替换）当前可见的任务规划，以有序步骤列表展示给用户，' +
    '便于其跟踪进度。每个步骤初始为 pending（待执行），后续需要通过 task_step 推进状态。';
  inputSchema = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Optional title for the plan, e.g. "生成周报".',
      },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short label of the step.' },
            description: { type: 'string', description: 'Optional detail of the step.' },
          },
          required: ['title'],
        },
        description: 'Ordered list of steps to accomplish the task.',
      },
    },
    required: ['steps'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    return {
      content: [{ type: 'text', text: `task_plan intercepted. steps=${(args.steps as any[])?.length ?? 0}` }],
    };
  }
}

export class TaskStepTool implements BuiltInTool {
  name = 'task_step';
  description =
    'Update the status of a step in the current task plan so the user sees live progress. ' +
    'Mark a step running before working on it and done (or failed) after finishing.';
  inputSchema = {
    type: 'object',
    properties: {
      index: {
        type: 'number',
        description: '1-based index of the step to update (matches the order given in task_plan).',
      },
      status: {
        type: 'string',
        enum: ['pending', 'running', 'done', 'failed'],
        description: 'New status of the step.',
      },
      note: {
        type: 'string',
        description: 'Optional note shown next to the step (e.g. a short result summary).',
      },
    },
    required: ['index', 'status'],
  };

  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    return {
      content: [{ type: 'text', text: `task_step intercepted. index=${args.index} status=${args.status}` }],
    };
  }
}
