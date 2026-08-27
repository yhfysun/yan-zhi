# Skill Marketplace Specification

## Purpose

定义本地与远程 Skill 商城的统一入口、浏览、安装到本地以及商城 REST API 协议，替代旧的 Tab 切换交互。

## Requirements

### Requirement: 本地 Skill 商城
系统 SHALL 提供本地 Skill 商城，从商城首页点击进入，统一管理内置与用户自建 Skill。

#### Scenario: 浏览本地 Skill
- **WHEN** 用户从商城首页点击“本地商城”卡片
- **THEN** 系统导航到 `/skills/local`，以卡片网格展示内置和自定义 Skill

#### Scenario: 查看 Skill 详情
- **WHEN** 用户点击某个 Skill 卡片
- **THEN** 系统展示 frontmatter 元数据和 Markdown body

### Requirement: 远程 Skill 商城
系统 SHALL 支持添加远程 Skill 商城源，并以卡片形式在首页展示和进入。

#### Scenario: 添加远程 Skill 商城
- **WHEN** 用户在商城首页添加远程商城并填写 URL 与认证信息
- **THEN** 系统验证端点可用性后保存配置

#### Scenario: 浏览远程 Skill 列表
- **WHEN** 用户点击远程商城卡片
- **THEN** 系统导航到远程商城页面并调用获取接口展示 Skill 列表

### Requirement: 远程 Skill 下载到本地
系统 SHALL 支持将远程商城中的 Skill 安装到本地商城。

#### Scenario: 下载远程 Skill
- **WHEN** 用户点击远程 Skill 的“安装到本地”
- **THEN** 系统获取完整数据并写入本地数据库，标记 source 为 remote

#### Scenario: 已安装检测
- **WHEN** 用户安装已存在于本地的 Skill
- **THEN** 系统提示已安装并提供覆盖更新选项

### Requirement: Skill Marketplace Protocol
系统 SHALL 定义标准化的 Skill 商城 REST API，支持分页、详情、搜索和分类四个端点。

#### Scenario: 分页列表接口
- **WHEN** 发起 `GET /api/marketplace/skills?page=1&pageSize=20`
- **THEN** 返回包含 items、total、page 和 pageSize 的成功响应
