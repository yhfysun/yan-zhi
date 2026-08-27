# Workspace Directory Selector Specification

## Purpose

定义聊天输入工具栏中的工作目录选择入口，让用户查看当前工作目录并通过文件系统树切换和持久化目录。

## Requirements

### Requirement: Workspace directory selector icon in chat input toolbar
The chat input toolbar SHALL include a workspace directory selector icon that displays the current directory and allows changing it.

#### Scenario: Icon displays current working directory
- **WHEN** 聊天输入工具栏渲染
- **THEN** 工具栏中央显示带当前目录路径的文件夹图标

#### Scenario: Clicking workspace directory icon opens directory browser
- **WHEN** 用户点击工作目录图标
- **THEN** 打开文件系统树浏览对话框

### Requirement: Directory browser navigation and selection
目录浏览器 SHALL 展示当前目录内容，支持进入父目录并选择新工作目录。

#### Scenario: Selecting a directory
- **WHEN** 用户选择目录并确认
- **THEN** 所选路径成为新工作目录并保存到 keyring 设置

#### Scenario: No directory selected
- **WHEN** 工作目录尚未设置
- **THEN** 使用默认路径并显示占位标签
