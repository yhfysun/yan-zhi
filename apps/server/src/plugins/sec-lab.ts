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
import { secModeAgentDefs, secModeScene } from './sec-lab/seed.js';
import { applyBuiltinSeed } from '../host-bridge.js';
import type { BuiltInTool, McpCallResult, PlaybookDef, PluginContext, PluginManifest, PluginModule, PluginStorage } from '@yan-zhi/core';
import {
  DEFAULT_SEC_CONFIG, guard, normalizeTarget, isTrustedHumanCall, markTrustedHumanCall,
  type ScopeEntry, type SecConfig,
} from './sec-lab-guard.js';
import { renderOutput, sortFindings, type Finding, type ToolOutput } from './sec-lab-types.js';
// ★ 宿主能力走宿主桥（mode-pluginization P3）。
import { pushPluginAudit } from '../host-bridge.js';
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
// —— P2：POC / 情报 / 带外 / 验证（2026-10-17）——
import { runPocScan, runTemplates } from './sec-lab-tools/templates.js';
import { lookupCve, searchExploit } from './sec-lab-tools/intel.js';
import { runOast } from './sec-lab-tools/oast.js';
import { verifySqli, verifyXss, verifySsrf, updateFindingStatus } from './sec-lab-tools/verify.js';
// —— P3：基线与巡检（2026-10-17）——
import { runBaseline, runTlsAudit, runHeadersAudit } from './sec-lab-tools/baseline.js';
// 本机主机基线（2026-10-18）：补 baseline.ts 明确不覆盖的"主机侧"（账号策略/SMB/RDP/防火墙/SSH），只读
import { runHostBaseline } from './sec-lab-tools/hostbaseline.js';
import { runWatch, stopAllWatchers } from './sec-lab-tools/watch.js';
import { runBrute } from './sec-lab-tools/brute.js';
import { runAttackMap } from './sec-lab-tools/attackmap.js';
import { runSkill, runWarstory, runCheatsheet } from './sec-lab-tools/knowledge.js';
import { runSast } from './sec-lab-tools/sast.js';
// 密钥脱敏（2026-10-30）：历史发现项里可能存着修复前入库的凭据原文，读的时候必须再脱一次
import { maskSecrets } from './sec-lab-tools/scan/redact.js';
// —— P1：扫描编排（2026-10-30）——
import { runScan, acceptBaseline, type ScanStore, type ScanBaseline } from './sec-lab-tools/scan/orchestrator.js';
import { createSourceScanner } from './sec-lab-tools/scan/source/engine.js';
import { createUrlScanner } from './sec-lab-tools/scan/url/engine.js';
import { createPackageScanner } from './sec-lab-tools/scan/package/engine.js';
import { jobToOutput, SEVERITY_ORDER, type ScanJob, type ScanKind } from './sec-lab-tools/scan/types.js';
import { discoverSelfAssets, matchSelfAsset } from './sec-lab-tools/scan/self/assets.js';
// —— P5：经验库（自学习，2026-10-17）——
import {
  addExperience, approvedEntries, decideExperience, experienceCounts, oneLine, sanitizeText,
  type Decision, type ExperienceEntry,
} from './sec-lab-tools/expstore.js';
// —— 逐条审批门（ExecutionGate，2026-10-17）——
import {
  decideApproval, pendingApprovalMessage, pruneApprovals, rejectedApprovalMessage,
  requiresExecutionApproval, resolveApprovalGate,
  type ExecutionApproval,
} from './sec-lab-tools/approvals.js';

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
    // ★ 模式运行时化（P3）：模式定义随插件声明，前端动态合并
    mode: {
      key: 'sec', label: '安全模式', icon: 'Lock', route: '/sec',
      desktopOnly: true, fallbackAgent: 'a_builtin_sec_agent',
    },
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
      // —— P2（2026-10-17）——
      'poc_scan', 'poc_templates', 'cve_intel', 'exploit_search', 'oast',
      'verify_sqli', 'verify_xss', 'verify_ssrf', 'finding_status',
      // —— P3（2026-10-17）——
      'baseline_scan', 'tls_audit', 'headers_audit', 'watch', 'brute', 'attack_map',
      // —— P3.1 主机侧基线（2026-10-18）——
      'host_baseline',
      // —— P4（2026-10-17）——
      'sec_skill', 'warstory', 'cheatsheet', 'sast',
      // —— P5（2026-10-17）——
      'sec_experience', 'experience_review',
      // —— P1 扫描编排（2026-10-30）——
      'scan_source', 'scan_url', 'scan_package', 'scan_self',
      'scan_status', 'scan_report', 'scan_baseline', 'self_assets',
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

      // ── P2：POC / 情报 / 带外 / 验证（2026-10-17）──────────────────────────
      { name: 'nuclei', desc: '模板化只读 POC 扫描（7 个内置模板：.git/.env/目录遍历/actuator/phpinfo/安全头/swagger）', usage: '/nuclei <url> [-t tags] [--severities=high,critical]', group: 'POC', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'poc_scan', params: ['target'] },
      { name: 'templates', desc: '模板库：list / show / run <id>', usage: '/templates <list|show|run> [--id=git-config-exposure] [target]', group: 'POC', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'poc_templates', params: ['action'] },
      { name: 'cve', desc: 'CVE 本地情报（CVSS / CISA KEV；EPSS 每日变化，不硬编码请现查）', usage: '/cve <CVE-id|产品关键词>', group: 'INTEL', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'cve_intel', params: ['keyword'] },
      { name: 'sploit', desc: '利用线索（只给是否 KEV，不提供利用代码）', usage: '/sploit <产品关键词>', group: 'INTEL', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'exploit_search', params: ['keyword'] },
      { name: 'oob', desc: '带外回调服务：start / stop / hits / clear（盲注·SSRF 的确认手段）', usage: '/oob <start|stop|hits|clear> [--port=8898]', group: 'VERIFY', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'oast', params: ['action'] },
      { name: 'sqli', desc: 'SQL 注入验证（错误特征 + 布尔差分；侵入级，需交战模式）', usage: '/sqli <带参数URL>', group: 'VERIFY', mode: 'sec', danger: 'I', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'verify_sqli', confirm: true, params: ['target'] },
      { name: 'xss', desc: '反射型 XSS 验证（只看是否原样反射，不执行脚本）', usage: '/xss <带参数URL>', group: 'VERIFY', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'verify_xss', params: ['target'] },
      { name: 'ssrf', desc: 'SSRF 验证（借 /oob 回调确认；需先 /oob start；侵入级）', usage: '/ssrf <带参数URL>', group: 'VERIFY', mode: 'sec', danger: 'I', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'verify_ssrf', confirm: true, params: ['target'] },
      { name: 'finding', aliases: ['verify'], desc: '发现项状态机：open / verified / fixed / accepted / fp', usage: '/finding <id> [status=verified]', group: 'REPORT', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'finding_status', params: ['id', 'status'] },

      // ── P3：基线与巡检（2026-10-17）────────────────────────────────────────
      { name: 'baseline', desc: '配置基线核查：响应头 + TLS + Cookie，按 owasp/cis/等保 出分（仅可远程核查子集）', usage: '/baseline <url> [--profile=owasp|cis|djbh]', group: 'AUDIT', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'baseline_scan', params: ['target'] },
      { name: 'host-baseline', aliases: ['host_baseline'], desc: '本机主机基线（只读）：账号策略 / SMBv1 / RDP / UAC / Defender / 防火墙 / SSH / 审计服务，补远程核查不到的主机侧', usage: '/host-baseline', group: 'AUDIT', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'host_baseline' },
      { name: 'tls-audit', aliases: ['tls_audit'], desc: 'TLS 审计：协议版本 / 加密套件 / 证书有效期与主体', usage: '/tls-audit <host[:port]>', group: 'AUDIT', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'tls_audit', params: ['target'] },
      { name: 'headers-audit', aliases: ['headers_audit'], desc: 'HTTP 安全响应头审计（HSTS/CSP/XFO/nosniff/Referrer/Permissions）', usage: '/headers-audit <url>', group: 'AUDIT', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'headers_audit', params: ['target'] },
      { name: 'watch', desc: '定时巡检：start / stop / list / tick（进程内定时器，重启需重开）', usage: '/watch <start|stop|list|tick> [--target=x] [--intervalMin=30]', group: 'ASSET', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'watch', params: ['action'] },
      { name: 'brute', desc: 'HTTP Basic 默认口令自查（8 组公开默认口令；SSH/FTP 请走 hydra）', usage: '/brute <http> <url>', group: 'VERIFY', mode: 'sec', danger: 'I', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'brute', confirm: true, params: ['protocol', 'target'] },
      { name: 'attack-map', aliases: ['attack_map'], desc: 'ATT&CK 映射：把当前发现项映射到技术，给出已覆盖/未覆盖（启发式）', usage: '/attack-map', group: 'INTEL', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'attack_map' },

      // ── P4：知识库与源码审计（2026-10-17）──────────────────────────────────
      { name: 'skill', desc: '安全技能参考：list 列全部 / load <name> 看正文（方法论，不是可执行 skill）', usage: '/skill <list|load> [name]', group: 'KB', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'sec_skill', params: ['action', 'name'] },
      { name: 'warstory', desc: '战例库：真实缺陷的排查路径与教训', usage: '/warstory [关键词]', group: 'KB', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'warstory', params: ['topic'] },
      { name: 'cheatsheet', desc: '速查表：nmap / curl / jwt / sqlmap / ffuf', usage: '/cheatsheet [关键词]', group: 'KB', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'cheatsheet', params: ['topic'] },
      { name: 'code-scan', aliases: ['codescan'], desc: '本地源码安全扫描（L1 正则 + L2 结构式，10 条规则；只读不改文件）', usage: '/code-scan <目录> [--maxFiles=800]', group: 'SCAN', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'sast', params: ['root'] },
      // —— P1：统一扫描（2026-10-30）——
      // ★ 四个入口按输入类型拆开：源码/制品是本地只读（passive），URL 必须已授权（active），
      //   自有资产由服务端判定（不接受 self 声明）。风险标签与 guard 的 TOOL_RISK 保持同口径。
      { name: 'scan-source', aliases: ['srcscan'], desc: '源码扫描作业：规则包 + 依赖快照 + Electron 配置，支持基线抑制', usage: '/scan-source <目录> [--profile=quick|standard|deep]', group: 'SCAN', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scan_source', params: ['target'] },
      { name: 'scan-url', aliases: ['urlscan'], desc: 'URL 扫描作业：画像 + 安全头 + TLS + 基线 + 模板 POC（按剖面编排）', usage: '/scan-url <url> [--profile=quick|standard|deep|api]', group: 'SCAN', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scan_url', params: ['target'] },
      { name: 'scan-package', aliases: ['apkscan'], desc: '安装包扫描：APK/AAB 清单 · DEX 字符串 · 签名；asar / ZIP', usage: '/scan-package <文件> [--profile=quick|standard|deep]', group: 'SCAN', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scan_package', params: ['target'] },
      { name: 'scan-self', aliases: ['yzcheck'], desc: '言智自有资产体检（仓库 / 构建产物 / 本机服务）', usage: '/scan-self [--profile=quick|standard|deep] [--target=路径]', group: 'SCAN', mode: 'sec', danger: 'A', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scan_self' },
      { name: 'scan-status', aliases: ['sjobs'], desc: '扫描作业列表 / 单个作业进度', usage: '/scan-status [jobId]', group: 'SCAN', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scan_status', params: ['jobId'] },
      { name: 'scan-report', aliases: ['sreport'], desc: '取扫描作业报告（默认最近一次完成）', usage: '/scan-report [jobId]', group: 'SCAN', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scan_report', params: ['jobId'] },
      { name: 'scan-baseline', aliases: ['sbaseline'], desc: '把某次扫描的指纹存为基线，之后只报新增', usage: '/scan-baseline [jobId]', group: 'SCAN', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'scan_baseline', params: ['jobId'] },
      { name: 'self-assets', aliases: ['selfassets'], desc: '列出自有资产（仓库 / 构建产物 / 本机服务）', usage: '/self-assets', group: 'SYS', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'self_assets' },
      // ── P5：经验库（自学习，2026-10-17）────────────────────────────────────
      // ★ 模型只能 propose，审批走 `/exp-review`（HUMAN_ONLY，服务端硬拦）；
      //   只有 approved 条目会被 buildSystemPromptForBackend 注入提示词。
      { name: 'experience', aliases: ['exp'], desc: '安全经验库：list 看已批准（只有它进提示词）/ pending 看待审（仅元数据）/ propose 提交经验（人工审批后才生效）', usage: '/experience <list|pending|propose> [title] [--source=x] [--body=...]', group: 'KB', mode: 'sec', danger: 'P', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'sec_experience', params: ['action', 'title'] },
      { name: 'exp-review', aliases: ['exp_review', 'experience-review'], desc: '经验库审批（**仅人工**）：approve / reject 待审条目；批准后才会进入提示词', usage: '/exp-review <approve|reject> <id> [--reason=...]', group: 'KB', mode: 'sec', danger: 'S', kind: 'tool', pluginId: SEC_LAB_ID, tool: 'experience_review', confirm: false, params: ['action', 'id'] },
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
      approvalMode: { type: 'string', enum: ['ask', 'auto_review', 'full_access'], description: '高危动作逐条审批：ask=逐条人工批准（默认）；auto_review=只读外部工具自动复核、侵入仍批准；full_access=不逐条批准（仍受授权范围/风险级/黑名单/HUMAN_ONLY 约束）', default: 'ask' },
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
// P5：安全经验库（自学习）。只有 approved 会被 services/sec-experience-gate.ts 注入提示词。
const K_EXPERIENCE = 'experience';
// ExecutionGate：高危动作逐条审批票（一次性、内容哈希、10 分钟过期）
const K_APPROVALS = 'approvals';
// P1 扫描作业与基线（2026-10-30）
const K_SCAN_JOBS = 'scan_jobs';
const K_SCAN_BASELINES = 'scan_baselines';
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
// 存储里的历史/异常数据不能让控制台整页崩：只接受 id/status 齐全的对象
const loadExperience = async (): Promise<ExperienceEntry[]> =>
  (await loadList<ExperienceEntry>(K_EXPERIENCE)).filter(
    (e) => !!e && typeof e === 'object' && typeof e.id === 'string' && typeof e.status === 'string',
  );
const loadApprovals = () => loadList<ExecutionApproval>(K_APPROVALS);
async function saveApprovals(list: ExecutionApproval[]): Promise<void> {
  if (store) await store.set(K_APPROVALS, list);
}

// ── 扫描作业存储（P1，2026-10-30）───────────────────────────────────────────
// 编排层只认 ScanStore 接口，不直接依赖 plugin_storage；这里做适配。
const scanStore: ScanStore = {
  loadJobs: () => loadList<ScanJob>(K_SCAN_JOBS),
  saveJobs: async (jobs) => { if (store) await store.set(K_SCAN_JOBS, jobs); },
  loadBaselines: () => loadList<ScanBaseline>(K_SCAN_BASELINES),
  saveBaselines: async (list) => { if (store) await store.set(K_SCAN_BASELINES, list); },
};
const SCAN_SCANNERS = [createSourceScanner(), createUrlScanner(), createPackageScanner()];
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
  // ★ 同一问题只留一条：重复扫描不再把同一发现追加成 5 条（用户看到的是 495 条里的噪音）。
  const incoming = new Map<string, StoredFinding>();
  for (const f of findings) {
    const item: StoredFinding = {
      ...f,
      id: randomUUID(), at: Date.now(), target, tool,
      // 落库前脱敏：凭据不进 SQLite 历史
      detail: maskSecrets(f.detail),
      evidence: f.evidence ? maskSecrets(f.evidence) : f.evidence,
    };
    incoming.set(findingKey(item), item); // 同批内重复也只留最后一条
  }
  const kept = list.filter((x) => !incoming.has(findingKey(x)));
  await store.set(K_FINDINGS, [...kept, ...incoming.values()].slice(-2000));
}

/** 发现项去重键：同一目标 + 同一工具 + 同一标题 + 同一详情（含定位）视为同一个问题 */
function findingKey(f: { title?: string; target?: string; tool?: string; detail?: string }): string {
  const detail = String(f.detail || '').replace(/\s+/g, ' ').trim();
  return `${f.title || ''}|${f.target || ''}|${f.tool || ''}|${detail}`;
}

/** 启动时归一：脱敏 + 去重（同一问题只留最新一条）。旧库是"每次扫描都追加"，会堆出几百条重复。 */
async function normalizeStoredFindings(): Promise<void> {
  if (!store) return;
  const list = await loadFindings();
  const masked = list.map((f) => ({
    ...f,
    detail: maskSecrets(f.detail || ''),
    evidence: f.evidence ? maskSecrets(f.evidence) : f.evidence,
  }));
  const lastIndex = new Map<string, number>();
  masked.forEach((f, i) => lastIndex.set(findingKey(f), i));
  const next = masked.filter((f, i) => lastIndex.get(findingKey(f)) === i);
  const changed = next.length !== list.length ||
    masked.some((f, i) => f.detail !== list[i].detail || f.evidence !== list[i].evidence);
  if (changed) await store.set(K_FINDINGS, next);
}

// ---------- 报告生成（导出的 Markdown 直接给智能体读） ----------
const REPORT_SEV_LABEL: Record<string, string> = {
  critical: '严重', high: '高危', medium: '中危', low: '低危', info: '信息',
};

function buildReportMarkdown(
  items: Array<Finding & { target?: string; tool?: string; at?: number }>,
  opts: { job?: ScanJob },
): string {
  const sorted = sortFindings(items);
  const counts: Record<string, number> = {};
  for (const f of sorted) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const sevLine = Object.entries(counts)
    .sort((a, b) => (SEVERITY_ORDER as unknown as Record<string, number>)[b[0]] - (SEVERITY_ORDER as unknown as Record<string, number>)[a[0]])
    .map(([k, v]) => `${REPORT_SEV_LABEL[k] || k} ${v}`).join(' / ');

  const L: string[] = [];
  L.push(`# 安全扫描报告${opts.job ? ` — ${opts.job.kind} / ${opts.job.profile}` : ''}`);
  L.push('');
  L.push(`- 生成时间：${new Date().toLocaleString('zh-CN')}`);
  if (opts.job) {
    L.push(`- 作业：${opts.job.id}（${opts.job.status}）`);
    L.push(`- 目标：${opts.job.target}`);
    L.push(`- 发起方：${opts.job.createdBy === 'human' ? '人工' : '智能体'}`);
  }
  L.push(`- 发现项：${sorted.length}${sevLine ? `（${sevLine}）` : ''}`);
  L.push('');
  L.push('## 修复清单（供智能体逐项处理）');
  L.push('');

  sorted.forEach((f, i) => {
    const sev = REPORT_SEV_LABEL[f.severity] || f.severity;
    L.push(`- [ ] ${i + 1}. **[${sev}] ${maskSecrets(f.title)}**`);
    const loc = /定位：(.+)/.exec(f.detail || '')?.[1]?.trim();
    if (loc) L.push(`  - 位置：${loc}`);
    if (f.target) L.push(`  - 目标：${f.target}`);
    if (f.tool) L.push(`  - 来源：${f.tool}`);
    const ev = maskSecrets((f.evidence || '').replace(/\s+/g, ' ').trim()).slice(0, 300);
    if (ev) L.push(`  - 证据：${ev}`);
    const why = maskSecrets(f.detail || '').split('\n')[0]?.trim();
    if (why && why !== ev) L.push(`  - 说明：${why.slice(0, 240)}`);
    if (f.remediation) L.push(`  - 修复：${f.remediation}`);
    L.push('');
  });

  L.push('## 给智能体的执行说明');
  L.push('');
  L.push('1. 只处理本文件「修复清单」里的条目，不要顺手改清单之外的文件。');
  L.push('2. 每条按「位置 → 证据 → 修复」顺序处理；证据里的凭据已脱敏，实际值请到对应文件确认后再轮换。');
  L.push('3. 规则扫描可能误报：无法复现或确认为误报的条目，标注「误报」并说明理由，不要强行修改。');
  L.push('4. 完成一条就把 `[ ]` 改成 `[x]`，并在提交信息里带上条目编号。');
  L.push('5. 密钥类问题：改代码只是止血，必须提醒用户到对应控制台吊销并轮换。');
  L.push('');
  return L.join('\n');
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
): Promise<McpCallResult> {
  const cfg = await loadConfig();
  const scopes = await loadScopes();
  // ★ 人工身份**只认 Symbol 标记**（见 sec-lab-guard.isTrustedHumanCall）：
  //   工具参数是模型可写的 JSON，字符串字段（曾经的 __sec_runner）可以被伪造；
  //   Symbol 键只能由服务端 `/run` / 控制台审批路由在进程内写入。
  const requester: 'agent' | 'human' = isTrustedHumanCall(args) ? 'human' : 'agent';
  const g = guard({
    tool,
    target: args.target ? String(args.target) : (args.value ? String(args.value) : undefined),
    command: args.command ? String(args.command) : undefined,
    ports: args.ports ? String(args.ports) : undefined,
    concurrency: typeof args.concurrency === 'number' ? args.concurrency : undefined,
    scopes,
    config: cfg,
    confirmed: args.confirmed === true,
    requester,
  });
  if (!g.ok) {
    await pushAudit({ at: Date.now(), tool, target: args.target ? String(args.target) : undefined, ok: false, message: g.reason });
    return errResult(g.reason);
  }

  // ── ExecutionGate：高危动作逐条人工审批（2026-10-17）──────────────────────
  // ★ 只拦 **AI 发起** 的高危动作；人工在控制台点击（requester=human）本身就是批准。
  // ★ fail-closed：没有已批准票就是 pending，永远不会自动放行；票一次性、绑定内容哈希、10 分钟过期。
  let approvalNote = '';
  if (requester === 'agent' && requiresExecutionApproval(tool, args)) {
    const gate = resolveApprovalGate(await loadApprovals(), tool, args, cfg.approvalMode);
    await saveApprovals(gate.list);
    if (gate.result.kind === 'pending') {
      const a = gate.result.approval;
      await pushAudit({ at: Date.now(), tool, target: a.target, ok: false, message: `高危动作待人工逐条批准（${a.id}）` });
      return { content: [{ type: 'text', text: pendingApprovalMessage(a) }], isError: false };
    }
    if (gate.result.kind === 'rejected') {
      const a = gate.result.approval;
      await pushAudit({ at: Date.now(), tool, target: a.target, ok: false, message: `高危动作被人工拒绝（${a.id}）：${a.rejectReason || '未说明'}` });
      return { content: [{ type: 'text', text: rejectedApprovalMessage(a) }], isError: false };
    }
    if (gate.result.kind === 'auto') {
      approvalNote = gate.result.via === 'auto_review'
        ? '逐条审批：自动复核放行（只读外部工具）'
        : '逐条审批：全放行档（full_access）';
    } else if (gate.result.kind === 'approved') {
      approvalNote = '逐条审批：人工批准票已消费（一次性）';
    }
  }

  try {
    const out = await run(cfg);
    await pushFindings(out.target, tool, out.findings);
    await pushAudit({
      at: Date.now(), tool, target: out.target, risk: out.risk, ok: true,
      message: approvalNote ? `${out.summary}\n（${approvalNote}）` : out.summary,
      argsSummary: JSON.stringify(args).slice(0, 300),
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
        format: { type: 'string', enum: ['markdown', 'json', 'html', 'sarif'], description: '输出格式，默认 markdown（pdf 请用 html 在浏览器打印）' },
      },
      required: [],
    },
    async execute(args) {
      const cfg = await loadConfig();
      const all = await loadFindings();
      const target = args.target ? normalizeTarget(String(args.target)) : '';
      const list = target ? all.filter((f) => f.target === target) : all;
      // ★ 误报（fp）不进报告：状态机就是为了把噪音摘掉，报告里再列一遍等于白做
      const actionable = list.filter((f) => (f as { status?: string }).status !== 'fp');
      if (!actionable.length) {
        return { content: [{ type: 'text', text: target ? `目标 ${target} 暂无发现项（或已全部标记为误报）。` : '暂无任何发现项，先跑 recon / portscan / webprobe。' }] };
      }
      const sorted = sortFindings(actionable);
      const format = String(args.format || 'markdown').toLowerCase();
      const safe = (s: string) => redact(String(s || ''), cfg.redactReport);

      if (format === 'json') {
        return { content: [{ type: 'text', text: JSON.stringify(sorted.map((f) => ({ ...f, detail: safe(f.detail) })), null, 2) }] };
      }

      // SARIF 2.1.0：给 CI / 代码扫描平台吃的标准格式（只含未标记误报的条目）
      if (format === 'sarif') {
        const level = (s: string) => (s === 'critical' || s === 'high' ? 'error' : s === 'medium' ? 'warning' : 'note');
        const sarif = {
          $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
          version: '2.1.0',
          runs: [{
            tool: { driver: { name: 'yan-zhi-sec-lab', informationUri: 'https://github.com/yhfysun/yan-zhi' } },
            results: sorted.map((f) => ({
              ruleId: f.tool || 'sec-lab',
              level: level(f.severity),
              message: { text: `${f.title}：${safe(f.detail)}${f.remediation ? `（修复：${safe(f.remediation)}）` : ''}` },
              locations: [{ physicalLocation: { artifactLocation: { uri: f.target || '(unknown)' } } }],
              properties: { severity: f.severity, tool: f.tool },
            })),
          }],
        };
        return { content: [{ type: 'text', text: JSON.stringify(sarif, null, 2) }] };
      }

      // HTML：可直接在浏览器打开并「打印为 PDF」—— 不引入 PDF 库，也不假装能生成二进制
      if (format === 'html') {
        const esc = (s: string) => String(s || '').replace(/[&<>"']/g, (c) => (
          { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
        )[c]);
        const rows = sorted.map((f) => `<tr><td><span class="sev ${esc(f.severity)}">${esc(f.severity)}</span></td>` +
          `<td><b>${esc(f.title)}</b><div class="muted">${esc(safe(f.detail))}</div>` +
          (f.remediation ? `<div class="fix">修复：${esc(safe(f.remediation))}</div>` : '') +
          `</td><td><code>${esc(f.target || '')}</code><div class="muted">${esc(f.tool || '')}</div></td></tr>`).join('\n');
        const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>安全评估报告</title>
<style>body{font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;margin:32px;color:#1f2937}
h1{font-size:20px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb;padding:10px;vertical-align:top;text-align:left}
.muted{color:#6b7280;font-size:12px}.fix{color:#047857;font-size:12px;margin-top:4px}
.sev{padding:1px 6px;border-radius:4px;font-size:12px;color:#fff}
.sev.critical{background:#b91c1c}.sev.high{background:#dc2626}.sev.medium{background:#d97706}.sev.low{background:#2563eb}.sev.info{background:#6b7280}
@media print{body{margin:0}}</style></head><body>
<h1>安全评估报告${target ? ` — ${esc(safe(target))}` : ''}</h1>
<p class="muted">生成时间：${new Date().toLocaleString('zh-CN')}　发现项：${sorted.length}　（已排除标记为误报的条目）</p>
<p class="muted">本报告由 yan-zhi 安全工作台生成，仅针对已登记授权的目标。浏览器「打印 → 另存为 PDF」即可得到 PDF。</p>
<table><thead><tr><th>级别</th><th>发现项</th><th>目标 / 来源</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>`;
        return { content: [{ type: 'text', text: html }] };
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
        // ★ 不在这里自证 human：人工身份由 /run 路由写入的 Symbol 标记决定。
        //   模型直接调用本工具（含 planOnly）一律按 agent 处理，被 HUMAN_ONLY 拦截。
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

// ---------- P2 工具工厂（2026-10-17） ----------

function pocScanTool(): BuiltInTool {
  return {
    name: 'poc_scan',
    description: '模板化只读 POC 扫描：内置 7 个模板（.git / .env / 目录遍历 / actuator / phpinfo / 安全头 / swagger），可按标签与级别过滤。只发只读请求，不含利用动作。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目标 URL 或域名' },
        tags: { type: 'array', items: { type: 'string' }, description: '只跑含这些标签的模板（exposure/secrets/misconfig/...）' },
        severities: { type: 'array', items: { type: 'string' }, description: '只跑这些级别（critical/high/medium/low/info）' },
        timeoutMs: { type: 'number', description: '单请求超时（ms），默认 10000' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('poc_scan', args, async () => runPocScan({
        target: String(args.target),
        tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
        severities: Array.isArray(args.severities) ? args.severities.map(String) : undefined,
        timeoutMs: Number(args.timeoutMs) || undefined,
      }));
    },
  };
}

function pocTemplatesTool(): BuiltInTool {
  return plainTool('poc_templates', '模板库：list 列全部 / show 看单条（含匹配条件）/ run 只跑一条。',
    {
      action: { type: 'string', enum: ['list', 'show', 'run'], description: '动作' },
      id: { type: 'string', description: '模板 id' },
      target: { type: 'string', description: 'run 时的目标' },
      timeoutMs: { type: 'number' },
    },
    ['action'],
    async (a) => runTemplates(String(a.action || 'list'), {
      id: a.id ? String(a.id) : undefined,
      target: a.target ? String(a.target) : undefined,
      timeoutMs: Number(a.timeoutMs) || undefined,
    }));
}

function cveTool(): BuiltInTool {
  return plainTool('cve_intel', 'CVE 本地情报：CVSS 与 CISA KEV；EPSS 每日变化，刻意不硬编码。查不到会明说，不编。',
    { keyword: { type: 'string', description: 'CVE 编号或产品关键词（log4j / spring / CVE-2021-44228）' } },
    ['keyword'],
    async (a) => lookupCve(String(a.keyword || '')));
}

function exploitTool(): BuiltInTool {
  return plainTool('exploit_search', '利用线索：给出相关 CVE 与是否已被在野利用；不提供利用代码。',
    { keyword: { type: 'string', description: '产品/组件关键词' } },
    ['keyword'],
    async (a) => searchExploit(String(a.keyword || '')));
}

function oastTool(): BuiltInTool {
  return plainTool('oast', '带外（OAST）回调服务：start 启动 / stop / hits 看命中 / clear 清空。用于确认盲注与 SSRF。',
    {
      action: { type: 'string', enum: ['start', 'stop', 'hits', 'clear', 'status'], description: '动作' },
      port: { type: 'number', description: 'start 时监听端口，默认 8898' },
    },
    ['action'],
    async (a) => runOast({
      action: String(a.action || 'status') as 'start' | 'stop' | 'hits' | 'clear' | 'status',
      port: typeof a.port === 'number' ? a.port : undefined,
    }));
}

function verifySqliTool(): BuiltInTool {
  return {
    name: 'verify_sqli',
    description: 'SQL 注入验证：对每个查询参数注入单引号，检测数据库错误特征与布尔差分。**侵入级**，需交战模式。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '带查询参数的 URL' },
        timeoutMs: { type: 'number' },
        confirmed: { type: 'boolean', description: '侵入性动作需显式确认（控制台会二次确认后置 true）' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('verify_sqli', args, async () => verifySqli(String(args.target), Number(args.timeoutMs) || undefined));
    },
  };
}

function verifyXssTool(): BuiltInTool {
  return {
    name: 'verify_xss',
    description: '反射型 XSS 验证：注入唯一标记，检查是否**原样反射**（不执行脚本、不构造利用链）。',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: '带查询参数的 URL' }, timeoutMs: { type: 'number' } },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('verify_xss', args, async () => verifyXss(String(args.target), Number(args.timeoutMs) || undefined));
    },
  };
}

function verifySsrfTool(): BuiltInTool {
  return {
    name: 'verify_ssrf',
    description: 'SSRF 验证：把 /oob 的回调地址投进参数，看回调服务是否收到请求。**侵入级**，需先 /oob start 且开启交战模式。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '带查询参数的 URL' },
        timeoutMs: { type: 'number' },
        confirmed: { type: 'boolean', description: '侵入性动作需显式确认' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('verify_ssrf', args, async () => verifySsrf(String(args.target), Number(args.timeoutMs) || undefined));
    },
  };
}

function findingStatusTool(): BuiltInTool {
  return plainTool('finding_status', '发现项状态机：open / verified / fixed / accepted / fp（fp 不再计入报告）。',
    {
      id: { type: 'string', description: '发现项 id（/findings 可见）' },
      status: { type: 'string', enum: ['open', 'verified', 'fixed', 'accepted', 'fp'], description: '目标状态，默认 verified' },
    },
    ['id'],
    async (a) => updateFindingStatus(String(a.id || ''), String(a.status || 'verified'), {
      loadFindings: async () => (await loadFindings()) as unknown as Array<Record<string, unknown>>,
      saveFindings: async (list) => { if (store) await store.set(K_FINDINGS, list); },
    }));
}

// ---------- P3 工具工厂（2026-10-17） ----------

/**
 * watch 的 `list` 不需要目标，但 `start` / `tick` 必须过授权范围。
 * 所以 watch 进 NO_TARGET_TOOLS（否则 list 会被"缺少 target"挡住），
 * 再在真正动手的两个动作上**显式调同一个 guard()** —— 不是绕过，是分段校验。
 */
async function assertInScope(tool: string, target: string): Promise<void> {
  const cfg = await loadConfig();
  const g = guard({ tool, target, scopes: await loadScopes(), config: cfg, requester: 'human' });
  if (!g.ok) throw new Error(g.reason);
}

function baselineTool(): BuiltInTool {
  return {
    name: 'baseline_scan',
    description: '配置基线核查：安全响应头 + TLS + Cookie，按 owasp / cis / 等保 出分与问题清单。只覆盖**可远程核查**的子集（账号策略、审计日志不在其中）。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目标 URL 或域名' },
        profile: { type: 'string', enum: ['owasp', 'cis', 'djbh', 'dengbao'], description: '基线档位，默认 owasp' },
        timeoutMs: { type: 'number' },
      },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('baseline_scan', args, async () => runBaseline(
        String(args.target), String(args.profile || 'owasp'), Number(args.timeoutMs) || undefined,
      ));
    },
  };
}

function tlsAuditTool(): BuiltInTool {
  return {
    name: 'tls_audit',
    description: 'TLS 握手审计：协议版本、加密套件、证书主体/颁发者/有效期/是否自签名。默认 443，可写 host:port。',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: 'host 或 host:port' }, timeoutMs: { type: 'number' } },
      required: ['target'],
    },
    async execute(args) {
      const raw = String(args.target || '');
      const hostPort = raw.replace(/^https?:\/\//i, '').split('/')[0];
      const [host, portStr] = hostPort.split(':');
      const port = Number(portStr) || 443;
      return withGuard('tls_audit', { ...args, target: host }, async () => runTlsAudit(host, port, Number(args.timeoutMs) || undefined));
    },
  };
}

function headersAuditTool(): BuiltInTool {
  return {
    name: 'headers_audit',
    description: 'HTTP 安全响应头审计：HSTS / CSP / X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy，并检查版本号泄露。',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: '目标 URL' }, timeoutMs: { type: 'number' } },
      required: ['target'],
    },
    async execute(args) {
      return withGuard('headers_audit', args, async () => runHeadersAudit(String(args.target), Number(args.timeoutMs) || undefined));
    },
  };
}

function hostBaselineTool(): BuiltInTool {
  return {
    name: 'host_baseline',
    description: '本机主机安全基线（只读体检，不改任何设置）：Windows 查密码策略/账户锁定/SMBv1/RDP/UAC/Defender/防火墙；Linux 查 SSH 配置/shadow 权限/防火墙/auditd/IP 转发。补 /baseline 远程核查不到的主机侧配置。',
    inputSchema: { type: 'object', properties: {} },
    async execute(args) {
      // 无目标工具：仍然过 withGuard（同一套审计），只是不要求 scope
      return withGuard('host_baseline', args, async () => runHostBaseline());
    },
  };
}

function watchTool(): BuiltInTool {
  return {
    name: 'watch',
    description: '定时巡检：start 定期跑 recon+portscan 并 diff（新增端口/子域告警）/ stop / list / tick。进程内定时器，重启需重开。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'stop', 'list', 'tick'], description: '动作' },
        target: { type: 'string', description: '目标（start / tick / 指定 stop 时必填）' },
        intervalMin: { type: 'number', description: '间隔分钟，默认 30（5~1440）' },
        timeoutMs: { type: 'number' },
      },
      required: ['action'],
    },
    async execute(args) {
      const action = String(args.action || 'list');
      const target = args.target ? String(args.target) : undefined;
      if (action === 'start' || action === 'tick') await assertInScope('watch', String(target || ''));
      return withGuard('watch', args, async () => runWatch({
        action: action as 'start' | 'stop' | 'list' | 'tick',
        target,
        intervalMin: Number(args.intervalMin) || undefined,
        timeoutMs: Number(args.timeoutMs) || undefined,
      }, async (t, findings, summary) => {
        await pushFindings(t, 'watch', findings);
        await pushAudit({ at: Date.now(), tool: 'watch', target: t, risk: 'active', ok: true, message: summary });
      }));
    },
  };
}

function bruteTool(): BuiltInTool {
  return {
    name: 'brute',
    description: 'HTTP Basic 默认口令自查：8 组公开默认口令，每次间隔 800ms，命中即停。SSH/FTP 的弱口令请走 /toolchain（hydra）。',
    inputSchema: {
      type: 'object',
      properties: {
        protocol: { type: 'string', enum: ['http', 'ssh', 'ftp'], description: '目前只支持 http' },
        target: { type: 'string', description: '目标 URL' },
        timeoutMs: { type: 'number' },
        confirmed: { type: 'boolean', description: '侵入性动作需显式确认' },
      },
      required: ['protocol', 'target'],
    },
    async execute(args) {
      return withGuard('brute', args, async () => runBrute({
        protocol: String(args.protocol || 'http') as 'http' | 'ssh' | 'ftp',
        target: String(args.target),
        timeoutMs: Number(args.timeoutMs) || undefined,
      }));
    },
  };
}

function attackMapTool(): BuiltInTool {
  return plainTool('attack_map', '把当前发现项按关键词映射到 ATT&CK 技术，输出已覆盖与未覆盖（启发式，不是精确归属）。',
    {},
    [],
    async () => runAttackMap(await loadFindings()));
}

function skillTool(): BuiltInTool {
  return plainTool('sec_skill', '安全技能参考：list 列全部 / load <name> 看正文。这是**方法论速记**，不是本仓可执行 skill。',
    { action: { type: 'string', enum: ['list', 'load'], description: '动作' }, name: { type: 'string', description: '技能名（load 时）' } },
    ['action'],
    async (a) => runSkill(String(a.action || 'list'), String(a.name || '')));
}

function warstoryTool(): BuiltInTool {
  return plainTool('warstory', '战例库：真实缺陷的排查路径与教训（不传关键词列全部）。',
    { topic: { type: 'string', description: '关键词（php / jwt / git …）' } },
    [],
    async (a) => runWarstory(String(a.topic || '')));
}

function cheatsheetTool(): BuiltInTool {
  return plainTool('cheatsheet', '速查表：nmap / curl / jwt / sqlmap / ffuf（不传关键词列全部）。',
    { topic: { type: 'string', description: '关键词' } },
    [],
    async (a) => runCheatsheet(String(a.topic || '')));
}

function sastTool(): BuiltInTool {
  return {
    name: 'sast',
    description: '本地源码安全扫描：L1 正则 + L2 结构式，10 条规则（硬编码凭据 / SQL 拼接 / eval / innerHTML / 命令注入 / 反序列化 / 弱哈希 / CORS 通配 / 调试路由 / 关闭 TLS 校验）。只读，不执行被测代码。',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: '要扫描的目录（绝对路径）' },
        maxFiles: { type: 'number', description: '最多扫多少个文件，默认 800' },
        maxBytes: { type: 'number', description: '单文件大小上限（字节），默认 512KB' },
      },
      required: ['root'],
    },
    async execute(args) {
      return withGuard('sast', args, async () => runSast({
        root: String(args.root || ''),
        maxFiles: Number(args.maxFiles) || undefined,
        maxBytes: Number(args.maxBytes) || undefined,
      }));
    },
  };
}

// ---------- P1：统一扫描（2026-10-30） ----------
//
// 四类输入各一个工具（而不是一个带 kind 参数的大工具）：
//   ① guard 的 TOOL_RISK 是**按工具名**查的，拆开才能让「源码/制品=passive、URL=active」各归各位；
//   ② NO_TARGET_TOOLS 同理——本地路径不该被要求登记 scope，而 URL 必须；
//   ③ 命令层 positionals → 字段名的映射天然是「一命令一工具」，不用给 CommandDef 加固定参数。

const SCAN_TARGET_PROP = { type: 'string', description: '扫描目标（目录 / URL / 安装包路径）' } as const;
const SCAN_PROFILE_PROP = { type: 'string', description: '剖面：quick / standard / deep（URL 另有 api）' } as const;

/** 四类扫描共用的执行体：跑作业 → 结果转 ToolOutput（审计与历史发现项由 withGuard 统一写） */
async function executeScanJob(
  tool: string,
  kind: ScanKind,
  target: string,
  args: Record<string, unknown>,
): Promise<ToolOutput> {
  const job = await runScan({
    kind,
    target,
    profile: args.profile ? String(args.profile) : undefined,
    scanners: SCAN_SCANNERS,
    store: scanStore,
    createdBy: isTrustedHumanCall(args) ? 'human' : 'agent',
    limits: {
      maxFiles: typeof args.maxFiles === 'number' ? args.maxFiles : undefined,
      maxDurationMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
    },
  });
  if (job.status === 'failed') throw new Error(job.error || `${tool} 扫描失败`);
  return jobToOutput(job);
}

function scanSourceTool(): BuiltInTool {
  return plainTool(
    'scan_source',
    '本地源码安全扫描（passive）：规则包（硬编码凭据 / 高熵密钥 / 注入 / XSS / 路径遍历 / 弱加密 / Electron 安全配置 / 调试路由 / 默认口令）+ standard 及以上追加依赖快照核对。只读，不执行被测代码。结果为统一扫描作业，支持 /scan-baseline 建立基线后只报新增。',
    {
      target: SCAN_TARGET_PROP,
      profile: SCAN_PROFILE_PROP,
      maxFiles: { type: 'number', description: '最多扫描文件数（quick 800 / standard 2000 / deep 4000）' },
      timeoutMs: { type: 'number', description: '超时毫秒数，默认 120000' },
    },
    ['target'],
    (args) => executeScanJob('scan_source', 'source', String(args.target), args),
  );
}

function scanUrlTool(): BuiltInTool {
  return plainTool(
    'scan_url',
    'URL / Web 应用扫描（active）：按剖面编排既有探测能力——目标画像、安全响应头、TLS、配置基线，standard 起追加爬虫与目录探测，最后跑模板化 POC。不会自动执行注入验证或爆破（那些需要交战模式与逐条审批）。目标必须先登记授权范围。',
    {
      target: SCAN_TARGET_PROP,
      profile: SCAN_PROFILE_PROP,
      timeoutMs: { type: 'number', description: '单步超时毫秒数，默认受作业上限约束' },
    },
    ['target'],
    (args) => executeScanJob('scan_url', 'url', String(args.target), args),
  );
}

function scanPackageTool(): BuiltInTool {
  return plainTool(
    'scan_package',
    '安装包 / 制品扫描（passive）：支持 APK/AAB（清单属性、DEX 字符串、资源明文、签名）、asar、通用 ZIP。解包到临时目录后只读分析，不安装、不执行、不联网；未安装 apktool 时自动走零依赖模式并在结果里标注。',
    {
      target: SCAN_TARGET_PROP,
      profile: SCAN_PROFILE_PROP,
    },
    ['target'],
    (args) => executeScanJob('scan_package', 'package', String(args.target), args),
  );
}

function scanSelfTool(): BuiltInTool {
  return {
    name: 'scan_self',
    description:
      '言智自有资产体检（active）：自动识别仓库 / 构建产物 / 本机服务，按资产类型选择扫描引擎。**只接受服务端判定为自有资产的目标**，外部 URL 与任意外部路径一律拒绝。不传 target 时默认扫仓库源码。',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '可省略；只接受自有资产路径或本机固定端口 URL' },
        profile: SCAN_PROFILE_PROP,
      },
      required: [],
    },
    async execute(args) {
      return withGuard('scan_self', { ...args, target: '' }, async () => {
        const assets = await discoverSelfAssets();
        const raw = String(args.target || '').trim();
        const asset = raw
          ? matchSelfAsset(raw, assets)
          : assets.find((a) => a.kind === 'repo') || null;
        if (!asset) {
          throw new Error(
            raw
              ? `「${raw}」不属于言智自有资产。自有资产：${assets.map((a) => a.label).join('、')}。外部目标请用安全助手并先登记授权范围。`
              : '未发现言智仓库根目录；请显式传一个自有资产路径。',
          );
        }
        const kind: ScanKind = asset.kind === 'runtime' ? 'url' : 'source';
        const out = await executeScanJob('scan_self', kind, asset.value, args);
        return {
          ...out,
          summary: `言智体检：资产「${asset.label}」（${asset.value}）→ ${kind} 引擎\n${out.summary}`,
        };
      });
    },
  };
}

async function loadScanJobs(): Promise<ScanJob[]> {
  return (await loadList<ScanJob>(K_SCAN_JOBS)).filter((j) => !!j && typeof j.id === 'string');
}

function scanStatusTool(): BuiltInTool {
  return plainTool(
    'scan_status',
    '查看扫描作业：不传 jobId 时列出最近 10 个作业（状态 / 类型 / 剖面 / 发现数 / 目标）；传 jobId 返回该作业的阶段进度与摘要。',
    { jobId: { type: 'string', description: '作业 id（sj_ 开头）' } },
    [],
    async (args) => {
      const jobs = await loadScanJobs();
      const id = String(args.jobId || '');
      const job = id ? jobs.find((j) => j.id === id) : jobs[jobs.length - 1];
      if (!job) {
        return {
          tool: 'scan_status', target: '', risk: 'passive',
          summary: id ? `未找到作业 ${id}` : '还没有扫描作业。用 /scan-source、/scan-url、/scan-package 或 /scan-self 发起。',
          findings: [],
        };
      }
      return jobToOutput(job);
    },
  );
}

function scanReportTool(): BuiltInTool {
  return plainTool(
    'scan_report',
    '取扫描作业报告：不传 jobId 时取最近完成的作业。输出按严重度分级的发现项与证据；需要 Markdown/HTML/SARIF 文件导出时用 sec_report（扫描结果已写入发现项历史）。',
    { jobId: { type: 'string', description: '作业 id；省略=最近一次' } },
    [],
    async (args) => {
      const jobs = await loadScanJobs();
      const id = String(args.jobId || '');
      const job = id ? jobs.find((j) => j.id === id) : [...jobs].reverse().find((j) => j.status === 'done');
      if (!job) throw new Error(id ? `未找到作业 ${id}` : '还没有已完成的扫描作业');
      const out = jobToOutput(job);
      const stages = job.stages.map((s) => `${s.name}=${s.status}${s.note ? `(${s.note})` : ''}`).join(' → ');
      return { ...out, summary: `${out.summary}\n阶段：${stages}\n作业 ${job.id}（${job.kind}/${job.profile}，${job.createdBy === 'human' ? '人工' : '智能体'}发起）` };
    },
  );
}

function scanBaselineTool(): BuiltInTool {
  return plainTool(
    'scan_baseline',
    '把某个扫描作业的发现项指纹存为基线：之后同一目标的扫描只报**新增**问题（被抑制的仍保留在作业里）。用于让扫描能进日常流程。',
    { jobId: { type: 'string', description: '作业 id（sj_ 开头）；省略=最近一次已完成作业' } },
    [],
    async (args) => {
      const jobs = await loadScanJobs();
      const id = String(args.jobId || '');
      const job = id ? jobs.find((j) => j.id === id) : [...jobs].reverse().find((j) => j.status === 'done');
      if (!job) throw new Error(id ? `未找到作业 ${id}` : '还没有已完成的作业可建基线');
      const baseline = await acceptBaseline(scanStore, job);
      return {
        tool: 'scan_baseline', target: job.target, risk: 'passive',
        summary: `已为 ${job.kind} 目标「${job.target}」建立基线 ${baseline.id}（${baseline.fingerprints.length} 条指纹）。之后同目标扫描只报新增。`,
        findings: [],
        raw: { baselineId: baseline.id, jobId: job.id, count: baseline.fingerprints.length },
      };
    },
  );
}

function selfAssetsTool(): BuiltInTool {
  return plainTool(
    'self_assets',
    '列出自有资产（服务端自动识别）：仓库目录、构建产物目录、本机固定端口服务。安全官据此决定扫什么；外部目标不在其中。',
    {},
    [],
    async () => {
      const assets = await discoverSelfAssets();
      const lines = assets.map((a) => `- [${a.kind}] ${a.label}：${a.value}`);
      return {
        tool: 'self_assets', target: '', risk: 'passive',
        summary: assets.length ? `自有资产共 ${assets.length} 项：\n${lines.join('\n')}` : '未发现自有资产（不在言智仓库内运行时属正常）。',
        findings: [],
        raw: assets,
      };
    },
  );
}

function experienceTool(): BuiltInTool {
  return plainTool(
    'sec_experience',
    '安全经验库（自学习，**人工审批后才生效**）：action=list 看已批准经验（只有 approved 会进入系统提示词）；propose 提交一条待审经验（title/body/source/tags）。待审队列（pending）仅供人工在控制台查看，模型调用会被拒绝。提交后不会立即生效，不要在回复里声称"已记住/已生效"。不得写入凭据、密码、token、客户隐私。',
    {
      action: { type: 'string', enum: ['list', 'pending', 'propose'], description: 'list=已批准 / pending=待审 / propose=提交' },
      title: { type: 'string', description: 'propose：经验标题（2-80 字）' },
      body: { type: 'string', description: 'propose：经验正文（20-1200 字，写方法/坑/验证过的步骤）' },
      source: { type: 'string', description: 'propose：依据（finding id / 命令 / 报告 / 人工说明）' },
      tags: { type: 'array', items: { type: 'string' }, description: 'propose：标签，最多 8 个' },
    },
    ['action'],
    async (a) => {
      const action = String(a.action || 'list');
      const list = await loadExperience();
      const counts = experienceCounts(list);

      if (action === 'list') {
        const approved = approvedEntries(list);
        const text = approved.length
          ? `已批准经验 ${approved.length} 条（只有这些会进入系统提示词）；待审 ${counts.pending} 条，已驳回 ${counts.rejected} 条。\n\n` +
            approved
              .slice()
              .sort((x, y) => (y.decidedAt ?? y.createdAt) - (x.decidedAt ?? x.createdAt))
              .map((e) => [
                `### ${oneLine(e.id)} · ${oneLine(e.title)}${(e.tags || []).length ? ` [${(e.tags || []).map((t) => oneLine(t)).filter(Boolean).join(', ')}]` : ''}`,
                `来源：${oneLine(e.source)}${e.decidedBy ? ` · 审批人 ${oneLine(e.decidedBy)}` : ''}`,
                sanitizeText(e.body),
              ].join('\n'))
              .join('\n\n')
          : `暂无已批准经验（待审 ${counts.pending} 条）。经验只有经人工审批后才会进入提示词。`;
        return { tool: 'sec_experience', target: '', risk: 'passive', summary: text, findings: [], raw: { counts, entries: approved } };
      }

      if (action === 'pending') {
        // ★ 待审队列只给人工看：模型读待审标题/来源，等于把未批准内容重新塞回自己的上下文，
        //   闸门就漏了一半。模型只需要"我提交了什么"的结果，不需要浏览队列。
        //   人工身份只认 Symbol 标记（字符串参数可被模型伪造）。
        if (!isTrustedHumanCall(a)) {
          throw new Error('待审队列仅供人工在安全控制台查看。模型只能 list 已批准经验，或用 propose 提交新提议。');
        }
        const pending = list
          .filter((e) => e.status === 'pending')
          .sort((x, y) => y.createdAt - x.createdAt);
        const text = pending.length
          ? `待审经验 ${pending.length} 条（等待人工在安全控制台审批；**未批准不会影响你的行为**）：\n` +
            pending.map((e) => `- ${oneLine(e.id)} · ${oneLine(e.title)}（${e.submittedBy === 'human' ? '人工' : '模型'}提交）来源：${oneLine(e.source)}`).join('\n') +
            '\n\n★ 这里只展示元数据，不返回正文：未批准的内容不应影响本轮判断。'
          : '待审队列为空。';
        return {
          tool: 'sec_experience', target: '', risk: 'passive', summary: text, findings: [],
          raw: { counts, pending: pending.map((e) => ({ id: e.id, title: e.title, source: e.source, submittedBy: e.submittedBy, createdAt: e.createdAt })) },
        };
      }

      if (action === 'propose') {
        // 提交者身份也来自受信任入口；模型传任何字符串都不会被当成"人工提交"
        const submittedBy = isTrustedHumanCall(a) ? 'human' : 'agent';
        const r = addExperience(list, {
          title: String(a.title || ''),
          body: String(a.body || ''),
          source: String(a.source || ''),
          tags: a.tags as string[] | string | undefined,
        }, submittedBy);
        if (!r.ok) throw new Error(r.reason);
        if (store) await store.set(K_EXPERIENCE, r.list);
        return {
          tool: 'sec_experience', target: '', risk: 'passive',
          summary: `已提交待审：${r.entry.id} —— ${r.entry.title}\n★ 当前**尚未生效**。人工在安全控制台批准后，下一个任务才会注入；不要据此改变本轮行为，也不要声称已记住。`,
          findings: [],
          raw: { id: r.entry.id, title: r.entry.title, status: r.entry.status, submittedBy: r.entry.submittedBy },
        };
      }

      throw new Error('action 必须是 list / pending / propose');
    },
  );
}

function experienceReviewTool(): BuiltInTool {
  return plainTool(
    'experience_review',
    '安全经验库审批（**仅人工**，模型调用会被服务端拒绝）：approve / reject 待审经验。批准后该条目才会在后续任务的系统提示词中生效。',
    {
      action: { type: 'string', enum: ['approve', 'reject'], description: 'approve=批准 / reject=驳回' },
      id: { type: 'string', description: '经验条目 id（exp-…）' },
      reason: { type: 'string', description: '驳回原因（reject 时建议填写）' },
      decidedBy: { type: 'string', description: '审批人（默认 operator）' },
    },
    ['action', 'id'],
    async (a) => {
      const decision = String(a.action) as Decision;
      const list = await loadExperience();
      const r = decideExperience(
        list,
        String(a.id || ''),
        decision,
        String(a.decidedBy || 'operator'),
        a.reason ? String(a.reason) : undefined,
      );
      if (!r.ok) throw new Error(r.reason);
      if (store) await store.set(K_EXPERIENCE, r.list);
      return {
        tool: 'experience_review', target: '', risk: 'passive',
        summary: decision === 'approve'
          ? `已批准经验 ${r.entry.id} —— ${r.entry.title}\n它将在后续任务中进入安全助手的系统提示词（仅参考，不覆盖合规硬约束）。`
          : `已驳回经验 ${r.entry.id} —— ${r.entry.title}\n原因：${r.entry.reason || '未说明'}。被驳回条目不会进入提示词。`,
        findings: [],
        raw: r.entry,
      };
    },
  );
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
      const map = SEC_TOOL_FACTORIES;
      const factory = map[tool];
      if (!factory) return fail(res, 400, `未知工具 ${tool}`);
      const userArgs = (body.args as Record<string, unknown>) || {};
      // ★ /run 是人工入口（控制台按钮 / 命令面板都是人触发的）：用**进程内 Symbol**
      //   标记人工身份。模型工具调用的 args 来自 JSON，无法携带 Symbol 键，
      //   因此不能伪造 `requester=human`（历史上用字符串前缀，可被模型直接塞参数绕过）。
      const args: Record<string, unknown> = { ...userArgs };
      markTrustedHumanCall(args);
      const out = await factory().execute(args);
      json(res, { ok: !out.isError, text: out.content?.[0]?.text || '' });
    });

    r.get('/toolchain', async (_req: unknown, res: unknown) => {
      json(res, { data: await detectAll() });
    });

    r.get('/findings', async (_req: unknown, res: unknown) => {
      const cfg = await loadConfig();
      const list = sortFindings(await loadFindings());
      // ★ 无论是否开启报告脱敏，凭据类内容一律打码：这是扫描结果的展示面，
      //   不是用户可以"选择不看"的选项（历史数据里也可能存着旧版写入的原文）。
      json(res, {
        data: list.map((f) => ({
          ...f,
          detail: maskSecrets(cfg.redactReport ? redact(f.detail, true) : f.detail),
          evidence: f.evidence ? maskSecrets(f.evidence) : f.evidence,
        })),
      });
    });

    // ── 导出报告（2026-10-30）──────────────────────────────────────────────
    // 目的：把发现项变成**可交付给智能体修复**的 Markdown（清单 + 定位 + 修复建议）。
    // 只生成文本，落盘由前端选择保存位置（桌面端走系统保存框）。
    r.post('/export/report', async (req: unknown, res: unknown) => {
      const body = bodyOf(req);
      const jobId = String(body.jobId || '');
      let items: Array<Finding & { target?: string; tool?: string; at?: number }>;
      let job: ScanJob | undefined;
      if (jobId) {
        const jobs = await loadList<ScanJob>(K_SCAN_JOBS);
        job = jobs.find((j) => j.id === jobId);
        if (!job) return fail(res, 404, `未找到作业 ${jobId}`);
        items = job.findings
          .filter((f) => !f.suppressed)
          .map((f) => ({ ...f, target: job!.target, tool: 'scan', at: job!.finishedAt || job!.createdAt }));
      } else {
        items = await loadFindings();
      }
      const text = buildReportMarkdown(items, { job });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      json(res, { data: { text, filename: `security-report-${stamp}.md`, count: items.length } });
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

    // ── P5：经验库（自学习，2026-10-17）────────────────────────────────────────
    // ★ 审批入口只在这里 + 控制台 UI：experience_review 属于 HUMAN_ONLY，
    //   模型从工具面调用会被 sec-lab-guard 直接拒绝（guard 的判定在通用路径上，
    //   不依赖"有没有 target"）。这里写入进程内 Symbol 人工标记才放行。
    // ★ 所有状态变更都走工具（withGuard）→ 同一条审计链，不新开写入口。
    r.get('/experience', async (_req: unknown, res: unknown) => {
      const list = await loadExperience();
      const byNewest = (a: ExperienceEntry, b: ExperienceEntry) => b.createdAt - a.createdAt;
      json(res, {
        data: {
          pending: list.filter((e) => e.status === 'pending').sort(byNewest),
          approved: list
            .filter((e) => e.status === 'approved')
            .sort((a, b) => (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt)),
          rejected: list.filter((e) => e.status === 'rejected').sort(byNewest),
          counts: experienceCounts(list),
          gate: '只有 approved 条目会注入安全助手提示词',
        },
      });
    });

    r.post('/experience/propose', async (req: unknown, res: unknown) => {
      const b = bodyOf(req);
      const args: Record<string, unknown> = {
        action: 'propose',
        title: b.title, body: b.body, source: b.source, tags: b.tags,
      };
      // 人工在控制台提交：Symbol 标记（仍然进待审队列，不会直接生效）
      markTrustedHumanCall(args);
      const out = await experienceTool().execute(args);
      const text = out.content?.[0]?.text || '';
      if (out.isError) return fail(res, 400, text);
      json(res, { ok: true, message: text });
    });

    r.post('/experience/decide', async (req: unknown, res: unknown) => {
      const b = bodyOf(req);
      const decision = String(b.decision || '').trim();
      if (decision !== 'approve' && decision !== 'reject') {
        return fail(res, 400, 'decision 必须是 approve / reject');
      }
      const args: Record<string, unknown> = {
        action: decision,
        id: String(b.id || ''),
        reason: b.reason ? String(b.reason) : undefined,
        decidedBy: String(b.decidedBy || 'operator'),
      };
      // 人工点击：Symbol 标记才是 HUMAN_ONLY 放行的依据（模型无法伪造）
      markTrustedHumanCall(args);
      const out = await experienceReviewTool().execute(args);
      const text = out.content?.[0]?.text || '';
      if (out.isError) return fail(res, 400, text);
      json(res, { ok: true, message: text });
    });

    // ── ExecutionGate：高危动作逐条审批（2026-10-17）────────────────────────
    // ★ 审批入口只在控制台 UI / 本路由；模型没有可触达的 HTTP 工具（见执行面挂载校验），
    //   因此模型无法给自己批票。票绑定内容哈希、一次性、10 分钟过期。
    r.get('/approvals', async (_req: unknown, res: unknown) => {
      const list = pruneApprovals(await loadApprovals());
      await saveApprovals(list); // 持久化 expired 状态，界面/审计口径一致
      const pending = list.filter((a) => a.status === 'pending').sort((a, b) => b.requestedAt - a.requestedAt);
      const decided = list
        .filter((a) => a.status !== 'pending')
        .sort((a, b) => (b.decidedAt ?? b.requestedAt) - (a.decidedAt ?? a.requestedAt))
        .slice(0, 50);
      json(res, { data: { pending, decided } });
    });

    r.post('/approvals/decide', async (req: unknown, res: unknown) => {
      const b = bodyOf(req);
      const decision = String(b.decision || '').trim();
      if (decision !== 'approve' && decision !== 'reject') {
        return fail(res, 400, 'decision 必须是 approve / reject');
      }
      const list = pruneApprovals(await loadApprovals());
      const dec = decideApproval(
        list,
        String(b.id || ''),
        decision,
        String(b.decidedBy || 'operator'),
        b.reason ? String(b.reason) : undefined,
      );
      if (!dec.ok) return fail(res, 400, dec.reason);
      await saveApprovals(dec.list);
      await pushAudit({
        at: Date.now(), tool: 'execution_approval', target: dec.entry.target, ok: true,
        message: `${decision === 'approve' ? '批准' : '拒绝'}高危动作 ${dec.entry.tool}（${dec.entry.argsHash}）`,
      });
      json(res, { ok: true, data: dec.entry });
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
      // 审批档位只接受三个值：未知值按 ask 处理虽然安全，但会让界面显示与生效口径不一致
      if (patch.approvalMode !== undefined
        && !['ask', 'auto_review', 'full_access'].includes(String(patch.approvalMode))) {
        return fail(res, 400, 'approvalMode 必须是 ask / auto_review / full_access');
      }
      const next = { ...(await loadConfig()), ...patch };
      if (store) await store.set(K_CONFIG, next);
      json(res, { data: next });
    });
  });
}

// ---------- 工具工厂（唯一真相源） ----------
//
// ★ 2026-10-30 合并：此前 activate 的注册数组与 /run 路由里的工厂表是**两份清单**，
//   新增工具只改一处 ⇒ 面板列出命令、点下去却回「未知工具」。现在两边都从这里取，
//   再配合 sec-lab-commands.test.ts 的「一份清单」断言，不会再漂。
export const SEC_TOOL_FACTORIES: Record<string, () => BuiltInTool> = {
  recon: reconTool,
  portscan: portscanTool,
  webprobe: webprobeTool,
  toolchain: toolchainTool,
  sec_report: secReportTool,
  scope_list: scopeListTool,
  scope_add: scopeAddTool,
  scope_remove: scopeRemoveTool,
  attack_sim: attackSimTool,
  sim_report: simReportTool,
  detect_rules: detectRulesTool,
  log_hunt: logHuntTool,
  asset_monitor: assetMonitorTool,
  host_env: hostEnvTool,
  range_deploy: rangeDeployTool,
  range_list: rangeListTool,
  range_stop: rangeStopTool,
  android_launch: androidLaunchTool,
  // —— P1（2026-10-17）——
  whois: whoisTool,
  ctlog: ctlogTool,
  osint: osintTool,
  subdomain: subdomainTool,
  crawl: crawlTool,
  js_endpoint: jsEndpointTool,
  dirsearch: dirsearchTool,
  waf_detect: wafTool,
  service_scan: serviceScanTool,
  udp_scan: udpScanTool,
  crypto_encode: encodeTool,
  crypto_decode: decodeTool,
  jwt_inspect: jwtTool,
  hash_id: hashidTool,
  target_state: targetStateTool,
  proxy: proxyTool,
  // —— P2（2026-10-17）——
  poc_scan: pocScanTool,
  poc_templates: pocTemplatesTool,
  cve_intel: cveTool,
  exploit_search: exploitTool,
  oast: oastTool,
  verify_sqli: verifySqliTool,
  verify_xss: verifyXssTool,
  verify_ssrf: verifySsrfTool,
  finding_status: findingStatusTool,
  // —— P3（2026-10-17）——
  baseline_scan: baselineTool,
  host_baseline: hostBaselineTool,
  tls_audit: tlsAuditTool,
  headers_audit: headersAuditTool,
  watch: watchTool,
  brute: bruteTool,
  attack_map: attackMapTool,
  // —— P4（2026-10-17）——
  sec_skill: skillTool,
  warstory: warstoryTool,
  cheatsheet: cheatsheetTool,
  sast: sastTool,
  // —— P5（2026-10-17）——
  // ★ 审批必须人工：/run 路由会写入进程内 Symbol 人工标记，
  //   命令行走的是人工入口（与 attack_sim 同一条闸门）。
  sec_experience: experienceTool,
  experience_review: experienceReviewTool,
  // —— P1 扫描编排（2026-10-30）——
  scan_source: scanSourceTool,
  scan_url: scanUrlTool,
  scan_package: scanPackageTool,
  scan_self: scanSelfTool,
  scan_status: scanStatusTool,
  scan_report: scanReportTool,
  scan_baseline: scanBaselineTool,
  self_assets: selfAssetsTool,
};

// ---------- 插件入口 ----------

export const secLabModule: PluginModule = {
  async activate(ctx: PluginContext) {
    applyBuiltinSeed({ agents: secModeAgentDefs, scenes: [secModeScene] });
    store = ctx.storage;
    // 旧库归一：历史发现项里可能存着脱敏修复前写入的凭据原文，且每次扫描都追加导致大量重复
    void normalizeStoredFindings().catch(() => { /* 清理失败不阻断启动 */ });
    // 工具注册与 /run 路由共用同一份工厂表（见 SEC_TOOL_FACTORIES）
    for (const factory of Object.values(SEC_TOOL_FACTORIES)) {
      ctx.registerTool(factory());
    }
    registerRoutes(ctx);
    ctx.log('[sec-lab] 已启用：仅限自有资产或已授权目标，所有动作受授权范围与黑名单约束');
  },
  async deactivate() {
    // 定时器属于进程资源：不停掉就会留下"幽灵巡检"继续打目标
    stopAllWatchers();
    store = null;
  },
};
