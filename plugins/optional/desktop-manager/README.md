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
shared/desktop-windows.js # 桌面层窗口规划（哪个分组/组件该开哪个窗口）+ 单测
frontend/fence.html    # 双角色：工具条（宿主）/ 单个分组窗口（?fence=<id>）
frontend/fence.mjs
```

## 桌面层架构：一个分组一个窗口

钉到 Progman 子层的窗口**收不到转发的 mousemove**，「整屏透明窗口 + 局部穿透」实现不了
（要么吞点击、要么点不到按钮）。所以桌面层改成 OpenFences 同款结构：

| 窗口 | 入口 | 谁拉起 |
|------|------|--------|
| 工具条（宿主） | `frontend/fence.html` | 清单 `contributes.windows` / 快捷键 `Control+Alt+D` |
| 单个分组 | `frontend/fence.html?fence=<id>` | 工具条按 `/state` 拉起/收掉 |
| 单个桌面组件 | `frontend/widgets.html?id=<id>&layer=desktop` | 工具条按 `/widgets` 拉起/收掉 |
| 悬浮层 | `frontend/widgets.html?layer=overlay` | 设置页（整层一窗，缩到组件包围盒） |

窗口尺寸 = 数据里的 rect/pos，空白桌面不归我们管 —— 系统右击菜单、桌面图标都照常。
`pluginWindow` 的去重键是 `pluginId + entry`（entry 含 query），所以多个分组窗口可以并存。

## 打开围栏窗口（P0-B）

**正常用法：插件管理页 → 桌面管理卡片 →「设置」「围栏」按钮**（清单 `contributes.windows` 声明，
宿主通用渲染，插件不需要任何 UI 代码）。

- 「设置」= 控制面板（策略/规则/围栏列表/打开组件），普通窗口，按清单里的 `rect` 开 640×720
- 「围栏」= 桌面层：工具条 + 每个分组一个窗口（会隐藏系统图标，退出/关窗自动恢复）
- 同一入口再点一次只会把已有窗口叫回来；带不同 `?fence=` 的是不同窗口，各自独立

快捷键 **`Control+Alt+D`** 直接打开围栏（清单 `accelerator` 声明，宿主注册）。
可在「设置 → 快捷键 → 桌面管理 · 围栏快捷键」里改键 / 恢复默认 / 禁用。

应急方式（DevTools 控制台）：

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

- 首次打开：自动生成「文件夹」（桌面有目录时）+ 按扩展名的「文档 / 表格 / 图片 / 安装包 / 压缩包」+「待归类」；
  旧版本「按桌面文件夹名建栏」的配置会在升级后一次性重建（`fencesSchema=2`），之后用户改动不再被覆盖
- 图标：系统原生图标（主进程 Win32 助手 `SHGetImageList` jumbo，按内容裁切、按路径+mtime 缓存；
  助手不可用时回落 Electron `app.getFileIcon` 48px），失败才回落 emoji
- 归属：显式指派 > 目录归「文件夹」栏 > 扩展名栏 > 待归类（拖回「待归类」不会被扩展名规则再带走）
- 双击打开；右键菜单可「移入某分组」（两个独立窗口之间传不了 HTML5 drag，所以跨分组走右键）
- 拖标题栏移动窗口（8px 网格吸附，拖动中移动窗口、松手 PATCH `/fences/:id` 持久化）
- 双击标题栏折叠/展开（`collapsed` 落库，不覆盖 rect.h）；折叠后窗口只有标题栏高
- 空白分组不占桌面；「待归类」和用户手动建的分组（`pinned`）始终显示
- 点哪个窗口就把它提到同层最前（`pluginWindow.raise` → 重新 `--pin`）
- 退出按钮会恢复系统桌面图标（窗口被关闭时基座也会兜底恢复）
- 刷新：工具条 1.5s 轮询 `/state` + `/widgets`（窗口增删在这里收敛）；分组窗口 1.5s 跟 `/state` 对齐 rect

## 悬浮组件（P1）

打开方式：桌面组件由工具条自动拉起（每个组件一个窗口）；悬浮层在设置页手动打开。

```js
// 单个桌面组件（工具条自动做，手动调也行）
await electronAPI.pluginWindow.open({ pluginId: 'desktop-manager', entry: 'frontend/widgets.html?id=<id>&layer=desktop', placement: 'desktop' });
await electronAPI.pluginWindow.open({ pluginId: 'desktop-manager', entry: 'frontend/widgets.html?layer=overlay', placement: 'overlay' });
```

- 六种渲染器：`clock` / `list` / `metric` / `status` / `text` / `link`
- 数据源：插件自有 `clock`、`desktop.recent`、`fences.summary`、`oplog.last`；
  宿主只读契约 `tasks.today`、`agents.running`、`conversations.recent`（需 `data-contracts` 权限，
  插件不直接读主库，走宿主 `runReadContract`）
- 智能体工具：`desktop_widget_list`（拿类型/契约/config schema）→ `desktop_widget_set`（整体替换，校验不过整份拒绝）
- 桌面层组件同样一个组件一个窗口（窗口 = pos），不再用整屏透明窗口 —— 透明区域照样会吃掉点击；
  悬浮层是整层一窗，但窗口会缩到组件包围盒
- `overlay` 层在前台应用全屏时自动隐藏
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

## 桌面组件与提醒（2026-10-30）

- 组件类型：`clock / list / metric / status / text / link / weather / todos / memo / folder`
- 新建入口三处：设置页「组件 → 新建组件」、围栏工具条「＋组件」、在工具条/分组上**右击**
- 天气：Open-Meteo（免费、无需 key）；设置页填「天气城市」；数据缓存 10 分钟
- 待办提醒（**常驻后台，不依赖围栏页/组件页是否打开**）：
  - 后端 `activate()` 里起 30s 定时扫描 → 到期提醒进 `pendingSay` 队列
  - 主进程每 15s `POST /reminders/drain` 取走 → 宠物气泡 + 提示音；宠物没开退系统通知
  - 有开始时间 → 到点提醒（同一天一次；超过 3 小时不补）；没开始时间 → 下班前 1.5 小时汇总（默认 16:30）
  - 端点由 `manifest.contributes.reminders` 声明，主进程侧是内置表（`PLUGIN_REMINDER_ENDPOINTS`），加新插件补一行
