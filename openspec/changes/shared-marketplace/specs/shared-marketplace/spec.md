# shared-marketplace Specification

## Purpose

该能力把 Skills、Tools、Agents 三个市场的公共界面壳抽取为共享组件，减少重复与风格漂移。

## ADDED Requirements

### Requirement: Shared marketplace shell

The system SHALL provide a `MarketplaceShell` component with unified search, category tabs, source switching, content slot, and empty state.

#### Scenario: Page uses shared shell

- **WHEN** Skills, Tools, or Agents marketplace renders
- **THEN** the page uses `MarketplaceShell` for shared layout and keeps its own data source and actions

### Requirement: Shared marketplace card

The system SHALL provide a `MarketplaceCard` component for consistent icon, title, description, tags, stats, and action area rendering.

#### Scenario: Marketplace card rendering

- **WHEN** a marketplace item is rendered
- **THEN** the card visual and action area follow the shared component

### Requirement: Unified marketplace states

The system SHALL use unified loading, empty, and error states across Skills, Tools, and Agents marketplaces.

#### Scenario: Empty state

- **WHEN** a marketplace has no items
- **THEN** it shows the shared empty state rather than a page-specific duplicate
