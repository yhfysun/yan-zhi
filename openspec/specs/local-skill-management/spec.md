# Local Skill Management Specification

## Purpose

定义本地 Skill 商城中内置与自定义 Skill 的列表、创建、编辑、删除以及 Markdown 导入导出行为。

## Requirements

### Requirement: Local marketplace skill list
本地商城内部页面 SHALL 展示内置 Skill 和用户自定义 Skill 的合并列表。

#### Scenario: View local marketplace
- **WHEN** 用户导航到 `/skills/local`
- **THEN** 系统显示所有内置与自定义 Skill，并展示名称、描述和启用状态

#### Scenario: Distinguish built-in vs custom skills
- **WHEN** 本地 Skill 列表渲染
- **THEN** 内置 Skill 与自定义 Skill 通过来源标签区分

### Requirement: Create custom skill
本地商城页面 SHALL 在顶部工具栏提供“新建 Skill”按钮。

#### Scenario: Create new skill
- **WHEN** 用户点击“新建”并填写名称、描述、触发词和内容后保存
- **THEN** 系统创建自定义 Skill 并刷新列表

### Requirement: Edit and delete custom skills
本地商城页面 SHALL 允许编辑和删除用户创建的自定义 Skill。

#### Scenario: Edit custom skill
- **WHEN** 用户点击自定义 Skill 的编辑按钮
- **THEN** 系统打开预填充编辑弹窗，保存后更新 Skill

#### Scenario: Delete custom skill
- **WHEN** 用户点击删除按钮并确认
- **THEN** 系统删除该 Skill

### Requirement: Import and export skills
本地商城页面 SHALL 支持从 Markdown 导入 Skill 和导出 Skill 为 Markdown 文件。

#### Scenario: Import skill from markdown
- **WHEN** 用户点击导入并粘贴 Markdown 内容
- **THEN** 系统解析 frontmatter 并创建新 Skill

#### Scenario: Export skill to markdown
- **WHEN** 用户点击 Skill 的导出按钮
- **THEN** 系统下载包含完整 frontmatter 的 .md 文件
