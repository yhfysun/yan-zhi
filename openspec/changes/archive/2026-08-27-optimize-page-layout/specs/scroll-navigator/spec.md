## ADDED Requirements

### Requirement: Scroll-to-bottom button
系统 SHALL 在聊天消息区域右下角显示一个圆形"滚到底部"按钮（向下箭头图标），仅当满足以下条件时显示：消息区域内容高度超过可视区域高度，且当前滚动位置不在底部附近（距底部超过 100px）。

#### Scenario: Show button when scrolled up
- **WHEN** 用户在聊天页面且消息区内容可滚动
- **AND** 用户向上滚动离开底部超过 100px
- **THEN** 右下角显示"滚到底部"浮动按钮

#### Scenario: Hide button when at bottom
- **WHEN** 用户在聊天页面且滚动位置在底部 100px 范围内
- **THEN** 右下角不显示"滚到底部"按钮

#### Scenario: Hide button when content fits viewport
- **WHEN** 用户在聊天页面且消息区内容高度不超过可视区域
- **THEN** 右下角不显示任何滚动跳转按钮

#### Scenario: Click to scroll to bottom
- **WHEN** 用户点击"滚到底部"按钮
- **THEN** 消息区域平滑滚动到底部

### Requirement: Scroll-to-top button
系统 SHALL 在聊天消息区域右下角显示一个圆形"滚到顶部"按钮（向上箭头图标），仅当用户向上滚动超过一屏高度（约当前视口高度）时显示。

#### Scenario: Show button when scrolled far up
- **WHEN** 用户在聊天页面且滚动位置超过一屏高度以上
- **THEN** 右下角同时显示"滚到顶部"按钮（位于"滚到底部"按钮上方）

#### Scenario: Click to scroll to top
- **WHEN** 用户点击"滚到顶部"按钮
- **THEN** 消息区域平滑滚动到顶部

### Requirement: Scroll buttons visual style
滚动按钮 SHALL 使用圆形 40px 直径，半透明毛玻璃背景，带有柔和阴影。按钮 SHALL 定位在消息区域右下角（距右边缘 16px，距输入区域上方 8px）。按钮 SHALL 有 hover 放大和加深效果。

#### Scenario: Button hover effect
- **WHEN** 用户鼠标悬停在滚动按钮上
- **THEN** 按钮放大至 105% 并加深背景色
