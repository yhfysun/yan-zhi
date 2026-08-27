# decompose-chat-view Specification

## Purpose

该能力定义 Chat 页拆分的组件边界与等价性约束，避免巨页继续膨胀。

## ADDED Requirements

### Requirement: Chat view decomposes by functional boundary

The system SHALL split `Chat.vue` into conversation list, agent picker, file panel, file manager modal, preview pane, and skill cards components while preserving existing behavior.

#### Scenario: Component boundaries exist

- **WHEN** the chat page renders
- **THEN** each extracted area is implemented by its own component under `components/chat/`

### Requirement: Chat core file stays maintainable

The system SHALL keep `Chat.vue` below 600 lines by moving reusable logic into composables.

#### Scenario: Main file size

- **WHEN** the refactor is complete
- **THEN** `Chat.vue` contains only orchestration, message flow, and input bar concerns

### Requirement: Chat interactions remain equivalent

The system SHALL preserve conversation switching, batch deletion, space selection, file upload/preview/delete, skill mounting, send, stop, regenerate, copy, edit, and delete interactions after decomposition.

#### Scenario: Browser regression

- **WHEN** an extracted interaction is exercised in the browser
- **THEN** its observable behavior matches the pre-refactor behavior
