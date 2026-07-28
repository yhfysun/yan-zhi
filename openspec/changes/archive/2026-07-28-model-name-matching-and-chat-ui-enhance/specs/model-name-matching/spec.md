## ADDED Requirements

### Requirement: Model fetch deduplicates by modelId
The system SHALL use `modelId` (the API provider's model name string, e.g. `gpt-4o-mini`) as the logical unique key when fetching remote models, rather than generating a new internal ID for each fetch.

#### Scenario: Remote model already exists locally
- **WHEN** `fetchRemoteModels` is called and a remote model `gpt-4o-mini` is returned by the API
- **AND** a local model with `modelId === "gpt-4o-mini"` already exists under the same platform
- **THEN** the existing model SHALL be updated (type, enabled flag) while retaining its original internal `id`
- **AND** no duplicate record SHALL be created

#### Scenario: Remote model does not exist locally
- **WHEN** `fetchRemoteModels` is called and a remote model `claude-opus-4` is returned by the API
- **AND** no local model with `modelId === "claude-opus-4"` exists under the same platform
- **THEN** a NEW model record SHALL be created with a fresh internal `id`

#### Scenario: Local model no longer exists on remote
- **WHEN** `fetchRemoteModels` is called and a local model has `modelId` that does NOT appear in the remote list
- **THEN** that local model SHALL be disabled (`enabled = 0`)

#### Scenario: Dedup on same fetch batch
- **WHEN** the remote API returns multiple entries with the same `modelId` (edge case)
- **THEN** only the first occurrence SHALL be kept; subsequent duplicates SHALL be ignored

### Requirement: Conversation stores model reference by modelId string
Conversation records SHALL store the model's `modelId` string (the provider name) rather than the internal database `id`.

#### Scenario: Creating a conversation with a model
- **WHEN** a new conversation is created with a model whose `modelId` is `gpt-4o-mini`
- **THEN** the conversation's `model_id` column SHALL contain `"gpt-4o-mini"` (the model name)

#### Scenario: Loading an existing conversation
- **WHEN** an existing conversation's `model_id` field is read
- **THEN** the chat view SHALL find the matching model by searching `platformStore.models` for a model with matching `modelId` AND matching `platformId`

#### Scenario: Legacy conversation with internal-id in model_id
- **WHEN** an existing conversation has `model_id` stored as an internal ID (e.g. `m_abc123`) from before this change
- **THEN** the system SHALL first attempt to find a model by `modelId` exact match
- **AND** if no match is found, SHALL fall back to finding a model by internal `id` match
- **AND** once found, the conversation record SHALL be migrated to store the `modelId` string instead
