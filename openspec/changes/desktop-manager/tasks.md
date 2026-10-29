# 任务清单（桌面管理插件 · 可后装形态）

> 对齐 proposal / design。顺序：**P0-0 基座通用能力 → P0-A 插件骨架 + 打包安装 + 文件整理 → P0-B 围栏 → P0-C 联调 → P1 组件 → P2 代码组件**。
> 铁律：基座只进通用能力；桌面整理业务一行都不进 `packages/ui` / `apps/desktop/main.cjs` 的业务逻辑。

## 进度（2026-10-28）

**已完成**
- core：`PluginPermission` 增 `desktop-shell` / `llm`；`manifest.ts` 白名单同步
- 基座：`llm.json` 桥（`host-bridge.ts`，复用 `chatViaRow` + 默认模型解析）+ 导出快照测试更新
- 插件本体 `plugins/optional/desktop-manager/`（**不进打包**，独立目录）：manifest / package / README、规则引擎、4 个工具、AI 增强与回落、oplog 回滚
- 测试：`node --test` 16 例绿（规则 13 + 端到端 3：方案→执行→回滚、冲突改名不覆盖、AI 无模型回落）
- 打包：`scripts/pack-desktop-manager.mjs` → `dist/desktop-manager-0.1.0.yzp`（manifest 在根目录、已排除测试文件）
- 开发安装：`scripts/dev-install-desktop-manager.mjs`
- 校验：`apps/server` `tsc --noEmit` 绿；`host-bridge.test.ts` 3 例绿

**未开始（下一步）**
- 双屏各自围栏（当前按主屏坐标）；真实桌面手动验收（规则/AI 各一轮 + 围栏真机）
- AI 成本护栏剩余：单次 200 文件名上限、10 分钟结果缓存（当前只有 maxTokens 1200 + 20s 超时）
- 权限运行期强制：`llm` 桥按 pluginId 校验（`desktop-shell` 已在窗口请求处校验；llm 仍仅清单声明）
- 真实桌面手动验收（50+ 文件，规则/AI 各一轮）

### P0-0（2026-10-28 完成）

- [x] `apps/desktop/desktop-shell.cjs`：入口白名单（插件目录 + `safeJoin`）、`desktop-shell` 权限校验、助手输出解析、图标会话状态机、Win32 助手源码（纯逻辑零 electron 依赖）
- [x] `preload.cjs`：暴露 `pluginWindow`（open/update/close/list/on）与 `desktopShell`（iconsVisible/setIconsVisible/fileIcon/openPath/query）
- [x] `main.cjs`：`plugin-window:*` 与 `desktop-shell:*` IPC；`desktop` placement 走 `--spawn-workerw` + `--pin`（失败返回 `worker-w-not-found` / `pin-failed`，不静默降级）；`overlay` 置顶无激活；`clickThrough` 穿透
- [x] 会话级恢复：最后一个 desktop 窗口关闭 / `before-quit` / `will-quit` 同步恢复图标；启动自检「已是隐藏且非本会话所为」不认领、退出不恢复
- [x] 三份 electron-builder yml 登记 `desktop-shell.cjs`（守门测试通过）
- [x] 测试：`apps/desktop/test/desktop-shell.test.cjs` 9 例 + 打包登记 4 例共 20 例绿；`node --check` main/preload 通过
- [x] C# 助手实编译验证：`--icons-visible` → `{"visible":true}`；`--progman` → Progman/DefView/ListView 句柄正常

### P0-B（2026-10-28 完成）

- [x] `shared/fences.js`：归属推导（同名文件夹 > 显式指派 > 待归类）+ 网格/最小高度/排序纯函数 + 6 例单测
- [x] 后端路由：`GET /state`、`POST/PATCH/DELETE /fences`、`POST /assign`；首次自动生成「待归类 + 顶层文件夹围栏」；文件夹内容归属同名围栏且文件夹本身不再重复显示
- [x] `frontend/fence.html` + `fence.mjs`：围栏/图标渲染、真实图标（按路径+mtime 缓存，失败回落 emoji）、双击打开、右键移入/移出、拖拽改归属、拖标题移动、右下角缩放（松手持久化）、空白区点击穿透、退出恢复图标
- [x] `?demo=1` 演示模式（浏览器可直接看版式，已截图自验）
- [x] manifest 补 `desktop-shell` 权限（否则开窗被基座拒绝）
- [x] 测试：围栏路由 4 例 + 共享布局 6 例，插件合计 **27 例全绿**；`node --check` fence.mjs 通过

**P0-B 已知简化**（后续可升级）
- 刷新用前端 2.5s 轮询（未做服务端 `fs.watch` + WS 推送）
- 单显示器：围栏坐标按主屏窗口坐标计；多屏各自围栏放 P0-C
- 右键菜单暂无「重命名 / 删除到回收站」（重命名需防误改文件名的确认流程）

### P0-C（2026-10-28 完成）

- [x] **整理后围栏自动刷新**：后端 `rev` 版本号（apply / undo / 围栏增删改 / 指派 / 改配置都 bump）；围栏页 1.2s 只轮询 `/rev`，变了才拉 `/state`
- [x] **设置页** `frontend/settings.html` + `settings.mjs`：默认策略（规则/AI）、目标目录前缀、时间簇、自定义规则（`*.pdf => 文档`）、项目关键词、保留名单；保存走 `PUT /config`
- [x] 设置页围栏管理：列表（含文件数）、新建、移除（不删文件）、打开围栏（桌面层）、关闭窗口
- [x] 默认策略生效：`desktop_plan` 未传 `strategy` 时读配置（入参 > 配置 > 规则）
- [x] **禁用/卸载清理**：基座 `pluginWindow.closeAll(pluginId)`；插件 store 在 disable/uninstall 后调用，关掉该插件全部窗口并在最后一个桌面窗口关闭时恢复图标
- [x] 测试：配置/版本号路由用例，插件合计 **28 例全绿**；`node --check` main/preload/fence/settings 通过
- [x] 设置页版式浏览器自验（无后端时显示加载失败，不白屏）

**P0-C 未做**
- 开机自启围栏：需宿主提供「启动任务」能力（设置页已如实说明，不假装支持）
- 双屏各自围栏（当前按主屏坐标）

### 桌面层真机打通（2026-10-29 晚）

用户要求：「win+d 就是我们的桌面」「正常图标 + 几个分类面板」。之前判定「钉不上桌面层」是**检测写错 + 缺一步样式转换**，两处都修好了：

- [x] **WorkerW 结构**：Win11 发 `0x052C` 后，壁纸 `WorkerW` 是 **Progman 的子窗口**，
      不是「顶部同级 WorkerW + SHELLDLL_DefView」。旧实现只认后者 → 永远 `workerW=0`。
      现在先找 Progman 的 WorkerW 子窗口，再回落经典同级结构（助手 v4）
- [x] **钉不上桌面层的真因**：Electron 无边框窗口是 `WS_POPUP`，直接 `SetParent` **静默失败**
      （`GetParent` 仍为 0，返回 ok=false）。必须先 `SetWindowLong(GWL_STYLE)` 去掉 `WS_POPUP`、
      加上 `WS_CHILD`，再 `SetParent` + `SetWindowPos(FRAMECHANGED)`（助手 v5）
- [x] 真机验证：`pluginWindow.open({placement:'desktop'})` 返回 `fallback: null`（钉上了），
      围栏页 DOM `groups=8 / icons=110` —— 这一层在 Win+D 后仍然存在
- [x] 界面改回「桌面形态」：壁纸透出、分组是半透明圆角区域、图标直接铺在桌面上（`fence.html` 重写）
- [x] 旧「分类平铺窗口」（organize.html/mjs）已删除：用户否决了"另一个窗口"的方案

**仍未做**
- 分组位置目前按流式自动排布（不记忆每个分组的坐标）；要手动摆放需再接 rect 持久化
- 图标排布/排序（按名称/时间/类型）沿用的是分组内的固定顺序

### 界面改版（2026-10-29，用户拍板 A 方案）

用户反馈：「样子不行 / win+d 后桌面空白 / 参考电脑管家，不要每个都是一个面板」。

- [x] **主界面换成单窗口「分类平铺」**（`frontend/organize.html`）：左侧分类轨道 + 右侧按分类平铺，
      分组只用「色点 + 标题 + 分隔线」，不再是满地浮动面板框
- [x] **不再隐藏系统图标**：实测 `desktopShell.iconsVisible()` 恒为 `true`，Win+D 后桌面不再空白；
      关掉窗口桌面也照旧完整（原设计的「隐藏系统图标 + 自绘围栏」在 Win+D 场景必然空白，这是设计缺陷）
- [x] 桌面围栏（fence.html）从清单摘除，保留文件但不提供入口（钉桌面层在本机实测不可用：`workerW=0`）
- [x] 窗口入口：`contributes.windows` 的 `organize`（normal，960×660，菜单项 + `Control+Alt+D`）
- [x] 一键整理按钮接到新后端 `/plan` + `/apply`；支持多选移入分类、拖拽到左侧分类、新建分类
- [x] 真机验证：窗口打开后 DOM `groups=8 / items=109 / cats=10`，`/plan` 返回 200

### 入口与快捷键（2026-10-29）

用户实报：「桌面整理插件我要怎么用？都没有按钮？」—— 插件做完了但没有宿主入口，
唯一开法是 DevTools 手敲 `pluginWindow.open`。补齐为**基座通用能力**（业务零侵入）：

- [x] 清单扩展点 `contributes.windows[]`（id / label / entry / placement / rect? / resizable? / accelerator?），
      校验落在 `packages/core/src/plugin/manifest.ts`：kebab id、包内相对 html 入口（挡绝对路径与 `..`）、
      三档 placement、rect 只认 x/y/w/h、accelerator 非空
- [x] 插件管理卡片按声明渲染「打开」按钮（启用 + Electron 宿主才给），走既有 `pluginWindow.open`
- [x] 同入口重复点击只 `update({visible:true})` 叫回窗口，不叠第二个（两个围栏会互抢系统图标）
- [x] desktop-manager manifest 声明 `设置`（normal，640×720，可缩放）与 `围栏`（desktop，accelerator `Control+Alt+D`）
- [x] 测试：`PluginManager.windows.mount.test.ts` 7 例（按钮显隐 4 + 传参 2 + 去重 1）、
      `manifest.windows.test.ts` 7 例；`packages/ui` vue-tsc 与 `packages/core` tsc 均绿
- [x] **全局快捷键**：`Control+Alt+D` 打开桌面围栏（清单声明 `accelerator`）
      —— `apps/desktop/plugin-hotkeys.cjs` 纯逻辑（规范化 + 差量，9 例单测）+
      主进程 `plugin-window:set-hotkeys` 差量注册（全部走 `setGlobalHotkey`）+
      `App.vue` 监听「启用插件 × 用户覆盖」整份同步 + 设置 → 快捷键新增可改/可禁用/恢复默认的行
- [x] 主进程 `plugin-window:open` 判重：同 pluginId + entry 已存在时叫回原窗口（`normal` 聚焦、其余 `showInactive`），
      把上面的「两个设置窗口」边界也一并堵住
- [x] 顺手修正：宠物 `Alt+P` 之前直连 `globalShortcut.register`，绕开了统一注销与守卫
      （`shortcut-governance` 自 ac114b9 起就红），改为走 `setGlobalHotkey`
- [x] **侧栏菜单入口**：清单 `contributes.windows[].menu: true` 的窗口在侧栏「插件」分组出现一项
      （`kind:'window'`，点了直接开窗，失败要弹原因）。面板窗口已开启，用户不必再进插件管理页找卡片
- [x] **实测踩坑：清单是 pinia 响应式对象，Proxy 过不了 IPC** ——
      `api.open({ rect: w.rect })` 与 `setHotkeys([...rect])` 都抛
      `An object could not be cloned`，表现分别是「点菜单没反应」和「按快捷键没反应」。
      修法：`plainRect()` 拷成普通对象再传（三处调用点统一），并加一条 `isProxy + structuredClone` 守门用例
- [x] **实测踩坑②：yz:// 协议的 MIME 表没有 .html** —— 回落 `application/octet-stream`，
      Chromium 把插件窗口页当下载处理，`loadURL` 直接 `ERR_FAILED (-2)`。
      补 `.html/.htm → text/html; charset=utf-8`，并加一条协议单测（这条对**任何**插件窗口都成立）
- [x] **实测踩坑③：yz:// 文档里加载自己的子资源一律被拒**（模块 import / fetch 全报
      `Failed to fetch`，围栏页只剩静态工具栏、按钮全死、图标也不画）。
      改为插件窗口页走本地 HTTP：`/api/plugin-assets/<id>/<entry>`（与 API 同源），
      该路由补 `.html/.htm` MIME。真机验证：围栏页 9 个围栏 / 120 个图标正常渲染
- [x] **一键整理**（用户诉求「直接一键整理好桌面，别让我自己拖」）：
      插件后端新增 `POST /plan`（只算不动）+ `POST /apply`（必须 confirmed:true），
      与智能体工具同一条 plan→apply 链路；围栏工具栏新增「一键整理」按钮，
      列分组计数 → 确认 → 执行 → 自动刷新围栏。真机 `/plan` 返回 13 个待归位文件
- [x] 三份 electron-builder yml 登记 `plugin-hotkeys.cjs`（`packaged-entry-modules` 守门测试）

**入口已知边界**
- 窗口判重按「pluginId + entry」在主进程做，插件自己从围栏里再开设置面板也会落到同一个窗口；
  代价是同名 entry 只能有一个实例（目前没有插件需要多开同一页）
- 未做「开机自启围栏」（同 P0-C 的边界）

### P1（2026-10-29 完成）

- [x] `shared/widgets.js`：六种类型（clock/list/metric/status/text/link）白名单、契约白名单、位置钳制、config schema 校验、整组整体替换语义 + 7 例单测
- [x] 后端：`GET/PUT /widgets`、`GET /widgets/data?contract=`；数据源 `clock` / `desktop.recent` / `fences.summary` / `oplog.last`（只做插件自己能证明的数据）
- [x] 智能体工具：`desktop_widget_set`（校验后整体替换）/ `desktop_widget_list`（回传当前组件 + 类型/契约/config schema 供模型自描述）
- [x] `frontend/widgets.html` + `widgets.mjs`：六种渲染器、`layer=desktop|overlay` 分窗、rev 变更重载、契约数据 30s 刷新、默认整窗穿透（仅 link 可点）
- [x] 设置页新增「打开组件（桌面层）/（悬浮层）」
- [x] **overlay 全屏自动隐藏**：C# 助手新增 `--foreground`（判断前台窗口是否铺满显示器），主进程每 2s 轮询并隐藏/恢复悬浮层窗口；助手版本升 v2（老 exe 自动重编）
- [x] 测试：组件校验 7 例 + 组件路由 1 例；合计 **44 例全绿**；`node --check` main/widgets.mjs 通过；C# 助手实编译验证 `--foreground` → `{"hwnd":...,"fullscreen":false}`
- [x] `?demo=1` 演示版式已截图自验（时钟/最近文件/围栏状态/指标/文本/快捷入口）

**P1 已知边界**
- 数据源只有插件自己能证明的四个：待办、智能体运行状态等需要宿主提供**只读契约白名单**（不能让插件直接读主库），留待宿主契约层
- overlay 全屏判断按「窗口铺满所在显示器」近似，隐藏式全屏（部分游戏）可能漏判

### P2（2026-10-29 完成）

- [x] **物理隔离**：草稿只写 `plugins/drafts/<id>/`，该目录不被任何装载器扫描；审核通过 = 把目录**移动**到 `plugins/installed/<id>/` 再注册（不是改标志位）
- [x] 服务 `apps/server/src/services/plugin-drafts.ts`：create / list / get / delete / approve；路径穿越、缺入口、非法清单、单文件 200KB、总量 1MB、50 文件上限全部拒绝
- [x] 审核闸门：approve 必须带确认串 `approve <id>`，否则 `missing-confirmation`；同名已安装拒绝（`already-installed`）
- [x] 路由 `/api/plugin-drafts`（index.ts 挂载）；approve 成功后 `registerInstalled` + `enable`
- [x] 智能体工具 `create_plugin_draft`（只能创建草稿，**工具面不存在 approve**）
- [x] 审核页：插件管理页新增「待审核草稿」区（权限中文标签、文件数、来源/时间、查看代码、通过并启用、删除）
- [x] 测试：`apps/server/test/plugin-drafts.test.ts` 6 例（隔离位置、穿越拒绝、确认串、移动+清 `.draft.json`、同名拒绝、列表/详情/删除）
- [x] `apps/server` `tsc --noEmit` 绿；UI 类型检查无本改动报错（`usePetBridge.ts` 两处为另一会话在途改动）
- [x] 市场分发：通过后的插件与内置同形态，导出/安装复用既有 `.yzp` 链路，无需新代码

**P2 已知边界**
- 审核页「查看代码」是全文预览，不是 diff（草稿没有基线可比）
- 「模型不能 self-enable」靠**物理隔离 + 工具面不提供 approve** 保证；若模型有任意 HTTP 调用能力（http_request），确认串可被读出 —— 真正的角色级授权需要宿主引入审批人身份，当前未做

### 宿主只读契约（2026-10-29 完成）

- [x] `apps/server/src/services/read-contracts.ts`：三条固定契约 `tasks.today` / `agents.running` / `conversations.recent`
  —— 固定 SQL、固定输出字段（不含 system_prompt 等敏感列）、`userId` 必填、`limit` 钳制 1..50、只读无写接口
- [x] 桥面导出 `listReadContracts` / `runReadContract`；**注入面与模块导出面两处都要登记**（快照测试抓到过一次只加注入面的漏登记）
- [x] 新权限 `data-contracts`（`PluginPermission` + manifest 白名单 + 审核页中文标签「只读数据契约」）
- [x] desktop-manager 接入：manifest 加权限；`resolveContract` 对宿主契约走 `runReadContract`（用户 id 取宿主库默认用户）；组件渲染器适配三种新数据形状（list/metric/status 通用）
- [x] 测试：`read-contracts.test.ts` 4 例（清单固定/未知契约/参数钳制/空库 SQL 可执行）+ 桥面快照 3 例；插件 **36 例全绿**（新增「组件取数走 runReadContract」守门）
- [x] `apps/server` `tsc --noEmit` 绿；`.yzp` 重打包

**契约层已知边界**
- 契约执行**不做运行期 pluginId 鉴权**（与 `llm` 桥同口径，权限为清单声明式）；要真正收紧需宿主引入审批人/角色
- 目前只有三条契约；新增契约要同步改 SQL 与类型清单，不允许插件自定义 SQL（那等于把主库交出去）

### 开发装载（2026-10-29）

- [x] 查清根因：启动只「重绑 DB 里已有的插件」（`installedRebinds(scan, x => !!mgr.get(x))`），
  手拷进 `plugins/installed/` 的新目录**不会被注册**，所以此前 dev 也不会默认装载
- [x] 新增 dev 专用自动装载：`YZ_DEV_AUTOLOAD_PLUGINS=desktop-manager`（dev 启动器默认注入）
  → 启动时扫描 installed 目录，注册并启用该插件（走既有 `registerInstalled` + `enable`，工具与路由随之挂载）
- [x] 生产零影响：安装版不经过 `scripts/dev.cjs`，不设该变量；打包产物也不含该插件
- [x] `apps/server` `tsc --noEmit` 绿

**用法**：`node scripts/dev-install-desktop-manager.mjs` 拷一次 → 正常 dev 启动 → 自动启用（目录不存在时只打一行「跳过」）

## P0-0 基座通用能力（随应用发布，与业务插件解耦）

- [ ] `pluginWindow` IPC：open/update/close/list + moved/closed 事件；placement=`desktop|overlay|normal`
- [ ] 入口白名单：`entry` 解析后必须落在调用方插件自己的 `yz://plugin/<id>/` 内（跨插件调用直接拒绝）+ 守门测试
- [ ] 权限 `desktop-shell`：`PluginPermission` 增项；未声明调用 `pluginWindow`/`desktopShell` 一律拒绝
- [ ] `desktopShell`：`iconsVisible` / `setIconsVisible` / `fileIcon` / `openPath` / `query`
- [ ] C# 助手 `yz-desktop.exe`：`--progman` / `--spawn-workerw` / `--pin` / `--toggle-icons` / `--icons-visible`
- [ ] 抽出通用 `ensureHelperExe(name, src)`，`ensureGdiCapExe` 改调用它（行为不变）+ 守门测试
- [ ] 会话级恢复状态机：窗口异常关闭 / deactivate / before-quit / app.exit → 恢复图标；启动自检不接管他人隐藏
- [ ] 审计：pluginWindow / 图标显隐 / llm 调用全部进 `pushPluginAudit`（llm 只记 tokens 与耗时，不记 prompt）
- [ ] `llm` 桥（通用）：`llm.json({system,user,schema,maxTokens,timeoutMs})`，内部走 `chatViaRow` + `findModelRow`（默认模型）；错误码 `no-model|timeout|bad-json|upstream`
- [ ] 权限 `llm`：`PluginPermission` 增项；未声明调用直接拒绝
- [ ] 窗口全屏感知：overlay 模式在前台应用全屏时自动隐藏
- [ ] 测试：白名单拒绝、placement 分支、恢复状态机、C# 输出解析、llm 错误码映射

## P0-A 插件骨架 + 打包安装 + 文件整理

- [ ] 插件目录 `apps/server/src/plugins/desktop-manager.ts`（源码开发形态）+ manifest：`engine: ^0.2`、`permissions: [fs, desktop-shell, llm]`、`ownedTables: [desktop_fence, desktop_widget, desktop_oplog]`
- [ ] **确认不进打包**：不修改 `build/plugins.catalog.json`；打包产出里无 desktop-manager（守门测试）
- [ ] `.yzp` 打包：复用插件模板/zip 链路，产出 `desktop-manager-<ver>.yzp`
- [ ] 安装验证：上传 → 装到 `plugins/installed/desktop-manager/` → **热装载即生效（无需重启）** → 工具可见；重启后仍生效；老宿主（无 `pluginWindow`）安装被 `engine` 拒绝
- [ ] **规则引擎（默认，不调模型）**：采集/过滤/判定管线；判定顺序 用户规则(priority) → 项目关键词 → 时间簇 → 内置扩展名表 → 待归类
- [ ] 规则配置：`rules[]`（glob + group + priority）、`projects[]`、`timeCluster`、`keep[]`、`targetRoot`；设置页表格编辑 + glob 测试框
- [ ] 规则模式确定性：幂等单测（同输入两次结果逐字段相等）+ 未覆盖清单如实输出
- [ ] `desktop_scan`：桌面路径解析（用户 + 公共）、文件元数据采集、「规则未覆盖」清单
- [ ] `desktop_plan({ strategy })`：缺省读设置（默认 `rules`）；规则方案 JSON（组名/成员/目标目录）
- [ ] **AI 增强**：只把规则未覆盖文件名 + 已有组名交模型；严格 JSON 输出；五道校验（来源集合/组名合法/数量上限/受保护文件/目录越界）
- [ ] **AI 回落**：`no-model|timeout|bad-json|校验失败` → 回落规则并在方案标注「AI 不可用，已按规则生成」+ 原因；不弹错框
- [ ] AI 成本护栏：单次 ≤200 文件名、maxTokens 上限、20s 超时、10 分钟结果缓存（文件名集合 hash）
- [ ] `desktop_apply`：`confirmed` 闸门 → 先写 oplog 再移动 → 冲突改 `name (2).ext` → 逐条回报
- [ ] `desktop_undo`：oplog 逆序回滚；用户已改动文件跳过并回报
- [ ] 越界路径拒绝 + 单测；只移不删（清理=移入 `归档/<年月>/`）
- [ ] 手动验收：真实桌面 50+ 文件 **规则模式与 AI 模式各跑一轮** scan→plan→apply→undo，文件零丢失；断网/无模型时 AI 模式回落正常

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
