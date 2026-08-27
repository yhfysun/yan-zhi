# merge-tools-mcp Specification

## Purpose

该能力明确 MCP 服务管理与工具商城之间的职责边界。

## ADDED Requirements

### Requirement: MCP server management has a single entry

The system SHALL expose MCP server create, edit, delete, connect, tools, resources, prompts, and logs management only on the MCP page.

#### Scenario: Tool market does not manage servers

- **WHEN** the user opens the tool market
- **THEN** the page does not expose MCP server create, edit, or delete actions

### Requirement: Tool market can reference MCP servers read-only

The system SHALL allow the tool market to display the MCP server name for a tool source without duplicating management actions.

#### Scenario: Read-only server reference

- **WHEN** a tool source is an MCP server
- **THEN** the tool card shows the server name and links to the MCP management page for changes

### Requirement: Tool source labels are unified

The system SHALL use consistent labels for builtin, custom, MCP, and Skill tool sources.

#### Scenario: Source label

- **WHEN** a tool is displayed
- **THEN** its source is shown using the unified builtin/custom/MCP/Skill label set
