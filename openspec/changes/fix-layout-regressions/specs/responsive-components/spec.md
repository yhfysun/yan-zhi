## MODIFIED Requirements

### Requirement: FAB buttons must only appear on mobile
The system SHALL render action buttons as standard text+icon buttons on desktop, transforming them into FAB (Floating Action Button) circles only via `@media (max-width: 767px)`.

#### Scenario: Desktop buttons with text
- **WHEN** viewport is ≥768px
- **THEN** primary action buttons show both icon and text label, with standard rectangular shape

#### Scenario: Mobile FAB circle buttons
- **WHEN** viewport is less than 768px
- **THEN** buttons with `.fab-add` class become fixed-position 48px circles at `bottom: 72px; right: 16px`

### Requirement: Dialog full-width must be selective
The system SHALL only apply full-width dialog styling to content-heavy dialogs (mount-dialog, skill-mount-dialog, snapshot-dialog, agent-edit-dialog), not to confirm/alert dialogs.

#### Scenario: Large dialog full-width on mobile
- **WHEN** viewport is less than 768px AND a dialog with class `mount-dialog`/`skill-mount-dialog`/`snapshot-dialog`/`agent-edit-dialog` opens
- **THEN** the dialog is full-width (92-95vw) with bottom-sheet styling

#### Scenario: Confirm dialog normal width on mobile
- **WHEN** viewport is less than 768px AND a plain `el-dialog` (confirm/alert) opens without the listed classes
- **THEN** the dialog retains its default width and centered position

### Requirement: Grid card columns must be appropriately wide on desktop
The system SHALL use `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))` for card grids on desktop, avoiding overly narrow cards.

#### Scenario: Desktop card grid
- **WHEN** viewport is ≥768px
- **THEN** each card in the grid is at least 320px wide, fitting 2-3 columns comfortably
