// P2-3 测试：crew 角色预设（subagent-spec.ts，纯函数零 DB 依赖）
import { describe, it, expect } from 'vitest';
import {
  normalizeSubAgentSpec,
  CREW_ROLE_PRESETS,
  renderSpecSystemPrompt,
} from '../src/services/subagent-spec.js';

const base = { instruction: '调研三个厂商的报价并汇总成表', tools: ['web_search'] };

describe('CREW_ROLE_PRESETS（P2-3）', () => {
  it('六个预设齐全且模板非空', () => {
    for (const k of ['researcher', 'verifier', 'writer', 'reviewer', 'coder', 'analyst']) {
      expect(CREW_ROLE_PRESETS[k]).toBeTruthy();
      expect(CREW_ROLE_PRESETS[k].prompt.length).toBeGreaterThan(20);
      expect(CREW_ROLE_PRESETS[k].deliverable.length).toBeGreaterThan(5);
    }
  });

  it('指定 role → instruction 前缀注入模板 + 保留具体任务', () => {
    const r = normalizeSubAgentSpec({ ...base, role: 'researcher' }) as any;
    expect(r.error).toBeUndefined();
    expect(r.instruction).toContain('调研员');
    expect(r.instruction).toContain('调研三个厂商的报价并汇总成表');
    expect(r.role).toBe('researcher');
  });

  it('deliverable 未填时用模板默认；显式值不被覆盖', () => {
    const r1 = normalizeSubAgentSpec({ ...base, role: 'verifier' }) as any;
    expect(r1.deliverable).toBe(CREW_ROLE_PRESETS.verifier.deliverable);
    const r2 = normalizeSubAgentSpec({ ...base, role: 'verifier', deliverable: '自定义交付' }) as any;
    expect(r2.deliverable).toBe('自定义交付');
  });

  it('未知 role / 缺省 → 行为与从前一致（纯增量）', () => {
    const r1 = normalizeSubAgentSpec({ ...base, role: 'nonexistent' }) as any;
    expect(r1.role).toBeUndefined();
    expect(r1.instruction).toBe(base.instruction);
    const r2 = normalizeSubAgentSpec({ ...base }) as any;
    expect(r2.instruction).toBe(base.instruction);
  });

  it('role 模板进入渲染后的系统提示词', () => {
    const spec = normalizeSubAgentSpec({ ...base, role: 'coder' }) as any;
    const prompt = renderSpecSystemPrompt({ spec, pinnedToolIds: ['web_search'], dropped: [], maxSteps: 60 });
    expect(prompt).toContain('实现者');
    expect(prompt).toContain('自验证');
  });
});
