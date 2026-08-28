# redesign-chat-and-nav Specification

## Purpose

该能力将 yan-zhi 主导航从 13 个扁平项收敛为 5 个核心项（对话/聊天/知识库/浏览器/设置），移除 `/home` 并将根重定向指向对话页，明确区分「对话（与大模型）」与「聊天（IM）」入口，将 8 类配置收进设置抽屉子导航（并解决整页视图塞抽屉的双重标题问题）；同时把主题默认改为暗色并支持切换。IM 消息中枢与微信/飞书 OAuth 授权不在本能力范围，由独立变更 `im-hub-and-oauth` 承接。

## ADDED Requirements

### Requirement: Minimal five-item primary navigation

The system SHALL present a primary navigation of exactly five items: 对话 (LLM conversation), 聊天 (IM entry, placeholder in this change), 知识库 (knowledge), 浏览器 (browser), 设置 (settings). The `/home` route SHALL NOT appear in the primary navigation, and the root path SHALL redirect to 对话. All platform/MCP/tool/skill/agent configuration entries SHALL move into the settings drawer sub-navigation, not the primary nav.

#### Scenario: Desktop primary navigation

- **WHEN** the app runs on Electron with viewport width >= 768px
- **THEN** the left sidebar lists only the five core items (no `/home`), and clicking 设置 opens a drawer (not a route)

#### Scenario: Root redirect

- **WHEN** the user visits the root path `/`
- **THEN** the app redirects to 对话 (`/chat`), not `/home`

#### Scenario: Wide web navigation

- **WHEN** the app runs on the Web platform with viewport width >= 768px
- **THEN** the icon dock lists all five core items, including 浏览器 (the current Web dock filters out `/browser` and `/mcp` at `SideNav.vue:58`; this filter SHALL be removed so exactly five items show)

#### Scenario: Mobile primary navigation

- **WHEN** viewport width is less than 768px
- **THEN** the bottom TabBar lists only the five core items

### Requirement: 对话 page is LLM-only

The system SHALL render the 对话 page as a large-language-model conversation view with a model pill (online indicator + reasoning toggle) in its top bar and a collapsible context sidebar showing mounted knowledge/skills/tools. The 对话 page SHALL NOT contain any WeChat/Feishu mode switch.

#### Scenario: 对话 top bar

- **WHEN** the user opens the 对话 page
- **THEN** the top bar shows a model pill and a context sidebar toggle, and no IM mode segmented control

#### Scenario: Tool call rendering

- **WHEN** the model emits a `[tool_call]`
- **THEN** it renders as an inline spinning chip, not inline prose

### Requirement: 聊天 entry placeholder in this change

The system SHALL keep a 聊天 entry in the primary navigation. In this change the entry SHALL render a placeholder panel informing the user that the IM hub is forthcoming and directing them to 设置 → IM 连接 to bind accounts. The full IM hub (内置/微信/飞书) is specified by the `im-hub-and-oauth` change and is out of scope here.

#### Scenario: 聊天 placeholder

- **WHEN** the user opens 聊天 in this change
- **THEN** a placeholder panel appears with a link to 设置 → IM 连接, and no IM conversation UI is rendered

### Requirement: Settings drawer with grouped sub-navigation and no duplicated titles

The system SHALL provide a settings drawer whose left sub-navigation groups configuration into 模型平台 / 聊天 / MCP 服务 / 工具管理 / Skill 商店 / Skill 蒸馏 / 智能体 / 客户端节点 / IM 连接, each reusing the corresponding existing view as a panel. When an existing full-page view is rendered inside the drawer, its own page header SHALL be hidden and its primary action promoted to the drawer header, with the panel body scrolling independently.

#### Scenario: Opening a settings panel

- **WHEN** the user opens 设置 and selects MCP 服务
- **THEN** the Mcp.vue panel renders inside the drawer without a duplicated top bar, and the panel body scrolls independently

### Requirement: Dark theme as default with toggle

The system SHALL default to dark theme and support a toggle between light and dark themes, persisting the choice across sessions. The system SHALL keep the existing `[data-theme="dark"]` variable scheme (root is light, `[data-theme="dark"]` overrides to dark) and ONLY flip the default `darkMode` flag to true; it SHALL NOT introduce an inverted `:root`-dark / `[data-theme="light"]` variable scheme.

#### Scenario: Theme default

- **WHEN** the app launches with no stored preference
- **THEN** it renders in dark theme (existing `[data-theme="dark"]` semantics applied)

#### Scenario: Theme switch

- **WHEN** the user clicks the sun/moon button in the desktop TitleBar, the mobile top bar, or the Web dock/browser toolbar host (the shared `packages/ui/src/App.vue` has no desktop or wide-web top bar — `App.vue:21` is mobile-only)
- **THEN** the theme switches and the choice persists via the platform keyring on next launch

### Requirement: Home retained as an alternate landing, not the default

The system SHALL keep the `/home` route (and `Home.vue`) but remove it from the primary navigation and stop using it as the default landing page. The `Home.vue` entry cards SHALL be reduced to match the new IA (dropping cards that link to settings-only pages).

#### Scenario: Default landing is 对话

- **WHEN** the app launches or visits the root path `/`
- **THEN** it opens 对话 (`/chat`), not `/home`

#### Scenario: Home entry cards align to new IA

- **WHEN** `Home.vue` renders
- **THEN** its entry cards target only the five core areas and settings, and no card links to a settings-only page (`/models` `/tools` `/skills` `/distill` `/agents` `/mcp`)
