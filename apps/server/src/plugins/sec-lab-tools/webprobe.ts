// A 轨工具：webprobe —— Web 面探测（敏感路径 / Cookie 审计 / CORS / 组件指纹 + CVE 规则）。
// 零依赖：Node http/https 标准库。风险级 active（会向目标发送 HTTP 请求，需目标已授权）。
// 说明：内置规则为高频子集，追求全量请启用 B 轨 nuclei（toolchain 检测后接管）。
import http from 'node:http';
import https from 'node:https';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface WebProbeParams {
  target: string;
  timeoutMs: number;
  /** 并发请求数，默认 8（刻意保守，避免打挂目标） */
  concurrency?: number;
}

interface HttpResponse {
  url: string; status: number; headers: Record<string, string>; body: string; error?: string;
}

/** 敏感路径字典：[路径, 命中判定关键词（可选）, 说明] */
const SENSITIVE_PATHS: Array<[string, string?, string?]> = [
  ['/.git/HEAD', 'ref:', 'Git 仓库目录可访问，源码与历史可能泄露'],
  ['/.svn/entries', '', 'SVN 元数据可访问'],
  ['/.env', '', '环境变量文件泄露（常含数据库口令与密钥）'],
  ['/.DS_Store', '', 'macOS 目录索引泄露'],
  ['/web.config', '', '配置文件可下载'],
  ['/backup.sql', '', '数据库备份可下载'],
  ['/db.sql', '', '数据库备份可下载'],
  ['/phpinfo.php', 'phpinfo', 'phpinfo 暴露完整环境信息'],
  ['/actuator', '', 'Spring Boot Actuator 未加保护'],
  ['/actuator/env', '', 'Actuator env 端点泄露配置与凭据'],
  ['/swagger-ui.html', '', 'API 文档未加访问控制'],
  ['/v2/api-docs', '', 'Swagger API 描述暴露'],
  ['/manager/html', '', 'Tomcat 管理后台暴露'],
  ['/console', '', '控制台入口暴露'],
  ['/admin', '', '管理后台入口'],
  ['/wp-login.php', '', 'WordPress 后台'],
  ['/.aws/credentials', '', '云凭据文件泄露'],
  ['/config.yml', '', '配置文件泄露'],
];

/** 组件指纹规则：headers / body 匹配 */
const FINGERPRINTS: Array<{ name: string; where: 'headers' | 'body'; pattern: RegExp; hint?: string }> = [
  { name: 'Apache Shiro', where: 'headers', pattern: /rememberMe=/i, hint: '若使用默认密钥存在反序列化 RCE 风险（需授权验证）' },
  { name: 'ThinkPHP', where: 'headers', pattern: /ThinkPHP/i },
  { name: 'Jenkins', where: 'headers', pattern: /X-Jenkins|JSESSIONID/i },
  { name: 'Drupal', where: 'headers', pattern: /Drupal/i },
  { name: 'WebLogic', where: 'headers', pattern: /WebLogic/i },
  { name: 'Apache Tomcat', where: 'headers', pattern: /Apache-Coyote|Tomcat/i },
  { name: 'Nginx', where: 'headers', pattern: /nginx/i },
  { name: 'Spring Boot', where: 'body', pattern: /Whitelabel Error Page|spring/i },
  { name: 'phpMyAdmin', where: 'body', pattern: /phpMyAdmin/i },
];

function httpGet(url: string, timeoutMs: number): Promise<HttpResponse> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return resolve({ url, status: 0, headers: {}, body: '', error: 'URL 解析失败' });
    }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        host: u.hostname,
        port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80,
        path: u.pathname + u.search,
        method: 'GET',
        timeout: timeoutMs,
        rejectUnauthorized: false,
        headers: { 'User-Agent': 'yan-zhi-sec-lab/0.1', Accept: '*/*' },
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers[k.toLowerCase()] = v;
          else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join('; ');
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => { if (body.length < 200000) body += c; });
        res.on('end', () => resolve({ url, status: res.statusCode || 0, headers, body }));
      },
    );
    req.on('error', (e: Error) => resolve({ url, status: 0, headers: {}, body: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ url, status: 0, headers: {}, body: '', error: '请求超时' }); });
    req.end();
  });
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out.push(await fn(items[i]));
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runWebProbe(p: WebProbeParams): Promise<ToolOutput> {
  const timeout = Math.max(1000, Math.min(p.timeoutMs, 15000));
  const conc = p.concurrency ?? 8;
  const findings: Finding[] = [];

  // 1) 基线探测：https 优先，失败回退 http
  let baseUrl = `https://${p.target}`;
  let root = await httpGet(baseUrl + '/', timeout);
  if (root.error || root.status === 0) {
    baseUrl = `http://${p.target}`;
    root = await httpGet(baseUrl + '/', timeout);
  }
  if (root.error || root.status === 0) {
    return {
      tool: 'webprobe',
      target: p.target,
      risk: 'active',
      summary: `目标无 HTTP 响应（${root.error || 'unknown'}），Web 面探测终止。`,
      findings: [{ title: 'Web 服务不可达', severity: 'info', detail: root.error || '无响应' }],
    };
  }

  const headers = root.headers;
  const raw: Record<string, unknown> = { baseUrl, rootStatus: root.status, headers };

  // 2) 组件指纹
  const headerBlob = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n');
  const detected: string[] = [];
  for (const fp of FINGERPRINTS) {
    const src = fp.where === 'headers' ? headerBlob : root.body;
    if (fp.pattern.test(src)) {
      detected.push(fp.name);
      findings.push({
        title: `识别到组件：${fp.name}`,
        severity: 'info',
        detail: fp.hint ? `${fp.name}${fp.hint ? ` —— ${fp.hint}` : ''}` : `由 ${fp.where} 特征识别`,
        remediation: fp.hint ? '核对版本并升级到已修复版本' : '确认版本并及时打补丁',
      });
    }
  }
  raw.fingerprints = detected;

  // 3) Cookie 审计
  if (headers['set-cookie']) {
    const cookies = headers['set-cookie'].split(/,(?=\s*[^;]+=)/);
    for (const c of cookies) {
      const miss: string[] = [];
      if (!/;\s*HttpOnly/i.test(c)) miss.push('HttpOnly');
      if (!/;\s*Secure/i.test(c)) miss.push('Secure');
      if (!/;\s*SameSite=/i.test(c)) miss.push('SameSite');
      if (miss.length) {
        findings.push({
          title: `Cookie 缺少安全标志：${miss.join(', ')}`,
          severity: 'medium',
          detail: c.trim().slice(0, 160),
          remediation: '补齐 HttpOnly / Secure / SameSite',
        });
      }
      if (/rememberMe=/i.test(c)) {
        findings.push({
          title: 'Shiro rememberMe Cookie 存在',
          severity: 'high',
          detail: '若沿用默认加密密钥，存在反序列化远程代码执行风险。',
          remediation: '更换独立 cipherKey 并升级 Shiro 至已修复版本',
        });
      }
    }
  }

  // 4) CORS 反射检测
  const acao = headers['access-control-allow-origin'];
  if (acao === '*') {
    const acac = headers['access-control-allow-credentials'];
    if (acac && /true/i.test(acac)) {
      findings.push({ title: 'CORS 配置危险：Allow-Origin:* 且 Allow-Credentials:true', severity: 'high', detail: '浏览器会拒绝该组合，但若服务端按 Origin 动态反射仍需警惕。', remediation: '改为白名单精确匹配来源' });
    } else {
      findings.push({ title: 'CORS 允许任意来源（*）', severity: 'low', detail: '任何站点都可读取该接口响应（无凭据场景）。', remediation: '按业务收敛为白名单来源' });
    }
  } else if (acao && acao.includes(p.target) === false && /^https?:\/\//.test(acao)) {
    findings.push({ title: `CORS 允许第三方来源：${acao}`, severity: 'info', detail: '确认该来源是否为业务预期。' });
  }

  // 5) 敏感路径探测
  const pathResults = await pool(SENSITIVE_PATHS, conc, async ([path, keyword, desc]) => {
    const r = await httpGet(baseUrl + path, timeout);
    const hit = r.status >= 200 && r.status < 300 && (!keyword || r.body.includes(keyword));
    return { path, status: r.status, hit, desc, size: r.body.length };
  });
  raw.paths = pathResults;

  for (const pr of pathResults) {
    if (!pr.hit) continue;
    const isGitEnv = pr.path.includes('.git') || pr.path.includes('.env') || pr.path.includes('credentials') || pr.path.includes('.sql') || pr.path.includes('config');
    findings.push({
      title: `敏感路径可访问：${pr.path}（${pr.status}）`,
      severity: isGitEnv ? 'high' : 'medium',
      detail: pr.desc || `返回 ${pr.status}，响应 ${pr.size} 字节`,
      evidence: `${baseUrl}${pr.path} → ${pr.status}`,
      remediation: isGitEnv ? '立即从 Web 根目录移除或禁止访问，并排查是否已泄露凭据' : '加访问控制或下线该入口',
    });
  }

  const highCount = findings.filter((f) => f.severity === 'high' || f.severity === 'critical').length;
  return {
    tool: 'webprobe',
    target: p.target,
    risk: 'active',
    summary: `基线 ${baseUrl} 返回 ${root.status}；识别组件 ${detected.length} 个；探测 ${pathResults.length} 个敏感路径，命中 ${pathResults.filter((x) => x.hit).length} 个；高危及以上 ${highCount} 项。`,
    findings: findings.length ? findings : [{ title: '未发现明显问题', severity: 'info', detail: '基线探测与敏感路径扫描均未命中规则' }],
    raw,
  };
}
