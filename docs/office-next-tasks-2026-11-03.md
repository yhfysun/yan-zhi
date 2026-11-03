# 办公工作台深化与新阶段任务描述（2026-11-03）

> 用途：直接作为新会话的任务说明。基线是「UI P0–P3 + 办公工作台第一轮」已完成，
> 这一阶段把办公做深、把剩余管理页收口、补真机回归。

---

## 零、现状基线（已完成，勿重做）

### UI 骨架与一致性
- 统一 `PageFrame`（固定页头 → 工具条 → 内容自滚）：Models / Agents / ToolMarket / Skills / Plugins。
- 「列表 + 右侧详情」分栏（宽屏可拖拽、窄屏弹窗）已覆盖 6 页：
  Models / Agents / ToolMarket / Skills / Plugins / 授权管理。
- 窗口尺寸/位置/最大化记忆；聊天任务列表按模式记忆滚动；办公工作台记忆上次文件与目录展开。
- Ctrl+K 命令面板（含切换模式/新建任务/设置/侧栏与上下文栏）；Ctrl+B/J/N。
- P3：Element Plus 统一层、暗色硬编码清零（color-mix）、面板动效 token、主要页面图标统一。

### 办公工作台（`/office`）
- 入口：聊天页右下角 `LeadToggle`（AI ↔ 人工）；`/office` 只承担人工形态，面板为 ai 时自动回 `/chat`。
- 三块：工作区文件树 / 文件画布 / 右下角悬浮切换。
- 文件能力：
  - 复用 `FilePreview`：md（读/编辑/分屏）、txt/代码高亮+行号、docx、xlsx、PDF、图片；
  - JSON/jsonc 自动缩进；CSV 表格编辑并回写；
  - docx/xlsx/pptx 新建；pptx 文字回写；`.ydoc` 复用 DocumentCard 导出 Word；
  - 右键新建（docx/xlsx/pptx/md/txt）、拖拽移动、行内重命名、撤销（最近 10 步）；
  - 键盘 F2 / Delete / Ctrl+Z；文件行显示大小。
- AI 侧：内置工具 `office_create` / `office_read`（与工作台同一套 Python 生成解析），
  默认助手与翻译/商务智能体白名单已接入；Word/Excel/PPT 三个技能正文已补用法并进入刷新白名单。

### 回归
- 暗色：9 个主页面 0 白块 / 0 黑字（1600×900）。
- 窄屏：6 个分栏页在 768 / 390 无横向溢出，右侧详情正确收起。

---

## 一、P0：文件导入与批量操作（2–3 天）

1. **拖入外部文件导入工作区**
   - 新增 `POST /api/workspace/upload`（multipart）：目标目录必须在允许根内，单文件上限与类型校验，重名自动加序号。
   - 前端：文件树 dragover 识别 `DataTransfer.files`（与内部拖拽区分：内部拖拽带 `text/plain` 路径），拖到目录行/空白处即上传到该目录/根；显示上传中与失败原因。
2. **文件树多选 + 批量操作**
   - Ctrl/Cmd 点选、Shift 连选；批量移动（选目标目录）、批量删除（二次确认，逐条报告失败）。
   - 复用 `/api/workspace/rename`、`/api/workspace/delete`；不要新增批量后端接口，前端循环 + 汇总。
3. **工作区搜索**
   - 复用 `GET /api/workspace/search`（文件名/内容、include、maxResults）；文件树顶部加搜索入口，结果点击后用 `revealPath` 定位并选中。
   - 搜索时树改为「结果列表」形态，退出搜索恢复树。

验收：拖 3 个文件进子目录全部落盘；多选移动/删除后列表与磁盘一致；搜索能按内容命中并定位。

---

## 二、P1：办公文档编辑深化（3–4 天）

1. **docx 文字编辑（工作台统一编辑入口）**
   - 读取：沿用 `office_docs.py read`（heading/paragraph/table）。
   - 编辑：段落/标题文本可改（表格单元格可改），保存走新增 `office_docs.py save --kind doc`（python-docx 按块序号回写，保留样式）。
   - 交互：与 pptx 一致——画布内「编辑 / 取消 / 保存」，工作台标题栏显示保存结果。
2. **xlsx 单元格编辑统一**
   - 现有 `FilePreview` 已支持 Excel 编辑；工作台确认保存回写、错误提示、编辑后刷新；如体验割裂，考虑把表格编辑器抽到工作台。
3. **AI 工具补齐**
   - `office_write`：向已有 docx/xlsx/pptx 追加或替换文本块（参数：path、kind、blocks/rows/slides）。
   - `office_search`：工作区按文件名/内容搜索（封装 `/api/workspace/search`），与 P0-3 同一口径。
   - 更新默认助手提示词 + Word/Excel/PPT 技能正文，并把对应 skill id 放进 `SKILL_BODY_REFRESH_IDS`。
4. **模板新建（可选）**
   - 支持从模板目录新建 docx/xlsx/pptx；模板缺失时回落现在的空白文档。

验收：docx 改标题+段落+表格后保存，重新打开内容一致且样式不丢；AI 能 `office_write` 到一个已存在文档并被 `office_read` 读到。

---

## 三、P2：管理页收尾（2–3 天）

1. **DataSources / Knowledge / Peers 套统一骨架**
   - `PageFrame` + 「列表 + 右侧详情」，复用 `useResizable` 与既有页面模式（参考 Models/Plugins）。
2. **Settings 页面骨架统一（可选）**
   - 已有左分组 + 右详情雏形，只收口页头/滚动，不重做内容。
3. **Element Plus 表格 / 分页真实数据回归**
   - 有真实数据的页面（模型、工具、插件、日志类）检查表头/行 hover/分页在亮暗两套下的观感。

验收：三个页面滚动时页头与工具条不动；1600/1280 无双重滚动条；暗色无白块。

---

## 四、P3：真机 E2E 与回归（1–2 天）

1. **真实 Electron 全链路**（本机 dev 实例）：
   - 办公模式 → 右下角切人工 → 新建文档 → 编辑保存 → 导出 Word；
   - 右键新建 md → 编辑 → 重命名 → 拖拽进目录 → Ctrl+Z 撤销；
   - 打开 CSV 改单元格保存；打开 `.ydoc` 导出 Word。
2. **暗色 390 / 768 回归**（新增导入/多选/搜索后的页面）。
3. **全量检查**：
   - `cd packages/ui && npx vue-tsc --noEmit`（既有两个 ClipWorkbench 报错，勿误判）；
   - `npx vitest run --no-file-parallelism`；
   - `cd apps/server && npx tsc --noEmit`。

---

## 五、约束（务必遵守）

- **多会话共用工作区**：提交前必须 `git diff --cached --name-only` 为空；`git add` 只列自己的路径；核对暂存清单数量后再 commit。曾发生过把别人已暂存改动一起提交的事故。
- **测试后端**：另起 `PORT=3101` + 独立 `DATA_DIR`（如 `tmp/ui-serve/data2`）。当前 dev 后端默认 **multi 模式**：首次需 `POST /api/auth/setup` 建审计管理员，再 `POST /api/auth/login` 取 token（前端写 `localStorage.auth_token`）。不要使用用户的实例库。
- **预览服务**：不要起第二个默认 Vite（会抢共享 `.vite/deps`）；用独立 `cacheDir`（`tmp/ui-serve/serve.mjs` 已有实现）与独立端口。
- 不重启用户正在跑任务的应用实例；渲染层改动走 HMR。
- 文件树所有写操作必须走服务端 `/api/workspace/*`（不要端侧 fs 直连），路径口径与允许根守卫保持一致。

---

## 六、关键文件索引

| 区域 | 文件 |
|---|---|
| 工作台 | `packages/ui/src/views/office/OfficeWorkbench.vue` |
| 文件树 | `packages/ui/src/components/office/WorkspaceFileTree.vue` |
| 工作区状态 | `packages/ui/src/composables/office/useWorkspaceFiles.ts` |
| 文档视图 | `packages/ui/src/components/office/OfficeDocumentView.vue` |
| 通用文件预览 | `packages/ui/src/components/FilePreview.vue` |
| 办公模式入口 | `packages/ui/src/components/workbench/LeadToggle.vue`、`views/Chat.vue` |
| 办公后端 | `apps/server/src/routes/office.ts`、`routes/workspace.ts` |
| 办公 Python | `packages/core/src/tool/builtin/python-scripts/office/office_docs.py` |
| AI 工具 | `packages/core/src/tool/builtin/office-docs.ts`、`builtin/index.ts` |
| 种子/提示词 | `apps/server/src/db.ts`、`builtin-office-agents.ts` |
| 分栏模式参考 | `views/Models.vue`、`components/plugin/PluginManager.vue`、`views/LicenseManage.vue` |
| 守门测试 | `views/office/officeWorkbench.wiring.test.ts`、`views/agentsDetailSplit.test.ts`、`styles/p3Consistency.test.ts`、`components/filePreviewCode.test.ts` |

---

## 七、已知风险

- 内置 agent / skill 的 body 与工具白名单是**启动时按种子同步**：`YZ_BUILTIN_OVERWRITE=always`（默认）才会刷新 Skill 正文；`never` 时保留用户编辑。
- `office_create/office_read` 依赖随包 Python；开发环境下 `getPythonScript('office/office_docs.py')` 从 `python-scripts` 目录解析，打包时确认 `python-tools` 已拷入。
- 工作台是人工形态；不要把聊天重新塞回右栏（用户明确要求 AI = 聊天页）。
- `App.vue` / `db.ts` / `CodeWorkbench.vue` 等文件其他会话也在改，改动前先 `git status` 与 `git diff` 确认范围。
