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

## P3 护栏 ✅（除急停热键/mac 适配）
- [x] 3.2 单 task 操作上限：10 分钟滚动窗口 maxOps（默认 200，插件配置可调，重启用生效）
- [x] 3.3 黑名单：Win 键/Alt+F4/Ctrl+Alt+Del/Ctrl+Shift+Esc 组合键；shutdown/taskkill/format 等 14 个危险进程；open_app 禁 shell 元字符；SendKeys 特殊字符转义
- [x] 3.4 审计日志：每次操作写 plugin_storage.audit（cap 100 条）+ ctx.log
- [x] 3.5 自窗点击默认拒绝：RectAt 命中本应用进程名/标题（allowSelfWindowClick 配置可放宽）
- [ ] 3.1 急停热键（需 Electron main globalShortcut + IPC，待做）
- [ ] 3.6 mac 适配（osascript，待做）
- [ ] 后续：插件页展示审计记录 UI；nut-js 适配器（ComputerInputAdapter 接口化）
