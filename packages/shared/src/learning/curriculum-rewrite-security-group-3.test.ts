import { describe, expect, it } from 'vitest';
import { getLearningV2CoursePlan } from './v2.js';

const COURSES = {
  '多语言安全编码': ['输入验证', '输出编码', '内存安全', '反序列化', '密钥管理', '依赖', '静态分析', '模糊测试'],
  '攻击防御与蓝队运营': ['遥测', '检测规则', '分诊', 'MITRE ATT&CK', '隔离', '根除', '恢复', '复盘'],
  'AI 与 LLM 安全': ['提示注入', '工具权限', '数据泄露', '检索污染', '模型输出', '评测', '人工审批', '回退'],
  '安全开发与 DevSecOps': ['威胁建模', 'SAST', '密钥扫描', 'SBOM', '依赖', '策略即代码', '签名制品', '发布门禁'],
} as const;

const REQUIRED = {
  '多语言安全编码': 'https://owasp.org/www-project-application-security-verification-standard/',
  '攻击防御与蓝队运营': 'https://attack.mitre.org/',
  'AI 与 LLM 安全': 'https://genai.owasp.org/llm-top-10/',
  '安全开发与 DevSecOps': 'https://csrc.nist.gov/pubs/sp/800/218/final',
} as const;
const urls = (v: string) => [...v.matchAll(/https?:\/\/[^\s；。]+/g)].map((m) => m[0].replace(/[),，。；]+$/, ''));
const specific = (v: string) => urls(v).some((u) => new URL(u).pathname.length > 1);

describe('Learning V2 网络安全第三组重写验收', () => {
  for (const [name, concepts] of Object.entries(COURSES)) {
    it(`${name} is a reproducible defensive security lesson`, () => {
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
      expect(text).toMatch(/检测|验证|审计/);
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
