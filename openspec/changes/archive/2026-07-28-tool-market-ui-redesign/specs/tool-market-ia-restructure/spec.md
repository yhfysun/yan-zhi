## ADDED Requirements

### Requirement: Two-section tool management page
The ToolMarket page SHALL display two distinct sections: "MCP 服务" (MCP service overview) and "工具商城" (Tool Marketplace), replacing the previous 4-tab layout.

#### Scenario: Page renders two sections
- **WHEN** user navigates to `/tools`
- **THEN** the page SHALL render an "MCP 服务" section at the top and a "工具商城" section below it

#### Scenario: No tab switching required
- **WHEN** user views the ToolMarket page
- **THEN** both sections SHALL be visible without clicking any tabs

### Requirement: MCP service overview section
The MCP 服务 section SHALL display a compact overview of connected MCP services and provide navigation to the full MCP management page.

#### Scenario: Display MCP service cards
- **WHEN** there are MCP servers configured
- **THEN** each server SHALL be shown as a compact card displaying its name, status indicator, and tool count

#### Scenario: Navigate to full MCP management
- **WHEN** user clicks the "查看全部" (View All) link in the MCP section
- **THEN** the app SHALL navigate to `/mcp`

#### Scenario: Empty MCP state
- **WHEN** no MCP servers are configured
- **THEN** the MCP section SHALL display an empty state with a link to `/mcp` for adding servers

### Requirement: Market card grid layout
The 工具商城 section SHALL display all tool marketplaces (local + remote) as a grid of visually distinct cards.

#### Scenario: Local market card always present
- **WHEN** the page renders
- **THEN** a "本地商城" (Local Market) card SHALL always be displayed as the first card in the grid

#### Scenario: Remote market cards displayed
- **WHEN** remote marketplace sources are configured
- **THEN** each remote source SHALL be rendered as a marketplace card in the grid alongside the local market card

#### Scenario: Add remote market action
- **WHEN** user clicks the "新增远程商城" (Add Remote Market) button in the toolbar
- **THEN** a dialog SHALL open for entering the remote source name, URL, and authentication details

### Requirement: Local market inline view
Clicking the local market card SHALL navigate to an inline detail view showing all built-in and custom tools.

#### Scenario: View built-in tools
- **WHEN** user enters the local market detail view
- **THEN** built-in tools SHALL be displayed as read-only cards showing tool name, description, and a "内置" badge

#### Scenario: View custom tools
- **WHEN** user enters the local market detail view
- **THEN** custom tools SHALL be displayed as editable cards with enable/disable toggle, edit, and delete actions

#### Scenario: Add custom tool restricted to local market
- **WHEN** user is in the local market detail view
- **THEN** an "新增工具" (Add Tool) button SHALL be visible and functional

#### Scenario: Add custom tool NOT available in remote markets
- **WHEN** user is in a remote market detail view
- **THEN** the "新增工具" (Add Tool) button SHALL NOT be visible

#### Scenario: Breadcrumb navigation back
- **WHEN** user is in any market detail view
- **THEN** a back button or breadcrumb SHALL allow returning to the market card grid

### Requirement: Remote market inline view
Clicking a remote market card SHALL navigate to an inline detail view showing tools available from that remote source.

#### Scenario: Browse remote tools
- **WHEN** user enters a remote market detail view
- **THEN** tools from the remote source SHALL be displayed with name, description, and an "安装到本地" (Install) button

#### Scenario: Install tool from remote market
- **WHEN** user clicks "安装到本地" on a remote tool
- **THEN** the tool SHALL be installed as a local custom tool with `source: 'remote'` and appear in the local market

#### Scenario: Remote source management
- **WHEN** user is in a remote market detail view
- **THEN** options to test connection and delete the remote source SHALL be available

### Requirement: Visual design consistency
The redesigned page SHALL maintain visual consistency with the existing design system using glassmorphism cards, consistent spacing, and Element Plus components.

#### Scenario: Glass-morphism card styling
- **WHEN** market cards and tool cards are rendered
- **THEN** they SHALL use `--glass-bg`, `--glass-border`, and `--glass-filter` CSS variables

#### Scenario: Responsive card grid
- **WHEN** the viewport width changes
- **THEN** the card grid SHALL use `grid-template-columns: repeat(auto-fill, minmax(…) )` to adapt column count
