# Context

`App.vue` 已经具备 `--bp-xs/sm/md/lg/xl`、`--is-mobile` 变量，以及桌面端 `.platform-desktop`、`.is-electron` 分支。`SideNav.vue` 已经实现三种稳定形态：Electron 可折叠标签侧栏、Web 宽屏 52px dock、移动端底部 TabBar。

当前问题不是缺少导航形态，而是三个旧变更互相覆盖，导致按钮、间距、弹窗和导航在断点边界上出现回退。

# Goals / Non-Goals

**Goals:**

- 选定唯一导航方向，避免后续改动继续在“去左栏/保留左栏”之间反复。
- 桌面端按钮始终带文字，移动端 FAB 只由 CSS 激活。
- Web 宽屏内容区左右留白对称。
- 内容型弹窗全宽、确认弹窗保持默认宽度。

**Non-Goals:**

- 不重写 SideNav 的组件实现。
- 不新增路由、Store 或后端接口。
- 不改变本地工具、MCP、智能体等页面的业务逻辑。

# Decisions

## 1. 导航方向

采纳 Electron 桌面端保留可折叠左侧栏、Web 宽屏保留 52px dock、移动端保留底部 TabBar。否决旧的桌面右上角菜单实验。

## 2. 新增按钮

模板使用标准文字按钮，移动端仅通过 `.fab-add` 的 `@media` 规则变成 48px 圆形按钮。`circle` prop 不再直接写在桌面按钮上。

## 3. 弹窗

移动端只对 `.mount-dialog`、`.skill-mount-dialog`、`.snapshot-dialog`、`.agent-edit-dialog` 强制全宽；普通 `el-dialog` 使用 `max-width: calc(100vw - 24px)`，保持 Element Plus 默认居中。

## 4. Web 宽屏间距

`.main-content` 保留 52px 左间距，并增加 52px 右 padding，使 `.page` 的 36px 左右内边距在视觉上对称。Electron 桌面端由平台覆盖回 0 右 padding。

# Risks / Trade-offs

- `.fab-add` 固定定位可能与页面内容重叠。通过 `bottom: calc(56px + 12px + safe-area)` 避让底部 TabBar，并保持 z-index 80。
- 选择性弹窗规则要求新增内容型弹窗时必须带对应 class，相关约定写入 spec。
