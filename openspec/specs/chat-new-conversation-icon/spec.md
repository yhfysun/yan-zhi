# Chat New Conversation Icon Specification

## Purpose

定义聊天输入工具栏中的“新建会话”入口，让用户无需回到侧边栏即可清空当前会话并开始新对话。

## Requirements

### Requirement: New conversation icon in chat input toolbar
The chat input toolbar SHALL include a new conversation icon button that clears the current conversation state.

#### Scenario: Clicking new conversation icon
- **WHEN** 用户点击聊天输入工具栏右侧的新建会话 Plus 图标
- **THEN** 系统调用 `startNewChat()` 清空当前会话状态

#### Scenario: Icon placement
- **WHEN** 聊天输入工具栏渲染
- **THEN** 图标位于发送按钮左侧的 toolbar-right 区域

#### Scenario: Icon tooltip
- **WHEN** 用户悬停新建会话图标
- **THEN** 显示“新建会话”提示
