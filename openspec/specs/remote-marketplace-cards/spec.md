# Remote Marketplace Cards Specification

## Purpose

定义 Skill 商城首页对远程商城源的卡片展示、添加、删除、连接测试和浏览导航行为。

## Requirements

### Requirement: Remote marketplace cards on home page
每个远程商城源 SHALL 以独立卡片形式展示在 Skill 商城首页。

#### Scenario: Display remote marketplace cards
- **WHEN** 用户访问商城首页且存在远程商城源
- **THEN** 每个源显示为独立卡片，包含名称和 URL

#### Scenario: No remote marketplaces
- **WHEN** 首页没有远程商城源
- **THEN** 显示空状态提示并引导添加远程商城

### Requirement: Add and delete remote marketplace
商城首页 SHALL 提供添加远程商城卡片，并支持从首页删除远程源。

#### Scenario: Add remote marketplace
- **WHEN** 用户点击添加卡片并填写名称、URL 和认证方式
- **THEN** 系统保存远程源并刷新卡片网格

#### Scenario: Delete remote source
- **WHEN** 用户点击远程卡片上的删除并确认
- **THEN** 系统移除远程源

### Requirement: Browse and test remote marketplace
用户 SHALL 能点击远程商城卡片浏览其 Skill，并测试远程源的连接状态。

#### Scenario: Browse remote skills
- **WHEN** 用户点击远程商城卡片
- **THEN** 系统导航到 `/skills/remote-{sourceId}` 并展示该源 Skill 列表

#### Scenario: Test connection
- **WHEN** 用户点击测试按钮
- **THEN** 系统发送测试请求并显示成功或失败结果
