## Why

每次从平台拉取模型列表时，系统为每个远程模型生成一个新的内部 ID（通过 `uid('m_')`），导致已存在的模型在拉取后被重复创建而非更新。同时，会话通过内部 ID 引用模型，ID 变化会导致会话关联失效。同一平台下模型名称天然唯一，应改用模型名称（modelId）作为匹配依据，消除 ID 漂移问题。此外，聊天输入区域的快捷操作入口不够完善，缺少新建会话和工作目录选择的便捷图标。

## What Changes

- **模型匹配逻辑改为按名称（modelId）匹配**：拉取远程模型时，以 `modelId`（模型名称）为主键进行去重，同一 `modelId` 的模型更新而非新建，彻底解决 ID 漂移
- **聊天模型选择优化**：模型下拉框同步适配名称匹配逻辑，会话记录中的模型引用通过名称交叉定位
- **聊天输入区新增新建会话图标**：在输入框工具栏右侧添加新建会话按钮，一键创建空白会话
- **聊天输入区新增工作目录选择图标**：在输入框工具栏添加工作目录选择入口，显示当前工作目录路径，支持快速切换目录
- **工作目录选择器**：实现弹窗式目录浏览/选择器组件，展示文件系统结构，支持导航和选择

## Capabilities

### New Capabilities
- `model-name-matching`: 模型拉取去重改为按模型名称（modelId）匹配，消除拉取时内部 ID 漂移导致的数据冗余和会话关联失效
- `chat-new-conversation-icon`: 聊天输入区工具栏添加新建会话图标入口
- `workspace-directory-selector`: 聊天输入区工具栏添加工作目录选择图标和目录浏览器组件

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- `packages/ui/src/stores/platform.ts` — `fetchRemoteModels` 去重逻辑改为按 `modelId` 匹配
- `packages/ui/src/views/Chat.vue` — 输入区 toolbar 新增两个图标按钮，模型选择联动
- `packages/ui/src/views/Models.vue` — 新增平台拉取模型预览时的去重提示
- `packages/ui/src/views/PlatformDetail.vue` — 现有模型的名称匹配提示
- `packages/core/src/platform/types.ts` — 可能需要新增工作目录相关类型定义
