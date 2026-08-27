# 1. 固化导航方向

- [x] 1.1 在 design.md 中否决桌面右上角菜单，确认三端导航形态
- [x] 1.2 确认 `App.vue` 已有响应式变量，不重复新增断点体系
- [x] 1.3 确认 `SideNav.vue` 三态实现稳定

# 2. 修复桌面端按钮

- [x] 2.1 `Mcp.vue` 新增服务按钮恢复文字并启用 `fab-add`
- [x] 2.2 `App.vue` 增加 `.fab-add` 全局样式，移动端才转成 FAB
- [x] 2.3 确认 `Models.vue`、`Agents.vue` 桌面端已有文字按钮

# 3. 统一间距与网格

- [x] 3.1 `App.vue` Web 宽屏 `.main-content` 增加右侧 52px 对称 padding
- [x] 3.2 Electron 桌面端覆盖回 0 右 padding
- [x] 3.3 `ToolMarket.vue` 卡片网格 minmax 从 280px 恢复到 320px

# 4. 弹窗精准覆盖

- [x] 4.1 移除全局移动端 `.el-dialog` 的 `width: 92vw !important`
- [x] 4.2 只对内容型弹窗启用移动端全宽

# 5. 验证

- [x] 5.1 运行 `npx openspec validate --all`
- [x] 5.2 运行 `pnpm --filter @yan-zhi/ui typecheck`
- [ ] 5.3 浏览器截图核验三端无重叠、无无文字 FAB
