import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan, getLearningV2Subject } from './v2.js';

const COURSE_CONCEPTS = {
  安全基础与威胁建模: ['资产', '威胁', '脆弱性', '信任边界', 'STRIDE', '风险', '授权', '证据'],
  '密码学与 PKI': ['机密性', '完整性', '对称加密', '非对称加密', '哈希', '数字签名', '证书', 'PKI', '密钥轮换'],
  'Web 漏洞与攻击防御': ['注入', 'XSS', 'CSRF', 'SSRF', '访问控制', '输入验证', 'CSP', '防御验证'],
  身份与访问管理: ['身份', '认证', '授权', 'MFA', '会话', 'OAuth', 'OIDC', 'RBAC', 'ABAC', '最小权限'],
} as const;

const REQUIRED_SOURCE = {
  安全基础与威胁建模: 'https://www.nist.gov/cyberframework',
  '密码学与 PKI': 'https://www.rfc-editor.org/rfc/rfc8446.html',
  'Web 漏洞与攻击防御': 'https://owasp.org/www-project-top-ten/',
  身份与访问管理: 'https://pages.nist.gov/800-63-4/',
} as const;

function urls(value: string): string[] {
  return [...value.matchAll(/https?:\/\/[^\s；。]+/g)].map((m) => m[0].replace(/[),，。；]+$/, ''));
}
const specific = (value: string) => urls(value).some((u) => new URL(u).pathname.length > 1);

describe('Learning V2 网络安全第一组重写验收', () => {
  const track = getLearningV2Subject('security')?.tracks.find((item) => item.name === '网络安全');

  it('keeps the twelve-route order while the first four are reviewed', () => {
    expect(track?.courses.slice(0, 4).map((course) => course.name)).toEqual(Object.keys(COURSE_CONCEPTS));
    expect(track?.courses).toHaveLength(12);
  });

  for (const [courseName, concepts] of Object.entries(COURSE_CONCEPTS)) {
    it(`${courseName} is an authorized five-step security case`, () => {
      const plan = getLearningV2CoursePlan('security', courseName);
      const text = plan.steps.map((step) => step.body).join('\n');
      expect(plan.reviewStatus).toBe('reviewed');
      expect(plan.steps).toHaveLength(5);
      expect(plan.steps.map((step) => step.title)).toEqual([
        expect.stringMatching(/^情境与诊断｜/),
        expect.stringMatching(/^材料与概念｜/),
        expect.stringMatching(/^示范与推导｜/),
        expect.stringMatching(/^引导练习｜/),
        expect.stringMatching(/^独立迁移与评价｜/),
      ]);
      for (const step of plan.steps) {
        expect(step.body.trim().length, step.title).toBeGreaterThanOrEqual(140);
        expect(step.body.trim().length, step.title).toBeLessThanOrEqual(650);
        expect(step.objective?.trim().length, step.title).toBeGreaterThanOrEqual(20);
        expect(step.practice?.trim().length, step.title).toBeGreaterThanOrEqual(28);
        expect(step.checkpoint?.trim().length, step.title).toBeGreaterThanOrEqual(28);
        expect(step.body).not.toMatch(/本页|本步将|学习流程|写作意图/);
      }
      for (const concept of concepts) expect(`${text}\n${plan.quiz.map((q) => q.prompt).join('\n')}`).toContain(concept);
      expect(text).toContain('授权');
      expect(text).toContain('证据');
      expect(text).toMatch(/防御|检测|修复/);
      expect(text).toContain('前测');
      expect(text).toContain('后测');
      expect(text).toContain('反例');
      expect(text).toContain('变式');
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
    });

    it(`${courseName} has sources, balanced quiz, and study points`, () => {
      const plan = getLearningV2CoursePlan('security', courseName);
      expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
      expect(plan.sourceRefs.filter(specific).length).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.join('\n')).toContain(REQUIRED_SOURCE[courseName as keyof typeof REQUIRED_SOURCE]);
      expect(plan.quiz).toHaveLength(4);
      expect(new Set(plan.quiz.map((q) => q.answer)).size).toBe(4);
      expect(new Set(plan.quiz.map((q) => q.focus)).size).toBe(4);
      for (const q of plan.quiz) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.explanation.length).toBeGreaterThanOrEqual(50);
      }
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(3);
      expect(plan.studyPoints?.some((point) => point.label === '必背')).toBe(true);
    });
  }
});
