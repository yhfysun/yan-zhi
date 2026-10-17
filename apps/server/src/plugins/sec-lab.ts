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
import type { BuiltInTool, McpCallResult, PlaybookDef, PluginContext, PluginManifest, PluginModule, PluginStorage } from '@yan-zhi/core';
import {
  DEFAULT_SEC_CONFIG, guard, normalizeTarget,
  type ScopeEntry, type SecConfig,
} from './sec-lab-guard.js';
import { renderOutput, sortFindings, type Finding, type ToolOutput } from './sec-lab-types.js';
import { pushPluginAudit } from '../services/plugin-audit.js';
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
// —— P1：侦察与 Web 纵深（2026-10-17）——
import { runEncode, runDecode, inspectJwt, identifyHash } from './sec-lab-tools/crypto.js';
import { runWhois, runCtlog, runOsint } from './sec-lab-tools/whois.js';
import { runSubdomain } from './sec-lab-tools/subdomain.js';
import { runCrawl, runJsEndpoint } from './sec-lab-tools/crawler.js';
import { runDirsearch, runWafDetect, runServiceScan, runUdpScan } from './sec-lab-tools/websurface.js';
import { runTargetState } from './sec-lab-tools/state.js';
import { runProxy } from './sec-lab-tools/proxy.js';

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
      // —— P1（2026-10-17）——
      'whois', 'ctlog', 'osint', 'subdomain',
      'crawl', 'js_endpoint', 'dirsearch', 'waf_detect',
      'service_scan', 'udp_scan',
      'crypto_encode', 'crypto_decode', 'jwt_inspect', 'hash_id',
      'target_state', 'proxy',
    ],
    // ★ 2026-10-16 去掉 sidebar 贡献：与顶栏**模式下拉**的「安全」是同一个入口（都进 /sec），
    //   属重复，用户拍板只保留模式下拉。routes 必须留着 —— 模式仍要靠它拿路由。
    routes: [
      { path: '/sec', name: 'sec', component: 'views/plugin/SecConsole.vue', meta: { desktopOnly: true } },
    ],
    // ── 命令中枢：18 个安全工具各声明一条命令（2026-10-16）────────────────────────
    // ★ 为什么声明在**插件**里而不是前端写死：这正是 `contributes.commands` 这个扩展点存在的理由
    //   —— 能力（工具）由插件拥有，命令就该跟着能力走，前端只负责"列出 + 分发"。
    //   （命令前的 `/` 由前端补；`params` 是**位置参数**的字段名，按顺序对应；
    //     没列进 params 的字段一律用长选项给，如 `--ports=80,443` / `--banner`。）
    // ★ `mode: 'sec'` ⇒ 只在安全模式的面板里出现（办公模式列出一堆扫描命令没有意义）。
    // ★ `danger` 只用于展示与"执行前二次确认"的判断；**真正的拦截在 sec-lab-guard**，
    //   命令层不新增任何绕过路径（方案 §九.2）：执行仍走 `POST /plugin/sec-lab/run`，
    //   与安全控制台的按钮**同一条链路、同一套护栏、同一份审计**。
    // ★ `danger` 的取值必须与护栏的推导**同口径**（`TOOL_RISK` 里没有的工具按默认 `active` 算，
    //   不是"被动"；`attack_sim` 是 HUMAN_ONLY 的 simulate）—— 标错会让面板显示的"被动"与
    //   服务端的判定打架。守门测试逐条比对，不靠人记得。
    commands: [
      // —— 授权边界（SYS）：一切扫描的前提，先登记后扫描 ——
      { name: 'scopes', aliases: ['scope_list'], desc: '列出已登记的授权目标', usage: '/scopes', group: 'SYS', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scope_list' },
      { name: 'scope_add', desc: '登记授权目标（必填授权人与证明材料）', usage: '/scope_add <type> <value> <authorizedBy> [--evidence=工单号] [--environment=internal]', group: 'SYS', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scope_add', params: ['type', 'value', 'authorizedBy'] },
      { name: 'scope_remove', desc: '移除授权目标', usage: '/scope_remove <id|value>', group: 'SYS', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scope_remove', params: ['id'] },
      // ★ toolchain 标 **P** 是照 `TOOL_RISK` 来的（工具级默认 passive）：它 run 外部工具时的
      //   侵入级二次检查（sqlmap/hydra）在**工具实现内部**做，不体现在工具级风险上。
      //   面板的显示必须与护栏同源 —— 觉得该升级就改 `TOOL_RISK`，而不是在这里标一个不一样的。
      { name: 'toolchain', desc: '外部工具链：detect 探测 / run 执行（nmap、nuclei、nikto…）', usage: '/toolchain <detect|run> [--tool=nmap] [--target=x]', group: 'SYS', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'toolchain', params: ['action'] },
      // —— 侦察与扫描 ——
      { name: 'recon', desc: '目标被动画像：DNS / TLS 证书 / HTTP 头 / 子域字典', usage: '/recon <target> [--actions=dns,tls,http,subdomain]', group: 'RECON', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'recon', params: ['target'] },
      { name: 'portscan', aliases: ['ps'], desc: 'TCP 端口扫描与服务识别（含高危端口暴露面）', usage: '/portscan <target> [--ports=common|80,443|1-1024|all] [--banner]', group: 'SCAN', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'portscan', params: ['target'] },
      { name: 'webprobe', aliases: ['wp'], desc: 'Web 面探测：敏感路径 / Cookie / CORS / 指纹', usage: '/webprobe <target> [--concurrency=8]', group: 'WEB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'webprobe', params: ['target'] },
      // —— 资产暴露面 ——
      { name: 'assets', aliases: ['asset_monitor'], desc: '资产台账：add / list / verify / snapshot / diff', usage: '/assets <action> [--value=x] [--assetId=id]', group: 'ASSET', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'asset_monitor', params: ['action'] },
      // —— 蓝队 ——
      { name: 'rules', aliases: ['detect_rules'], desc: '内置 Sigma/Suricata 规则：list / get / match', usage: '/rules <list|get|match> [--id=YZ-001] [--text=日志]', group: 'BLUE', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'detect_rules', params: ['action'] },
      { name: 'hunt', aliases: ['log_hunt'], desc: '日志狩猎：按内置规则 + IOC 扫日志文件', usage: '/hunt <日志绝对路径> [--iocs=1.2.3.4,evil.com]', group: 'BLUE', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'log_hunt', params: ['path'] },
      // —— 靶场与演练（lab 环境；攻击行为模拟**只允许人工执行**）——
      { name: 'env', aliases: ['host_env'], desc: '探测本机 Docker / Android SDK 可用性', usage: '/env', group: 'LAB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'host_env' },
      { name: 'ranges', aliases: ['range_list'], desc: '列出本模块部署的靶场容器', usage: '/ranges', group: 'LAB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'range_list' },
      { name: 'range_deploy', desc: '部署漏洞训练靶场（dvwa / juice-shop / webgoat / mutillidae）', usage: '/range_deploy <template> [--hostPort=8081]', group: 'LAB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'range_deploy', confirm: true, params: ['template'] },
      { name: 'range_stop', desc: '停止靶场容器', usage: '/range_stop <容器名>', group: 'LAB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'range_stop', confirm: true, params: ['name'] },
      { name: 'android_launch', desc: '启动 Android 模拟器（AVD）', usage: '/android_launch <avd>', group: 'LAB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'android_launch', confirm: true, params: ['avd'] },
      { name: 'attack', aliases: ['attack_sim'], desc: '靶场 ATT&CK 行为模拟（**仅人工执行**，lab 环境）', usage: '/attack <靶场目标> [--playbook=discovery-basic] [--planOnly]', group: 'LAB', mode: 'sec', danger: 'S', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'attack_sim', confirm: true, params: ['target'] },
      { name: 'sim_report', desc: '演练复盘报告', usage: '/sim_report', group: 'LAB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'sim_report' },
      // —— 报告 ——
      { name: 'report', aliases: ['sec_report'], desc: '按目标汇总发现项，出 Markdown/JSON 报告', usage: '/report [--target=x] [--format=markdown|json]', group: 'REPORT', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'sec_report' },

      // ── P1：侦察与 Web 纵深（2026-10-17）────────────────────────────────────
      // ★ danger 必须与 TOOL_RISK 同口径（守门测试逐条比对）：
      //   whois/ctlog/osint 是只读公网情报 → P；其余会主动发请求/查询 → A。
      { name: 'whois', desc: 'WHOIS 查询：注册商 / 到期时间 / NS / 状态', usage: '/whois <域名>', group: 'RECON', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'whois', params: ['domain'] },
      { name: 'ctlog', desc: '证书透明度日志（crt.sh）里的域名枚举', usage: '/ctlog <域名>', group: 'RECON', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'ctlog', params: ['domain'] },
      { name: 'osint', desc: 'OSINT 聚合：WHOIS + CT 日志 + DNS 记录', usage: '/osint <域名>', group: 'RECON', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'osint', params: ['domain'] },
      { name: 'subdomain', desc: '子域枚举（DNS 字典；命中测试/管理类会单独告警）', usage: '/subdomain <域名> [--wordlist=fast|full] [--concurrency=20]', group: 'RECON', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'subdomain', params: ['domain'] },
      { name: 'crawl', desc: '爬虫：抽同源链接 / 表单 / 带参数 URL', usage: '/crawl <url> [--depth=2] [--maxPages=20]', group: 'WEB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'crawl', params: ['target'] },
      { name: 'js_endpoint', aliases: ['js-endpoint'], desc: '从页面 JS 里抽接口路径', usage: '/js_endpoint <url>', group: 'WEB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'js_endpoint', params: ['target'] },
      { name: 'dirsearch', desc: '目录/文件爆破（含 .git / .env / 备份文件；对随机路径基线去噪）', usage: '/dirsearch <url> [--concurrency=8]', group: 'WEB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'dirsearch', params: ['target'] },
      { name: 'waf', desc: 'WAF / CDN 识别（只看响应特征，不发攻击载荷）', usage: '/waf <url>', group: 'WEB', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'waf_detect', params: ['target'] },
      { name: 'service', desc: '服务/版本 banner 抓取（指定端口）', usage: '/service <target> [--ports=common|80,443]', group: 'SCAN', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'service_scan', params: ['target'] },
      { name: 'udp', desc: 'UDP 探测（DNS / NTP / SSDP，标准查询包）', usage: '/udp <target> [--timeoutMs=1500]', group: 'SCAN', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'udp_scan', params: ['target'] },
      { name: 'encode', desc: '编码：base64 / base32 / base58 / hex / url / html / unicode / rot13 / caesar / morse', usage: '/encode <op> <data>', group: 'CRYPTO', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'crypto_encode', params: ['op', 'data'] },
      { name: 'decode', desc: '解码（与 /encode 同一套 10 种编码）', usage: '/decode <op> <data>', group: 'CRYPTO', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'crypto_decode', params: ['op', 'data'] },
      { name: 'jwt', desc: 'JWT 解析与风险信号（alg=none / 无 exp / 对称算法；不破解密钥）', usage: '/jwt <token>', group: 'CRYPTO', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'jwt_inspect', params: ['token'] },
      { name: 'hashid', desc: '哈希类型识别（按长度与字符集）', usage: '/hashid <hash>', group: 'CRYPTO', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'hash_id', params: ['hash'] },
      { name: 'proxy', desc: '本机抓包代理：start / stop / list / clear / replay（只转发已授权目标）', usage: '/proxy <start|stop|list|clear|replay> [--port=8899] [--id=记录id]', group: 'NET', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'proxy', params: ['action'] },
      { name: 'state', desc: '目标状态：list / diff / rollback（回滚的是**记录里的基线**，不改远端）', usage: '/state <list|diff|rollback> [--assetId=x] [--snapshotId=y]', group: 'ASSET', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'target_state', params: ['action'] },
    ],
    // ── 剧本（`@名字` 召唤的命令序列，2026-10-16）────────────────────────────────
    // ★ 定义就是"一串**已存在的命令**"（见 core 的 PlaybookDef）：剧本自己不执行任何东西，
    //   展开后走各自的命令通道（含各自的护栏与审计）。这样不必再发明第三种多步模型
    //   —— 本仓已有工作流引擎与 task_type 的 SOP 步骤。
    // ★ 步骤里的 `${target}` 由调用方替换（安全控制台用「执行」页填的 target）；
    //   替换不了的占位符**原样留着**，面板会明说"还有 N 步没填"——绝不拿空目标去扫。
    // ★ 与方案 §五 那份「首批 6 个」的差异：方案的「合规基线」（baseline→tls-audit→headers-audit）
    //   依赖 P3 才有的命令，这里**不提前声明不存在的命令**；换成同样成串、且今天就能跑的「靶场演练」。
    playbooks: [
      { id: 'recon-basic', name: '信息收集', group: 'SEC', mode: 'sec',
        desc: '目标画像 + 端口暴露面（被动画像 → 主动扫描）',
        steps: ['/recon ${target}', '/portscan ${target}'] },
      { id: 'web-audit', name: 'Web常规审计', group: 'SEC', mode: 'sec',
        desc: 'Web 面探测 → 外部模板引擎（装了 nuclei 才跑得动）→ 出报告',
        steps: ['/webprobe ${target}', '/toolchain run --tool=nuclei --target=${target}', '/report --target=${target}'] },
      { id: 'asset-review', name: '资产盘点', group: 'SEC', mode: 'sec',
        desc: '资产台账 → 快照 → 变更对比',
        steps: ['/assets list', '/assets snapshot --assetId=${assetId}', '/assets diff --assetId=${assetId}'] },
      { id: 'blue-review', name: '蓝队复盘', group: 'SEC', mode: 'sec',
        desc: '内置规则清单 → 日志狩猎',
        steps: ['/rules list', '/hunt ${logPath}'] },
      { id: 'lab-drill', name: '靶场演练', group: 'SEC', mode: 'sec',
        desc: '探测本机环境 → 列出靶场 → 跑一次 ATT&CK 行为模拟（仅 lab 环境、人工确认）',
        steps: ['/env', '/ranges', '/attack ${target} --playbook=discovery-basic'] },
      { id: 'full-assessment', name: '完整评估', group: 'SEC', mode: 'sec', confirmEach: true,
        desc: '全流程：画像 → 端口 → Web → 报告（**每一步都要确认**）',
        steps: ['/recon ${target}', '/portscan ${target}', '/webprobe ${target}', '/report --target=${target}'] },
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
const K_PLAYBOOKS = 'playbooks';
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

// ── 用户自定义剧本（`/playbook save`，2026-10-16）─────────────────────────────
// ★ 与 manifest 里 `contributes.playbooks` 的**内置**剧本并存，不覆盖：
//   内置的随代码发布（改不了），用户的存 plugin_storage（可增删）。
//   两者在 `PlaybookDef` 上是同一个类型、同一条展开/执行通道 —— 剧本自己不执行，
//   展开成命令行后仍走各自的护栏与审计，所以"谁定义的"不影响安全性。
const loadPlaybooks = () => loadList<PlaybookDef>(K_PLAYBOOKS);
/** 用户剧本上限：够用又不至于把面板撑爆；超出直接拒绝并说明，不静默丢弃 */
const USER_PLAYBOOK_MAX = 50;
const USER_PLAYBOOK_STEPS_MAX = 20;

async function loadConfig(): Promise<SecConfig> {
  if (!store) return DEFAULT_SEC_CONFIG;
  const v = await store.get<Partial<SecConfig>>(K_CONFIG);
  return { ...DEFAULT_SEC_CONFIG, ...(v || {}) };
}

async function pushAudit(e: AuditEntry): Promise<void> {
  // 裁剪 cap 沿用 AUDIT_MAX=500；load/push/slice/save 收口在 pushPluginAudit（P4）
  await pushPluginAudit(store, e, AUDIT_MAX);
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

// ---------- P1 工具工厂（2026-10-17） ----------

/** 无目标类工具的通用工厂：统一过 withGuard（含审计），schema 由参数给。 */
function plainTool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  run: (args: Record<string, unknown>) => Promise<ToolOutput>,
): BuiltInTool {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties, required },
    async execute(args) {
      return withGuard(name, args, () => run(args));
    },
  };
}

/** 以 `domain` 作为目标参数的 OSINT 工具共用（guard 认的是 args.target）。 */
function domainTool(
  name: string,
  description: string,
  run: (domain: string, args: Record<string, unknown>) => Promise<ToolOutput>,
  props: Record<string, unknown> = {},
): BuiltInTool {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties: { domain: { type: 'string', description: '域名' }, ...props }, required: ['domain'] },
    async execute(args) {
      const domain = normalizeTarget(String(args.domain || ''));
      return withGuard(name, { ...args, target: domain }, async () => run(domain, args));
    },
  };
}

function whoisTool(): BuiltInTool {
  return domainTool('whois', 'WHOIS 查询（注册商 / 到期 / NS / 状态）。只读公网情报，不向目标发探测包。目标必须已授权。', (d) => runWhois(d));
}

function ctlogTool(): BuiltInTool {
  return domainTool('ctlog', '证书透明度日志（crt.sh）里出现过的域名枚举。只读公开数据。', (d) => runCtlog(d));
}

function osintTool(): BuiltInTool {
  return domainTool('osint', 'OSINT 聚合：WHOIS + CT 日志 + DNS 记录，三路并行、单路失败不影响其它。', (d) => runOsint(d));
}

function subdomainTool(): BuiltInTool {
  return domainTool('subdomain', '子域枚举（DNS 字典，fast 40 词 / full 75 词）。命中测试/管理/数据库类子域会单独告警。', (d, a?: Record<string, unknown>) => runSubdomain({
    domain: d,
    wordlist: a?.wordlist === 'full' ? 'full' : 'fast',
    concurrency: typeof a?.concurrency === 'number' ? a.concurrency as number : undefined,
    timeoutMs: typeof a?.timeoutMs === 'number' ? a.timeoutMs as number : undefined,
  }), {
    wordlist: { type: 'string', enum: ['fast', 'full'], description: '字典档位，默认 fast' },
    concurrency: { type: 'number', description: '并发 DNS 查询数，默认 20' },
    timeoutMs: { type: 'number', description: '单次 DNS 超时（ms），默认 3000' },
  });
}

function crawlTool(): BuiltInTool {
  return {
    name: 'crawl',
    description: '爬虫：从起始页顺着**同源**链接走，抽出链接 / 表单（含字段名）/ 带参数 URL。跨域链接不跟（会跑出授权范围）。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '起始 URL 或域名' },
        depth: { type: 'number', description: '最大深度，默认 2（上限 4）' },
        maxPages: { type: 'number', description: '最多爬多少页，默认 20（上限 60）' },
        timeoutMs: { type: 'number', description: '单页超时（ms），默认 10000' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('crawl', args, async () => runCrawl({
        target: String(args.target), depth: Number(args.depth) || undefined,
        maxPages: Number(args.maxPages) || undefined, timeoutMs: Number(args.timeoutMs) || undefined,
      }));
    },
  };
}

function jsEndpointTool(): BuiltInTool {
  return {
    name: 'js_endpoint',
    description: '从页面引用的 JS（含内联脚本）里抽接口路径与外部地址——前端 bundle 常把全部 API 路径写死在里面。',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: '页面 URL' }, timeoutMs: { type: 'number', description: '单请求超时（ms），默认 10000' } },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('js_endpoint', args, async () => runJsEndpoint(String(args.target), Number(args.timeoutMs) || undefined));
    },
  };
}

function dirsearchTool(): BuiltInTool {
  return {
    name: 'dirsearch',
    description: '目录/文件爆破（40 条常见路径：admin / .git / .env / 备份 / actuator / swagger…）。用随机路径做基线，避免自定义 404 全误报。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目标 URL 或域名' },
        concurrency: { type: 'number', description: '并发，默认 8（上限 32）' },
        timeoutMs: { type: 'number', description: '单请求超时（ms），默认 8000' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('dirsearch', args, async () => runDirsearch({
        target: String(args.target), concurrency: Number(args.concurrency) || undefined, timeoutMs: Number(args.timeoutMs) || undefined,
      }));
    },
  };
}

function wafTool(): BuiltInTool {
  return {
    name: 'waf_detect',
    description: 'WAF / CDN 识别：看响应头、Cookie 与响应体特征。不发攻击载荷（避免触发封禁）。',
    inputSchema: { type: 'object', properties: { target: { type: 'string', description: '目标 URL' }, timeoutMs: { type: 'number' } }, required: ['target'] },
    async execute(args) {
      return withGuard('waf_detect', args, async () => runWafDetect(String(args.target), Number(args.timeoutMs) || undefined));
    },
  };
}

function serviceScanTool(): BuiltInTool {
  return {
    name: 'service_scan',
    description: '服务/版本 banner 抓取：对指定端口建立 TCP 连接（HTTP 端口发 HEAD）并读首行。不发送漏洞载荷。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目标域名或 IP' },
        ports: { type: 'string', description: '端口规格：common / 80,443 / 1-1024，默认 common' },
        timeoutMs: { type: 'number', description: '单端口超时（ms），默认 3000' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('service_scan', args, async () => runServiceScan({
        target: normalizeTarget(String(args.target)), ports: args.ports ? String(args.ports) : undefined,
        timeoutMs: Number(args.timeoutMs) || undefined,
      }));
    },
  };
}

function udpScanTool(): BuiltInTool {
  return {
    name: 'udp_scan',
    description: 'UDP 探测：向 53/123/1900 发标准查询包（DNS / NTP / SSDP），有回包即说明端口开放。无回包不等于关闭。',
    inputSchema: { type: 'object', properties: { target: { type: 'string' }, timeoutMs: { type: 'number', description: '等待回包时间（ms），默认 1500' } }, required: ['target'] },
    async execute(args) {
      return withGuard('udp_scan', args, async () => runUdpScan({
        target: normalizeTarget(String(args.target)), timeoutMs: Number(args.timeoutMs) || undefined,
      }));
    },
  };
}

function encodeTool(): BuiltInTool {
  return plainTool('crypto_encode', '编码：base64 / base32 / base58 / hex / url / html / unicode / rot13 / caesar / morse。零依赖纯函数。',
    { op: { type: 'string', description: '编码方式' }, data: { type: 'string', description: '要编码的文本' } },
    ['op', 'data'],
    async (a) => runEncode(String(a.op || ''), String(a.data ?? '')));
}

function decodeTool(): BuiltInTool {
  return plainTool('crypto_decode', '解码（与 crypto_encode 同一套 10 种编码；base64 同时接受 URL-safe）。',
    { op: { type: 'string', description: '解码方式' }, data: { type: 'string', description: '要解码的文本' } },
    ['op', 'data'],
    async (a) => runDecode(String(a.op || ''), String(a.data ?? '')));
}

function jwtTool(): BuiltInTool {
  return plainTool('jwt_inspect', 'JWT 解析与风险信号：alg=none / 缺 exp / 有效期过长 / 对称算法弱密钥风险。只解码判断，不破解密钥。',
    { token: { type: 'string', description: '完整 JWT' } },
    ['token'],
    async (a) => inspectJwt(String(a.token || '')));
}

function hashidTool(): BuiltInTool {
  return plainTool('hash_id', '哈希类型识别：按长度与字符集判断 MD5 / SHA1 / SHA256 / bcrypt / argon2 / crypt 等。',
    { hash: { type: 'string', description: '哈希字符串' } },
    ['hash'],
    async (a) => identifyHash(String(a.hash || '')));
}

function targetStateTool(): BuiltInTool {
  return plainTool('target_state', '目标状态：list 列快照与当前基线 / diff 与基线比对（复用 asset_monitor）/ rollback 把基线切到历史快照。**只改本地记录，不改远端目标**。',
    {
      action: { type: 'string', enum: ['list', 'diff', 'rollback'], description: '动作' },
      assetId: { type: 'string', description: '资产 id（/assets list 可见）' },
      value: { type: 'string', description: '资产值（也可用 assetId）' },
      snapshotId: { type: 'string', description: 'rollback 时指定快照 id，默认最新一份' },
    },
    ['action'],
    async (a) => runTargetState({
      action: String(a.action || 'list') as 'list' | 'diff' | 'rollback',
      assetId: a.assetId ? String(a.assetId) : undefined,
      value: a.value ? String(a.value) : undefined,
      snapshotId: a.snapshotId ? String(a.snapshotId) : undefined,
    }, {
      loadAssets, saveAssets: async (v) => { if (store) await store.set(K_ASSETS, v); },
      loadSnapshots, saveSnapshots: async (v) => { if (store) await store.set(K_SNAPSHOTS, v); },
    }));
}

function proxyTool(): BuiltInTool {
  return plainTool('proxy', '本机抓包代理：start 启动（127.0.0.1，默认 8899）/ stop / list 看记录 / clear 清空 / replay 重放。只转发已授权目标；HTTPS 只建隧道不解密。',
    {
      action: { type: 'string', enum: ['start', 'stop', 'list', 'clear', 'replay'], description: '动作' },
      port: { type: 'number', description: 'start 时监听端口，默认 8899' },
      id: { type: 'string', description: 'replay 时的记录 id' },
    },
    ['action'],
    async (a) => runProxy({
      action: String(a.action || 'list') as 'start' | 'stop' | 'list' | 'clear' | 'replay',
      port: typeof a.port === 'number' ? a.port : undefined,
      id: a.id ? String(a.id) : undefined,
    }, await loadScopes()));
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
        // —— P1（2026-10-17）——
        whois: { factory: whoisTool, opts: {}, passRunner: true },
        ctlog: { factory: ctlogTool, opts: {}, passRunner: true },
        osint: { factory: osintTool, opts: {}, passRunner: true },
        subdomain: { factory: subdomainTool, opts: {}, passRunner: true },
        crawl: { factory: crawlTool, opts: {}, passRunner: true },
        js_endpoint: { factory: jsEndpointTool, opts: {}, passRunner: true },
        dirsearch: { factory: dirsearchTool, opts: {}, passRunner: true },
        waf_detect: { factory: wafTool, opts: {}, passRunner: true },
        service_scan: { factory: serviceScanTool, opts: {}, passRunner: true },
        udp_scan: { factory: udpScanTool, opts: {}, passRunner: true },
        crypto_encode: { factory: encodeTool, opts: {}, passRunner: true },
        crypto_decode: { factory: decodeTool, opts: {}, passRunner: true },
        jwt_inspect: { factory: jwtTool, opts: {}, passRunner: true },
        hash_id: { factory: hashidTool, opts: {}, passRunner: true },
        target_state: { factory: targetStateTool, opts: {}, passRunner: true },
        proxy: { factory: proxyTool, opts: {}, passRunner: true },
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

    // ── 用户自定义剧本（`/playbook save|rm`，2026-10-16）──────────────────────
    // ★ 校验放**服务端**：剧本会被"展开成命令行再执行"，是执行链的上游输入，
    //   只靠前端拦不住。这里只做**形状**校验（id/name/steps 合法 + 步数与总量上限）——
    //   步骤里到底引用了哪条命令，留给运行时的命令解析去报错（那时会说清"没有 /xxx 这条命令"）。
    r.get('/playbooks', async (_req: unknown, res: unknown) => {
      json(res, { data: await loadPlaybooks() });
    });

    r.post('/playbooks', async (req: unknown, res: unknown) => {
      const b = bodyOf(req);
      const name = String(b.name || '').trim();
      const rawSteps = Array.isArray(b.steps) ? b.steps.map((s) => String(s).trim()).filter(Boolean) : [];
      if (!name) return fail(res, 400, '剧本名（name）必填');
      if (!rawSteps.length) return fail(res, 400, '剧本至少要有一个步骤（steps）');
      if (rawSteps.length > USER_PLAYBOOK_STEPS_MAX) {
        return fail(res, 400, `步骤最多 ${USER_PLAYBOOK_STEPS_MAX} 步，当前 ${rawSteps.length} 步`);
      }
      // 每步都必须是一条命令行（以 `/` 开头）。剧本的定义就是"一串命令"——
      // 放行裸文本等于给剧本开第二种执行形态，展开时只会得到一条看不懂的报错。
      const bad = rawSteps.find((s) => !s.startsWith('/'));
      if (bad) return fail(res, 400, `每个步骤都要是以 / 开头的命令，例如 /recon \${target}；收到：${bad.slice(0, 40)}`);
      const id = String(b.id || '').trim() || `user-${Date.now().toString(36)}`;
      const list = await loadPlaybooks();
      const idx = list.findIndex((p) => p.id === id);
      if (idx < 0 && list.length >= USER_PLAYBOOK_MAX) {
        return fail(res, 400, `自定义剧本已达上限 ${USER_PLAYBOOK_MAX} 条，请先删掉不再用的`);
      }
      const entry: PlaybookDef = {
        id, name, steps: rawSteps,
        desc: b.desc ? String(b.desc) : undefined,
        group: b.group ? String(b.group) : 'USER',
        mode: 'sec',
        confirmEach: b.confirmEach === true,
      };
      const next = idx >= 0 ? list.map((p, i) => (i === idx ? entry : p)) : [...list, entry];
      if (store) await store.set(K_PLAYBOOKS, next);
      await pushAudit({
        at: Date.now(), tool: 'playbook_save', ok: true,
        message: `${idx >= 0 ? '更新' : '保存'}剧本「${name}」（${rawSteps.length} 步）`,
      });
      json(res, { ok: true, data: entry });
    });

    r.post('/playbooks/remove', async (req: unknown, res: unknown) => {
      const b = bodyOf(req);
      const id = String(b.id || '').trim();
      const name = String(b.name || '').trim();
      const list = await loadPlaybooks();
      const next = list.filter((p) => (id ? p.id !== id : p.name !== name));
      if (next.length === list.length) return fail(res, 404, '未找到该剧本');
      if (store) await store.set(K_PLAYBOOKS, next);
      await pushAudit({ at: Date.now(), tool: 'playbook_remove', ok: true, message: `删除剧本（${id || name}）` });
      json(res, { ok: true });
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
      // —— P1（2026-10-17）——
      whoisTool(), ctlogTool(), osintTool(), subdomainTool(),
      crawlTool(), jsEndpointTool(), dirsearchTool(), wafTool(),
      serviceScanTool(), udpScanTool(),
      encodeTool(), decodeTool(), jwtTool(), hashidTool(),
      targetStateTool(), proxyTool(),
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
