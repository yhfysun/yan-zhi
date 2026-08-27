# ui-consolidation Specification

## Purpose

该能力固化 yan-zhi 三端统一导航与响应式布局规则，作为后续组件拆分和市场页面的布局基线。

## ADDED Requirements

### Requirement: Stable three-platform navigation shape

The system SHALL use a collapsible labeled left sidebar on Electron desktop, a 52px icon dock on wide Web viewports, and a bottom TabBar on mobile.

#### Scenario: Electron desktop navigation

- **WHEN** the app runs on Electron with viewport width >= 768px
- **THEN** the left sidebar is labeled, collapsible, and does not render a top-right menu-only navigation

#### Scenario: Wide web navigation

- **WHEN** the app runs on the Web platform with viewport width >= 768px
- **THEN** the left navigation is a 52px icon dock

#### Scenario: Mobile navigation

- **WHEN** viewport width is less than 768px
- **THEN** navigation renders as a fixed bottom TabBar and the App-level mobile topbar is hidden on the chat route

### Requirement: Desktop action buttons keep text labels

The system SHALL render primary action buttons with both icon and text on desktop, transforming them into floating action buttons only on mobile.

#### Scenario: Desktop primary action button

- **WHEN** viewport width is >= 768px
- **THEN** primary add buttons show a text label and normal rectangular shape

#### Scenario: Mobile floating action button

- **WHEN** viewport width is less than 768px and a button has the `fab-add` class
- **THEN** the button becomes a fixed 48px circle above the bottom TabBar

### Requirement: Web-wide content spacing is symmetric

The system SHALL keep a 52px left offset and a 52px right padding on the wide Web main content area so page padding is visually balanced around the icon dock.

#### Scenario: Wide web content spacing

- **WHEN** viewport width is >= 768px on the Web platform
- **THEN** `.main-content` has both a 52px left offset and 52px right padding

### Requirement: Full-width dialogs are selective on mobile

The system SHALL force full width only for content-heavy dialogs marked `mount-dialog`, `skill-mount-dialog`, `snapshot-dialog`, or `agent-edit-dialog`; ordinary dialogs retain default width.

#### Scenario: Content-heavy dialog on mobile

- **WHEN** viewport width is less than 768px and a dialog has one of the content-heavy classes
- **THEN** the dialog spans 92vw

#### Scenario: Ordinary dialog on mobile

- **WHEN** viewport width is less than 768px and a dialog lacks those classes
- **THEN** the dialog uses its configured width and remains centered

### Requirement: Desktop card grids are not overly narrow

The system SHALL use at least 320px minimum card width on desktop card grids.

#### Scenario: Tool market card grid

- **WHEN** viewport width is >= 768px
- **THEN** tool market card grid uses `minmax(320px, 1fr)` or wider
