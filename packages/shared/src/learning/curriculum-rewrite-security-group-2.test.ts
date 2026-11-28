import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan } from './v2.js';

const COURSES = {
  'API 与移动安全': ['API 清单', '对象授权', '数据暴露', '速率限制', '输入验证', 'MASVS', '安全存储', '证书绑定'],
  '云与容器安全': ['身份', '最小权限', '密钥', '镜像', '供应链', 'Kubernetes', '网络策略', '日志', '隔离'],
  '授权渗透测试': ['书面授权', '范围', '停止条件', '威胁建模', '证据', '报告', '修复复测'],
  '自动化攻防靶场': ['靶场', '基础设施即代码', '可重复', '编排', '检测', '安全停止', '指标', '重置'],
} as const;

const REQUIRED = {
  'API 与移动安全': 'https://owasp.org/API-Security/editions/2023/en/0x11-t10/',
  '云与容器安全': 'https://csrc.nist.gov/pubs/sp/800/190/final',
  '授权渗透测试': 'http://www.pentest-standard.org/index.php/Main_Page',
  '自动化攻防靶场': 'https://owasp.org/www-project-web-security-testing-guide/',
} as const;
const urls = (v: string) => [...v.matchAll(/https?:\/\/[^\s；。]+/g)].map((m) => m[0].replace(/[),，。；]+$/, ''));
const specific = (v: string) => urls(v).some((u) => new URL(u).pathname.length > 1);

describe('Learning V2 网络安全第二组重写验收', () => {
  for (const [name, concepts] of Object.entries(COURSES)) {
    it(`${name} is an authorized advanced security lesson`, () => {
      const plan = getLearningV2CoursePlan('security', name);
      const text = plan.steps.map((s) => s.body).join('\n');
      expect(plan.reviewStatus).toBe('reviewed');
      expect(plan.steps).toHaveLength(5);
      expect(plan.steps.map((s) => s.title)).toEqual([
        expect.stringMatching(/^情境与诊断｜/), expect.stringMatching(/^材料与概念｜/),
        expect.stringMatching(/^示范与推导｜/), expect.stringMatching(/^引导练习｜/),
        expect.stringMatching(/^独立迁移与评价｜/),
      ]);
      for (const step of plan.steps) {
        expect(step.body.trim().length, step.title).toBeGreaterThanOrEqual(140);
        expect(step.body.trim().length, step.title).toBeLessThanOrEqual(650);
        expect(step.objective?.trim().length, step.title).toBeGreaterThanOrEqual(20);
        expect(step.practice?.trim().length, step.title).toBeGreaterThanOrEqual(28);
        expect(step.checkpoint?.trim().length, step.title).toBeGreaterThanOrEqual(28);
      }
      for (const concept of concepts) expect(`${text}\n${plan.quiz.map((q) => q.prompt).join('\n')}`).toContain(concept);
      expect(text).toContain('授权');
      expect(text).toContain('证据');
      expect(text).toMatch(/隔离|停止|撤销/);
      expect(text).toContain('前测');
      expect(text).toContain('后测');
      expect(plan.commonErrors.length).toBeGreaterThanOrEqual(2);
      expect(plan.sourceRefs.length).toBeGreaterThanOrEqual(4);
      expect(plan.sourceRefs.filter(specific).length).toBeGreaterThanOrEqual(3);
      expect(plan.sourceRefs.join('\n')).toContain(REQUIRED[name as keyof typeof REQUIRED]);
      expect(plan.quiz).toHaveLength(4);
      expect(new Set(plan.quiz.map((q) => q.answer)).size).toBe(4);
      for (const q of plan.quiz) expect(q.explanation.length).toBeGreaterThanOrEqual(50);
      expect(plan.studyPoints?.length).toBeGreaterThanOrEqual(3);
      expect(plan.studyPoints?.some((p) => p.label === '必背')).toBe(true);
    });
  }
});
