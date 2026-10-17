// 模板化 POC 扫描（mini-nuclei，sec-lab P2，2026-10-17）。
//
// ★ 为什么自己实现而不用 nuclei：多数机器上没装 nuclei，而"没装就没法验证"
//   会让这一整块能力形同虚设。这里实现一个**只读检测**的最小内核：
//   YAML 模板 = 一串 HTTP 请求 + 匹配器，命中即出一条 finding。
// ★ 模板只描述「发什么请求 + 怎么匹配」，**不含任何破坏性/利用型动作** ——
//   这既是安全边界，也是"不提前声明做不到的事"。
// ★ 装了 nuclei 的用户仍可走 B 轨 `/toolchain run --tool=nuclei`，两者不冲突。
import { parse as parseYaml } from 'yaml';
import { fetchPage } from './crawler.js';
import type { Finding, Severity, ToolOutput } from '../sec-lab-types.js';

export type Matcher =
  | { type: 'status'; status: number[] }
  | { type: 'word'; words: string[]; part?: 'body' | 'header'; condition?: 'and' | 'or' }
  | { type: 'regex'; regex: string[]; part?: 'body' | 'header' }
  | { type: 'header'; name: string; contains?: string }
  | { type: 'absent-header'; name: string };

export interface PocRequest {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  matchers: Matcher[];
  matchersCondition?: 'and' | 'or';
}

export interface PocTemplate {
  id: string;
  name: string;
  severity: Severity;
  tags: string[];
  description?: string;
  remediation?: string;
  requests: PocRequest[];
}

/** 内置模板（YAML 子集）。故意只收**只读检测**：暴露面与配置缺陷，不收利用链。 */
const BUILTIN_YAML: string[] = [
  `id: git-config-exposure
name: .git/config 暴露
severity: high
tags: [exposure, git]
description: 源码仓库元数据可被公网直接读取，攻击者可还原全部源码与历史提交。
remediation: Web 服务器拒绝 /.git/* 访问；部署时不要把 .git 目录带上去。
requests:
  - method: GET
    path: /.git/config
    matchers:
      - type: status
        status: [200]
      - type: word
        words: ["[core]", "repositoryformatversion"]
        condition: and`,
  `id: env-file-exposure
name: .env 配置文件暴露
severity: critical
tags: [exposure, secrets]
description: 环境变量文件可被读取，通常含数据库口令、API Key、APP_KEY。
remediation: Web 服务器拒绝 .env；密钥立即轮换并改用密钥管理服务。
requests:
  - method: GET
    path: /.env
    matchers:
      - type: status
        status: [200]
      - type: regex
        regex: ["(?im)^(DB_|APP_KEY|SECRET|AWS_|REDIS_)"]`,
  `id: directory-listing
name: 目录遍历（Directory Listing）
severity: medium
tags: [misconfig, exposure]
description: 目录内容可被列出，可能暴露备份、日志与源码。
remediation: 关闭 Web 服务器的 autoindex / 目录浏览。
requests:
  - method: GET
    path: /
    matchers:
      - type: word
        words: ["Index of /", "Directory listing for"]`,
  `id: spring-actuator-env
name: Spring Actuator 环境端点暴露
severity: high
tags: [exposure, spring]
description: /actuator/env 可匿名读取，常回显全部环境变量（含口令）。
remediation: 生产环境关闭或鉴权 actuator 端点（management.endpoints.web.exposure.include）。
requests:
  - method: GET
    path: /actuator/env
    matchers:
      - type: status
        status: [200]
      - type: word
        words: ["propertySources", "systemProperties"]`,
  `id: phpinfo-exposure
name: phpinfo 页面暴露
severity: medium
tags: [exposure, php]
description: phpinfo 页面泄露绝对路径、扩展版本与环境变量。
remediation: 删除该文件；生产环境禁止输出 phpinfo。
requests:
  - method: GET
    path: /phpinfo.php
    matchers:
      - type: word
        words: ["PHP Version", "phpinfo()"]`,
  `id: missing-security-headers
name: 缺少安全响应头
severity: low
tags: [misconfig, headers]
description: 缺少 HSTS / X-Frame-Options 等基础安全头。
remediation: 在网关或应用层统一补齐安全响应头。
requests:
  - method: GET
    path: /
    matchersCondition: and
    matchers:
      - type: absent-header
        name: strict-transport-security
      - type: absent-header
        name: x-frame-options`,
  `id: swagger-open
name: Swagger / OpenAPI 文档公开
severity: medium
tags: [exposure, api]
description: 接口文档可匿名访问，等于把全部 API 面交给攻击者。
remediation: 生产环境关闭 swagger-ui 或加鉴权。
requests:
  - method: GET
    path: /swagger-ui.html
    matchers:
      - type: status
        status: [200]
      - type: word
        words: ["swagger", "Swagger"]`,
];

function loadBuiltin(): PocTemplate[] {
  return BUILTIN_YAML.map((y) => {
    const t = parseYaml(y) as PocTemplate;
    if (!t?.id || !Array.isArray(t?.requests) || !t.requests.length) {
      throw new Error(`内置模板格式错误：${String((t as { id?: string })?.id || '?')}`);
    }
    return { ...t, tags: t.tags || [], severity: (t.severity || 'info') as Severity };
  });
}

export const BUILTIN_TEMPLATES: PocTemplate[] = loadBuiltin();

function originOf(target: string): string {
  return /^https?:\/\//i.test(target) ? target.replace(/\/+$/, '') : `http://${target.replace(/\/+$/, '')}`;
}

function headerText(headers: Record<string, string | string[] | undefined>): string {
  return Object.entries(headers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v ?? ''}`).join('\n');
}

function matchOne(m: Matcher, ctx: { status: number; body: string; headers: Record<string, string | string[] | undefined> }): boolean {
  const part = (p?: 'body' | 'header') => (p === 'header' ? headerText(ctx.headers) : ctx.body);
  switch (m.type) {
    case 'status': return m.status.includes(ctx.status);
    case 'word': {
      const text = part(m.part).toLowerCase();
      const hits = m.words.map((w) => text.includes(String(w).toLowerCase()));
      return m.condition === 'and' ? hits.every(Boolean) : hits.some(Boolean);
    }
    case 'regex': {
      const text = part(m.part);
      return m.regex.some((r) => { try { return new RegExp(r, 'im').test(text); } catch { return false; } });
    }
    case 'header': {
      const v = String(ctx.headers[m.name.toLowerCase()] ?? '');
      return m.contains ? v.toLowerCase().includes(String(m.contains).toLowerCase()) : !!v;
    }
    case 'absent-header': return ctx.headers[m.name.toLowerCase()] === undefined;
    default: return false;
  }
}

export interface PocScanOpts {
  target: string;
  /** 只跑指定模板 id（/templates run 用）；不填=全部候选 */
  ids?: string[];
  tags?: string[];
  severities?: string[];
  timeoutMs?: number;
}

/** 跑全部（或按 id / 标签 / 级别过滤）内置模板。 */
export async function runPocScan(o: PocScanOpts): Promise<ToolOutput> {
  const base = originOf(o.target);
  const timeout = Math.min(Math.max(o.timeoutMs ?? 10000, 1000), 30000);
  const ids = (o.ids || []).map((x) => x.toLowerCase());
  const tags = (o.tags || []).map((x) => x.toLowerCase());
  const sevs = (o.severities || []).map((x) => x.toLowerCase());
  const list = BUILTIN_TEMPLATES.filter((t) => {
    if (ids.length && !ids.includes(t.id.toLowerCase())) return false;
    if (sevs.length && !sevs.includes(t.severity)) return false;
    if (tags.length && !t.tags.some((x) => tags.includes(x.toLowerCase()))) return false;
    return true;
  });

  const findings: Finding[] = [];
  const hits: Array<{ id: string; path: string; status: number }> = [];
  for (const t of list) {
    for (const req of t.requests) {
      const url = req.path.startsWith('http') ? req.path : `${base}${req.path.startsWith('/') ? '' : '/'}${req.path}`;
      try {
        const res = await fetchPage(url, timeout, 0);
        const cond = req.matchersCondition === 'or' ? 'or' : 'and';
        const results = req.matchers.map((m) => matchOne(m, res));
        const ok = cond === 'and' ? results.every(Boolean) : results.some(Boolean);
        if (!ok) continue;
        hits.push({ id: t.id, path: req.path, status: res.status });
        findings.push({
          title: t.name,
          severity: t.severity,
          detail: `${req.method || 'GET'} ${url} → HTTP ${res.status}\n${t.description || ''}`,
          remediation: t.remediation,
          evidence: res.body.slice(0, 400),
        });
      } catch {
        // 单条模板失败不影响其它（目标可能对某些路径直接断连）
      }
    }
  }

  return {
    tool: 'poc_scan', target: o.target, risk: 'active',
    summary: `运行 ${list.length} 个模板，命中 ${findings.length} 条：\n` +
      (hits.length ? hits.map((h) => `[${h.id}] ${h.path} → ${h.status}`).join('\n') : '（无命中）'),
    findings,
    raw: { templates: list.map((t) => t.id), hits },
  };
}

/** 模板库：list / show / run。 */
export async function runTemplates(
  action: string,
  opts: { id?: string; target?: string; timeoutMs?: number } = {},
): Promise<ToolOutput> {
  const a = String(action || 'list').toLowerCase();
  if (a === 'list') {
    return {
      tool: 'poc_templates', target: '', risk: 'passive',
      summary: `内置模板 ${BUILTIN_TEMPLATES.length} 个：\n` +
        BUILTIN_TEMPLATES.map((t) => `${t.id}  [${t.severity}]  ${t.name}  (${t.tags.join(', ')})`).join('\n'),
      findings: [],
      raw: BUILTIN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, severity: t.severity, tags: t.tags })),
    };
  }
  if (a === 'show') {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === opts.id);
    if (!t) throw new Error(`没有模板 ${opts.id || '(未指定)'}（/templates list 看全部）`);
    return {
      tool: 'poc_templates', target: '', risk: 'passive',
      summary: `${t.id}  ${t.name}\nseverity: ${t.severity}\ntags: ${t.tags.join(', ')}\n${t.description || ''}\n\n` +
        t.requests.map((r) => `${r.method || 'GET'} ${r.path}\n  匹配：${JSON.stringify(r.matchers)}`).join('\n'),
      findings: [],
      raw: t,
    };
  }
  if (a === 'run') {
    if (!opts.id) throw new Error('run 需要模板 id（/templates list 看全部）');
    if (!opts.target) throw new Error('run 需要目标');
    if (!BUILTIN_TEMPLATES.some((x) => x.id === opts.id)) throw new Error(`没有模板 ${opts.id}`);
    // 只跑这一个模板 —— 复用同一个扫描内核，不另写一条执行路径
    const out = await runPocScan({ target: opts.target, ids: [opts.id], timeoutMs: opts.timeoutMs });
    return { ...out, tool: 'poc_templates', summary: `模板 ${opts.id}：\n${out.summary}` };
  }
  throw new Error('action 必须是 list / show / run');
}
