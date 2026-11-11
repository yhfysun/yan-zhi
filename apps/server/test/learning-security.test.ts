import { describe, expect, it } from 'vitest';
import { SECURITY_PATHS } from '../src/learning/security-curriculum';

describe('网络安全分支路线', () => {
  it('覆盖基础、Web 攻防、授权渗透、自动化靶场、防御和 DevSecOps', () => {
    expect(SECURITY_PATHS.map((path) => path.id)).toEqual([
      'sec_fundamentals', 'sec_web', 'sec_pentest', 'sec_automation', 'sec_languages', 'sec_defense', 'sec_devsecops',
    ]);
    expect(new Set(SECURITY_PATHS.map((path) => path.id)).size).toBe(SECURITY_PATHS.length);
  });

  it('分支依赖与后继路线都指向真实路线，不出现悬空节点', () => {
    const ids = new Set(SECURITY_PATHS.map((path) => path.id));
    for (const path of SECURITY_PATHS) {
      for (const id of [...path.prerequisites, ...path.nextPathIds]) expect(ids.has(id), `${path.id}:${id}`).toBe(true);
      expect(path.modules.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('每模块都有风险、防御和知识点；示例代码必须有错误/正确对照', () => {
    for (const path of SECURITY_PATHS) {
      for (const mod of path.modules) {
        expect(mod.useCase?.length, `${mod.id} useCase`).toBeGreaterThan(15);
        expect(mod.explanation?.length, `${mod.id} explanation`).toBeGreaterThan(30);
        expect(mod.topics.length, mod.id).toBeGreaterThanOrEqual(3);
        expect(mod.risk.length, mod.id).toBeGreaterThan(10);
        expect(mod.control.length, mod.id).toBeGreaterThan(10);
        expect(mod.code, `${mod.id} code`).toBeTruthy();
        expect(mod.code!.bad, mod.id).not.toBe(mod.code!.good);
        expect(mod.code!.note.length, mod.id).toBeGreaterThan(6);
        expect(mod.code!.application?.length, `${mod.id} application`).toBeGreaterThan(3);
        expect(mod.code!.exampleKind?.length, `${mod.id} exampleKind`).toBeGreaterThan(3);
      }
    }
  });

  it('整门课程每节都具备自学讲义、概念解释、推导、自测和靶场', () => {
    for (const path of SECURITY_PATHS) {
      for (const mod of path.modules) {
        expect(mod.lesson, `${mod.id} lesson`).toBeTruthy();
        expect(mod.lesson!.objectives.length, `${mod.id} objectives`).toBeGreaterThanOrEqual(3);
        expect(mod.lesson!.keyTerms.length, `${mod.id} keyTerms`).toBeGreaterThanOrEqual(3);
        expect(mod.lesson!.walkthrough.length, `${mod.id} walkthrough`).toBeGreaterThanOrEqual(4);
        expect(mod.lesson!.knowledgeChecks.length, `${mod.id} knowledgeChecks`).toBeGreaterThanOrEqual(2);
        expect(mod.lab, `${mod.id} lab`).toBeTruthy();
        expect(mod.lab!.steps.length, `${mod.id} lab steps`).toBeGreaterThanOrEqual(3);
        expect(mod.lab!.expected.length, `${mod.id} lab expected`).toBeGreaterThan(10);
      }
    }
  });

  it('渗透与自动化实验都限定在本地靶场或纸面演练', () => {
    const practicePaths = SECURITY_PATHS.filter((path) => path.id === 'sec_pentest' || path.id === 'sec_automation');
    const labs = practicePaths.flatMap((path) => path.modules.map((mod) => mod.lab).filter(Boolean));
    expect(labs.length).toBeGreaterThanOrEqual(7);
    for (const lab of labs) {
      expect(lab!.steps.length, lab!.target).toBeGreaterThanOrEqual(3);
      expect(lab!.target).toMatch(/本地|127\.0\.0\.1|纸面/);
      expect(lab!.target).not.toMatch(/^https?:\/\//);
    }
    const automationTools = practicePaths
      .find((path) => path.id === 'sec_automation')!
      .modules.flatMap((mod) => mod.lab?.tools || []);
    for (const tool of ['Docker Compose', 'OWASP ZAP', 'Nuclei', 'Playwright']) {
      expect(automationTools, tool).toContain(tool);
    }
  });

  it('多语言安全编码覆盖 C、C++、Java、Python、JavaScript、PHP、Go、Rust', () => {
    const path = SECURITY_PATHS.find((item) => item.id === 'sec_languages')!;
    const languages = new Set(path.modules.map((mod) => mod.code?.language));
    for (const language of ['c', 'cpp', 'java', 'python', 'javascript', 'php', 'go', 'rust']) {
      expect(languages.has(language), language).toBe(true);
    }
    expect(path.modules).toHaveLength(8);
  });

  it('核心编程类示例都提供八种语言切换', () => {
    const modules = SECURITY_PATHS.flatMap((path) => path.modules);
    const languageSet = ['c', 'cpp', 'java', 'python', 'javascript', 'php', 'go', 'rust'];
    for (const id of ['sec_web_sqli', 'sec_web_xss', 'sec_web_access', 'sec_web_ssrf', 'sec_fund_auth', 'sec_dev_secrets']) {
      const mod = modules.find((item) => item.id === id)!;
      const languages = (mod.code?.variants || []).map((item) => item.language);
      for (const language of languageSet) expect(languages, `${id}:${language}`).toContain(language);
    }
  });

  it('配置和命令示例标明具体归属，避免把 YAML 当成语言本身', () => {
    const modules = SECURITY_PATHS.flatMap((path) => path.modules);
    const threat = modules.find((mod) => mod.id === 'sec_fund_threat_model')!;
    expect(threat.code?.context).toContain('言智网络安全课程');
    expect(threat.code?.context).toContain('STRIDE');
    expect(threat.code?.application).toContain('文件上传服务');
    expect(threat.code?.application).toContain('浏览器 → API → 对象存储');
    expect(threat.code?.exampleKind).toContain('威胁模型记录');
    expect(threat.code?.exampleKind).toContain('Markdown');
    expect(threat.code?.exampleKind).toContain('不绑定 Nginx');
    expect(threat.code?.badLabel).toContain('不安全');
    expect(threat.code?.goodLabel).toContain('威胁模型');
    expect(threat.code?.bad).toContain('public/uploads');
    expect(threat.code?.good).toContain('越权下载');
    expect(threat.code?.good).toContain('存储型 XSS');
    expect(threat.code?.good).toContain('公开桶泄露');
    expect(threat.code?.good).toContain('上传耗尽');
    expect(threat.code?.good).toContain('文件篡改');
    expect(threat.code?.note).toContain('不是 Nginx 配置');
    expect(modules.find((mod) => mod.id === 'sec_auto_lab')?.code?.context).toContain('Docker Compose');
    expect(modules.find((mod) => mod.id === 'sec_auto_pipeline')?.code?.context).toContain('GitHub Actions');
    expect(modules.find((mod) => mod.id === 'sec_def_layer')?.code?.context).toContain('Nginx');
  });

  it('威胁建模课提供可自学的目标、推导过程、自测和可运行靶场', () => {
    const threat = SECURITY_PATHS
      .flatMap((path) => path.modules)
      .find((mod) => mod.id === 'sec_fund_threat_model')!;

    expect(threat.lesson?.objectives.length).toBeGreaterThanOrEqual(4);
    expect(threat.lesson?.keyTerms.length).toBeGreaterThanOrEqual(5);
    expect(threat.lesson?.walkthrough.length).toBeGreaterThanOrEqual(6);
    expect(threat.lesson?.knowledgeChecks.length).toBeGreaterThanOrEqual(4);
    expect(threat.lab?.steps.length).toBeGreaterThanOrEqual(6);
    expect(threat.lab?.commands?.length).toBeGreaterThanOrEqual(4);
    expect(threat.lab?.commands?.join('\n')).toContain('security-upload-lab.cjs --insecure');
    expect(threat.lab?.expected).toContain('404');
    expect(threat.lab?.expected).toContain('403');
    expect(threat.lab?.expected).toContain('415');
  });
});
