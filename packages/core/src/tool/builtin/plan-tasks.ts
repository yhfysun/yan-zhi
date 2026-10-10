// 多智能体编排工具（2026-10-08）：plan_tasks / get_plan_status / reassign_task
// 注意：与 call_agent 同模式 —— schema 注册让模型知道工具存在与参数格式，
//       实际执行由 server 的 executeTool 拦截（需要访问 PlanRunner + runSubAgent）。
import type { BuiltInTool } from '../types';
import type { McpCallResult } from '../../mcp/client';

export class PlanTasksTool implements BuiltInTool {
  name = 'plan_tasks';
  description = '提交一份结构化任务计划（DAG）给并行调度器执行。适用场景：长任务的复杂规划 —— 把目标拆成多个子任务，每个子任务指定执行者（子智能体）与依赖关系；无依赖的任务会异步并行执行。★ 本工具是同步阻塞的：调用后会一直等到整份计划跑完，直接返回「完成/失败汇总」，不需要你轮询。关键约定：① 每个任务完成后只回报「结论摘要 + 产出文件路径」，大数据量内容不会进入你的上下文；② 下游任务引用上游产物时在 instruction 里写 {{artifact:任务id}}（会被替换为该任务产出的文件路径）或 {{artifact:LAST}}（最近完成的产物路径）；③ 返回汇总里会列出失败项与原因，用 reassign_task 重新分配（换执行者/改指令），不要原样重试。任务步骤要克制：抓取类任务建议 maxSteps 10 以内。';
  inputSchema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: '任务项列表（一次给全，含无依赖项以便并行）。',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '任务短 id（可选，如 t1/t2），dependsOn 与 {{artifact:}} 引用都用它；缺省自动按顺序分配。' },
            title: { type: 'string', description: '任务名（一句话，如「获取第3章全文」）。' },
            agentId: { type: 'string', description: '执行者子智能体 ID（可先调 list_sub_agents 查询）。' },
            instruction: { type: 'string', description: '任务指令。需要产出文件的任务必须写明「把结果保存为文件」，并可在指令里用 {{artifact:xx}} 引用上游产物路径。' },
            dependsOn: { type: 'array', items: { type: 'string' }, description: '依赖的任务 id 列表（可选）。无依赖的任务并行执行。' },
            maxSteps: { type: 'number', description: '该任务步数预算（可选，如抓取类 10）。缺省用执行者自身配置。' },
            platformId: { type: 'string', description: '可选：该任务用的模型平台。简单任务路由到小模型省配额。' },
            modelId: { type: 'string', description: '可选：该任务用的模型。按任务特质选型（写文案用强模型、格式转换用小模型）。' },
          },
          required: ['title', 'agentId', 'instruction'],
        },
      },
    },
    required: ['items'],
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return { content: [{ type: 'text', text: 'plan_tasks intercepted by server dispatch loop.' }] };
  }
}

export class GetPlanStatusTool implements BuiltInTool {
  name = 'get_plan_status';
  description = '查询本会话任务计划的执行状态（每项：pending/running/done/failed/skipped、已尝试次数、产出工件）。全部完成或失败唤醒回报后，可用它核对细节。';
  inputSchema = {
    type: 'object',
    properties: {
      planId: { type: 'string', description: '可选：指定计划 id。缺省返回本会话最近一份计划。' },
    },
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return { content: [{ type: 'text', text: 'get_plan_status intercepted by server dispatch loop.' }] };
  }
}

export class ReassignTaskTool implements BuiltInTool {
  name = 'reassign_task';
  description = '重新分配一个失败的计划任务：换执行者（agentId）、改指令（instruction）或调步数预算后重派。收到「任务失败」通知后用它；同任务重试 2 次耗尽才会通知你，所以收到通知时不要只让它原样重试 —— 换执行者、改写更明确的指令、或放宽/收紧 maxSteps。';
  inputSchema = {
    type: 'object',
    properties: {
      itemId: { type: 'string', description: '要重派的任务（计划项）id 或短 id（如 t2）。失败通知里会带上。' },
      agentId: { type: 'string', description: '可选：换一个执行者子智能体。' },
      instruction: { type: 'string', description: '可选：改写任务指令（建议写明上次失败原因的规避方式）。' },
      maxSteps: { type: 'number', description: '可选：调整步数预算。' },
      platformId: { type: 'string', description: '可选：换模型平台。' },
      modelId: { type: 'string', description: '可选：换模型。' },
    },
    required: ['itemId'],
  };

  async execute(_args: Record<string, unknown>): Promise<McpCallResult> {
    return { content: [{ type: 'text', text: 'reassign_task intercepted by server dispatch loop.' }] };
  }
}
