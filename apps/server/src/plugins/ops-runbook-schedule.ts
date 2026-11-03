import { isReadonly } from './ops-shell-guard.js';
import {
  renderRunbook,
  resolveRunbookParams,
  type OpsRunbook,
} from './ops-runbook.js';

export interface UnattendedRunbookPreparation {
  runbook?: OpsRunbook;
  inputParams?: Record<string, string>;
  error?: string;
}

/**
 * Scheduled runs have no human at the keyboard. Production connections therefore
 * only accept read-only definitions with no rollback side effects.
 */
export function prepareUnattendedRunbook(
  runbook: OpsRunbook,
  production: boolean,
  rawInputs: Record<string, unknown> = {},
): UnattendedRunbookPreparation {
  const resolved = resolveRunbookParams(runbook, rawInputs);
  if (resolved.error) return { error: resolved.error };
  let rendered: OpsRunbook;
  try {
    rendered = renderRunbook(runbook, resolved.params!);
  } catch (error) {
    return { error: (error as Error).message };
  }
  if (!production) return { runbook: rendered, inputParams: resolved.params! };
  if (rendered.rollbackSteps.length > 0) {
    return { error: '生产连接的定时 Runbook 不允许配置回滚步骤，请改为人工运行' };
  }
  const writeStep = rendered.steps.find(
    (step) => step.type === 'exec' && !isReadonly(step.command),
  );
  if (writeStep) {
    return {
      error: `生产连接的定时 Runbook 只允许只读命令；步骤「${writeStep.name}」不是只读操作`,
    };
  }
  return { runbook: rendered, inputParams: resolved.params! };
}
