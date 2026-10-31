// 合规映射（P4 收尾，方案 6.4）。
//
// ★ 新规则不补映射时不能"静默过"：内置源码规则必须逐条登记，否则这条测试先红。
// ★ 映射是启发式对照，测试只钉方向（凭据→保密性/A02、注入→入侵防范/A03 等）与聚合口径。
import { describe, it, expect } from 'vitest';
import { BUILTIN_SAST_RULES } from '../src/plugins/sec-lab-tools/scan/source/rules';
import { complianceReport, mapCompliance } from '../src/plugins/sec-lab-tools/scan/compliance';

describe('合规映射表', () => {
  it('内置源码规则全部登记，且每条同时覆盖等保与 OWASP', () => {
    for (const r of BUILTIN_SAST_RULES) {
      const refs = mapCompliance(r.id);
      expect(refs.length, `${r.id} 未登记合规映射`).toBeGreaterThan(0);
      expect(refs.some((x) => x.standard === 'dengbao'), `${r.id} 缺等保映射`).toBe(true);
      expect(refs.some((x) => x.standard === 'owasp'), `${r.id} 缺 OWASP 映射`).toBe(true);
    }
  });

  it('关键规则的映射方向正确', () => {
    expect(mapCompliance('hardcoded-secret').map((x) => x.id)).toEqual(['8.1.4.8', 'A02:2021']);
    expect(mapCompliance('eval').map((x) => x.id)).toEqual(['8.1.4.4', 'A03:2021']);
    expect(mapCompliance('default-credential').map((x) => x.id)).toEqual(['8.1.4.1', 'A07:2021']);
    expect(mapCompliance('vulnerable-dependency').map((x) => x.id)).toContain('A06:2021');
    expect(mapCompliance('apk-unsigned').map((x) => x.id)).toContain('A08:2021');
    expect(mapCompliance('self-runtime-cors-credentials').map((x) => x.id)).toEqual(['8.1.4.2', 'A01:2021']);
  });

  it('安装包资源命中按 -asset 后缀回到主规则', () => {
    expect(mapCompliance('apk-cloud-credential-asset')).toEqual(mapCompliance('apk-cloud-credential'));
  });

  it('未知规则不臆造映射（报告会把它列为未映射）', () => {
    expect(mapCompliance('some-new-rule')).toEqual([]);
    expect(mapCompliance('')).toEqual([]);
  });
});

describe('合规汇总', () => {
  it('按标准/控制项聚合，统计条数并列出未映射规则', () => {
    const { rows, unmapped } = complianceReport([
      { ruleId: 'eval' },
      { ruleId: 'sql-concat' },
      { ruleId: 'hardcoded-secret' },
      { ruleId: 'mystery-rule' },
    ]);
    const a03 = rows.find((r) => r.controlId === 'A03:2021')!;
    expect(a03.ruleIds).toEqual(['eval', 'sql-concat']);
    expect(a03.count).toBe(2);
    expect(rows.find((r) => r.controlId === '8.1.4.4')!.count).toBe(2);
    expect(rows[0].standard).toBe('dengbao');
    expect(unmapped).toEqual(['mystery-rule']);
  });
});
