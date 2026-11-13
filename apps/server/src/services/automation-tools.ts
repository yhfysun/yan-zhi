import { getToolRegistry, type BuiltInTool, type ToolContext } from '@yan-zhi/core';
import { validateAutomationScriptDraft } from '@yan-zhi/shared';
import {
  createAutomationScript,
  getAutomationRun,
  getAutomationScript,
  listAutomationScripts,
  publishAutomationScript,
  updateAutomationScript,
} from './automation.js';
import { cancelAutomationRun, startAutomationRun } from './automation-runner.js';

export const AUTOMATION_TOOL_NAMES = [
  'rpa_script_list',
  'rpa_script_get',
  'rpa_script_create_draft',
  'rpa_script_update_draft',
  'rpa_script_validate',
  'rpa_script_publish',
  'rpa_script_test',
  'rpa_run_script',
  'rpa_get_run',
  'rpa_cancel_run',
] as const;

function result(data: unknown, isError = false) {
  return {
    content: [{
      type: 'text' as const,
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    }],
    ...(isError ? { isError: true as const } : {}),
  };
}

function userIdOf(ctx?: ToolContext): string {
  return String(ctx?.userId || 'guest');
}

function toolError(error: unknown) {
  return result(error instanceof Error ? error.message : String(error), true);
}

function buildTools(): BuiltInTool[] {
  return [
    {
      name: 'rpa_script_list',
      description: '列出当前用户可用的固定自动化脚本（名称、类型、状态、版本与最近运行）。',
      inputSchema: { type: 'object', properties: {} },
      execute: async (_args, ctx) => {
        try {
          return result(listAutomationScripts(userIdOf(ctx)));
        } catch (error) {
          return toolError(error);
        }
      },
    },
    {
      name: 'rpa_script_get',
      description: '读取一个自动化脚本的完整步骤。传 version 可读取指定历史版本。',
      inputSchema: {
        type: 'object',
        properties: {
          scriptId: { type: 'string', description: '自动化脚本 id' },
          version: { type: 'number', description: '可选历史版本号' },
        },
        required: ['scriptId'],
      },
      execute: async (args, ctx) => {
        try {
          const script = getAutomationScript(userIdOf(ctx), String(args.scriptId || ''), {
            version: args.version == null ? undefined : Number(args.version),
          });
          return script ? result(script) : result('自动化脚本不存在', true);
        } catch (error) {
          return toolError(error);
        }
      },
    },
    {
      name: 'rpa_script_create_draft',
      description: '创建一个自动化脚本草稿。只接受结构化 script 对象，不执行、不发布。',
      inputSchema: {
        type: 'object',
        properties: {
          script: { type: 'object', description: 'AutomationScriptDraft 结构' },
        },
        required: ['script'],
      },
      execute: async (args, ctx) => {
        try {
          return result(createAutomationScript(userIdOf(ctx), args.script));
        } catch (error) {
          return toolError(error);
        }
      },
    },
    {
      name: 'rpa_script_update_draft',
      description: '更新自动化脚本并生成新的草稿版本。已发布版本不会被覆盖。',
      inputSchema: {
        type: 'object',
        properties: {
          scriptId: { type: 'string', description: '自动化脚本 id' },
          script: { type: 'object', description: '完整的 AutomationScriptDraft 结构' },
        },
        required: ['scriptId', 'script'],
      },
      execute: async (args, ctx) => {
        try {
          return result(updateAutomationScript(userIdOf(ctx), String(args.scriptId || ''), args.script));
        } catch (error) {
          return toolError(error);
        }
      },
    },
    {
      name: 'rpa_script_validate',
      description: '校验自动化脚本结构、步骤类型、URL、定位方式和敏感参数声明，不写入数据库。',
      inputSchema: {
        type: 'object',
        properties: {
          script: { type: 'object', description: '待校验的脚本对象' },
        },
        required: ['script'],
      },
      execute: async (args) => result(validateAutomationScriptDraft(args.script)),
    },
    {
      name: 'rpa_script_publish',
      description: '发布当前自动化脚本版本。必须由用户确认后传 confirmed:true，模型不能静默发布。',
      inputSchema: {
        type: 'object',
        properties: {
          scriptId: { type: 'string', description: '自动化脚本 id' },
          confirmed: { type: 'boolean', description: '用户已确认发布时传 true' },
        },
        required: ['scriptId', 'confirmed'],
      },
      execute: async (args, ctx) => {
        if (args.confirmed !== true) {
          return result('发布需要用户明确确认；请先调用 confirm_user，得到同意后再传 confirmed:true。', true);
        }
        try {
          return result(publishAutomationScript(userIdOf(ctx), String(args.scriptId || '')));
        } catch (error) {
          return toolError(error);
        }
      },
    },
    {
      name: 'rpa_script_test',
      description: '试运行自动化脚本当前草稿或指定版本。试运行不等于发布。',
      inputSchema: {
        type: 'object',
        properties: {
          scriptId: { type: 'string', description: '自动化脚本 id' },
          version: { type: 'number', description: '可选版本号' },
          input: { type: 'object', description: '运行参数' },
        },
        required: ['scriptId'],
      },
      execute: async (args, ctx) => {
        try {
          const input = args.input && typeof args.input === 'object' && !Array.isArray(args.input)
            ? args.input as Record<string, unknown>
            : {};
          return result(startAutomationRun({
            userId: userIdOf(ctx),
            scriptId: String(args.scriptId || ''),
            conversationId: ctx?.conversationId,
            triggerType: 'test',
            input,
            version: args.version == null ? undefined : Number(args.version),
            allowDraft: true,
          }));
        } catch (error) {
          return toolError(error);
        }
      },
    },
    {
      name: 'rpa_run_script',
      description: '运行一个已发布的自动化脚本。只接受 scriptId 与参数，不接受任意步骤或代码。',
      inputSchema: {
        type: 'object',
        properties: {
          scriptId: { type: 'string', description: '自动化脚本 id' },
          input: { type: 'object', description: '运行参数' },
          triggerType: { type: 'string', description: 'manual / scheduled / chat 等来源' },
        },
        required: ['scriptId'],
      },
      execute: async (args, ctx) => {
        try {
          const input = args.input && typeof args.input === 'object' && !Array.isArray(args.input)
            ? args.input as Record<string, unknown>
            : {};
          return result(startAutomationRun({
            userId: userIdOf(ctx),
            scriptId: String(args.scriptId || ''),
            conversationId: ctx?.conversationId,
            triggerType: String(args.triggerType || 'chat'),
            input,
            allowDraft: false,
          }));
        } catch (error) {
          return toolError(error);
        }
      },
    },
    {
      name: 'rpa_get_run',
      description: '读取一次自动化运行的状态、步骤结果和错误。',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: '运行 id' },
        },
        required: ['runId'],
      },
      execute: async (args, ctx) => {
        try {
          const run = getAutomationRun(userIdOf(ctx), String(args.runId || ''));
          return run ? result(run) : result('自动化运行不存在', true);
        } catch (error) {
          return toolError(error);
        }
      },
    },
    {
      name: 'rpa_cancel_run',
      description: '请求取消正在运行的自动化脚本；在步骤边界停止。',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: '运行 id' },
        },
        required: ['runId'],
      },
      execute: async (args, ctx) => {
        try {
          const ok = cancelAutomationRun(userIdOf(ctx), String(args.runId || ''));
          return ok ? result({ runId: args.runId, status: 'cancelling' }) : result('运行已结束或无法取消', true);
        } catch (error) {
          return toolError(error);
        }
      },
    },
  ];
}

export function registerAutomationTools(): string[] {
  const registry = getToolRegistry();
  for (const name of AUTOMATION_TOOL_NAMES) {
    if (registry.has(name)) registry.unregister(name);
  }
  const registered: string[] = [];
  for (const tool of buildTools()) {
    registry.register(tool);
    registered.push(tool.name);
  }
  return registered;
}
