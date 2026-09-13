// sec-lab 护栏（纯函数，可独立测试）
// 授权范围校验 / 风险分级 / 危险动作黑名单 / 规模上限 / 输出截断。
// 形态对齐 ops-shell-guard.ts（复用其破坏性命令黑名单），叠加安全域专属规则。
//
// 合规定位：本模块仅用于自有资产或持有书面授权目标的安全评估。
// 护栏不是"防君子"的装饰 —— 授权范围校验失败必须让整条执行链停在这里。
import { DANGEROUS_PATTERNS as OPS_DANGEROUS } from './ops-shell-guard.js';

/** 风险分级：passive=被动观测 / active=主动探测 / intrusive=侵入性（爆破·注入验证·横向） */
export type RiskLevel = 'passive' | 'active' | 'intrusive';

const RISK_ORDER: Record<RiskLevel, number> = { passive: 0, active: 1, intrusive: 2 };

/** 工具默认风险级（intrusive 级动作在 P1 随工具登记，默认一律拒绝） */
export const TOOL_RISK: Record<string, RiskLevel> = {
  scope_list: 'passive',
  scope_add: 'passive',
  scope_remove: 'passive',
  sec_report: 'passive',
  toolchain: 'passive',
  recon: 'passive',
  portscan: 'active',
  webprobe: 'active',
  // 靶场攻击行为模拟：分级为 intrusive，且仅 lab 环境 + 人工执行放行
  attack_sim: 'intrusive',
  // 蓝队：检测规则 / 日志狩猎（只读为主）
  detect_rules: 'passive',
  log_hunt: 'passive',
  // 自有资产暴露面监控
  asset_monitor: 'passive',
};

/** 动作分级：passive 被动观测 / active 主动探测 / intrusive 侵入 / simulate 攻击行为模拟 */
export type ActionClass = 'passive' | 'active' | 'intrusive' | 'simulate';

const CLASS_ORDER: Record<ActionClass, number> = { passive: 0, active: 1, intrusive: 2, simulate: 3 };

/** 工具 → 动作分级覆盖（默认由 TOOL_RISK 推导） */
export const TOOL_ACTION_CLASS: Partial<Record<string, ActionClass>> = {
  attack_sim: 'simulate',
};

/**
 * **仅允许人工执行**的工具：AI（大模型）不得自主编排执行。
 * 调用方必须显式声明 requester='human'（安全控制台人工点击），否则一律拒绝。
 * 这是硬约束：攻击模拟一旦由模型自主触发，就没人能为后果负责，也不满足"操作可追溯到具体的人"这一授权前提。
 */
export const HUMAN_ONLY_TOOLS = new Set(['attack_sim']);

/** 目标环境：lab=隔离靶场 / internal=内网 / production=生产 / public=公网（需归属已验证） */
export type Environment = 'lab' | 'internal' | 'production' | 'public';

/** 各环境允许的动作分级上限——公网只允许被动，攻击模拟只在靶场 */
export const ENV_MAX_CLASS: Record<Environment, ActionClass> = {
  lab: 'simulate',
  internal: 'active',
  production: 'active',
  public: 'passive',
};

/** 授权目标（交战范围条目） */
export interface ScopeEntry {
  id: string;
  /** domain=域名（含父域匹配）/ ip=单个 IPv4 / cidr=网段 */
  type: 'domain' | 'ip' | 'cidr';
  value: string;
  /** 授权人 / 授权来源 */
  authorizedBy: string;
  /** 授权证明材料（工单号、合同编号等） */
  evidence?: string;
  /** 授权有效期（epoch ms）；不填=长期 */
  expiresAt?: number;
  /** 该目标允许执行的最高风险级 */
  maxRisk: RiskLevel;
  /** 目标环境，默认 internal。lab=隔离靶场（唯一允许攻击行为模拟的环境） */
  environment?: Environment;
  /** 公网资产：归属是否已验证（仅已验证的自有资产才允许扫描） */
  ownershipVerified?: boolean;
  /** 归属证明材料（公网资产必填：备案号 / 证书主体 / 域名注册信息） */
  ownershipEvidence?: string;
  note?: string;
}

/** 插件配置（与 manifest.config 对齐） */
export interface SecConfig {
  /** 交战模式：开启后才允许 intrusive 级动作 */
  engagementMode: boolean;
  maxConcurrency: number;
  scanTimeoutMs: number;
  maxPortsPerScan: number;
  redactReport: boolean;
}

export const DEFAULT_SEC_CONFIG: SecConfig = {
  engagementMode: false,
  maxConcurrency: 200,
  scanTimeoutMs: 120000,
  maxPortsPerScan: 65535,
  redactReport: true,
};

// ---------- 目标解析 ----------

/** 是否 IPv4 字面量 */
export function isIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host.trim());
  if (!m) return false;
  return m.slice(1).every((p) => {
    const n = Number(p);
    return n >= 0 && n <= 255 && String(n) === p.replace(/^0(?=\d)/, '');
  });
}

function ipv4ToInt(ip: string): number | null {
  if (!isIPv4(ip)) return null;
  return ip
    .trim()
    .split('.')
    .reduce((acc, p) => acc * 256 + Number(p), 0);
}

/** CIDR 是否包含某 IP（仅 IPv4） */
export function cidrContains(cidr: string, ip: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const baseInt = ipv4ToInt(base);
  const ipInt = ipv4ToInt(ip);
  if (baseInt === null || ipInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (baseInt & mask) === (ipInt & mask);
}

/** 域名是否被授权条目覆盖（精确匹配或父域匹配） */
export function domainMatches(scopeValue: string, host: string): boolean {
  const a = scopeValue.trim().toLowerCase().replace(/\.$/, '');
  const b = host.trim().toLowerCase().replace(/\.$/, '');
  if (!a || !b) return false;
  return b === a || b.endsWith('.' + a);
}

/** 从 URL 或 host:port 中抽出主机名 */
export function normalizeTarget(raw: string): string {
  let t = (raw || '').trim();
  if (!t) return '';
  // 带协议 → 取 hostname
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      t = u.hostname || t;
    } catch {
      /* 解析失败走下面的兜底 */
    }
  }
  // 去端口（IPv4:port 形式；纯 IPv6 不处理，本项目扫描面以 IPv4/域名为主）
  if (isIPv4(t)) return t;
  const m = /^(.*):(\d+)$/.exec(t);
  if (m && isIPv4(m[1])) return m[1];
  if (m && !m[1].includes(':')) return m[1];
  return t;
}

/**
 * 目标授权校验：命中且未过期的条目中，取 maxRisk 最高的一条返回。
 * 未命中返回 null —— 调用方必须据此中止执行。
 */
export function inScope(rawTarget: string, scopes: ScopeEntry[], now = Date.now()): ScopeEntry | null {
  const target = normalizeTarget(rawTarget);
  if (!target) return null;
  const ip = isIPv4(target) ? target : null;
  let best: ScopeEntry | null = null;
  for (const s of scopes) {
    if (s.expiresAt && s.expiresAt < now) continue; // 授权过期
    let hit = false;
    if (s.type === 'ip') hit = target === s.value.trim();
    else if (s.type === 'cidr') hit = !!ip && cidrContains(s.value, ip);
    else hit = domainMatches(s.value, target);
    if (!hit) continue;
    if (!best || RISK_ORDER[s.maxRisk] > RISK_ORDER[best.maxRisk]) best = s;
  }
  return best;
}

/** 目标是否已授权（布尔快捷版） */
export function isAuthorized(rawTarget: string, scopes: ScopeEntry[], now = Date.now()): boolean {
  return inScope(rawTarget, scopes, now) !== null;
}

// ---------- 危险动作黑名单 ----------

/** 安全域专属危险规则（叠加在 ops-shell 破坏性规则之上） */
export const SEC_DANGEROUS_PATTERNS: RegExp[] = [
  // 高破坏性扫描脚本类：需显式授权，默认一律拒绝
  /\bnmap\b[^|;&\n]*--script\s+(dos|exploit|intrusive|fuzzer|brute)/i,
  // sqlmap 落地类动作（拿 shell / 写文件 / 改注册表 / 读文件）
  /\bsqlmap\b[^|;&\n]*--(os-shell|os-cmd|sql-shell|file-write|file-dest|reg-(read|add|del|write))/i,
  // 批量目标爆破（-M 指定目标列表）
  /\bhydra\b[^|;&\n]*\s-M\s/i,
  // 攻击框架与载荷生成
  /\b(msfconsole|msfvenom|meterpreter|setoolkit|beef-xss)\b/i,
  // DoS / 压力
  /\b(loic|hping3\s+--flood|slowloris|goldeneye|torshammer)\b/i,
  // 清日志 / 毁痕迹
  /\b(rm|shred|truncate)\b[^|;&\n]*\/(var|etc)\/(log|audit)\b/i,
  // 反弹 shell
  /bash\s+-i\s+>&\s*\/dev\/tcp\//i,
  // 远程下载即执行
  /\b(wget|curl)\b[^|;&\n]*\|\s*(ba|z|k)?sh\b/i,
  // 写 crontab / 后门驻留
  /\b(crontab|at)\b[^|;&\n]*\b(wget|curl|bash|sh|python)\b/i,
];

export const DANGEROUS_PATTERNS: RegExp[] = [...OPS_DANGEROUS, ...SEC_DANGEROUS_PATTERNS];

/** 命令是否命中危险黑名单 */
export function isDangerous(command: string): boolean {
  if (!command) return false;
  return DANGEROUS_PATTERNS.some((re) => re.test(command));
}

// ---------- 规模与参数护栏 ----------

/**
 * 解析端口规格："common" / "80,443" / "1-1024" / "1-1024,8080"
 * 返回排序去重后的端口数组；单项不合法直接抛错（不让脏参数溜进扫描器）。
 */
export function parsePorts(spec: string, maxPorts = DEFAULT_SEC_CONFIG.maxPortsPerScan): number[] {
  const s = (spec || 'common').trim();
  const preset: Record<string, number[]> = {
    common: [
      21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 465, 587, 993, 995,
      1433, 1521, 2049, 2181, 2375, 3306, 3389, 5432, 5672, 5900, 6379, 8080, 8443,
      8888, 9000, 9090, 9200, 9300, 11211, 27017,
    ],
    top100: Array.from({ length: 100 }, (_, i) => i + 1),
    all: Array.from({ length: 65535 }, (_, i) => i + 1),
  };
  let ports: number[];
  if (preset[s]) ports = [...preset[s]];
  else {
    ports = [];
    for (const part of s.split(',')) {
      const p = part.trim();
      if (!p) continue;
      const range = /^(\d+)-(\d+)$/.exec(p);
      if (range) {
        const a = Number(range[1]);
        const b = Number(range[2]);
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > 65535 || a > b) {
          throw new Error(`端口范围不合法: ${p}`);
        }
        for (let i = a; i <= b; i++) ports.push(i);
      } else {
        const n = Number(p);
        if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`端口不合法: ${p}`);
        ports.push(n);
      }
    }
  }
  const uniq = Array.from(new Set(ports)).sort((a, b) => a - b);
  if (uniq.length > maxPorts) {
    throw new Error(`端口数量 ${uniq.length} 超过上限 ${maxPorts}，请缩小范围`);
  }
  return uniq;
}

// ---------- 主校验入口 ----------

export interface GuardInput {
  /** 工具名（不含 plugin_ 前缀） */
  tool: string;
  /** 目标（域名 / IP / URL） */
  target?: string;
  /** 外部工具待执行命令（toolchain run 时提供） */
  command?: string;
  /** 授权范围清单 */
  scopes: ScopeEntry[];
  config: SecConfig;
  /** 侵入性动作的人工确认标记 */
  confirmed?: boolean;
  /** 端口规格（portscan 规模校验用） */
  ports?: string;
  /** 并发数 */
  concurrency?: number;
  /** 调用方：agent=大模型自主编排（默认，保守）；human=安全控制台人工执行 */
  requester?: 'agent' | 'human';
}

export type GuardResult = { ok: true; scope?: ScopeEntry } | { ok: false; reason: string };

/**
 * 护栏总校验。判定顺序：
 * 目标非空 → 范围命中 → 风险级 ≤ 目标 maxRisk → 侵入级需交战模式+确认 → 命令黑名单 → 规模上限
 */
export function guard(i: GuardInput): GuardResult {
  // 无需目标的工具（范围管理 / 报告 / 规则 / 狩猎 / 资产台账）直接放行，但仍过命令黑名单
  const NO_TARGET_TOOLS = ['scope_list', 'scope_add', 'scope_remove', 'sec_report', 'detect_rules', 'log_hunt', 'asset_monitor'];
  const needsTarget = !NO_TARGET_TOOLS.includes(i.tool);

  if (i.command) {
    if (isDangerous(i.command)) {
      return { ok: false, reason: `命令命中危险黑名单，已拒绝执行：${i.command.slice(0, 120)}` };
    }
  }

  if (needsTarget) {
    const target = normalizeTarget(i.target || '');
    if (!target) return { ok: false, reason: '缺少目标参数 target' };
    const scope = inScope(target, i.scopes);
    if (!scope) {
      return {
        ok: false,
        reason:
          `目标「${target}」不在授权范围内（或授权已过期）。` +
          `请先用 scope_add 登记授权目标（授权人 / 证明材料 / 有效期 / 允许的最高风险级）后再执行。` +
          `本模块仅用于自有资产或持有书面授权的目标。`,
      };
    }
    const toolRisk = TOOL_RISK[i.tool] || 'active';
    if (RISK_ORDER[toolRisk] > RISK_ORDER[scope.maxRisk]) {
      return {
        ok: false,
        reason: `目标「${target}」的授权仅允许 ${scope.maxRisk} 级动作，当前工具 ${i.tool} 为 ${toolRisk} 级。`,
      };
    }
    if (toolRisk === 'intrusive' && !i.config.engagementMode) {
      return {
        ok: false,
        reason: `${i.tool} 属于侵入性动作，需在插件配置中开启「交战模式」且本次调用带 confirmed=true。`,
      };
    }
    // 人工闸门：攻击模拟这类动作不得由 AI 自主编排执行
    if (HUMAN_ONLY_TOOLS.has(i.tool) && i.requester !== 'human') {
      return {
        ok: false,
        reason: `${i.tool} 属于人工执行动作，AI 不得自主编排。请在「安全」控制台由人工点击执行（该调用会带 requester='human'）。`,
      };
    }

    // 环境分级：动作分级不得超过环境上限（公网仅被动，攻击模拟只在靶场）
    const env: Environment = scope.environment || 'internal';
    const actionClass: ActionClass = TOOL_ACTION_CLASS[i.tool] || (toolRisk as ActionClass);
    const envMax = ENV_MAX_CLASS[env];
    if (CLASS_ORDER[actionClass] > CLASS_ORDER[envMax]) {
      return {
        ok: false,
        reason:
          `目标「${target}」环境为 ${env}，仅允许 ${envMax} 级动作，当前 ${i.tool} 属于 ${actionClass} 级。` +
          (actionClass === 'simulate' ? '攻击行为模拟只能在隔离靶场（environment=lab）中进行。' : ''),
      };
    }

    // 公网资产：必须先完成归属验证，只扫自己确认拥有的资产
    if (env === 'public' && !scope.ownershipVerified) {
      return {
        ok: false,
        reason: `目标「${target}」标记为公网资产但未完成归属验证，禁止扫描。请先用 asset_monitor 登记归属证据（备案号 / 证书主体 / 域名注册信息）并通过验证，只对自有资产动手。`,
      };
    }

    // 规模上限
    if (i.ports) {
      try {
        const n = parsePorts(i.ports, i.config.maxPortsPerScan).length;
        if (n > i.config.maxPortsPerScan) {
          return { ok: false, reason: `端口数 ${n} 超过配置上限 ${i.config.maxPortsPerScan}` };
        }
      } catch (e) {
        return { ok: false, reason: (e as Error).message };
      }
    }
    if (i.concurrency !== undefined && (i.concurrency < 1 || i.concurrency > i.config.maxConcurrency)) {
      return { ok: false, reason: `并发数 ${i.concurrency} 不在允许范围 1~${i.config.maxConcurrency}` };
    }
    return { ok: true, scope };
  }

  return { ok: true };
}

// ---------- 输出截断 ----------

export const MAX_OUTPUT = 16 * 1024;

/** 输出截断：超长掐头留尾并标注，避免扫描结果撑爆模型上下文 */
export function capOutput(text: string, max = MAX_OUTPUT): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const half = Math.floor(max / 2);
  return {
    text: `${text.slice(0, half)}\n\n...[输出过长，已截断 ${text.length - max} 字符]...\n\n${text.slice(-half)}`,
    truncated: true,
  };
}
