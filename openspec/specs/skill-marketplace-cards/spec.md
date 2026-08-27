# Skill Marketplace Cards Specification

## Purpose

定义 Skill 商城首页的卡片网格布局，以及本地商城卡片的位置和点击进入行为。

## Requirements

### Requirement: Marketplace card grid layout
Skill 商城首页 SHALL 使用卡片网格展示本地商城和所有远程商城，替代 Tab 切换。

#### Scenario: User visits skill marketplace
- **WHEN** 用户导航到 `/skills`
- **THEN** 系统显示包含本地商城卡片和远程商城卡片的网格

#### Scenario: Cards display marketplace metadata
- **WHEN** 商城首页加载完成
- **THEN** 每张卡片展示名称、本地/远程类型和 Skill 数量

### Requirement: Local marketplace card
本地商城卡片 SHALL 始终显示在第一位，并使用视觉差异化标识为默认商城。

#### Scenario: Local card position
- **WHEN** 用户访问商城首页
- **THEN** 本地商城卡片位于网格第一个位置

### Requirement: Click card to enter marketplace
用户 SHALL 能点击任意商城卡片进入对应的 Skill 列表页面。

#### Scenario: Click local marketplace card
- **WHEN** 用户点击本地商城卡片
- **THEN** 系统导航到 `/skills/local`
