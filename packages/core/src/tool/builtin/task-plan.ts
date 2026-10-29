// task_plan / task_step 内置工具 —— 任务规划与实时进度展示
// 注意：实际执行逻辑由 chat.ts 的 dispatchToolCall 拦截处理（更新 UI 任务进度面板），
//       此类仅提供 schema 注册，让大模型知道这两个工具的存在与参数格式。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class TaskPlanTool implements BuiltInTool {
  name = 'task_plan';
  description =
    '为多步骤任务创建（或替换）任务计划，以有序步骤列表展示给用户跟踪进度。' +
    '计划会持久化到工作目录（.yan-zhi/task-memory/plan.md）：换会话、重启后仍可见，' +
    '新会话能基于它接续未完成的步骤，因此长任务、会分批执行的任务应主动使用。' +
    '每个步骤初始为 pending（待执行），后续需要通过 task_step 推进状态。' +
    '同一轮任务里重复调用按「重规划」处理：沿用原计划创建时间，并按标题保留已完成步骤的耗时；' +
    '不要为了补一步而反复重建计划，优先用 task_step 推进现有步骤。';
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
    'Mark a step running **before** you start working on it and done (or failed) as soon as it finishes. ' +
    '步骤的开始/结束时间由服务端据此记录（耗时统计的唯一来源）；只在结束时标 done 的话，' +
    '该步起点只能按上一步结束点估算，耗时会失真。' +
    '两条硬约束：① 同一时刻只允许一个步骤 running——要把当前步关掉（done/failed）后才能动下一步；' +
    '② 已完成的步骤重新标 running 属于返工，必须在 note 里写明返工原因，否则服务端拒绝。' +
    '状态更新会同步持久化到工作目录计划文件，保证换会话/自动接力时进度不丢。';
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
        description: 'Optional note shown next to the step (e.g. a short result summary). 把已完成步骤重新打开（返工）时必填，写明返工原因。',
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
