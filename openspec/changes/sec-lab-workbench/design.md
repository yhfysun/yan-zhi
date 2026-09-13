# 技术设计：sec-lab 安全工作台

## 一、文件清单

| 文件 | 职责 | 状态 |
|---|---|---|
| `apps/server/src/plugins/sec-lab-guard.ts` | 护栏纯函数：危险黑名单、风险分级、目标解析与范围校验、速率/规模上限、输出截断 | 新增 |
| `apps/server/src/plugins/sec-lab.ts` | 插件主体：manifest + 8 个工具 + 授权范围存储 + 审计 | 新增 |
| `apps/server/src/plugins/sec-lab-tools/recon.ts` | A 轨侦察（DNS/TLS/HTTP/子域） | 新增 |
| `apps/server/src/plugins/sec-lab-tools/portscan.ts` | A 轨端口扫描 + banner | 新增 |
| `apps/server/src/plugins/sec-lab-tools/webprobe.ts` | A 轨 Web 探测 + 指纹 CVE 匹配 | 新增 |
| `apps/server/src/plugins/sec-lab-tools/toolchain.ts` | B 轨外部工具探测与受控执行 | 新增 |
| `apps/server/src/index.ts` | `registerBuiltin(secLabManifest, secLabModule, true)`（非 MOBILE_MODE） | 改 |
| `apps/server/src/db.ts` | `SEC_AGENT_BUILTIN_TOOLS` + `a_builtin_sec_agent`（`force_sync: true`） | 改 |
| `packages/ui/src/views/plugin/SecConsole.vue` | 控制台页（P0 最小版：交战/范围管理 + 工具手动执行 + 结果区） | 新增 |

## 二、插件 manifest

```ts
export const secLabManifest: PluginManifest = {
  id: 'sec-lab',
  name: '安全工作台',
  version: '0.1.0',
  category: '安全',
  description: '...仅限自有资产或持有书面授权的目标...',
  permissions: ['shell', 'network'],
  contributes: {
    tools: ['scope_list','scope_add','scope_remove','recon','portscan','webprobe','toolchain','sec_report'],
    sidebar: [{ id:'sec', label:'安全', route:'/sec', icon:'shield', moreGroup:'sec', moreGroupLabel:'安全', order: 11 }],
    routes: [{ path:'/sec', name:'sec', component:'views/plugin/SecConsole.vue', meta:{ desktopOnly:true } }],
  },
  config: {
    type:'object',
    properties:{
      engagementMode: { type:'boolean', description:'交战模式：开启后允许侵入性动作（爆破/注入验证/横向），默认 false', default:false },
      maxConcurrency: { type:'number', default: 200 },
      scanTimeoutMs:  { type:'number', default: 120000 },
      maxPortsPerScan:{ type:'number', default: 65535 },
      redactReport:   { type:'boolean', default: true },
    },
  },
};
```

工具运行时名：`plugin_sec-lab__<tool>`（由 `index.ts:299` 的 `plugin_${pluginId}__${tool.name}` 规则自动加前缀）。

## 三、护栏设计（`sec-lab-guard.ts`）

纯函数、无副作用、可独立测试，形态对齐 `ops-shell-guard.ts`。

### 3.1 风险分级

```ts
export type RiskLevel = 'passive' | 'active' | 'intrusive';
export const TOOL_RISK: Record<string, RiskLevel> = {
  scope_list: 'passive', scope_add: 'passive', scope_remove: 'passive',
  sec_report: 'passive', toolchain: 'passive',
  recon: 'passive',
  portscan: 'active', webprobe: 'active',
};
// intrusive 级动作（爆破/注入验证/横向）在 P1 随工具一起登记，默认拒绝
```

### 3.2 授权范围校验（核心）

```ts
export interface ScopeEntry {
  id: string; type: 'domain'|'ip'|'cidr'; value: string;
  authorizedBy: string; evidence?: string;   // 授权人/证明材料
  expiresAt?: number;                        // 过期即失效
  maxRisk: RiskLevel;                        // 该目标允许的最高风险级
  note?: string;
}
export function inScope(target: string, scopes: ScopeEntry[], now = Date.now()): ScopeEntry | null
```

匹配规则：
- `ip`：精确匹配；`cidr`：IPv4 掩码包含判断；
- `domain`：精确匹配或以 `.` 结尾的父域匹配（`a.example.com` 命中 `example.com`）；
- 过期条目视为不存在；
- 返回命中的条目供后续 `maxRisk` 判断。

### 3.3 危险动作黑名单

复用 `ops-shell-guard.ts` 的破坏性规则，并叠加安全域专属：

```ts
export const DANGEROUS_PATTERNS: RegExp[] = [
  ...OPS_DANGEROUS,                       // rm -rf / mkfs / dd of= / fork bomb 等
  /\bnmap\b[^|;&]*--script\s+(dos|exploit|brute|fuzzer|intrusive)/i, // 需显式授权才放行
  /\b(sqlmap)\b[^|;&]*--(os-shell|os-cmd|sql-shell|file-write|reg-write)/i,
  /\bhydra\b[^|;&]*-M\b/i,                // 批量目标爆破
  /\b(msfconsole|msfvenom|meterpreter)\b/i,
  /\b(loic|hping3\s+--flood|slowloris)\b/i, // DoS
  /\b(rm|shred)\s+[^\n]*\/(var\/log|var\/log\/)/i,  // 清日志
  /bash\s+-i\s+>&\s+\/dev\/tcp/i,          // 反弹 shell
  /\b(chmod|wget|curl)\b[^\n]*\|\s*(ba)?sh\b/i,
];
```

### 3.4 主校验入口

```ts
export interface GuardInput {
  tool: string; target: string; command?: string;
  scopes: ScopeEntry[];
  config: { engagementMode: boolean; maxConcurrency: number; maxPortsPerScan: number };
  confirmed?: boolean;
}
export function guard(i: GuardInput): { ok: true } | { ok: false; reason: string }
```

判定顺序：目标非空 → 范围命中 → 风险级 ≤ 目标 `maxRisk` → 侵入级需 `engagementMode && confirmed` → 命令黑名单 → 规模上限。

### 3.5 速率与截断

- 并发池上限 `maxConcurrency`，端口数上限 `maxPortsPerScan`，单连接超时 `scanTimeoutMs`；
- 输出截断沿用 `capOutput`（16 KB，掐头留尾 + 截断标记）。

## 四、A 轨工具实现要点（零依赖）

| 工具 | 实现 | 依赖 |
|---|---|---|
| `recon` | `dns.promises.resolve4/6/MX/NS/TXT/CNAME`；`tls.connect` 取证书（`getPeerCertificate`）；`https.request` 取响应头做指纹与安全头审计；子域走内置小字典并发解析 | node 内置 |
| `portscan` | `net.Socket` 并发 connect，成功即抓 banner（首包读取，超时即放弃），端口→服务名映射表 | node 内置 |
| `webprobe` | 路径字典探测（状态码 + 标题 + 大小）、Cookie `Secure/HttpOnly/SameSite` 审计、CORS 反射检测、组件指纹正则 → 内置 CVE 规则子集匹配 | node 内置 |

输出统一为结构化对象再序列化为文本（模型易读 + 前端可渲染）：

```ts
interface ToolOutput { target: string; tool: string; risk: RiskLevel;
  summary: string; findings: Finding[]; raw?: unknown; truncated?: boolean }
interface Finding { title: string; severity: 'info'|'low'|'medium'|'high'|'critical';
  detail: string; remediation?: string }
```

## 五、B 轨外部工具接管

```ts
interface ExternalTool {
  name: string; binary: string[];            // 候选可执行名
  detect(): Promise<string | null>;          // 返回绝对路径或 null
  buildArgs(params): string[];
  parse(stdout: string): ToolOutput;
}
```

- `toolchain` 工具暴露 `action: 'detect' | 'run'`：detect 返回本机可用清单与版本；run 按白名单执行，参数数组化传给 `spawn`（`shell: false`），杜绝元字符注入。
- 未安装 → 返回安装建议，并提示同能力的 A 轨替代。

## 六、智能体接入

`apps/server/src/db.ts`：

```ts
const SEC_AGENT_BUILTIN_TOOLS = [
  'plugin_sec-lab__scope_list','plugin_sec-lab__scope_add','plugin_sec-lab__scope_remove',
  'plugin_sec-lab__recon','plugin_sec-lab__portscan','plugin_sec-lab__webprobe',
  'plugin_sec-lab__toolchain','plugin_sec-lab__sec_report',
  'task_plan','task_step','ask_user','confirm_user',
];
```

`a_builtin_sec_agent`（`type:'harness'`, `is_builtin:1`, `force_sync:true`, `maxReActSteps: 30`），系统提示词强制约束：

1. 动手前必须 `scope_list` 确认目标已授权；未授权 → 停止并要求用户先登记；
2. 先 passive 后 active，侵入动作必须先向用户说明并 `confirm_user`；
3. 每轮给出发现项与严重度，结束前 `sec_report` 出报告。

## 七、前端（P0 最小版）

`SecConsole.vue` 三区：
- 左：交战与授权范围列表（增/删/过期提示）
- 中：工具执行区（选工具 → 填参数 → 执行 → 结果表格/JSON；长任务输出流式展示）
- 右：对话模式入口（切换到安全助手智能体）

P1 再补 xterm 终端（复用 `local-console.ts` 的 SSE 方案 + `@xterm/xterm`）、findings 消息卡片、`/` 与 `@` 扩展点。

## 八、明确的技术约束

- 移动端 `MOBILE_MODE` 下不注册（无本地 shell / 网络扫描环境），与 ops-shell 一致。
- 插件 disabled 时工具从 ToolRegistry 注销，委派会得到明确报错（现有机制已覆盖）。
- 所有工具描述与插件页常驻合规声明：仅限自有资产或持有书面授权的目标。
