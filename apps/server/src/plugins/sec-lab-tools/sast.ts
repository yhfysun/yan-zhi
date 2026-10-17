// 源码安全扫描（SAST，sec-lab P4，2026-10-17）—— passive 级、零依赖。
//
// ★ 定位：L1（正则）+ L2（结构式）两层，不接 LLM。理由是扫描必须**确定性可复现**：
//   同一个仓库两次扫出不同结果，报告就没人信。语义级审计走本仓的
//   `code-security-audit` skill（那是给模型看的），两者分工不同。
// ★ 只读本地文件：不碰网络、不改文件、不执行被测代码。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Finding, Severity, ToolOutput } from '../sec-lab-types.js';

export interface SastRule {
  id: string;
  title: string;
  severity: Severity;
  cwe?: string;
  re: RegExp;
  why: string;
  fix: string;
}

/** 规则刻意写得"少而准"：宁可漏报，也不给一堆噪音让人不再看报告。 */
export const SAST_RULES: SastRule[] = [
  {
    id: 'hardcoded-secret', title: '硬编码凭据', severity: 'high', cwe: 'CWE-798',
    re: /\b(password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
    why: '凭据写进源码后会进版本历史，删掉也仍在历史里。',
    fix: '改用环境变量或密钥管理服务，并轮换已泄露的凭据。',
  },
  {
    id: 'sql-concat', title: 'SQL 字符串拼接', severity: 'high', cwe: 'CWE-89',
    re: /(SELECT|INSERT|UPDATE|DELETE)[^;\n]{0,120}(\+\s*[a-zA-Z_$]|\$\{|%s['"]\s*%|f['"][^'"]*\{)/i,
    why: '把用户输入拼进 SQL 就是注入面。',
    fix: '使用参数化查询 / 预编译语句。',
  },
  {
    id: 'eval', title: '动态求值（eval / Function）', severity: 'high', cwe: 'CWE-95',
    re: /\b(eval|new\s+Function|setTimeout\s*\(\s*['"][^'"]+['"]\s*,)\s*\(/,
    why: '动态求值把字符串当代码执行，输入可控即 RCE。',
    fix: '改用显式分支或安全的解析器。',
  },
  {
    id: 'innerhtml', title: 'innerHTML 赋值（XSS）', severity: 'medium', cwe: 'CWE-79',
    re: /\.(innerHTML|outerHTML)\s*=/,
    why: '直接写 HTML 会执行其中的脚本。',
    fix: '改用 textContent，或对内容做严格的白名单净化。',
  },
  {
    id: 'command-injection', title: '命令执行拼接', severity: 'high', cwe: 'CWE-78',
    re: /\b(child_process|execSync|exec|spawnSync|os\.system|subprocess\.(run|call|Popen))\b[^\n]{0,80}(\+|`|\$\{|%s)/,
    why: '把变量拼进 shell 命令即可注入任意命令。',
    fix: '使用参数数组（不经过 shell），并对参数做白名单校验。',
  },
  {
    id: 'unsafe-deserialize', title: '不安全的反序列化', severity: 'high', cwe: 'CWE-502',
    re: /\b(unserialize|pickle\.loads?|yaml\.load\s*\(|ObjectInputStream|readObject)\s*\(/,
    why: '反序列化不可信数据可导致对象注入与 RCE。',
    fix: '改用 JSON 等数据格式；必须反序列化时使用 safe_load / 白名单类。',
  },
  {
    id: 'weak-crypto', title: '弱哈希算法', severity: 'medium', cwe: 'CWE-328',
    re: /\b(md5|sha1)\s*\(/i,
    why: 'MD5/SHA1 已有实用碰撞，不能用于完整性或口令。',
    fix: '口令用 bcrypt/argon2；完整性用 SHA-256 及以上。',
  },
  {
    id: 'cors-wildcard', title: 'CORS 允许任意来源', severity: 'medium', cwe: 'CWE-942',
    re: /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]?\*/,
    why: '任意来源都能带凭据读取响应。',
    fix: '改为显式来源白名单，并避免与 credentials 同用。',
  },
  {
    id: 'debug-route', title: '调试路由未摘除', severity: 'low', cwe: 'CWE-489',
    re: /(app|router)\.(get|post|all)\s*\(\s*['"][^'"]*(debug|test|dev)[^'"]*['"]/i,
    why: '调试端点常缺少鉴权，是信息泄露的常见入口。',
    fix: '生产构建中移除，或用环境开关默认关闭。',
  },
  {
    id: 'disabled-tls-check', title: '关闭 TLS 校验', severity: 'medium', cwe: 'CWE-295',
    re: /(rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true)/,
    why: '关闭证书校验等于放弃中间人防护。',
    fix: '默认开启校验；自签场景用显式 CA 而不是全局关闭。',
  },
];

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.go', '.php', '.rb', '.cs',
  '.vue', '.sql', '.yml', '.yaml', '.json', '.env', '.sh', '.ps1', '.kt', '.swift',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor', '.cache', 'resources']);

/** 纯函数：对一段文本跑规则（便于单测）。 */
export function scanText(relPath: string, text: string): Finding[] {
  const out: Finding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.length > 2000) return; // 压缩产物跳过，避免误报刷屏
    for (const r of SAST_RULES) {
      if (!r.re.test(line)) continue;
      out.push({
        title: `${r.title}${r.cwe ? `（${r.cwe}）` : ''}`,
        severity: r.severity,
        detail: `${relPath}:${i + 1}\n${line.trim().slice(0, 200)}\n${r.why}`,
        remediation: r.fix,
        evidence: line.trim().slice(0, 300),
      });
    }
  });
  return out;
}

export interface SastOpts {
  root: string;
  maxFiles?: number;
  maxBytes?: number;
}

export async function runSast(o: SastOpts): Promise<ToolOutput> {
  const root = path.resolve(String(o.root || ''));
  const maxFiles = Math.min(Math.max(o.maxFiles ?? 800, 1), 3000);
  const maxBytes = Math.min(Math.max(o.maxBytes ?? 512 * 1024, 4096), 4 * 1024 * 1024);

  const stat = await fs.stat(root).catch(() => null);
  if (!stat) throw new Error(`路径不存在：${root}`);
  if (!stat.isDirectory()) throw new Error(`需要一个目录：${root}`);

  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    if (files.length >= maxFiles) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (files.length >= maxFiles) return;
      if (e.name.startsWith('.') && e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(full);
      } else if (TEXT_EXT.has(path.extname(e.name).toLowerCase()) || e.name === '.env') {
        files.push(full);
      }
    }
  };
  await walk(root);

  const findings: Finding[] = [];
  let scanned = 0;
  for (const f of files) {
    const st = await fs.stat(f).catch(() => null);
    if (!st || st.size > maxBytes) continue;
    const text = await fs.readFile(f, 'utf8').catch(() => null);
    if (text === null) continue;
    scanned++;
    findings.push(...scanText(path.relative(root, f), text));
  }

  const bySeverity = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  return {
    tool: 'sast', target: root, risk: 'passive',
    summary: `扫描 ${scanned}/${files.length} 个文件，命中 ${findings.length} 处：\n` +
      Object.entries(bySeverity).map(([k, v]) => `${k}: ${v}`).join('　') +
      '\n★ 正则/结构式规则会有误报；每条都要人工确认（确认后可用 /finding 标状态）。',
    findings,
    raw: { root, scanned, files: files.length, rules: SAST_RULES.map((r) => r.id), bySeverity },
  };
}
