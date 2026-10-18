# 模型平台三协议 + 内置国产厂商 + 任务费用核算与阈值（方案 v2）

日期：2026-10-17｜状态：**D1–D4 已拍板，未改任何代码**

> **v2 相对 v1 的实质变更**（按 D4 重做，不是措辞调整）：  
> **到阈值只提醒，程序不停。** 连锁推翻 v1 的 §3.5「100% 安全点停止」与 §3.6「自动收尾 + 接力按钮」——  
> 成本**不进** `checkTaskBudgetHit` 的停止语义、**不进**收尾块、**不阻止**自动接力；  
> 改挂独立提醒器；提醒**默认不落会话消息**（落进去会推高后续输入成本，见坑 #15）。  
> 另：内置价格参考表由 P1 **提到 P0**（否则费用恒 ¥0、阈值永不触发，见 §3.3.1）。

两个需求：

1. 模型平台支持三种 API 格式（OpenAI Chat Completions / OpenAI Responses / Anthropic Messages），自定义模型一步创建；国内厂商默认内置。
2. 任务执行时按模型厂商输入/输出/缓存价格核算花费，到阈值后**提醒用户并给出「新开会话继续」入口** + 输出大概花了多少钱  
   —— **程序不停止任务**（D4）。

---

## 0. 先看结论（以及需要你拍板的 3 件事）

**需求一能不能直接做？** 三格式里现在只有两种（`openai` / `anthropic`），Responses 要新写一条协议链路。更要紧的是：**现在的 URL 拼接假设会直接卡死国产厂商**（火山 `/api/v3`、智谱 `/v4`、百炼 `/compatible-mode/v1` 全部会被拼成 `.../v4/v1/chat/completions` 而 404）。所以内置目录的前置必做项是「路径拼接收敛成一个纯函数 + 单测」，不是填一张表就完事。

**需求二能不能直接做？** 数据已经有一半：`usage`（prompt/completion/cached）三处都在采，`pricing_json` 字段和编辑框也早有，但 **pricing 从未参与任何计算**（全仓只有增删改查），而且 Anthropic 的 `cache_creation_input_tokens` 根本没采 → 缓存写入费用必然漏计。所以要做的是「归一化 + 计价 + 账本 + 闸门」四层，不是加一句乘法。

**已拍板**（D1–D4）：

| #  | 决策                      | 结论                                                                                                           |
| -- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| D1 | 阈值口径：**按会话累计** 还是 按单次任务 | **按会话累计**（新开会话才归零）。yan-zhi 里"任务"就是会话（左侧任务列表），换会话归零；同会话继续提问会一直带历史 ⇒ 输入重复计费，这才是提醒"新开会话"的理由。按单任务则每次发送都重置，阈值形同虚设 |
| D2 | 默认阈值                    | **¥5.00 / 会话，80%（¥4.00）预警一次**；★ **所有默认值设置里可改，且运行中改立即生效**（判定前现读，与现有 `liveMaxSteps()` 同口径）                     |
| D3 | 内置厂商范围                  | 截图 16 家里 **15 家可内置**；**AWS Bedrock 单列 P2**（SigV4 签名，不是 OpenAI 兼容，硬塞进来会变成假支持）                                 |
| D4 | 到阈值后**停不停**             | **只提醒，程序绝不停**（参考 Claude Code）。唯一例外：用户自填 `hardStopCny`（默认 0 = 不启用）。详见 §3.5 —— 这是 v2 与 v1 的最大分歧点，连锁改动见文首       |

**待确认（Q1–Q6，不阻塞开工，可在实施中定）**：Q1 既有的 token/墙钟预算是否也一并改成"只提醒"？  
Q2 提醒形态默认不落会话消息（建议维持）；Q3 是否要"每会话费用上限"之外的**按天**上限；  
Q4 未配价模型是否按保守暂估价计入（防绕过，见坑 #18）；Q5 `hardStopCny` 是否暴露在 UI（建议只放设置、不放进智能体编辑）；  
Q6 生图/生视频按次计费是否 P0 就做（建议 P0 只计入 `unpriced_calls`）。

---

## 1. 现状核查（代码级证据，先对齐事实）

| 能力              | 现状                                                                                                   | 证据                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 协议类型            | 只有 `openai` / `anthropic` / `custom`（`custom` 语义未定义，实际按 openai 走）                                    | `packages/shared/src/types/index.ts:6`                                                                                                      |
| 协议分派            | 三处 `if (isAnthropic)`：流式 / 非流式 / 连通性测试                                                               | `packages/core/src/llm/client.ts:646 / 762 / 894`                                                                                           |
| Responses API   | 全仓零实现（只出现在注释里）                                                                                       | `grep -c responses client.ts` = 0                                                                                                           |
| Anthropic usage | 采了 `input_tokens` / `output_tokens` / `cache_read_input_tokens`；**没采 `cache_creation_input_tokens`** | `packages/core/src/llm/anthropic.ts:205-214, 279-285`                                                                                       |
| OpenAI usage    | 采了 `prompt_tokens_details.cached_tokens`                                                             | `packages/core/src/llm/stream.ts:125-131`、`client.ts:798-804`                                                                               |
| URL 拼接          | `${baseUrl}/${upstreamPath}`，**无条件加 `v1/`**                                                          | `client.ts:548`、`client.ts:875`（models）、`apps/server/src/routes/llm-proxy.ts:87`                                                            |
| 代理路由            | 只有 chat/completions、messages、embeddings、images                                                       | `llm-proxy.ts:133 / 143 / 153`                                                                                                              |
| 价格字段            | `pricing: { input?, output? }`，单位**元/千 token**                                                       | `shared/src/types/index.ts:80`、`schema.ts:80`、`PlatformDetail.vue:185-192`                                                                  |
| 价格参与计算          | **没有**。全仓 `pricing` 只有 CRUD，无任何费用计算                                                                  | `grep -rn pricing packages apps/server/src`（仅读写）                                                                                            |
| token 累计        | 主循环 `task.totalTokens`；**子智能体用量只进自己预算，不进父任务**                                                        | `llm-task-manager.ts:3528`、`6591`、`6594`                                                                                                    |
| 预算闸（**两层**）     | token 总预算 + 墙钟，触达不硬杀，走「结账 → 自评 → 接力」。★ 判定实现在 shared，但 server 侧有**本地包装**且返回类型**硬编码**                  | `shared/src/utils/context-policy.ts:149`、`llm-task-manager.ts:4192`（包装，返回类型写死 `'tokens'\|'wallclock'`）、判定点 `:3215`、baseline 重置 `:4056-4058` |
| 价格写入路径（**两套**）  | 除 server 端外，**UI 端也直连本地 SQLite 写 `model` 表**（`INSERT/UPDATE ... pricing_json`）                       | `apps/server` routes + `core/src/db/schema.ts:80`；**另一处** `packages/ui/src/stores/platform.ts:355/359/398`                                  |
| 模型列表路径          | `/v1/models` **硬编码**，与聊天路径同样是国内厂商的 404 重灾区（且比聊天更早暴露）                                                 | `apps/server/src/routes/llm-proxy.ts:301`、`:336`                                                                                            |

> ⚠️ 表中行号已漂移数十行（本表为 2026-10-17 实测值）。**实施一律按函数名 / 唯一注释锚定，不要按行号找**——  
> 锚点清单：`function checkTaskBudgetHit(`（shared 真实现 + server 包装**各一处**）、`task.totalTokens = (task.totalTokens || 0)`、  
> `subTokensTotal +=`、`task.budgetBaselineAt = Date.now()`、`function upstreamFetch(`、`function proxyWithRetry(`。  
> | 全局配置            | `app_config` 表（key/value），已有成熟写法                                                                     | `apps/server/src/db.ts:4723`、`routes/model-pools.ts:41`                                              |  
> | 会话创建            | `createConversation(title, opts)` 支持 platform/model/agent/space                                      | `packages/ui/src/stores/chat.ts:1454`                                                                |  
> | 任务进度记账          | 收尾时 `recordTaskProgress` 写空间记忆 / 进度明细，**已有跨会话接力基础**                                                  | `llm-task-manager.ts` 各处调用、`services/space-memory.ts:609`                                            |

---

## 2. 需求一：模型平台（三格式 + 内置厂商）

### 2.1 协议扩展：新增 `openai-responses`

**类型层**（`packages/shared/src/types/index.ts`）

```ts
export type Protocol = 'openai' | 'openai-responses' | 'anthropic' | 'custom';
/** custom 保留兼容（存量行按 openai 处理），UI 不再提供该选项 */
export function isResponsesProtocol(p: string) { return p === 'openai-responses'; }
export function normalizeProtocol(p: unknown): Protocol // 非法值 → 'openai'
```

UI 文案严格对齐截图三行：

| 内部值                | 展示名                        |
| ------------------ | -------------------------- |
| `openai`           | OpenAI Chat Completions 格式 |
| `openai-responses` | OpenAI Responses API 格式    |
| `anthropic`        | Anthropic Messages 格式      |

**新文件 `packages/core/src/llm/responses.ts`（与 `anthropic.ts` 同构）**

- `toResponsesInput(messages)` → `{ instructions, input[] }`
  - system → 合并进 `instructions`（多条 system 就 join，避免丢）
  - user / assistant 文本 → `{ role, content: [{ type: 'input_text', text }] }`
  - 图片 → `{ type: 'input_image', image_url }`
  - assistant 的 `tool_calls` → 独立 item `{ type: 'function_call', call_id, name, arguments }`
  - `role:'tool'` → `{ type: 'function_call_output', call_id, output }`
  - `reasoning_content` **不回传**（与现有 OpenAI 路径同口径，避免污染历史）
- `toResponsesTools(tools)` → `{ type:'function', name, description, parameters }`（去掉 OpenAI 的 `function.` 包装）
- `toResponsesToolChoice(tc)` → `auto` / `required` / `none` / `{type:'function',name}`
- `parseResponsesSSE(body)` → `AsyncGenerator<ChatChunk>`，事件映射：

| Responses 事件                                                              | 产出                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------ |
| `response.output_text.delta`                                              | `delta.content`                                  |
| `response.reasoning_summary_text.delta` / `response.reasoning_text.delta` | `delta.reasoningContent`                         |
| `response.output_item.added`（type=function_call）                          | 登记 `item_id → index/name/call_id`                |
| `response.function_call_arguments.delta`                                  | `delta.toolCalls[{index, function:{arguments}}]` |
| `response.output_item.done`（type=function_call）                           | 补全 `id/name`，落最终 `arguments`                     |
| `response.completed`                                                      | `usage` + `finishReason` + `terminated:true`     |
| `response.incomplete`                                                     | `finishReason:'length'` + `terminated:true`      |

- `responsesResultToChunk(json)`：非流式（`chat()` / `chatTest()` 用）
- **纯函数、不 import electron/router**，直接 vitest 覆盖（本项目「抽纯函数 + 锚点钉唯一实现」的老套路）。

**client.ts 改动点**

```ts
private get isResponses() { return this.platform.protocol === 'openai-responses'; }
// chatStream: if (this.isResponses) yield* this.responsesStream(...)
// chat:       if (this.isResponses) return this.responsesChat(...)
// chatTest / capabilityTest / supportsEmbeddings：同上分派
// upstreamFetch('v1/responses', body, { ... })  ← 仍需走代理分支
```


`supportsEmbeddings`：Responses 平台**保留** embeddings（`/v1/embeddings` 是独立端点），只有 anthropic 才隐藏。别顺手写成 `!isAnthropic && !isResponses`。

**后端代理**：`llm-proxy.ts` 增加

```ts
router.post('/responses', ...proxyWithRetry(p, false, 'v1/responses', payload, res, true));
```

鉴权头沿用 `buildProtocolHeaders`（Bearer），**不要**给 responses 单独写一份 header 逻辑。

**参数降级**：Responses 各家实现子集不一（部分网关不认 `instructions` / `temperature` / `reasoning`）。沿用现有 400 降级套路，新增纯函数 `shouldRetryWithoutResponsesOnlyFields(status, text)`：先剥 `temperature/top_p/reasoning`，仍 400 再剥 `tools` + 把 function_call items 降级成文本（与 OpenAI 的 `shouldRetryWithoutTools` 同思路，但**不能复用同一个函数**——两套请求体结构不同，混用必然漂移）。

**支持 Responses 的厂商**（已核）：OpenAI、火山方舟（`/api/v3`，`wire_api="responses"`）、BytePlus ModelArk、DeepSeek V4。其余按 `openai` 走 Chat Completions。

### 2.2 前置必做：URL / 路径拼接收敛

现状 `client.ts:548` 与 `llm-proxy.ts:87` 各自拼 `${base}/v1/...`，国产厂商必 404：

| 厂商       | 正确端点                                   | 现状会拼成                                |
| -------- | -------------------------------------- | ------------------------------------ |
| 火山方舟     | `/api/v3/chat/completions`             | `/api/v3/v1/chat/completions` ❌      |
| 智谱       | `/api/paas/v4/chat/completions`        | `/api/paas/v4/v1/chat/completions` ❌ |
| 百炼       | `/compatible-mode/v1/chat/completions` | `.../v1/v1/chat/completions` ❌       |
| DeepSeek | `/v1/chat/completions`                 | ✅（base 不带版本段）                        |

**唯一实现**（放 `packages/core/src/llm/api-path.ts`，server 代理也 import）：

```ts
export function joinUpstreamPath(baseUrl: string, rel: string): string
// base 结尾已是版本段（/v1 /v3 /v4 /api/v3 /compatible-mode/v1）→ 去掉 rel 的版本前缀再拼
// 否则按原样拼（base + '/' + rel）
export function resolveUpstreamUrl(baseUrl: string, kind: 'chat'|'messages'|'responses'|'embeddings'|'models'|'images'): string
```

规则表（每条都写单测）：`https://api.openai.com` + chat → `/v1/chat/completions`；`https://ark.cn-beijing.volces.com/api/v3` + chat → `/api/v3/chat/completions`；`https://open.bigmodel.cn/api/paas/v4` + chat → `/api/paas/v4/chat/completions`；`https://dashscope.aliyuncs.com/compatible-mode/v1` + chat → `.../v1/chat/completions`；`https://api.moonshot.cn/anthropic` + messages → `/anthropic/v1/messages`。

顺带收益：用户把 `/v1` 写进 base 也不会再 404（现在 UI 提示「不要带 /v1」，等于把兼容成本转嫁给用户）。

**★ 别漏掉这两处**（v1 遗漏，且都是"用户最先撞上"的位置）：

1. **模型列表**：`llm-proxy.ts:301`（`GET /models`）与 `:336`（`POST /preview-models`）各自硬编码 `${base}/v1/models`。  
   用户的操作顺序是「填地址 → 点拉取模型 → 才发第一条消息」，所以 **404 会发生在聊天之前**，  
   表现为"这个平台连不上"而非"路径错了"。一并改用 `resolveUpstreamUrl(base, 'models')`。
2. **报错里显示的 URL**：`client.ts:672 / 787 / 837` 的 `urlDesc` 是拼给用户看的字符串，  
   必须走同一个函数，否则排障时看到的是旧 URL —— **下一次排查会被这份错误信息带偏**（本项目踩过同型）。

### 2.3 内置厂商目录（不是「默认塞 16 个空平台」）

**设计判据**：目录是「可添加清单」，不是「已有平台」。否则用户一进模型页就多出 16 个没有 Key 的失效平台，模型下拉被污染。

- 新文件 `packages/shared/src/model-providers.ts`（前后端共用，纯数据）
- 页面顶部：供应商宫格（截图样式，2 列卡片）＋「自定义模型」卡
- 点未添加的厂商 → 弹「添加 {厂商}」：预填 baseUrl / 协议 / Key 链接，填 Key 保存 → 才 `POST /platforms`（`is_builtin=1`）
- 点已添加 → 直接进平台详情（拉模型 / 设默认）
- 内置平台：**连接配置禁改**（现有 `assertEditablePlatform` 已实现）、可换 Key、可切「可供大模型调用」开关、可删（删了回到宫格未添加态）

目录数据（已逐个核对官方文档，2026-10-17）：

| 名称                   | Base URL                                            | 首选协议                     | 备注                                                        |
| -------------------- | --------------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| DeepSeek             | `https://api.deepseek.com`                          | openai（V4 亦支持 responses） | Anthropic: `https://api.deepseek.com/anthropic`           |
| 火山引擎（方舟）             | `https://ark.cn-beijing.volces.com/api/v3`          | openai（方舟支持 responses）   | 模型 ID 是「推理接入点 ID」或 `doubao-*`                             |
| MiniMax CN           | `https://api.minimaxi.com/v1`                       | openai                   | Anthropic: `.../anthropic`                                |
| MiniMax Global       | `https://api.minimax.io/v1`                         | openai                   | Anthropic: `.../anthropic`                                |
| 智谱 Bigmodel          | `https://open.bigmodel.cn/api/paas/v4`              | openai                   | 另有 Anthropic 兼容端点（**选填，待核路径**）                            |
| 阿里云百炼                | `https://dashscope.aliyuncs.com/compatible-mode/v1` | openai                   | 生图走原生通道（已有特判）                                             |
| Xiaomi MiMo          | `https://api.xiaomimimo.com/v1`                     | openai                   | Anthropic: `.../anthropic`                                |
| 硅基流动                 | `https://api.siliconflow.cn/v1`                     | openai                   | 模型 ID 带厂商前缀（`Qwen/...`）                                   |
| Z.ai                 | `https://api.z.ai/api/paas/v4`                      | openai                   | Anthropic: `/api/anthropic`；Coding: `/api/coding/paas/v4` |
| OpenRouter           | `https://openrouter.ai/api/v1`                      | openai                   | 模型 ID 带前缀（`deepseek/deepseek-chat`）                       |
| Kimi CN              | `https://api.moonshot.cn/v1`                        | openai                   | Anthropic: `.../anthropic`                                |
| Kimi Global          | `https://api.moonshot.ai/v1`                        | openai                   | Anthropic: `.../anthropic`                                |
| BytePlus ModelArk    | `https://ark.ap-southeast.bytepluses.com/api/v3`    | openai                   | 支持 responses / Anthropic                                  |
| 腾讯云混元                | `https://api.hunyuan.cloud.tencent.com/v1`          | openai                   | 官方公告将迁移 TokenHub，备注里写清楚                                   |
| 模力方舟（MoArk/Gitee AI） | `https://api.moark.com/v1`                          | openai                   | 兼容 OpenAI/Anthropic                                       |
| AWS Bedrock          | —                                                   | —                        | **P2/不做**：SigV4 签名，非 OpenAI 兼容                            |

每家附带：`keyUrl`（取 Key 页）、`brandColor`、`iconText`（首字母/两字缩写，**不引入商标图片资产**）、`defaultModelIds`（仅作「建议添加」提示，不做强绑定 —— 模型 ID 变动频繁，硬编码进库只会过期）。

**协议切换联动**：同一厂商有多个兼容端点时，协议选择器切换会**只在 apiUrl 仍等于该厂商默认值时**自动改写 URL；用户手改过就不动（防止覆盖自定义中转）。

### 2.4 「自定义模型」一步式对话框（对齐截图）

现在要「新增平台 → 进详情 → 新增模型」三步。改为一个对话框：

```
* API 格式  [OpenAI Chat Completions / OpenAI Responses / Anthropic Messages]
  API 地址  [预置：按格式给默认值，可改]      ← 截图里没有，但没有它就没法接中转
* 模型 ID   [________________]
  模型展示名称 [____________]  0/64
* API 密钥  [________________]  👁
  价格（可选）输入 / 缓存命中 / 缓存写入 / 输出   元/百万 tokens
  [连通性测试]   ← 会发起一次真实请求，消耗少量 token
```

后端新增原子接口（一个事务，避免「平台建了模型没建」的半成品）：

```
POST /api/platforms/custom-model
{ apiFormat, modelId, displayName?, apiUrl?, apiKey?, pricing? }
→ { platformId, modelId }
```

实现：`platform(name = displayName || modelId, protocol = apiFormat, is_builtin = 0)` + `model(...)` + `platform_api_key`，同事务。

### 2.5 数据 / 接口变更清单（需求一）

| 层      | 变更                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB     | 无需改表（`protocol` 是 TEXT）；**需要**给 `platform` 加 `preset_key TEXT`（记录来自哪个目录项，便于「重置为默认」与统计），走 `ALTER TABLE` 老套路                                                       |
| 共享类型   | `Protocol` 扩值 + `normalizeProtocol` + `model-providers.ts` 目录 + `pricing` 新结构（见 3.3）                                                                             |
| core   | `responses.ts` 新文件、`api-path.ts` 新文件、`client.ts` 分派、`anthropic.ts` 补 cache_creation、`stream.ts` 补 detail                                                         |
| server | `routes/platforms.ts`：`GET /platforms/catalog`、`POST /platforms/custom-model`、`POST /platforms/from-preset`；`llm-proxy.ts`：`/responses` + 用 `resolveUpstreamUrl` |
| ui     | `Models.vue` 宫格、`PlatformDetail.vue` 价格四栏、新组件 `CustomModelDialog.vue`、`PlatformPresetGrid.vue`                                                                   |

### 2.6 兼容与迁移（需求一）

- 存量 `protocol='custom'` → 读时按 `openai` 处理，**不批量改写**（改了也没收益，反而制造脏 diff）
- 存量 `apiUrl` 带 `/v1` → 新拼接函数天然兼容（去重），不需要迁移
- 用户手动添加的平台完全不受影响；目录只是新增入口
- 内置平台 `is_builtin=1`：已有的「不可编辑连接配置」约束继续生效，**但必须验证「首次添加内置平台并填 Key」这条路径可用**（`assertEditablePlatform` 只拦 update，不拦 create —— 这条要写进测试，别只靠眼看）

---

## 3. 需求二：费用核算 + 价格阈值

### 3.1 口径先定死（否则后面每个数字都不可信）

**「这次任务花了多少钱」= 本会话从创建到现在，所有走 LlmClient 的调用按调用当时的模型单价折算成人民币之和。**

- 计入：主循环、子智能体、上下文摘要、自评/接力判断、连通性测试（测试也真花钱，单独记 `source='probe'`，不计入任务但计入会话）
- 不计入：记忆抽取 / 会话标题生成 / 蒸馏（不在任务链路、量小；口径写进注释，避免以后有人拿账单对不上又去改单价）
- 币种：统一折算 CNY；美元平台用可配置汇率（默认 7.1）
- 按次计费（**生图 / 生视频**）：`llm-proxy.ts:253/274` 走的是元/张、元/秒，**不在 token 口径里**。  
  v1 完全没覆盖 ⇒ 任务里一旦调用就静默记 ¥0，用户会以为不要钱。  
  P0 处置：`usage_event` 加 `kind: 'token'|'image'|'video'` + `units` 字段，非 token 类**一律计入 `unpriced_calls`**  
  （宁可显示"有 N 次未计价"，也不能显示 ¥0）；`perImage` / `perVideoSecond` 单价放 P1
- 估算标注：usage 缺失 → 走估算，标 `estimated=1`，UI 前缀 `≈`。  
  ★ **先把口径收口成一个函数**：现有 `estTokens` **不是可复用的工具函数**，只是 `llm-task-manager.ts:3627`  
  的局部变量，同一个 `Math.round((fullContent.length + fullReasoning.length) / 2)` 表达式在  
  **`:3528` / `:3627` / `:6591` 三处各写一遍**。不先抽出来，实施时会抄出第四处并各自漂移。  
  ⇒ 新增 `shared/src/utils/token-usage.ts` 的 `estimateTokens(content, reasoning)`，三处改调

### 3.2 用量归一化（**唯一实现**，别在计价里按协议 if/else）

新增 `packages/shared/src/utils/token-usage.ts`：

```ts
export interface TokenUsageDetail {
  inputTokens: number;      // 全价输入（未命中缓存）
  cacheReadTokens: number;  // 缓存命中读取
  cacheWriteTokens: number; // 缓存写入
  outputTokens: number;
  reasoningTokens?: number; // 仅观测
  estimated?: boolean;
}
```

映射（三处，都是协议解析的**边界层**，别下沉到计价）：

| 协议               | 输入（全价）                   | 缓存命中                                  | 缓存写入                                    | 输出                  |
| ---------------- | ------------------------ | ------------------------------------- | --------------------------------------- | ------------------- |
| OpenAI chat      | `prompt_tokens - cached` | `prompt_tokens_details.cached_tokens` | 0（自动缓存无写入费）                             | `completion_tokens` |
| Anthropic        | `input_tokens`           | `cache_read_input_tokens`             | **`cache_creation_input_tokens`（新增采集）** | `output_tokens`     |
| OpenAI Responses | `input_tokens - cached`  | `input_tokens_details.cached_tokens`  | 0                                       | `output_tokens`     |


**关键坑**：OpenAI 的 `cached` 是 `prompt` 的**子集**，Anthropic 的 `cache_read` **不在** `input` 里。两者语义相反，一律按上表归一化；**不要复用 `ChatChunk.usage.promptTokens` 做计价**（它是旧的混合语义，token 预算还在用，改它等于同时动两套口径）。

实现方式：`ChatChunk.usage` **新增** `detail?: TokenUsageDetail`，旧字段语义不动。旧字段继续喂 `task.totalTokens` 的 token 预算，新字段喂成本。

### 3.3 价格模型（含缓存价 + 单位迁移）

现状单位是 **元/千 token**，而所有厂商价目表都是 **元/百万 token**（差 1000 倍，手填必错）。改：

```ts
export interface ModelPricing {
  unit: 'per_1m';           // 新写入一律 per_1m
  currency: 'CNY' | 'USD';
  input: number;            // 未命中输入
  output: number;
  cacheRead?: number;       // 缺省 = input（保守，不当作免费）
  cacheWrite?: number;      // 缺省 = input
  configured: boolean;      // ★ 区分「免费 0 元」与「没配价」
  source?: 'builtin' | 'manual';
  updatedAt?: number;
}
```

迁移（**三层，缺一不可**）：

1. **落库迁移（server 端）**：`model.pricing_json` 中 `unit` 缺失的行 × 1000 → `unit:'per_1m'`，用 `app_config` 标记位只跑一次（照 `agens-platform/service.ts:334` 的写法）
2. **★ 落库迁移（UI 端，v1 遗漏）**：`packages/ui/src/stores/platform.ts:355/359/398` **也直接写 `model` 表**。  
   只跑 server 端 ⇒ 用户在 UI 端编辑模型会把「元/千」的值**原样写回**，于是同一条记录两端单位不一致，  
   金额时大时小 1000 倍且极难复现（表现为"这台机器上算出来的钱不对"）。  
   ⇒ **同一段迁移逻辑抽成共享函数，两端各调一次**，标记位同样用 `app_config` 双份（或统一放 UI 可读写处）
3. **读时兜底**：`normalizePricing()` 遇到 `unit` 缺失仍按「元/千」换算（防止旧版本又被跑起来写回旧格式）

### 3.3.1 ★ 内置价格参考表（**由 P1 提到 P0**）

**为什么必须提前**：`configured` 三态的语义是「未配价 = ¥0 + `unpriced_calls` 计数」。若 P0 只有计价引擎、  
没有价格数据，则**所有模型都是 `configured:false` ⇒ 费用恒 ¥0 ⇒ ¥5 阈值永远不会触发** ——  
需求二的 P0 交付在真实使用中完全不可见（用户看到的永远是 ¥0.00）。这不是"少个锦上添花"，是功能空转。

- 数据放 `packages/shared/src/model-pricing-presets.ts`（纯数据，与厂商目录同构）
- 覆盖主流 ~30 条：DeepSeek（V3/R1）、Kimi、GLM、Qwen/百炼、豆包/火山、MiniMax、Moonshot、硅基流动常见型号
- 匹配方式：**按 `modelId` 模式匹配**（前缀/正则），不硬编码全量 ID（厂商 ID 变动频繁，硬编码只会过期）
- `source:'builtin'`，**用户可在平台详情覆盖**，覆盖后 `source:'manual'`
- 顶部显式标注「内置价为参考价，更新于 2026-10-17，实际以厂商账单为准」

计价函数（`packages/shared/src/utils/model-cost.ts`，纯函数）：

```ts
computeCost(detail: TokenUsageDetail, pricing: ModelPricing | undefined, fx: { usdToCny: number })
  → { cny: number; unpriced: boolean }
```

规则：

- 缺 `pricing` 或 `!configured` → `unpriced: true`，`cny = 0`（**绝不当成免费**，UI 显示「未配价，金额偏低」并计数）
- `cacheRead` 缺省按 `input` 计价（保守上界，宁可高估不要低估）
- DeepSeek 这类峰谷价：v1 按标准价（高峰价）估算，UI 标注「按标准价估算，实际以账单为准，误差可达 50%」—— 峰谷时段价放 P2

### 3.4 累计与账本

**任务内（内存）**：`LlmTask.cost` = `{ cny, detail 汇总, unpricedCalls, byModel: Map }`。  
**会话级（落库）**：新表（`apps/server/src/db.ts` 的 `initSchema` 里加）：

```sql
CREATE TABLE IF NOT EXISTS conversation_usage (
  conversation_id TEXT PRIMARY KEY,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cny REAL NOT NULL DEFAULT 0,
  unpriced_calls INTEGER NOT NULL DEFAULT 0,
  cost_noticed_units INTEGER NOT NULL DEFAULT 0,  -- ★ 提醒去重档位，必须落库（内存/前端去重都会丢）
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_event (      -- 明细，用于对账 / 日志 / 报表
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  task_id TEXT,
  platform_id TEXT, model_id TEXT,
  source TEXT NOT NULL,                       -- main | sub_agent | summary | judge | probe
  kind TEXT NOT NULL DEFAULT 'token',         -- token | image | video（★ 后两者按次计费，不进 token 口径）
  units INTEGER,                              -- kind=token 时为 null；image=张数、video=秒数
  input_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, output_tokens INTEGER,
  cost_cny REAL, price_snapshot_json TEXT,    -- 单价快照：删模型后历史仍可解释
  estimated INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_event_conv ON usage_event(conversation_id, created_at);
```

写入：

- `usage_event`：**每次 LLM 调用一行**。但注意流式路径里 `usage` 可能在多个 chunk 重复出现 —— 只在**该次调用结束后**用最后一份 usage 写一次（`consumeStream` 里只更新局部变量，循环外 `record`），否则重复计费
- `conversation_usage`：`INSERT … ON CONFLICT(conversation_id) DO UPDATE SET cost_cny = cost_cny + excluded.cost_cny, …`（**原子累加**，不读改写 —— 多端/多任务并发时不丢账）

**子智能体**：用量按**子智能体自己的平台/模型单价**计价，计进同一会话账本（`source='sub_agent'`），同时计入父任务 `cost.cny`。顺带修掉现状：子智能体 token 不进父任务 `totalTokens`（`llm-task-manager.ts:6591` 只加到 `subTokensTotal`），导致父任务的 token 预算对子智能体完全无感。

**计价入口的唯一化**：`LlmClient.chat/chatStream` 的 options 增加 `onUsage?: (detail, meta) => void`，在协议边界归一化后回调一次。任务链路里的每个调用点（主循环 1 处、子智能体 2 处、`decideAutoContinue`、摘要 2-3 处）传同一个 `recordUsage(task, source)`。**不要在每个调用点各算一遍乘法**。

**★ 读取口径（决定阈值判据是否可信）**：判定与显示一律读  
**`conversation_usage.cost_cny`（库）+ 本任务内存增量（未落库部分）**，不要用纯内存的 `task.cost`。

- 纯内存 ⇒ 进程/后端重启后归零 ⇒ 同一个会话"刚超了 ¥5、重启后又从 ¥0 开始"，  
  阈值被绕过且**极难复现**（用户只会说"提醒时灵时不灵"）
- 库里的数据每次调用已原子累加（3.4 的 upsert），读它是最可靠的单一事实来源
- 内存增量只在"调用已完成但尚未 upsert"的窗口内存在，两者相加即为当前真实值

### 3.5 阈值：只提醒，程序不停（D4）

**判据**：成本阈值是**给用户看的仪表**，不是**给程序用的刹车**。① 花的是用户的钱，只有他能判断  
"这个任务值不值得继续"；② 程序自停会丢掉已完成的工作现场，代价比多花几块钱高得多；  
③ 与 Claude Code 等同类产品同口径。

**★ 三条硬约束**（写死，别在实施中软化）：

- 成本**不进** `checkTaskBudgetHit` 的停止语义 —— 那个函数的返回值一旦含 `kind:'cost'`，  
  下游收尾块会顺手把它当停止信号处理。**也不要扩展它的签名**：它只有「停/不停」两种语义，而成本只有「提醒」。  
  （另注：server 侧 `llm-task-manager.ts:4192` 还有个**本地包装**，返回类型硬编码 `'tokens'|'wallclock'` ——  
  真要扩返回值，这处不改会**静默吃掉新 kind** 且不报错。D4 下我们不扩，但这条留给 Q1。）
- **不进**收尾块、**不阻止**自动接力
- **不调模型**做总结（为了报告花了多少钱再花一笔是荒谬的）

**判定点**：独立提醒器 `maybeNoticeCost(...)`，挂在**每轮 ReAct 循环结束** —— 与 token/墙钟闸  
（`checkTaskBudgetHit` 调用点）**刻意不同址**，从物理上避免被并入停止语义。

```ts
// 独立函数，不复用 checkTaskBudgetHit
maybeNoticeCost(usedCny: number, cfg: CostBudgetConfig, lastNotifiedUnits: number)
→ { units: number; kind: 'warn' | 'exceeded' | 'hard_stop' | null }
```

**去重（防刷屏）**：提醒档位 `units = floor(usedCny / limitCny)`，只有档位**上升**才提醒一次。  
`lastNotifiedUnits` **落库**（`conversation_usage.cost_noticed_units`）—— 不存内存、不靠前端去重：  
内存会随重启归零，前端去重刷新即丢、多窗口各弹一次。

| 触发                                | 行为                                                       |
| --------------------------------- | -------------------------------------------------------- |
| 累计到 `warnRatio`（80%，¥4）           | 一次预警 `kind:'warn'`                                       |
| 每跨过一个 `limitCny`（¥5 / ¥10 / ¥15…） | 提醒一次 `kind:'exceeded'`，**任务继续跑，一步不停**                    |
| `hardStopCny`（**默认 0 = 不启用**）     | D4 的唯一例外：用户自填才生效，达到才走现有停止/收尾路径。**默认 0 ⇒ 这条分支在出厂配置下永不执行** |

**提醒形态**：默认**不落会话消息**（`persistWarningInChat: false`，可开）。  
理由：落进消息 ⇒ 进上下文 ⇒ 后续每轮输入都多带这段 ⇒ **提醒自身在推高它提醒的那个数字**，  
长会话里会自我加速。改为 emit `task:cost_notice`，前端以 inline 提示条呈现（可复制、可关闭）。

**文案（模板生成，零额外调用；数字为占位）**：

```
本会话累计花费约 ¥5.03，已超过你设置的 ¥5.00 —— 任务继续运行，不会自动停止。
本次运行 ¥1.87 · 输入 268.4K（缓存命中 191.2K）· 输出 21.7K
花费构成：deepseek-v4-pro ¥1.62（87%）· doubao-seed-1.6-flash ¥0.25（13%）
另有 2 次调用未配置价格，实际金额可能更高
提示：本会话的历史会随每轮重复计入输入，开新会话继续会更省。
[ 新开会话继续 ]  [ 知道了 ]
```

实现细节：

- 金额格式：`<1` 显示 4 位小数（小额很常见），`≥1` 显示 2 位
- **★ 提醒时必须先把进度真写下去**：`recordTaskProgress(task, 'cost_notice', …)`（幂等）。  
  因为任务不停，v1 文案里"进度已写入空间记忆"这句在提醒的**当下**必须成立 —— 不能等收尾再写，  
  否则任务若被用户手动中断，这句就是**假的**（v1 的写法依赖"马上要收尾"，D4 下该前提没了）
- emit `task:cost`（每轮增量 + 累计，驱动会话头金额）与 `task:cost_notice`（提醒，驱动提示条 + 按钮）。  
  v1 里的 `task:cost_exceeded`（终态前置）**取消** —— D4 下没有终态
- 判定前**现读**配置（与现有 `liveMaxSteps()` 同口径），不要在任务创建时快照 ——  
  否则用户调低阈值后要等下一个任务才生效，会被当成"改了没反应"

#### 3.5.1 设置项全表（`app_config` key `cost_budget`）

```json
{
  "enabled": true,
  "limitCny": 5,
  "warnRatio": 0.8,
  "hardStopCny": 0,
  "usdToCny": 7.1,
  "persistWarningInChat": false
}
```

| 键                        | 默认    | 说明                                         | 位置          |
| ------------------------ | ----- | ------------------------------------------ | ----------- |
| `enabled`                | true  | 总开关；关闭后**仍统计**、只是不提醒（别做成"关了就不记账"）          | 设置 → 通用     |
| `limitCny`               | 5     | 单会话提醒档位；**0 = 关闭提醒**（仍统计）                  | 设置 → 通用     |
| `warnRatio`              | 0.8   | 预警比例（档位的 80%，即 ¥4）                         | 设置 → 通用     |
| `hardStopCny`            | 0     | **0 = 永不停**；自填才启用。**建议 UI 上折叠进"高级"，不给默认值** | 设置 → 通用（高级） |
| `usdToCny`               | 7.1   | 美元平台汇率；**历史按调用时汇率固化**，改汇率不重算历史             | 设置 → 通用     |
| `persistWarningInChat`   | false | 提醒是否落会话消息（默认否，理由见上）                        | 设置 → 通用（高级） |
| `config_json.maxCostCny` | 0     | **智能体级**单任务上限，0/缺省 = 跟随会话；与会话档位取**更严者**    | 智能体编辑       |

### 3.6 「新开会话」（用户主动，程序不代劳）

v1 把按钮放在"任务已结束"的收尾消息里 —— D4 下任务不会因成本而结束，所以按钮改为  
**提醒条上的可选项**，点了才发生，**绝不自动发消息**（自动发 = 直接扣钱）。

1. `createConversation('继续：<原标题>', { agentId, platformId, modelId, spaceId })`
2. 把接力指令**预填进输入框**（不发送）：
   > 继续任务「<原标题>」。先读取空间记忆中该任务的进度与未完成步骤，从断点继续，不要重复已完成的部分。
3. 旧会话保留入口（`sourceMeta` 已有该字段），用户可随时回看花费明细

★ 注意与自动接力的关系：成本**不阻止**自动接力（硬约束 3 条之一），但自动接力的每个批次  
都会在轮末判定一次 ⇒ 必须靠 §3.5 的**整倍数档位去重**压住刷屏，否则一个长任务会弹几十次。

依据：`createConversation` 已支持全部上下文参数（`chat.ts:1454`），`recordTaskProgress` 已把进度写进空间记忆/进度明细 —— 接力链条现成，不需要新造「任务快照」格式。

### 3.7 UI 改动

| 位置           | 改动                                                                  |
| ------------ | ------------------------------------------------------------------- |
| 会话头部 / 输入框上方 | 小字 `¥0.42`（等宽），点击展开明细弹层（按模型/按来源）；**不加大图标、不加 tip**                   |
| 消息流          | inline **提示条**（不落 assistant 消息，避免进上下文）；带「新开会话继续 / 知道了」两个动作。可关闭、可复制  |
| 设置 → 通用      | 「费用预算」块：开关、单会话提醒档位、预警比例、美元汇率（复用现有 SettingRow）；`hardStopCny` 折叠进「高级」 |
| 智能体编辑        | 与「最大循环步数」同段增加「单任务费用上限（元，0=不限）」                                      |
| 平台详情 · 模型编辑  | 价格四栏（输入 / 缓存命中 / 缓存写入 / 输出，元/百万），币种，`未配置` 显式状态；内置价显示「参考价 · 可覆盖」     |
| LLM 日志（P2）   | 每行费用列 + 会话合计                                                        |

> **窄屏 / 移动端**：供应商宫格在窄屏要 **2 列 → 1 列**（`ADAPTATION-NOTES` 已知坑）；  
> 会话头金额小字与提示条在窄屏不能挤掉输入框。改完 `Models.vue` / `PlatformDetail.vue` 后  
> **必须确认移动端是否有独立入口页**（功能只写在 A 页面、用户却从 B 页面进 ⇒ 表现为"功能不存在"）。

### 3.8 坑表（每条都会真实咬人）

| #      | 坑                                                                                                            | 处置                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1      | OpenAI `cached` 是 prompt 子集，Anthropic `cache_read` 独立 → 重复计费或漏计                                              | 协议边界归一化（3.2 表），计价只认 `TokenUsageDetail`                              |
| 2      | `cache_creation_input_tokens` 未采集 → Anthropic 缓存写入漏计（长 system prompt 场景差额不小）                                 | `anthropic.ts` 补采 + 单测夹具                                            |
| 3      | 同一调用多个 chunk 都带 usage → 重复计费                                                                                 | 循环内只更新变量，调用结束后记一次                                                   |
| 4      | 未配价格当 0 元 → 金额看起来"很便宜"，用户据此决策                                                                                | `configured` 三态 + `unpriced_calls` 计数 + UI 提示                       |
| 5      | 免费模型（GLM-Flash 类）与未配价同形                                                                                      | `configured:true, input:0` 表示免费；`configured:false` 表示未知             |
| 6      | DeepSeek 峰谷价（空闲半价）                                                                                           | 标准价估算 + 文案声明；P2 做时段价                                                |
| 7      | 美元平台（OpenRouter/AWS/BytePlus）                                                                                | `currency` + 可配汇率，历史按调用时汇率固化（改汇率不重算历史）                              |
| 8      | 子智能体用量不进父任务                                                                                                  | 按子智能体模型单价计入同一账本；父任务 token 预算同步纳入（顺手修）                               |
| 9      | 自动接力会把预算基线重置（`budgetBaselineAt = now`）                                                                       | 成本阈值**不随批次重置**，否则等于关闭                                               |
| 10     | 并发（多端/多任务同会话）累加丢账                                                                                            | SQL 原子 `cost = cost + ?`，不读改写                                       |
| 11     | 平台/模型被删后历史费用无法解释                                                                                             | `price_snapshot_json` + `model_id` 字符串快照                            |
| 12     | 为了报告花费再调一次模型总结                                                                                               | 成本触达时用模板，零额外调用（并用 mock 计数断言）                                        |
| 13     | 中转站乱报 usage（prompt 恒 0）                                                                                      | usage 全 0 且非空响应 → 视为缺失，走估算并标 `estimated`                            |
| 14     | 内置平台被误判「不可编辑」导致填不了 Key                                                                                       | 加「首次添加内置平台 + 填 Key」用例（`is_builtin` 只拦连接配置）                          |
| **15** | **★ 提醒落进会话消息 → 进上下文 → 后续每轮输入都多带这段 → 提醒自身在推高它提醒的那个数字**（长会话自我加速）                                               | **默认不落消息**（`persistWarningInChat:false`），只 emit 事件 + 前端提示条          |
| **16** | **★ 任务不停 ⇒ v1 文案里「进度已写入空间记忆」在提醒的当下并不成立**（v1 依赖"马上要收尾"，D4 下该前提没了）                                             | 提醒时**同步**调一次 `recordTaskProgress(task,'cost_notice',…)`（幂等），写完再发文案  |
| **17** | 自动接力每个批次都会在轮末判定 ⇒ 提醒刷屏（一个长任务弹几十次）                                                                            | 整倍数档位去重（§3.5）+ 档位**落库**；不靠前端去重（刷新即丢、多窗口各弹一次）                        |
| **18** | **换未配价模型可绕过阈值**：`unpriced` 记 0 ⇒ 换便宜/未配价模型继续跑，数字不再增长                                                         | 提醒文案恒定带「另有 N 次未计价」；可选按保守暂估价计入（见 Q4）                                 |
| **19** | 判定读纯内存 `task.cost` ⇒ 后端重启归零 ⇒ 同一会话"刚超 ¥5、重启后又从 ¥0 开始"，**极难复现**                                               | 判定读**库累计 + 内存增量**（§3.4）；内存只补"已调用未落库"的窗口                             |
| **20** | **pricing 单位迁移只跑 server 端** ⇒ UI 端（`stores/platform.ts`）编辑模型把「元/千」原样写回 ⇒ 同一条记录两端单位不一致，金额时大时小 1000 倍          | 迁移逻辑抽共享函数，**server / UI 两端各调一次** + 读时兜底（§3.3）                       |
| **21** | 生图 / 生视频**按次**计费，`TokenUsageDetail` 里没位置 ⇒ 静默记 ¥0，用户以为不要钱                                                    | `usage_event` 加 `kind`+`units`，非 token 类一律计入 `unpriced_calls`（§3.1） |
| **22** | 新增 store 导出 / 新组件 ⇒ `vi.mock('../stores')` 白名单没同步 ⇒ `PlatformDetail.mount.test.ts` 真挂载用例全崩在 setup，看着像"组件改坏了" | 实施前先列"本次新增的导出清单"，逐个补进 mock 白名单（本项目已踩两次）                             |
| **23** | 方案里的行号在实施时已漂移数十行，照行号改会落错位置                                                                                   | 一律按**函数名 / 唯一注释**锚定（锚点清单见 §1 表下）                                    |


## 5. 验收标准（要能真跑，不是"看起来对"）

1. **路径拼接**：`resolveUpstreamUrl` 单测覆盖上表 5 种 base（含带 `/v1` 与不带两种写法）；错误实现必须能把用例打红（变异验证：把去重逻辑删掉 → 火山用例失败）。
2. **Responses 解析**：夹具覆盖文本流、reasoning 流、function_call 流、`response.completed` usage、`response.incomplete`；断言 `toolCalls` 的 index/id/arguments 与 OpenAI 路径同形（下游 `accumulateToolCallDeltas` 不改一行也能用）。
3. **三格式真跑**：用本机 `tools/mock-llm-server.cjs`（新写，按 `/v1/chat/completions`、`/v1/responses`、`/v1/messages` 各返回一段固定 SSE）分别建平台 → 连通性测试 → 一轮对话 → 一次工具调用，三条链路都过。有真 Key 时再补一次各家的真实调用（DeepSeek / 智谱 / 火山任选）。
4. **计价等式**：mock 返回**精确** usage（如 input 1000（cached 400）/ output 200），价格配 输入 2、输出 8、命中 0.5（元/百万）→ 断言 `cost == 400*2/1e6 + 600*0.5/1e6 + 200*8/1e6`（**等式断言，不是 `> 0`**）。
5. **★ 阈值真提醒、且真不停**（D4 的核心验收，与 v1 断言方向相反）：阈值设 ¥0.001、跑到至少跨过 2 个档位，  
   断言 (a) 提醒**恰好**出现 2 次（不是 1 次、不是每轮一次）—— 整倍数去重生效；  
   (b) **任务仍在继续**：mock server 的请求次数**继续增长**（这条是 D4 的关键反向断言，v1 这里断言的是"停止"）；  
   (c) **没有**额外的总结调用（mock 计数不超出预期）；  
   (d) 提醒**不**出现在会话消息列表里（默认 `persistWarningInChat:false`）；  
   (e) 提醒时 `recordTaskProgress` 已被调用过（"进度已写入"这句必须是真的）。
6. **账本一致**：同一任务 N 次调用 → `usage_event` 的 cost 之和 == `conversation_usage.cost_cny` 增量（SQL 对账脚本放 `scripts/`）。
7. **子智能体计入**：父任务 + 子智能体各 1 次调用，价格不同 → 会话账本 = 两者之和，且 `task.totalTokens` 包含子用量。
8. **新开会话**：点提醒条上的按钮 → 新会话存在、标题为「继续：…」、输入框已预填、**未自动发送**、  
   旧会话可通过提示条/入口回看花费（**不要求**它落在消息流里）。
9. **★ 刷新后金额不丢**：跑到一半刷新页面 → 会话头金额与刷新前一致（证明读的是**库累计**，不是内存 `task.cost`）。
10. **★ 默认永不停**：出厂配置（`hardStopCny=0`）下跑超 ¥5 三档 → 任务仍在跑；手动设 `hardStopCny=0.01` → 才停。
11. **★ 双端单位一致**：在 UI 端编辑某模型价格并保存 → 读回算出的金额与 server 端同量级（防 ×1000 漂移，坑 #20）。

---

## 6. 风险

| 风险                                   | 级别         | 应对                                                                                                        |
| ------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| Responses API 各家实现子集不一（刚上线即遇 400）    | **high**   | 独立降级链 + 明确「Responses 仅对确认支持的厂商默认勾选」，其余默认 Chat Completions                                                 |
| 价格表随时间变动，估算与账单对不上                    | **medium** | 一律标注「估算」+ 更新时间；用户可改；不承诺对账                                                                                 |
| `pricing` 单位迁移（×1000）出错 → 金额差 1000 倍 | **high**   | **三层**兜底（server 落库 + **UI 端落库** + 读时 fallback）+ 迁移前后抽样断言（老值 0.002 元/千 → 2 元/百万）；两端不一致时表现为"这台机器上金额不对"，极难复现 |
| 会话账本写库频率（每步一次）                       | **low**    | 单行 upsert，SQLite 足够；必要时按步合并                                                                               |
| 内置目录 16 家维护成本                        | **medium** | 目录是纯数据文件；不硬编码模型 ID；过期只影响「建议清单」，不影响调用                                                                      |
| **D4 下用户忽略提醒 → 无人值守任务跑穿预算**          | **medium** | 整倍数档位持续提醒（¥5/¥10/¥15…）+ 提醒条常驻可点；`hardStopCny` 给需要兜底的用户留口（默认关）                                             |
| 内置价格参考表过期 → 估算偏离                     | **medium** | 标注更新日期 + 「参考价 · 可覆盖」；**不承诺对账**；过期只影响估算精度，不影响调用                                                            |

---

## 7. 明确不做（防止范围蔓延）

- 不做真实账单对账 / 充值余额查询（各家接口不统一）
- **★ 不因成本自动停止任务**（D4）。唯一例外是用户自填的 `hardStopCny`，出厂默认 0 = 不启用
- **★ 不因成本拦截自动接力**、不因成本调模型写总结、不把成本并进 `checkTaskBudgetHit` 的停止语义
- 不把 `pricing` 做成"从厂商官网自动抓取"（抓取稳定性与合规都是坑）
- 不为成本单独造任务快照格式（复用空间记忆 + 进度明细）
- 不在聊天页新增常驻大图标/教程 tip（只保留金额小字 + 触达提示）
- 不在提醒时改会话标题 / 不改任务状态（提醒是"仪表读数"，不是状态迁移）

---

## 8. 实施进度（P0 地基，2026-10-17 夜 ~ 10-18 凌晨）

**策略：先做零冲突的新文件层。** 工作区有并行会话的在途改动（`llm-task-manager.ts`  
+337、`db.ts` +30、`chat.ts` +57），被占用的文件不动。

> ⚠️ 本文档在 00:03 被并行会话覆盖过一次（§8 丢失后重写）。**并行会话下别相信"文档当前内容>   
> 就是我写的那份"**，关键结论以代码和测试用例为准。

| #      | 模块                                | 文件                                                                                                                                                                                       | 测试       | 变异验证                                 |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------ |
| 1      | 路径拼接                              | `packages/core/src/llm/api-path.ts`（新）                                                                                                                                                   | 11 ✅     | 双向钉住（无条件加 v1 → 8 红；永不加 → 3 红）        |
| 2      | 用量归一化                             | `packages/shared/src/utils/token-usage.ts`（新）                                                                                                                                            | 13 ✅     | Anthropic 误用减法口径 → 打红                |
| 3      | 计价                                | `packages/shared/src/utils/model-cost.ts`（新）                                                                                                                                             | 15 ✅     | `/1e6` 改成 `/1e3`（差 1000 倍）→ 5 红      |
| 4      | 内置参考价                             | `packages/shared/src/model-pricing-presets.ts`（新）                                                                                                                                        | 16 ✅     | 匹配顺序反转 → 4 红                         |
| **5**  | **接入 client.ts**                  | 13 处 `'v1/...'` → `kind` 枚举；4 处 `urlDesc` → `describeUrl(kind)`；新增 `resolveUrl()` / `describeUrl()`                                                                                      | +1 守卫 ✅  | 插回 `'v1/chat/completions'` → 打红      |
| **6**  | **接入 llm-proxy.ts**               | 5 处路由实参 + `/v1/models` 两处（原 `:301` / `:336`）                                                                                                                                             | —        | `tsc` 无新增错误                          |
| **7**  | **真跑 HTTP**                       | `packages/core/src/llm/api-path.http.test.ts`（新）                                                                                                                                         | 7 ✅      | 真起 server，断言**对端收到的 path**           |
| **8**  | **Responses 协议**                  | `packages/core/src/llm/responses.ts`（新）+ `sse-frames.ts`（新）                                                                                                                              | 21 ✅     | tool index 固定 0 → 红；只取第一条 system → 红 |
| **9**  | **协议分派**                          | `shared/types`（`Protocol` + `normalizeProtocol`）、`client.ts`（`responsesStream` / `responsesChat` / `responsesChatTest` + 400 降级）                                                         | —        | `tsc` 干净                             |
| **10** | **/responses 路由**                 | `llm-proxy.ts`（鉴权沿用 Bearer，**不单独写一份 header**）                                                                                                                                            | —        | `tsc` 干净                             |
| **11** | **★ usage.detail 埋点**             | `shared/types`（`ChatChunk.usage.detail`）、`stream.ts` / `anthropic.ts` / `responses.ts` 三处协议边界                                                                                            | +6 一致性 ✅ | Responses 复用错归一化函数 → 打红              |
| **12** | **★ Anthropic 补采 cache_creation** | `anthropic.ts` 新增 `startUsage` 缓存（输入侧在 message_start、输出侧在 message_delta）                                                                                                                 | +3 ✅     | 不传 startUsage → 缓存写入用例打红             |
| **13** | **账本两表 + 写入口**                    | `apps/server/src/usage-ledger-sql.ts`（新，纯 SQL 单一来源）+ `db.ts` 建表 + `services/usage-ledger.ts`（新，recordUsage/getConversationUsage/checkAndSaveNotice/getCostBudgetConfig/summarizeByModel） | 9 ✅      | 原子累加（禁读改写，注释钉死）                      |
| **14** | **提醒器**                           | `packages/shared/src/utils/cost-notice.ts`（新，`maybeNoticeCost` + `formatCostNotice`）                                                                                                     | 19 ✅     | 档位去重 / 默认永不停（hardStop=0）双向变异         |
| **15** | **★ mock server 真跑**              | `tools/mock-llm-server.cjs`（新，三协议固定 SSE + 工具调用 + usage 全 0 模式 + 请求计数）+ `mock-llm-server.http.test.ts`（新，真 HTTP × 真解析器）                                                                   | 16 ✅     | 见下「抓到的真实 bug」                        |
| **16** | **★ 修 Responses 工具参数双拼**          | `llm-task-manager.ts` `accumulateToolCallDeltas` 重发判据 `>` → `>=`                                                                                                                         | +1 回归 ✅  | 改回 `>` ⇒ 新用例精确打红（其余 7 例不红）           |
| **17** | **★ 定价单位落库迁移（双端，坑 #20）**       | `shared/src/utils/pricing-migration.ts`（新：**换算 + 驱动的唯一实现**，复用 `normalizePricing` 的 ×1000）+ `server/services/pricing-unit-migration.ts`（新，同步 sqlite shim）+ `server/index.ts` 启动调用 + `ui/stores/platform.ts` 离线三处 `ensurePricingUnitMigrated` | 15 + 5 + 3 ✅ | 去掉 ×1000 ⇒ 9 红；UPDATE 参数错位 ⇒ 2 红；删 UI 调用 ⇒ 2 红 |
| **18** | **★ 记账缺口收口（probe + 压缩摘要）**       | **probe**：`llm-proxy.ts` 非流式转发成功后 `recordProxyProbeUsage`（usage 归一化复用 shared 的 normalize*Usage，**代理不另写解析**；conversation_id=''，流式/SSE 不记）+ `usage-ledger.ts` 新增 `estimateUsageDetail` / `loadModelPricingRaw` / `recordStandaloneUsage`（无任务调用的记账唯一出口）。**摘要**：core `window.ts` `setSummaryUsageHook`（`summarize()` 捕获 usage + 输入/输出原文回调一次，抛错不炸压缩）+ `llm-task-manager` 三处 `buildContextView` 挂钩（主循环/子智能体走 `recordTaskUsage('summary')`，手动压缩走 `recordStandaloneUsage`）+ `recordTaskUsage` 估算分支改调 `estimateUsageDetail` | 5 + 3 ✅ + 39 回归 | 删 probe 调用 ⇒ 3 红；删 onUsage 捕获 ⇒ 1 红；假 ContextWindow 缺新方法 ⇒ 4 文件全红（白名单陷阱实锤） |

已跑：`shared` 全量 62 ✅、`core` 全量 **343** ✅、`tsc`（core / shared / server 均无新增错误）。  
导出登记：`shared/src/index.ts`（价格表）、`shared/src/utils/index.ts`（token-usage / model-cost）、  
`core/src/index.ts`（api-path —— server 的 llm-proxy 由此复用同一实现）。

**★ 新增守卫**（`api-path.test.ts` 最后一条）：静态断言 `client.ts` / `llm-proxy.ts` 里  
**不得再出现 `v1/` 字面量**。理由：改用 kind 枚举后，将来有人为了"临时修个问题"手写回一个  
`'v1/chat/completions'` —— OpenAI 官方依然能用，**但国产厂商会静默 404**，而写的人和 review 的人  
都不会第一时间想到路径。这道守卫让"绕过唯一实现"在测试阶段就打红（已变异验证：插回去确实红）。

**★ 本轮抓到的真实 bug**（`sse-frames.ts` 第一版）：SSE **最后一行没有换行结尾**时，  
它永远留在缓冲区里不被解析 ⇒ 最后一个事件（常常正是 `response.completed`）丢失 ⇒  
上层把**正常完成**的流误判成"被掐断"，触发本不必要的续写/报错。  
写测试前我自己没意识到这个分支，是"末帧不带空行"那条用例把它逼出来的。

**★ 归一化的核心验收**（`usage-detail.test.ts`）：同样的实际用量（输入 1000、命中 400、输出 200），  
三家报法不同 —— OpenAI 把 cached 放进 prompt、Anthropic 把 cache_read 放在 input **之外** ——  
归一化后必须**完全一致**（全价输入都是 600）。这条断言同时钉住了坑 #1（语义相反）。

**★ 本轮（10-18 01:00~01:15）抓到的真实 bug**（mock 真跑逼出，非单测能发现）：  
`accumulateToolCallDeltas` 的「重发去重」判据原本是 `incArgs.length > prevArgs.length`。  
OpenAI Responses 的 `response.output_item.done` 会带**完整** arguments（真实 API 也是如此），  
而此前的增量分片已拼出**等长**的完整串 ⇒ 等长漏过判据 ⇒ 拼成 `{"tz":"UTC"}{"tz":"UTC"}` 非法 JSON  
⇒ `parseToolArguments` 失败 ⇒ **工具静默不执行**。修为 `>=`（等长且互为前缀 ⇒ 必然相同 ⇒ 替换是无操作）。  
⇒ 教训：**"网关重发完整 arguments" 这条防御早就存在，但只覆盖了"更长"一种形态**；  
mock server 用真实 API 的帧序列一打，等长形态立刻现形。已加回归用例并变异验证。

**下一批（按顺序，都要真跑验证）**：

1. ~~`tools/mock-llm-server.cjs`~~ ✅ 已完成（16 用例 + 顺手修掉上述真 bug）
2. 账本两表 + `usage-ledger.ts` + 提醒器 `maybeNoticeCost` ✅ 已完成（日志 00:49~00:56 落地，本轮补验 28 用例）
3. **接线**（核心缺口，账本目前还是孤岛——`recordUsage` 零调用方）：     
   a. `client.ts` options 加 `onUsage?(detail | undefined)`，三协议流式 + `chat()` 各回调**一次**（undefined = 没拿到，调用方自行估算）；     
   b. `llm-task-manager.ts` 各调用点传 `recordUsage(task, source)`（主循环 1 / 子智能体 2 / 摘要 2-3 / judge 1）；     
   c. 轮末 `checkAndSaveNotice(conversationId, getCostBudgetConfig())` → emit `task:cost` / `task:cost_notice`；     
   d. 提醒时**先** `recordTaskProgress(task, 'cost_notice', …)` 再发文案（坑 #16）；`hard_stop` 才走现有停止路径（D4 唯一例外）；     
   e. 子智能体用量同步进父任务 `totalTokens`（坑 #8）。     
   ⚠️ 该文件刚被并行会话提交过（034189ce），动手前先 `git status` 复核。
4. UI：会话头金额 + 提醒提示条 + 设置项（§3.5.1 全表）+ 智能体编辑 `maxCostCny`
5. 三格式 UI 下拉（`Models.vue` / `PlatformConfigCard.vue`）+ 内置厂商宫格 + `CustomModelDialog.vue` + `/platforms/catalog` + `/platforms/custom-model`
6. ~~单位迁移三层~~ ✅ 已完成（10-18 上午，23 用例）：
   - **换算与驱动收口在 `shared/src/utils/pricing-migration.ts`**：`migratePricingJsonText`（纯函数，
     ×1000 **复用 `normalizePricing`**，不写第二份换算）+ `planPricingUnitMigration` +
     `runPricingUnitMigration`（驱动：逐个 try，**坏行/缺表都不炸启动**）。
     驱动接口的方法**允许同步** ⇒ server 的 better-sqlite3 与 UI 的 async adapter **共用同一段逻辑**。
   - **server 端**：`services/pricing-unit-migration.ts`（同步 shim）+ `index.ts` 启动段
     `void migrateModelPricingUnit()`（微任务内跑完，失败只告警）；标记位 `app_config`
     key `model_pricing_unit_per1m_v1`。
   - **UI 端**：`stores/platform.ts` 的 `loadModels` / `addModel` / `updateModel` **离线直连库分支**
     前各挂一次 `ensurePricingUnitMigrated()`（一次会话只跑一次）。
     ⚠️ 当前 `useServerApi` 恒 true ⇒ 离线分支**线上走不到**（注释已写明"本地 adapter.db 分支已废弃"），
     这条是**防守性接线**：分支一旦复活就带着正确单位，成本≈0（幂等、失败不外抛）。
   - **幂等不靠标记位**：判据是"`unit !== 'per_1m'` 才改写"，改写后必带 per_1m ⇒ 第二次必然 0 写；
     标记位只用于省一次全表扫描，**写不进去也无害**（UI 端 core schema 没有 `app_config`）。
   - 验收 11（双端单位一致）已用**真库**钉住：迁移后金额 == 迁移前「读时兜底」金额
     （1000×2 + 500×8 / 1e6），且抽样断言老值 `0.002 元/千 → 2 元/百万`。
   - **未验证项**：未起整实例真跑后端启动（同 P0 记录）；`index.ts` 的挂载只有静态守卫。
7. ~~probe / 压缩摘要记账~~ ✅ 已完成（10-18 上午，见上表 #18）。两个口径说明：
   - **probe** 的 `conversation_id=''`：明细进账本（对账完整），**会话账单不显示**（按会话查）——
     刻意的，别"顺手"把 probe 挂到某个会话上；
   - **摘要记账**经 core 的 `setSummaryUsageHook` 回调（core 不依赖账本），server 端三处挂钩；
     ★ 教训再现：4 个测试文件的假 `ContextWindow` 缺 `setSummaryUsageHook` ⇒ 任务直接 failed，
     归属判定用「stash 后单独复跑」确认是我造成再补白名单（与坑 #15 mock 白名单同一族）。

> ⚠️ 待办（**不在本批**）：`llm-task-manager.ts` 三处重复的 `Math.round((content+reasoning)/2)`>   
> 应改用 shared 既有的高精度 `estimateTokens`，但会改变 token 预算触发点（估算变准 ⇒ 压缩更早触发），>   
> 需单独评估；且该文件正被并行会话占用。

> ⚠️ 未验证项：llm-proxy 的改动目前只过了 `tsc`，**没有起后端真跑**（后端需整实例启动）。>   
> 应在下一批补一次端到端：建平台 → 拉模型 → 连通性测试。
