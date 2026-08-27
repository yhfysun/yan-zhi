# Custom Tool Protocol Specification

## Purpose

定义自定义工具的协议结构、Node.js 沙箱执行规则，以及 Python/Java 等跨语言运行时扩展协议。

## Requirements

### Requirement: 自定义工具协议定义
系统 SHALL 定义 CustomTool 数据结构，包含名称、描述、输入/输出 JSON Schema、运行时类型、入口函数和源代码。

#### Scenario: 定义 Node.js 运行时工具
- **WHEN** 工具 runtime 为 node
- **THEN** 系统使用 Node.js 沙箱执行该工具的 code

#### Scenario: 预留 Python 运行时
- **WHEN** 工具 runtime 为 python
- **THEN** 系统识别该类型，协议层通过但执行时返回运行时暂不支持

### Requirement: JS 代码沙箱执行
系统 SHALL 在隔离的 Node.js VM 环境中执行自定义工具代码，并限制危险操作。

#### Scenario: 正常执行自定义工具
- **WHEN** LLM 调用已启用的自定义工具
- **THEN** 系统在沙箱中执行代码并返回结果

#### Scenario: 禁止危险操作
- **WHEN** 工具代码尝试访问文件系统、网络或进程
- **THEN** 沙箱阻止操作并返回权限拒绝错误

### Requirement: 跨语言运行时扩展协议
系统 SHALL 定义统一的 CustomTool 接口协议，使 Python 和 Java 工具可通过标准化子进程 JSON-RPC 接入。

#### Scenario: 注册多语言工具
- **WHEN** 用户按协议提交 Python 或 Java 工具定义
- **THEN** 系统存储工具定义并通过对应运行时适配器处理
