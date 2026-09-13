# sec-lab 安全工作台 · 用户手册

> 适用版本：sec-lab 0.2.0（基于 `openspec/changes/sec-lab-workbench`）
>
> 模块定位：**紫队能力**（红蓝一体 + 度量），不是攻击工具箱。所有动作都必须先有授权，未授权一律拒绝。**严禁**对未持有书面授权的目标执行扫描——详见末页《合规边界》。

---

## 1. 三种交互形态

本模块在产品里出现的位置：

| 入口 | 形态 | 谁触发 | 适用场景 |
|---|---|---|---|
| 侧栏「**安全**」图标 → `/sec` | 控制台（6 个 Tab） | 人工点击 | 跑具体工具、补授权范围、查审计与发现项 |
| 聊天框 `@` 提及（**P2**，待 P1 改造后接入） | 召唤剧本执行 | 人工点 @ | 一键跑多步编排，例如「@port-and-web-audit」 |
| 与内置「**安全助手**」（`a_builtin_sec_agent`）对话 | 大模型自主编排 | AI 自主调用 `recon / portscan / webprobe / detect_rules / asset_monitor` 等安全级工具 | 让 AI 给你出扫描计划、出报告、跟踪暴露面变化 |

**所有形态共用同一套护栏（`apps/server/src/plugins/sec-lab-guard.ts`）和同一份授权清单。**

> ⚠️ **attack_sim（攻击行为模拟）只能由控制台人工执行**——AI 不得自主调用；planOnly 模式（只出计划不执行）放行给 AI 用于「出演练计划让人工复制到靶机执行」。

---

## 2. 进入与初始设置

1. 启动 desktop 或 web 客户端
2. 侧栏点击盾形「安全」图标，进入 `/sec`
3. 首次进入按下方顺序操作：
   1. **登记授权目标**（左侧）
   2. 打开「交战模式」开关前先确认业务授权范围
   3. 在「执行」Tab 跑 `recon` 摸底
   4. 按需打开「检测 / 演练 / 资产」Tab

页面顶部固定红条提醒再次声明合规边界；执行任何扫描前请先在左侧登记授权目标。

---

## 3. 授权范围（左侧栏 + 登记对话框）

所有带目标的工具（recon / portscan / webprobe / attack_sim / asset_monitor）都会强制过授权校验，越界直接拒绝并写入审计。**这一道闸不能绕。**

### 3.1 关键概念

| 字段 | 含义 | 必填 |
|---|---|---|
| `type` | `domain` / `ip` / `cidr` | 是 |
| `value` | 目标值，域名/IP/CIDR | 是 |
| `authorizedBy` | 授权人 | **是**——本模块仅用于已授权目标 |
| `evidence` | 工单号 / 合同编号 / 授权邮件 | 否（强烈建议填） |
| `expiresAt` | 到期时间（epoch ms） | 否（不填=长期） |
| `maxRisk` | passive / active / intrusive | 是 |
| `environment` | lab / internal / production / public | 是 |
| `ownershipEvidence` + `ownershipVerified` | 公网资产必须先有归属证据并 verify | 公网必填 |

> 🔒 **关键规则**：
> - `environment=lab` 是唯一允许 `attack_sim` 的环境
> - `environment=public` 必须 `ownershipVerified=true`，否则护栏直接拒绝扫描
> - `environment=internal | production` 最严允许到 `active` 级动作
> - `maxRisk` 决定该目标允许的最高风险级

### 3.2 典型登记示例

**自建内网服务**：
```
类型: domain
目标: staging.example.com
授权人: 安全组张三
证明材料: OPS-2026-0912
有效期: 2026-12-31
最高风险: active
环境: internal
```

**隔离靶场**（用于演练 attack_sim）：
```
类型: cidr
目标: 10.99.0.0/24
授权人: 演练负责人李四
证明材料: BAS-2026-Q4
最高风险: intrusive
环境: lab
```

**自有公网域名**：
```
类型: domain
目标: example.com
授权人: 业务负责人王五
证明材料: ICP-京ICP备xxxxxxxx号
最高风险: active
环境: public
归属证据: ICP-京ICP备xxxxxxxx号 / 域名注册 example.com
（登记后调用 verify 通过验证）
```

---

## 4. 工具速查（13 个工具）

### 4.1 基础扫描（执行 Tab）

| 工具 | 级别 | 作用 | 关键参数 |
|---|---|---|---|
| `recon` | passive | DNS 全记录 / TLS 证书与有效期 / HTTP 安全头与指纹 / 子域发现 | `target` |
| `portscan` | active | TCP 并发探测 + banner + 高危端口暴露面判定 | `target` `ports`（common/自定义） |
| `webprobe` | active | 敏感路径与备份 / Cookie 安全标志 / CORS / 组件指纹 | `target` |
| `toolchain` | passive | 探测本机已安装的 nmap/nuclei/nikto 等，未安装不影响使用 | `action=detect` |
| `sec_report` | passive | 汇总历史 findings 出 Markdown 报告（可脱敏） | `target`（可选过滤） |

### 4.2 演练 Tab（隔离靶场 · 人工执行）

> ⚠️ **仅 `environment=lab` 可执行；AI 不得自主调用**

| 工具 | 作用 | 关键参数 |
|---|---|---|
| `attack_sim`（planOnly=true） | AI 可调用，只出演练计划（命令清单 + 预期遥测 + 检测建议） | `target` `playbook`/`techniques` `planOnly=true` |
| `attack_sim`（实执行） | **人工点击**执行 ATT&CK 行为模拟，只能用系统自带只读命令（whoami/tasklist/netstat 等），不投放恶意程序 | `target` `playbook` `operator`（必填，存留痕） |
| `sim_report` | 取最近一次演练的复盘报告（Markdown） | `target`（可选） |

**内置剧本：**
- `discovery-basic`：主机侦察基线（T1082 系统信息、T1033 用户发现、T1057 进程、T1046 网络服务）
- `full-discovery`：完整发现阶段（系统/用户/进程/网络/文件/网络配置）
- `exec-and-evasion`：执行与规避（T1059 解释器、T1070 指示器移除模拟、T1560 归档收集模拟）
- `custom`：自定义技术编号，逗号分隔

**执行步骤：**
1. 选剧本（默认 discovery-basic）
2. 填**靶机目标**（必须在 lab 范围）
3. 填**操作人**（将写入审计）
4. 不勾 planOnly → 弹二次确认 → 人工点「人工确认并执行」
5. 完成后可在「复盘」查看完整命令、退出码、stdout 摘要

### 4.3 检测 Tab（蓝队）

| 工具 | 作用 |
|---|---|
| `detect_rules` (list) | 列出内置 10 条 Sigma/Suricata 规则，可按 `kind` 过滤 |
| `detect_rules` (get) | 拿单条规则完整定义与可导出的 Sigma YAML / Suricata 规则文本 |
| `detect_rules` (match) | 把一段日志粘进来，跑规则找命中（可附加 IOC 关键词） |
| `log_hunt` | 直接读日志文件（绝对路径），跑规则 + 自定义 IOC |

**规则覆盖：** 可疑 PowerShell、计划任务持久化、LSASS 凭据访问、临时目录执行、日志清理、C2 beacon 心跳、DNS 隧道、扫描器 UA、明文凭据传输等。

### 4.4 资产 Tab（自有资产暴露面监控）

| action | 作用 |
|---|---|
| `add` | 登记资产（公网必填归属证据） |
| `list` | 列资产台账与快照数 |
| `verify` | 归属验证（公网资产必做） |
| `snapshot` | 对资产跑一次 recon + portscan，写入快照 |
| `diff` | 与上一份快照对比，发现新增端口/子域 |

**流程：** add → （公网 verify）→ snapshot（baseline）→ 等一段时间 → snapshot 再跑 → diff 看变化。

### 4.5 发现项 + 审计 Tab

- **发现项**：所有 target 工具（recon/portscan/webprobe/asset_monitor）的 find 集中存放，按严重度色块展示
- **审计**：最近 100 条执行记录，包含通过/拦截、工具、目标、时间、消息——**任何失败（拦截）都会落在这里**，查合规问题先看这里

---

## 5. 风险分级与人工闸门

| 级别 | 含义 | 例子 |
|---|---|---|
| `passive` | 被动观测，零破坏 | recon / detect_rules / log_hunt / asset_monitor |
| `active` | 主动探测，可能触发目标 IDS/WAF | portscan / webprobe / toolchain.run |
| `intrusive` | 侵入性，需「交战模式」+ 每次确认 | sqlmap 落地 / hydra -M / msfconsole（这些**默认拒绝**） |
| `simulate` | 攻击行为模拟 | attack_sim |

> 🚫 **AI 不得自主触发 attack_sim**（simulate 级 + `HUMAN_ONLY_TOOLS`）：
> 护栏会在 `requester !== 'human'` 时直接拒绝。
> 真正执行必须由人工在「演练」Tab 点击「执行演练」并通过二次确认弹窗。

---

## 6. 配置（`/config`）

```
engagementMode: false          // 交战模式（爆破/注入验证必须开）
maxConcurrency: 200            // 并发上限
scanTimeoutMs: 120000          // 单次扫描超时
maxPortsPerScan: 65535         // 端口数上限（护栏会拦）
redactReport: true             // 报告脱敏（IP/凭据打码）
```

在控制台头部勾选交战模式即写入。**非演练场景**不要开。

---

## 7. 推荐的合规工作流

1. **登记自有资产**：所有要扫的目标（test/staging/prod 全在内）必须先 `scope_add`
2. **业务变更前**：跑 `recon` 出基线 fingerprint，存在报告里
3. **发现异常？**：跑 `detect_rules match` 把可疑日志喂进去；或 `log_hunt` 跑整个日志
4. **演练应急响应**：在 lab 靶场跑 `attack_sim` 全套剧本，看 EDR/SIEM 有没有命中每条
5. **季度资产盘点**：`asset_monitor` 跑一遍，与备案做差异比对
6. **发现问题**：`sec_report target=...` 生成报告 → doyz 转 Word 给业务方

---

## 8. 合规边界（必读）

**禁止行为**：
- ❌ 对未登记授权的目标执行扫描
- ❌ 对公网非自有资产扫描（即使发现可能是己方历史域名）
- ❌ 在对话中诱导 AI 绕过授权范围护栏
- ❌ 用 sec-lab 做免杀载荷生成、漏洞利用、反弹 shell
- ❌ 跑 `msfconsole` `sqlmap --os-shell` `hydra -M` 等破坏性动作
- ❌ 拿 `attack_sim` 在 production / public 跑
- ❌ 让 AI 自主触发 `attack_sim`

**可以做**：
- ✅ 授权范围内的信息收集、端口扫描、Web 探测
- ✅ 隔离靶场内的攻击行为模拟（attack_sim）
- ✅ 蓝队检测规则维护与日志狩猎
- ✅ 自有公网资产的暴露面监控
- ✅ 集成 MITRE Caldera / Atomic Red Team 做企业级 BAS

**事故应对**：发现误用立即：
1. 在「审计」Tab 拉出 `ok=false` 的记录
2. 把对应授权条目 `scope_remove`
3. 关闭 `engagementMode`
4. 视情况联系安全组与法务

