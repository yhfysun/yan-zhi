import type {
  AutomationScriptDraft,
  AutomationStep,
  AutomationStepResult,
} from '@yan-zhi/shared';

export interface AutomationStepExecution {
  output?: unknown;
  variables?: Record<string, unknown>;
}

export interface AutomationRunContext {
  runId: string;
  userId: string;
  conversationId?: string;
  params: Record<string, unknown>;
  variables: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AutomationStepAdapter {
  execute(step: AutomationStep, context: AutomationRunContext): Promise<AutomationStepExecution>;
}

export type AutomationStepEvent =
  | { type: 'start'; stepId: string; stepType: AutomationStep['type']; at: number }
  | {
      type: 'finish';
      stepId: string;
      stepType: AutomationStep['type'];
      at: number;
      status: AutomationStepResult['status'];
      startedAt: number;
      finishedAt: number;
      output?: unknown;
      error?: string;
    };

export interface AutomationRunResult {
  status: 'completed' | 'failed' | 'cancelled';
  steps: AutomationStepResult[];
  variables: Record<string, unknown>;
  failedStepId?: string;
  error?: string;
  startedAt: number;
  finishedAt: number;
}

export interface RunAutomationOptions {
  runId: string;
  userId: string;
  conversationId?: string;
  signal?: AbortSignal;
  adapter: AutomationStepAdapter;
  onStep?: (event: AutomationStepEvent) => void;
}

function interpolateString(value: string, params: Record<string, unknown>): string {
  return value.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_match, key: string) => {
    const raw = params[key];
    return raw == null ? '' : String(raw);
  });
}

function interpolateValue<T>(value: T, params: Record<string, unknown>): T {
  if (typeof value === 'string') return interpolateString(value, params) as T;
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, params)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolateValue(item, params)]),
    ) as T;
  }
  return value;
}

function cancelledResult(
  startedAt: number,
  steps: AutomationStepResult[],
  variables: Record<string, unknown>,
): AutomationRunResult {
  return {
    status: 'cancelled',
    steps,
    variables,
    error: '运行已取消',
    startedAt,
    finishedAt: Date.now(),
  };
}

export async function runAutomationScript(
  script: AutomationScriptDraft,
  inputParams: Record<string, unknown>,
  options: RunAutomationOptions,
): Promise<AutomationRunResult> {
  const startedAt = Date.now();
  const results: AutomationStepResult[] = [];
  const variables: Record<string, unknown> = { ...inputParams };

  for (const sourceStep of script.steps) {
    if (options.signal?.aborted) return cancelledResult(startedAt, results, variables);

    const step = interpolateValue(sourceStep, variables);
    const stepStartedAt = Date.now();
    options.onStep?.({ type: 'start', stepId: step.id, stepType: step.type, at: stepStartedAt });
    try {
      const execution = await options.adapter.execute(step, {
        runId: options.runId,
        userId: options.userId,
        conversationId: options.conversationId,
        params: variables,
        variables,
        signal: options.signal,
      });
      if (execution.variables) Object.assign(variables, execution.variables);
      const result: AutomationStepResult = {
        stepId: step.id,
        type: step.type,
        status: 'completed',
        startedAt: stepStartedAt,
        finishedAt: Date.now(),
        output: execution.output,
      };
      results.push(result);
      options.onStep?.({
        type: 'finish',
        stepId: result.stepId,
        stepType: result.type,
        at: result.finishedAt,
        status: result.status,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        output: result.output,
        error: result.error,
      });
      if (options.signal?.aborted) return cancelledResult(startedAt, results, variables);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: AutomationStepResult = {
        stepId: step.id,
        type: step.type,
        status: 'failed',
        startedAt: stepStartedAt,
        finishedAt: Date.now(),
        error: message,
      };
      results.push(result);
      options.onStep?.({
        type: 'finish',
        stepId: result.stepId,
        stepType: result.type,
        at: result.finishedAt,
        status: result.status,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        output: result.output,
        error: result.error,
      });
      if (!step.continueOnError) {
        return {
          status: 'failed',
          steps: results,
          variables,
          failedStepId: step.id,
          error: message,
          startedAt,
          finishedAt: Date.now(),
        };
      }
    }
  }

  const failed = results.find((result) => result.status === 'failed');
  return {
    status: failed ? 'failed' : 'completed',
    steps: results,
    variables,
    ...(failed
      ? { failedStepId: failed.stepId, error: failed.error || `步骤 ${failed.stepId} 失败` }
      : {}),
    startedAt,
    finishedAt: Date.now(),
  };
}
