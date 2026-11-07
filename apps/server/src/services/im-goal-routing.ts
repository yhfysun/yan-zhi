import { parseImGoalCommand } from './im-goal.js';

export interface ImGoalRule {
  id: string;
  name: string;
  keywords: string[];
  templateId: string;
}

export interface ImGoalRoute {
  source: 'command' | 'rule';
  objective: string;
  templateId: string | null;
  ruleId?: string;
  ruleName?: string;
}

function cleanText(value: unknown, max: number): string {
  return String(value || '').trim().slice(0, max);
}

export function normalizeImGoalRules(value: unknown): ImGoalRule[] {
  if (!Array.isArray(value)) return [];
  const out: ImGoalRule[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length && out.length < 20; index++) {
    const raw = value[index];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    const templateId = cleanText(candidate.templateId, 120);
    const keywords = Array.from(new Set(
      (Array.isArray(candidate.keywords) ? candidate.keywords : [])
        .map((keyword) => cleanText(keyword, 80).toLowerCase())
        .filter(Boolean),
    )).slice(0, 20);
    if (!templateId || keywords.length === 0) continue;
    const fallbackId = `rule_${index + 1}`;
    const id = cleanText(candidate.id, 80) || fallbackId;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: cleanText(candidate.name, 80) || `规则 ${index + 1}`,
      keywords,
      templateId,
    });
  }
  return out;
}

export function resolveImGoalRoute(
  text: string,
  config: { goalTemplateId?: unknown; goalRules?: unknown } | null | undefined,
): ImGoalRoute | null {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const defaultTemplateId = cleanText(config?.goalTemplateId, 120) || null;
  const commandObjective = parseImGoalCommand(raw);
  if (commandObjective) {
    return {
      source: 'command',
      objective: commandObjective,
      templateId: defaultTemplateId,
    };
  }

  const lower = raw.toLowerCase();
  const matched = normalizeImGoalRules(config?.goalRules).find((rule) => (
    rule.keywords.some((keyword) => lower.includes(keyword))
  ));
  if (!matched) return null;
  return {
    source: 'rule',
    objective: raw.slice(0, 20_000),
    templateId: matched.templateId,
    ruleId: matched.id,
    ruleName: matched.name,
  };
}
