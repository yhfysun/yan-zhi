# Model Name Matching Specification

## Purpose

定义远程模型同步时使用 `modelId` 作为逻辑唯一键去重，以及会话记录通过 `modelId` 引用模型并兼容旧数据的行为。

## Requirements

### Requirement: Model fetch deduplicates by modelId
The system SHALL use `modelId` as the logical unique key when fetching remote models.

#### Scenario: Remote model already exists locally
- **WHEN** `fetchRemoteModels` 返回已在同一平台存在的 `modelId`
- **THEN** 系统更新现有模型并保留其内部 id，不创建重复记录

#### Scenario: Remote model does not exist locally
- **WHEN** 远程返回新的 `modelId`
- **THEN** 系统创建新模型记录

### Requirement: Conversation stores model reference by modelId string
Conversation records SHALL store the provider model name instead of the internal database id.

#### Scenario: Creating a conversation with a model
- **WHEN** 新会话使用 modelId 为 `gpt-4o-mini` 的模型
- **THEN** 会话的 model_id 列存储 `"gpt-4o-mini"`

### Requirement: Legacy conversation fallback
The system SHALL migrate legacy conversation model references to `modelId` strings when they are first resolved.

#### Scenario: Legacy conversation with internal-id
- **WHEN** 会话 model_id 存储的是旧的内部 id
- **THEN** 系统先按 modelId 精确查找，失败后回退到内部 id 查找，并迁移该记录
