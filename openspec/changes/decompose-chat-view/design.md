# Context

`Chat.vue` 模板覆盖 1-986 行，脚本覆盖 988-2620 行，样式覆盖 2622-3709 行。模板中的文件管理、预览、Skill 卡片、空间与智能体侧栏已经具备天然边界，可直接切为子组件。

当前 Script 混有 UI 状态、业务编排、工具渲染和文件系统操作。拆分时先移模板块，再抽 composables，避免一次性重写。

# Goals / Non-Goals

**Goals:**

- 主文件降至可维护长度。
- 组件 props/events 清晰，业务逻辑不迁移到 Store。
- 所有现有功能在拆分前后等价。

**Non-Goals:**

- 不重构消息协议或 Store 数据结构。
- 不改变视觉样式。
- 不在本轮引入 Pinia 之外的全局状态方案。

# Decisions

## 1. 先抽子组件，再抽 composables

每次只处理一个边界：先复制模板片段到组件，通过 `defineProps` / `defineEmits` 接入主文件，确认编译与交互后再删除原片段。

## 2. 文件管理弹窗与预览分离

`ChatFilePanel` 只负责顶栏入口与弹窗开关；`ChatFileManagerModal` 负责三段列表和上传/删除操作；`ChatPreviewPane` 只消费 `store.previewingFile`。

## 3. 工具渲染保持纯函数

`useChatToolRender` 暴露 `resolveToolDisplay`、`getToolResult`、`getToolStatusClass` 等纯展示辅助，不持有消息状态。

# Risks / Trade-offs

- 拆分过程中容易漏传事件。每个组件接入后必须用浏览器回归对应交互。
- 样式迁移可能造成 scoped 选择器变化。先将组件专属样式随组件迁走，保留全局样式在 Chat.vue。
