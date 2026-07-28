## 1. 模型名称匹配 - Platform Store

- [x] 1.1 修改 `fetchRemoteModels` 离线模式逻辑：已有模型按 `modelId` 找到后更新而非用 `uid()` 新建
- [x] 1.2 在拉取循环中添加已见 `modelId` 去重 set，防止 API 返回重复项
- [x] 1.3 修改 `createConversation` 和 `updateConversation`：session 存储 `model.modelId` 而非 `model.id`
- [x] 1.4 新增 `resolveModelId` 辅助函数：先按 `modelId` 精确匹配，失败则回退按内部 `id` 匹配（存量兼容）

## 2. 模型名称匹配 - Chat View 适配

- [x] 2.1 Chat.vue 的 `onMounted` 和 `watch(currentConvId)` 中的模型查找逻辑改为使用 `resolveModelId`
- [x] 2.2 `onModelChange` 中存储 `model.modelId` 而非 `model.id`
- [x] 2.3 Agent 模型选择同步适配：`onAgentSwitch` / `onAgentSaved` 中使用 `resolveModelId`

## 3. 新建会话图标

- [x] 3.1 在 Chat.vue 的 `toolbar-right` 区域发送按钮左侧添加 `Plus` 图标按钮
- [x] 3.2 点击时调用 `startNewChat()`，tooltip 显示"新建会话"
- [x] 3.3 流式输出中（`store.streaming`）禁用新建会话按钮

## 4. 工作目录选择器

- [x] 4.1 在 Chat.vue 的 `toolbar-center` 区域添加工作目录选择图标（`FolderOpened` 图标）
- [x] 4.2 新增 `WorkspaceDirDialog.vue` 组件：Dialog + 文件树浏览（读取 `adapter.fs.readDir` 展示目录结构）
- [x] 4.3 实现目录导航（展开/折叠子目录、返回上级）
- [x] 4.4 选中目录后确认 → 更新 `workspaceDir` ref → 持久化到 `adapter.keyring.set('settings:workspaceDir', path)`
- [x] 4.5 页面加载时从 keyring 恢复工作目录设置
- [x] 4.6 图标上显示当前工作目录的简短路径标签

## 5. 验证

- [ ] 5.1 本地模式下验证：拉取模型 → 再次拉取 → 确认模型数量不翻倍
- [ ] 5.2 验证存量会话（model_id 是内部 ID 的旧数据）能正确匹配模型
- [ ] 5.3 验证新建会话图标：点击后清空对话、不切路由
- [ ] 5.4 验证工作目录选择器：打开弹窗 → 选择目录 → 确认 → 持久化 → 刷新后恢复
