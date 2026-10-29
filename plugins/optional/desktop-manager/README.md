# 桌面管理插件（可后装）

**默认不随安装包分发**。两种安装方式：

- 线上/常规：通过「插件管理 → 上传 .yzp」安装，或开发期跑 `node scripts/dev-install-desktop-manager.mjs`；
- **随包分发（可选）**：打包时点名它即可 ——
  ```bash
  node scripts/package.cjs desktop --plugins=office-core,desktop-manager
  ```
  打包脚本会把本目录原样拷进 `apps/server/plugins/builtin/desktop-manager/`，随 extraResources 进包，
  打完自动清理临时副本。**随包 ≠ 启用**：服务端只把它登记为「未启用」，用户在插件管理里手动开启。
  （`node scripts/package.cjs --list-plugins` 可看到它是 `optional` 来源。）

## 目录

```
manifest.json          # id/version/engine/permissions/contributes.tools
package.json           # type: module（后端入口是 ESM）
backend/index.js       # 4 个工具 + 围栏后端路由
backend/rules.js       # 规则引擎（纯函数：无 IO、无模型）
backend/*.test.mjs     # node --test：规则、端到端、围栏路由
shared/fences.js       # 归属/网格纯函数（前后端共用）+ 单测
frontend/fence.html    # 围栏渲染页（被 pluginWindow 以 desktop 层打开）
frontend/fence.mjs
```

## 打开围栏窗口（P0-B）

安装并启用插件后，在应用渲染层执行（DevTools 控制台或后续设置页按钮）：

```js
await electronAPI.pluginWindow.open({
  pluginId: 'desktop-manager',
  entry: 'frontend/fence.html',
  placement: 'desktop',   // 钉到 WorkerW，壁纸层之上、应用之下
});
```

浏览器里只看版式（无 Electron / 无后端）：

```
http://localhost:4178/frontend/fence.html?demo=1
```

（本地起法：`node .claude/prototype-server.cjs --root plugins/optional/desktop-manager --port 4178`）

## 围栏行为

- 首次打开：自动生成「待归类」+ 桌面顶层文件夹各一栏（整理后文件夹天然成为围栏）
- 图标：真实系统图标（`desktopShell.fileIcon`，按路径+mtime 缓存），失败回落 emoji
- 双击打开；右键菜单可移入围栏 / 移出；拖图标到另一围栏即改归属
- 拖标题移动围栏、右下角缩放，松手即持久化
- 空白区点击穿透；退出按钮会恢复系统桌面图标（窗口被关闭时基座也会兜底恢复）
- 刷新：前端 1.2s 轮询 `/rev`（后端任何变更都会 bump），变了才拉 `/state`

## 悬浮组件（P1）

打开方式（设置页有按钮）：

```js
await electronAPI.pluginWindow.open({ pluginId: 'desktop-manager', entry: 'frontend/widgets.html?layer=desktop', placement: 'desktop' });
await electronAPI.pluginWindow.open({ pluginId: 'desktop-manager', entry: 'frontend/widgets.html?layer=overlay', placement: 'overlay' });
```

- 六种渲染器：`clock` / `list` / `metric` / `status` / `text` / `link`
- 数据源：插件自有 `clock`、`desktop.recent`、`fences.summary`、`oplog.last`；
  宿主只读契约 `tasks.today`、`agents.running`、`conversations.recent`（需 `data-contracts` 权限，
  插件不直接读主库，走宿主 `runReadContract`）
- 智能体工具：`desktop_widget_list`（拿类型/契约/config schema）→ `desktop_widget_set`（整体替换，校验不过整份拒绝）
- 默认整窗穿透，只有 `link` 可点；`overlay` 层在前台应用全屏时自动隐藏
- 浏览器看版式：`http://localhost:4178/frontend/widgets.html?demo=1&layer=desktop`


## 两种整理策略

| 策略 | 行为 |
|---|---|
| `rules`（默认） | 纯本地规则：用户规则(priority) → 项目关键词 → 时间簇(仅图片/视频) → 扩展名表 → 待归类。零模型调用、可复现 |
| `ai` | 规则打底，只把「未覆盖文件」交给模型；输出经五道校验；不可用/不合格时回落 `rules` 并在方案里标注 |

## 安全约束

- 只操作桌面目录（用户桌面 + 公共桌面）与方案内目标子目录，路径越界直接拒绝
- 只移不删；同名冲突改名不覆盖；`.lnk` / 隐藏文件 / `desktop.ini` 默认不动
- 执行必须 `confirmed: true`；先写操作日志再动作，`desktop_undo` 可整批回滚

## 开发

```bash
# 单测 + 端到端（不碰真实桌面）
node --test plugins/optional/desktop-manager/backend/rules.test.mjs plugins/optional/desktop-manager/backend/apply.test.mjs

# 安装到 dev 服务端（等价于线上上传 .yzp）
node scripts/dev-install-desktop-manager.mjs
# 之后用正常 dev 启动即可：服务端会因 YZ_DEV_AUTOLOAD_PLUGINS 自动注册并启用该插件
# （只想拷贝不启用：YZ_DEV_AUTOLOAD_PLUGINS= 置空启动）

# 打包 .yzp（manifest.json 必须在压缩包根目录）
node scripts/pack-desktop-manager.mjs
```

环境变量 `YZ_DESKTOP_DIR` 可覆盖桌面目录（多个用 `;` 分隔），仅用于测试/便携场景。
