# 1. 拆分编排壳

- [x] 1.1 `Chat.vue` 重写为仅编排与消息/输入栏的壳层
- [x] 1.2 抽取 `ChatSidebar.vue`（会话列表、智能体/空间/模型选择）
- [x] 1.3 抽取 `ChatTopbar.vue`、`ChatFilePanel.vue`
- [x] 1.4 抽取 `ChatPreviewPane.vue`、`ChatSkillCards.vue`

# 2. 抽取消息与交互

- [x] 2.1 抽取 `ChatMessageList.vue`、`ChatInputArea.vue`
- [x] 2.2 抽取 `ChatDialogs.vue`、`ChatMountDialog.vue`
- [x] 2.3 逻辑下沉到 `useChat.ts`

# 3. 收尾

- [x] 3.1 `Chat.vue` 降至少于 600 行（当前 34 行）
- [ ] 3.2 浏览器逐块回归并截图
- [x] 3.3 运行 `npx openspec validate --all`
