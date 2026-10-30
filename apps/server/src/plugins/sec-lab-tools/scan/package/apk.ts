// APK / AAB 分析（P1）。
//
// ★ 零依赖优先：ZIP 用已有依赖 adm-zip；清单优先调本机 Android SDK 的 aapt2，
//   没有就降级为"只能确认清单存在、无法判定取值"并在结果里写明。
// ★ 全程不安装、不执行、不联网：只读 ZIP 条目与 dex 字符串池。
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Severity } from '../../../sec-lab-types.js';
import type { ScanFinding } from '../types.js';
import { fingerprintOf } from '../types.js';
import { readDexStrings } from './dex.js';

export interface ApkLimits {
  maxTotalBytes: number;
  maxDexBytes: number;
  maxEntries: number;
}

export const APK_LIMITS: ApkLimits = {
  maxTotalBytes: 800 * 1024 * 1024,
  maxDexBytes: 40 * 1024 * 1024,
  maxEntries: 40_000,
};

export interface ApkResult {
  findings: ScanFinding[];
  notes: string[];
  meta: Record<string, unknown>;
}

// ---------- SDK 工具探测 ----------

const toolCache = new Map<string, string | null>();

function sdkRoots(): string[] {
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : undefined,
    process.env.HOME ? path.join(process.env.HOME, 'Android', 'Sdk') : undefined,
  ].filter((x): x is string => !!x);
  return [...new Set(roots)];
}

/** 在 SDK build-tools 里找最新版本的可执行文件 */
export async function findSdkTool(name: string): Promise<string | null> {
  if (toolCache.has(name)) return toolCache.get(name)!;
  const win = process.platform === 'win32';
  const file = win ? `${name}.exe` : name;
  for (const root of sdkRoots()) {
    const bt = path.join(root, 'build-tools');
    const versions = await fs.readdir(bt).catch(() => [] as string[]);
    const sorted = versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of sorted) {
      const p = path.join(bt, v, file);
      const ok = await fs.stat(p).then((s) => s.isFile()).catch(() => false);
      if (ok) { toolCache.set(name, p); return p; }
    }
  }
  toolCache.set(name, null);
  return null;
}

function run(bin: string, args: string[], timeoutMs = 20_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { shell: false, windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.stdout.on('data', (d) => { out += String(d); });
    p.stderr.on('data', (d) => { err += String(d); });
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out, err: String(e) }); });
    p.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out, err }); });
  });
}

// ---------- 清单解析 ----------

interface ManifestInfo {
  packageName?: string;
  debuggable: boolean;
  allowBackup?: boolean;
  cleartext?: boolean;
  permissions: string[];
  components: Array<{ type: string; name?: string; exported: boolean; permission?: string }>;
  hasNetworkSecurityConfig: boolean;
  raw: string;
}

function truthyAttr(v: string): boolean {
  const s = v.trim();
  if (/^0x0+$/i.test(s)) return false;
  if (/0xffffffff/i.test(s)) return true;
  if (/^true$/i.test(s)) return true;
  return false;
}

function attrValue(line: string): string {
  const raw = /\(Raw: "([^"]*)"\)/.exec(line);
  if (raw) return raw[1];
  const eq = line.indexOf('=');
  return eq >= 0 ? line.slice(eq + 1).trim() : '';
}

function attrName(line: string): string {
  const eq = line.indexOf('=');
  const head = eq >= 0 ? line.slice(0, eq) : line;
  const colon = head.lastIndexOf(':');
  return (colon >= 0 ? head.slice(colon + 1) : head).replace(/\(0x[0-9a-f]+\)$/i, '').trim();
}

/** 解析 aapt2 dump xmltree 的文本输出 */
export function parseXmlTree(text: string): ManifestInfo {
  const info: ManifestInfo = {
    debuggable: false,
    permissions: [],
    components: [],
    hasNetworkSecurityConfig: false,
    raw: text,
  };
  const stack: Array<{ indent: number; name: string; attrs: Record<string, string> }> = [];
  const COMPONENTS = new Set(['activity', 'activity-alias', 'service', 'receiver', 'provider']);

  for (const line of text.split(/\r?\n/)) {
    const indent = line.length - line.trimStart().length;
    const t = line.trim();
    if (t.startsWith('E: ')) {
      const name = t.slice(3).split(/\s+/)[0];
      while (stack.length && stack[stack.length - 1].indent >= indent) {
        finish(stack.pop()!);
      }
      stack.push({ indent, name, attrs: {} });
      continue;
    }
    if (t.startsWith('A: ')) {
      const cur = stack[stack.length - 1];
      if (!cur) continue;
      const name = attrName(t.slice(3));
      cur.attrs[name] = attrValue(t);
    }
  }
  while (stack.length) finish(stack.pop()!);

  function finish(el: { name: string; attrs: Record<string, string> }): void {
    const a = el.attrs;
    if (el.name === 'manifest') {
      if (a.package) info.packageName = a.package;
    }
    if (el.name === 'application') {
      if ('debuggable' in a) info.debuggable = truthyAttr(a.debuggable);
      if ('allowBackup' in a) info.allowBackup = truthyAttr(a.allowBackup);
      if ('usesCleartextTraffic' in a) info.cleartext = truthyAttr(a.usesCleartextTraffic);
      if ('networkSecurityConfig' in a) info.hasNetworkSecurityConfig = a.networkSecurityConfig !== '';
    }
    if (COMPONENTS.has(el.name)) {
      info.components.push({
        type: el.name,
        name: a.name,
        exported: 'exported' in a ? truthyAttr(a.exported) : false,
        permission: a.permission,
      });
    }
    if (el.name === 'uses-permission' && a.name) info.permissions.push(a.name);
  }

  return info;
}

function parseBadging(text: string): { packageName?: string; debuggable: boolean; permissions: string[]; sdk?: string; targetSdk?: string } {
  const out = { debuggable: false, permissions: [] as string[], packageName: undefined as string | undefined, sdk: undefined as string | undefined, targetSdk: undefined as string | undefined };
  for (const line of text.split(/\r?\n/)) {
    const pkg = /^package: name='([^']+)'/.exec(line);
    if (pkg) out.packageName = pkg[1];
    if (/^application-debuggable/.test(line)) out.debuggable = true;
    const perm = /^uses-permission: name='([^']+)'/.exec(line);
    if (perm) out.permissions.push(perm[1]);
    const sdk = /^sdkVersion:'(\d+)'/.exec(line);
    if (sdk) out.sdk = sdk[1];
    const target = /^targetSdkVersion:'(\d+)'/.exec(line);
    if (target) out.targetSdk = target[1];
  }
  return out;
}

// ---------- DEX 线索 ----------

interface DexPattern {
  id: string;
  title: string;
  severity: Severity;
  re: RegExp;
  why: string;
  fix: string;
}

export const DEX_PATTERNS: DexPattern[] = [
  {
    id: 'apk-cloud-credential', title: '安装包内含云服务凭据', severity: 'critical',
    re: /\b(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36}|xox[abprs]-[A-Za-z0-9-]{10,})\b/,
    why: '密钥随安装包分发，任何人解包即可拿到并冒用。',
    fix: '密钥移到服务端；客户端只持有短期、受限的令牌。',
  },
  {
    id: 'apk-private-key', title: '安装包内含私钥块', severity: 'critical',
    re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    why: '私钥一旦打进客户端就不再是秘密。',
    fix: '立即轮换，私钥只保留在服务端或密钥服务。',
  },
  {
    id: 'apk-plain-http', title: '安装包内硬编码明文 HTTP 端点', severity: 'medium',
    re: /^http:\/\/(?!localhost|127\.0\.0\.1|10\.|192\.168\.)[a-z0-9.-]{4,}(:\d+)?/i,
    why: '明文端点可被中间人窃听或降级劫持。',
    fix: '改用 HTTPS；确需内网明文时配置 network-security-config 白名单。',
  },
  {
    id: 'apk-webview-bridge', title: 'WebView 暴露 JS 桥', severity: 'medium',
    re: /addJavascriptInterface/,
    why: '网页脚本可调用暴露的原生方法；页面一旦被注入即可越权。',
    fix: '只暴露最小接口、校验来源 URL，并避免在加载任意页面时启用。',
  },
  {
    id: 'apk-weak-crypto-mode', title: '使用 ECB 模式加密', severity: 'medium',
    re: /\bAES\/ECB\/|\bDES\/ECB\//,
    why: 'ECB 相同明文块产生相同密文，泄露数据结构。',
    fix: '改用 AES/GCM 或 CBC + 随机 IV。',
  },
  {
    id: 'apk-test-host', title: '安装包内含测试环境地址', severity: 'low',
    re: /^https?:\/\/[a-z0-9.-]*(test|dev|staging|debug)[a-z0-9.-]*\.[a-z]{2,}/i,
    why: '测试环境通常防护更弱，且暴露内部结构。',
    fix: '发布构建剔除测试配置，用构建变体隔离。',
  },
];

function scanDexStrings(strings: string[], fileLabel: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const seen = new Set<string>();
  for (const s of strings) {
    for (const p of DEX_PATTERNS) {
      if (!p.re.test(s)) continue;
      const key = `${p.id}|${s.slice(0, 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const location = `${fileLabel} · 字符串池`;
      findings.push({
        ruleId: p.id,
        title: p.title,
        severity: p.severity,
        detail: `${p.why}\n命中：${s.slice(0, 120)}`,
        remediation: p.fix,
        evidence: s.slice(0, 200),
        location,
        fingerprint: fingerprintOf(p.id, location, s.slice(0, 120)),
      });
      if (findings.length >= 120) return findings;
    }
  }
  return findings;
}

// ---------- 主流程 ----------

export async function analyzeApk(file: string, limits: ApkLimits = APK_LIMITS): Promise<ApkResult> {
  const findings: ScanFinding[] = [];
  const notes: string[] = [];
  const meta: Record<string, unknown> = { file };

  let zip: AdmZip;
  try {
    zip = new AdmZip(file);
  } catch (e) {
    throw new Error(`无法作为 ZIP 读取：${e instanceof Error ? e.message : String(e)}`);
  }
  const entries = zip.getEntries();
  if (entries.length > limits.maxEntries) throw new Error(`条目数 ${entries.length} 超过上限 ${limits.maxEntries}`);
  let total = 0;
  for (const e of entries) total += e.header.size || 0;
  if (total > limits.maxTotalBytes) throw new Error(`解压后总量 ${Math.round(total / 1048576)}MB 超过上限`);
  meta.entries = entries.length;
  meta.uncompressedBytes = total;

  const isAab = entries.some((e) => e.entryName.startsWith('base/manifest/'));
  const manifestEntryName = isAab ? 'base/manifest/AndroidManifest.xml' : 'AndroidManifest.xml';
  const manifestEntry = entries.find((e) => e.entryName === manifestEntryName);
  if (!manifestEntry) throw new Error(`不是有效的 APK/AAB：缺少 ${manifestEntryName}`);

  // 1) 清单
  const aapt2 = await findSdkTool('aapt2');
  let info: ManifestInfo | null = null;
  if (aapt2) {
    const badging = await run(aapt2, isAab ? ['dump', 'badging', file] : ['dump', 'badging', file]);
    if (badging.code === 0) {
      const b = parseBadging(badging.out);
      const tree = await run(aapt2, ['dump', 'xmltree', '--file', manifestEntryName, file]);
      const parsed = tree.code === 0 ? parseXmlTree(tree.out) : null;
      info = parsed || {
        debuggable: b.debuggable, permissions: b.permissions, components: [],
        hasNetworkSecurityConfig: false, raw: badging.out,
      };
      info.debuggable = info.debuggable || b.debuggable;
      info.packageName = info.packageName || b.packageName;
      if (!info.permissions.length) info.permissions = b.permissions;
      meta.packageName = info.packageName;
      meta.sdk = b.sdk;
      meta.targetSdk = b.targetSdk;
      notes.push('清单：aapt2 解析');
    } else {
      notes.push(`清单：aapt2 执行失败（${badging.err.slice(0, 120)}）`);
    }
  } else {
    notes.push('清单：未找到 aapt2，已降级（只能确认清单存在，无法判定属性取值）');
  }

  if (info) {
    const add = (ruleId: string, title: string, severity: Severity, detail: string, fix: string, location: string, evidence: string) => {
      findings.push({ ruleId, title, severity, detail, remediation: fix, evidence, location, fingerprint: fingerprintOf(ruleId, location, evidence) });
    };
    if (info.debuggable) {
      add('apk-debuggable', '发布包可调试（android:debuggable=true）', 'high',
        '可被调试器附加，读取内存与私有数据，甚至替换逻辑。', 'release 构建关闭 debuggable。',
        `${manifestEntryName} · application`, 'debuggable=true');
    }
    if (info.cleartext === true) {
      add('apk-cleartext', '允许明文流量（usesCleartextTraffic=true）', 'high',
        '应用可发起 HTTP 明文请求，可被中间人降级劫持。', '关闭明文流量，配置 network-security-config 白名单。',
        `${manifestEntryName} · application`, 'usesCleartextTraffic=true');
    } else if (info.cleartext === undefined && !info.hasNetworkSecurityConfig) {
      add('apk-cleartext-default', '未配置网络安全策略', 'low',
        'targetSdk ≥ 28 默认禁止明文；低于 28 时默认允许，需确认目标版本。', '显式配置 network-security-config，不依赖默认值。',
        `${manifestEntryName}`, 'no networkSecurityConfig');
    }
    if (info.allowBackup === true) {
      add('apk-allow-backup', '允许应用数据备份（allowBackup=true）', 'medium',
        '可经 adb backup 导出应用私有数据。', '设置 allowBackup=false，或提供自定义备份规则。',
        `${manifestEntryName} · application`, 'allowBackup=true');
    }
    for (const c of info.components) {
      if (!c.exported) continue;
      add('apk-exported-component', `导出组件无权限保护（${c.type}）`, 'high',
        `组件 ${c.name || '(未命名)'} 声明 exported=true${c.permission ? `，但仅靠 ${c.permission} 保护，需确认保护级别` : ' 且未声明 permission'}，任意应用可拉起。`,
        '改为 exported=false；确需对外时加 signature 级权限并校验调用方。',
        `${manifestEntryName} · ${c.type}${c.name ? ` ${c.name}` : ''}`, `exported=true${c.permission ? `, permission=${c.permission}` : ''}`);
    }
    if (info.permissions.length) {
      const dangerous = info.permissions.filter((p) => /SMS|LOCATION|CONTACTS|CAMERA|RECORD_AUDIO|READ_EXTERNAL|WRITE_EXTERNAL|SYSTEM_ALERT_WINDOW|READ_PHONE/.test(p));
      notes.push(`权限：共 ${info.permissions.length} 项，敏感 ${dangerous.length} 项`);
      meta.permissions = info.permissions;
    }
  }

  // 2) DEX
  const dexEntries = entries.filter((e) => /^classes\d*\.dex$/.test(e.entryName) || (isAab && /\.dex$/.test(e.entryName)));
  let dexStrings = 0;
  for (const e of dexEntries) {
    if (e.header.size > limits.maxDexBytes) { notes.push(`${e.entryName} 超过 ${Math.round(limits.maxDexBytes / 1048576)}MB，已跳过`); continue; }
    const buf = e.getData();
    if (buf.length > limits.maxDexBytes) continue;
    const { strings } = readDexStrings(buf);
    dexStrings += strings.length;
    findings.push(...scanDexStrings(strings, e.entryName));
  }
  notes.push(`DEX：${dexEntries.length} 个，${dexStrings} 条字符串`);
  meta.dexEntries = dexEntries.length;
  meta.dexStrings = dexStrings;

  // 3) assets 里的明文配置
  const assetEntries = entries.filter((e) =>
    /^assets\/.+\.(json|properties|xml|txt|js|env|yaml|yml)$/i.test(e.entryName) && (e.header.size || 0) < 512 * 1024);
  for (const e of assetEntries) {
    const text = e.getData().toString('utf8');
    for (const p of DEX_PATTERNS) {
      if (p.severity !== 'critical' && p.severity !== 'high') continue;
      if (!p.re.test(text)) continue;
      const location = `${e.entryName}`;
      findings.push({
        ruleId: `${p.id}-asset`, title: p.title, severity: p.severity,
        detail: p.why, remediation: p.fix, evidence: text.slice(0, 120),
        location, fingerprint: fingerprintOf(`${p.id}-asset`, location, text.slice(0, 80)),
      });
    }
  }
  if (assetEntries.length) notes.push(`assets：检查 ${assetEntries.length} 个明文配置`);

  // 4) 签名
  const apksigner = await findSdkTool('apksigner');
  const sigEntries = entries.filter((e) => /^META-INF\/.+\.(RSA|DSA|EC)$/i.test(e.entryName));
  if (apksigner) {
    const r = await run(apksigner, ['verify', '--print-certs', file], 30_000);
    const debugCert = /CN=Android Debug/i.test(r.out + r.err);
    if (r.code !== 0 && !sigEntries.length) {
      findings.push({
        ruleId: 'apk-unsigned', title: '安装包未签名或签名校验失败', severity: 'high',
        detail: 'apksigner 校验未通过，且 ZIP 中没有签名块。未签名包无法安全分发。',
        remediation: '使用正式签名密钥重新签名，并保留 v2/v3 签名。',
        evidence: (r.err || r.out).slice(0, 200),
        location: 'APK 签名', fingerprint: fingerprintOf('apk-unsigned', 'APK 签名', ''),
      });
    } else if (debugCert) {
      findings.push({
        ruleId: 'apk-debug-signature', title: '使用 debug 签名证书', severity: 'high',
        detail: 'debug 证书是公开的，任何人可签发同包名更新包，存在覆盖安装风险。',
        remediation: '发布包必须使用正式发布证书签名。',
        evidence: 'CN=Android Debug',
        location: 'APK 签名', fingerprint: fingerprintOf('apk-debug-signature', 'APK 签名', ''),
      });
    }
    notes.push(`签名：apksigner 校验${r.code === 0 ? '通过' : '失败'}${debugCert ? '（debug 证书）' : ''}`);
  } else if (sigEntries.length) {
    notes.push(`签名：检测到 v1 签名块 ${sigEntries.length} 个（未找到 apksigner，无法校验 v2/v3）`);
  } else {
    findings.push({
      ruleId: 'apk-no-signature', title: '未找到签名块', severity: 'high',
      detail: 'ZIP 中没有 META-INF 签名文件；APK 无法被系统正常安装。',
      remediation: '使用正式证书签名。',
      evidence: 'no META-INF/*.RSA|DSA|EC',
      location: 'APK 签名', fingerprint: fingerprintOf('apk-no-signature', 'APK 签名', ''),
    });
  }

  return { findings, notes, meta };
}
