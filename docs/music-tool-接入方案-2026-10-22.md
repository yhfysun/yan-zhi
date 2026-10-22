# 音乐生成工具接入 yan-zhi —— 实施方案

> 目标：聊天里说「给这段词配上歌」，模型能直接出成品 mp3。
> 现状结论：**能力基本都在，缺的是接线**。不是从零开发。

## 本轮修订（v6 · 2026-10-22 18:30）

按用户四点要求修订：

| # | 要求 | 落到哪 |
|---|---|---|
| 1 | 删除 `tmp/ACE-Step-1.5` | ✅ 已执行，23.5GB 已释放 |
| 2 | 本次配置要记录 | ✅ 新增第八章「实验配置存档」 |
| 3 | 默认挂载 | ✅ 3.2 改为全部模式默认挂载 |
| 4 | 复用已部署模型 | ✅ 4.2 明确只复用不复制 |
| 5 | **工具发现三件套缺失** | ✅ 新增第三章（v2） |
| 6 | **查分类下工具改「所有」+ 全量分类 + 详情 + 分页 + 每类≤20** | ✅ 3.3 按实测重写 |
| 7 | **git 危险操作也全开**（拉/并/改代码闭环） | ✅ 3.1 改为 14 项全补 + 授权兜底 |
| 8 | 挂载走 A / 删 tu2 | ✅ 3.2 定方案 A；`singing/acestep/tu2` 已删 |
| 9 | **勿与 Claude Code 店铺重构冲突** | ✅ 新增第三章A（冲突规避） |
| 10 | 安装**双通道**：用户点击 或 模型下载（都要确认）| ✅ 第三章B 重写（v6） |
| 11 | **兼容现有语音包下载** | ✅ 3B.1 提炼为通用 Installer 契约 |

> ★ 用户指出的关键洞察：现在有「按分类查工具」的 `get_api_tools`，
> 但**没有「查工具详情」的入口**，而且 `get_api_tools` **不按白名单过滤** ——
> 于是「模型能查到、但调不动」这种更坏的失败模式已经存在。
> 补齐三件套后，**即使某个模式没挂载某工具，模型也能发现并调用它**。

---

## 一、现状盘点（实测，非推测）

### 1.1 已有的本地音乐能力（8 个服务，2200+ 行）

| 文件 | 行数 | 职责 |
|---|---|---|
| `music-plan.ts` | 480 | 乐谱规格与编曲展开（纯函数） |
| `music-generate.ts` | 381 | 外部音乐大模型（Suno / 阿里百炼 / OpenAI 兼容） |
| `music-instruments.ts` | 301 | 乐器音色库 |
| `music-sing-tts.ts` | 275 | TTS 唱法（Edge 音色） |
| `music-synth.ts` | 261 | 合成器装配 |
| `music-vocal.ts` | 250 | 共振峰人声（零素材零模型） |
| `music-sing-install.ts` | 220 | 运行时安装器（多镜像+断点续传） |
| `music-sing-diffsinger.ts` | 179 | DiffSinger ONNX 歌声合成 |
| `music-render.ts` | 141 | 渲染编排（乐谱→音频→落盘） |

### 1.2 工具 schema 已写好（`api-tools/media.ts`）

- `music_compose` —— 本地配乐合成
- `music_generate` —— 外部大模型整首歌
- `media_install_singing` —— 安装歌声运行时

### 1.3 执行分支已实现（`api-tool-executor.ts:4631/4633/4637`）

三个 case 都在。

### 1.4 ★ 致命堵点：白名单漏登（已用脚本核对）

```
music_generate             IN       ← 唯一能用的
music_compose            MISSING   ← 模型看不见、调不到
media_install_singing    MISSING   ← 模型看不见、调不到
```

`SUPPORTED_API_TOOLS`（163 项）是全链路唯一放行闸门：
`mcp/index.ts listAllTools()` → 模型侧 `buildToolsForBackend`
→ 漏登 = 工具在宇宙里不存在。

这与代码里已记录的同类缺陷（`media_compose` 那次）是同一个坑，**注释警示过，音乐三个又踩了一次**。

### 1.5 模式挂载错位

`builtin-task-mode-agents.ts:398` 把音乐工具挂在**剪辑师**身上，
办公/开发模式默认看不见 → 用户在普通聊天里提「写歌」接不住。

### 1.6 ★ ACE-Step 已部署但代码零引用

```
%APPDATA%/yan-zhi/server-data/singing/
├── acestep/        8.9 GB  ← turbo + lm + vae + qwen，完整可用
├── acestep-venv/           ← 独立虚拟环境
├── acestep/tu2           ← 疑似未完成的目录
├── model/fs2.onnx        ← DiffSinger 模型
├── code/ pylibs/         ← DiffSinger 推理代码与依赖
└── bridge.py             ← Node↔Python 桥（DiffSinger 用）
```

`grep -rn "acestep" apps/server/src packages/core/src` → **零命中**。
即：这 8.9GB 是裸跑的验证成果，没接进应用。**这是本方案的主要增量工作量。**

---

## 二、方案总览

分三段，可独立交付、逐段验证：

```
第一段（接线）  白名单补齐 + 模式挂载 → 现有能力立刻可用      风险低，改动小
第二段（接歌）  ACE-Step 接入 → 写词出歌（你要的核心）        风险中
第三段（入口）  下载按钮 / 状态提示 / 产物归档                风险低
```

---

## 三、第一段：接线（先让已有的东西能用）

### 3.1 白名单补齐（实测漏了 16 个，不是 3 个）

**文件**：`apps/server/src/mcp/api-tool-executor.ts`

脚本核对结果：注册表 179 个，白名单 163 个，**差 16 个，全补**：

```ts
// ── 音乐（3 个里漏 2 个）──
'music_compose', 'media_install_singing',       // music_generate 已在

// ── git 全部 14 个（★ 2026-10-22 用户拍板：危险操作也要开）──
//   只读 5 个
'api_git_fetch', 'api_git_blame', 'api_git_remote_branches',
'api_git_tag_list', 'api_git_stash_list',
//   写操作 5 个
'api_git_stash_save', 'api_git_stash_pop', 'api_git_tag_create',
'api_git_tag_delete', 'api_git_revert',
//   历史改写 4 个
'api_git_reset', 'api_git_cherry_pick', 'api_git_rebase', 'api_git_merge',
```

**为什么全开（用户理由，成立）**：
不开 `pull`/`merge`/`reset`，模型没法真正参与「拉代码、并代码、修代码」的完整闭环 ——
只能读不能写，等于半个工具。这是**功能完整性**优先于风险规避的取舍。

**但配套必须同时做（否则是裸奔）**：

1. **危险操作走用户确认**：`reset --hard` / `rebase` / `cherry_pick` / `stash_pop`
   在 `tool-permission.ts` 里登记为「需二次确认」，模型调用时弹确认框。
   > 依据：本项目 `.git` 极脆弱，历史上 `reset --hard` 曾导致 refs 全丢。
   > 用户确认不是限制能力，是防误操作。

2. **禁止高危组合**：`reset --hard` 必须带目标 commit（不允许裸 reset），
   `rebase` 不允许 `-i`（交互式会挂住进程）。

3. **审计留痕**：所有 git 写操作记入任务日志（沿用现有 tool 调用记录即可）。

> 以上三条写进实施，不是可选项。

**为什么必须补 `media_install_singing`**：
`music_compose` 依赖歌声运行时；用户没装时模型必须有办法主动发起安装，
否则只能回落到「机器人音色」且无从修复。

### 3.2 模式挂载（方案 A，已确认）

**文件**：`apps/server/src/builtin-task-mode-agents.ts`

| 模式 | 现状 | 改为 |
|---|---|---|
| 剪辑师 | 有 `music_compose`/`media_install_singing` | 补 `music_generate` |
| 办公 | 无 | 加三个音乐工具 |
| 开发 | 无 | 加三个音乐工具 |
| 运维 / 安全 / 工作流 | 无 | **不挂**，靠 3.3 发现体系兜底 |

**依据（3.3.8 已验证）**：`executeApiTool` 全局分发**不检查模式挂载**，
未挂载的模式也能「发现 → 查详情 → 直接调用」，只是多一次发现调用。

git 工具**不额外挂载** —— 它们已在开发模式的 `COMMON_FILE_TOOLS` 邻近位置，
补进白名单即可被开发模式看见；其余模式需要时靠发现体系取用。

### 3.3 ★ 工具发现体系（本轮重点，按你四点要求重写）

#### 3.3.0 真实数据基线（脚本实测，非估算）

| 指标 | 数值 |
|---|---|
| `SUPPORTED_API_TOOLS` 白名单 | **163** |
| `api-tools/*.ts` 注册表工具 | **179** |
| 注册表有、白名单没有 | **16 个**（14 个 `api_git_*` + `media_install_singing` + `music_compose`） |
| 内置工具（core registry） | **58**（`api_builtin_tool_list` 只报 **8** 个） |
| 模块分类 | 24 个 |
| **超过 20 的模块** | **仅 `git` 一个**（注册 26，白名单 12） |

> 结论修正：**「每个分类最多 20」这条约束，现状只有 git 需要处理**，
> 其余模块最大是 media 19、knowledge 17。
> 但白名单补上 14 个 git 工具后 git 会变成 26 → **必须拆分**。

#### 3.3.1 四点要求 → 落地方案

| # | 你的要求 | 落地 |
|---|---|---|
| 1 | 查分类下工具改成**所有** | `get_api_tools({module:'all'})` 三件套：分类概览 / 全量分页 / 单模块分页 |
| 2 | **每个工具都要有分类** | 建 `TOOL_TAXONOMY` 单一真相源，179 个 api 工具 + 58 个内置工具**全部归类**，漏一个测试报红 |
| 3 | **查工具详情补上** | 新增 `api_tool_detail`，返回完整 inputSchema + 示例 |
| 4 | **内置工具完善 + 分类 + 分页** | `api_builtin_tool_list` 改反射真实注册表 58 个，按类归并，分页 |
| 5 | 每个分类 ≤20 | `git` 拆成 3 个子类；其余不动 |

---

#### 3.3.2 分类体系（TOOL_TAXONOMY 单一真相源）

**新文件**：`packages/shared/src/utils/tool-taxonomy.ts`

```ts
export type ToolCategory =
  // ── 文件与代码 ──
  | 'file' | 'code' | 'python-runtime'
  // ── 媒体 ──
  | 'media-image' | 'media-video' | 'media-audio' | 'media-compose' | 'media-install'
  // ── 版本控制（git 拆三个子类，解决 >20）──
  | 'git-read' | 'git-write' | 'git-advanced'
  // ── 数据与知识 ──
  | 'data' | 'knowledge' | 'memory' | 'experience'
  // ── 平台管理 ──
  | 'agent' | 'skill' | 'platform' | 'mcp' | 'plugin' | 'task-type' | 'space'
  | 'marketplace' | 'tool-mgmt' | 'scheduled-task' | 'ollama'
  // ── 通信 ──
  | 'message' | 'conversation' | 'peer' | 'im' | 'verification'
  // ── 系统与网络 ──
  | 'system' | 'network' | 'browser'
  // ── 编排与交互 ──
  | 'orchestrate' | 'interaction' | 'task' | 'content-gen' | 'tool-discovery';

export interface ToolMeta {
  name: string;
  category: ToolCategory;
  source: 'api' | 'builtin' | 'custom' | 'mcp';
  /** 一句话用途（摘要，不是完整 description） */
  summary: string;
  /** 是否通过白名单（false = 查得到但调不动，必须显式告知模型） */
  executable: boolean;
}
```

**归类原则**：按**使用者意图**分，不按代码文件分。
例：`api_tts_speak` 归 `media-audio`（不是 `platform`）；
`media_install_ffmpeg` 归 `media-install`（不是 `media-video`）。

**强制约束**：`TOOL_TAXONOMY` 必须覆盖全部工具，
建测试 `tool-taxonomy-complete.test.ts`：
- 每个 `SUPPORTED_API_TOOLS` 成员都有 category
- 每个内置工具都有 category
- 每个分类成员数 ≤ 20（**这条就是你要求的硬上限**）

---

#### 3.3.3 改进一：`get_api_tools` 支持「所有」+ 分页

**现状问题**：只能按模块查，一次最多返回一个模块全量（git 26 个），
且**不带分页、不过滤白名单**。

**新形态**（保持向后兼容，`module` 参数语义扩展）：

```jsonc
{
  "name": "get_api_tools",
  "description": "查询工具清单（按分类浏览/全量分页/单类分页）。★ 这是发现工具的总入口：手头没有合适工具时先查这里。",
  "properties": {
    "module": {
      "type": "string",
      "description": "'list'（默认）=24 个模块概览；'all'=按分类返回全部工具（分页）；其它=该模块工具（分页）"
    },
    "page":     { "type": "integer", "description": "页码，默认 1" },
    "pageSize": { "type": "integer", "description": "每页条数，默认 20，上限 20" },
    "keyword":  { "type": "string",  "description": "可选，按名称/描述过滤（等价轻量搜索）" }
  }
}
```

**返回结构**：

```jsonc
// module='list'
{
  "categories": [
    { "category": "file", "count": 6, "executable": 6 },
    { "category": "git-read", "count": 8, "executable": 8 },
    ...
  ],
  "total": 221,
  "hint": "用 get_api_tools({module:'<category>'}) 查看具体工具"
}

// module='all' 或 module='<category>'
{
  "category": "git-read",
  "page": 1,
  "pageSize": 20,
  "total": 8,
  "totalPages": 1,
  "tools": [
    { "name": "api_git_status", "summary": "查看工作区状态", "source": "api", "executable": true }
  ]
}
```

**关键修复：必须过滤白名单标记**
新增 `executable` 字段，`false` 时返回里附带提示：
> ⚠️ 该工具未通过白名单，调用会失败。请改用 `executable: true` 的同类工具。

这解决了「查得到但调不动」这个最坏的失败模式。

---

#### 3.3.4 改进二：新增 `api_tool_detail`（你点名要的）

```jsonc
{
  "name": "api_tool_detail",
  "description": "查询单个工具的完整定义：完整 description、inputSchema（参数名/类型/是否必填/枚举值）、示例调用、所属分类、是否可执行、在哪些模式挂载。★ 从 get_api_tools 看到工具名但不确定怎么传参时，必须先用它。",
  "properties": {
    "name": { "type": "string", "description": "工具名，如 music_compose" }
  },
  "required": ["name"]
}
```

**返回**：

```jsonc
{
  "name": "music_compose",
  "found": true,
  "source": "api",
  "category": "media-compose",
  "executable": true,
  "description": "（完整原文，不截断）",
  "inputSchema": { "type": "object", "properties": { ... }, "required": [...] },
  "example": {
    "style": "calm piano",
    "bpm": 72,
    "bars": 16,
    "chords": ["Am", "F", "C", "G"]
  },
  "mountedIn": ["clip"],
  "requiresUserConfirm": false,
  "notes": ["完全本地、免版权", "不能生成人声演唱"]
}
```

**`example` 从哪来**：给每个工具补 `examples` 字段（可选）。
没有手写示例的，用 **schema 默认值 + 类型占位** 自动生成，
保证模型至少知道字段形状 —— 这比只给 schema 有效得多。

---

#### 3.3.5 改进三：`api_builtin_tool_list` 彻底重做

**现状**：`api-tool-executor.ts:4667` 硬编码 **8 条**，实际有 **58 个**。
模型问「有哪些文件工具」，只看到 `file_read`/`file_write`，
看不到 `file_edit`/`file_grep`/`file_list`/`file_to_markdown`/`file_transcode`。

**改法**：反射真实注册表

```ts
function getBuiltinToolDefinitions(category?: string, page = 1, pageSize = 20) {
  const all = getToolRegistry().list().map((t) => ({
    name: t.name,
    summary: t.description.slice(0, 60),
    category: TOOL_TAXONOMY[t.name] ?? 'system',
  }));
  const filtered = category ? all.filter((t) => t.category === category) : all;
  return { ...paginate(filtered, page, pageSize), total: filtered.length };
}
```

**并且和 `get_api_tools` 合并口径**：`get_api_tools({module:'all'})`
直接把内置工具也纳入分类返回（带 `source: 'builtin'`），
不再需要模型自己去猜「内置还是 api」。

> 这也是你要求的「查分类下工具改成所有」的真正含义：
> **一个入口看到全部 221 个工具（163 api + 58 内置），分类清晰，分页可控。**

---

#### 3.3.6 改进四：git 拆分（唯一超 20 的模块）

```ts
// git 26 个拆三类，每类 ≤20
'git-read':     ['api_git_status','api_git_diff','api_git_log','api_git_branches',
                 'api_git_show','api_git_read_file','api_git_remote_branches',
                 'api_git_blame']                                      // 8
'git-write':    ['api_git_add','api_git_commit','api_git_push','api_git_pull',
                 'api_git_checkout','api_git_restore','api_git_fetch',
                 'api_git_merge','api_git_tag_create','api_git_tag_delete']  // 10
'git-advanced': ['api_git_stash_save','api_git_stash_list','api_git_stash_pop',
                 'api_git_tag_list','api_git_revert','api_git_reset',
                 'api_git_cherry_pick','api_git_rebase']               // 8
```

**同时解决白名单漏登**：14 个 `api_git_*` 现在不在白名单，
补进白名单后它们才真正可用。**但这批工具涉及写操作**（push/reset/rebase/cherry-pick），
必须先确认 `tool-permission.ts` 里对危险 git 操作有用户确认拦截，
否则相当于给模型开放 `git reset --hard`。

> ⚠️ **这一条我建议分两步**：先补只读的 8 个（`git-read`），
> 写操作与危险操作（reset/rebase/cherry-pick）单独评估后再开。

---

#### 3.3.7 新增：`api_tool_search`（跨源关键词搜索）

```jsonc
{
  "name": "api_tool_search",
  "description": "按关键词搜索全部工具（api/内置/自定义/MCP）。不确定该用哪个工具时先搜一次，再用 api_tool_detail 查参数。",
  "properties": {
    "query":  { "type": "string", "description": "关键词，如「音乐」「图片」「下载」「git」" },
    "source": { "type": "string", "enum": ["api","builtin","custom","mcp"], "description": "可选" },
    "page":   { "type": "integer" },
    "pageSize": { "type": "integer", "description": "默认 20，上限 20" }
  },
  "required": ["query"]
}
```

匹配 `name` + `summary` + `category`，按相关度排序（名称精确 > 名称包含 > 描述包含）。

---

#### 3.3.8 为什么「不挂载也能调用」成立（机制依据）

`executeApiTool` 是**全局分发**，只检查 `SUPPORTED_API_TOOLS`，**不检查模式挂载清单**。

```
发现层（get_api_tools / search / detail）  ← 全局可见，不看挂载
        ↓
执行层（executeApiTool）                  ← 只看白名单，不看挂载
```

**所以**：只要白名单补对，任何模式都能「查询 → 拿 schema → 直接调用」。
挂载的唯一作用是**省一次发现调用**，让模型第一眼就看到常用工具。

这就是「低频模式不挂载、靠发现体系兜底」的依据。

---

#### 3.3.9 守门测试（四条，专治历史坑）

新建 `apps/server/test/tool-discovery-wiring.test.ts`：

| # | 断言 | 治什么 |
|---|---|---|
| 1 | `api-tools/*.ts` 每个 `name:` 都在 `SUPPORTED_API_TOOLS` | 白名单漏登（这次 16 个） |
| 2 | 每个白名单工具都有 `TOOL_TAXONOMY` 分类 | 你要求的「每个工具都要有分类」 |
| 3 | 任何分类成员数 ≤ 20 | 你要求的硬上限 |
| 4 | `get_api_tools` 返回的每个工具 `executable === true` | 「查得到调不动」 |
| 5 | `api_builtin_tool_list` 返回数 == `getToolRegistry().list().length` | 硬编码 8 条 |

> 第 2、3 条是**你这次点出来的约束**，现有测试完全没覆盖。

---

#### 3.3.10 涉及文件清单

| 文件 | 动作 |
|---|---|
| `packages/shared/src/utils/tool-taxonomy.ts` | **新增** —— 分类单一真相源 + 221 工具归类表 |
| `packages/core/src/tool/builtin/get-api-tools.ts` | **重写** —— 分类/全量/分页/executable |
| `packages/core/src/tool/builtin/api-tools/discovery.ts` | **新增** —— `api_tool_detail` / `api_tool_search` |
| `packages/core/src/tool/builtin/api-tools/index.ts` | 注册新模块 |
| `apps/server/src/mcp/api-tool-executor.ts` | `api_builtin_tool_list` 反射重写 + 白名单补 16 项 + 两个新 case |
| `apps/server/test/tool-discovery-wiring.test.ts` | **新增** —— 5 条断言 |

---

## 三A、并行开发冲突规避（★ Claude Code 正在改店铺运营）

> 2026-10-22 用户提醒：Claude Code 同时在改「店铺运营模式重构」。
> 指令明确：**不要冲突**。本章是硬约束，实施前必读。

### 3A.0 冲突面实测（`git status` + 重构方案文件清单交叉核对）

Claude Code 当前改动中（`git status`）：

```
 M apps/server/src/db.ts                       ← ★ 冲突高危
 M packages/core/src/db/schema.ts              ← ★ 冲突高危
 M apps/desktop/main.cjs                        （与我无关）
 M apps/desktop/test/page-fill-idempotence.test.cjs （无关）
 M packages/ui/src/components/BrowserPanel.vue      （无关）
 M packages/ui/src/stores/chat.ts                    （无关）
?? apps/server/src/shop/                        ← 店铺新目录（我不碰）
```

对照《店铺运营模式重构方案》§11 文件清单，**重叠只有两个**：

| 重叠文件 | 店铺方案要做什么 | 音乐方案要做什么 |
|---|---|---|
| `packages/core/src/db/schema.ts` | 新增 4 张店铺业务表 | 改 `api_builtin_tool_list`… **不需要动这个文件** |
| `apps/server/src/db.ts` | 新增 4 张表 + 技能提示词 | 补白名单定位在 `api-tool-executor.ts`… **也不需要** |

**结论：本方案与店铺重构几乎零重叠。**
唯一要小心的是 `api-tool-executor.ts` 里那些 `case 'api_git_*'` 分支附近，
如果店铺方案新增了 `case`，我改白名单时容易撞行 —— 但**白名单是独立代码块**，
冲突概率极低，且 git 能自动合并。

### 3A.1 三条硬规则

**规则 1：绝不改动以下文件（Claude Code 领地）**

```
apps/server/src/db.ts                       ← 即使要加 case 也先问
packages/core/src/db/schema.ts              ← 一个字符都不碰
apps/server/src/shop/**                     ← 整个目录不碰
apps/server/src/plugins/shop-ops.ts         ← 不碰
apps/server/src/builtin-shop-agents.ts      ← 不碰
packages/ui/src/views/plugin/**             ← 不碰
packages/ui/src/stores/mode.ts              ← 不碰
packages/ui/src/components/BrowserPanel.vue ← 不碰
packages/ui/src/stores/chat.ts              ← 不碰
apps/desktop/main.cjs                       ← 不碰
```

**规则 2：本方案只动这些文件（封闭清单）**

```
新增
  packages/shared/src/utils/tool-taxonomy.ts
  packages/core/src/tool/builtin/api-tools/discovery.ts
  apps/server/test/tool-discovery-wiring.test.ts
  apps/server/src/services/music-acestep.ts              （第二段）
  apps/server/src/services/music-acestep-install.ts      （第二段）
  apps/server/vendor/acestep-bridge/**                   （第二段）

修改
  apps/server/src/mcp/api-tool-executor.ts    ← 只改三处：白名单 / 2 个 case / 内置列表函数体
  apps/server/src/builtin-task-mode-agents.ts ← 只改办公/开发/剪辑师三处工具数组
  packages/core/src/tool/builtin/get-api-tools.ts          （整文件重写，无人改）
  packages/core/src/tool/builtin/api-tools/index.ts        （加一行注册）
  packages/core/src/tool/builtin/api-tools/media.ts        ← 只加 music_sing 一条，追加到数组末尾
  packages/core/src/tool/builtin/index.ts                  ← 只加一行 registry.register
```

**规则 3：`api-tool-executor.ts` 的改动方式（防撞行）**

这个文件 6000+ 行，是双方唯一真正重叠的地方。**禁止整段重写，只做定点插入**：

| 位置 | 改法 | 为什么安全 |
|---|---|---|
| `SUPPORTED_API_TOOLS` 数组内 | 在 `'music_generate',` 后面**追加三行**，在 git 段末尾追加 | 独立代码块，不与 `case` 混排 |
| `switch` 内 | 在现有 `case 'music_generate':` 后面**紧跟插入**两个新 case | 紧邻同类，不跨区域 |
| `getBuiltinToolDefinitions()` | **只替换函数体**（`return [ 8 条 ]` → 反射实现），函数名与调用点不动 | 函数独立，签名不变 |
| 别处 | **一律不动** | — |

> 实操上用 `Edit` 精确替换，不用整文件 `Write`。

### 3A.2 实施前必做的同步检查

```bash
# 1) 拉取 Claude Code 的最新改动（避免基于旧代码改）
git fetch origin && git log --oneline -3

# 2) 确认这五个文件当前无未提交改动，我改之前先看
git status --short apps/server/src/mcp/api-tool-executor.ts \
                   apps/server/src/builtin-task-mode-agents.ts \
                   packages/core/src/tool/builtin/get-api-tools.ts \
                   packages/core/src/tool/builtin/api-tools/index.ts \
                   packages/ui/src/stores/mode.ts

# 3) 改完后确认只碰了白名单内的文件
git status --short | grep -vE '^(M |\?\?) (packages/shared/src/utils/tool-taxonomy|packages/core/src/tool/builtin|apps/server/src/mcp/api-tool-executor|apps/server/src/builtin-task-mode-agents|apps/server/src/services/music-|apps/server/test/tool-discovery)'
```

**第 3 条是关键自检**：输出为空 = 没越界。

### 3A.3 如果 `api-tool-executor.ts` 真的冲突了

**不自己解决，停下来问。** 理由：
- 这文件是双方共同修改点，自动合并结果不可信
- 店铺方案在里面加了商品/订单/发货的 case，我加 git/music 的 case，
  一旦行号错位可能静默覆盖对方的 `case`（**不报错，但对方功能没了**）

处理顺序：`git diff` 看清双方改动 → 只保留我的三处定点插入 → 其余全部用对方版本 →
`git add` 后让用户 review 再提交。

---

## 三B、安装体系：双通道（用户点击 / 模型下载）


> 我上一版错把它做成「二选一」，实际是**两条路并存**：
>
> **通道 A：用户在 UI 点击下载** —— 设置页按钮，用户自己决定
> **通道 B：模型调用工具下载** —— 但必须弹确认，用户批准才执行
>
> 两者**共用同一套底层**：同一个 service、同一个安装函数、同一个进度状态、
> 同一个落盘目录。区别只在「谁触发」。

```
                   ┌──────────────────────┐
   通道 A ────────▶│  shared install()     │◀──────── 通道 B
   UI 按钮点击      │  (services/*.ts)      │      模型调 *_install 工具
                   └──────────┬───────────┘
                              │
                    ┌─────────▼─────────┐
                    │  统一下载器        │
                    │  download-sources │
                    │  国内优先·断点续传  │
                    └───────────────────┘
```

**关键：不新增第二套安装逻辑。** 通道 B 只是给已有 service 加一层工具外壳 + 确认卡。

### 3B.1 现成范本：语音包（`VoicePackPanel` 这套已经很成熟）

**实测代码**（`packages/ui/src/components/VoicePackPanel.vue` 389 行 + `services/tts-packs.ts`）：

| 环节 | 现有实现 | 位置 |
|---|---|---|
| 清单 | `listTtsPacks()` → 名称/体积/是否已装/磁盘占用 | `services/tts-packs.ts:205` |
| UI 下载按钮 | 每项一个「下载安装」按钮 + 进度条 + 错误态 | `VoicePackPanel.vue:81` |
| 提交下载 | `POST /api/tts-packs/:id/install` | `routes/tts-packs.ts:39` |
| 进度轮询 | `GET /api/tts-packs/:id/progress` → `{state, progress, message}` | `routes/tts-packs.ts:34` |
| 试听 | `POST /api/tts-packs/:id/preview` | `routes/tts-packs.ts:47` |
| 卸载 | `DELETE /api/tts-packs/:id` + **二次确认弹窗** | `VoicePackPanel.vue:264` |
| 手动兜底 | 下载失败时提示「手动解压到 → 某目录」并可复制路径 | `VoicePackPanel.vue:58, 211` |
| 下载源 | `mirrorUrls()` 多镜像；复用 `services/media-fetch` 统一入口（直连优先 → 本机代理隧道） | `services/tts-packs.ts:143` |

**已具备你要求的全部要素**，唯一缺的是：**没有对应的工具**，
所以模型没法自己装 —— 只能在 UI 里用户手动点。

### 3B.2 改造：把语音包的范式提炼成「通用安装器契约」

**新文件**：`apps/server/src/services/installer-registry.ts`

```ts
/** 任何可安装资源都实现这个契约，通道 A（UI）与通道 B（工具）共用 */
export interface Installer {
  id: string;                        // 'ffmpeg' | 'ytdlp' | 'whisper' | 'diffsinger' | 'acestep' | 'tts-pack' | 'ollama'
  title: string;                     // 「安装 ffmpeg」
  /** 体积预估（字节）；变体的按参数算，如 whisper 的 base/small/medium */
  bytes: (args: Record<string, unknown>) => number;
  /** 下载源（国内优先），给确认卡展示 */
  sources: () => DownloadSource[];
  /** 落盘目录（给确认卡展示） */
  targetDir: () => string;
  /** 预计耗时文案 */
  eta: () => string;
  /** 是否已安装（幂等判定；已装则不弹确认） */
  isInstalled: () => Promise<boolean>;
  /** 真正执行（通道 A/B 共用） */
  install: (args: Record<string, unknown>, onProgress: (m: string, p: number) => void)
    => Promise<{ ok: boolean; error?: string; notes?: string[] }>;
  /** 进度查询（供 UI 轮询 + 工具返回） */
  progress?: () => { state: 'idle'|'downloading'|'done'|'error'; progress: number; message: string } | null;
  /** 手动兜底指引（下载失败时给用户） */
  manualHint: () => { dir: string; text: string };
}

export const INSTALLERS: Record<string, Installer> = {
  ffmpeg:      ffmpegInstaller,
  ytdlp:       ytdlpInstaller,
  whisper:     whisperInstaller,
  diffsinger:  diffsingerInstaller,     // 现有 media_install_singing
  acestep:     acestepInstaller,        // 第二段新增
  'tts-pack':  ttsPackInstaller,        // ★ 语音包接进来（当前缺口）
  ollama:      ollamaInstaller,         // api_ollama_pull 接进来
};
```

**收益**：以后新增任何「要下载的东西」，只写一个 Installer 对象，
**自动同时获得通道 A 和通道 B**，不用两边各写一遍。

### 3B.3 通道 B：统一的 `install_resource` 工具

与其给每个资源各建一个工具（`media_install_ffmpeg` / `whisper_install` /
`music_sing_install` / …），不如**收敛成一个**，避免工具面膨胀：

```jsonc
{
  "name": "install_resource",
  "description": "下载并安装本地资源（ffmpeg / yt-dlp / whisper.cpp / DiffSinger 歌声引擎 / ACE-Step 写歌引擎 / 语音包 / Ollama 模型）。★ 调用后会弹出确认卡（体积/来源/落地目录/预计耗时），用户批准才开始下载。已安装时幂等返回状态。",
  "properties": {
    "resource": { "type": "string",
                  "description": "资源 id。先调 action='list' 看有哪些" },
    "action":   { "type": "string", "enum": ["list", "status", "install"], "description": "默认 status" },
    "variant":  { "type": "string", "description": "可选变体，如 whisper 的 base/small/medium、ollama 的模型名" }
  },
  "required": []
}
```

**`action='list'` 返回**（模型据此决定装什么）：

```jsonc
{
  "resources": [
    { "id": "ffmpeg",  "title": "ffmpeg",           "mb": 80,   "installed": true  },
    { "id": "acestep", "title": "AI 写歌运行时",     "mb": 8900, "installed": true  },
    { "id": "tts-pack", "title": "本地语音包(174 说话人)", "mb": 31, "installed": false },
    ...
  ]
}
```

> **兼容性**：现有的 `media_install_ffmpeg` / `whisper_install` /
> `media_install_singing` **保留不删**（已有模式引用它们），
> 内部改为 `INSTALLERS[id].install(...)` 转发。
> `install_resource` 是新的统一入口，新代码一律用它。

### 3B.4 通道 A：UI 不动，复用现有面板

**不改** `VoicePackPanel.vue` 的交互（已经很好）。
只做两件事：

1. 把 `installTtsPack()` 包成 `ttsPackInstaller` 对象，注册进 `INSTALLERS`
2. 若某个资源还没有 UI 入口（如 ACE-Step），
   在「设置 → 语音包」旁边加一个同名板块，**复用同一个组件范式**
   （清单 + 体积 + 下载按钮 + 进度条 + 手动兜底），不新造交互

### 3B.5 强制确认：两条通道都要，但形态不同

| | 通道 A（UI） | 通道 B（模型） |
|---|---|---|
| 确认形态 | 按钮本身就是确认（`VoicePackPanel.vue:264` 的卸载已用 `ElMessageBox.confirm`） | **确认卡**（前端授权卡） |
| 何时弹 | 点按钮时 | 工具调用时、**任何权限模式** |
| 内容 | 体积 + 名称 | 体积 + 来源 + 落地目录 + 预计耗时 + 用途 |

**通道 B 的判定位置**（关键，上一版的重点）：

```ts
// 必须在 readonly 分支之外，任何模式都问
const installer = INSTALLERS[resource];
if (installer && action === 'install' && !task.confirmedTools?.has(resource)) {
  if (await installer.isInstalled()) return ok({ alreadyInstalled: true });
  const ok = await requestToolAuthorization(task, toolName, args, {
    title:   installer.title,
    bytes:   installer.bytes(args),
    sources: installer.sources(),
    target:  installer.targetDir(),
    eta:     installer.eta(),
  });
  if (!ok) return '用户已取消下载，请勿重试，改为告知用户可自行在设置中安装';
  task.confirmedTools.add(resource);
}
```

### 3B.6 缺口语音包（当前实测缺口）

`tts-packs` 只有 REST 路由（`/api/tts-packs/:id/install`），**没有工具**。
后果：`api_tts_voices` 报「未安装语音包，可在 设置 → 语音包 中下载」时，
**模型只能让用户自己去点**，这正是你要消灭的场景。

接入后：模型看到这句话 → 调 `install_resource({resource:'tts-pack'})`
→ 弹确认 → 批准 → 自动装好 → 重新列出音色。

---


### 3B.7 守门测试（`apps/server/test/install-dual-channel.test.ts`）

| # | 断言 | 治什么 |
|---|---|---|
| 1 | 每个 `INSTALLERS` 成员都实现 `isInstalled/install/sources/targetDir/eta` | 契约完整性 |
| 2 | `INSTALLERS` 的 id 集合 ⊆ `install_resource` resources 返回集合 | 工具能触达全部资源 |
| 3 | **`default` 与 `all` 模式下，`install_resource` 同样触发确认** | ★ 上一版的核心缺陷 |
| 4 | 已安装时**不弹确认**，直接返回 `alreadyInstalled` | 防止每次都骚扰 |
| 5 | 用户拒绝后文案含「请勿重试」 | 防模型循环 |
| 6 | 每个 installer 的 `sources()` 首个为 `region: 'cn'` | 国内优先 |
| 7 | 通道 A 与通道 B 调的是**同一个** `install` 函数（mock 一次，两条路都能触发） | 防两套实现漂移 |
| 8 | `tts-pack` 在 `INSTALLERS` 里，且 `install_resource({resource:'tts-pack'})` 可调用 | 语音包缺口已补 |

> 第 7 条最关键：它保证以后不会有人「顺手」给工具单写一条下载路径，
> 导致 UI 和模型下出来的东西不一致。

---

## 四、第二段：ACE-Step 接入（写词出歌）

### 4.1 为什么要接它

| 方案 | 人声质量 | 成本 | 结论 |
|---|---|---|---|
| 共振峰（music-vocal） | 机器人音 | 零 | 兜底 |
| DiffSinger | 好，但**要曲谱** | 256MB | 不适合「只给词」 |
| TTS 唱法 | 一般 | 零 | 过渡 |
| 外部 API（music_generate） | 好 | **要 key、要钱** | 有网依赖 |
| **ACE-Step 本地** | 好 | 8.9GB（**已下好在盘上**） | ★ 目标 |

实测数据（本机 RTX 3050 6GB）：40 秒中文歌 48 秒出，
60 秒歌约 84 秒。质量：能听清咬字，人声偏靠后（已用提示词+EQ 改善）。

### 4.2 架构（★ 复用已部署，绝不复制）

**复用原则**：`%APPDATA%/yan-zhi/server-data/singing/acestep` 那 8.9GB **原地复用**，
不复制、不移动、不重新下载。桥脚本通过**环境变量指向它**。

```
Node 服务层                          Python 侧
music-acestep.ts  ──spawn──▶  acestep-bridge.py
  ├─ 状态探测（目录+权重完整性）      ├─ 常驻进程，stdin/stdout JSON 行协议
  ├─ 任务提交                        ├─ 从 SINGING_ROOT/acestep 加载
  ├─ 进度轮询                        └─ 返回 flac 路径
  └─ 产物落盘

环境变量（bridge 内固化，不依赖上游默认）：
  HF_ENDPOINT=https://hf-mirror.com          # 兜底，模型已在盘上时不会触发
  YZ_FORCE_VAE_GPU=1                          # ★ 见 4.5-1
  ACESTEP_VAE_DECODE_CHUNK_SIZE=256           # ★ 见 4.5-1
  PYTHONUNBUFFERED=1
  CHECKPOINTS_DIR=<SINGING_ROOT>/acestep
```

**复用的四份权重**（实测已完整）：

| 目录 | 体积 | 作用 |
|---|---|---|
| `turbo/` | 4.5 GB | DiT 主干（出音频） |
| `lm/` | 2.9 GB | 5Hz LM（理解提示词/规划） |
| `qwen/` | 1.2 GB | 文本编码器 |
| `vae/` | 322 MB | latent → 波形 |

`tu2/` 为空目录，可删。

**关键决策：常驻进程，不是每次 spawn。**
模型加载约 40 秒，一次性 spawn 会让「每首歌多等 40 秒」；
常驻后第二首起就是纯推理时间。

---

### 4.3 落地清单

| 新增/修改 | 说明 |
|---|---|
| `apps/server/vendor/acestep-bridge/` | 桥脚本 + 极简推理入口（复用已装 acestep 包，不复制 8.9GB） |
| `apps/server/src/services/music-acestep.ts` | 状态探测、进程管理、生成调用、超时与回收 |
| `apps/server/src/services/music-acestep-install.ts` | 安装/修复（复用 `music-sing-install.ts` 的多镜像+断点续传模式） |
| `api-tools/media.ts` | 新增 `music_sing` 工具 schema |
| `api-tool-executor.ts` | 加 case + 白名单 |
| 模式清单 | 挂到「音乐」相关模式 |

### 4.4 工具 schema 草案

```jsonc
{
  "name": "music_sing",
  "description": "本地 AI 写歌：给歌词（可带 [verse]/[chorus] 分段）与风格描述，直接生成带人声演唱的完整歌曲，不需要曲谱。全部本地推理，不上传歌词。默认 60 秒，最长 240 秒。",
  "properties": {
    "lyrics":  "歌词全文，用 [verse]/[chorus] 标注段落（影响结构与副歌对比度）",
    "style":   "风格描述，如「中文流行 温暖女声 吉他钢琴」；越具体越稳",
    "duration": "时长秒数，默认 60，范围 10-240",
    "vocal_forward": "人声靠前（默认 true）：压低配器密度，避免人声被盖住",
    "seed":    "固定种子可复现"
  },
  "required": ["lyrics", "style"]
}
```

### 4.5 必须固化的两个坑

详见 **6.5**（VAE 显存塌陷 / audio_format 默认 mp3），
要点：bridge 必须自带 `YZ_FORCE_VAE_GPU=1` + `ACESTEP_VAE_DECODE_CHUNK_SIZE=256`，
请求必须显式 `audio_format=flac`。

### 4.6 ffmpeg 处置

现有 `media_install_ffmpeg` 已有按需下载。
本方案**不新增下载逻辑**，只在 `music_sing` 前置检查：
- 有 ffmpeg → 出 mp3
- 无 ffmpeg → 出 flac（并提示可装 ffmpeg 转 mp3）

---

## 五、第三段：下载与产物落地（与三B配套）

> ★ 本章原为「大文件一律用户手动点击下载」，
> **2026-10-22 你改了口径**：改为「模型可自己下载，但必须弹确认」。
> 详细机制见 **第三章B**。本章只讲落地细节，不重复原则。

### 5.1 口径变更记录

| | 旧口径 | 新口径（当前） |
|---|---|---|
| 触发方 | 用户点链接 | **模型调 `*_install` 工具** |
| 确认 | 用户主动点 = 隐式确认 | **强制确认卡**（体积/来源/落地/耗时） |
| 适用范围 | 只 ACE-Step | **全部安装类工具**（见 3B.3 盘点表） |

### 5.2 各产物落地位置

| 产物 | 体积 | 落地目录 | 安装工具 |
|---|---|---|---|
| DiffSinger 运行时 | ~400 MB | `singing/code` `pylibs` `model` | `media_install_singing` |
| ACE-Step 运行时 | 8.9 GB | `singing/acestep` + `acestep-venv` | `music_sing_install` |
| ffmpeg | ~80 MB | 应用数据目录 | `media_install_ffmpeg` |
| yt-dlp | ~30 MB | 同上 | `media_install_ytdlp` |
| whisper.cpp + 模型 | 8MB~1.5GB | `singing/whisper`（同类） | `whisper_install` |
| Ollama 模型 | 1~40 GB | Ollama 自管 | `api_ollama_pull` ←**最该加确认** |

### 5.3 下载源统一（已并入 3B.1）

曾计划在 `music-sing-install.ts` 里各写一套，
**现改为 `packages/shared/src/utils/download-sources.ts` 单一真相源**，
四类下载（模型/GitHub Release/PyPI/工具二进制）共用，按「国内优先」排序。

**复用已验证实现**：`downloadWithResume()`
（断点续传 + 镜像返回 HTML 错误页的体量校验 `MODEL_MIN_BYTES` +
服务器不支持 Range 时截断重下）从 `music-sing-install.ts` 提升到共享层。

### 5.4 交互细节（确认通过之后）

- 下载中：进度条 + 已下载/总量 + 当前源 + 可取消
- 中断：保留断点，下次自动续传（不重复下载已下部分）
- 换源：当前源多次失败后**自动切下一个源**，卡片上显示切换记录
- 失败：给出「换源重试 / 手动下载放哪个目录」两条指引，不静默

### 5.5 已安装时的行为

幂等。`*_install` 检测到已就绪则**不弹确认**，直接返回状态摘要。
（否则每次调用都弹一次确认，用户会烦）

---

## 六、实验配置存档（实测，供实施对齐）

以下是**本机实测跑通**的完整配置，供后续接入直接对齐，避免重复踩坑。

### 6.1 硬件基线

```
GPU   NVIDIA GeForce RTX 3050  6144 MiB  sm_86
CPU   16 逻辑核
Python 3.12.7（C:\APP\Python\Python312）
uv     0.9.10（C:\APP\uv\uv.exe）
```

### 6.2 实测性能

| 时长 | 步数 | 总耗时 | 其中 DiT | VAE 解码 |
|---|---|---|---|---|
| 15 s | 8 | ~40 s | 2.5 s | 16 s |
| 40 s | 8 | 48 s | — | — |
| 60 s | 8 | 84 s | 22.6 s | ~2 min |
| 60 s | 12 | 48 s | — | — |

结论：**6GB 卡可用，但 60 秒以上 VAE 解码是瓶颈**（tiled 分块）。

### 6.3 服务参数（实测可用）

```bash
python -m acestep.api_server \
  --port 8002 \
  --download-source huggingface \
  --no-init                     # 懒加载，启动 30s 内可响应
```

### 6.4 生成请求（实测可用）

```jsonc
{
  "prompt": "Solo female vocal forward mandarin pop ballad. close-mic, dry, loud and dominant, above a very sparse accompaniment: only soft acoustic guitar and quiet strings. no heavy bass, no instruments competing with the voice. karaoke-style vocal prominence.",
  "lyrics": "[verse]\n月光落在窗前\n风把旧信吹远\n\n[chorus]\n再见 再见\n来不及说的从前",
  "vocal_language": "zh",
  "thinking": false,          // ★ 6GB 必须关
  "audio_duration": 60,
  "batch_size": 1,            // ★ 6GB 必须 1
  "inference_steps": 10,
  "guidance_scale": 9.0,      // 高一点更守提示词
  "use_random_seed": false,
  "seed": 123456,
  "audio_format": "flac",     // ★★★ 必须显式，默认 mp3 会静默丢文件
  "task_type": "text2music"
}
```

### 6.5 两个必须固化的坑（实测）

**坑 1：VAE 显存塌陷 → CPU 解码跑不完**

```
Before VAE decode: allocated=5.11GB, max=6.19GB
Effective free VRAM: 0.11 GB
→ effective_free < 0.5 → 自动把 VAE 挪到 CPU
→ CPU 上 VAE 卷积 20 分钟以上跑不完（不是死锁，CPU 时间持续增长）
```

**修法**：在 `generate_music_decode.py` 加 `YZ_FORCE_VAE_GPU` 开关绕过判定；
配合 `ACESTEP_VAE_DECODE_CHUNK_SIZE=256`。改完 VAE 解码 16 秒。

> 这意味着**不能直接依赖上游默认行为**，bridge 里必须自带这个补丁
> （或直接用 monkeypatch 从外部注入，避免改上游源码）。

**坑 2：audio_format 默认 mp3 → 静默丢文件**

`release_task_request_builder.py:84` 写死 `"audio_format": "mp3"`，
本机无 ffmpeg → 保存抛异常 → **任务 status 仍返回 1、`file` 字段为空**。
看起来成功，实际零产物。

**修法**：请求显式传 `"audio_format": "flac"`；或接入后调用 `media_install_ffmpeg` 补齐。

### 6.6 提示词效果对照（实测）

| 版本 | 800-4k 占比 | 3k-8k | <200Hz | 主观 |
|---|---|---|---|---|
| 含糊提示词 | 7.9% | 0.1% | — | 人声几乎没出来 |
| 明确 vocal forward | 14.6% | 0.9% | — | 能听出人声 |
| + sparse 配器 + guidance 9 | 17.5% | 1.2% | 22.6% | 人声明显靠前 |
| 再做 EQ 后处理 | 20.0% | 2.2% | 17.7% | 咬字最清晰 |

**结论**：`vocal_forward` 默认必须开，
提示词模板固化到 `services/music-acestep.ts` 里，不让模型自由发挥。

---

## 七、风险与取舍

| 风险 | 等级 | 说明与对策 |
|---|---|---|
| 6GB 显存边界 | **高** | 已实测跑通，但强依赖「强制 VAE 留 GPU」；换 XL/4B 权重必 OOM。对策：显存探测，<8GB 锁死 turbo |
| 常驻进程占卡 | 中 | 空闲 5.4GB 占显存。对策：闲置 10 分钟卸载模型 |
| 首次下载 8.9GB | 中 | 手动触发 + 国内源优先 |
| 中文咬字偏糊 | 中 | 现状可听但不如商业成品。对策：默认 `vocal_forward` |
| 上游更新破坏接口 | 低 | 桥只依赖 HTTP API，不依赖内部模块 |
| 白名单再漏 | 中 | 3.3.7 的三条反向断言专治（其中第 3 条还能防「查得到调不动」复发） |
| 发现面过宽 | 中 | `get_api_tools` 返回全部 163 项，模型可能被淹没。对策：默认只回分类与计数，按模块展开 |

---

## 八、工作量与顺序

```
第一段  接线 + 发现体系 + 安装确认
        · 白名单补 16 项（音乐 2 + git 只读 5，git 危险 8 项先评估）
        · TOOL_TAXONOMY 分类表（221 工具全归类）
        · get_api_tools 重写（分类/全量/分页/executable）
        · api_tool_detail + api_tool_search 新增
        · api_builtin_tool_list 反射重写（8 → 58）
        · installer-registry 通用安装器契约（语音包接入）
        · install_resource 统一工具 + 强制确认（任何模式都问）
        · DOWNLOAD_SOURCES 统一下载源（国内优先）
        · 5 + 5 条守门断言
        ≈ 12 文件（7 新增 5 改动），当天可见效果       ← 先做
第二段  ACE-Step 桥      4 新文件 + 2 处改动                ← 核心
第三段  下载与提示       1 新文件 + UI 小改                  ← 收尾
```

**第一段先做的理由**：它不只让音乐工具可用，
还把「模型发现工具」这条通路修好 —— 第二段的新工具自动受益，
不需要再改一次发现层。**顺序不能反。**

第一段做完，办公模式里立刻能用：
- `music_compose` —— 本地配乐（免费、可控）
- `media_install_singing` —— 装 DiffSinger 运行时（256MB，手动点击）
- `music_generate` —— 外部大模型整首歌（需你自己配 key）
- 另外 50 个此前「查不到」的内置工具也会出现在清单里

第二段做完才是「不花钱、纯本地、写词出歌」。

---

## 九、已执行的清理（本轮）

| 项 | 结果 |
|---|---|
| `tmp/ACE-Step-1.5` | ✅ 已删除，释放 **23.5 GB** |
| `singing/acestep` 8.9GB | **保留并复用**，不复制不移动 |

删除后 `tmp/vocal-demo/` 的三版试听文件仍保留（flac/wav 约 43MB）。

---

## 十、确认状态（已全部拍板）

全部确认完毕，无待决项：

- ✅ git **14 项全补**（含 reset/rebase/cherry_pick/merge）——
  已核实 `WRITE_TOOLS` 已登记这些工具、`checkToolPermission` 返回
  `needsAuthorization`、运行时走 `_tool_authorize` 授权卡。**安全网已存在，不需新做。**
- ✅ 挂载**方案 A**（办公/剪辑师/开发直挂，其余靠发现体系）
- ✅ `singing/acestep/tu2` **已删除**
- ✅ 冲突规避见第三章A

**下一步：等你一声令下就开第一段。**
