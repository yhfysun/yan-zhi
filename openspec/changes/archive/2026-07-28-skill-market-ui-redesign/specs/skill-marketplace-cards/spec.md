## ADDED Requirements

### Requirement: Marketplace card grid layout
The Skill 商城首页 SHALL 使用卡片网格布局展示所有可用商城，替代原有的 Tab 切换方式。

#### Scenario: User visits skill marketplace
- **WHEN** 用户导航到 `/skills` 路由
- **THEN** 系统显示卡片网格布局，包含本地商城卡片和所有远程商城卡片

#### Scenario: Cards display marketplace metadata
- **WHEN** 商城首页加载完成
- **THEN** 每张商城卡片展示商城名称、类型标识（本地/远程）和 Skill 数量

### Requirement: Local marketplace card
本地商城卡片 SHALL 始终显示在商城首页第一位，并使用视觉差异化标识为默认商城。

#### Scenario: Local card position
- **WHEN** 用户访问商城首页
- **THEN** 本地商城卡片显示在网格布局的第一个位置

#### Scenario: Local card visual distinction
- **WHEN** 商城首页渲染完成
- **THEN** 本地商城卡片使用强调色边框或图标区分于远程商城卡片

### Requirement: Click card to enter marketplace
用户 SHALL 能够点击任意商城卡片进入该商城的 Skill 列表页面。

#### Scenario: Click local marketplace card
- **WHEN** 用户点击本地商城卡片
- **THEN** 系统导航到 `/skills/local` 并展示本地商城的 Skill 列表

#### Scenario: Click remote marketplace card
- **WHEN** 用户点击远程商城卡片
- **THEN** 系统导航到 `/skills/remote-{sourceId}` 并展示该远程商城的 Skill 列表
