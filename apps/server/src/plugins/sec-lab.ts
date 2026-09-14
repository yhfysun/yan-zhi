// sec-lab 内置插件：安全测试工作台（Kali 式工具集 + 大模型编排）。
//
// 形态对齐 ops-shell：manifest + 工具 + 侧栏 + 路由 + 护栏 + 审计 + 专属智能体。
// 三种交互共用同一套工具与护栏：
//   1) 命令模式：控制台（/sec）手动执行，或后续 P1 的 /scan 等 slash 命令
//   2) 剧本召唤：后续 P1 的 @剧本（多步工具编排）
//   3) 对话模式：a_builtin_sec_agent 智能体自主编排（db.ts seed）
//
// 合规声明（重要）：本模块仅用于自有资产或持有书面授权目标的安全评估。
// 所有带目标的工具都会先过 sec-lab-guard 的授权范围校验，越界直接拒绝并记审计。
import { randomUUID } from 'node:crypto';
import type { BuiltInTool, McpCallResult, PluginContext, PluginManifest, PluginModule, PluginStorage } from '@yan-zhi/core';
import {
  DEFAULT_SEC_CONFIG, guard, normalizeTarget,
  type ScopeEntry, type SecConfig,
} from './sec-lab-guard.js';
import { renderOutput, sortFindings, type Finding, type ToolOutput } from './sec-lab-types.js';
import { runRecon } from './sec-lab-tools/recon.js';
import { runPortScan } from './sec-lab-tools/portscan.js';
import { runWebProbe } from './sec-lab-tools/webprobe.js';
import { detectAll, detectTool, runExternal, TOOLCHAIN, INTRUSIVE_TOOLS } from './sec-lab-tools/toolchain.js';
import { runAttackSim, renderSimReport, PLAYBOOKS, TECHNIQUES } from './sec-lab-tools/attacksim.js';
import { runDetectRules, runLogHunt, RULES } from './sec-lab-tools/blueteam.js';
import { runEasm, type Asset, type Snapshot } from './sec-lab-tools/easm.js';
import {
  runHostEnv, runRangeDeploy, runRangeList, runRangeStop, runAndroidLaunch, RANGE_TEMPLATES, probeHostEnv, listRanges,
} from './sec-lab-tools/hostenv.js';

export const SEC_LAB_ID = 'sec-lab';

export const secLabManifest: PluginManifest = {
  id: SEC_LAB_ID,
  name: '安全工作台',
  version: '0.1.0',
  category: '安全',
  description:
    '授权范围内的安全测试工作台：目标侦察、端口与服务识别、Web 漏洞探测、敏感路径审计、报告生成；检测到 nmap/nuclei/nikto 等外部工具时自动接管。三种用法：控制台手动执行、@剧本召唤（后续）、对话模式由安全助手自主编排。**仅限自有资产或持有书面授权的目标**，所有动作受授权范围与危险动作黑名单约束并全量审计。',
  permissions: ['shell', 'network'],
  contributes: {
    tools: [
      'scope_list', 'scope_add', 'scope_remove',
      'recon', 'portscan', 'webprobe', 'toolchain', 'sec_report',
      'attack_sim', 'detect_rules', 'log_hunt', 'asset_monitor', 'sim_report',
      'host_env', 'range_deploy', 'range_list', 'range_stop', 'android_launch',
    ],
    sidebar: [
      {
        id: 'sec',
        label: '安全',
        route: '/sec',
        icon: 'shield',
        moreGroup: 'sec',
        moreGroupLabel: '安全',
        desc: '侦察 · 扫描 · 审计',
        order: 11,
      },
    ],
    routes: [
      { path: '/sec', name: 'sec', component: 'views/plugin/SecConsole.vue', meta: { desktopOnly: true } },
    ],
  },
  config: {
    type: 'object',
    properties: {
      engagementMode: { type: 'boolean', description: '交战模式：开启后允许侵入性动作（爆破/注入验证），默认关闭', default: false },
      maxConcurrency: { type: 'number', description: '扫描并发上限', default: 200 },
      scanTimeoutMs: { type: 'number', description: '单次扫描超时（ms）', default: 120000 },
      maxPortsPerScan: { type: 'number', description: '单次扫描端口数上限', default: 65535 },
      redactReport: { type: 'boolean', description: '报告脱敏（IP 与凭据打码）', default: true },
    },
  },
};

// ---------- 存储 ----------

const K_SCOPES = 'scopes';
const K_FINDINGS = 'findings';
const K_AUDIT = 'audit';
const K_CONFIG = 'config';
const K_ASSETS = 'assets';
const K_SNAPSHOTS = 'snapshots';
const K_EXERCISES = 'exercises';
const AUDIT_MAX = 500;

let store: PluginStorage | null = null;

interface AuditEntry {
  at: number; tool: string; target?: string; risk?: string;
  ok: boolean; message: string; argsSummary?: string;
}

interface StoredFinding extends Finding {
  id: string; at: number; target: string; tool: string;
}

async function loadList<T>(key: string): Promise<T[]> {
  if (!store) return [];
  const v = await store.get<T[]>(key);
  return Array.isArray(v) ? v : [];
}

const loadScopes = () => loadList<ScopeEntry>(K_SCOPES);
const loadFindings = () => loadList<StoredFinding>(K_FINDINGS);
const loadAudit = () => loadList<AuditEntry>(K_AUDIT);
const loadAssets = () => loadList<Asset>(K_ASSETS);
const loadSnapshots = () => loadList<Snapshot>(K_SNAPSHOTS);

async function loadConfig(): Promise<SecConfig> {
  if (!store) return DEFAULT_SEC_CONFIG;
  const v = await store.get<Partial<SecConfig>>(K_CONFIG);
  return { ...DEFAULT_SEC_CONFIG, ...(v || {}) };
}

async function pushAudit(e: AuditEntry): Promise<void> {
  if (!store) return;
  const list = await loadAudit();
  list.push(e);
  await store.set(K_AUDIT, list.slice(-AUDIT_MAX));
}

async function pushFindings(target: string, tool: string, findings: Finding[]): Promise<void> {
  if (!store || !findings.length) return;
  const list = await loadFindings();
  for (const f of findings) {
    list.push({ ...f, id: randomUUID(), at: Date.now(), target, tool });
  }
  await store.set(K_FINDINGS, list.slice(-2000));
}

// ---------- 结果渲染 ----------

function okResult(o: ToolOutput): McpCallResult {
  return { content: [{ type: 'text', text: renderOutput(o) }] };
}

function errResult(msg: string): McpCallResult {
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

/** 目标是否 IPv4（用于报告脱敏与范围提示） */
function isIPv4(h: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
}

function redact(text: string, on: boolean): string {
  if (!on) return text;
  return text
    .replace(/(\d{1,3}\.\d{1,3})(\.\d{1,3}\.\d{1,3})/g, '$1.*.*')
    .replace(/((?:password|passwd|pwd|token|secret|api[_-]?key)\s*[=:]\s*)\S+/gi, '$1******');
}

// ---------- 工具实现 ----------

/** 工具工厂传给 withGuard 的元数据：当前只有 requester 区分；保留扩展位 */
interface RuntimeOpts { requester?: 'agent' | 'human' }

function scopeListTool(): BuiltInTool {
  return {
    name: 'scope_list',
    description: '列出当前已登记的授权目标（交战范围）：类型、值、授权人、有效期、允许的最高风险级、是否已过期。执行任何扫描前必须先调用它确认目标已授权。',
    inputSchema: { type: 'object', properties: {}, required: [] },
    async execute() {
      const scopes = await loadScopes();
      const now = Date.now();
      const rows = scopes.map((s) => ({
        ...s,
        expired: !!s.expiresAt && s.expiresAt < now,
        expiresInDays: s.expiresAt ? Math.floor((s.expiresAt - now) / 86400000) : null,
      }));
      const alive = rows.filter((r) => !r.expired);
      const text = rows.length
        ? `授权目标共 ${rows.length} 条（有效 ${alive.length} 条）：\n` +
          rows
            .map((r) => `- [${r.expired ? '已过期' : '有效'}] ${r.type}:${r.value} | 授权人 ${r.authorizedBy} | 最高风险 ${r.maxRisk}${r.expiresInDays !== null ? ` | 剩余 ${r.expiresInDays} 天` : ' | 长期'}${r.evidence ? ` | 凭据 ${r.evidence}` : ''}`)
            .join('\n')
        : '尚未登记任何授权目标。执行扫描前必须先用 scope_add 登记（本模块仅用于自有资产或已授权目标）。';
      return { content: [{ type: 'text', text }] };
    },
  };
}

function scopeAddTool(): BuiltInTool {
  return {
    name: 'scope_add',
    description:
      '登记一个授权目标（交战范围）。type: domain=域名（含子域）/ ip=单个 IPv4 / cidr=网段；maxRisk 指定该目标允许的最高风险级（passive/active/intrusive）；expiresAt 为授权到期时间（epoch ms）；authorizedBy 与 evidence 记录授权人与证明材料。登记后该目标才允许被扫描。',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['domain', 'ip', 'cidr'], description: '目标类型' },
        value: { type: 'string', description: '域名 / IP / CIDR，如 example.com、10.0.0.5、10.0.0.0/24' },
        authorizedBy: { type: 'string', description: '授权人（必填）' },
        evidence: { type: 'string', description: '授权证明材料：工单号 / 合同编号 / 授权邮件等' },
        expiresAt: { type: 'number', description: '授权到期时间（epoch ms），不填为长期' },
        maxRisk: { type: 'string', enum: ['passive', 'active', 'intrusive'], description: '允许的最高风险级，默认 active' },
        environment: { type: 'string', enum: ['lab', 'internal', 'production', 'public'], description: '目标环境，默认 internal；lab=隔离靶场（唯一允许攻击行为模拟的环境）' },
        ownershipEvidence: { type: 'string', description: '公网资产的归属证据（备案号 / 证书主体 / 域名注册信息）' },
        ownershipVerified: { type: 'boolean', description: '公网资产归属是否已验证（未验证禁止扫描）' },
        note: { type: 'string', description: '备注' },
      },
      required: ['type', 'value', 'authorizedBy'],
    },
    async execute(args) {
      const type = String(args.type || '') as ScopeEntry['type'];
      const value = normalizeTarget(String(args.value || ''));
      const authorizedBy = String(args.authorizedBy || '').trim();
      if (!type || !['domain', 'ip', 'cidr'].includes(type)) return errResult('type 必须是 domain / ip / cidr');
      if (!value) return errResult('value 不能为空');
      if (!authorizedBy) return errResult('authorizedBy（授权人）必填——本模块仅用于已授权目标');
      if (type === 'cidr' && !/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(value)) return errResult('CIDR 格式应为 10.0.0.0/24');
      if (type === 'ip' && !isIPv4(value)) return errResult('ip 类型需要合法 IPv4 地址');

      const scopes = await loadScopes();
      if (scopes.some((s) => s.type === type && s.value === value)) return errResult(`目标 ${type}:${value} 已在授权范围内`);

      const maxRisk = (String(args.maxRisk || 'active') as ScopeEntry['maxRisk']);
      const environment = (String(args.environment || 'internal') as ScopeEntry['environment']);
      const entry: ScopeEntry = {
        id: randomUUID(),
        type,
        value,
        authorizedBy,
        evidence: args.evidence ? String(args.evidence) : undefined,
        expiresAt: typeof args.expiresAt === 'number' ? args.expiresAt : undefined,
        maxRisk: ['passive', 'active', 'intrusive'].includes(maxRisk) ? maxRisk : 'active',
        environment,
        ownershipEvidence: args.ownershipEvidence ? String(args.ownershipEvidence) : undefined,
        ownershipVerified: args.ownershipVerified === true,
        note: args.note ? String(args.note) : undefined,
      };
      scopes.push(entry);
      if (store) await store.set(K_SCOPES, scopes);
      await pushAudit({ at: Date.now(), tool: 'scope_add', target: value, ok: true, message: `登记授权目标 ${type}:${value}` });
      const warn = environment === 'public' && !entry.ownershipVerified
        ? '　⚠️ 公网资产未验证归属，禁止扫描；请补录 evidence 后标记 ownershipVerified=true。'
        : '';
      return {
        content: [{
          type: 'text',
          text: `已登记授权目标：${type}:${value}（授权人 ${authorizedBy}，环境 ${environment}，最高风险 ${entry.maxRisk}${entry.expiresAt ? `，到期 ${new Date(entry.expiresAt).toLocaleString('zh-CN')}` : '，长期有效'}）。id=${entry.id}${warn}`,
        }],
      };
    },
  };
}

function scopeRemoveTool(): BuiltInTool {
  return {
    name: 'scope_remove',
    description: '移除一个授权目标（按 id 或 type+value）。移除后该目标立即不可扫描。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '目标 id（scope_list 可见）' },
        value: { type: 'string', description: '也可按值删除，如 example.com' },
      },
      required: [],
    },
    async execute(args) {
      const scopes = await loadScopes();
      const id = args.id ? String(args.id) : '';
      const value = args.value ? normalizeTarget(String(args.value)) : '';
      if (!id && !value) return errResult('需要 id 或 value');
      const next = scopes.filter((s) => (id ? s.id !== id : s.value !== value));
      if (next.length === scopes.length) return errResult('未找到匹配的授权目标');
      if (store) await store.set(K_SCOPES, next);
      await pushAudit({ at: Date.now(), tool: 'scope_remove', target: value || id, ok: true, message: '移除授权目标' });
      return { content: [{ type: 'text', text: '已移除授权目标。' }] };
    },
  };
}

/** 统一的带护栏执行包装：过 guard → 跑工具 → 存 findings → 记审计 */
async function withGuard<T extends { target?: string }>(
  tool: string,
  args: Record<string, unknown>,
  run: (cfg: SecConfig) => Promise<ToolOutput>,
  opts?: RuntimeOpts,
): Promise<McpCallResult> {
  const cfg = await loadConfig();
  const scopes = await loadScopes();
  const g = guard({
    tool,
    target: args.target ? String(args.target) : (args.value ? String(args.value) : undefined),
    command: args.command ? String(args.command) : undefined,
    ports: args.ports ? String(args.ports) : undefined,
    concurrency: typeof args.concurrency === 'number' ? args.concurrency : undefined,
    scopes,
    config: cfg,
    confirmed: args.confirmed === true,
    // 控制台（/run 路由）注入的秘密前缀：仅以此开头的值才被视为受信任的人工身份。
    // AI 不通过 /run 路由调用，且 schema 不暴露该字段，物理上不会撞前缀。
    requester: opts?.requester || (typeof args.__sec_runner === 'string' && args.__sec_runner.startsWith('sec-runner-')
      ? (args.__sec_runner.slice('sec-runner-'.length) as 'agent' | 'human')
      : 'agent'),
  });
  if (!g.ok) {
    await pushAudit({ at: Date.now(), tool, target: args.target ? String(args.target) : undefined, ok: false, message: g.reason });
    return errResult(g.reason);
  }
  try {
    const out = await run(cfg);
    await pushFindings(out.target, tool, out.findings);
    await pushAudit({
      at: Date.now(), tool, target: out.target, risk: out.risk, ok: true,
      message: out.summary, argsSummary: JSON.stringify(args).slice(0, 300),
    });
    return okResult(out);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await pushAudit({ at: Date.now(), tool, target: args.target ? String(args.target) : undefined, ok: false, message: msg });
    return errResult(msg);
  }
}

function reconTool(): BuiltInTool {
  return {
    name: 'recon',
    description:
      '目标被动画像（零依赖，passive 级）：DNS 全记录、TLS 证书链与有效期审计、HTTP 安全响应头与指纹、常见子域发现。不发送任何探测载荷。目标必须已登记在授权范围内。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目标域名或 IP（必须已授权）' },
        actions: { type: 'array', items: { type: 'string', enum: ['dns', 'tls', 'http', 'subdomain'] }, description: '指定子模块，默认全跑' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('recon', args, async (cfg) =>
        runRecon({
          target: normalizeTarget(String(args.target)),
          timeoutMs: cfg.scanTimeoutMs,
          actions: Array.isArray(args.actions) ? args.actions.map(String) : undefined,
        }),
      );
    },
  };
}

function portscanTool(): BuiltInTool {
  return {
    name: 'portscan',
    description:
      'TCP 端口扫描与服务识别（零依赖，active 级）：并发连接探测、banner 抓取、高危端口暴露面判定（Redis/Mongo/ES/Docker API/数据库等）。ports 支持 "common"（默认）/"80,443"/"1-1024"/"all"。目标必须已授权。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目标域名或 IP（必须已授权）' },
        ports: { type: 'string', description: '端口规格：common / 80,443 / 1-1024 / all，默认 common' },
        concurrency: { type: 'number', description: '并发数，默认 100' },
        banner: { type: 'boolean', description: '是否抓取 banner，默认 true' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('portscan', args, async (cfg) =>
        runPortScan({
          target: normalizeTarget(String(args.target)),
          ports: String(args.ports || 'common'),
          concurrency: Math.min(Number(args.concurrency) || 100, cfg.maxConcurrency),
          timeoutMs: cfg.scanTimeoutMs,
          banner: args.banner !== false,
        }),
      );
    },
  };
}

function webprobeTool(): BuiltInTool {
  return {
    name: 'webprobe',
    description:
      'Web 面安全探测（零依赖，active 级）：敏感路径与备份文件探测、Cookie 安全标志审计、CORS 配置检测、组件指纹识别（Shiro/ThinkPHP/Jenkins/Tomcat 等）与已知风险提示。目标必须已授权。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目标域名或 IP（必须已授权）' },
        concurrency: { type: 'number', description: '并发请求数，默认 8' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('webprobe', args, async (cfg) =>
        runWebProbe({
          target: normalizeTarget(String(args.target)),
          timeoutMs: cfg.scanTimeoutMs,
          concurrency: Math.min(Number(args.concurrency) || 8, 32),
        }),
      );
    },
  };
}

function toolchainTool(): BuiltInTool {
  return {
    name: 'toolchain',
    description:
      '外部安全工具链（B 轨）：action=detect 探测本机可用的 nmap/nuclei/nikto/whatweb/ffuf/sqlmap/hydra/masscan 并给出安装建议；action=run 在白名单与护栏内执行外部工具（参数数组化，禁 shell 元字符）。未安装时不影响功能——A 轨自研工具（recon/portscan/webprobe）始终可用。侵入级工具（sqlmap/hydra）需交战模式 + confirmed。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['detect', 'run'], description: 'detect=探测工具链；run=执行外部工具' },
        tool: { type: 'string', description: 'run 时的工具名（白名单内）' },
        target: { type: 'string', description: 'run 时的目标（必须已授权）' },
        ports: { type: 'string', description: 'run 时的端口规格（nmap/masscan）' },
      },
      required: ['action'],
    },
    async execute(args) {
      const action = String(args.action || 'detect');
      if (action === 'detect') {
        const list = await detectAll();
        const ok = list.filter((x) => x.available);
        const miss = list.filter((x) => !x.available);
        const text = [
          `本机可用外部工具 ${ok.length}/${list.length}：`,
          ...ok.map((x) => `- ✅ ${x.name}（${x.path}）—— ${x.capability}`),
          miss.length ? '' : '',
          ...(miss.length ? ['未安装（不影响使用，A 轨自研能力已覆盖基础场景）：', ...miss.map((x) => `- ⬜ ${x.name} —— ${x.capability}｜安装：${x.install}`)] : []),
        ].join('\n');
        return { content: [{ type: 'text', text }] };
      }

      const tool = String(args.tool || '');
      if (!TOOLCHAIN[tool]) return errResult(`工具 ${tool} 不在白名单内，可用：${Object.keys(TOOLCHAIN).join(', ')}`);
      const cfg = await loadConfig();
      if (INTRUSIVE_TOOLS.has(tool) && (!cfg.engagementMode || args.confirmed !== true)) {
        return errResult(`${tool} 属于侵入性工具，需在插件配置中开启「交战模式」且本次调用带 confirmed=true`);
      }
      return withGuard('toolchain', { ...args, command: `${tool} ${String(args.target || '')}` }, async (c) => {
        const detected = await detectTool(TOOLCHAIN[tool]);
        if (!detected.available) {
          return {
            tool: 'toolchain',
            target: String(args.target || ''),
            risk: 'passive',
            summary: `未检测到 ${tool}，已跳过。建议：${detected.install}。当前可改用 A 轨自研工具（recon / portscan / webprobe）。`,
            findings: [{ title: `${tool} 未安装`, severity: 'info', detail: detected.install }],
          } satisfies ToolOutput;
        }
        return runExternal({
          tool,
          target: normalizeTarget(String(args.target)),
          ports: args.ports ? String(args.ports) : undefined,
          timeoutMs: c.scanTimeoutMs,
        }, detected.path!);
      });
    },
  };
}

function secReportTool(): BuiltInTool {
  return {
    name: 'sec_report',
    description:
      '汇总历史发现项生成安全评估报告（Markdown）。可按 target 过滤；开启 redactReport 时会对 IP 与凭据脱敏。报告按严重度降序排列，含修复建议。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '按目标过滤（可选）' },
        format: { type: 'string', enum: ['markdown', 'json'], description: '输出格式，默认 markdown' },
      },
      required: [],
    },
    async execute(args) {
      const cfg = await loadConfig();
      const all = await loadFindings();
      const target = args.target ? normalizeTarget(String(args.target)) : '';
      const list = target ? all.filter((f) => f.target === target) : all;
      if (!list.length) {
        return { content: [{ type: 'text', text: target ? `目标 ${target} 暂无发现项。` : '暂无任何发现项，先跑 recon / portscan / webprobe。' }] };
      }
      const sorted = sortFindings(list);
      if (String(args.format || 'markdown') === 'json') {
        return { content: [{ type: 'text', text: JSON.stringify(sorted.map((f) => ({ ...f, detail: redact(f.detail, cfg.redactReport) })), null, 2) }] };
      }
      const SEV: Record<string, string> = { critical: '🔴 严重', high: '🟠 高', medium: '🟡 中', low: '🔵 低', info: '⚪ 信息' };
      const groups = new Map<string, typeof sorted>();
      for (const f of sorted) {
        if (!groups.has(f.severity)) groups.set(f.severity, []);
        groups.get(f.severity)!.push(f);
      }
      const counts = [...groups.entries()].map(([k, v]) => `${SEV[k] || k} ${v.length}`).join(' / ');
      const lines: string[] = [];
      lines.push(`# 安全评估报告${target ? ` — ${redact(target, cfg.redactReport)}` : ''}`);
      lines.push('');
      lines.push(`生成时间：${new Date().toLocaleString('zh-CN')}`);
      lines.push(`发现项总数：${sorted.length}（${counts}）`);
      lines.push('');
      lines.push('> 本报告由 yan-zhi 安全工作台生成，仅针对已登记授权的目标。');
      lines.push('');
      for (const [sev, items] of groups) {
        lines.push(`## ${SEV[sev] || sev}（${items.length}）`);
        lines.push('');
        for (const f of items) {
          lines.push(`### ${f.title}`);
          lines.push(`- 目标：${redact(f.target, cfg.redactReport)}`);
          lines.push(`- 来源工具：${f.tool}　时间：${new Date(f.at).toLocaleString('zh-CN')}`);
          lines.push(`- 详情：${redact(f.detail, cfg.redactReport)}`);
          if (f.remediation) lines.push(`- 修复建议：${f.remediation}`);
          lines.push('');
        }
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    },
  };
}

// ---------- 靶场攻击行为模拟（仅 lab 环境 + 人工执行） ----------

function attackSimTool(): BuiltInTool {
  return {
    name: 'attack_sim',
    description:
      '**人工执行**的靶场攻击行为模拟（BAS）：在隔离靶场（scope 的 environment=lab）上复现 ATT&CK 行为，验证检测链路是否可见。' +
      '只用系统自带只读命令（whoami/tasklist/netstat 等）复现攻击者动作，' +
      '**不生成任何恶意载荷、不做免杀、不建立 C2**。' +
      'AI 不得自主执行本工具——需人工在「安全」控制台点击执行（会带 requester=human）；' +
      'planOnly=true 时只生成演练计划（命令清单 + 预期遥测 + 检测建议），AI 可调用。' +
      '可用剧本：' + PLAYBOOKS.map((p) => `${p.id}(${p.name})`).join(', '),
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '靶场目标（必须已登记且 environment=lab）' },
        playbook: { type: 'string', description: '剧本 id，如 discovery-basic / full-discovery / exec-and-evasion' },
        techniques: { type: 'array', items: { type: 'string' }, description: '指定 ATT&CK 技术编号，如 ["T1082","T1057"]' },
        planOnly: { type: 'boolean', description: 'true=只出计划不执行（AI 可调用）' },
        operator: { type: 'string', description: '操作人（留痕追溯用，人工执行必填）' },
        confirmed: { type: 'boolean', description: '侵入性动作确认' },
      },
      required: ['target'],
    },
    async execute(args) {
      const planOnly = args.planOnly === true;
      return withGuard(
        'attack_sim',
        args,
        async (cfg) => {
          const out = await runAttackSim({
            target: normalizeTarget(String(args.target)),
            playbook: args.playbook ? String(args.playbook) : undefined,
            techniques: Array.isArray(args.techniques) ? args.techniques.map(String) : undefined,
            planOnly,
            timeoutMs: cfg.scanTimeoutMs,
            operator: String(args.operator || 'unknown'),
          });
          // 演练留痕：复盘与合规追溯用
          if (!planOnly && store) {
            const list = await loadList<unknown>(K_EXERCISES);
            list.push({
              id: randomUUID(), at: Date.now(), target: out.target,
              operator: String(args.operator || 'unknown'),
              playbook: args.playbook ? String(args.playbook) : null,
              techniques: Array.isArray(args.techniques) ? args.techniques : null,
              summary: out.summary,
            });
            await store.set(K_EXERCISES, list.slice(-200));
          }
          return out;
        },
        // planOnly 只生成计划（不产生任何动作），AI 可调用；真正执行时必须人工点击（带 requester=human）
        { requester: planOnly ? 'agent' : 'human' },
      );
    },
  };
}

/** 演练复盘报告（从最近一次演练记录渲染） */
function simReportTool(): BuiltInTool {
  return {
    name: 'sim_report',
    description: '输出靶场演练复盘报告（Markdown）：技术覆盖、执行结果、预期遥测与检测建议。可选按 target 过滤。',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: '按目标过滤（可选）' } },
      required: [],
    },
    async execute(args) {
      const list = await loadList<{ at: number; target: string; operator: string; summary: string }>(K_EXERCISES);
      const target = args.target ? normalizeTarget(String(args.target)) : '';
      const rows = target ? list.filter((x) => x.target === target) : list;
      if (!rows.length) return { content: [{ type: 'text', text: '暂无演练记录，先在控制台跑一次 attack_sim。' }] };
      const last = rows[rows.length - 1];
      return {
        content: [{
          type: 'text',
          text: `# 靶场演练记录\n\n共 ${rows.length} 次演练，最近一次：${new Date(last.at).toLocaleString('zh-CN')}（操作人 ${last.operator}，目标 ${last.target}）\n\n${last.summary}\n\n` +
            rows.slice(-20).map((r) => `- ${new Date(r.at).toLocaleString('zh-CN')} | ${r.target} | ${r.operator} | ${r.summary}`).join('\n') +
            `\n\n> 演练仅使用系统只读命令复现攻击者行为，未投放恶意程序、未做免杀、未建立 C2。`,
        }],
      };
    },
  };
}

// ---------- 蓝队：检测规则与日志狩猎 ----------

function detectRulesTool(): BuiltInTool {
  return {
    name: 'detect_rules',
    description:
      '内置检测规则库（Sigma 主机侧 + Suricata 网络侧，共 ' + RULES.length + ' 条）：action=list 列出规则，' +
      'action=get 取单条并导出可直接使用的 Sigma YAML / Suricata 规则文本，' +
      'action=match 在给定日志文本上跑规则找命中。覆盖可疑 PowerShell、计划任务持久化、LSASS 凭据访问、临时目录执行、日志清理、' +
      'C2 beacon 心跳、DNS 隧道、扫描器 UA、明文凭据传输等。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'match'], description: 'list / get / match' },
        id: { type: 'string', description: 'get 时的规则 id，如 YZ-001' },
        text: { type: 'string', description: 'match 时的日志文本' },
        kind: { type: 'string', enum: ['sigma', 'suricata'], description: 'list 时按类型过滤' },
      },
      required: ['action'],
    },
    async execute(args) {
      try {
        return okResult(runDetectRules({
          action: String(args.action || 'list') as 'list' | 'get' | 'match',
          id: args.id ? String(args.id) : undefined,
          text: args.text ? String(args.text) : undefined,
          kind: args.kind ? (String(args.kind) as 'sigma' | 'suricata') : undefined,
        }));
      } catch (e) {
        return errResult((e as Error).message);
      }
    },
  };
}

function logHuntTool(): BuiltInTool {
  return {
    name: 'log_hunt',
    description: '日志狩猎：读取指定日志文件，跑内置检测规则 + 自定义 IOC 关键词，输出命中摘要与上下文。只读，不修改任何文件。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '日志文件绝对路径' },
        iocs: { type: 'array', items: { type: 'string' }, description: '额外 IOC 关键词（IP / 域名 / 哈希 / 特征串）' },
        maxBytes: { type: 'number', description: '最大读取字节数，默认 8MB' },
      },
      required: ['path'],
    },
    async execute(args) {
      try {
        return okResult(await runLogHunt({
          path: String(args.path || ''),
          iocs: Array.isArray(args.iocs) ? args.iocs.map(String) : undefined,
          maxBytes: typeof args.maxBytes === 'number' ? args.maxBytes : undefined,
        }));
      } catch (e) {
        return errResult((e as Error).message);
      }
    },
  };
}

// ---------- 自有资产暴露面监控（EASM） ----------

function assetMonitorTool(): BuiltInTool {
  return {
    name: 'asset_monitor',
    description:
      '自有资产暴露面监控：add 登记资产（公网资产必填归属证据）/ list 列出 / verify 归属验证 / snapshot 打快照（recon+portscan）/ diff 与上一份快照比对暴露面变化。' +
      '**只扫确认归属自己的资产**：公网资产必须先登记证据并 verify，未验证一律拒绝；不做公网随机目标批量扫描。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'verify', 'snapshot', 'diff'], description: '动作' },
        value: { type: 'string', description: '资产值（域名 / IP / CIDR）' },
        type: { type: 'string', enum: ['domain', 'ip', 'cidr'], description: '资产类型' },
        owner: { type: 'string', description: '归属团队或负责人' },
        evidence: { type: 'string', description: '归属证据（备案号 / 证书主体 / 域名注册信息），公网资产必填' },
        environment: { type: 'string', enum: ['public', 'internal', 'lab'], description: '环境，默认 internal' },
        assetId: { type: 'string', description: '资产 id（verify/snapshot/diff 用）' },
        note: { type: 'string', description: '备注' },
      },
      required: ['action'],
    },
    async execute(args) {
      try {
        return okResult(await runEasm({
          action: String(args.action || 'list') as 'add' | 'list' | 'verify' | 'snapshot' | 'diff',
          value: args.value ? String(args.value) : undefined,
          type: args.type ? (String(args.type) as 'domain' | 'ip' | 'cidr') : undefined,
          owner: args.owner ? String(args.owner) : undefined,
          evidence: args.evidence ? String(args.evidence) : undefined,
          environment: args.environment ? (String(args.environment) as 'public' | 'internal' | 'lab') : undefined,
          assetId: args.assetId ? String(args.assetId) : undefined,
          note: args.note ? String(args.note) : undefined,
        }, {
          loadAssets,
          saveAssets: async (a) => { if (store) await store.set(K_ASSETS, a); },
          loadSnapshots,
          saveSnapshots: async (s) => { if (store) await store.set(K_SNAPSHOTS, s); },
        }));
      } catch (e) {
        return errResult((e as Error).message);
      }
    },
  };
}

// ---------- 宿主机环境 + 靶场 + 安卓虚拟化（本地基础设施，非对外扫描） ----------

function hostEnvTool(): BuiltInTool {
  return {
    name: 'host_env',
    description:
      '探测本机安全实验室基础设施：Docker 守护进程/版本/compose、Android SDK（adb/emulator/AVD 列表/运行中的模拟器）。只读探测，不发起任何外部流量。靶场部署与移动端测试的前提检查。',
    inputSchema: { type: 'object', properties: {}, required: [] },
    async execute(args) {
      return withGuard('host_env', args, async () => runHostEnv());
    },
  };
}

function rangeDeployTool(): BuiltInTool {
  return {
    name: 'range_deploy',
    description:
      '在**本机 Docker** 上部署一个靶场容器（仅白名单内的已知漏洞训练镜像：dvwa / juice-shop / webgoat / mutillidae）。容器统一打 label=yan-zhi-range，便于列举与清理。需 confirmed=true 人工确认；拒绝任意白名单外镜像。',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: '靶场模板 id：dvwa / juice-shop / webgoat / mutillidae' },
        hostPort: { type: 'number', description: '映射到宿主机的端口（默认按模板）' },
        confirmed: { type: 'boolean', description: '必须为 true 才真正部署' },
      },
      required: ['template'],
    },
    async execute(args) {
      return withGuard('range_deploy', args, async () =>
        runRangeDeploy({ template: String(args.template || ''), hostPort: typeof args.hostPort === 'number' ? args.hostPort : undefined, confirmed: args.confirmed === true }),
      );
    },
  };
}

function rangeListTool(): BuiltInTool {
  return {
    name: 'range_list',
    description: '列举本模块起的所有运行中靶场容器（label=yan-zhi-range）：名称、镜像、访问端口、状态。',
    inputSchema: { type: 'object', properties: {}, required: [] },
    async execute(args) {
      return withGuard('range_list', args, async () => runRangeList());
    },
  };
}

function rangeStopTool(): BuiltInTool {
  return {
    name: 'range_stop',
    description: '停止并移除一个靶场容器（仅本模块起的、label=yan-zhi-range 的容器，防误删）。需 confirmed=true。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '容器名（range_list 可见，形如 yz-range-dvwa-8081）' },
        confirmed: { type: 'boolean', description: '必须为 true 才真正停止' },
      },
      required: ['name'],
    },
    async execute(args) {
      return withGuard('range_stop', args, async () =>
        runRangeStop({ name: String(args.name || ''), confirmed: args.confirmed === true }),
      );
    },
  };
}

function androidLaunchTool(): BuiltInTool {
  return {
    name: 'android_launch',
    description:
      '在本地启动一个 Android 虚拟设备（AVD）用于移动端安全测试。需 confirmed=true。仅本机 emulator，不触碰任何外部目标。',
    inputSchema: {
      type: 'object',
      properties: {
        avd: { type: 'string', description: 'AVD 名称（host_env 探测得到的列表）' },
        confirmed: { type: 'boolean', description: '必须为 true 才真正启动' },
      },
      required: ['avd'],
    },
    async execute(args) {
      return withGuard('android_launch', args, async () =>
        runAndroidLaunch({ avd: String(args.avd || ''), confirmed: args.confirmed === true }),
      );
    },
  };
}

// ---------- 后端路由（控制台页面用） ----------

function registerRoutes(ctx: PluginContext) {
  ctx.registerBackendRoute((app: unknown) => {
    const r = app as {
      get: (p: string, h: (...a: unknown[]) => void) => void;
      post: (p: string, h: (...a: unknown[]) => void) => void;
      delete: (p: string, h: (...a: unknown[]) => void) => void;
    };
    const json = (res: unknown, data: unknown) => (res as { json: (d: unknown) => void }).json(data);
    const fail = (res: unknown, code: number, msg: string) =>
      (res as { status: (n: number) => { json: (d: unknown) => void } }).status(code).json({ error: msg });
    const bodyOf = (req: unknown) => ((req as { body?: Record<string, unknown> }).body || {});

    r.get('/scopes', async (_req: unknown, res: unknown) => {
      const scopes = await loadScopes();
      const now = Date.now();
      json(res, { data: scopes.map((s) => ({ ...s, expired: !!s.expiresAt && s.expiresAt < now })) });
    });

    r.post('/scopes', async (req: unknown, res: unknown) => {
      const out = await scopeAddTool().execute(bodyOf(req));
      const text = out.content?.[0]?.text || '';
      if (out.isError) return fail(res, 400, text);
      json(res, { ok: true, message: text });
    });

    // 删除走 POST：部分客户端 DELETE 不带 body，前端统一用 POST /scopes/remove
    r.post('/scopes/remove', async (req: unknown, res: unknown) => {
      const out = await scopeRemoveTool().execute(bodyOf(req));
      const text = out.content?.[0]?.text || '';
      if (out.isError) return fail(res, 400, text);
      json(res, { ok: true, message: text });
    });

    // 手动执行工具（控制台用）：与对话模式走同一套护栏
    r.post('/run', async (req: unknown, res: unknown) => {
      const body = bodyOf(req);
      const tool = String(body.tool || '');
      const map: Record<string, { factory: () => BuiltInTool; opts: RuntimeOpts; passRunner: boolean }> = {
        recon: { factory: reconTool, opts: {}, passRunner: true },
        portscan: { factory: portscanTool, opts: {}, passRunner: true },
        webprobe: { factory: webprobeTool, opts: {}, passRunner: true },
        toolchain: { factory: toolchainTool, opts: {}, passRunner: true },
        sec_report: { factory: secReportTool, opts: {}, passRunner: true },
        scope_list: { factory: scopeListTool, opts: {}, passRunner: false },
        scope_add: { factory: scopeAddTool, opts: {}, passRunner: false },
        scope_remove: { factory: scopeRemoveTool, opts: {}, passRunner: false },
        attack_sim: { factory: attackSimTool, opts: { requester: 'human' }, passRunner: true },
        sim_report: { factory: simReportTool, opts: { requester: 'human' }, passRunner: true },
        detect_rules: { factory: detectRulesTool, opts: { requester: 'human' }, passRunner: true },
        log_hunt: { factory: logHuntTool, opts: { requester: 'human' }, passRunner: true },
        asset_monitor: { factory: assetMonitorTool, opts: { requester: 'human' }, passRunner: true },
        host_env: { factory: hostEnvTool, opts: { requester: 'human' }, passRunner: true },
        range_deploy: { factory: rangeDeployTool, opts: { requester: 'human' }, passRunner: true },
        range_list: { factory: rangeListTool, opts: { requester: 'human' }, passRunner: true },
        range_stop: { factory: rangeStopTool, opts: { requester: 'human' }, passRunner: true },
        android_launch: { factory: androidLaunchTool, opts: { requester: 'human' }, passRunner: true },
      };
      const entry = map[tool];
      if (!entry) return fail(res, 400, `未知工具 ${tool}`);
      const userArgs = (body.args as Record<string, unknown>) || {};
      // 透传一个 secret 前缀标识到 args 让 withGuard 强制 requester=human；
      // AI 走 ToolRegistry 不会走这条路，且 schema 不暴露该字段，物理上不会被偷。
      const args: Record<string, unknown> = entry.passRunner ? { ...userArgs, __sec_runner: `sec-runner-${entry.opts.requester || 'agent'}` } : userArgs;
      const out = await entry.factory().execute(args);
      json(res, { ok: !out.isError, text: out.content?.[0]?.text || '' });
    });

    r.get('/toolchain', async (_req: unknown, res: unknown) => {
      json(res, { data: await detectAll() });
    });

    r.get('/findings', async (_req: unknown, res: unknown) => {
      const cfg = await loadConfig();
      const list = sortFindings(await loadFindings());
      json(res, { data: cfg.redactReport ? list.map((f) => ({ ...f, detail: redact(f.detail, true) })) : list });
    });

    r.get('/audit', async (_req: unknown, res: unknown) => {
      json(res, { data: (await loadAudit()).slice(-100).reverse() });
    });

    r.get('/config', async (_req: unknown, res: unknown) => {
      json(res, { data: await loadConfig() });
    });

    // 主机环境探测（Docker / Android）
    r.get('/hostenv', async (_req: unknown, res: unknown) => {
      json(res, { data: await probeHostEnv() });
    });

    // 靶场模板白名单
    r.get('/ranges', async (_req: unknown, res: unknown) => {
      json(res, { data: RANGE_TEMPLATES });
    });

    // 运行中的靶场容器（label=yan-zhi-range）
    r.get('/ranges/instances', async (_req: unknown, res: unknown) => {
      json(res, { data: await listRanges() });
    });

    r.post('/config', async (req: unknown, res: unknown) => {
      const patch = bodyOf(req) as Partial<SecConfig>;
      const next = { ...(await loadConfig()), ...patch };
      if (store) await store.set(K_CONFIG, next);
      json(res, { data: next });
    });
  });
}

// ---------- 插件入口 ----------

export const secLabModule: PluginModule = {
  async activate(ctx: PluginContext) {
    store = ctx.storage;
    for (const t of [
      scopeListTool(), scopeAddTool(), scopeRemoveTool(),
      reconTool(), portscanTool(), webprobeTool(), toolchainTool(), secReportTool(),
      attackSimTool(), simReportTool(), detectRulesTool(), logHuntTool(), assetMonitorTool(),
      hostEnvTool(), rangeDeployTool(), rangeListTool(), rangeStopTool(), androidLaunchTool(),
    ]) {
      ctx.registerTool(t);
    }
    registerRoutes(ctx);
    ctx.log('[sec-lab] 已启用：仅限自有资产或已授权目标，所有动作受授权范围与黑名单约束');
  },
  async deactivate() {
    store = null;
  },
};
