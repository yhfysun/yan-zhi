# 开发模式 · 长任务 · 上下文 · 记忆 —— 对齐 CodeBuddy 的差距与优化方案（第二轮）

> 调研日期：2026-09-29
> 方法：源码实地核查，结论均带 `文件:行号`；对上一轮 `docs/长任务续跑与自举能力-对齐WorkBuddy与Trae-方案.md` 做**现状复核**（哪些已落地、哪些还有残留）。
> 范围：**只出方案，未动任何代码**。
> 用户诉求原文：① 开发模式好好优化；② 长任务；③ **不要又经常出现调用工具没有入参**；④ 上下文管理；⑤ 记忆；⑥ 跟 CodeBuddy 有什么差距。

---

## 零、结论先行（一页纸）

| # | 结论 | 级别 |
|---|---|---|
| 1 | **空参修复没到运行态** —— 源码已修（`client.ts:72` 已补 `function?.arguments` 兜底），但：① **未提交**（`git status` 仍 ` M`）；② `apps/server/dist/`（dev 实际运行的那份）已编译含修复，**打包版 `dist-release-*/…/client.js` 与 `apps/desktop/runtime/server-runtime/…/client.js` 都还是 0 命中 = 旧代码**。用户用安装版/桌面端跑 → **空参照旧**。这是"又出现"的**第一解释**。 | ★★★ |
| 2 | **解析层还有 3 条空参残留路径**（即使主因修复也仍会偶发空参）：文本模式 `<function=x></function>` 空参数体、`hasEmptyArgs` 的"清空重解析"分支、reasoning 中的调用。 | ★★★ |
| 3 | **开发模式长任务"分批断在子智能体"** —— 主循环有自动接力，**子智能体没有**（`llm-task-manager.ts:2981` 明确"子智能体不自动接力"）。而开发模式（`a_builtin_code_agent`）是**委派型**架构（7 个子智能体），大部分重活压在子智能体上 → 子智能体达 30~40 步就截断返回半成品。 | ★★★ |
| 4 | **开发模式拿不到自举/记忆入口** —— `CODE_AGENT_BUILTIN_TOOLS`（`db.ts:1184`）里**没有任何 `api_*`**，而它 `builtin_tool_ids` 非空 → `alwaysApiTools` 兜底只给到记忆/KB/媒体（`llm-task-manager.ts:3715`）→ **`api_custom_tool_*` / `api_skill_install` / `api_marketplace_*` / `get_api_tools` 全部不可见**。上一轮"自举闭环"对开发模式**仍是空的**。 | ★★★ |
| 5 | **上下文压缩是"单级瀑布"** —— 只有"整段摘要"一档；缺 CodeBuddy 的**工具输出分级裁剪**（老 tool 结果压成首尾+摘要）。一条 `python_exec` 输出上限 64KB（`output-cap.ts:5`），保留窗口 6 条 → 最坏 ~384KB 常驻。 | ★★ |
| 6 | **未知上下文窗口 = 关掉压缩** —— 模型未声明 `contextWindow` 时兜底 `DEFAULT_CONTEXT_WINDOW = 1048576`（`constants.ts:13`），触发阈值 = ×0.5 = 52 万 → 等价"永不压缩"，长任务直接超上游上限 400。 | ★★ |
| 7 | **记忆注入预算偏小** —— 纯记忆 600 token（`memory-service.ts:80`）、空间 MEMORY.md 6000 字符、decisions 3000 字符。对**开发模式**尤其不够：没有"项目结构 / 构建命令 / 约定 / 已知坑"这类**工程记忆**。 | ★★ |
| 8 | **开发模式缺 repo-map 级检索** —— 有 `code_search/outline/refs/graph`（`db.ts:1187`），但没有 CodeBuddy/aider 那种"把仓库符号地图摘要常驻提示词"的做法，长任务里模型反复重新探索，烧步数。 | ★ |

---

## 一、"空参又出现"的真实原因

### 1.1 主因已修，但**修复没进你的运行实例**

`packages/core/src/llm/client.ts:65-85` 现在已是双形态兜底：

```ts
const rawArgs = anyTc.function?.arguments ?? anyTc.arguments;   // ✅ 已修
```

但落地状态逐个核实：

| 位置 | 是否含修复 | 说明 |
|---|---|---|
| `packages/core/src/llm/client.ts`（源码） | ✅ | 已补兜底 + 注释 |
| `apps/server/dist/…/client.js` | ✅ | 已编译（1 命中） |
| `dist-release-v2-pro/win-unpacked/resources/server/dist/…/client.js` | ❌ **0** | 打包版仍是旧代码 |
| `apps/desktop/runtime/server-runtime/node_modules/@yan-zhi/core/dist/core/src/llm/client.js` | ❌ **0** | 桌面端运行时依赖副本仍是旧代码 |

⇒ **你在开发模式下用桌面端 / 安装版跑，走的还是"参数被洗成 `{}`"的旧逻辑。** 源码修了但不提交、不重编译、不重打包 = 用户侧零收益（本项目已把"改 server/core 源码必须真编译再打包"列为硬约束）。**P0 第一件事就是把它落地。**

> 注：`git status` 里 `client.ts / anthropic.ts / compress/window.ts / llm-task-manager.ts` 都是未提交的工作区改动。另外 `tool-args-fidelity.test.ts` 是**未跟踪**的新测试 —— 说明这轮修复做了、测了，但**没提交、没打包**。

### 1.2 解析层残留：3 条仍会产出空参

主因修好只解决"**历史回放**"这条链路；**当轮解析**这条链路还有口子：

**(a) 文本模式 XML 空参数体** —— `llm-task-manager.ts:677-689`

```ts
const xmlRe = /<function\s*=\s*(\w+)\s*>\s*(\{[\s\S]*?\})?\s*<\/function>/gi;
//                                                        ^ 参数体是可选的
if (m[2]) { ... } else { /* args 保持 {} */ }
toolCalls.push({ arguments: JSON.stringify(args) });   // → "{}"
```
模型若吐出 `<function=python_exec></function>`（名字有、参数体没吐全），这里**静默产出 `{}`**，与真正的空参不可区分 → 被 `missingRequiredArgs` 拦下 → 落一条错误 tool 结果 → 回到退化循环。

**(b) `hasEmptyArgs` 清空重解析** —— `llm-task-manager.ts:1389-1401`

```ts
const hasEmptyArgs = toolCallAcc.length > 0 && toolCallAcc.every(tc => !tc.function?.arguments || tc.function.arguments === '{}' || '');
if (toolCallAcc.length === 0 || hasEmptyArgs) {
  ... parseTextModeToolCalls(source)
  if (hasEmptyArgs && parsed.length > 0) toolCallAcc.length = 0;   // 清掉原生结果
  for (const tc of parsed) toolCallAcc.push(...)
}
```
判据只在**全部**调用都空时才触发清空；若一批里"1 个有参数 + 1 个空参"，空的**不会**从文本模式补救，直接带着 `{}` 进入执行 → 被拦。

**(c) reasoning 内的调用** —— `:1392` 只在 `hasToolInContent` 为假时才看 reasoning；某些模型（agnes 系）在 content 与 reasoning **都**有碎片时，只取 content → 参数可能不完整。

> 三条都属"**能自愈但没兜住**"。改法见 §4 P0-2。

### 1.3 空参断路器的**文案仍是错的**

`llm-task-manager.ts:1450-1455` 断路时给用户的诊断仍是"输出被长度上限截断 / 换模型 / 调大 max tokens"。上一轮 issue（`issues/工具历史参数被清洗导致空参-20260929.md`）已实测证伪（`file_read` 的 `path` 只需几十字符也空参）。

现在主因修了，这条文案**同时要改**，否则下次排查又被带到"调 max_tokens"的错方向。

---

## 二、开发模式 vs CodeBuddy 差距矩阵

开发模式 = `dev / /code`，绑定 `a_builtin_code_agent`「代码编写助手」（架构师），委派 7 个子智能体（探索/高级程序/设计/前端/Java/CI-CD/pageAgent）。

| # | 能力 | CodeBuddy | 言智开发模式现状 | 级别 |
|---|---|---|---|---|
| 1 | **长任务不断** | 自动续跑 + TODO 接力 | 主循环有接力（`autoContinueMaxRounds` 默认 3）✅；**子智能体无接力** ❌ → 重活断在子智能体 | ★★★ |
| 2 | **工具入参稳定** | 稳定 | 源码修好但**运行态未生效** + 3 条解析残留 | ★★★ |
| 3 | **自举（发现/造/挂工具与 Skill）** | 支持 | 开发模式**一个 `api_*` 都没有** → 全空 | ★★★ |
| 4 | **项目规则（AGENTS.md）** | 自动读取 | ✅ 已实现（`llm-task-manager.ts:3534 loadProjectRules`，含 mtime 缓存 + 长度上限） | ✅ |
| 5 | **分级上下文压缩** | 工具输出裁剪 → 分段摘要 → 重开 | 只有"整段摘要"一档 ❌ | ★★ |
| 6 | **未知窗口保守估计** | 有 | 兜底 1M → 关掉压缩 ❌ | ★★ |
| 7 | **工程记忆（结构/命令/坑）** | 项目级长期记忆 | 只有通用记忆 600 token ❌ | ★★ |
| 8 | **repo-map 常驻** | 有（符号地图注入） | 有工具但无常驻地图 ❌ | ★ |
| 9 | **并行子智能体** | 支持 | ✅ 已实现（同批 `call_agent` 并发，`llm-task-manager.ts:1464`） | ✅ |
| 10 | **Hooks / 检查点回滚** | 支持 | ✅ 已实现（`tool-hooks.ts` / `file_change` revert） | ✅ |
| 11 | **运行中插话 / 权限分级 / 计划模式** | 支持 | ✅ 已有 | ✅ |

> 结论：**架构骨架已经很接近了**（自动接力、并行子智能体、AGENTS.md、Hooks、检查点都在）。真正的差距收窄为 4 块：**① 修复落地；② 子智能体接力；③ 开发模式工具面（自举入口）；④ 上下文分级 + 工程记忆**。

---

## 三、上下文管理现状（细节）

| 环节 | 现状 | 依据 |
|---|---|---|
| 触发阈值 | `ContextWindow.forContextWindow(contextWindow, 6)`，阈值 = 窗口 × 0.5 | `window.ts:19,36`；`llm-task-manager.ts:1214,2695` |
| 计数 | ✅ 计入 `content + reasoningContent + toolCalls` | `window.ts:55-64` |
| 摘要 | ✅ LLM 摘要（`setSummaryModel` 已挂），保留工具名与参数原文 | `window.ts:129-134`；`:1215` |
| 保留窗口 | 固定 `keepRecent = 6` 条，边界回退到 `assistant(tool_calls)` 处（不产生孤儿 tool） | `window.ts:96-98` |
| 压缩前抢救 | ✅ `beforeCompress` → `flushMemoriesBeforeCompression`（每任务一次） | `:1218-1235` |
| **缺 1** | 无"老 tool 结果裁剪"档 —— 只裁 `content`，老 tool 结果（最大 64KB/条）原样进摘要输入 | `output-cap.ts:5` |
| **缺 2** | 未知窗口兜底 1M → 等于关压缩 | `constants.ts:13` |
| **缺 3** | 保留 6 条对并行 `call_agent`（同批 N 条 tool 消息）可能瞬间吃掉整个窗口 | — |

---

## 四、优化方案

### P0 —— 让修复真正生效（本迭代第一件事，不做则其余全部无意义）

#### P0-1 落地空参修复
- `git add` 这 5 个文件 → 提交（含 `tool-args-fidelity.test.ts`）。
- 真编译：`tsc -p tsconfig.json`（不带 `--noEmit`）→ `fix-esm-extensions.cjs`。
- 重打包三档（lite/basic/pro）+ 桌面端 runtime 副本；**核验产物**（不是核验源码）：
  ```bash
  grep -c "function?.arguments" dist-release-pro/win-unpacked/resources/server/dist/packages/core/src/llm/client.js
  # 期望 ≥1，当前为 0
  ```
- ⚠️ 若只做桌面端 dev 验证，至少要把 `apps/desktop/runtime/server-runtime/node_modules/@yan-zhi/core/dist/…` 与 `apps/server/dist` 一并刷新，否则"dev 模式"仍在跑旧逻辑。

#### P0-2 补解析层兜底（3 条残留）
1. `<function=x></function>` 空参数体：解析后**若 args 为空对象且工具声明的必填参数非空 → 不产调用**，改产一条"参数缺失，请补齐"的提示（宁可不执行，也不要制造假空参）。
2. `hasEmptyArgs`：判据从"**全部**空"改为"**逐个**空"——逐个 `tc` 判断，空的单独走文本补救，有参数的保留（不要整批清空）。
3. reasoning 兜底：`hasToolInContent` 与 `hasToolInReasoning` 并存，且 content 解析出的调用存在空参时，**再**从 reasoning 补一次。

#### P0-3 修正断路文案（`:1450`）
把"换模型 / 调 max_tokens"改为按概率排序的真实原因：
> 1) 历史里存在空参数调用记录（回放污染）→ 新建会话或清理历史；
> 2) 模型把参数吐在了 reasoning / 文本标记里未被识别 → 换支持原生 tools 的模型；
> 3) 确实输出被截断 → 再调 max tokens。

---

### P1 —— 开发模式长任务：子智能体也接力

#### P1-1 子智能体自动接力（本轮最高价值）
现状 `runSubAgent` 达 `maxSteps` 只做一次总结就返回（`:2937-2952`），**不接力**。开发模式重活全在子智能体 → 每个子任务都被截半。

改法：
- 子智能体循环外**同样加 `batch` 外层**（复用 `decideAutoContinue` 的判据：轮次上限 + 未空转 + 用户未 abort）；
- 子智能体默认 `autoContinueMaxRounds` **取小值（建议 1~2）**，避免一个子智能体无限占用父预算；
- 接力时把"子任务 plan + 已产出"注入，**不重放全历史**；
- 父智能体的阶段总结里体现"子智能体是第几批返回的"，便于父侧判断是否再委派。

#### P1-2 放开开发模式步数（按需）
`a_builtin_code_agent` 现 `maxReActSteps: 40`（`db.ts:1783`）。委派型架构下 40 步偏紧（一次委派 + 验收就吃掉不少）。建议 **60~80 + 保留自动接力**，而不是单纯加步数（步数大但子智能体截断，等于白给）。

---

### P2 —— 开发模式工具面：把"自举"真正挂上

#### P2-1 给 `CODE_AGENT_BUILTIN_TOOLS` 补 API 入口
在 `db.ts:1184` 的数组里追加（与上一轮 §P1-1 同口径）：

```ts
// ── 自举：发现 / 造 / 装 / 挂 ──
'get_api_tools',                 // 渐进式 API 发现总入口（解决 136 个 API 工具隐身）
'api_custom_tool_create', 'api_custom_tool_update', 'api_custom_tool_execute',
'api_skill_list', 'api_skill_create', 'api_skill_update',
'api_marketplace_browse', 'api_skill_install', 'api_tool_install',
'api_agent_mount',
'api_space_memory_read', 'api_space_memory_append',   // 工程记忆读写
```

> ⚠️ 三条既有硬约束（踩过，必守）：
> ① 新挂的**写类**工具必须同步登记 `WRITE_TOOLS`（`tool-permission.ts`），否则只读会话**静默可写**（已犯两次）；
> ② 不能只挂 list/get（半开状态更危险）；
> ③ 挂完必须核验**最后一段**：`buildToolsForBackend` 的真实输出里能查到（注册→挂载→进 tool list，断哪段都不报错）。

#### P2-2 「代码探索」子智能体补 repo-map
`a_builtin_code_explorer` 已有 `code_graph`（hub 符号概览）。补一步：探索报告**首部固定输出"项目符号地图摘要"**（模块 → 关键符号 → 文件:行号，限 3000 字符），并在开发模式提示词里要求架构师**把该摘要写进 task_plan 的 note**，后续每轮从计划里就能看到地图，不必反复 `file_search`。

---

### P3 —— 上下文与记忆

#### P3-1 压缩改三级（对齐 CodeBuddy）
1. **工具输出裁剪**：老 tool 消息（超出保留窗口）在进摘要前先 `capToolOutput(text, 8KB)` —— 不动对话结构，只降 token；
2. **分段摘要**：按"任务阶段"（`assistant` 无 tool_calls 的自然分段）逐段摘要，而非一刀切；
3. **保留窗口动态**：`keepRecent` 从固定 6 改为「最近 K 轮 + 全部 `task_plan` 相关消息 + 最近 3 条工具结果」。

#### P3-2 未知窗口保守估计
`DEFAULT_CONTEXT_WINDOW` 建库默认值保留 1M（大窗口模型确实有），但**运行时**：若平台/模型未显式声明 `contextWindow`（或声明值明显不合理），按 **32K** 估算触发阈值 → 保证压缩一定会触发。

#### P3-3 开发模式工程记忆
在空间记忆之外，为 dev 模式加一层**工程记忆**（写入 `MEMORY.md` 的独立分区或独立文件 `.yan-zhi/code-memory.md`）：
- 项目结构一句话、构建/测试/启动命令、包管理器、代码风格约定、已知坑；
- 由任务收尾的轻量整理自动抽取（复用 `memory-dreaming.ts` 的 light 阶段）；
- 注入预算建议 1500~2000 字符（现 600 token 对开发场景太小）。

---

## 五、实施顺序与验收

| 阶段 | 内容 | 验收方式 |
|---|---|---|
| **P0**（半天） | 落地修复（提交+真编译+重打包）/ 解析层 3 条兜底 / 断路文案 | ① 产物 `grep` 命中；② `tool-args-fidelity.test.ts` 全绿 + 新增 3 条残留用例；③ 跑一个长会话，库里新产生的 `tool_calls_json` 参数非空 |
| **P1**（1 批） | 子智能体接力 / 开发模式步数 | 造一个需要委派 3 个子任务的真开发任务，观察子智能体是否接力、是否返回完整产出 |
| **P2**（1 批） | 开发模式自举工具挂载 / 探索报告符号地图 | 三段核验（注册→挂载→tool list）；让开发模式"发现缺工具→自造→挂上→调用"走通；**必须跑正式测试类** |
| **P3**（按需） | 三级压缩 / 未知窗口兜底 / 工程记忆 | 逐项单测 + 用户视角验证（直接调运行中接口） |

### 每阶段收尾（项目既有约定）
- 改 `server/core` 源码**必须真编译**再打包（`tsc -p tsconfig.json` → `fix-esm-extensions.cjs`）。
- 新挂写类工具**必须**登记 `WRITE_TOOLS` + 补"只读会话拒绝"测试。
- 新增/修改工具链核验**三段**，验证脚本打**最后一段**。
- 正式测试类，不用临时脚本；`apps/server/src` 下禁放 `.test.ts`。

---

## 六、附：本次核查证据索引

| 结论 | 证据 |
|---|---|
| 空参主因已修（源码） | `packages/core/src/llm/client.ts:65-85`（双形态兜底）、`anthropic.ts:108` |
| 修复未落地运行态 | `git status` 5 文件未提交；`grep -c "function?.arguments"` → `dist-release-v2-pro/…/client.js` = **0**、`apps/desktop/runtime/server-runtime/…/client.js` = **0**、`apps/server/dist/…/client.js` = 1 |
| 新测试未跟踪 | `git status` → `?? packages/core/src/llm/tool-args-fidelity.test.ts` |
| XML 空参数体残留 | `llm-task-manager.ts:677-689` |
| `hasEmptyArgs` 整批清空 | `llm-task-manager.ts:1389-1401` |
| 断路文案仍误导 | `llm-task-manager.ts:1450-1455` |
| 子智能体不接力 | `llm-task-manager.ts:2937-2952`、`:2981`（注释明写） |
| 主循环自动接力已落地 | `llm-task-manager.ts:1176-1196, 1602-1645, 1677-1720` |
| 开发模式工具清单无 api_ | `db.ts:1184-1194`（`CODE_AGENT_BUILTIN_TOOLS`） |
| API 工具兜底仅记忆/KB/媒体 | `llm-task-manager.ts:3715-3724`（`alwaysApiTools` / `mountedApiTools`） |
| 子智能体并发已落地 | `llm-task-manager.ts:1464-1474` |
| 压缩单级 + 阈值系数 | `packages/core/src/compress/window.ts:19,36,96-98` |
| 压缩已挂摘要模型 | `llm-task-manager.ts:1215,2696` |
| 工具输出 64KB 上限 | `packages/core/src/tool/builtin/output-cap.ts:5` |
| 默认窗口 1M → 关压缩 | `apps/server/src/constants.ts:13` |
| 记忆注入 600 token | `apps/server/src/services/memory-service.ts:80` |
| AGENTS.md 已实现 | `llm-task-manager.ts:3514-3570` |
| 任务计划回注已实现 | `llm-task-manager.ts:3451-3511` |
| 前端步数下限已放开 | `packages/ui/src/stores/chat.ts:1469-1481` |