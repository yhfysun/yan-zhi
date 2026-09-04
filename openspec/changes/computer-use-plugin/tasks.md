# tasks.md — computer-use 插件 + 插件导出（2026-09-04 实施记录）

## P1 插件导出 ✅
- [x] 1.1 `apps/server/src/routes/plugins.ts`：`GET /api/plugins/:id/export`（内置=source zip / 已安装=.yzp）与 `GET /api/plugins/template`（脚手架 zip）
- [x] 1.2 `apps/server/src/plugins/templates/index.ts`：git-explorer 源码模板 + 脚手架（内嵌字符串，规避打包 fs 路径问题）
- [x] 1.3 前端 PluginManager.vue：条目「导出」按钮 + 头部「开发模板」按钮（弹窗预览代码 + 下载 zip）
- [x] 1.4 校验：server tsc ✅ + web vue-tsc ✅ + vite build ✅

## P2 computer-use 基础 ✅（选型 B：PowerShell/Win32，零原生依赖）
- [x] 2.1 ~~nut-js spike~~ → 直接落 B 方案（沙箱/打包环境原生模块风险高；-EncodedCommand 规避 shell:true 拼参问题）
- [x] 2.2 `PluginPermission` 增加 `'desktop-input'`；`manifest.ts` VALID_PERMS 同步
- [x] 2.3 `apps/server/src/plugins/computer-use.ts`：10 个工具，PowerShell+Win32 P/Invoke 适配器
- [x] 2.4 工具：screenshot / mouse_click / mouse_move / mouse_drag / scroll / type / press_key / list_windows / activate_window / open_app（screenshot 走文件路径返回，LLM 工具结果暂无图片通道）
- [x] 2.5 默认 disabled 注册（index.ts）+ 启用时前端确认弹窗（desktop-input 高危提示）

## P3 护栏 ✅（2026-09-04 第二轮：急停热键 / mac 适配 / 审计 UI 已补齐）
- [x] 3.2 单 task 操作上限：10 分钟滚动窗口 maxOps（默认 200，插件配置可调，重启用生效）
- [x] 3.3 黑名单：Win 键/Alt+F4/Ctrl+Alt+Del/Ctrl+Shift+Esc 组合键；shutdown/taskkill/format 等 14 个危险进程；open_app 禁 shell 元字符；SendKeys 特殊字符转义
- [x] 3.4 审计日志：每次操作写 plugin_storage.audit（cap 100 条）+ ctx.log + 插件页「记录」弹窗查看（GET /api/plugin/computer-use/audit）
- [x] 3.5 自窗点击默认拒绝：RectAt 命中本应用进程名/标题（allowSelfWindowClick 配置可放宽）
- [x] 3.1 急停热键：main.cjs globalShortcut Ctrl+Alt+Esc → POST /api/plugin/computer-use/panic → panicActive 冻结输入工具 + 自动禁用插件（恢复=插件页手动重新启用）；before-quit unregisterAll
- [x] 3.6 mac 适配（osascript）：click/keystroke/组合键（ctrl→command 映射）/screencapture/open -a/进程枚举/activate；move/drag/scroll 不支持（明确报错）；需辅助功能权限
- [x] 堵洞：api_plugin_enable 对 desktop-input 插件拒绝智能体自行启用（必须用户在插件管理页操作）
- [x] index.ts：插件启用事件即时挂载 backendRoutes（免去「需重启生效」）
- [ ] 待实测：Win32 P/Invoke 链本机 PowerShell 实跑被沙箱策略拦截（Add-Type 禁止），需 dev 起服务后手测一次点击/截图/急停；mac 分支未实测
- [ ] 后续：nut-js 适配器（接口化）；工具结果图片通道（screenshot 视觉循环）
