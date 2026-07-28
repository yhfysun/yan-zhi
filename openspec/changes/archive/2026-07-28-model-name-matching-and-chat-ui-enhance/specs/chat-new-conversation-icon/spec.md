## ADDED Requirements

### Requirement: New conversation icon in chat input toolbar
The chat input toolbar SHALL include a "new conversation" icon button that allows users to start a fresh conversation without navigating to the sidebar.

#### Scenario: Clicking new conversation icon
- **WHEN** user clicks the "new conversation" icon (Plus icon) in the chat input toolbar-right area
- **THEN** the system SHALL call `startNewChat()` to clear the current conversation state
- **AND** the input area SHALL be ready for a new message

#### Scenario: Icon placement
- **WHEN** the chat input toolbar is rendered
- **THEN** the new conversation icon SHALL appear in the `toolbar-right` section, to the left of the send button
- **AND** the icon SHALL use the `Plus` icon from Element Plus

#### Scenario: Icon tooltip
- **WHEN** user hovers over the new conversation icon
- **THEN** a tooltip with "新建会话" text SHALL be displayed
