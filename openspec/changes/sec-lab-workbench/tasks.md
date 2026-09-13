# 任务清单：sec-lab 安全工作台

## P0 骨架（已完成 2026-09-13）

### 方案
- [x] `openspec/changes/sec-lab-workbench/proposal.md`
- [x] `openspec/changes/sec-lab-workbench/design.md`
- [x] `openspec/changes/sec-lab-workbench/tasks.md`

### 护栏（`apps/server/src/plugins/sec-lab-guard.ts`）
- [x] 风险分级 `TOOL_RISK`（passive / active / intrusive）
- [x] 授权范围 `ScopeEntry` + `inScope()`（ip 精确 / cidr 掩码 / 域名父域匹配 + 过期判定）
- [x] `DANGEROUS_PATTERNS`（复用 ops-shell 破坏性规则 + 安全域专属：DoS / 反弹 shell / sqlmap 落地动作 / msf / 清日志 / hydra -M）
- [x] `guard()` 主入口（范围 → 风险级 → 交战模式 → 黑名单 → 规模上限）+ `parsePorts()` + `capOutput()`

### 插件主体（`apps/server/src/plugins/sec-lab.ts` + `sec-lab-tools/`）
- [x] manifest（`permissions: ['shell','network']` + 8 工具 + sidebar + routes + config）
- [x] `scope_list` / `scope_add` / `scope_remove`（plugin_storage 持久化）
- [x] `recon`：DNS / TLS / HTTP 指纹与安全头 / 子域（零依赖，passive）
- [x] `portscan`：并发 TCP connect + banner + 高危端口暴露面判定
- [x] `webprobe`：敏感路径 / Cookie / CORS / 组件指纹（Shiro/ThinkPHP/Jenkins/Tomcat…）
- [x] `toolchain`：外部工具 detect + 白名单受控 run（参数数组化，shell:false）
- [x] `sec_report`：findings 汇总出 Markdown 报告（含脱敏）
- [x] 审计流水（环形 500 条）+ findings 池（2000 条）写入 plugin_storage
- [x] 后端路由 `/api/plugin/sec-lab/*`（scopes / run / findings / toolchain / audit / config）

### 接入
- [x] `apps/server/src/index.ts`：`registerBuiltin(secLabManifest, secLabModule, true)`（非 MOBILE_MODE）
- [x] `apps/server/src/db.ts`：`SEC_AGENT_BUILTIN_TOOLS` + `a_builtin_sec_agent`（harness / main / force_sync / maxReActSteps 30）
- [x] `packages/ui/src/views/plugin/SecConsole.vue`：授权范围管理 + 工具执行 + 发现项 + 工具链 + 审计
- [x] 侧栏「安全」入口 + `plugin-icons.ts` 补 `shield: Shield`

### 验证
- [x] `apps/server` tsc 通过；`packages/ui` vue-tsc 通过
- [x] 护栏冒烟：越界 / 过期 / 危险命令 / 端口上限全部拦截；端口解析与 CIDR、父域匹配正确
- [x] portscan 实跑（127.0.0.1）成功出结果
- [x] seed 冒烟：`a_builtin_sec_agent` 入库，挂载 12 个工具

## P0+1：紫队 / 蓝队 / 资产监控（已完成 2026-09-14）

方向：紫队一体——授权靶场内做攻击行为模拟（BAS），蓝队做检测规则与日志狩猎，自有资产做暴露面监控。
**不做**：免杀、载荷生成、通用 C2 框架、对公网随机目标的批量扫描（详见上方对话）。

### 护栏扩展（`apps/server/src/plugins/sec-lab-guard.ts`）
- [x] 目标环境分级 `Environment`（lab / internal / production / public）
- [x] 动作分级 `ActionClass`（passive / active / intrusive / simulate）+ `ENV_MAX_CLASS` 矩阵
  - 公网只允许 passive；攻击模拟仅 lab 环境
- [x] `HUMAN_ONLY_TOOLS` 闸门：AI 不得自主调用，需 `requester='human'`（控制台手动点击）
- [x] 公网资产归属验证 `ownershipVerified` + `ownershipEvidence`（未验证护栏直接拒绝）
- [x] scope_add 输入校验：公网资产必须先有归属证据

### 新工具（`sec-lab-tools/`）
- [x] `attacksim.ts`：基于 ATT&CK 的无害行为模拟（whoami/tasklist/netstat…），3 个内置剧本（主机侦察基线 / 完整发现阶段 / 执行与规避），白名单 + 元字符校验，15s 超时 + 输出截断，演练记录留痕到 `K_EXERCISES`
- [x] `blueteam.ts`：内置 10 条 Sigma/Suricata 检测规则（可疑 PowerShell / 持久化 / LSASS 访问 / 临时目录执行 / 日志清理 / C2 beacon / DNS 隧道 / 扫描器 UA / 明文凭据），支持 list / get / match / log_hunt（读文件 + IOC）
- [x] `easm.ts`：资产登记 / 列表 / 归属验证 / 快照 / 差异比对，公网资产必须先 verify

### 主插件（`apps/server/src/plugins/sec-lab.ts`）
- [x] 注册工具扩到 13 个（scope_list/add/remove、recon/portscan/webprobe/toolchain/sec_report、attack_sim/sim_report、detect_rules/log_hunt、asset_monitor）
- [x] `/run` 路由扩到全部工具，注入 `__sec_runner` 秘密前缀强制 `requester=human`（物理上不能被 AI 偷用）
- [x] `attack_sim` 实执行强制 requester=human；planOnly 模式放行给 AI（仅生成计划）
- [x] 演练记录写入 `K_EXERCISES`（环形 200 条）供复盘

### 控制台（`packages/ui/src/views/plugin/SecConsole.vue`）
- [x] 6 个 Tab：执行 / 演练 / 检测 / 资产 / 发现项 / 审计
- [x] 演练 tab：operator 必填 + planOnly 勾选 + 二次确认弹窗（人工点确认）
- [x] 检测 tab：规则 list/get/match + log_hunt（路径 + IOC）
- [x] 资产 tab：登记 / 列表 / 归属验证 / 快照 / 差异
- [x] 登记授权 dialog 加 environment 与 ownershipEvidence 字段

### 验证
- [ ] tsc / vue-tsc 重跑
- [ ] attack_sim 冒烟：lab 环境 + human 通过；internal + agent 被拒；planOnly+agent 通过
- [ ] detect_rules match 跑一段样例日志命中 YZ-007
- [ ] asset_monitor 端到端：add → list → snapshot → 再 snapshot → diff

## P2 交互完善

- [ ] `/` 命令扩展点：插件可注册 slash command（改 `ChatInputArea.vue:556` 硬编码数组为注册表），加 `/scan` `/recon` 等
- [ ] `@` 提及扩展为 文件 / 剧本 / 工具 三模式（改 `ChatInputArea.vue:637` 的 `atFileList`）
- [ ] 剧本（Playbook）模型：YAML 多步编排 + 内置剧本包（信息收集 / Web 常规审计 / 内网暴露面）
- [ ] 完整控制台：xterm 终端（SSE，抄 `routes/local-console.ts`）+ 三栏布局
- [ ] findings 消息卡片（严重度色块 + 折叠详情），走 `Message.dataView` 扩展
- [ ] B 轨 adapter 补全：nmap / nuclei / nikto / ffuf 输出解析与版本容错
- [ ] 报告导出 Markdown / HTML 文件
- [ ] 与既有 `packages/core/.../builtin/security.ts`（Python 被动侦察）去重收敛

## P2 能力扩展

- [ ] 剧本市场（内置 + 自定义上传）
- [ ] 离线 CVE 库 + NVD 在线查询
- [ ] 合规基线：等保 2.0 / CIS Benchmark / OWASP Top 10 检查表
- [ ] 定时巡检任务与告警

## P3 协同

- [ ] 多用户交战隔离
- [ ] 与 ops-shell 联动（SSH 连接 → 主机侧基线核查）
- [ ] 报告走 doyz 通道导出 Word / PDF
