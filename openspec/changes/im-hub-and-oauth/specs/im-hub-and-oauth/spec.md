# im-hub-and-oauth Specification

## Purpose

该能力构建 yan-zhi 独立的 IM 消息中枢（内置/微信/飞书三模式）与微信/飞书 OAuth 授权流，补齐第一批 `redesign-chat-and-nav` 抽出的范围。它建立 IM 会话数据模型与 API、用户 OAuth 授权（发起/回调或手动回填/凭证持久化），并将第一批的「聊天」占位升级为完整中枢、将「IM 连接」面板升级为绑定入口。

## ADDED Requirements

### Requirement: IM conversation data model and API

The system SHALL provide an IM conversation data model distinguishing channel `builtin` / `wechat` / `feishu`, with conversation list, message history, and send/receive APIs. Built-in conversations SHALL be stored locally; WeChat/Feishu conversations SHALL be retrievable after binding.

#### Scenario: List built-in conversations

- **WHEN** the user opens the 聊天 hub in 内置 mode
- **THEN** the app lists local built-in conversations with message history and can send without invoking AI

#### Scenario: WeChat/Feishu conversations after binding

- **WHEN** the user has bound WeChat or Feishu and switches to that mode
- **THEN** the app shows that channel's conversations and messages

### Requirement: IM hub top-bar mode switch

The system SHALL render the 聊天 hub with a top-bar segmented control of 内置 (default) / 微信 / 飞书. The 内置 mode SHALL show the app's own conversation list and message area without invoking any AI.

#### Scenario: 聊天 default mode

- **WHEN** the user opens 聊天
- **THEN** the 内置 mode is active by default and shows local IM conversations with no AI participation

#### Scenario: Unbound WeChat/Feishu

- **WHEN** the user switches to 微信 or 飞书 while unbound
- **THEN** the page guides them to bind the account via 设置 → IM 连接

### Requirement: WeChat/Feishu OAuth authorization

The system SHALL support authorizing WeChat/Feishu connections via an OAuth flow. The chosen implementation (full backend OAuth callback OR manual authorization-code paste-back) SHALL write the returned user credential to settings state (persisted via keyring). Manual paste-back SHALL be the minimum viable first step; full backend OAuth callback is an allowed upgrade.

#### Scenario: Authorization (manual paste-back, recommended first step)

- **WHEN** the user clicks 去授权 for WeChat/Feishu in 设置 → 聊天
- **THEN** the built-in browser opens the platform OAuth page, and the user can paste the returned code/credential back into the panel, which writes it to settings state

#### Scenario: Authorization (full backend OAuth, upgrade path)

- **WHEN** backend OAuth callback is enabled and the user completes platform authorization
- **THEN** the credential is written back to settings state automatically via the BrowserPanel callback interception

#### Scenario: Credential persistence

- **WHEN** authorization completes by either path
- **THEN** the user credential persists across launches via the platform keyring

### Requirement: IM connection binding panel

The system SHALL provide an IM 连接 settings panel that binds user OAuth accounts (distinct from the existing app-level `tenant_access_token`), reusing the connector CRUD base.

#### Scenario: Bind a WeChat/Feishu account

- **WHEN** the user binds a WeChat/Feishu account in IM 连接
- **THEN** the 聊天 hub reflects the bound status (green dot) and can load that channel's conversations
