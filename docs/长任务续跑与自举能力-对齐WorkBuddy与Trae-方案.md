# 长任务续跑 + 自举能力 —— 对齐 WorkBuddy / Trae 的差距分析与优化方案

> 调研日期：2026-09-28
> 方法：源码实地核查（所有结论带 `文件:行号` 依据），非推测
> 范围：**只出方案，未动任何代码**。确认后按 P0 → P1 → P2 顺序开干。
> 用户诉求原文（归并）：① 100 步达上限自动总结 → 应该有「记忆整理」，并**依据整理结果继续任务**，不要一直断；② 大模型发现没有对应工具时，能否**自己写 Python/Node 自定义工具并挂载调用**；③ 发现没有对应 skill 时能否**自己去下载**；④ 整体对照 WorkBuddy / Trae 还有哪些功能缺失。

---

## 零、结论先行（一页纸）

| # | 结论 | 级别 |
|---|---|---|
| 1 | **断了是真的断**：达 `maxSteps` 后写一条总结 + 落一次空间记忆，然后**任务终止**，全仓库**没有任何自动续跑机制**（`grep autoContinue\|自动继续\|续跑` 在对话链路零命中）。用户必须手动再说一句"继续"。 | ★★★ |
| 2 | **"依据整理的记忆继续"缺了中间那一段**：空间 `MEMORY.md` **会**注入下一轮，但 `task_plan`（做到第几步）**落盘了却从不回注提示词**（`grep -c taskPlan llm-task-manager.ts` = **0**）。所以模型看得到"上一批做到哪"，看不到"原计划还剩什么"。 | ★★★ |
| 3 | **自举能力代码写了、工具挂了 0 个**：`api_custom_tool_create` / `api_skill_create` / `api_skill_install` / `api_tool_install` / `api_agent_mount` / `get_api_tools` 在 `api-tool-executor.ts` 里**全部实现**，但**没有任何一个出现在智能体的 `builtin_tool_ids` 里** → 模型根本看不到，全部空转。 | ★★★ |
| 4 | **记忆整理不参与任务收尾**：`memory-dreaming.ts` 只在每日 02:30 后台跑，任务收尾只做一次 `extractMemoryFromConversation` → `max_steps` 的总结是**一团文本**塞进 MEMORY.md，没有"已完成 / 待办"结构化拆分。 | ★★ |
| 5 | **上下文压缩是"悬崖式"**：`ContextWindow` 保留窗口 `keepRecent=6`，模型默认 `contextWindow` = **1M**（`constants.ts:14`）→ 实际几乎永不触发；一旦触发就**丢掉前面全部**，只留一条 400 字摘要。 | ★★ |
| 6 | **规则文件（AGENTS.md）完全不识别**：`grep AGENTS.md` 在 `apps/server` / `packages/core` / `packages/ui` **零命中**。 | ★★ |
| 7 | **沙箱装不了依赖**：`dependencies_json` 字段建了表、写了 INSERT，但 `runUserCode` **从不读它**；python 运行时注释明确写"依赖在构建期已预烤，运行期不再 pip"。 | ★★ |

---

## 一、用户痛点 ①：长任务的"断"在哪（源码链路）

### 1.1 当前真实链路（主智能体）

```
runReActLoop(task, params)                        llm-task-manager.ts:887
  maxSteps = params.maxSteps || 100                            :904
  for (step = 0; step < maxSteps; step++)                      :1085
      ├─ 暂停检查 waitIfPaused                                   :1087
      ├─ 加载消息 + 超限压缩 ContextWindow.compress              :1092-1111
      ├─ LLM 调用（带 tools）                                    :1245
      ├─ 无工具调用 → 完成，return                                :1296-1314
      └─ 有工具调用 → 逐个执行 → 落库 → 下一轮                    :1343-1429
  ── for 循环自然结束（step == maxSteps）──
  summarizeOnMaxSteps(...)  → 无工具追加一轮，要"进展总结"        :1444 / 定义 :2429
  落一条 assistant 消息 + task:completed                        :1449-1452
  recordTaskProgress(task, 'max_steps', tipText)   → 夹带写空间记忆 :1455
  extractMemoryFromConversation(task)              → 写 memory 表   :1456
  ★ return —— 没有任何"继续"                                  ✗ 缺口
```

**关键缺口**：`:1434-1456` 这一段是**纯收尾**，没有任何"评估是否该继续 / 自动开新一轮"的分支。

### 1.2 为什么"依据整理的记忆继续"续不上

链路上其实**已经有**四份记忆注入（`llm-task-manager.ts:996-1050`），但它们解决的是「换会话后知道做过什么」，不解决「同一任务接着做」：

| 记忆载体 | 落盘 | 是否注入下轮提示词 | 位置 |
|---|---|---|---|
| `memory` 表（agent/session/daily） | ✅ | ✅ 按相关性检索，预算 **600 token** | `memory-service.ts:190-...`、`:80` |
| 空间 `MEMORY.md` | ✅ | ✅ 上限 **6000 字符**，超限硬截断 | `space-memory.ts:17,142` |
| 任务决策 `decisions.md` | ✅ | ✅ 上限 **3000 字符** | `space-memory.ts:182,241` |
| 任务进展 `progress.md` | ✅ | ❌ **明确"不自动注入"** | `space-memory.ts:270-280` |
| **任务计划 `task_plan_json`** | ✅ 落盘 | ❌ **从不回注**（`grep -c taskPlan` = 0） | `db.ts:436`、`conversations.ts:89-95`、`chat.ts:564-577` |

**这就是"断"的技术根因**：
- 模型知道"上一批做到第 3 章"（MEMORY.md 里有），但**不知道原计划的第 4-10 章是什么**（task_plan 不回注）；
- `progress.md` 有逐批明细，但**只在模型主动调 `api_space_memory_read` 时才看得到**——而长任务跑偏时模型根本不会去调。

### 1.3 顺带发现的两个"提前停机"门槛

1. **前端把步数下限锁死在 100**（`packages/ui/src/stores/chat.ts:1465-1471`）：
   ```ts
   const steps = agent?.config?.maxReActSteps;
   if (typeof steps === 'number' && steps >= 100) return steps;
   return 100; // 低于 100 的旧配置值也兜底到 100
   ```
   用户想把 `maxReActSteps` 从 100 调到 40（快速迭代场景）**做不到**，配置被静默抬到 100。
2. **后端同样 `Math.min(..., 100)` 封顶**（`llm-task-manager.ts:2160`）：即使未来放开门槛，单文件上限仍是 100。

---

## 二、用户痛点 ②③：自举能力（自造工具 / 自装 Skill）的真实状态

### 2.1 代码都在，工具挂了 **0** 个

用脚本对 `api-tools/*.ts` 声明的 162 个 API 工具，逐个在「种子 + 智能体挂载清单」里找引用：

```
API 工具总数: 162
在种子/挂载清单里出现过: 26
★ 从未出现在任何种子/挂载清单里的: 136 个
```

其中**自举 / 长任务直接相关的 12 个，全部未挂载**：

| 工具 | 实现位置 | 挂载状态 |
|---|---|---|
| `get_api_tools`（渐进式 API 发现的总入口） | `management.ts:102` | ❌ 未挂载 |
| `api_custom_tool_create` / `_update` / `_execute` | `api-tool-executor.ts:2612 / ...` | ❌ 未挂载 |
| `api_tool_install`（从商城装工具） | `api-tool-executor.ts:3345` | ❌ 未挂载 |
| `api_skill_create` / `_update` / `_install` | `api-tool-executor.ts:3288 / 2588` | ❌ 未挂载 |
| `api_agent_create` / `_update` / `_mount` | `packages/core/.../agent.ts:8-11` | ❌ 未挂载 |
| `api_marketplace_browse` / `_install` | `api-tool-executor.ts:2665` | ❌ 未挂载 |
| `api_space_memory_read` / `_append` | — | ✅ 已在（09-27 修） |
| `api_conversation_setup` | — | ✅ 已在（09-27 修） |

**为什么挂 0 个？** `buildToolsForBackend`（`llm-task-manager.ts:2847-2985`）暴露 API 工具只有两条路：
1. agent 的 `builtin_tool_ids` 里有 → 暴露；
2. `mountedApiTools.length === 0` 时走兜底 `alwaysApiTools`（只含记忆四件套 + KB 两个 + 媒体三个）。

默认助手挂的是 59 个工具（含 `api_space_memory_*`），`builtin_tool_ids` 非空 → **兜底分支永不触发** → 其余 136 个 API 工具**永久隐身**。

> `get_api_tools` 是管理工具（`registerManagementTools` 注册进 registry），它的设计意图正是"让模型按模块按需发现 API 工具"——**这是解决 136 个工具不能全挂的正确架构**，但入口本身没挂，整套机制空转。

### 2.2 就算挂了，自举闭环还差两环

**闭环应有四步**：发现缺失 → 造工具 → **挂载到当前智能体** → 调用。

- 第 2 步 `api_custom_tool_create` 写库后，工具要生效需进 `agent.custom_tool_ids`；
- 第 3 步需要 `api_agent_mount`（改 `builtinToolIds / customToolIds / skillIds / subAgentIds`）——**也未挂载**；
- 更轻的替代是 `api_conversation_setup`（改**会话级**技能挂载）——已挂载，但它**不支持 `customToolIds`**（只支持 `agentId / skillIds / mode`，见 `api-tools/conversation.ts:12-20`）。

⇒ **会话级自造工具无法落到当前会话**，只能改智能体（影响全局），粒度不对。

### 2.3 沙箱：装了也跑不动

| 环节 | 现状 | 依据 |
|---|---|---|
| Node 沙箱 | `node:vm`，**屏蔽** `require / process / globalThis / setTimeout / Promise` | `packages/core/src/tool/sandbox.ts:60-66` |
| 沙箱能力 | 纯计算（`JSON/Math/Date/RegExp/Map/Set`）→ **不能发网络请求、不能读写文件、不能异步** | 同上 |
| 依赖安装 | `dependencies_json` 字段存在，但 `runUserCode(code, entry, args, opts)` **签名里没有 dependencies**，执行前**不做任何安装** | `sandbox.ts:15-25`、`llm-task-manager.ts:1708-1726` |
| Python 运行时 | 注释原文：「依赖在构建期已预烤进 site-packages（**离线可用**），**运行期不再 pip**」 | `python-runtime.ts:3` |

⇒ 用户设想的"模型发现没工具 → 用 Python/Node 现写一个 → 挂上调用"：
**写得了（`file_write` + `python_exec` 已可用），造不出来（`api_custom_tool_create` 看不到），装了也跑不动（第三方依赖装不上）。**

### 2.4 Skill 下载：链路通，但入口没挂、也没触发策略

- 安装链路**已实现**：`api_skill_install` → `fetch(/api/marketplace/skills/:id)` → 写 `skill` 表（`api-tool-executor.ts:2588-2605`）。
- 远程源浏览链路**已实现**：`api_marketplace_sources` / `_browse` / `_install`。
- 但：**入口未挂载**（见 2.1）；且**没有任何"发现缺 skill → 主动搜商城 → 安装"的提示词或流程**——`triggers` 字段只在写库和前端展示时出现，后端**注入时不按 triggers 命中筛选**，而是把**所有已挂 skill 的 body 全量拼接**（每个截断 2000 字，`llm-task-manager.ts:2716-2731`）。

⇒ 挂了 8 个 skill = 硬塞 ~16000 字，既没命中筛选、也没人会在"缺技能"时去商城找。

### 2.5 插件 / MCP 的下载能力

| 通道 | 现状 | 依据 |
|---|---|---|
| 插件 | 只能**上传 `.yzp` 包**安装，**无远程市场** | `routes/plugins.ts`、`docs/目录任务模式-方案.md §1.4` |
| MCP | 有 `planInstall` 能**猜包名并询问用户**，但**不代拉包**；命令不存在即连接失败 | `routes/mcp.ts:67-70` |

---

## 三、和 WorkBuddy / Trae 的差距矩阵（按缺口级别排序）

| # | 能力 | WorkBuddy / Trae | 言智现状 | 级别 |
|---|---|---|---|---|
| 1 | **达上限自动续跑** | 自动继续（压缩 + 任务清单接力） | 停下吐总结即终止 | ★★★ |
| 2 | **任务清单持久化 + 提示词回注** | TODO 列表跨轮次驱动 | 落盘但**从不回注** | ★★★ |
| 3 | **自造工具 → 挂载 → 调用闭环** | 支持 | 工具链全未挂载，沙箱装不了依赖 | ★★★ |
| 4 | **发现缺 Skill → 自动搜/装** | 支持 | 链路通但入口未挂、无触发策略 | ★★★ |
| 5 | **上下文渐进压缩** | 多级（工具输出裁剪 → 分段摘要 → 重开） | 一次丢前文，仅留 400 字摘要 | ★★ |
| 6 | **规则文件（AGENTS.md / 项目规则）** | 自动读取并生效 | **完全不识别** | ★★ |
| 7 | **记忆分层与优先级** | 全局/项目/会话分层 + 优先级淘汰 | 平铺，按 token 预算先后即截断 | ★★ |
| 8 | **Hooks（工具前后置钩子）** | 支持 | 无 | ★★ |
| 9 | **沙箱依赖安装（pip / npm）** | 支持 | 预烤，运行期不可装 | ★★ |
| 10 | **并行子智能体** | 支持并行/批量委派 | 单层串行，`depth>=1` 直接拒绝 | ★ |
| 11 | **跨会话检查点 / 回滚** | 支持 checkpoints | `file_change` 表 + 单文件 revert，无整轮快照 | ★ |
| 12 | **运行中插话（steer）** | 支持 | ✅ 已有 `injectUserMessage` | ✅ |
| 13 | **计划模式 / 深度思考 / 仅回答** | 支持 | ✅ 已有 `modeFlags` | ✅ |
| 14 | **权限分级（只读/默认/完全）** | 支持 | ✅ 已有 `tool-permission.ts` | ✅ |
| 15 | **子智能体委派 / 工作流** | 支持 | ✅ 已有 `call_agent` / `wf_*` | ✅ |

---

## 四、优化方案

### P0 —— 长任务续跑闭环（直接对应用户痛点①，本迭代必做）

目标：**达上限不再"死"，而是"结账 → 记账 → 自动接力"，直到任务真完成或用户叫停。**

#### P0-1 任务清单结构化（把 `task_plan_json` 变成"接力棒"）

**改动点**
- `conversation.task_plan_json` 已存在（`db.ts:436`），结构 `{ title, steps: [{title, description, status, note}] }`（已在用）。
- **新增回注**：在 `buildSystemPromptForBackend` 末尾追加一段「## 当前任务计划（接力棒）」，内容 = `task_plan_json` 渲染 + 明确指令：
  > 未完成步骤必须接着做；若已完成，重述剩余步骤后直接开工，不要从头再来。
- **新增持久化"续跑轮次"**：`conversation.continuation_count`（或放 `task_plan_json.meta`），防止无限续跑。

**为什么这是关键**：这是"依据整理的记忆继续任务"里**唯一缺的那一环**（其余三份记忆已注入）。

#### P0-2 达上限自动接力（`max_steps` 分支改造）

在 `llm-task-manager.ts:1434-1456` 的收尾段前插入**决策分支**：

```
达 maxSteps
 ├─ 1) summarizeOnMaxSteps → 进展总结（复用现有）        :1444
 ├─ 2) 结构化记账（新增）
 │     · 更新 task_plan_json：把 step 状态推进、追加"下一批要做什么"
 │     · 写 MEMORY.md（现有 recordTaskProgress）+ progress.md
 ├─ 3) 判断是否自动续跑（新增）
 │     · continuation_count < MAX_CONTINUATION（建议 3~5）
 │     · 且 未检测空转（consecutiveArgFailures 已归零）
 │     · 且 用户未 abort
 ├─ 是 → emit 一条系统提示消息（"已达 100 步，自动接着做第 N 批…"）
 │       → 清空/重置 step 计数，继续 for 循环（不开新任务，同一 task）
 └─ 否 → 现有收尾（总结消息 + task:completed）
```

**注意三个坑**（必须先定）：
- **不能无限续跑**：必须有上限 + 用户可关（建议默认开、上限 3）；
- **不能再从 step 0 重放**：续跑时上下文走 `ContextWindow` 压缩后的摘要 + 计划 + 进展，**不是**重发全历史；
- **续跑要能一键停**：前端暂停/终止按钮对续跑同样生效（现状 `waitIfPaused` + `abortController` 已覆盖，直接在循环里复用即可）。

#### P0-3 放开步数下限（顺手修）

- 前端 `chat.ts:1465-1471`：去掉 `>= 100` 的硬抬，改为 `Math.max(1, steps)`，并把 100 作为**默认值**而非**下限**；
- 后端 `llm-task-manager.ts:2160`：同步把 `Math.min(...,100)` 改成读配置上限（建议上限 500，防失控）；
- 前端设置项补一句说明：「单轮最大步数；达上限会自动接力（见 P0-2）」。

#### P0-4 记忆整理参与任务收尾（回应用户说的"记忆整理"）

现状 `memory-dreaming.ts` 三阶段（light 扫描 → REM 打分 → deep 落盘）只在每日 02:30 跑。**新增**：任务收尾时对**本次任务新增的记忆**跑一次**轻量整理**（只做 light + 合并去重，不跑 REM 打分），产出：
- 「本任务已完成」（合并到 MEMORY.md 一行）
- 「本任务待办」（写入 `task_plan_json` 剩余步骤 + `progress.md`）

⇒ 用户说的"应该有个记忆整理，然后根据整理的记忆进行任务"，落点就是 **P0-1 + P0-4 的组合**。

#### P0-5 压缩改"分级"而非"悬崖"

`packages/core/src/compress/window.ts` 现状：超限 → 丢前文 → 一条 400 字摘要。改为**三级**：
1. **工具输出裁剪**（>N 字节的老 tool 结果 → 保留首尾 + 摘要），不动对话结构；
2. **分段摘要**（按"任务阶段"切，逐段摘要而非一刀切）；
3. **保留窗口**从固定 6 条改为「最近 K 轮 + 全部 `task_plan` 相关消息 + 最近 3 条工具结果」。
另外把默认 `DEFAULT_CONTEXT_WINDOW = 1048576` 的**建库默认值**保留（大窗口模型确实有），但**新增"实际可用窗口"探测**：若平台未声明上下文长度，按 32K 保守估计——否则压缩永不触发，长任务直接超限报错。

---

### P1 —— 自举闭环（直接对应用户痛点②③）

#### P1-1 挂载入口：一次性把「自举工具集」挂上（**最高性价比**）

在 `DEFAULT_AGENT_BUILTIN_TOOLS`（`db.ts:705`）追加：

```ts
// ── 自举：让模型能发现 / 造 / 装 / 挂工具与 Skill ──
'get_api_tools',                      // 渐进式 API 发现总入口（解决 136 个工具隐身）
'api_builtin_tool_list',              // 看有哪些内置工具可挂
'api_custom_tool_list', 'api_custom_tool_get',
'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_execute',
'api_skill_list', 'api_skill_get',
'api_skill_create', 'api_skill_update',
'api_marketplace_sources', 'api_marketplace_browse',     // 逛商城
'api_skill_install', 'api_tool_install',                 // 装 Skill / 装工具
'api_agent_mount',                                       // 把自己造的东西挂到智能体
```

> ⚠️ 三个必须遵守的既有硬约束（踩过）：
> ① 新挂的写类工具**必须同步登记 `WRITE_TOOLS`**（`tool-permission.ts:21-68`），否则只读会话**静默可写**（已犯两次）；
> ② **不能只挂 `list/get` 不挂写**（Append/Install/Create 都要么都挂、要么都不挂，否则半开状态更危险）；
> ③ `api_skill_install` / `api_tool_install` 走 `fetch`，只读会话必须拒。

#### P1-2 让 `get_api_tools` 真正承担"发现"职责

`get_api_tools` 已实现按模块返回 schema（`get-api-tools.ts:22-50`），但**模块清单要补全**（当前 `API_MODULES` 只列了 15 个模块名，实际有 20+）。同时把 `alwaysApiTools` 兜底逻辑改为：

```
若智能体挂了 get_api_tools → 不再兜底暴露记忆/KB/媒体三件套
  （模型按需发现即可，省 ~10 个工具的上下文）
```

#### P1-3 补「会话级自定义工具挂载」

`api_conversation_setup`（`api-tools/conversation.ts:12-20`）只支持 `agentId / skillIds / mode`。**新增 `customToolIds`**，并让 `buildToolsForBackend:2952-2972` 的自定义工具过滤同时考虑**会话级**白名单。

⇒ 这样模型造的临时工具可以只作用于当前会话，不污染全局智能体。

#### P1-4 沙箱放依赖（真正让"自己写工具"跑得动）

三档可选，建议按序做：

| 档 | 做法 | 代价 | 建议 |
|---|---|---|---|
| A | `runUserCode` 读 `dependencies_json`，**执行前按需 `npm i --no-save` 到隔离目录**，再把 `node_modules` 注入 vm 的受限 `require` | 中；需白名单包名 + 超时 | ✅ 先做 |
| B | 新增 `runtime: 'subprocess-node'`：以子进程跑真实 Node（可用全能力），**但必须过权限 + 超时 + 输出上限** | 高（安全面） | 观察 A 的效果再定 |
| C | Python 侧开一个受控 `pip install --target <隔离站点包>` 通道 | 中 | 与 A 同批 |

> 安全红线：任何"运行期装包"都必须 ① 走 `middleware` 式权限确认（高危动作需 `confirm:true`）；② 有网络白名单或明确告知用户会联网；③ 有超时与磁盘配额。

#### P1-5 缺 Skill 时的"自动找装"策略

- **提示词层**：在系统提示词的 Skills 段落追加一条判据——
  > 若任务的**方法论/规范**明显缺失（例如要做某领域评审但没挂对应 skill），先 `api_marketplace_browse` 搜，找到匹配的用 `api_skill_install` 装上再继续；找不到就按通用最佳实践做并说明。
- **触发词层**：把 `triggers` 真正用起来——注入时**按当前用户输入命中 triggers 的 skill 全量注入 body，未命中的只注入 name+description**（`llm-task-manager.ts:2716-2731` 改造）。这同时解决了「挂 8 个 skill 塞 16000 字」的上下文浪费。

#### P1-6 MCP / 插件的下载能力（按需，非本迭代必须）

- MCP：`planInstall` 已有猜包逻辑 → 补「确认后自动 `npm i`/`uv tool install` 并注册」。
- 插件：补远程插件市场（与现有 agent/skill/tool 三个市场源同构，复用 `remote_marketplace` 表 + `type='plugin'`）。

---

### P2 —— 记忆分层、规则文件、Hooks

#### P2-1 规则文件（AGENTS.md）自动读取

对标 WorkBuddy / Trae 的"项目规则"：
- 启动时 / 每次任务构建提示词时，扫描 `effectiveWorkspaceDir` 下的 `AGENTS.md`（可选 `CLAUDE.md`、`.yan-zhi/rules/*.md`）；
- 按 **项目根 > 子目录** 优先级拼接，注入「## 项目规则（自动读取，优先级高于默认行为）」；
- 加长度上限（建议 8000 字符）+ 变更检测（mtime 缓存）。

#### P2-2 记忆分层与优先级

现状平铺。改为三层，各带预算与淘汰策略：

| 层 | 载体 | 预算 | 淘汰 |
|---|---|---|---|
| L1 全局（用户偏好） | `memory` 表 type=agent | 200 token | 按 `use_count` + 时间 |
| L2 项目（空间） | `<dir>/MEMORY.md` | 2000 字符 | 「任务进展」行滚动淘汰最旧 |
| L3 会话/任务 | `task_plan_json` + `progress.md` | 1500 字符 | 任务完成后归档 |

并把 `MEMORY.md` 的**硬截断**改成**按行优先级选取**（进展行 > 决策行 > 早期流水）。

#### P2-3 Hooks（工具前后置钩子）

对标 WorkBuddy 的 hook 机制：在 `executeTool`（`llm-task-manager.ts:1507`）入口/出口加可注册的钩子点：
- `beforeToolCall(toolName, args)` → 可用于自动审计/拦危险命令；
- `afterToolCall(toolName, args, result)` → 可用于自动落盘产物/自动登记文件。
好处：把现在**硬编码在 `executeTool` 里的副作用**（`file_write` 登记 conversation_file、媒体登记，`:1376-1423`）改成钩子，扩展新工具时不再改主循环。

#### P2-4 并行子智能体

现状 `depth >= 1` 直接拒绝（`llm-task-manager.ts:1584`）。建议：
- 放开为「**同批多个 `call_agent` 并发执行**」（`Promise.all`），仍限制**嵌套深度 = 1**；
- 长任务里"3 个子任务分别调研"是典型场景，串行会把 100 步很快烧完。

#### P2-5 检查点与回滚

现状只有 `file_change` 单文件 revert（`routes/workspace.ts:453`）。补：
- **按任务的整轮快照**（任务开始时记 workspace 文件清单 + hash）；
- 支持"回滚到第 N 步"（关联 message 序号），配合 P0 的续跑做"跑偏了回退重来"。

---

## 五、实施顺序与验收

### 排期建议

| 阶段 | 内容 | 交付物 | 验收方式 |
|---|---|---|---|
| **P0**（1 批） | P0-1 计划回注 / P0-2 自动接力 / P0-3 步数下限 / P0-4 收尾整理 / P0-5 分级压缩 | 长任务不再"断" | 造一个真需要 >100 步的任务，观察是否自动接力且不重头再来；检查 `task_plan_json` 与 MEMORY.md 是否按预期更新 |
| **P1**（1~2 批） | P1-1 挂自举工具集 / P1-2 `get_api_tools` 补模块 / P1-3 会话级自定义工具 / P1-4 沙箱依赖 / P1-5 自动找装 Skill | 自举闭环可用 | 让模型"造一个工具并调用"、"缺 skill 去商城装"两条端到端走通；**必须跑正式测试类** |
| **P2**（按需） | P2-1 AGENTS.md / P2-2 记忆分层 / P2-3 Hooks / P2-4 并行 / P2-5 检查点 | 对齐度补齐 | 逐项单测 + 用户视角验证 |

### 每个阶段收尾必须做的（项目既有约定）

- **工具链核验三段**：注册 → 挂载 → 进 tool list（本方案的 P1-1 **断的就是第二段**，且**不报错**）；
  验证脚本要打**最后一段**（真实 `/api/mcp` tools/list 或 `buildToolsForBackend` 输出里能查到）。
- **新增 `WRITE_TOOLS` 登记**：所有新挂的写类工具必须进 `tool-permission.ts`，并补一条"只读会话拒绝"的测试。
- **改 `server/core` 源码后必须真编译**：`tsc -p tsconfig.json`（不带 `--noEmit`）→ `fix-esm-extensions.cjs` → 再打包。
- **新增 main/preload `.cjs` 必须登记进三份 electron-builder yml 的 `files:`**（本方案预计不涉及）。
- **正式测试类**，不用临时脚本。

---

## 六、附：本次核查用到的证据索引

| 结论 | 证据 |
|---|---|
| 达上限后终止，无续跑 | `llm-task-manager.ts:1434-1456`（收尾段）、`:1085`（循环）、`grep 自动续跑` 零命中 |
| 步数下限锁死 100 | `packages/ui/src/stores/chat.ts:1465-1471`、`llm-task-manager.ts:2160` |
| `task_plan` 落盘但不回注 | `db.ts:436`、`conversations.ts:89-95`、`chat.ts:564-577`、`grep -c taskPlan llm-task-manager.ts` = 0 |
| 自举工具全未挂载 | `tmp/_gap_audit.cjs` 输出（162 个 API 工具，仅 26 个被引用） |
| `get_api_tools` 已注册未挂载 | `management.ts:102`（注册）、`buildToolsForBackend:2847-2985`（暴露逻辑） |
| 沙箱屏蔽 require/process | `packages/core/src/tool/sandbox.ts:60-66` |
| 依赖字段未被消费 | `sandbox.ts:15-25`、`llm-task-manager.ts:1708-1726`、`dependencies_json` 仅出现在 INSERT/UPDATE |
| Python 运行期不 pip | `python-runtime.ts:3` |
| 压缩悬崖式 | `packages/core/src/compress/window.ts:37-68`、`constants.ts:14` |
| 空间记忆硬截断 | `space-memory.ts:17,142,152` |
| `progress.md` 不注入 | `space-memory.ts:270-280` |
| Skill 全量注入不按 triggers | `llm-task-manager.ts:2716-2731` |
| 记忆整理只后台跑 | `memory-dreaming.ts:11,26`、任务收尾仅 `extractMemoryFromConversation`（`:2513-2560`） |
| 插件无远程市场 / MCP 不代拉 | `docs/目录任务模式-方案.md §1.4`、`routes/mcp.ts:67-70` |
| 子智能体深度 1 层限制 | `llm-task-manager.ts:1584,1594,2050` |
| 只读权限清单 | `tool-permission.ts:21-68,153-181` |