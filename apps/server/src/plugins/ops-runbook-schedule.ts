import { isReadonly } from './ops-shell-guard.js';
import {
  renderRunbook,
  resolveRunbookParams,
  type OpsRunbook,
} from './ops-runbook.js';

export interface UnattendedRunbookPreparation {
  runbook?: OpsRunbook;
  inputParams?: Record<string, string>;
  requiresStandingApproval?: boolean;
  policyReason?: string;
  error?: string;
}

export interface UnattendedRunbookOptions {
  allowStandingApproval?: boolean;
}

export function analyzeUnattendedRunbook(runbook: OpsRunbook, production: boolean): {
  requiresStandingApproval: boolean;
  policyReason?: string;
} {
  if (!production) return { requiresStandingApproval: false };
  const reasons: string[] = [];
  if (runbook.rollbackSteps.length > 0) reasons.push('包含回滚步骤');
  const writeStep = runbook.steps.find(
    (step) => step.type === 'exec' && !isReadonly(step.command),
  );
  if (writeStep) reasons.push(`步骤「${writeStep.name}」包含写操作`);
  return {
    requiresStandingApproval: reasons.length > 0,
    policyReason: reasons.length
      ? `生产连接无人值守执行需要长期授权：${reasons.join('；')}`
      : undefined,
  };
}

/**
 * Scheduled runs have no human at the keyboard. Production connections therefore
 * only accept read-only definitions with no rollback side effects.
 */
export function prepareUnattendedRunbook(
  runbook: OpsRunbook,
  production: boolean,
  rawInputs: Record<string, unknown> = {},
  options: UnattendedRunbookOptions = {},
): UnattendedRunbookPreparation {
  const resolved = resolveRunbookParams(runbook, rawInputs);
  if (resolved.error) return { error: resolved.error };
  let rendered: OpsRunbook;
  try {
    rendered = renderRunbook(runbook, resolved.params!);
  } catch (error) {
    return { error: (error as Error).message };
  }
  const policy = analyzeUnattendedRunbook(rendered, production);
  const { requiresStandingApproval, policyReason } = policy;
  if (requiresStandingApproval && !options.allowStandingApproval) {
    return { error: policyReason };
  }
  return {
    runbook: rendered,
    inputParams: resolved.params!,
    requiresStandingApproval,
    policyReason,
  };
}
