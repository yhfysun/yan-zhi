## Why

当前页面左侧一直占用 240px 导航栏，聊天页面内还有第二层 280px 侧边栏，双层侧边栏挤占大量内容空间，视觉上显得拥挤且不够现代。本次改版将导航菜单和用户登录入口收纳到右上角圆形图标按钮中，释放左侧空间让聊天区更宽。同时在聊天页右侧新增文件管理面板，方便查看和管理 AI 可读写的文件；整体统一 CSS 变量体系、优化交互动效和加载体验。

文件管理的核心设计理念：**引用传递而非内容传输**——大模型上下文有限且昂贵，文件上传后只将文件 ID 和前几行预览传给模型，模型通过 `file_read` 工具自行按需读取完整内容。Excel 作为特殊二进制格式，需要在 `file_read` 工具中增加解析能力（支持指定 sheet/行列范围，返回结构化数据）。

## What Changes

### 布局重构
- 移除 App.vue 左侧全局导航栏（sidebar），将其菜单项收纳到右上角圆形菜单图标的下拉面板中
- 用户登录/用户信息从左侧边栏底部移至右上角圆形用户头像图标，点击弹出登录/退出操作
- 页面整体宽度增加（原侧边栏 240px 空间释放给主内容区）

### 聊天页增强
- 新增"滚到底部/滚到顶部"浮动按钮，仅当消息区可滚动时显示
- 右侧新增可折叠的文件管理面板，展示 AI 可访问的文件列表，支持预览、删除、上传

### 文件管理（引用传递机制）
- 文件上传后分配唯一 ID，存储到工作目录
- 发送消息时，引用文件仅传递 `{ fileId, fileName, type, size, preview(前5行) }` 给模型
- 模型通过已有的 `file_read` 工具自行按需读取完整文件内容
- Excel 文件（.xlsx/.xls/.csv）在 `file_read` 工具中特殊处理：支持指定 sheet 名、行列范围，返回 CSV/JSON 格式数据

### 样式体系优化
- 统一 CSS 变量：补全语义色（success/warning/danger）、阴影层级、圆角阶梯
- 页面切换动画增加微位移，不再只是 fade
- 列表页（Models、MCP、Agents）增加骨架屏加载态
- Toast 通知位置移至右上角，避免遮挡 topbar
- 消息气泡间距收紧，hover 交互增强
- 欢迎卡片增加快捷示例问题入口

## Capabilities

### New Capabilities
- `topbar-navigation`: 右上角导航栏，包含菜单下拉按钮和用户头像按钮，替代原左侧侧边栏
- `scroll-navigator`: 聊天页面滚动跳转浮动按钮，支持一键到顶/到底
- `file-panel`: 聊天页面右侧文件管理面板，支持文件浏览、预览、上传、删除
- `file-read-excel`: `file_read` 工具增强，支持 Excel 文件解析（指定 sheet/行列范围）
- `style-system`: 全局 CSS 变量体系补全、动效增强、骨架屏加载

### Modified Capabilities
- `builtin-tools`: `file_read` 工具的 inputSchema 和 execute 逻辑扩展，新增 Excel 解析参数

## Impact

- `packages/ui/src/App.vue` — 重构布局，移除 sidebar，新增 topbar；补全 CSS 变量；增强路由切换动画
- `packages/ui/src/views/Chat.vue` — 新增 scroll 跳转按钮；新增右侧文件管理面板；文件引用预览传递
- `packages/core/src/tool/builtin/file-read.ts` — 扩展支持 Excel 解析（sheet、range 参数，输出 CSV/JSON）
- `packages/ui/src/views/Models.vue` — 增加骨架屏加载态
- `packages/ui/src/views/Mcp.vue` — 增加骨架屏加载态
- `packages/ui/src/views/Skills.vue` — 增加骨架屏加载态
- `packages/ui/src/views/Agents.vue` — 增加骨架屏加载态
- `packages/core/package.json` — 可能需要添加 xlsx 解析依赖
- 路由结构不变；所有 Store 逻辑不变
