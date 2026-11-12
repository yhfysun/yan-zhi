import { describe, expect, it } from 'vitest';
import { SECURITY_PATHS } from '../src/learning/security-curriculum';
import { COURSE_CATALOG } from '../src/learning/curriculum';

function teachingText(path: (typeof SECURITY_PATHS)[number]) {
  return [
    path.name,
    path.description,
    ...path.tags,
    ...path.modules.flatMap((mod) => [
      mod.title,
      mod.summary,
      mod.useCase || '',
      mod.explanation || '',
      ...mod.topics,
      mod.risk,
      mod.control,
      ...(mod.lesson?.objectives || []),
      ...(mod.lesson?.walkthrough.flatMap((step) => [step.title, step.detail]) || []),
      ...(mod.lesson?.knowledgeChecks.flatMap((check) => [check.question, check.answer]) || []),
    ]),
  ].join('\n');
}

function acronymsIn(text: string) {
  return new Set(text.match(/\b[A-Z][A-Z0-9]{1,}\b/g) || []);
}

describe('网络安全分支路线', () => {
  it('覆盖基础、密码学、身份、Web、API、云、攻防、防御、AI 和 DevSecOps', () => {
    expect(SECURITY_PATHS.map((path) => path.id)).toEqual([
      'sec_fundamentals',
      'sec_crypto',
      'sec_web',
      'sec_identity',
      'sec_api',
      'sec_cloud',
      'sec_pentest',
      'sec_automation',
      'sec_languages',
      'sec_defense',
      'sec_ai',
      'sec_devsecops',
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

  it('课程目录与安全路线接口保持一致，刷新后不会丢失新路线', () => {
    const catalog = COURSE_CATALOG
      .filter((course) => course.kind === 'security')
      .map((course) => ({ id: course.securityPathId, name: course.name }));
    expect(catalog).toEqual(SECURITY_PATHS.map((path) => ({ id: path.id, name: path.name })));
  });

  it('安全路线覆盖入门、进阶和高级三档，切换难度时不会出现空分组', () => {
    const counts = SECURITY_PATHS.reduce<Record<string, number>>((result, path) => {
      result[path.level] = (result[path.level] || 0) + 1;
      return result;
    }, {});
    expect(counts).toEqual({ 入门: 1, 进阶: 8, 高级: 3 });
  });

  it('每条主路线都有足够的连续训练，并覆盖网络、密码学、浏览器、API、云与供应链安全', () => {
    const modules = SECURITY_PATHS.flatMap((path) => path.modules);
    const ids = new Set(modules.map((mod) => mod.id));

    expect(modules.length).toBeGreaterThanOrEqual(67);
    for (const path of SECURITY_PATHS) expect(path.modules.length, path.id).toBeGreaterThanOrEqual(5);

    for (const id of [
      'sec_fund_http',
      'sec_fund_crypto',
      'sec_web_upload',
      'sec_web_browser',
      'sec_pentest_api',
      'sec_pentest_cloud',
      'sec_auto_api',
      'sec_auto_triage',
      'sec_def_vuln',
      'sec_def_container',
      'sec_dev_iac',
      'sec_dev_sdlc',
    ]) {
      expect(ids.has(id), id).toBe(true);
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

  it('STRIDE 必须解释六类威胁，而不是只把缩写放进标题', () => {
    const threat = SECURITY_PATHS
      .flatMap((path) => path.modules)
      .find((mod) => mod.id === 'sec_fund_threat_model')!;
    const stride = threat.lesson?.keyTerms.find((item) => item.term === 'STRIDE');

    expect(stride).toBeTruthy();
    expect(stride?.fullName).toContain('Spoofing');
    expect(stride?.fullName).toContain('Elevation of privilege');
    expect(stride?.explanation).toContain('六类');
    expect(stride?.explanation).toContain('不是');
  });

  it('每条路线都有去重后的专业名词表，教学正文中的大写缩写都能找到解释', () => {
    for (const path of SECURITY_PATHS) {
      expect(path.glossary.length, path.id).toBeGreaterThanOrEqual(path.modules.length * 3);
      expect(new Set(path.glossary.map((item) => item.term)).size, path.id).toBe(path.glossary.length);

      const definedText = path.glossary
        .flatMap((item) => [item.term, item.fullName || '', item.explanation])
        .join('\n');
      const undefined = [...acronymsIn(teachingText(path))]
        .filter((acronym) => !new RegExp(`(^|[^A-Za-z0-9])${acronym}([^A-Za-z0-9]|$)`).test(definedText));

      expect(undefined, path.id).toEqual([]);
      for (const item of path.glossary) {
        expect(item.explanation.length, `${path.id}:${item.term}`).toBeGreaterThan(12);
      }
    }
  });
});
