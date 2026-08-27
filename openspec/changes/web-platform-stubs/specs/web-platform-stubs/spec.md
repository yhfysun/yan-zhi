# web-platform-stubs Specification

## Purpose

该能力要求平台边界处的未完成实现要么补全，要么显式降级，禁止静默吞错或裸 throw。

## ADDED Requirements

### Requirement: Web filesystem degrades explicitly

The system SHALL implement Web file access through File System Access API or IndexedDB, and return an explicit `NotSupportedError` with actionable guidance when the environment cannot support it.

#### Scenario: Supported browser file access

- **WHEN** the browser supports File System Access API and the user grants access
- **THEN** file read, write, existence, directory creation, and directory listing work through the selected handle

#### Scenario: Unsupported browser file access

- **WHEN** the browser does not support File System Access API and no IndexedDB fallback is available
- **THEN** the adapter returns an explicit unsupported error instead of an unqualified runtime error

### Requirement: Web database rejects unsupported SQL

The system SHALL return an explicit failure for unsupported SQL instead of silently ignoring it.

#### Scenario: Unsupported SQL

- **WHEN** a Web database receives a non-DDL SQL statement outside the supported subset
- **THEN** the operation returns an explicit error and logs a structured capability warning

### Requirement: MCP stdio capability is truthful

The system SHALL either implement JSON-RPC over stdio or advertise stdio as unsupported and disable it in the UI.

#### Scenario: Unsupported stdio transport

- **WHEN** the desktop MCP command does not implement stdio protocol
- **THEN** the UI disables the stdio transport option and explains that only SSE/HTTP are supported

### Requirement: Server API tools expose explicit capability

The system SHALL list only implemented `api_*` tools to agents, returning an explicit unsupported result for unregistered names.

#### Scenario: Unregistered API tool

- **WHEN** an agent requests an `api_*` tool that is not implemented
- **THEN** the executor returns an explicit unsupported result and the configuration UI does not offer it

### Requirement: Anthropic embeddings are capability-gated

The system SHALL expose an `supportsEmbeddings` capability and hide embedding controls for Anthropic protocol platforms.

#### Scenario: Anthropic embedding controls

- **WHEN** the selected platform uses the Anthropic protocol
- **THEN** embedding-related UI controls are hidden or disabled
