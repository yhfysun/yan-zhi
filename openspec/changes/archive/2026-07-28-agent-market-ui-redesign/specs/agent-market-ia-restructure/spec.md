## ADDED Requirements

### Requirement: Page shows marketplace cards as default entry
The Agents page SHALL display a marketplace cards grid as the default view, showing the "Local Agent Marketplace" card and all configured remote marketplace cards.

#### Scenario: Default page load
- **WHEN** user navigates to `/agents`
- **THEN** the page displays a grid of marketplace cards including the "Local Agent Marketplace" card

#### Scenario: Remote marketplace cards
- **WHEN** remote agent marketplace sources are configured
- **THEN** each remote source is displayed as a separate marketplace card alongside the local card

#### Scenario: No tabs present
- **WHEN** the Agents page is rendered
- **THEN** no `el-tabs` component is visible for switching between local and remote views

### Requirement: Local marketplace card navigates to all agents
The system SHALL provide a "Local Agent Marketplace" card that, when clicked, navigates to a view displaying all built-in agents and custom agents.

#### Scenario: Click local marketplace card
- **WHEN** user clicks the "Local Agent Marketplace" card
- **THEN** the view transitions to display all built-in and custom agents in a card grid

#### Scenario: Create agent button only in local view
- **WHEN** user is viewing the local agents list
- **THEN** a "Create Agent" button is visible in the header
- **WHEN** user is viewing any other view (marketplace cards, remote agents)
- **THEN** the "Create Agent" button is NOT visible

### Requirement: Remote marketplace cards support management
Each remote marketplace card SHALL display the source name, URL, and provide actions to browse, test, or delete the remote source.

#### Scenario: Remote card actions
- **WHEN** user sees a remote marketplace card
- **THEN** the card displays the source name, base URL (in monospace font), and action buttons for browse, test, and delete

#### Scenario: Click remote marketplace card to browse
- **WHEN** user clicks a remote marketplace card
- **THEN** the view transitions to display agents from that remote source

### Requirement: Add remote marketplace entry card
The marketplace cards grid SHALL include an "Add Remote Marketplace" entry card with dashed/outline styling and a plus icon.

#### Scenario: Add remote marketplace
- **WHEN** user clicks the "Add Remote Marketplace" card
- **THEN** a dialog opens with form fields for name, URL, and authentication settings

#### Scenario: Save new remote source
- **WHEN** user fills in the remote source form and clicks save
- **THEN** the remote source is persisted and a new marketplace card appears in the grid

### Requirement: Back navigation from agent list views
Both the local agents view and remote agents view SHALL provide a back button to return to the marketplace cards grid.

#### Scenario: Back from local agents
- **WHEN** user is viewing the local agents list
- **THEN** a back button is visible in the header that returns to the marketplace cards view

#### Scenario: Back from remote agents
- **WHEN** user is viewing a remote source's agents
- **THEN** a back button is visible in the header that returns to the marketplace cards view

### Requirement: Visual consistency with other marketplace pages
The Agents page SHALL use glass-card styling, rounded tags, and spacing consistent with the redesigned `ToolMarket.vue` and `Skills.vue` pages.

#### Scenario: Glass card styling
- **WHEN** the Agents page renders marketplace cards or agent cards
- **THEN** each card uses `var(--glass-bg)` background, `var(--glass-filter)` backdrop filter, and `var(--radius-md)` border radius

#### Scenario: Hover effect
- **WHEN** user hovers over a marketplace card or agent card
- **THEN** the card translates up by 2px with an enhanced shadow transition
