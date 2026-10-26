# 任务清单（桌面管理插件 · 可后装形态）

> 对齐 proposal / design。顺序：**P0-0 基座通用能力 → P0-A 插件骨架 + 打包安装 + 文件整理 → P0-B 围栏 → P0-C 联调 → P1 组件 → P2 代码组件**。
> 铁律：基座只进通用能力；桌面整理业务一行都不进 `packages/ui` / `apps/desktop/main.cjs` 的业务逻辑。

## P0-0 基座通用能力（随应用发布，与业务插件解耦）

- [ ] `pluginWindow` IPC：open/update/close/list + moved/closed 事件；placement=`desktop|overlay|normal`
- [ ] 入口白名单：`entry` 解析后必须落在调用方插件自己的 `yz://plugin/<id>/` 内（跨插件调用直接拒绝）+ 守门测试
- [ ] 权限 `desktop-shell`：`PluginPermission` 增项；未声明调用 `pluginWindow`/`desktopShell` 一律拒绝
- [ ] `desktopShell`：`iconsVisible` / `setIconsVisible` / `fileIcon` / `openPath` / `query`
- [ ] C# 助手 `yz-desktop.exe`：`--progman` / `--spawn-workerw` / `--pin` / `--toggle-icons` / `--icons-visible`
- [ ] 抽出通用 `ensureHelperExe(name, src)`，`ensureGdiCapExe` 改调用它（行为不变）+ 守门测试
- [ ] 会话级恢复状态机：窗口异常关闭 / deactivate / before-quit / app.exit → 恢复图标；启动自检不接管他人隐藏
- [ ] 审计：pluginWindow 与图标显隐全部进 `pushPluginAudit`
- [ ] 窗口全屏感知：overlay 模式在前台应用全屏时自动隐藏
- [ ] 测试：白名单拒绝、placement 分支、恢复状态机、C# 输出解析

## P0-A 插件骨架 + 打包安装 + 文件整理

- [ ] 插件目录 `apps/server/src/plugins/desktop-manager.ts`（源码开发形态）+ manifest：`engine: ^0.2`、`permissions: [fs, desktop-shell]`、`ownedTables: [desktop_fence, desktop_widget, desktop_oplog]`
- [ ] **确认不进打包**：不修改 `build/plugins.catalog.json`；打包产出里无 desktop-manager（守门测试）
- [ ] `.yzp` 打包：复用插件模板/zip 链路，产出 `desktop-manager-<ver>.yzp`
- [ ] 安装验证：上传 → 装到 `plugins/installed/desktop-manager/` → **热装载即生效（无需重启）** → 工具可见；重启后仍生效；老宿主（无 `pluginWindow`）安装被 `engine` 拒绝
- [ ] `desktop_scan`：桌面路径解析（用户 + 公共）、扩展名表、时间簇、名称模式聚类
- [ ] `desktop_plan`：方案 JSON（组名/成员/目标目录），未定文件交小模型但组名必须合法
- [ ] `desktop_apply`：`confirmed` 闸门 → 先写 oplog 再移动 → 冲突改 `name (2).ext` → 逐条回报
- [ ] `desktop_undo`：oplog 逆序回滚；用户已改动文件跳过并回报
- [ ] 越界路径拒绝 + 单测；只移不删（清理=移入 `归档/<年月>/`）
- [ ] 手动验收：真实桌面 50+ 文件 scan→plan→apply→undo 全链路，文件零丢失

## P0-B 围栏（插件前端 + 基座窗口）

- [ ] `frontend/fence.html` + `fence.mjs`：按 fences 数据画围栏框与网格；每显示器一窗
- [ ] 图标：`desktopShell.fileIcon` 取真实图标（缓存）；名称跟随系统「隐藏扩展名」设置
- [ ] 排序：name / mtime / type / manual；网格自适应围栏尺寸
- [ ] 交互：双击 `openPath`；右键菜单（打开/重命名/移入围栏/移出/删除到回收站）；拖入 = 真实移动文件
- [ ] 穿透：空白区 clickThrough，标题与图标区可交互
- [ ] 刷新：插件后端 `fs.watch` 桌面目录（300ms 防抖）+ WS 推 `desktop:changed`；未匹配文件落 `inbox` 并提示
- [ ] 围栏 CRUD：新建/改名/改尺寸/删除（删除不删文件，成员回 inbox）+ 持久化
- [ ] 模式切换：设置页开关 + 托盘菜单（围栏 / 系统桌面）；关闭即恢复系统图标
- [ ] 钉桌面层失败：明确提示 + 由插件决定回落 normal 窗口（不静默）
- [ ] 手动验收：杀渲染进程图标恢复 / 退出宿主恢复 / 双屏 / 100 文件流畅 / 拖放后资源管理器一致

## P0-C 联调

- [ ] 整理完成后围栏自动刷新（apply 结果 → 后端事件 → 渲染页重建）
- [ ] 设置页：围栏开关、开机自启围栏、默认排序
- [ ] 卸载路径：deactivate 关窗 + 恢复图标 + 落最终 oplog；残留检查（无进程、无隐藏态）

## P1 组件

- [ ] 六种渲染器在插件 bundle：clock / list / metric / status / text / link
- [ ] 实例 JSON 校验器（插件内，照 ydash：类型白名单、契约存在、边界钳制、不抛异常）+ 单测
- [ ] 组件窗口：`desktop` 层 / `overlay` 层；overlay 全屏自动隐藏
- [ ] 智能体工具：`desktop_widget_set` / `desktop_widget_list`（回传类型 + config schema）
- [ ] 手动验收：模型生成一组组件 → 上桌面 → 重启还原

## P2 代码组件审核流

- [ ] 草稿生成到 `plugins/installed/<id>/`，manifest `enabled: false`
- [ ] 审核页：权限清单高亮、代码 diff、来源模型/时间、启用按钮
- [ ] 守门测试：未审核草稿不可被工具调用、模型不能 self-enable
- [ ] 市场分发：`.yzp` 导出/安装复用既有链路
