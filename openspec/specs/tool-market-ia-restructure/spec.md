# Tool Market IA Restructure Specification

## Purpose

定义工具市场页的两段式结构：MCP 服务概览与工具商城卡片网格，并统一本地与远程市场的进入方式。

## Requirements

### Requirement: Two-section tool management page
The ToolMarket page SHALL display an MCP 服务 overview section and a 工具商城 section, replacing the previous tab layout.

#### Scenario: Page renders two sections
- **WHEN** 用户导航到 `/tools`
- **THEN** 页面先显示 MCP 服务概览，再显示工具商城

#### Scenario: No tab switching required
- **WHEN** 用户查看 ToolMarket 页面
- **THEN** 两个区域无需点击 Tab 即同时可见

### Requirement: MCP service overview section
MCP 服务区域 SHALL 展示已配置 MCP 服务的紧凑概览，并提供进入完整 MCP 管理页的导航。

#### Scenario: Display MCP service cards
- **WHEN** 已配置 MCP 服务
- **THEN** 每个服务显示名称、状态和工具数量

#### Scenario: Navigate to full MCP management
- **WHEN** 用户点击 MCP 区域的“查看全部”
- **THEN** 应用导航到 `/mcp`

### Requirement: Market card grid layout
工具商城区域 SHALL 以卡片网格展示本地商城和所有远程商城。

#### Scenario: Local market card always present
- **WHEN** 页面渲染
- **THEN** “本地商城”卡片始终作为第一张卡片显示

#### Scenario: Add remote market action
- **WHEN** 用户点击“新增远程商城”
- **THEN** 打开填写名称、URL 和认证信息的对话框

### Requirement: Local and remote market inline views
点击市场卡片 SHALL 进入本地或远程工具的详情视图，并限制新增工具仅在本地市场可用。

#### Scenario: View local market
- **WHEN** 用户进入本地市场详情视图
- **THEN** 内置工具为只读卡片，自定义工具可编辑、启用和删除

#### Scenario: Add custom tool restricted to local market
- **WHEN** 用户在远程市场详情视图
- **THEN** 不显示“新增工具”按钮
