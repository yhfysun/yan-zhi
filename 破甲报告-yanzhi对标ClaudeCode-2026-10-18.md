# 破甲报告：言智 yan-zhi × Claude Code

> 日期：2026-10-18 ｜ 方法：源码实地核查（结论带 `文件:行号`）+ Claude Code 公开架构资料交叉验证
> 量化基线：674 个源文件 / 约 2.8 万行（server+core+shared+ui+desktop，不含测试与 dist）；391 个测试文件；649 次提交（近 30 天 460 次）

---

## 0. 一页纸结论

| 问题 | 结论 |
|------|------|
| 言智是什么 | "语言即界面"的三端智能体平台：GUI 产品（Vue 3）包着一个自带 harness 的后端，心脏是 `llm-task-manager.ts` 单文件 8357 行的 ReAct 循环 |
| Claude Code 是什么 | 六层 harness 围一个 agent 循环的**可编程运行时**，不是"一个产品"——hooks/skills/subagents/MCP 四原语 + Agent SDK |
| 谁更强 | 无单一答案：言智强在**工具生态（87+168）与三端覆盖**；Claude Code 强在**安全权限、扩展机制、可观测性** |
| 言智最该偷 CC 的 | 27 事件 hooks 生命周期、工具池 5 步装配管道、sidechain JSONL 会话持久化、per-prompt 快照撤销 |
| CC 偷不动言智的 | 三端 GUI、"语言即界面"（管理面全工具化）、分级 microcompact、工具循环防护、computer-use 浏览器执行面、前端授权卡 |

---

## 1. 言智解剖：六层结构

### 1.1 客户端层（packages/ui）
44 个视图 + 120 个组件，一套 Vue 3 代码库覆盖 Electron / Web PWA / Capacitor 三端。前端只做展示与交互，智能体定义（含工作流/挂载/子智能体）全部归后端 `agent` 表（`apps/server/src/routes/agents.ts:1-3`）。

### 1.2 桌面壳（apps/desktop，Electron 44.7.2，main.cjs 6729 行）
- **窗口体系**：splash / main / BrowserView / 子窗 / snip 截图窗 / 托盘守护（关窗不杀后端）
- **双浏览引擎**：webview（默认，渲染层承载）↔ browerview（主进程图层），运行时 IPC 可切（`main.cjs:204`）
- **pageAgent**：AI 操作浏览器的执行面统称——向 guest 注入虚拟光标 + 元素编号注册表（穿透同源 iframe），唯一实现 `runBrowserAction` 分发 40 个 action（`main.cjs:3365`）；反自动化检测（移除 `navigator.webdriver`）
- **安全装甲**：四道导航闸（shell 白名单 / setWindowOpenHandler / guardNavigation 全 webContents 兜底 / guest popup 重定向）+ CSP 注入 + keyring（safeStorage/DPAPI）加密 + 急停热键 Ctrl+Alt+Escape（不可禁用）+ 浏览器桥 7 条威胁模型
- **后端启动**：spawn 子进程（dev 走 tsx watch，生产走 resourcesPath 下的编译产物），健康检查 120s 超时；端口单一真相源 3001（dev 与安装版同端口）

### 1.3 服务端 harness（apps/server，Express :3001）
60+ 路由 / 90+ services。`llm-task-manager.ts`（8357 行）是心脏：任务创建、SSE 事件流、ReAct 主循环、子智能体、工具执行漏斗全在这一个文件里。

### 1.4 core 库（packages/core）
| 子系统 | 内容 |
|--------|------|
| tool | ToolRegistry（87 内置在册）+ 沙箱自定义工具 + **统一输出闸**（registry.execute 唯一出口裁 64KB，`registry.ts:74-95`） |
| llm | 三协议客户端（OpenAI Chat / Anthropic Messages / Responses），key 轮换、400 重试剥离、工具参数 heal、上游错误可行动化（`client.ts:1434 行`） |
| compress | 分级压缩：老工具输出裁剪 → 整段摘要；摘要前缀指纹缓存；压缩落库 |
| skill | SKILL.md 解析器（纯函数零依赖）+ DB skill 表 + 项目级 `.yan-zhi/skills/` 目录扫描 |
| mcp | stdio / SSE / Streamable HTTP 三 transport（server 侧另有一套完整握手的 stdio 客户端） |
| workflow | DAG 引擎（`engine.ts` + `nodes.ts`）+ 工作流型子智能体 |

### 1.5 数据层
SQLite（better-sqlite3 + sqlite-vec 向量检索）单库 `data.db`；memory 记忆表；artifacts 产物目录按任务 id 命名。

### 1.6 LLM 上游
Anthropic / OpenAI / 国产厂商（火山、智谱、百炼）多平台 + key pool + 候选池故障转移（`isPoolFailoverable` 读 err.status）+ 用量账本（¥ 计价）。

---

## 2. ReAct 心脏：主循环逐工位（llm-task-manager.ts）

**双层循环**（`3300-3304`）：外层 = 自动接力批次（硬顶 autoContinueHardCap），内层 = 单批 ReAct 步数（默认 100，运行中可调）。"何时停"由停滞判定决定，而非固定步数。

**每一步**（`3314-3400`）：
1. `buildContextView` —— 上下文组装唯一出口：剔除子智能体消息、压缩判定、**压缩结果落库**（下一步读到"摘要+增量"而非每步重压）
2. 记忆抢救节流：每个接力批次一次（`beforeCompress`，`3345-3361`）
3. system prompt + 图片展开（`已存档: <path>` 标记 → 视觉模型真正看到截图）
4. 流式请求 → 工具调用累积 → `executeTool`

**executeTool 十步漏斗**（单一执行出口，`4722-5075`）：
权限闸 → 挂载校验 → 参数归一化 → **循环防护** → 缺参检查 → 用户钩子 deny/confirm → path-guard 工作目录边界 → 分发（内置/API/MCP/委派）→ after 钩子

**工具循环防护**（tool-loop-guard.ts）：A 线同参重复（窗口 16 次内 ≥2 次，读外部状态类豁免）+ B 线单工具严格连续 ≥8 次 + 硬闸（累计拦截 ≥3 次 → `[FORCE_STOP]` 终止循环）。

---

## 3. 上下文工程：比 CC 更细的一环

| 环节 | 言智 | Claude Code |
|------|------|-------------|
| 触发 | 模型窗口 × 0.5（双重保守：估算偏低 + 留输出空间） | 窗口将满时 |
| 第一级 | 保留窗口外的老 tool 消息裁到 8KB（头 75%/尾 25%） | 旧 tool 输出整体清除 |
| 第二级 | 整段 LLM 摘要（保留工具名与参数原文），带超时降级 | compaction 摘要 |
| 第三级 | 增量摘要链上限 6000 字符，超了全量重摘 | 每会话一份新摘要 |
| 缓存 | 前缀指纹（消息 id 序列）命中只摘增量 | 无等价物 |
| 落库 | message_summary 表，进程重启不丢 | transcript JSONL |

设计动机全部记录在 `docs/上下文分层与压缩-方案.md` 与 `window.ts` 头部注释：实测单会话 1156 条消息 / 真实 prompt ≈ 22 万 token 的教训。

---

## 4. 多智能体：四元组 + 预算 + 隔离

- 运行时四元组 Φ=(I,C,T,M)（指令/上下文/工具/模型），对齐 AOrchestra（`services/subagent-spec.ts`）
- 三重工具裁剪：父挂载子集 + 黑名单（禁递归委派/自我提权）+ 权限，fail-closed
- spawn 预算：单任务上限 12；后台并行并发闸 3（刻意不排队）
- 上下文隔离：消息按 `parentToolCallId` 过滤、独立摘要缓存、不写主循环摘要
- 模型优先级：调用方 > 子体 > 父任务 > 候选池，带故障转移链

---

## 5. Claude Code 六层 harness（公开架构交叉验证）

1. **Input**：CLI 单一入口；6 种权限模式（default/acceptEdits/plan/auto/dontAsk/bypassPermissions）；项目信任门
2. **Knowledge**：CLAUDE.md 四级层级（managed/user/project/local）；auto memory；skills（SKILL.md，5000 token/个、25000 全局预算）；compaction（CLAUDE.md 压缩后重载）
3. **Execution**：54 个基础工具；只读并行 / 写串行；prompt caching（缓存读约省 90%）；per-prompt 文件快照撤销
4. **Integration**：MCP 7 种传输；Tool Search 按需加载 schema（实测省 19 万 token）；plugins 10 类组件
5. **Multi-agent**：6 内置 subagent + 自定义 agents；worktree/remote/in-process 三隔离；sidechain JSONL（子agent 历史不进父上下文）；POSIX flock 多实例协调；agent teams（实验）
6. **Observability**：27 个生命周期事件 hooks；4 种 handler（shell/LLM/webhook/subagent verifier）；Agent SDK 暴露成本/预算/ ResultMessage

**工具池装配 5 步管道**：基础枚举 → mode 过滤 → deny 预过滤 → MCP 集成 → 去重。
**9 个有序上下文源**：system prompt → 环境信息 → CLAUDE.md → 路径规则 → auto memory → 工具元数据 → 对话历史 → 工具结果 → compact 摘要。

---

## 6. 正面对比矩阵

| 维度 | 言智 | Claude Code | 优势方 |
|------|------|-------------|--------|
| 产品形态 | 三端 GUI + 后端 harness | CLI only | 言智 |
| Agent 循环 | 双层（接力批次 × ReAct 步数），停滞判定收尾 | 五阶段 loop，max-turns/预算收尾 | 平 |
| 工具规模 | 87 内置 + 168 api_* 渐进式发现 + MCP + 沙箱 | 54 基础 + MCP（Tool Search 按需） | 言智 |
| 上下文工程 | 分级压缩 + 前缀指纹缓存 + 落库 + 记忆抢救 | compaction + CLAUDE.md + memory files | 言智（细节） |
| 多智能体 | 四元组 + 预算 + 隔离 + 后台并行 | subagents + teams + worktree + sidechain | CC（形态） |
| 权限安全 | 四级模式 + 授权卡 + 四闸 + loop guard + 急停键 | 细粒度 allow/deny/ask + 27 hooks + 信任门 | CC |
| 扩展机制 | skill/MCP/插件/三层商城；hooks 半成品 | hooks/skills/subagents/MCP 四原语 + marketplace | CC |
| 会话持久化 | SQLite 全量消息 + 摘要表 | append-only JSONL transcript + history.jsonl | 平 |
| 可观测性 | SSE 事件 + 全链路日志 + 账本 | 27 事件 + SDK 成本消息 | CC |
| 成本控制 | key pool + 候选池 + 账本 + 自填 hardStop | cache + Tool Search + max_budget_usd | 平 |
| computer-use | 内置浏览器执行面（pageAgent 40 动作 + 双引擎） | 无（靠 MCP playwright） | 言智 |
| 自动更新 | 无（版本分档构建期注入） | CLI npm 分发 | CC |

---

## 7. 破甲点：软肋清单（按风险排序）

### 言智
1. **[高] 单文件心脏 8357 行** —— 并行会话同文件编辑必冲突（实锤：Models.vue 11 个 hunk 仅 4 个归属自己）；git 拆 hunk 靠人工纪律而非工具链
2. **[高] 全量历史原样发送** —— 未超阈值 = 全量历史 + 每步动态构建的 systemPrompt 原样发，prompt cache 命中率存疑（CC 靠稳定前缀吃到缓存红利）
3. **[中] hooks 半成品** —— 通用 before 钩子零调用点；用户钩子仅 deny/confirm 两动作、子串匹配（刻意不用正则）；对照 CC 的 27 事件 × 4 handler
4. **[中] 桌面端无自动更新** —— 无 electron-updater，三份 electron-builder yml 无 publish 配置
5. **[低] UI 细节缺口** —— 聊天区无虚拟滚动；token 用量已计算未接线到界面（方案文档 C/D 条）
6. 已知缺陷：core 侧 MCP stdio 客户端不发 initialize 握手、丢 childId（server 侧另有一套完整的）

### Claude Code
1. **[高] CLI only** —— 非技术用户零覆盖；"语言即界面"这类形态只有 GUI 能承载
2. **[高] 200K 窗口硬顶** —— 长任务靠 compaction/subagent 腾挪，本质拆东墙补西墙
3. **[中] CLAUDE.md 概率性遵守** —— 确定性只靠 permission rules 与 hooks，规则外是概率
4. **[中] 上下文成本隐性** —— MCP schema 每轮计费；subagent 约 7 倍 token
5. **[中] harness 黑盒** —— 系统提示词/工具定义不可完全审计；无内置 computer-use 浏览器

---

## 8. 相互偷师清单

### 言智该偷 CC 的（按性价比排序）
1. **27 事件 hooks 生命周期** —— 把 tool-hooks.ts 的 before 钩子真正接到 executeTool 漏斗（现在预留未用）；用户钩子从 deny/confirm 扩到 shell/webhook 动作
2. **工具池 5 步装配管道** —— mode 过滤 + deny 预过滤 + 去重，现在 87 工具全量挂载到每个 agent
3. **sidechain JSONL + flock** —— 会话持久化与多实例协调的零依赖方案
4. **per-prompt 快照撤销** —— 用户视角的一键回退
5. **系统提示词稳定前缀** —— 把动态部分后置，吃 prompt caching 红利（直接省钱）

### CC 结构上偷不动言智的
1. 三端 GUI + "语言即界面"：所有管理接口都是 LLM 可调工具（管理工具 8 个 + api_* 168 个）
2. 分级 microcompact：老工具输出裁剪比 CC 的"整体清除"温和得多，保住对话结构
3. 工具循环防护 A/B 线 + FORCE_STOP：CC 无等价物，模型"换着花样重试同一目标"只能靠提示词压
4. computer-use 浏览器执行面 + 前端授权卡（比 CLI y/n 更适合非技术用户）
5. 压缩落库 + 前缀指纹缓存：进程重启不丢、每步不重算

---

## 9. 附录：关键文件索引

| 主题 | 文件 |
|------|------|
| ReAct 主循环 | `apps/server/src/llm-task-manager.ts:2911-3400` |
| 工具执行漏斗 | `apps/server/src/llm-task-manager.ts:4722-5075` |
| 工具注册表 + 输出闸 | `packages/core/src/tool/registry.ts` |
| 上下文压缩 | `packages/core/src/compress/window.ts` |
| 循环防护 | `apps/server/src/services/tool-loop-guard.ts` |
| 权限模式 | `apps/server/src/tool-permission.ts` |
| 用户钩子 | `apps/server/src/services/user-hooks.ts` |
| 子智能体规格 | `apps/server/src/services/subagent-spec.ts` |
| Electron 主进程 | `apps/desktop/main.cjs` |
| 浏览器目标解析 | `apps/desktop/browser-target.cjs` |
| 上下文方案文档 | `docs/上下文分层与压缩-方案.md` |
