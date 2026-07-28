## ADDED Requirements

### Requirement: Remote marketplace cards on home page
每个远程商城源 SHALL 以独立卡片形式展示在商城首页。

#### Scenario: Display remote marketplace cards
- **WHEN** 用户访问商城首页且有已添加的远程商城源
- **THEN** 每个远程源显示为独立卡片，包含名称和 URL

#### Scenario: No remote marketplaces
- **WHEN** 用户访问商城首页且没有任何远程商城源
- **THEN** 显示空状态提示，引导用户添加远程商城

### Requirement: Add remote marketplace
商城首页 SHALL 提供"添加远程商城"功能，以卡片或按钮形式呈现。

#### Scenario: Add remote marketplace card
- **WHEN** 用户在商城首页
- **THEN** 网格末尾显示"添加远程商城"操作卡片（虚线边框，带 + 图标）

#### Scenario: Add remote marketplace dialog
- **WHEN** 用户点击"添加远程商城"卡片
- **THEN** 系统弹出表单，要求填写名称、URL 和认证方式

#### Scenario: Save new remote source
- **WHEN** 用户填写完整信息并提交
- **THEN** 系统保存远程源，首页卡片网格自动刷新

### Requirement: Delete remote marketplace
用户 SHALL 能够从首页删除远程商城卡片。

#### Scenario: Delete remote source
- **WHEN** 用户点击远程商城卡片上的删除按钮并确认
- **THEN** 系统移除该远程源，卡片从首页消失

### Requirement: Browse remote marketplace skills
用户 SHALL 能够点击远程商城卡片进入该源的 Skill 浏览页面。

#### Scenario: Browse remote skills
- **WHEN** 用户点击远程商城卡片
- **THEN** 系统导航到 `/skills/remote-{sourceId}`，获取并显示该源的 Skill 列表

#### Scenario: Install remote skill
- **WHEN** 用户在远程商城页面点击 Skill 的"安装到本地"按钮
- **THEN** 系统将远程 Skill 安装到本地 Skill 列表

### Requirement: Test remote marketplace connection
用户 SHALL 能够测试远程商城源的连接状态。

#### Scenario: Test connection success
- **WHEN** 用户点击远程商城卡片上的"测试"按钮
- **THEN** 系统发送测试请求并显示连接成功或失败的结果

### Requirement: Navigate back from remote marketplace
远程商城页面 SHALL 提供返回按钮回到商城首页。

#### Scenario: Back to marketplace home
- **WHEN** 用户在远程商城页面点击"返回"按钮
- **THEN** 系统导航到 `/skills` 商城首页
