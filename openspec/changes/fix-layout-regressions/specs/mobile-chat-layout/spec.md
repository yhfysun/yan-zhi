## MODIFIED Requirements

### Requirement: User and assistant message bubbles have consistent max-width
The system SHALL apply the same `max-width` to both user and assistant message blocks.

#### Scenario: Message bubble width consistency
- **WHEN** any message bubble is rendered
- **THEN** both `.msg-user .msg-block` and `.msg-assistant .msg-block` have `max-width: 90%`

### Requirement: Mobile chat page must not stack two headers
The system SHALL ensure only one header bar is visible at the top of the Chat page on mobile: the Chat page's own `chat-topbar`.

#### Scenario: Single header on mobile chat
- **WHEN** viewport is less than 768px AND route is `/chat`
- **THEN** only `chat-topbar` (with hamburger + title) is visible at the top; App-level `mobile-topbar` is hidden

### Requirement: Mobile file panel must be a bottom sheet
The system SHALL render the file management panel as a bottom sheet (slide up from bottom, 50vh height) on mobile, not as a side panel.

#### Scenario: File panel as bottom sheet
- **WHEN** viewport is less than 768px AND file panel is opened
- **THEN** the panel slides up from the bottom covering 50% of viewport height with rounded top corners
