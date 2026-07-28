## ADDED Requirements

### Requirement: 自定义工具协议定义
系统 SHALL 定义 CustomTool 数据结构，包含名称、描述、入参/出参 JSON Schema、运行时类型、入口函数、源代码等字段。

#### Scenario: 定义 Node.js 运行时工具
- **WHEN** 工具 runtime 字段为 "node"
- **THEN** 系统使用 Node.js 沙箱执行该工具的 code 字段内容

#### Scenario: 定义 Python 运行时工具（协议预留）
- **WHEN** 工具 runtime 字段为 "python"
- **THEN** 系统识别该运行时类型，协议层通过但执行时返回"运行时暂不支持"（首版）

#### Scenario: 定义 Java 运行时工具（协议预留）
- **WHEN** 工具 runtime 字段为 "java"
- **THEN** 系统识别该运行时类型，协议层通过但执行时返回"运行时暂不支持"（首版）

### Requirement: JS 代码沙箱执行
系统 SHALL 在隔离的 Node.js VM 环境中执行自定义工具代码，限制危险操作。

#### Scenario: 正常执行自定义工具
- **WHEN** LLM 调用某个启用的自定义工具
- **THEN** 系统在沙箱中执行代码，传入 LLM 提供的 args 参数，返回执行结果

#### Scenario: 执行超时
- **WHEN** 自定义工具代码执行时间超过配置的 timeout（默认 30s）
- **THEN** 系统终止执行并返回超时错误

#### Scenario: 代码抛出异常
- **WHEN** 自定义工具代码在执行中抛出异常
- **THEN** 系统捕获异常并返回包含错误信息的 ToolResult，isError 标记为 true

#### Scenario: 禁止危险操作
- **WHEN** 自定义工具代码尝试访问文件系统、网络或进程
- **THEN** 沙箱阻止该操作并返回权限拒绝错误

### Requirement: 跨语言运行时扩展协议
系统 SHALL 定义统一的 CustomTool 接口协议，使 Python/Java 工具可通过标准化子进程 JSON-RPC 通信接入。

#### Scenario: 注册多语言工具
- **WHEN** 用户按 CustomTool 协议格式提交 Python 或 Java 工具定义
- **THEN** 系统存储工具定义，并在执行时通过对应运行时适配器处理
