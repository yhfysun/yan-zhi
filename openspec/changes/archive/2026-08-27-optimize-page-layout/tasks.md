## 1. Topbar Navigation — Refactor App.vue

- [x] 1.1 移除 App.vue 中左侧 sidebar 模板和相关样式
- [x] 1.2 在 App.vue 模板中添加 topbar 容器，包含菜单下拉按钮（el-dropdown）和用户头像按钮
- [x] 1.3 从路由定义中提取菜单项数据，在下拉面板中渲染菜单链接（聊天、模型平台、MCP 服务、Skill 商店、智能体、设置），当前路由高亮
- [x] 1.4 实现用户头像下拉：未登录显示"登录"选项，已登录显示用户名和"退出登录"
- [x] 1.5 添加 topbar 毛玻璃样式（backdrop-filter、半透明背景、z-index 高于内容区）
- [x] 1.6 调整 main-content 样式使其满宽布局（移除左侧 sidebar 占位）
- [x] 1.7 确认：登录页面（/login）不受 topbar 影响，保持独立全屏布局

## 2. Scroll Navigator — Chat.vue

- [x] 2.1 在 Chat.vue 消息区容器内添加"滚到底部"按钮（向下箭头），position: absolute
- [x] 2.2 添加"滚到顶部"按钮（向上箭头），位于"滚到底部"按钮上方
- [x] 2.3 实现滚动位置监听逻辑：计算 showScrollBottom 和 showScrollTop 响应式变量
- [x] 2.4 实现点击按钮平滑滚动到顶部/底部
- [x] 2.5 添加按钮样式：40px 圆形、毛玻璃背景、hover 放大效果
- [x] 2.6 确认：新消息到达时自动滚动到底部行为不受影响

## 3. File Panel — Chat.vue 右侧

- [x] 3.1 在 Chat.vue 三栏布局中添加右侧文件面板容器（默认折叠，宽度 240px）
- [x] 3.2 实现面板顶部标题栏：标题"文件" + 上传按钮 + 折叠/关闭按钮
- [x] 3.3 实现搜索框过滤文件列表
- [x] 3.4 通过 `FsAdapter.readDir` 读取工作目录 `workspace/files/`，渲染文件列表（图标、文件名、大小、修改时间）
- [x] 3.5 实现文件预览弹窗：文本高亮、图片预览、Excel 表格预览（前 20 行）
- [x] 3.6 实现文件上传：生成 `f_` 前缀 ID，复制文件到 `workspace/files/{fileId}_{原名}`，刷新列表
- [x] 3.7 实现文件删除：二次确认 + `FsAdapter.remove` + 刷新列表
- [x] 3.8 实现文件引用传递：发送消息时将选中文件的 `{ fileId, fileName, type, size, preview }` 附加到上下文，不传完整内容
- [x] 3.9 添加文件面板毛玻璃样式、1px 分隔线
- [x] 3.10 在工具栏添加文件面板切换按钮（带文件数量 badge）

## 4. file_read Tool — Excel Parsing

- [x] 4.1 在 `packages/core` 中添加 `xlsx` 依赖（或使用动态 import）
- [x] 4.2 扩展 `file_read` 的 `inputSchema`，新增 `sheet`、`range`、`format` 可选参数
- [x] 4.3 修改 `file_read.execute`：检测文件扩展名，.xlsx/.xls/.csv 走 Excel 解析分支
- [x] 4.4 实现 Excel → CSV 转换逻辑（默认输出格式）
- [x] 4.5 实现 JSON 格式输出（`format: "json"` 时）
- [x] 4.6 实现 range 行列范围过滤
- [x] 4.7 实现 sheet 名称/索引选择
- [x] 4.8 实现大文件截断保护（默认 10000 行上限）
- [x] 4.9 动态 import xlsx 库，避免核心包体积膨胀

## 5. Style System — 全局 CSS 变量与动效

- [x] 5.1 在 App.vue 的 `:root` 中补全 CSS 变量：--color-success/warning/danger、--shadow-sm/md/lg、--radius-sm/md/lg/xl
- [x] 5.2 替换各组件中的硬编码颜色值为 CSS 变量引用
- [x] 5.3 修改路由过渡动画：从纯 opacity 改为 opacity + translateY(4px)
- [x] 5.4 配置 ElMessage 全局默认 offset 避开 topbar 区域
- [x] 5.5 优化消息气泡间距：margin-bottom 从 24px 缩小到 16px
- [x] 5.6 欢迎卡片增加 3 个示例问题快捷按钮，点击填入输入框

## 6. Skeleton Loading — 列表页

- [x] 6.1 Models.vue 增加 `<el-skeleton>` 骨架卡片，loading 状态控制
- [x] 6.2 Mcp.vue 增加骨架屏加载态
- [x] 6.3 Skills.vue 增加骨架屏加载态
- [x] 6.4 Agents.vue 增加骨架屏加载态

## 7. Polish & Verification

- [x] 7.1 删掉不再使用的侧边栏相关样式（sidebar、logo、nav-menu 等）
- [x] 7.2 验证所有页面导航、渲染、交互正常
- [x] 7.3 验证登录/退出流程正常
- [x] 7.4 验证聊天页三栏布局折叠/展开切换正常
- [x] 7.5 验证文件面板 CRUD 操作正常
- [x] 7.6 验证文件引用传递：消息上下文只含引用不含完整内容
- [x] 7.7 验证 Excel 文件读取（.xlsx/.xls/.csv）各参数场景
- [x] 7.8 运行项目确认无控制台错误
