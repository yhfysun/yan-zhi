# four-mode-workspace Specification

## Purpose

把 yan-zhi 的整体布局统一为四种模式（办公 / 开发 / 运维 / 安全）：提供唯一、位置固定的模式切换器；办公模式欢迎区的场景卡去掉「代码开发」并扩展为办公室岗位模板，以可手动拖动的 3D 循环轮播承载；开发模式移除「退出开发模式」按钮；运维与安全两种模式按与办公、开发一致的工作台骨架重做，四模式均常驻「任务对话」。

## ADDED Requirements

### Requirement: Lead toggle is a floating capsule, not a toolbar row

The lead toggle (worded `AI 模式` / `编辑模式` in 开发, `AI 模式` / `命令模式` in 运维 and 安全) SHALL render as a floating capsule anchored to the bottom-right of the mode's working area, and SHALL NOT occupy a layout row or be placed inside the mode top bar. 办公 mode SHALL NOT render a lead toggle.

#### Scenario: Capsule does not consume layout space

- **WHEN** 开发, 运维, or 安全 mode renders
- **THEN** the lead toggle floats above the working area (bottom-right), consumes no layout row, and the mode top bar contains no lead toggle

#### Scenario: Capsule does not block content interaction

- **WHEN** the user interacts with content beneath the floating capsule area
- **THEN** only the capsule surface itself captures pointer events; the surrounding wrapper does not

#### Scenario: Short labels

- **WHEN** the capsule renders in 运维 or 安全 mode
- **THEN** the two options read AI 模式 and 命令模式 respectively; in 开发 mode they read AI 模式 and 编辑模式

### Requirement: Task list is available in every mode

Every mode's left aside SHALL expose the shared task (conversation) list in addition to that mode's own resource section, so the user can see and switch tasks from any mode.

#### Scenario: Task list present in all four modes

- **WHEN** the user opens 办公, 开发, 运维, or 安全 mode
- **THEN** the left aside shows a task list section listing the conversations of the current space

#### Scenario: Resource section is preserved

- **WHEN** a task list section is added to a mode's left aside
- **THEN** that mode's original resource content (file tree / resource tree / authorization list) is still rendered below it

#### Scenario: Sections are independently collapsible

- **WHEN** the user collapses the task section
- **THEN** the resource section expands to use the freed height, and vice versa

### Requirement: Every mode has its own agents and skills

The system SHALL provide mode-specific agents and skills for all four modes. 运维 and 安全 SHALL each gain a dedicated skill set (currently they have zero mode-specific skills), and office role scenes SHALL be backed by office-domain skills.

#### Scenario: Ops assistant has ops skills

- **WHEN** the user chats with the ops assistant
- **THEN** ops-domain skills (health check, log analysis, docker ops, read-only DB maintenance, deploy/release, incident response) are available for injection

#### Scenario: Security assistant has security skills

- **WHEN** the user chats with the security assistant
- **THEN** security-domain skills (authorized recon, web probing, report writing, audit review, hardening baseline, blue-team detection) are available, and each skill body states that actions must stay within authorized scope

#### Scenario: Office roles have office skills

- **WHEN** the user selects an office role scene such as 财务会计 or 法务合同
- **THEN** the corresponding office skill (finance / HR / operations / legal / data report / service) is available, and the legal and finance skills carry a disclaimer that output is advisory only

#### Scenario: Built-in skill content updates take effect

- **WHEN** a built-in skill's body is modified in code
- **THEN** its id is added to the skill-body refresh allowlist so the new content is pushed to existing databases, since the default upsert intentionally does not overwrite existing bodies

### Requirement: Narrow width degrades to icon-only buttons

When the viewport narrows, sidebars and toolbars SHALL degrade by hiding text and keeping icon-only buttons with a tooltip, rather than shrinking or squeezing card content. Transforms that scale elements down SHALL NOT be used for this degradation.

#### Scenario: Mode switcher becomes icon-only

- **WHEN** the viewport width drops below the desktop threshold
- **THEN** the mode switcher shows only its icon and caret, with the full mode name available via tooltip

#### Scenario: Sidebar shows icons only

- **WHEN** the left aside narrows past its threshold
- **THEN** tree rows and task rows show only their icons (labels hidden), and each row carries a title attribute with the full name

#### Scenario: Right chat panel collapses to a strip

- **WHEN** the viewport narrows further
- **THEN** the right conversation panel collapses to a vertical strip whose click opens it as an overlay, rather than squeezing the conversation

#### Scenario: No scale-based shrinking

- **WHEN** any responsive degradation applies
- **THEN** the implementation hides content (e.g. `display:none` on label spans) and does not use `transform: scale()` to shrink controls

### Requirement: Ops mode is a HexHub-style workbench where one terminal equals one task

运维 mode SHALL present a HexHub-style workspace: a multi-tab window bar where each tab is a connection window, and each connection window SHALL carry its own conversation (task). The 命令模式 form SHALL show the terminal as the main surface together with a live metrics panel and an SFTP panel in a three-pane arrangement. The AI 模式 form SHALL render AI execution as expandable step cards and SHALL keep the multi-tab window bar.

#### Scenario: One terminal window equals one task

- **WHEN** the user opens a connection in 运维 mode
- **THEN** that connection window holds its own conversation, so switching windows switches tasks, and the left task list reflects them

#### Scenario: Window tabs persist across forms

- **WHEN** the user switches between 命令模式 and AI 模式
- **THEN** the multi-tab window bar remains visible in both forms and the active window is unchanged

#### Scenario: 命令模式 shows three panes

- **WHEN** 运维 mode is in 命令模式
- **THEN** the terminal occupies the main surface, and a live metrics panel (CPU / memory / disk / top processes) plus an SFTP panel with remote and local directories side by side are shown

#### Scenario: AI 模式 renders execution as step cards

- **WHEN** the assistant executes commands in AI 模式
- **THEN** each step renders as an expandable card showing the tool name, elapsed time, and real output, and steps requiring confirmation are marked as such

#### Scenario: AI 模式 keeps a command line

- **WHEN** the assistant proposes a step needing confirmation in AI 模式
- **THEN** a command line at the bottom lets the user confirm or continue in natural language

#### Scenario: Command mode chat strip holds a real conversation

- **WHEN** the user expands the chat strip at the bottom of 命令模式
- **THEN** it shows the actual message history with an input box and quick-prompt chips, not merely a static line of text

### Requirement: Office mode has a single form

办公 mode SHALL provide only one layout and SHALL NOT offer a lead toggle. Its layout SHALL be: left = task list, center = conversation (scene carousel plus input).

#### Scenario: No lead toggle in office mode

- **WHEN** the user is in 办公 mode
- **THEN** no lead toggle is rendered, and the layout is task list on the left with the conversation in the center

### Requirement: Dev mode AI form mirrors office layout with an editor on the right

代码 mode's AI form SHALL use the same layout as 办公 mode (task conversation in the center) with an editor added on the right, and the task area SHALL offer task template cards.

#### Scenario: Dev AI form layout

- **WHEN** 开发 mode is in its AI form
- **THEN** the center is the task conversation and the right side is the editor, matching the office-mode structure plus an editor

#### Scenario: Template cards in the conversation area

- **WHEN** the user starts a task in the dev AI form
- **THEN** the conversation area shows task template cards including 建立项目 / 需求开发 / Bug 修复 / 架构设计 / 读懂项目 / 补单元测试 / 接口开发 / 页面开发 / Java 专项 / 打包发布

#### Scenario: Template cards map to existing agents

- **WHEN** a template card is shown
- **THEN** it indicates which existing agent handles it (代码编写助手 / 代码探索助手 / 高级程序助手 / 前端助手 / Java 开发助手 / 发布助手), without creating new agents

### Requirement: Dev mode editing form keeps the editor centered and demotes cards to buttons

代码 mode's editing form SHALL place the editor in the center with the task panel in the right column, and because that column is narrow the task templates SHALL be rendered as compact buttons rather than cards.

#### Scenario: Editing form is the current layout

- **WHEN** 开发 mode is in its editing form
- **THEN** the editor occupies the center and the task panel is in the right column, i.e. the current workbench layout

#### Scenario: Cards become buttons in the narrow column

- **WHEN** the task panel is rendered in the narrow right column
- **THEN** the same template set renders as compact icon+label buttons instead of full cards

### Requirement: Ops and security modes are three-pane with file management on the right

运维 mode SHALL be laid out as three panes: left = resource list, center = terminal (the 黑窗口), right = file management. 安全 mode SHALL mirror this three-pane layout.

#### Scenario: Ops command form is three-pane

- **WHEN** 运维 mode is in 命令模式
- **THEN** the left pane is the resource list, the center is the terminal, and the right pane is file management

#### Scenario: Ops AI form keeps file management on the right

- **WHEN** 运维 mode is in AI 模式
- **THEN** the right pane is still file management (identical to the command form), the center is the task conversation, and execution step cards are rendered inside the conversation stream

#### Scenario: Live metrics panel is always available

- **WHEN** either 运维 form is shown
- **THEN** a live metrics panel (CPU / memory / disk / top processes) is pinned at the bottom of the left pane

#### Scenario: Security mirrors the ops layout

- **WHEN** 安全 mode is shown
- **THEN** it presents three panes — left authorization & assets, center scan console (or conversation in AI form), right findings & output

### Requirement: Ops AI form supports binding a local directory

运维 mode's AI form SHALL let the task bind a local directory (via the release project), showing the bound project's local path, tech stack, and deployment target, so the agent does not need to be re-briefed each time.

#### Scenario: Bound project banner

- **WHEN** a task in 运维 mode's AI form is bound to a release project
- **THEN** the conversation shows a banner with the project name, local directory, tech stack, and deployment target, plus an action to rebind

#### Scenario: Execution steps appear in the conversation

- **WHEN** the assistant executes commands in the ops AI form
- **THEN** each step renders as a step card (step number, tool name, elapsed time, real output) inside the conversation stream, and steps needing confirmation are marked as such

#### Scenario: Confirm from the command line

- **WHEN** a step requires confirmation
- **THEN** the bottom command line lets the user confirm or continue in natural language

### Requirement: Dev mode task cards reuse the office card implementation

代码 mode's task template cards SHALL reuse the same card styles and interactions as 办公 mode's scene cards (`ChatWelcome.vue` `.cw-card` family), differing only in data source.

#### Scenario: Cards look and behave like office cards

- **WHEN** the user views task templates in 开发 mode's AI form
- **THEN** they render with the same card styles, selection highlight, hover behaviour, and expand-on-select interaction as 办公 mode's scene cards

#### Scenario: Only the data differs

- **WHEN** the card grid renders in 开发 mode
- **THEN** it is driven by the dev template list instead of the office scene list, with the same component/CSS, so the two never drift apart

### Requirement: Dev mode activity bar is kept only in the editing form

The vertical activity bar in 开发 mode (resource explorer, file search, source control, run & debug, console, plugins, dev environment — `CodeSidebar.vue` `.csb-bar`) SHALL be shown only in the editing form and hidden in the AI form.

#### Scenario: Activity bar visible in editing form

- **WHEN** 开发 mode is in its editing form
- **THEN** the vertical activity bar and its panels are present at the far left, as today

#### Scenario: Activity bar hidden in AI form

- **WHEN** 开发 mode is in its AI form
- **THEN** the activity bar and its panels are hidden, leaving the left column as the task list only, with the task conversation in the center and the editor on the right

### Requirement: Ops SFTP panes support mutual drag-and-drop transfer

运维 mode's file management panes SHALL support dragging files and folders between the local and remote panes in both directions, with the drag direction determining the operation (local→remote = upload, remote→local = download).

#### Scenario: Drag direction decides operation

- **WHEN** the user drags an item from the local pane onto the remote pane
- **THEN** it uploads, and dragging from the remote pane onto the local pane downloads

#### Scenario: Direction hint on hover

- **WHEN** a dragged item hovers over the opposite pane
- **THEN** that pane highlights and shows a direction hint such as 「↑ 上传到 /app/order-service」 or 「↓ 下载到 ~/work/...」

#### Scenario: Same-pane drag is inert

- **WHEN** the user drags an item within the same pane
- **THEN** nothing happens, since cross-directory moves require an explicit menu action

#### Scenario: Folders transfer recursively

- **WHEN** the user drags a folder
- **THEN** the whole directory tree is uploaded or downloaded recursively with per-file progress

#### Scenario: Name conflicts require confirmation

- **WHEN** the target already contains a file with the same name
- **THEN** the user is asked to overwrite, skip, or rename, and production connections additionally go through the existing confirmation gate

#### Scenario: Path traversal is rejected

- **WHEN** a recursive download would resolve outside the pane's displayed root
- **THEN** the transfer is rejected

### Requirement: Office mode keeps its file management and preview entries

The 办公 mode top bar SHALL keep both the file management entry (`ChatFilePanel`) and the right-panel view entry (the dropdown offering browser preview / Git files / console / collapse), which SHALL remain reachable when the layout is reworked.

#### Scenario: Both entries remain available

- **WHEN** the user is in 办公 mode
- **THEN** the file management entry and the right-panel view dropdown are both present and usable in the mode top bar

#### Scenario: Entries survive narrow width

- **WHEN** the viewport narrows
- **THEN** these entries degrade to icon-only buttons but are not removed

### Requirement: Default palette is refreshed and a lightweight built-in skin ships

The default palette in `tokens.css` SHALL be refreshed away from the current 朱砂 orange-red toward a neutral, modern scheme, and a lightweight built-in skin SHALL be provided that uses small tile patterns only, without any full-size wallpaper.

#### Scenario: Neutral modern default palette

- **WHEN** no theme or skin is selected
- **THEN** the app renders with the refreshed neutral palette (cool neutral surfaces and an indigo-family primary) rather than the current warm 朱砂 orange-red

#### Scenario: Lightweight skin has no wallpaper

- **WHEN** the lightweight built-in skin is selected
- **THEN** no wallpaper image is used; only small seamless tile patterns (task list / input / button / dialog) are applied

#### Scenario: Existing skins are unaffected

- **WHEN** any of the existing 27 skins is selected
- **THEN** its own palette overrides the defaults at runtime, with no interaction from the palette change

#### Scenario: Default font stays on the option list

- **WHEN** the display font default is reconsidered
- **THEN** the serif display font becomes an option that cultural skins may keep, rather than an unconditional default

### Requirement: Dev, ops and security modes have two forms selected by a floating capsule

开发 / 运维 / 安全 modes SHALL each provide two forms selected by a lead toggle rendered as a floating capsule anchored to the bottom-right of the mode's working area (`LeadToggle.vue`), NOT a control in the mode top bar (办公 mode has no lead toggle). The lead determines where the conversation sits: AI-led places the conversation in the center as the primary surface, human-led keeps the working surface in the center with the conversation in the right column (开发) or embedded inline with the console (运维/安全). Capsule wording: 开发 `[AI 模式 | 编辑模式]`, 运维/安全 `[AI 模式 | 命令模式]`. The lead choice SHALL be persisted per mode with defaults `{ dev: 'human', ops: 'human', sec: 'human' }` (开发默认编辑器居中即现状，运维/安全默认命令模式).

#### Scenario: Capsule wording per mode

- **WHEN** the floating capsule renders in 开发 mode
- **THEN** its two options read AI 模式 and 编辑模式, and in 运维 or 安全 mode they read AI 模式 and 命令模式

#### Scenario: Developer mode mirrors layout by lead

- **WHEN** the user is in 开发 mode with the lead set to 编辑模式 (human)
- **THEN** the editor occupies the center and the conversation is in the right column (the current `CodeWorkbench` layout)

#### Scenario: Developer mode with AI lead

- **WHEN** the user switches 开发 mode to AI 模式
- **THEN** the conversation occupies the center and the editor becomes a collapsible region that auto-expands when the user opens a file

#### Scenario: Lead is remembered per mode

- **WHEN** the user sets 开发 to 编辑模式 and 运维 to AI 模式, then restarts the app
- **THEN** each mode restores its own lead setting with the defaults `{ dev: 'human', ops: 'human', sec: 'human' }`

#### Scenario: Switching lead does not reload state

- **WHEN** the user toggles the lead in a mode with an open terminal session, open editor tabs, and an ongoing conversation
- **THEN** the terminal stays connected, the editor tabs stay open, and the conversation history is unchanged (only the layout changes, all surfaces kept alive with `v-show`)

### Requirement: Ops and security modes embed the conversation inline with the console

The 运维 and 安全 modes SHALL provide the conversation embedded in the same region as the console rather than only in a right column. Both modes SHALL expose an explicit 「命令模式 / AI 模式」 switch via the floating lead capsule (bottom-right), replacing the hidden floating corner button (`ops-view-fab`).

#### Scenario: Ops console view switch is explicit

- **WHEN** the user opens a connection window in 运维 mode
- **THEN** an explicit 命令模式 / AI 模式 switch is available via the floating capsule (replacing the small floating corner button), and switching preserves the window's conversation and SSH session

#### Scenario: Ops command mode with collapsible chat strip

- **WHEN** 运维 mode is in 命令模式
- **THEN** the terminal fills the region and a collapsible chat strip at the bottom shows the latest assistant conclusion with an expand affordance

#### Scenario: Ops AI mode with collapsible terminal

- **WHEN** 运维 mode is in AI 模式
- **THEN** the conversation fills the region and the terminal becomes a collapsible region that shows command output as the assistant executes

#### Scenario: Security mode gains the same dual view

- **WHEN** the user opens 安全 mode
- **THEN** the existing scan console remains intact as 命令模式, and a new AI 模式 shows the conversation bound to the security assistant

#### Scenario: Security compliance gates are unchanged

- **WHEN** the user runs any action from 安全 mode's AI 模式
- **THEN** authorization scope validation, the dangerous-action blocklist, the HUMAN_ONLY gate, full audit logging, and the rule that the AI never autonomously triggers `attack_sim` all still apply

### Requirement: Four application modes with a single mode switcher on the existing nav item

The system SHALL define exactly four application modes — 办公 (`office`, route `/chat`), 开发 (`dev`, route `/code`), 运维 (`ops`, route `/ops`), 安全 (`sec`, route `/sec`) — and SHALL provide mode switching by **repurposing the existing 「任务」 navigation item** in the global top bar (`WebTopBar`) into a mode dropdown. The system SHALL NOT add a new top-bar control for mode switching, and the top bar navigation SHALL continue to contain exactly its existing four items (首页 / 任务 / 浏览器 / 消息).

#### Scenario: Switcher replaces the 任务 nav item in place

- **WHEN** the app renders on desktop (Electron) or web
- **THEN** the second top-bar navigation item (previously 「任务」) renders as `◧ 当前模式名 `, keeping the same `.title-nav-item` styling, and no additional mode-switch control is added

#### Scenario: Mode dropdown content

- **WHEN** the user opens the mode dropdown
- **THEN** it lists 办公模式 / 开发模式 / 运维模式 / 安全模式, each with an icon, a one-line description, and a check mark on the active one

#### Scenario: Switch from 办公 to 开发

- **WHEN** the user opens the dropdown and selects 开发模式
- **THEN** the app persists the mode as `dev` and navigates to `/code`

#### Scenario: Unavailable mode

- **WHEN** the user selects 运维 or 安全 while the corresponding plugin (ops-shell / sec-lab) is disabled or the platform is mobile
- **THEN** the entry is rendered disabled with an explanatory hint and a shortcut to `/plugins`, and no navigation occurs

#### Scenario: Mode memory across navigation

- **WHEN** the active mode is not `office` and the user navigates to `/chat`
- **THEN** the router redirects to the active mode's route, preserving the existing "returning to 任务 restores the workbench" behavior

### Requirement: Conversation and project are shared across modes

The system SHALL treat the four modes as views over one shared working context. Switching modes SHALL NOT create a new conversation or clear messages, and the active conversation (`chatStore.currentConvId`) SHALL remain the same across modes. All modes SHALL resolve the working directory from the single global source (`settings.workspaceDir`).

#### Scenario: Switching mode keeps the same conversation

- **WHEN** the user has an active conversation in 办公 mode and switches to 开发 mode
- **THEN** the 开发 mode right-side 任务 panel shows the same conversation with its full message history, and further input appends to that same conversation

#### Scenario: Switching mode keeps the same working directory

- **WHEN** the user switches between 办公 / 开发 / 运维 modes
- **THEN** all modes operate on the same working directory value from `settings.workspaceDir`

#### Scenario: Scene prompt appended without resetting history

- **WHEN** the user switches to 运维 mode inside an existing conversation
- **THEN** the `ops` scene prompt applies to subsequent messages while previous messages remain unchanged, and no new conversation is created

#### Scenario: Per-mode UI state is preserved separately

- **WHEN** the user opens editor tabs in 开发 mode, switches to 运维 mode, then switches back
- **THEN** the editor tabs are still open (UI state is per-mode), while the conversation and working directory remain shared

### Requirement: Release project binds local directory and server for CI/CD

The system SHALL provide a 发布项目 (release project) concept in 运维 mode that binds a local project directory together with one or more deployment targets (server connections). A 发布项目 SHALL reuse the existing `DeployTarget` shape (`connectionId` + `remotePath` + `restartScript` + `env`) rather than introducing a second server model.

#### Scenario: Create a release project from an existing directory

- **WHEN** the user creates a release project and picks an existing local directory
- **THEN** the system runs project detection on it, stores the detected tech stack, and proposes a default pipeline

#### Scenario: Create a release project with a new directory

- **WHEN** the user creates a release project and asks for a new directory
- **THEN** the system creates the local directory (optionally via a scaffold command after explicit confirmation) and then proceeds with detection

#### Scenario: Bind server targets

- **WHEN** the user adds a deployment target to a release project
- **THEN** the target is stored with a reference to an existing ops-shell connection, plus remote path and restart script, and credentials are never returned to the client

### Requirement: Task binds a release project and固化了 CI/CD workflow

The system SHALL allow a conversation to bind a release project, persisted in a new `conversation.release_project_id` column added via incremental migration. When bound, the conversation context SHALL include the project's local directory, detected tech stack, build command, deployment targets, and last release result, and the CI/CD plugin tools SHALL be mounted to that conversation's tool set.

#### Scenario: Bound conversation receives project context

- **WHEN** a conversation is bound to a release project
- **THEN** subsequent messages include the project profile (local dir, tech stack, build command, targets), and the 发布助手 tool set is available without delegating to a sub-agent

#### Scenario: First-time CI/CD setup driven by conversation

- **WHEN** the user asks to deploy a bound project for the first time
- **THEN** the agent detects the project type, lists templates, resolves the SSH connection, and creates a persisted pipeline whose `projectDir` is the project's local dir and whose targets are the project's deployment targets

#### Scenario: Pipeline is a reusable asset after setup

- **WHEN** the pipeline has been created once and the user later asks to release again
- **THEN** the agent runs the existing pipeline directly without re-deriving the configuration

#### Scenario: Production deploy requires confirmation

- **WHEN** a release targets a connection tagged as production
- **THEN** the existing ops-shell gate applies and the operation requires explicit confirmation before executing

### Requirement: CI/CD plugin exposes a UI entry

The CI/CD pipeline plugin SHALL declare a `contributes.sidebar` entry so its console has a discoverable UI entry, and the 发布 workspace SHALL be reachable from 运维 mode.

#### Scenario: Plugin console is reachable

- **WHEN** the cicd-pipeline plugin is enabled
- **THEN** its console is reachable from the sidebar / 更多 menu group and from a 发布 workspace tab inside 运维 mode

### Requirement: Agents are grouped by mode with searchable collapsible groups

The agent picker in the chat input SHALL group agents by their owning mode, SHALL provide a search box filtering by name and description, and SHALL allow each group to be collapsed and expanded with the collapsed state persisted.

#### Scenario: Grouped listing

- **WHEN** the user opens the agent picker
- **THEN** agents appear under 办公模式 / 开发模式 / 运维模式 / 安全模式 / 工作流 group headings, with the active mode's group expanded by default and the others collapsed

#### Scenario: Search filters across groups

- **WHEN** the user types in the search box
- **THEN** agents are filtered by name and description, and groups containing matches are expanded automatically, with an empty state shown when nothing matches

#### Scenario: Collapsed state persists

- **WHEN** the user collapses a group and reopens the picker later
- **THEN** that group remains collapsed

#### Scenario: Sub-agents are excluded

- **WHEN** the picker renders
- **THEN** agents marked as sub-agents are not listed, matching the existing `agent_kind: 'sub'` semantics

### Requirement: Diagnostic agent diag_min_loop is removed

The system SHALL remove the manually created diagnostic workflow agent `diag_min_loop` from the development and legacy databases, without modifying the workflow engine's loop node capability.

#### Scenario: Cleanup targets only the diagnostic agent

- **WHEN** the cleanup runs
- **THEN** the `diag_min_loop` agent row and its associated `workflow_run` records are removed from `apps/server/data.db` and its agent row from `yan-zhi.db`

#### Scenario: Smoke workflow agents are kept

- **WHEN** the cleanup runs
- **THEN** `a_wf_smoke_all_nodes` and `a_wf_smoke_editor` remain untouched, and the loop node type remains available in the workflow engine

### Requirement: No mode-exit control inside mode workbenches

The system SHALL NOT render any per-mode exit control (including the current 退出开发模式 button in `CodeWorkbench` and the 代码模式 icon button in `ChatTopbar`). Each mode workbench top bar SHALL show a read-only mode badge instead, and all mode changes SHALL go through the global switcher.

#### Scenario: 开发 mode top bar

- **WHEN** the user is in 开发 mode
- **THEN** the workbench top bar shows a non-interactive 开发 mode badge and no 退出开发模式 button

#### Scenario: 办公 mode top bar

- **WHEN** the user is in 办公 mode
- **THEN** the chat top bar contains no 代码模式 icon button; entering 开发 mode is only possible via the global switcher

### Requirement: Office mode welcome carousel of office-role scene cards

The system SHALL render the 办公 mode welcome area as a manually draggable 3D circular carousel of office-role scene cards. The card set SHALL NOT include the 代码开发 scene and SHALL include office role templates such as 行政文员, 财务会计, 运营推广, 人力资源, 销售商务, 法务合同, 数据分析, and 客服售后, in addition to 日常办公 and 设计创意.

#### Scenario: Card set

- **WHEN** the welcome area renders with no conversation selected
- **THEN** it shows the office-role cards (10 by default) and no 代码开发 card

#### Scenario: Manual drag rotation

- **WHEN** the user presses and drags horizontally inside the carousel
- **THEN** the card ring rotates around the Y axis following the pointer, and on release it decays with inertia and snaps to the nearest card slot

#### Scenario: No autoplay

- **WHEN** the carousel is idle for any duration
- **THEN** it MUST NOT rotate on its own (no timer-driven rotation)

#### Scenario: Infinite loop

- **WHEN** the user keeps dragging in one direction
- **THEN** the ring keeps rotating past 360 degrees without stopping at the first or last card

#### Scenario: Selecting a card

- **WHEN** the user clicks the front-facing card
- **THEN** that scene becomes active, its example prompts are revealed, and the message input receives focus

#### Scenario: Reduced motion and mobile fallback

- **WHEN** `prefers-reduced-motion: reduce` is set or the viewport is narrower than 768px
- **THEN** the carousel degrades to a horizontally scrollable card list with scroll snapping and no 3D transforms

### Requirement: Shared workbench shell for 开发 / 运维 / 安全 modes

The system SHALL provide a shared workbench shell (`WorkbenchShell.vue`) with a mode top bar slot, a collapsible resizable left aside slot, a center main slot, and a collapsible resizable right 任务 slot that hosts the shared chat components. The 开发, 运维, and 安全 modes SHALL all render through this shell.

#### Scenario: Conversation panel placement follows the lead

- **WHEN** the user is in 开发, 运维, or 安全 mode
- **THEN** the shared message list and input area render at the placement given by `chatPlacementOf(mode, lead)`: right column in 开发's 编辑模式, center in AI 模式, and inline with the console (collapsible strip) in 运维/安全's 命令模式, and the panel can be collapsed and resized

#### Scenario: 运维 mode layout

- **WHEN** the user is in 运维 mode
- **THEN** the left aside shows the resource tree (servers / Docker / databases, plus the release projects in AI form), the center shows the terminal / conversation workspace, and the right pane shows file management (identical in both forms)

#### Scenario: 安全 mode layout

- **WHEN** the user is in 安全 mode
- **THEN** the left aside shows authorization scopes and assets, the center keeps the compliance ribbon above the recon / scan / audit workspace (or the conversation in AI form), and the right pane shows findings & output

#### Scenario: Business logic preserved

- **WHEN** 运维 or 安全 mode is refactored into the shell
- **THEN** all existing plugin capabilities (SSH/SFTP/DB sessions, scan tools, authorization scope enforcement, risk gating, audit logging) continue to behave exactly as before

### Requirement: Mode-aware scene prompts

The system SHALL define `ops` and `sec` scene definitions and SHALL activate the scene matching the active mode when a mode workbench mounts (`office` → `office`, `dev` → `code`, `ops` → `ops`, `sec` → `sec`).

#### Scenario: Entering 运维 mode sets the ops scene

- **WHEN** the user switches to 运维 mode
- **THEN** the 任务 conversation uses the `ops` scene prompt and skill keywords for subsequent messages

#### Scenario: Entering 安全 mode sets the sec scene

- **WHEN** the user switches to 安全 mode
- **THEN** the 任务 conversation uses the `sec` scene prompt, which restates that actions must stay inside authorized scopes

### Requirement: Mode state generalization and migration

The system SHALL persist the active mode under the key `yz:mode` and SHALL migrate a legacy `yz:code:active = '1'` value to `dev` on startup.

#### Scenario: Legacy flag migration

- **WHEN** the app starts with `yz:code:active` set to `'1'` and no `yz:mode`
- **THEN** the active mode becomes `dev`, `yz:mode` is written, and the legacy key is removed

## MODIFIED Requirements

### Requirement: Scene catalog covers office roles (was: three scenes)

`config/scenes.ts` SHALL expose an extended scene catalog including office role templates and the `ops` / `sec` scenes, while the welcome carousel SHALL render only the office-facing subset (excluding `code`).

#### Scenario: Code scene still exists for 开发 mode

- **WHEN** the user is in 开发 mode
- **THEN** the `code` scene remains available and is applied automatically, even though it is not shown as a welcome card

#### Scenario: No new built-in agents for office roles

- **WHEN** a user selects an office role scene (e.g. 财务会计)
- **THEN** the scene binds to the existing default assistant agent with a role-specific prompt, and no new built-in agent is created
