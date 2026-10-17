// 爬虫与 JS 端点抽取（sec-lab P1，2026-10-17）—— active 级。
//
// ★ 与 webprobe 的分工：webprobe 是"按固定字典探已知路径"，这里是"顺着页面里的链接
//   自己走"——静态字典永远发现不了业务自己的接口，而接口恰恰是最该测的面。
// ★ 只跟同源（同 host）链接：跨域爬会跑到授权范围之外。
import http from 'node:http';
import https from 'node:https';
import type { Finding, ToolOutput } from '../sec-lab-types.js';

export interface PageResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  finalUrl: string;
}

/** 取页面（手动跟随最多 3 次重定向，便于控制同源判断与体积）。 */
export function fetchPage(url: string, timeoutMs: number, maxRedirects = 3): Promise<PageResult> {
  return new Promise((resolve, reject) => {
    const go = (u: string, left: number) => {
      let parsed: URL;
      try { parsed = new URL(u); } catch { reject(new Error(`URL 不合法：${u}`)); return; }
      const mod = parsed.protocol === 'https:' ? https : http;
      const req = mod.get(u, {
        timeout: timeoutMs,
        headers: { 'user-agent': 'yan-zhi-sec-lab/1.0', accept: '*/*', 'accept-encoding': 'identity' },
      }, (res) => {
        const code = res.statusCode || 0;
        if (code >= 300 && code < 400 && res.headers.location && left > 0) {
          res.resume();
          go(new URL(String(res.headers.location), u).toString(), left - 1);
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (b: Buffer) => {
          bytes += b.length;
          if (bytes <= 512 * 1024) chunks.push(b); // 单页最多收 512KB，防大文件拖死
        });
        res.on('end', () => resolve({
          status: code,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          finalUrl: u,
        }));
      });
      req.on('timeout', () => req.destroy(new Error(`请求超时（${timeoutMs}ms）`)));
      req.on('error', reject);
    };
    go(url, maxRedirects);
  });
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export interface CrawlResult {
  links: string[];
  forms: Array<{ action: string; method: string; inputs: string[] }>;
  scripts: string[];
}

/** 从 HTML 里抽链接 / 表单 / 脚本（零依赖正则；目标站点结构简单时足够用）。 */
export function extractFromHtml(html: string, baseUrl: string): CrawlResult {
  const base = (() => { try { return new URL(baseUrl); } catch { return null; } })();
  const abs = (href: string): string | null => {
    try { return new URL(decodeEntities(href.trim()), baseUrl).toString(); } catch { return null; }
  };
  const links = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    const u = abs(m[1]);
    if (u && /^https?:/i.test(u)) links.add(u.split('#')[0]);
  }
  const scripts = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+src\s*=\s*["']([^"']+)["']/gi)) {
    const u = abs(m[1]);
    if (u) scripts.add(u);
  }
  const forms: CrawlResult['forms'] = [];
  for (const m of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attrs = m[1];
    const action = /action\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || baseUrl;
    const method = (/method\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || 'GET').toUpperCase();
    const inputs: string[] = [];
    for (const im of m[2].matchAll(/<(?:input|select|textarea)\b([^>]*)>/gi)) {
      const name = /name\s*=\s*["']([^"']+)["']/i.exec(im[1])?.[1];
      if (name) inputs.push(name);
    }
    forms.push({ action: abs(action) || action, method, inputs });
  }
  // 只保留同源链接（跨域爬会跑出授权范围）
  const sameOrigin = [...links].filter((u) => {
    try { return base ? new URL(u).host === base.host : false; } catch { return false; }
  });
  return { links: sameOrigin, forms, scripts: [...scripts] };
}

export interface CrawlOpts {
  target: string;
  depth?: number;
  maxPages?: number;
  timeoutMs?: number;
}

export async function runCrawl(o: CrawlOpts): Promise<ToolOutput> {
  const start = /^https?:\/\//i.test(o.target) ? o.target : `http://${o.target}`;
  const maxDepth = Math.min(Math.max(o.depth ?? 2, 1), 4);
  const maxPages = Math.min(Math.max(o.maxPages ?? 20, 1), 60);
  const timeoutMs = Math.min(Math.max(o.timeoutMs ?? 10000, 1000), 30000);

  const seen = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: start, depth: 0 }];
  const pages: string[] = [];
  const allLinks = new Set<string>();
  const allForms: CrawlResult['forms'] = [];
  const allScripts = new Set<string>();

  while (queue.length && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await fetchPage(url, timeoutMs);
      if (!/text\/html|application\/xhtml/i.test(String(res.headers['content-type'] || ''))) continue;
      pages.push(url);
      const ex = extractFromHtml(res.body, res.finalUrl);
      ex.links.forEach((l) => allLinks.add(l));
      ex.forms.forEach((f) => allForms.push(f));
      ex.scripts.forEach((s) => allScripts.add(s));
      if (depth < maxDepth) {
        for (const l of ex.links) if (!seen.has(l)) queue.push({ url: l, depth: depth + 1 });
      }
    } catch {
      // 单页失败不影响整体（死链、超时都常见）
    }
  }

  const withParams = [...allLinks].filter((u) => {
    try { return [...new URL(u).searchParams.keys()].length > 0; } catch { return false; }
  });
  const findings: Finding[] = [];
  const passwordForms = allForms.filter((f) => f.inputs.some((i) => /pass|pwd/i.test(i)));
  if (passwordForms.length) {
    findings.push({
      title: `发现 ${passwordForms.length} 个登录表单`,
      severity: 'info',
      detail: passwordForms.map((f) => `${f.method} ${f.action}（字段：${f.inputs.join(', ')}）`).join('\n'),
      remediation: '确认登录态走 HTTPS、有失败次数限制与验证码；这是后续弱口令验证的入口。',
    });
  }
  if (withParams.length) {
    findings.push({
      title: `发现 ${withParams.length} 个带参数的 URL（注入/SSRF 的候选面）`,
      severity: 'info',
      detail: withParams.slice(0, 40).join('\n') + (withParams.length > 40 ? `\n…（共 ${withParams.length} 个）` : ''),
    });
  }

  return {
    tool: 'crawl', target: o.target, risk: 'active',
    summary: `爬取 ${pages.length} 页（深度 ≤${maxDepth}），同源链接 ${allLinks.size}，表单 ${allForms.length}，脚本 ${allScripts.size}` +
      (withParams.length ? `，带参数 URL ${withParams.length}` : ''),
    findings,
    raw: { pages, links: [...allLinks].slice(0, 300), forms: allForms, scripts: [...allScripts] },
  };
}

/** 从 JS 里抽接口（前端 bundle 常常把全部 API 路径写死在里面）。 */
export async function runJsEndpoint(target: string, timeoutMs = 10000): Promise<ToolOutput> {
  const pageUrl = /^https?:\/\//i.test(target) ? target : `http://${target}`;
  const timeout = Math.min(Math.max(timeoutMs, 1000), 30000);
  const page = await fetchPage(pageUrl, timeout);
  const ex = extractFromHtml(page.body, page.finalUrl);

  const inlineJs = [...page.body.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]).join('\n');
  const scripts = [...ex.scripts].slice(0, 10);
  const blobs = [inlineJs];
  for (const s of scripts) {
    try { blobs.push((await fetchPage(s, timeout)).body); } catch { /* 拿不到就跳过 */ }
  }

  const endpoints = new Set<string>();
  for (const js of blobs) {
    for (const m of js.matchAll(/["'`](\/(?:api|v\d|graphql|rest|admin|auth|user|upload|file)[A-Za-z0-9_\-/.]*)["'`]/g)) {
      endpoints.add(m[1]);
    }
    for (const m of js.matchAll(/["'`](https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{6,200})["'`]/g)) {
      endpoints.add(m[1]);
    }
  }
  const list = [...endpoints].sort();
  return {
    tool: 'js_endpoint', target, risk: 'active',
    summary: `扫描 ${1 + scripts.length} 个脚本，抽出 ${list.length} 个端点${list.length ? '：\n' + list.slice(0, 200).join('\n') : ''}` +
      (list.length > 200 ? `\n…（共 ${list.length} 个）` : ''),
    findings: list.length
      ? [{ title: `JS 中暴露 ${list.length} 个接口路径`, severity: 'info', detail: '这些是未在页面链接里出现的接口，通常是鉴权/参数校验最薄弱的地方。' }]
      : [],
    raw: { scripts, endpoints: list },
    truncated: list.length > 200,
  };
}
