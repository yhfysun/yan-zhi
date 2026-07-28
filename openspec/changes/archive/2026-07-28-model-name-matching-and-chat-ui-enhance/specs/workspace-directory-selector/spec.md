## ADDED Requirements

### Requirement: Workspace directory selector icon in chat input toolbar
The chat input toolbar SHALL include a workspace directory selector icon that displays the current working directory and allows users to change it.

#### Scenario: Icon displays current working directory
- **WHEN** the chat input toolbar is rendered
- **THEN** a folder icon with the current working directory path (or a short label) SHALL be visible in the toolbar-center area

#### Scenario: Clicking workspace directory icon opens directory browser
- **WHEN** user clicks the workspace directory icon
- **THEN** a dialog SHALL open showing a file system tree browser

#### Scenario: Directory browser shows file system structure
- **WHEN** the directory browser dialog is open
- **THEN** it SHALL display the current working directory's contents as a navigable tree
- **AND** directories SHALL be expandable/collapsible
- **AND** each entry SHALL show its name and a folder/file icon

#### Scenario: Navigating to parent directory
- **WHEN** user clicks a "parent directory" entry or navigation button
- **THEN** the browser SHALL navigate up one level in the filesystem hierarchy

#### Scenario: Selecting a directory
- **WHEN** user clicks on a directory entry to select it
- **AND** clicks a "confirm" or "select" button
- **THEN** the selected directory path SHALL be set as the new working directory
- **AND** the dialog SHALL close
- **AND** the working directory SHALL be persisted to keyring settings

#### Scenario: Persisting workspace directory
- **WHEN** the user changes the working directory
- **THEN** the new path SHALL be saved via `adapter.keyring.set('settings:workspaceDir', path)`
- **AND** on next page load, the saved path SHALL be restored

#### Scenario: No directory selected
- **WHEN** the workspace directory has not been set (first time use)
- **THEN** a default path (e.g., user's home directory or a default workspace folder) SHALL be used
- **AND** the icon SHALL display a placeholder label indicating no directory is set
