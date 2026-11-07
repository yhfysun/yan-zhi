import { describe, expect, it } from 'vitest';
import {
  normalizeImGoalRules,
  resolveImGoalRoute,
} from '../src/services/im-goal-routing.js';

describe('IM goal routing rules', () => {
  const config = {
    goalTemplateId: 'goaltpl_default',
    goalRules: [
      {
        id: 'rule_publish',
        name: '发布任务',
        keywords: ['发布', '上线'],
        templateId: 'goaltpl_publish',
      },
      {
        id: 'rule_report',
        name: '报表任务',
        keywords: ['周报', '月报'],
        templateId: 'goaltpl_report',
      },
    ],
  };

  it('explicit commands take precedence over connector rules', () => {
    expect(resolveImGoalRoute('/goal 发布新版本', config)).toEqual({
      source: 'command',
      objective: '发布新版本',
      templateId: 'goaltpl_default',
    });
  });

  it('routes by ordered keyword rules and applies the matched template', () => {
    expect(resolveImGoalRoute('请生成本周周报', config)).toEqual({
      source: 'rule',
      objective: '请生成本周周报',
      templateId: 'goaltpl_report',
      ruleId: 'rule_report',
      ruleName: '报表任务',
    });
  });

  it('returns no goal route for unmatched ordinary chat', () => {
    expect(resolveImGoalRoute('今天天气怎么样', config)).toBeNull();
  });

  it('normalizes hostile rule payloads to bounded safe values', () => {
    const rules = normalizeImGoalRules([
      {
        id: 'x'.repeat(200),
        name: 'n'.repeat(200),
        keywords: Array.from({ length: 50 }, (_, i) => ` k${i} `),
        templateId: ` ${'t'.repeat(200)} `,
      },
      null,
      { keywords: [], templateId: '' },
    ]);
    expect(rules).toHaveLength(1);
    expect(rules[0].id.length).toBeLessThanOrEqual(80);
    expect(rules[0].name.length).toBeLessThanOrEqual(80);
    expect(rules[0].templateId.length).toBeLessThanOrEqual(120);
    expect(rules[0].keywords).toHaveLength(20);
    expect(rules[0].keywords[0]).toBe('k0');
  });
});
