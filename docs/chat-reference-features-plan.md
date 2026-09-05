# 对话引用功能方案（URL 引用 / 内容引用 / 输入过长转文件）

> 状态：待评审。本文档只做方案，不动代码。
> 日期：2026-09-05

## 一、现状盘点（基于实际源码）

已有能力：

- **`@` 文件引用（D3 已落地）**：`packages/ui/src/components/chat/ChatInputArea.vue` 输入 `@` 触发文件浮层，选中进 `selectedFilePaths`（`useChat.ts`），发送时在 `send()` 末尾拼 `[Files] JSON`（含路径/预览）到 userContent。
- **上传文件 chips**：`uploadedFiles` + `.file-chips`，发送时落盘 `workspace/uploads/<convId>/` 并把路径告知智能体。
- **消息操作**：`ChatMessageList.vue` 的 `msg-actions`——user 消息有复制/编辑，assistant 有复制。**无「引用」**。
- **预览 tab 体系**：`stores/chat.ts` `PreviewTab(kind: file|browser|git)` + `currentBrowserUrl` 单一真相源；`BrowserPanel.vue` 有 `.url-bar`（地址栏输入框）。

缺口：URL 无法一键引用进对话；消息内容无法引用追问；长文本输入没有转文件机制。

## 二、功能设计

### F1 浏览器 URL 引用到对话（P1）

**入口**：`BrowserPanel.vue` 地址栏 `.url-bar` 右侧新增「引用到对话」图标按钮（仅当前 tab 处于 browser kind 且有有效 URL 时可用）。web 端 iframe 版同样生效（BrowserPanel 三端共用）。

**交互**：

1. 点击 → `useChat` 新增 `quotedUrls: ref<Array<{ url: string; name: string }>>`（去重按 url）。
2. 输入框上方出现新的 chips 行（复用 `.file-chips` 样式，地球/链接图标 + hostname，可删除）。
3. 输入框自动聚焦；若右栏开着可不关闭（引用后用户常回浏览器继续看）。

**发送注入**：`send()` 中把引用 URL 拼进 userContent：

```
[网页引用]
- <hostname> <url>
```

智能体侧已有 browser_* 工具（browser_navigate 等）可访问该 URL，与点击消息链接打开的行为一致，**不需要后端改动**。

**影响点**：`BrowserPanel.vue`（url-bar 按钮 + emit 或直接调 store/useChat）、`ChatInputArea.vue`（URL chips 行）、`useChat.ts`（quotedUrls 状态 + send 拼接）、`chat.css`（chip 样式微调）。

> 说明：此前约定「内置浏览器禁止新增用户侧按钮」针对的是内部优化（滚动条/缩放等），本功能是用户主动要求的新能力，不冲突。

### F2 消息内容引用（P1）

**入口**：`ChatMessageList.vue` `msg-actions` 给 user 与 assistant 消息各加一个「引用」按钮（ChatQuote 图标）。

**交互**：点击 → 输入框插入引用块并聚焦：

```
> 引用 <摘要（前 40 字符…）>：
> <内容前 20 行，超出省略>

```

光标落在引用块之后，用户直接补充问题。空输入发送时标题生成沿用现有逻辑。

**实现**：`useChat.ts` 新增 `quoteMsg(round)`，拼接文本写入 `input.value`；不动消息数据结构、不动后端。与现有 `editMsg` 同级复杂度。

**范围外（P3 备选，本次不做）**：

- 划词引用浮层：浏览器 tab（桌面端为原生 BrowserView）内的文本选区 Vue 层拿不到，需 IPC 注入脚本，成本高、收益低，单列后续。
- 右栏 FilePreview 内容引用。

### F3 输入过长自动转文件（P2）

**规则**（自动、无弹窗、不打断）：

- 阈值：`input` 字符数 > **5000**（常量放 `@yan-zhi/shared`，可后续配置）。
- 发送时若超阈值：全文自动写入 `workspace/uploads/<convId>/paste_<ts>.txt`，走现有上传落盘 + `registerFile(category: 'upload')` 链路；消息正文截断为前 200 字 + `\n（全文已存为附件，共 N 字）`；文件路径以现有 `[文件: ... 路径: ...]` 格式注入，智能体用 `file_read` 读取。
- 输入过程中（非发送时）超过阈值仅在输入框下方显示一条轻量行内提示「内容较长，发送时将自动转为附件」，可关闭，不做强制按钮。

**粘贴大文本**：同一机制天然覆盖（粘贴进 textarea 超阈值，发送时同样转文件）。

**影响点**：`useChat.ts`（send 转换逻辑 + 提示状态）、`ChatInputArea.vue`（行内提示）、`chat.css`。

## 三、不做的事（控制范围）

- ❌ 不改后端 / 数据库（引用全部通过 userContent 文本注入，与 @ 文件引用同轨）
- ❌ 不做 BrowserView 划词引用（IPC 注入，P3 另立项）
- ❌ 不做引用消息的卡片化渲染（先纯文本引用块，效果不好再迭代）
- ❌ 不新增 tab 右键菜单等第二入口（先只做地址栏按钮）

## 四、实施顺序与验证

| 顺序 | 内容 | 验证方式 |
|---|---|---|
| 1 | F2 消息引用（最小改动先跑通链路） | `vue-tsc --noEmit` + 手动：引用 user/assistant 消息 → 发送 → 检查消息内容 |
| 2 | F1 URL 引用 | 手动：浏览器 tab 点引用 → chip 出现 → 发送 → 智能体收到 `[网页引用]` |
| 3 | F3 长文本转文件 | 粘贴 >5000 字发送 → uploads 目录出现 txt + 正文截断 |
| 收尾 | chat.css chips 样式对齐「朱砂纸墨」主题 | 桌面 + web 双端目检，移动端 chips 不溢出 |

## 五、风险

| 风险 | 等级 | 对策 |
|---|---|---|
| URL chip 与文件 chips 行并存时视觉拥挤 | low | URL chip 独立一行，样式同源 |
| 长文本转文件在 web 端 adapter.fs 差异 | low | 复用现有 uploads 落盘链路，该链路三端已验证 |
| 引用块污染会话标题生成（title 取前 24 字） | low | title 生成跳过 `> ` 开头的引用行 |
