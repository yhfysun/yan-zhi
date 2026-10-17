// sec-lab P4 的纯逻辑验证（2026-10-17）。
//
// 知识库与 SAST 规则都是"内容 + 判定"的纯函数：内容写错（引用不存在的条目）
// 或规则写错（永远不命中 / 永远命中）都不会报错，只会给人错误结论。

import { describe, it, expect } from 'vitest';
import { SEC_SKILLS, WARSTORIES, CHEATSHEETS, runSkill, runWarstory, runCheatsheet } from '../src/plugins/sec-lab-tools/knowledge.js';
import { SAST_RULES, scanText } from '../src/plugins/sec-lab-tools/sast.js';

describe('知识库', () => {
  it('技能/战例/速查都有内容，名字唯一', () => {
    for (const list of [SEC_SKILLS, WARSTORIES, CHEATSHEETS]) {
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list.map((e) => e.name)).size).toBe(list.length);
      for (const e of list) {
        expect(e.desc, `${e.name} 缺说明`).toBeTruthy();
        expect(e.body.length, `${e.name} 正文太短`).toBeGreaterThan(20);
      }
    }
  });

  it('list / load 都能用；未知条目明确报错', () => {
    expect(runSkill('list', '').summary).toContain('recon');
    expect(runSkill('load', 'recon').summary).toContain('被动优先');
    expect(() => runSkill('load', 'nope')).toThrow(/没有/);
  });

  it('战例与速查支持关键词，且不传关键词时列全部', () => {
    expect(runWarstory('').summary).toContain('php-deserialization');
    expect(runWarstory('jwt').summary).toContain('alg=none');
    expect(runCheatsheet('nmap').summary).toContain('-sS');
  });
});

describe('SAST 规则', () => {
  it('规则 id 唯一，且都有修复建议', () => {
    expect(new Set(SAST_RULES.map((r) => r.id)).size).toBe(SAST_RULES.length);
    for (const r of SAST_RULES) expect(r.fix, `${r.id} 缺修复建议`).toBeTruthy();
  });

  it('★ 硬编码凭据 / SQL 拼接 / eval / innerHTML 都能命中，并带行号', () => {
    const code = [
      'const password = "SuperSecret123";',
      'const q = "SELECT * FROM users WHERE id = " + req.query.id;',
      'eval(userInput);',
      'el.innerHTML = data;',
    ].join('\n');
    const findings = scanText('src/app.ts', code);
    expect(findings.some((f) => f.title.includes('硬编码凭据'))).toBe(true);
    expect(findings.some((f) => f.title.includes('SQL'))).toBe(true);
    expect(findings.some((f) => f.title.includes('动态求值'))).toBe(true);
    expect(findings.some((f) => f.title.includes('innerHTML'))).toBe(true);
    expect(findings[0].detail).toContain('src/app.ts:1');
  });

  it('干净代码不误报', () => {
    const code = [
      'const password = process.env.DB_PASSWORD;',
      'const q = "SELECT * FROM users WHERE id = $1";',
      'el.textContent = data;',
    ].join('\n');
    expect(scanText('src/clean.ts', code)).toHaveLength(0);
  });
});
