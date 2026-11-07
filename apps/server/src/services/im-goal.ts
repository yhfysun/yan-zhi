import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { createGoal, getGoal } from './goal-store.js';
import { findGoalTrigger, saveGoalTrigger } from './goal-trigger.js';
import { getGoalTemplate } from './goal-template.js';
import { runGoalOnce } from './goal-runner.js';

export type ImGoalResult =
  | { ok: true; goalId: string; conversationId: string; objective: string }
  | { ok: false; reason: string };

export interface ImGoalInput {
  userId: string;
  connectorId?: string | null;
  provider: string;
  externalId: string;
  fromUser: string;
  objective: string;
  platformId: string;
  modelId: string;
  goalTemplateId?: string | null;
  routeSource?: 'command' | 'rule';
  ruleId?: string | null;
  ruleName?: string | null;
  replyTo?: string | null;
  receiveIdType?: string | null;
}

export function parseImGoalCommand(text: string): string | null {
  const raw = String(text || '').trim();
  const match = /^(?:\/goal|goal:|目标[:：])\s*([\s\S]+)$/i.exec(raw);
  const objective = match?.[1]?.trim() || '';
  return objective ? objective.slice(0, 20_000) : null;
}

function connectorGoalTemplateId(connectorId: string | null | undefined, userId: string): string | null {
  if (!connectorId) return null;
  const row = db.prepare(
    'SELECT config_json FROM im_connector WHERE id = ? AND user_id = ?',
  ).get(connectorId, userId) as { config_json?: string | null } | undefined;
  if (!row?.config_json) return null;
  try {
    const config = JSON.parse(row.config_json);
    return config?.goalTemplateId ? String(config.goalTemplateId) : null;
  } catch {
    return null;
  }
}

function existingGoalResult(userId: string, provider: string, eventId: string): ImGoalResult | null {
  const trigger = findGoalTrigger(userId, `im:${provider}`, eventId);
  if (!trigger) return null;
  const goal = getGoal(trigger.goalId);
  if (!goal) return { ok: false, reason: 'goal_trigger_missing' };
  return {
    ok: true,
    goalId: goal.id,
    conversationId: goal.conversationId,
    objective: goal.objective,
  };
}

export function createImGoalFromMessage(
  input: ImGoalInput,
  options: { wake?: boolean } = {},
): ImGoalResult {
  const objective = String(input.objective || '').trim().slice(0, 20_000);
  if (!input.userId || !input.externalId || !objective || !input.platformId || !input.modelId) {
    return { ok: false, reason: 'invalid_goal_input' };
  }
  const source = `im:${input.provider}`;
  const eventId = `${input.connectorId || input.provider}:${input.externalId}`;
  const existing = existingGoalResult(input.userId, input.provider, eventId);
  if (existing) return existing;

  const templateId = input.goalTemplateId || connectorGoalTemplateId(input.connectorId, input.userId);
  const template = templateId ? getGoalTemplate(String(templateId)) : null;
  if (templateId && (!template || template.userId !== input.userId)) {
    return { ok: false, reason: 'goal_template_missing' };
  }

  let created: { goalId: string; conversationId: string } | null = null;
  const transaction = db.transaction(() => {
    const duplicate = existingGoalResult(input.userId, input.provider, eventId);
    if (duplicate?.ok) {
      created = { goalId: duplicate.goalId, conversationId: duplicate.conversationId };
      return;
    }

    const now = Date.now();
    const conversationId = `conv_${randomUUID()}`;
    const title = objective.length > 24 ? `${objective.slice(0, 24)}…` : objective;
    db.prepare(`
      INSERT INTO conversation (
        id, user_id, title, agent_id, platform_id, model_id, space_id,
        mcp_servers_json, skill_ids_json, pinned, created_at, updated_at
      ) VALUES (?, ?, ?, 'a_default_assistant', ?, ?, NULL, '[]', '[]', 0, ?, ?)
    `).run(
      conversationId,
      input.userId,
      title,
      input.platformId,
      input.modelId,
      now,
      now,
    );
    if (input.connectorId) {
      db.prepare(`
        INSERT INTO im_conversation_map (connector_id, external_user, conversation_id, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(connector_id, external_user)
        DO UPDATE SET conversation_id = excluded.conversation_id, created_at = excluded.created_at
      `).run(input.connectorId, input.fromUser, conversationId, now);
    }

    const goal = createGoal({
      userId: input.userId,
      conversationId,
      agentId: 'a_default_assistant',
      platformId: input.platformId,
      modelId: input.modelId,
      objective,
      criteria: template?.criteria || [],
      constraints: template?.constraints || [],
      approvalRequired: template?.approvalRequired || [],
      maxBatches: template?.maxBatches,
      maxStallBatches: template?.maxStallBatches,
      costLimitCny: template?.costLimitCny,
    });
    saveGoalTrigger({
      userId: input.userId,
      source,
      eventId,
      goalId: goal.id,
      payload: {
        provider: input.provider,
        connectorId: input.connectorId || null,
        externalId: input.externalId,
        fromUser: input.fromUser,
        goalTemplateId: template?.id || null,
        routeSource: input.routeSource || 'command',
        ruleId: input.ruleId || null,
        ruleName: input.ruleName || null,
        replyTo: input.replyTo || input.fromUser,
        receiveIdType: input.receiveIdType || null,
      },
    });
    created = { goalId: goal.id, conversationId };
  });

  try {
    transaction();
  } catch (error: any) {
    const duplicate = existingGoalResult(input.userId, input.provider, eventId);
    if (duplicate) return duplicate;
    return { ok: false, reason: String(error?.message || error).slice(0, 500) };
  }

  const finalCreated = created as { goalId: string; conversationId: string } | null;
  if (!finalCreated) return { ok: false, reason: 'goal_not_created' };
  if (options.wake !== false) {
    queueMicrotask(() => { void runGoalOnce(finalCreated.goalId).catch(() => {}); });
  }
  return { ok: true, ...finalCreated, objective };
}
