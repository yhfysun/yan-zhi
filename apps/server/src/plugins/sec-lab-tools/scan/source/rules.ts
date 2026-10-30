// 源码扫描规则包（P1）。
//
// ★ 规则原则沿用 sast.ts：**宁可漏报，也不给噪音**。每条规则都要能一句话说清
//   「为什么这是问题」与「怎么改」，否则报告没人看。
// ★ 与旧 sast.ts 的差异：规则从单行正则升级为「可看上下文的规则对象」，
//   新增高熵秘钥、Electron 配置、依赖文件之外的敏感面；旧工具保留兼容。
import type { Severity } from '../../../sec-lab-types.js';

export interface RuleFile {
  rel: string;
  ext: string;
  text: string;
  lines: string[];
}

export interface RuleHit {
  line: number;
  evidence: string;
}

export interface SastRule {
  id: string;
  title: string;
  severity: Severity;
  cwe?: string;
  why: string;
  fix: string;
  /** 只扫这些扩展名；不填=全部文本文件 */
  exts?: string[];
  scan(file: RuleFile): RuleHit[];
}

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.py', '.java', '.go', '.php', '.rb', '.cs', '.kt', '.swift'];
const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue'];

function hit(file: RuleFile, i: number, evidence: string): RuleHit {
  return { line: i + 1, evidence: evidence.trim().slice(0, 300) };
}

/** 纯注释行：代码类规则默认跳过，避免文档/示例把报告刷满 */
function isCommentLine(line: string): boolean {
  return /^\s*(\/\/|\/\*|\*|#)/.test(line);
}

/** 逐行正则规则：最常见的一类，抽出来避免每条都写循环 */
function lineRule(
  meta: Omit<SastRule, 'scan'> & { re: RegExp; exts?: string[]; skip?: (line: string) => boolean; comments?: boolean },
): SastRule {
  const { re, skip, comments, ...rest } = meta;
  return {
    ...rest,
    scan(file) {
      const out: RuleHit[] = [];
      file.lines.forEach((line, i) => {
        if (line.length > 2000) return;
        if (!comments && isCommentLine(line)) return;
        if (skip?.(line)) return;
        if (re.test(line)) out.push(hit(file, i, line));
      });
      return out;
    },
  };
}

/** 明显是占位符的值不报（模板、示例、环境变量引用） */
function isPlaceholder(v: string): boolean {
  return /^(<.*>|\$\{.*\}|your[_-]|xxx+|changeme|example|placeholder|dummy|test)/i.test(v.trim());
}

function shannon(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** 从一行里抽所有字符串字面量 */
function stringLiterals(line: string): string[] {
  const out: string[] = [];
  const re = /(['"`])([^'"`]{12,})\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[2]);
  return out;
}

const hardcodedSecret: SastRule = {
  id: 'hardcoded-secret',
  title: '硬编码凭据',
  severity: 'high',
  cwe: 'CWE-798',
  why: '凭据写进源码后会进版本历史，删掉也仍在历史里。',
  fix: '改用环境变量或密钥管理服务，并轮换已泄露的凭据。',
  scan(file: RuleFile): RuleHit[] {
    const out: RuleHit[] = [];
    const re = /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*(['"])([^'"\s]{8,})\2/i;
    file.lines.forEach((line, i) => {
      if (line.length > 2000) return;
      const m = re.exec(line);
      if (!m) return;
      if (isPlaceholder(m[3])) return;
      out.push(hit(file, i, line));
    });
    return out;
  },
};

const privateKey = lineRule({
  id: 'private-key-block',
  title: '私钥块出现在源码中',
  severity: 'critical',
  cwe: 'CWE-798',
  re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  why: '私钥一旦入库即可被任何能读到仓库的人使用。',
  fix: '立即轮换该密钥对，私钥只存放在密钥服务或系统凭据存储中。',
  comments: true,
});

const cloudCredential = lineRule({
  id: 'cloud-credential',
  title: '云服务访问凭据',
  severity: 'critical',
  cwe: 'CWE-798',
  re: /\b(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,})\b/,
  why: '云厂商的访问密钥可直接调用计费接口，泄露即等于账号失守。',
  fix: '立即在控制台吊销并轮换，改用短期凭据或服务端代理。',
  comments: true,
});

const highEntropy = {
  id: 'high-entropy-secret',
  title: '疑似高熵密钥',
  severity: 'medium',
  cwe: 'CWE-798',
  why: '长度长且字符分布均匀的字符串，通常是密钥或令牌，但命名不一定会暴露它。',
  fix: '确认用途；若确为凭据，移出源码并轮换。',
  exts: CODE_EXTS,
  scan(file: RuleFile): RuleHit[] {
    const out: RuleHit[] = [];
    file.lines.forEach((line, i) => {
      if (line.length > 2000 || isCommentLine(line)) return;
      if (line.includes('${')) return; // 模板插值里的片段不是独立字面量
      for (const lit of stringLiterals(line)) {
        if (lit.length < 24 || lit.length > 200) continue;
        if (/[\s{}()[\],;:'"`]/.test(lit)) continue; // 含空白/标点的是表达式片段，不是令牌
        if (/^https?:\/\//i.test(lit)) continue; // URL 不算
        if (/[\/\\]/.test(lit)) continue; // 路径不算
        if (/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/i.test(lit)) continue; // 域名 / 文件名不算
        if (/^[0-9a-f]{32,}$/i.test(lit)) continue; // 纯哈希/指纹不报，噪音太大
        const classes = (/[a-z]/.test(lit) ? 1 : 0) + (/[A-Z]/.test(lit) ? 1 : 0) + (/[0-9]/.test(lit) ? 1 : 0);
        if (classes < 2) continue;
        if (shannon(lit) < 4.35) continue;
        out.push(hit(file, i, lit));
      }
    });
    return out;
  },
} satisfies SastRule;

const sqlConcat = lineRule({
  id: 'sql-concat',
  title: 'SQL 字符串拼接',
  severity: 'high',
  cwe: 'CWE-89',
  // ★ 关键字必须出现在**字符串开头**，且后面跟 SQL 结构（SELECT + 列 / UPDATE … SET / DELETE FROM），
  //   否则 h.update(...) / Select-Object / "select|insert|update" 这类文本全会误报。
  re: /(['"`])\s*(?:SELECT\s+[\w*`"[.]|INSERT\s+INTO\s+|UPDATE\s+[\w`".]+\s+SET\b|DELETE\s+FROM\s+)[^;\n]{0,140}(?:\$\{|\+\s*[a-zA-Z_$]|%s['"]\s*%)/i,
  why: '把用户输入拼进 SQL 就是注入面。',
  fix: '使用参数化查询 / 预编译语句。',
});

const commandInjection = lineRule({
  id: 'command-injection',
  title: '命令执行拼接',
  severity: 'high',
  cwe: 'CWE-78',
  // ★ 排除 RegExp.prototype.exec：裸写 exec( 会把所有正则匹配都报成命令注入。
  re: /(?<!\.)\b(exec|execSync|spawnSync|spawn)\s*\([^\n]{0,90}(\+|`|\$\{|%s)|os\.system\s*\([^\n]{0,70}(\+|\$\{|%s)|subprocess\.(run|call|Popen)\s*\([^\n]{0,70}(\+|\$\{|%s)/,
  why: '把变量拼进 shell 命令即可注入任意命令。',
  fix: '使用参数数组（不经过 shell），并对参数做白名单校验。',
});

const evalRule = lineRule({
  id: 'eval',
  title: '动态求值（eval / Function）',
  severity: 'high',
  cwe: 'CWE-95',
  re: /\b(eval|new\s+Function|setTimeout\s*\(\s*['"][^'"]+['"]\s*,)\s*\(/,
  why: '动态求值把字符串当代码执行，输入可控即 RCE。',
  fix: '改用显式分支或安全的解析器。',
});

const unsafeDeserialize = lineRule({
  id: 'unsafe-deserialize',
  title: '不安全的反序列化',
  severity: 'high',
  cwe: 'CWE-502',
  re: /\b(unserialize|pickle\.loads?|yaml\.load\s*\(|ObjectInputStream|readObject)\s*\(/,
  why: '反序列化不可信数据可导致对象注入与 RCE。',
  fix: '改用 JSON 等数据格式；必须反序列化时使用 safe_load / 白名单类。',
});

const innerHtml = lineRule({
  id: 'innerhtml',
  title: 'innerHTML 赋值（XSS）',
  severity: 'medium',
  cwe: 'CWE-79',
  re: /\.(innerHTML|outerHTML)\s*=/,
  why: '直接写 HTML 会执行其中的脚本。',
  fix: '改用 textContent，或对内容做严格的白名单净化。',
  exts: JS_EXTS,
});

const dangerousHtml = lineRule({
  id: 'dangerous-html',
  title: '模板直接渲染 HTML',
  severity: 'medium',
  cwe: 'CWE-79',
  re: /(v-html\s*=|dangerouslySetInnerHTML|\[innerHTML\]\s*=)/,
  why: '模板层直接渲染 HTML，若内容来自用户即形成 XSS。',
  fix: '改为文本插值；确需富文本时用白名单净化（如 DOMPurify）。',
  exts: JS_EXTS,
});

const pathTraversal = lineRule({
  id: 'path-traversal',
  title: '文件路径来自请求参数',
  severity: 'medium',
  cwe: 'CWE-22',
  re: /\b(fs\.(readFile|writeFile|createReadStream|readdir)\w*|path\.(join|resolve))\s*\([^)]*\b(req\.|request\.|ctx\.|params\.|query\.)/,
  why: '把请求参数直接拼进路径，可用 ../ 穿越到任意目录。',
  fix: '对路径做 basename/白名单校验，并确认结果仍在允许的根目录内。',
  exts: CODE_EXTS,
});

const corsWildcard = lineRule({
  id: 'cors-wildcard',
  title: 'CORS 允许任意来源',
  severity: 'medium',
  cwe: 'CWE-942',
  re: /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]?\*/,
  why: '任意来源都能带凭据读取响应。',
  fix: '改为显式来源白名单，并避免与 credentials 同用。',
});

const disabledTls = lineRule({
  id: 'disabled-tls-check',
  title: '关闭 TLS 校验',
  severity: 'medium',
  cwe: 'CWE-295',
  re: /(rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true)/,
  why: '关闭证书校验等于放弃中间人防护。',
  fix: '默认开启校验；自签场景用显式 CA 而不是全局关闭。',
});

const weakHash = lineRule({
  id: 'weak-crypto',
  title: '弱哈希算法',
  severity: 'medium',
  cwe: 'CWE-328',
  re: /\b(md5|sha1)\s*\(/i,
  why: 'MD5/SHA1 已有实用碰撞，不能用于完整性或口令。',
  fix: '口令用 bcrypt/argon2；完整性用 SHA-256 及以上。',
});

const weakRandom = lineRule({
  id: 'weak-random-secret',
  title: '用 Math.random 生成安全值',
  severity: 'medium',
  cwe: 'CWE-338',
  re: /\b(token|secret|nonce|salt|password|key)\w*\s*[:=][^;\n]{0,40}Math\.random\s*\(/i,
  why: 'Math.random 不是密码学随机源，可被预测。',
  fix: '改用 crypto.randomBytes / crypto.getRandomValues。',
  exts: JS_EXTS,
});

const plainHttp = lineRule({
  id: 'plain-http-endpoint',
  title: '硬编码明文 HTTP 端点',
  severity: 'low',
  cwe: 'CWE-319',
  re: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])[^'"\s]{6,}['"]/,
  why: '明文端点可被中间人窃听或篡改。',
  fix: '改用 HTTPS；确需内网明文时明确标注并限制在受信网段。',
});

const debugRoute = lineRule({
  id: 'debug-route',
  title: '调试路由未摘除',
  severity: 'low',
  cwe: 'CWE-489',
  re: /(app|router)\.(get|post|all)\s*\(\s*['"][^'"]*(debug|test|dev)[^'"]*['"]/i,
  why: '调试端点常缺少鉴权，是信息泄露的常见入口。',
  fix: '生产构建中移除，或用环境开关默认关闭。',
});

const defaultCredential: SastRule = {
  id: 'default-credential',
  title: '默认口令',
  severity: 'high',
  cwe: 'CWE-1392',
  why: '默认口令是最常见的入口，且用户几乎不会改。',
  fix: '首次运行强制设置口令，或改为随机生成并要求修改。',
  scan(file: RuleFile): RuleHit[] {
    const out: RuleHit[] = [];
    const re = /\b(admin|root|sa|test)\b\s*[:=]\s*(['"])(admin|root|password|passwd|123456|12345678|admin123)\2/i;
    file.lines.forEach((line, i) => {
      if (line.length > 2000) return;
      const m = re.exec(line);
      if (!m || isPlaceholder(m[3])) return;
      out.push(hit(file, i, line));
    });
    return out;
  },
};

const nodeIntegration = lineRule({
  id: 'electron-node-integration',
  title: 'Electron 开启 nodeIntegration',
  severity: 'high',
  cwe: 'CWE-829',
  re: /nodeIntegration\s*:\s*true/,
  why: '渲染进程能直接调用 Node API，页面脚本一旦被注入即可执行系统命令。',
  fix: '设为 false，需要的能力经 preload + contextBridge 暴露最小接口。',
  exts: JS_EXTS,
});

const contextIsolation = lineRule({
  id: 'electron-context-isolation-off',
  title: 'Electron 关闭 contextIsolation',
  severity: 'high',
  cwe: 'CWE-829',
  re: /contextIsolation\s*:\s*false/,
  why: 'preload 与页面共享全局上下文，页面脚本可篡改注入的桥接对象。',
  fix: '设为 true，只经 contextBridge 暴露最小 API。',
  exts: JS_EXTS,
});

const webSecurity = lineRule({
  id: 'electron-web-security-off',
  title: 'Electron 关闭 webSecurity',
  severity: 'high',
  cwe: 'CWE-346',
  re: /webSecurity\s*:\s*false/,
  why: '关闭 webSecurity 会让渲染进程绕过同源策略，页面脚本可读任意源响应。',
  fix: '开启 webSecurity；跨域需求走主进程代理并做白名单。',
  exts: JS_EXTS,
});

const insecureContent = lineRule({
  id: 'electron-insecure-content',
  title: 'Electron 允许不安全内容',
  severity: 'medium',
  cwe: 'CWE-319',
  re: /allowRunningInsecureContent\s*:\s*true/,
  why: 'HTTPS 页面可加载 HTTP 资源，等于放弃传输层保护。',
  fix: '关闭该选项，资源统一走 HTTPS。',
  exts: JS_EXTS,
});

const cspUnsafeEval = lineRule({
  id: 'csp-unsafe-eval',
  title: 'CSP 放行 unsafe-eval',
  severity: 'medium',
  cwe: 'CWE-693',
  re: /Content-Security-Policy[^\n]{0,200}unsafe-eval/i,
  why: 'unsafe-eval 让 CSP 对代码注入基本失效。',
  fix: '移除 unsafe-eval；必须动态执行时改用沙箱 iframe 或 Web Worker。',
});

export const BUILTIN_SAST_RULES: SastRule[] = [
  hardcodedSecret, privateKey, cloudCredential, highEntropy,
  sqlConcat, commandInjection, evalRule, unsafeDeserialize,
  innerHtml, dangerousHtml, pathTraversal,
  corsWildcard, disabledTls, weakHash, weakRandom, plainHttp,
  debugRoute, defaultCredential,
  nodeIntegration, contextIsolation, webSecurity, insecureContent, cspUnsafeEval,
];

export function rulesForExt(ext: string): SastRule[] {
  return BUILTIN_SAST_RULES.filter((r) => !r.exts || r.exts.includes(ext));
}
