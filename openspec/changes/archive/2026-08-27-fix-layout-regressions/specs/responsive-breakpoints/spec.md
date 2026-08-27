## MODIFIED Requirements

### Requirement: Desktop layout preserves side-nav spacing
The system SHALL maintain `margin-left: 52px` on `.main-content` for desktop (≥768px) to accommodate the fixed left sidebar navigation.

#### Scenario: Desktop main content offset
- **WHEN** viewport width is 768px or greater
- **THEN** `.main-content` has `margin-left: 52px` and no extra `padding-top`

### Requirement: Mobile layout uses safe-area-aware spacing
The system SHALL use `padding-top` and `padding-bottom` with `env(safe-area-inset-*)` for mobile layout instead of `margin-left`.

#### Scenario: Mobile main content spacing
- **WHEN** viewport width is less than 768px
- **THEN** `.main-content` has `margin-left: 0`, `padding-top: 0` (or 48px if topbar is visible), and `padding-bottom: calc(56px + env(safe-area-inset-bottom, 0px))`

### Requirement: Fluid spacing must not create left-right asymmetry on desktop
The system SHALL ensure `.page` padding results in visually symmetric spacing on desktop, accounting for the 52px side-nav margin.

#### Scenario: Desktop page padding symmetry
- **WHEN** viewport is ≥768px
- **THEN** `.page` left and right padding values produce balanced visual margins
