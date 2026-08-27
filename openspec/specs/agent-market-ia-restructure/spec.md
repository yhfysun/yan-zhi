# Agent Market IA Restructure Specification

## Purpose

定义智能体市场的入口结构与交互：默认展示商城卡片，点击卡片进入本地或远程智能体列表，并统一管理远程商城源。

## Requirements

### Requirement: Page shows marketplace cards as default entry
The Agents page SHALL display a marketplace cards grid as the default view, showing the Local Agent Marketplace card and every configured remote marketplace card.

#### Scenario: Default page load
- **WHEN** 用户导航到 `/agents`
- **THEN** 页面显示包含“Local Agent Marketplace”卡片和所有远程商城卡片的网格

#### Scenario: No tabs present
- **WHEN** Agents 页面渲染
- **THEN** 不显示用于在本地与远程视图间切换的 `el-tabs`

### Requirement: Local marketplace card navigates to all agents
The system SHALL provide a Local Agent Marketplace card that navigates to all built-in and custom agents.

#### Scenario: Open local marketplace
- **WHEN** 用户点击 Local Agent Marketplace 卡片
- **THEN** 视图切换到内置智能体与自定义智能体的卡片网格

### Requirement: Remote marketplace cards support management
Each remote marketplace card SHALL display source metadata and actions for browsing, testing, and deleting the remote source.

#### Scenario: Remote card actions
- **WHEN** 用户查看远程商城卡片
- **THEN** 卡片显示名称、URL 和浏览、测试、删除操作

### Requirement: Add remote marketplace entry card
The marketplace grid SHALL include an Add Remote Marketplace entry card with dashed styling and a plus icon.

#### Scenario: Add remote marketplace
- **WHEN** 用户点击 Add Remote Marketplace 卡片
- **THEN** 打开表单，填写名称、URL 与认证设置

### Requirement: Back navigation from agent list views
The local and remote agent list views SHALL provide a back action to return to the marketplace cards grid.

#### Scenario: Back from agent list
- **WHEN** 用户在本地或远程智能体列表
- **THEN** 页面提供返回商城卡片网格的按钮

### Requirement: Visual consistency with other marketplace pages
The Agents page SHALL use the shared glass-card tokens and spacing used by ToolMarket and Skills pages.

#### Scenario: Glass card styling
- **WHEN** Agents 页面渲染商城或智能体卡片
- **THEN** 卡片使用 `--glass-bg`、`--glass-filter` 和 `--radius-md`
