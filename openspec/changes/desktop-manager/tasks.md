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
