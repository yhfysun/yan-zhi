import type { AutomationScriptRecord } from '@yan-zhi/shared';
import { getToolRegistry, runAutomationScript } from '@yan-zhi/core';
import { callBrowserBridgeRaw } from '../browser-bridge.js';
import {
  appendAutomationRunEvent,
  createAutomationRunRecord,
  getAutomationRun,
  getAutomationScript,
  updateAutomationRun,
} from './automation.js';
import { BrowserAutomationAdapter } from './automation-browser-adapter.js';
import { CompositeAutomationAdapter } from './automation-composite-adapter.js';
import { DesktopAutomationAdapter } from './automation-desktop-adapter.js';
import { FileAutomationAdapter } from './automation-file-adapter.js';
import { createLogger } from './logger.js';

const logger = createLogger('automation-runner');
const active = new Map<string, AbortController>();

export interface StartAutomationRunInput {
  userId: string;
  scriptId: string;
  conversationId?: string;
  triggerType?: string;
  input?: Record<string, unknown>;
  version?: number;
  allowDraft?: boolean;
}

export function resolveRunnableAutomationVersion(
  script: AutomationScriptRecord,
  allowDraft = false,
): number | null {
  if (script.publishedVersion) return script.publishedVersion;
  return allowDraft ? script.version : null;
}

export function startAutomationRun(input: StartAutomationRunInput) {
  const script = getAutomationScript(input.userId, input.scriptId);
  if (!script) throw new Error('自动化脚本不存在');
  let version: number | null;
  if (input.allowDraft) {
    version = input.version || script.version;
  } else {
    if (!script.publishedVersion) {
      throw new Error('脚本尚未发布。请先发布正式版本，或使用试运行。');
    }
    if (input.version && input.version !== script.publishedVersion) {
      throw new Error(`正式运行只能使用已发布版本 v${script.publishedVersion}，不能运行草稿 v${input.version}`);
    }
    version = script.publishedVersion;
  }
  if (!version) throw new Error('自动化脚本版本不存在');
  const snapshot = getAutomationScript(input.userId, input.scriptId, { version });
  if (!snapshot) throw new Error('自动化脚本版本不存在');
  const run = createAutomationRunRecord({
    userId: input.userId,
    scriptId: input.scriptId,
    scriptVersion: version,
    conversationId: input.conversationId,
    triggerType: input.triggerType || 'manual',
    input: input.input || {},
  });
  const controller = new AbortController();
  active.set(run.id, controller);
  appendAutomationRunEvent(run.id, 'run.started', {
    scriptId: input.scriptId,
    version,
    triggerType: input.triggerType || 'manual',
  });

  void executeRun({
    userId: input.userId,
    runId: run.id,
    conversationId: input.conversationId || `automation_${run.id}`,
    script: snapshot,
    input: input.input || {},
    signal: controller.signal,
  });

  return run;
}

async function executeRun(args: {
  userId: string;
  runId: string;
  conversationId: string;
  script: AutomationScriptRecord;
  input: Record<string, unknown>;
  signal: AbortSignal;
}): Promise<void> {
  const startedAt = Date.now();
  updateAutomationRun(args.userId, args.runId, { status: 'running', startedAt });

  const registry = getToolRegistry();
  const adapter = new CompositeAutomationAdapter({
    browser: new BrowserAutomationAdapter({
      call: (toolName, toolArgs, timeoutMs) =>
        callBrowserBridgeRaw(
          args.conversationId,
          toolName,
          toolArgs,
          timeoutMs,
          `automation:${args.runId}`,
          args.userId,
        ),
    }),
    desktop: new DesktopAutomationAdapter({
      execute: (name, toolArgs) =>
        registry.execute(`plugin_computer-use__${name}`, toolArgs, {
          userId: args.userId,
          conversationId: args.conversationId,
          taskId: args.runId,
        }),
    }),
    file: new FileAutomationAdapter(),
  });

  try {
    const result = await runAutomationScript(args.script, args.input, {
      runId: args.runId,
      userId: args.userId,
      conversationId: args.conversationId,
      adapter,
      signal: args.signal,
      onStep(event) {
        appendAutomationRunEvent(args.runId, `step.${event.type}`, event);
      },
    });
    updateAutomationRun(args.userId, args.runId, {
      status: result.status,
      steps: result.steps,
      result: { variables: result.variables },
      error: result.error || null,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
    });
    appendAutomationRunEvent(args.runId, `run.${result.status}`, {
      error: result.error || null,
      failedStepId: result.failedStepId || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[automation] run=${args.runId} 执行异常: ${message}`);
    updateAutomationRun(args.userId, args.runId, {
      status: 'failed',
      error: message,
      finishedAt: Date.now(),
    });
    appendAutomationRunEvent(args.runId, 'run.failed', { error: message });
  } finally {
    active.delete(args.runId);
  }
}

export function cancelAutomationRun(userId: string, runId: string): boolean {
  const record = getAutomationRun(userId, runId);
  if (!record || !['queued', 'running', 'paused'].includes(record.status)) return false;
  const controller = active.get(runId);
  if (!controller) return false;
  controller.abort();
  appendAutomationRunEvent(runId, 'run.cancel_requested', {});
  return true;
}
