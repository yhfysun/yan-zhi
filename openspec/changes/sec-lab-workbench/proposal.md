# 方案：安全测试工作台（sec-lab）插件

> 状态：方案定稿 + P0 骨架实施中（2026-09-13）
> 选型定案：**双轨工具（自研打底 + 外部接管）** / **全能力开放 + 强护栏** / 本轮出方案并搭骨架

## 一、现状调研结论（基于实际源码）

| 能力 | 现状 | 复用价值 |
|---|---|---|
| 插件体系 | `packages/core/src/plugin/`（manifest/loader/registry/permissions），后端 `PluginManager`，注册点 `apps/server/src/index.ts:242-256` | 直接照抄 |
| 最成熟模板 | `apps/server/src/plugins/ops-shell.ts`：manifest + 工具 + 侧栏 + 路由 + xterm 控制台 + `ops-shell-guard.ts` 危险黑名单 + 审计 + 专属智能体 | **整体形态对齐它** |
| 已有安全能力 | `packages/core/src/tool/builtin/security.ts`（Python，被动侦察：port_scan/http_headers/ssl_check/dns_lookup/subdomain）；另有 `port_scan`/`lan_scan`/`tcp_send`/`udp_send` 内置 | 能力重叠，P1 评估收敛去重 |
| `/` 命令 | `ChatInputArea.vue:556` 硬编码 5 条（`/agent` `/model` `/skill` `/dir` `/new`），无插件可注册扩展点 | 需扩展 |
| `@` 提及 | 同上 `:637-653`，**目前只能召唤文件**（`workspaceFiles`） | 需扩展为多模式 |
| 终端 | `@xterm/xterm ^6.0.0` 已装；`ChatConsolePanel.vue` 可复用；后端 `routes/local-console.ts`（spawn + SSE，137 行） | 控制台直接抄 |
| LLM 工具循环 | `apps/server/src/llm-task-manager.ts:667` 多步 ReAct，默认 maxSteps 100；智能体可配 `maxReActSteps` | 对话模式无需新建框架 |
| 工具权限 | `apps/server/src/tool-permission.ts:16 WRITE_TOOLS`，readonly 会话整体拒 `mcp_` 前缀 | 新工具需登记 |

## 二、目标与定位

做一个内置插件 **sec-lab（安全工作台）**，让 yan-zhi 具备"Kali 式"的安全评估能力，但比命令行工具箱多两层：**授权治理**与**大模型编排**。

定位：**企业/个人对自有资产或持有书面授权目标的合规安全评估**。不是匿名攻击工具——所有能力都建立在"目标必须在授权清单内"这一前提上。

三种交互，共用同一套工具与护栏：

| 交互 | 形态 | 入口 | 面向 |
|---|---|---|---|
| **命令模式** | `/scan 192.168.1.0/24`、`/sec` 打开控制台（xterm + SSE） | 输入框 `/` | 熟手，要确定性和可控性 |
| **剧本召唤** | `@信息收集`、`@Web常规审计` → 一键跑预定义多步剧本 | 输入框 `@`（扩展为 文件/剧本/工具 三模式） | 重复任务，可复用可分享 |
| **对话模式** | 选「安全助手」智能体，用自然语言说"帮我评估这台机器的暴露面"，模型自主编排多步工具 | 智能体选择器 | 探索性任务，产出结论而非原始数据 |

## 三、工具集设计（双轨）

### A 轨：零依赖内置层（默认可用，纯 Node 标准库）

不装任何东西就能跑。用 `net` / `dns` / `tls` / `https` 实现，P0 落 3 个核心工具：

| 工具 | 能力 | 风险级 |
|---|---|---|
| `recon` | 目标画像：DNS 全记录、TLS 证书链审计、HTTP 指纹与安全头、子域字典发现、WHOIS 摘要 | passive |
| `portscan` | TCP 端口扫描（并发可控）+ banner 抓取 + 常见服务推断 | active |
| `webprobe` | Web 面探测：目录/敏感文件探测、Cookie 安全标志、CORS/重定向配置、组件指纹 + CVE 规则匹配 | active |
| `scope_list` / `scope_add` / `scope_remove` | 授权范围（交战目标）管理 | 无 |
| `toolchain` | 检测本机可用的外部工具；受控执行（白名单 + 护栏） | 依参数 |
| `sec_report` | 汇总 findings 生成 Markdown/HTML 报告 | 无 |

### B 轨：外部工具接管层（检测到才启用）

若检测到 `nmap` / `masscan` / `nuclei` / `sqlmap` / `nikto` / `ffuf` / `hydra` / `whatweb` / `wpscan` / `searchsploit`，自动接管并统一解析为结构化 JSON（与 A 轨同 schema），模型无需知道底层换了引擎。

- 统一 adapter：`detect()` 探测路径 → `buildArgs()` 参数映射 → `parse()` 输出结构化。
- 未安装时工具返回"未检测到 X，建议安装：`<命令>`"，并自动降级到 A 轨实现，**功能不中断**。
- 命令拼装一律经 `sec-lab-guard.ts`，禁 shell 元字符注入（参数数组化，不拼字符串）。

### 侵入性能力（默认关闭，显式开启）

用户选"全能力开放"，故实现但**默认禁用**，需同时满足：
1. 插件配置里开启「交战模式」（`engagementMode: true`）
2. 目标在授权清单内且未过期
3. 单次调用带 `confirmed: true`

范围：弱口令爆破（限速 + 账户锁定保护提示）、SQL/命令注入验证（只读探测优先，写操作需额外开关）、内网横向探测。

## 四、安全护栏（hard requirements，非可选）

1. **授权范围（Scope）强校验**：所有工具执行前校验目标 host/CIDR/域名在授权清单内且未过期，越界直接拒绝并记审计。这是整个模块的合规基石。
2. **风险三级**：`passive`（默认放行）/ `active`（默认放行，限速）/ `intrusive`（默认拒绝，见上）。
3. **危险动作黑名单**：复用 `ops-shell-guard.ts` 模式建 `sec-lab-guard.ts`，禁 DoS/压力测试/蠕虫与破坏性 payload/未授权横向/清除日志/反弹 shell 靶向外网等，命中即拒。
4. **速率与规模上限**：并发、QPS、单次扫描端口数、超时、输出截断（复用 `capOutput` 思路）均可配，超限返回结构化错误。
5. **全量审计**：每次调用写 `plugin_storage`（时间/工具/目标/参数摘要/结果摘要/风险级），插件页可查。
6. **报告脱敏**：报告导出可选打码凭据与内网 IP。
7. **权限声明**：manifest `permissions: ['shell', 'network']`，启用时在插件页明示风险。

## 五、数据模型

存 `plugin_storage`（`plugin_id='sec-lab'`），键：

| key | 内容 |
|---|---|
| `engagements` | 交战/评估任务：`{id, name, owner, scopeIds[], createdAt, status}` |
| `scopes` | 授权目标：`{id, type: 'domain'\|'ip'\|'cidr', value, authorizedBy, evidence, expiresAt, maxRisk}` |
| `findings` | 发现项：`{id, engagementId, title, severity, cvss, target, evidence, repro, remediation, createdAt}` |
| `runs` | 执行记录：`{id, tool, args, target, startedAt, endedAt, status, summary}` |
| `audit` | 审计流水（环形上限 500） |
| `config` | 插件配置（超时/并发/交战模式/脱敏） |

## 六、分期任务

- **P0（本轮）**：方案 + 插件骨架 + 护栏 + 授权范围模型 + 3 个核心工具 + 专属智能体 + 最小控制台页。
- **P1**：`/` 命令注册扩展点 + `@` 剧本召唤 + 完整 xterm 控制台三栏 UI + findings 消息卡片 + 外部工具 adapter 落地（nmap/nuclei/sqlmap）+ 报告导出。
- **P2**：剧本市场（内置剧本包 + 自定义 YAML 剧本）、CVE 离线库、合规基线（等保 2.0 / CIS Benchmark / OWASP Top 10 检查表）、定时巡检任务。
- **P3**：团队协作（多用户交战隔离）、与运维插件联动（拿到 SSH 连接后做主机侧基线核查）、报告走 doyz 文档通道导出 Word/PDF。

## 七、风险分级

- **High**：功能被用于对未授权目标——靠授权范围强校验 + 审计 + 侵入能力默认关兜底；**插件页与工具描述必须常驻"仅限自有资产或已授权目标"声明**。
- **Medium**：外部工具输出解析随版本漂移（adapter 需容错 + 版本探测）；大模型可能绕过护栏反复尝试（审计 + 越界次数阈值后自动降级）。
- **Low**：`security.py` 与新增 `recon` 能力重叠（P1 去重）；扫描输出体积大（截断 + 结构化摘要优先）。

## 八、明确不做（本次范围外）

- 不做匿名化/代理跳板/流量隐匿（那是攻击侧需求，与合规定位冲突）。
- 不做免杀、载荷生成、C2 框架。
- 不做针对第三方云厂商/公网随机目标的批量扫描（授权范围模型天然拒绝）。
- 移动端（MOBILE_MODE）不注册本插件（无本地 shell 与网络扫描环境）。
