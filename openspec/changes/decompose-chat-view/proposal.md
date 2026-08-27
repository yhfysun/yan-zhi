# 为什么

`packages/ui/src/views/Chat.vue` 当前约 3700 行，单文件同时承载会话列表、智能体选择、空间管理、文件管理弹窗、右侧预览面板、Skill 卡片、消息流、工具渲染、确认/反问/平台配置等多个交互。它是“界面乱、难维护”的主要体感来源，也给后续市场与工具改动制造了高冲突面。

# 改什么

按组件边界拆分，主文件只保留编排、消息流、输入栏和少量跨组件协调：

- `ChatConversationList.vue`：会话列表、搜索、批量选择、右键菜单。
- `ChatAgentPicker.vue`：智能体列表、空间选择器、模型选择。
- `ChatFilePanel.vue`：顶栏文件入口、三段分类文件管理弹窗。
- `ChatFileManagerModal.vue`：已上传 / 中间文件 / 已交付三段文件管理内容。
- `ChatPreviewPane.vue`：右侧文件 / 网站预览 Tab。
- `ChatSkillCards.vue`：Skill 卡片与挂载状态。

同时把纯逻辑下沉到 composables：

- `useChatSend.ts`：发送、停止、重生成、文件上传预览。
- `useChatToolRender.ts`：工具调用状态、参数、结果渲染。
- `useChatInteractions.ts`：复制、编辑、删除、折叠、快照、蒸馏。
- `useChatFiles.ts`：工作区文件加载、预览、选择、上传、删除。

# 验收目标

- `Chat.vue` 降到 600 行以内。
- 组件拆分后交互与数据流保持不变。
- `npx openspec validate --all` 通过。
- 浏览器截图逐块回归：会话切换、文件管理、预览、Skill 挂载、发送/停止/重生成均可用。

# 影响

- `packages/ui/src/views/Chat.vue`：重写为编排层。
- `packages/ui/src/components/chat/*`：新增拆分组件。
- `packages/ui/src/composables/chat/*`：新增逻辑 composables。
- 不改动 Store、API、消息协议。
