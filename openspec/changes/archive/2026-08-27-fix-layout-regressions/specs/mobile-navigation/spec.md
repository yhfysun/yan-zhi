## MODIFIED Requirements

### Requirement: TopBar must not duplicate Chat page header
The system SHALL hide the mobile TopBar when the current route is `chat`, since Chat.vue provides its own `chat-topbar` with hamburger menu and title.

#### Scenario: Chat page no TopBar
- **WHEN** viewport is less than 768px AND current route is `/chat`
- **THEN** the `.mobile-topbar` element is not rendered

#### Scenario: Non-chat pages show TopBar
- **WHEN** viewport is less than 768px AND current route is NOT `/chat`
- **THEN** the `.mobile-topbar` element is visible with page title

### Requirement: TabBar must not overlap with page content
The system SHALL ensure all page content has bottom padding at least equal to TabBar height (56px) plus safe-area inset on mobile.

#### Scenario: Page content clears TabBar
- **WHEN** viewport is less than 768px
- **THEN** `.main-content` has `padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px))`
