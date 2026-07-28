## ADDED Requirements

### Requirement: Local marketplace skill list
本地商城内部页面 SHALL 展示内置 Skill 和用户自定义 Skill 的合并列表，以卡片或网格形式呈现。

#### Scenario: View local marketplace
- **WHEN** 用户导航到 `/skills/local`
- **THEN** 系统显示所有内置 Skill 和自定义 Skill，每项展示名称、描述、启用状态

#### Scenario: Distinguish built-in vs custom skills
- **WHEN** 本地商城 Skill 列表渲染
- **THEN** 内置 Skill 和自定义 Skill 通过来源标签区分（商店/自建）

### Requirement: Create custom skill
本地商城页面 SHALL 在顶部工具栏提供"新建 Skill"按钮，允许用户创建自定义 Skill。

#### Scenario: Create new skill button visible
- **WHEN** 用户在本地商城页面
- **THEN** 页面顶部显示"新建"按钮

#### Scenario: Create new skill
- **WHEN** 用户点击"新建"按钮并填写名称、描述、触发词、内容后保存
- **THEN** 系统创建自定义 Skill 并刷新列表

#### Scenario: Create button not in remote marketplace
- **WHEN** 用户在远程商城页面
- **THEN** 不显示"新建 Skill"按钮

### Requirement: Edit custom skill
本地商城页面 SHALL 允许用户编辑已创建的自定义 Skill。

#### Scenario: Edit custom skill
- **WHEN** 用户点击自定义 Skill 的"编辑"按钮
- **THEN** 系统打开编辑弹窗，预填充现有内容，保存后更新 Skill

#### Scenario: Cannot edit built-in skill
- **WHEN** 用户查看内置 Skill
- **THEN** 不显示"编辑"按钮

### Requirement: Delete custom skill
本地商城页面 SHALL 允许用户删除自定义 Skill。

#### Scenario: Delete custom skill with confirmation
- **WHEN** 用户点击自定义 Skill 的"删除"按钮
- **THEN** 系统弹出确认对话框，确认后删除该 Skill

### Requirement: Import and export skills
本地商城页面 SHALL 支持从 Markdown 导入 Skill 和导出 Skill 为 Markdown 文件。

#### Scenario: Import skill from markdown
- **WHEN** 用户点击"导入"并粘贴 Markdown 内容
- **THEN** 系统解析 frontmatter 并创建新 Skill

#### Scenario: Export skill to markdown
- **WHEN** 用户点击 Skill 的"导出"按钮
- **THEN** 系统下载包含完整 frontmatter 的 .md 文件

### Requirement: Navigate back to marketplace home
本地商城页面 SHALL 提供返回按钮，允许用户回到商城首页。

#### Scenario: Back to marketplace home
- **WHEN** 用户在本地商城页面点击"返回"按钮
- **THEN** 系统导航到 `/skills` 商城首页
