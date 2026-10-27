# 任务清单（模式插件化与插件运行时包）

> 对齐 proposal / design。阶段顺序：P0 地基（零功能变化）→ P1 试点 → P2 功能插件 → P3 模式运行时化 → P4 新建三模式插件 → P5 打包集成 → P6 单独打包 → P7 收尾。
> 每阶段验收：全部现有测试绿 + 该阶段新增守门测试绿 + 办公模式冒烟。

## 移动端临时插队修复（2026-10-25，用户实测三连报）

- [x] **授权激活死路**：移动包无预置码 → 自动激活必败 → 死路授权页（"版本档位 读取中…"）。修复：server license MOBILE_MODE 恒发 pro 全量（`mobile-full`）+ 前端 Capacitor 后端不可达时放行进主界面。测试 license-mobile.test.ts。
- [x] **任务页全空白（真机根因）**：localStorage/legacy 恢复出被屏蔽模式（dev）→ 冷启动 /chat↔/code 无限重定向 → vue-router 中止导航 → 内容区空白 + 兜底标题"日常办公助手" + App 级顶栏。修复：路由守卫三道闸（屏蔽分支先 setMode('office') / 模式记忆第二道闸 / 恢复模式就地归位 office）。守门 mobile-route-loop-guard.test.cjs + 浏览器 Capacitor 模拟实测（isCapacitor=true + yz:mode=dev → 正确落 /chat 渲染办公欢迎页+输入框）。
- [x] **远程控制移动端不可达**：后端注册移出 MOBILE_MODE 跳过清单（手机=控制端）+ 设置→服务与连接→局域网→卡片→"打开控制页"移动端改应用内跳转 /remote。浏览器模拟实测全链路通（卡片渲染 + /remote 控制端页完整）。
- 配套：build-mobile-server.cjs 自动拷入 builtin 插件包（步骤 2.5）；build-plugins 入口包装（default 导出 PluginModule）；git-explorer 宿主 import 改走 host-bridge（bundle 中 db 复制 97→0）。
- [x] **冷启动白屏改等待提示**：内嵌后端就绪前路由守卫挂起最长 30s，首屏此前纯白（用户："要等后端启动还是干嘛？"）。App.vue 加 yz-boot-splash（仅移动端、路由 isReady 即消失、深色适配、reduced-motion 友好）。

## P0 地基（零功能变化）✅ 2026-10-25 完成

- [x] `build/plugins.catalog.json`：9 现有内置插件 + 6 模式插件 + office-core（core:true）；字段 kind/label/requires/frontend/backend/assets/editions/desktopOnly/editionPresets。
- [x] `packages/core/src/plugin/types.ts`：manifest 增 `engine`、`ownedTables`，`ui` 放宽为 `string | { entry }`，contributes 增 `mode`（ModeContribution 类型）。
- [x] `packages/core/src/plugin/manifest.ts`：新字段轻量校验（mode.key kebab-case、engine semver range、ownedTables 表名合法）。
- [x] `apps/server/src/host-bridge.ts`：`@yz/server-host` dev 直连模块（db/createLogger/crypto/pushPluginAudit/路径工具白名单面）。
- [x] `apps/server/src/index.ts`：插件初始化处预留 `globalThis.__YZ_SERVER_HOST__` 注入（插件包装载 P1 启用）。
- [x] `packages/ui/src/plugin-host-bridge.ts`：挂 `window.__YZ_HOST__`（apiVersion + m 命名空间 + api 白名单），应用入口早期调用。
- [x] `packages/ui/src/plugin-runtime.ts`：装载器（快照 → 动态 import → 注册；web 回落 HTTP；失败 RouteFallback）。
- [x] `apps/desktop/main.cjs`：`yz://` 特权协议（shared shims + plugin 目录定位，dev/打包双路径，CORS 头）。
- [x] `apps/desktop/scripts/generate-host-shims.mjs`：枚举 vue/vue-router/pinia/element-plus/icons 命名导出生成 shim。
- [x] `apps/desktop/scripts/build-plugins.mjs`：后端 esbuild（alias @yz/server-host → shim、external 原生）+ 前端 vite lib（external 改写 yz://）+ manifest/assets 组包。
- [x] `apps/desktop` devDependencies 补 esbuild。
- [x] 守门测试：catalog 契约（office-core 恒在/条目合法/requires 无环）；shim 完备性（每个导出运行时非 undefined）；manifest 新字段校验。
- [x] 验收：server vitest（248 文件/3749 用例）+ desktop node --test（381 用例）+ `pnpm -r typecheck` 全绿；git-explorer/skins 插件包冒烟构建通过。
- 附带修复（基线既有问题，挡住全仓验收）：三处 workspace 补 `@types/node` 显式 devDependency（dgram.Socket 类型链断裂 → server 构建全堵）；ops-shell 流回调类型随新 @types/node 收紧；desktop 两个守门测试误红（块注释剥离被 `image/*` 通配符欺骗、full.yml 缺 electronLanguages）。

## P1 试点（git-explorer + skins 切插件包形态）—— 2026-10-25 主体完成

- [x] git-explorer 后端迁插件包形态：源码宿主 import 改走 `../host-bridge.js`（阻断 db.ts 单例被复制进包，实测 bundle 中 db 痕迹 97 → 0）；build-plugins 经入口包装（自动挑含 activate 的导出为 default，匹配装载器约定）。
- [x] server 内置插件装载新增「插件包扫描」路径（`plugins/builtin-packages.ts`）：`plugins/builtin/<id>/{manifest.json, backend/index.js}`，**包优先、源码兜底**；skins multi manifest（28 套）整包展开注册。
- [x] skins 插件包化：manifest multi + assets + noop 入口（`backendNoop`）。
- [ ] 导出 .yzp → 卸载 → 重装端到端验证（归入 P6 单独打包一并做）。
- [x] 打包脚本：builtin 目录进 extraResources（P1 全量拷，P5 按选）——三份 yml + electron-build.cjs 幂等补建 + build-all-editions 链路接入。
- [x] 验证：移动端真实拷贝树启动 —— git-explorer 以包装载 state=enabled 无错、28 套皮肤 enabled、0 激活失败；server/desktop 全量测试绿。
- 待办（P2 前置）：build-mobile-server.cjs 里把 builtin 拷贝写进脚本步骤（当前手工拷）；git-explorer 前端 bundle 化。

## P2 功能插件迁移 —— 2026-10-25 后端包化完成

- [x] computer-use：宿主 import（db/pushPluginAudit/isWithinRoot/serverState）改走 host-bridge → 插件包（宿主 db 零复制，自有建表 SQL 经桥执行）。
- [x] remote-control：宿主 import（pushPluginAudit/isWithinRoot）改走 host-bridge → 插件包；移动端以包形态注册（控制端）。
- [x] java-suite：runCmd 改走 host-bridge → 插件包。
- [x] index.ts 注册统一为 `registerPkgOrSource`（包优先、源码兜底），覆盖 git-explorer/computer-use/remote-control/java-suite。
- [ ] cicd-pipeline：**延至 P3** —— 运行时 import ops-shell 的连接池共享态（loadConnections/getSsh/getSftp），单独包化会出现第二个 ops-shell 模块实例、SSH 连接不共享；须与 ops-shell 同批包化或经桥暴露连接注册表。
- [ ] 前端 bundle 化（RemoteControl.vue/CicdConsole/JavaSuite 等）→ P2b，视图仍走构建期 PLUGIN_VIEW_LOADERS（manifest routes 组件字符串不变，包形态后端与编译期前端兼容）。
- [x] 验证：桌面 tsx 启动 4 插件包装载全 enabled（36 插件快照）；移动树 git-explorer/remote-control 包装载 enabled、computer-use 正确缺席、0 激活失败；server 250 文件全绿。
- [ ] 每个：.yzp 导出重装端到端（P6 一并做）。

## P3 模式运行时化 —— 2026-10-25 后端包化 + mode 元数据运行时化完成

- [x] ops-shell/sec-lab/shop-ops/cicd-pipeline 宿主导入改 host-bridge（含 ops-shell 一处**动态** import('../db.js')——grep 静态模式抓不到，曾把 db.ts 整图 293 文件卷进包）。
- [x] **构建器宿主边界硬闸**：build-plugins 的重定向升级为「宿主单例模块清单」（db/state/plugin-audit/logger/crypto/path-guard/exec-cmd/git）——任何导入形态（静态/动态/经插件自有 service 转发）一律重定向 shim；漏网新依赖构建期即报 No matching export（强制显式扩桥）。实测三轮抓出并扩桥：db 助手（dataDir/hasSqliteVec/消息摘要×3/任务类型/MESSAGE_LIST_COLS）+ path-guard 整面（17 导出）+ lookupOnPath。**终判：全部 8 插件包 better-sqlite3 零引用（db 单例零复制）**。
- [x] cicd-pipeline 包化：自带一份 ops-shell 助手拷贝（连接池独立、凭据同源 plugin_storage，功能等价；记录在案）。
- [x] index.ts：四插件注册切 registerPkgOrSource（包优先、源码兜底）。桌面启动验证：**8 插件全以包形态装载、36 快照 enabled、0 激活失败**。
- [x] **contributes.mode 运行时化（第一层）**：ops/sec/shop manifest 声明 mode（key/label/icon/route/desktopOnly/fallbackAgent）；/api/plugins 聚合 modeDefs 下发；前端 plugin store 存储 + mode.pluginModeMeta() 查询 + App.vue 切模式兜底智能体**优先读插件 manifest**（硬编码表降级为 dev/wf/clip 的回退）。已验证 modeDefs 下发三模式正确。
- [ ] 第二层（P4 一并）：新增模式 key 的完整运行时化（动态 addRoute/VALID_MODES 动态集合/新 key 不在 AppMode 联合）；modes.catalog.json 退役。
- [ ] 前端工作台 bundle 化（yz:// 装载）。
- 验证：server 251 文件/3765 用例 + desktop 385 全绿；桥快照测试随扩面更新（33 导出）。

## P4 新建三模式插件

- [x] **clip-mode 后端包化（2026-10-26）**：新增 `apps/server/src/plugins/clip-mode.ts`（manifest + `contributes.mode`(key=clip) + `contributes.routes`(/clip) + 后端路由挂载）。routes/clip.ts 与 services/clip-*、sfx-library、mcp/{ffmpeg,whisper}-runtime、subtitle-style 随插件包分发；接口前缀 `/api/clip` → **`/api/plugin/clip-mode`**（与 ops/sec/shop 同口径），前端调用点同步。宿主桥扩面 4 项（authMiddleware/hardDeleteRow/resolveArtifactDirFor/ensureArtifactDirFor），构建器宿主闸只收 artifact-dir（auth/lifecycle 无模块级状态，复制无害）。守门：clip-mode-plugin.test.ts（清单/装载表/路由挂载形状）+ host-bridge 快照（37 导出）。构建产物验证：better-sqlite3 引用 0、artifact-dir/lifecycle 未被复制。
- [ ] clip-mode 剩余：ClipWorkbench 转前端 bundle（yz:// 装载）；种子（剪辑师智能体/任务类型）归位。
- [x] **dev-mode / wf-mode 插件化（2026-10-26）**：新增 `plugins/dev-mode.ts` / `wf-mode.ts`（纯声明式，`backendNoop`）——只贡献 `contributes.mode` + `contributes.routes`（/code、/workflow），引擎与工具留基座。index.ts 经 registerPkgOrSource 注册；catalog 与 modes.catalog 同步（pluginId=dev-mode/wf-mode）。
- [x] **模式路由全部改为插件贡献**：router 删除静态 `MODE_ROUTE_TABLE`（dev/wf/clip 三条），改由 syncPluginRoutes 的 addRoute 提供；生成表把选中模式的工作台视图并入 PLUGIN_VIEW_LOADERS（`collectPluginViewFiles` 适配），`--modes` 裁剪语义不变。
- [x] **冷启动模式记忆补位**：三模式路由插件化后，首次导航必然早于 addRoute → 「模式记忆」闸不成立会停在 /chat。syncPluginRoutes 增加**仅首次同步**的 `restoreActiveModeRouteAfterSync()`（判据与守卫逐条对齐），pre-P4 行为不变。守门：coldStartRouteSync.test.ts 新增两组断言。
- [x] **前端 bundle 化（2026-10-26，三模式）**：ClipWorkbench / CodeWorkbench / WorkflowWorkbench 已由 `build-plugins --with-frontend` 打成 `frontend/index.mjs`（catalog `frontendBundle:true`），运行时经 `yz://plugin/<id>/frontend/index.mjs` 装载；路由 **bundle 优先、构建期装载表兜底**（没跑 --with-frontend 的包行为零变化）。
  - **宿主内部模块外置**：`stores/ composables/ api/ utils/` 的 import 构建期改写为 `yz://shared/host/<key>.mjs`，shim 从 `window.__YZ_HOST__.mods[key]` 取**宿主同一份实例**（否则 stores/mode 的 activeMode 会双份）。登记表 `packages/ui/src/host-modules.ts`（eager glob；目录清单真相源 host-shims.mjs 的 HOST_MODULE_DIRS）。
  - 构建器补 `lib` 模式（此前缺 lib 直接找 index.html 失败）+ `resolve.extensions` 的 .ts 优先（工作区 src 里残留过编译 .js，会遮蔽新导出）。
  - 守门：`host-modules-shim.test.cjs`（外置范围/单例转发/未登记报错）、`plugin-frontend-bundle.test.cjs`（bundle 视图 key ≡ manifest component、host shim 零缺失）、`pluginBundleRoute.test.ts`（bundle→装载表→兜底页的解析顺序）。
  - **已知代价**：共享组件随包复制（懒加载 chunk），三模式 frontend 分别 5.9 / 9.1 / 5.9 MB。下一步可把 `components/**` 也外置（需异步组件注册表），或按 `views` 依赖收窄。
- [ ] 前端 bundle 化收尾：真机/桌面实跑验证一次；确认后用 bundle 替代 `PLUGIN_VIEW_LOADERS` 并移除构建期视图（真正从主包裁掉）。
- [x] **种子归位第 1 片（2026-10-26）**：定义搬进插件目录、基座只做组合（落库顺序与 force_sync 行为逐字不变）：
  - 剪辑师（id/工具面/技能/提示词/seed 条目）→ `plugins/clip-mode/seed.ts`；`builtin-task-mode-agents.ts` 用 `...clipModeAgentDefs` 展开在原位置（数组末尾）。
  - 工作流场景 + 工作流助手智能体 → `plugins/wf-mode/seed.ts`；scene 展开在末尾、agent 展开在 seedAgents 第二条。
  - 代码开发场景 → `plugins/dev-mode/seed.ts`；展开在 shop 之后。
  - 共用工具集抽到中立模块 `builtin-task-tool-sets.ts`（基座与插件种子单向依赖，消除 ESM 循环）。
  - 守门：`mode-seed-home.test.ts`（定义在插件目录 + 组合顺序 + 基座不得再内联）；media-fetch-tools / conversation-self-config 的源码断言改读工具集模块。
- [x] **种子归位第 2 片（2026-10-26）**：ops/sec/shop 三条模式场景 + 专属智能体全部进插件目录：
  - `plugins/ops-shell/seed.ts`：运维场景 + 运维助手（工具面 plugin_ops-shell__*、skill、提示词、条目）。
  - `plugins/sec-lab/seed.ts`：安全场景 + 安全主助手与侦察/Web/报告三个子体。
  - `plugins/shop-ops/seed.ts`：店铺场景 + 店铺运营助手（原 `builtin-shop-agents.ts` 整体迁入并删除，引用改指新路径）。
  - 基座组合顺序逐条钉住：shop=13 / code=14 / ops=15 / sec=16 / wf=17（真库实测一致）。
- [ ] 种子归位剩余：`shop_*` 任务类型仍在 `packages/shared`（前端离线兜底与后端种子共用一份，拆分需先定兜底策略）；代码类智能体（codeAgent/子体）**经用户 2026-10-26 拍板留在基座**——它们被办公/任务模式复用，属全局能力、不可裁剪。
- [x] **运行时补种（2026-10-26，P5 前置）**：db.ts 抽出 `upsertAgentDefs` / `seedSceneDefs` / `applyBuiltinSeed`；基座场景只剩 13 条办公岗位卡，模式场景与专属智能体由插件 activate 补种（实测：仅 db 时 13 条场景 / 0 个模式智能体；六插件补种后 18 条、sort 0–17 与原状一致）。`resetBuiltin*` 与场景 key 保留集合改为「基座 + 已补种」动态视图；桥面 +1（applyBuiltinSeed，38 导出）。构建器宿主闸撤掉 auth / conversation-lifecycle（纯代码、复制无害），只留 artifact-dir 等有状态单例。
- [ ] 六模式全功能回归。

## P5 打包集成（2026-10-26 主体完成，未跑真实 electron-builder）

- [x] build-plugins `--plugins=<csv|all|分组>`：选择集解析走 `scripts/lib/plugin-selection.cjs`，只构建选中、**不删未选目录**，写 `build/build-plugins.json {included,excluded,source,out,builtAt}`；临时入口文件移到 `<out>/.yz-tmp/` 并清理（此前 `__frontend-entry-*.mjs` 会落在产物根、被拷进安装包）。
- [x] `apps/desktop/scripts/stage-plugins.mjs`（prune/restore/verify）+ `scripts/lib/plugin-stage.cjs` 纯逻辑：未选目录移入同级 `apps/server/plugins/.prune-hold/`（**先恢复上次崩溃残留**，未知目录不动，office-core 永不移动）；restore 时目标已存在则丢弃过期暂存副本。
- [x] electron-build 前置 prune → stage verify，`exit` 钩子 + 子进程 exit 双保险 restore；`YZ_SKIP_PLUGIN_PRUNE=1` 可跳过。build-all 逐档下发该档预设、并在并集选择集上跑一次 `verify-plugin-prune`（前端产物一份服务所有档，逐档扫会误报）。
- [x] `scripts/verify-plugin-prune.cjs`：目录断言（未选 id 目录不存在、选中 id 目录+manifest 齐全）+ 产物标记串扫描（用**视图组件名**，不用插件 id —— `/plugin/ops-shell/...` 字面量会误报）。
- [x] package.cjs `--plugins=`（分组/requires 自动勾选/office 锁定；与 `--modes` 同时给出以 `--plugins` 为准；非法即报错）；`--modes` 按 design §7 映射到插件（模式插件 + 全部非模式插件照旧带上）；`--list-plugins` / `--help` / dry-run 展示选择集与排除项。
- [x] `edition.json` 增 `plugins` / `pluginsExcluded`（`YZ_BUILD_PLUGINS` 优先，否则按档位预设）；`modes` 改由选中插件推导（显式 `YZ_BUILD_MODES` 只保留插件覆盖得到的部分）→ license 的三维交集（构建档 ∩ 授权档 ∩ 构建模式）继续成立。
- [x] 运行时消费：main.cjs 注入 `YZ_BUILD_PLUGINS_EXCLUDED`；server `registerPkgOrSource` 与 skins 分支跳过未选插件（源码兜底不再把"目录已移走"的插件拉起来）。`plugins/build-selection.ts` 纯函数 + 守门。
- [x] 前端同源裁剪：`select-modes --plugins=` 把未选插件的视图从生成表剔除（否则功能插件（不属任何模式）的 chunk 恒在主包，泄漏断言失真）。build-all 传并集。
- [ ] extraResources 按选拷贝：皮肤资产随 skins（已随 `builtin/skins/assets` 一起 prune ✓）、**python 运行时随 computer-use 未做**（`resources/python` 仍是 yml 无条件 extraResources）。
- [ ] lite/basic/pro 三档产物内容断言 + 冒烟（本机未跑真实 electron-builder；命令：`node scripts/package.cjs desktop:lite --plugins=... --dry-run` 先看计划）。
- [ ] 设计 §7 尾项：server tsc 仍编译全部插件源码（`apps/server/dist/.../plugins/*.js`），目前靠 `YZ_BUILD_PLUGINS_EXCLUDED` 运行时不注册兜底；主产物真正变薄待做。
- [ ] `android-mirror` 插件未登记进 `build/plugins.catalog.json`（历史遗漏）：它既不参与选择集裁剪，也永远不会被排除 —— 其 `views/plugin/AndroidMirror.vue` 恒在主包。

## P6 单独打包（2026-10-26 完成主体）

- [x] `scripts/package-plugin.cjs --id=X [--out=dist-plugins]` → `dist-plugins/X-<version>.yzp`：直接 zip `apps/server/plugins/builtin/<id>/`（与内置产物同源，无第二条构建路径）；纯逻辑在 `scripts/lib/package-plugin.cjs`（排除 `.yz-tmp` / `__frontend-entry-*` / `.prune-hold` / `node_modules` / 系统垃圾文件）；校验 manifest 存在、JSON 合法、单清单 id === 目录名；输出文件清单 + sha256。守门 `apps/desktop/test/package-plugin.test.cjs`（7 例）。实测 git-explorer（3.4KB/2 文件）、skins（20.7MB/488 文件）产物回读正常。
- [x] **manifest.engine 语义化校验**（本期关键闸）：宿主版本取应用版本（主进程 `app.getVersion()` 经 `YZ_HOST_VERSION` 注入 → dev 向上找 `apps/desktop/package.json` → server 包版本 → `0.0.0`）；`packages/core/src/plugin/semver.ts` 轻量 range 匹配（`^ ~ >= <= > < = ||`、裸 x.y、预发布规则，不新增依赖）；`/api/plugins/install/preview` 与 `/install` 共用解析即校验，不兼容/非法 range 均 400 并给出含双方版本的文案；**缺 engine = 兼容**（存量 .yzp 不受影响）。守门 `apps/server/test/plugin-install-guard.test.ts`（16 例：兼容/不兼容/缺字段/非法 range/宿主版本解析）。
- [x] **安装链路修复（挡住端到端的真问题）**：① 入口三态解析 `backend/index.js | manifest.main | index.js`（原实现固定 `main || index.js`，第一方 .yzp 装回来必激活失败）→ `apps/server/src/plugins/install-entry.ts`；② 安装失败回滚半成品目录（含多清单已注册的 id）；③ 卸载 installed 插件时删除安装目录；④ **多清单包（skins）安装支持**。
- [x] **多清单 .yzp 安装（2026-10-27）**：`{ id, multi: true, manifests: [...] }` 整包安装 —— 一个安装目录（名 = 包 id）承载多个插件，逐条 `registerInstalled`；重复检查覆盖包内全部 id；逐条 validateManifest + engine 闸（任一条不合格整包拒绝）；卸载某个 id 时**包内还有其它已注册 id 就保留目录**；重启恢复按清单逐条补绑（顺带修掉旧实现的 `index.js` 入口假设 —— 之前重启后已安装插件会变成 state=error）。构建器 `writeManifest` 给多清单包装补 `id` 字段；`scripts/lib/package-plugin.cjs` 校验包装 id 与目录名一致并回传 packageId。纯逻辑 `apps/server/src/plugins/installed-packages.ts` + 守门 `test/plugin-multi-install.test.ts`（10 例：扫描/卸载保留兄弟/最后一条删目录/重启补绑/入口缺失跳过）。**安装请求体上限**：全局 JSON 10MB 挡不住 skins 整包（base64 ≈ 28MB），仅对 `/api/plugins/install*` 放宽到 64MB（挂在全局解析器之前）。
- [x] **插件管理端到端**（临时 HTTP 脚本实测，服务端 `tsx` + 独立 DATA_DIR）：预览 → 安装 → 停用 → 启用 → 卸载（目录消失）→ 再装 全通；多清单包同流程实测：整包安装两个插件、停用其一不影响另一个、卸载其一目录保留、卸最后一个目录删除；失败态文案实测：版本不兼容（preview 与 install 均 400）、重名 409、坏 zip 400、缺 manifest 400、缺后端入口 400（均不留目录）、多清单缺包 id 400。另用真实 `git-explorer-1.0.0.yzp` 验证「卸载内置 → 装回分发包」后 `state=enabled / source=installed / error 无`；重启服务端后仍 `enabled` 且无激活错误（入口补绑走 backend/index.js）。**真实 skins 整包**（20.7MB/28 套）实测：preview/install 200、28 套全 enabled、卸载一套目录保留且余 27 套正常、卸完最后一套目录删除。
- [x] **前端入口字段补齐（2026-10-27）**：构建器在前端 bundle 成功产出后把 `ui.entry` + `contributes.mode.entry`（mode 插件）写进打包 manifest（单/数组/多清单三种形态），此前该链路是死代码、永远回落构建期装载表。守门：`plugin-frontend-bundle.test.cjs` 增「有 bundle 必有入口字段」。顺带修 `scripts/lib/package-plugin.cjs` 的排除规则：`__frontend-entry-*` 只在**包根**算历史残留，`frontend/` 里的同名文件是 vite 产物分块（`index.mjs` 会 import 它），按任意层级排除会把插件前端打残。
- [x] **模板同步改自动发现**：`scripts/sync-plugin-templates.mjs` 删掉手维护 `ENTRIES`，改按模板文件里的 `generated:<id>` 标记发现，源码路径按 `catalog.backendEntry → plugins/<id>/index.ts → plugins/<id>.ts` 解析，常量名沿用区块内已有名字。**不做全量生成**：`ops-shell`(4280 行)/`shop-ops`(3205 行) 等全抄进来会让模板文件与后端产物 +约 700KB 且把全部内置插件变成源码分发出口（取舍见脚本头注释）。顺带把过期的 computer-use 模板同步成 host-bridge 写法（实测该模板已漂移）。
- [x] 补充：导出源码**优先读真实源码**（dev 下永远导出当前文件），读不到才回落内嵌快照（打包版唯一来源）；一致性由 `apps/server/test/plugin-templates-sync.test.ts` 钉死（内嵌 === 磁盘，忘同步即红）。

## P7 收尾（2026-10-27 完成主体）

- [x] **插件目录互导 lint**：`apps/server/test/plugin-isolation.test.ts` —— `plugins/<dir>/**` 禁止跨目录 import，目录只能引用本插件 owner 前缀的根级模块（`sec-lab-tools → sec-lab-*` 合规）；`templates/` 是源码字符串容器不参与扫描。已用探针验证能抓违规。
- [x] **全档打包冒烟（2026-10-27 重打）**：`build-all-editions.cjs` 三档全出（lite 10:43 / basic 10:55 / pro 11:07，均 387–392MB），`verify-edition-contents.cjs` 三档全 ✓，`__frontend-entry-*.mjs` 残留清零；产物内模式插件 manifest 带 `ui.entry`、`shared/`（65 个 host shim）随包（basic：dev/wf；pro：dev/clip/wf）。★ pro 目录仍留有一份 2026-10-23 的旧命名产物 `yan-zhi-Setup-0.1.0-x64-pro-office-ops-shop.exe`（历史遗留，非本轮产出）。
- [x] **全档安装包内容清单断言**：`scripts/verify-edition-contents.cjs` —— 逐档核对 builtin 目录集合 ≡ 预设选择集、选中插件 manifest 齐全、skins/assets 非空、**根下不得有文件**。首跑即发现在历史三档产物里各有 3 个 `__frontend-entry-*.mjs` 残留（旧构建器产物；构建器已改为每次构建前清理根下这类文件，本地 builtin 已清）。现网 exe 是修复前构建的，下次打包即清零。
- [x] **CHANGELOG + 开发者文档**：`CHANGELOG.md` Unreleased Added 条目；`docs/plugin-package-spec.md`（包形态/manifest 字段/桥面白名单/构建与打包/安装规则/守门测试索引）。
- [ ] （可选）skinSeries 并入 skins 插件评估（本期未动：双皮肤体系并存，评估无结论前不合并）。
- [x] **Web/移动端 HTTP 装载（2026-10-27）**：前端 shim 改**随包复制**（`<pkg>/shared/`，bundle 用相对路径 `../shared/…`，同一份产物 yz:// 与 HTTP 双通，.yzp 自包含）；`/api/plugin-assets/:id/*` 放开 `frontend/*.mjs|css|json` 与内置包目录（MIME/防穿越/代码不缓存）。实测：内置与已安装插件的 `frontend/index.mjs`、`shared/vue.mjs`、`style.css` 均 200 且 MIME 正确；穿越 400、未知插件 404；`.yzp` 内含 65 个 host shim + 入口分块。**未做**：真实浏览器里切到模式工作台的 UI 实跑（本机预览面板未启用），当前以「端点 + 包内自包含 + 视图 key」三类断言代替。

---

# 🤝 接管指南（2026-10-25 交接，供后续智能体接手；2026-10-26 P4 首个切片已续作）

## 当前状态（P0-P3 已提交；P4 首个切片见下）

- **P0-P3 完成**：8 个内置插件（git-explorer/computer-use/remote-control/java-suite/ops-shell/cicd-pipeline/sec-lab/shop-ops）+ 28 套皮肤全部以「预构建插件包」形态运行（`apps/server/plugins/builtin/<id>/`，包优先、源码兜底）。
- **模式运行时化第一层完成**：ops/sec/shop 的 manifest 带 `contributes.mode`，`/api/plugins` 聚合 `modeDefs` 下发，前端 `pluginModeMeta()`（stores/mode.ts）查询，App.vue 切模式兜底智能体优先读插件声明。
- **P4 首个切片（2026-10-26）**：clip-mode（后端接口 /api/plugin/clip-mode + /clip 路由）、dev-mode、wf-mode 三个模式插件落地；**六模式路由全部由插件 contributes.routes 提供**（router 里已无静态模式路由表）；宿主桥扩到 37 导出（authMiddleware/hardDeleteRow/resolveArtifactDir/ensureArtifactDir）；冷启动「模式记忆」在首次插件路由同步后补位；**种子归位两片完成**（剪辑师/工作流/代码/运维/安全/店铺 六套种子全部进各自插件目录，基座只组合；代码类智能体按用户拍板留基座=全局能力）。**三模式前端 bundle 化完成**（yz:// 装载 + 宿主模块外置 + 兜底链）；**运行时补种完成**（未装插件 = 种子不存在，P5 可直接按插件裁剪）。剩余：真机实跑确认后移除构建期视图、shop_* 任务类型归属、P5 打包可选、P6 .yzp、运行时化第二层。
- **插队修复（真机已验证）**：移动端免激活（license MOBILE_MODE 恒 pro 全量）、路由死循环三道闸（dev 恢复→/chat↔/code 循环→空白）、冷启动等待提示页、experience.ts 的 `\p{}` 正则炸老 V8（运行时特性检测回落）、远程控制移动端可达（设置列表直达项 + /remote 应用内跳转）、工作目录移动预设形态。
- **P6 完成（2026-10-26）**：单独打包 `scripts/package-plugin.cjs`（.yzp 与内置产物同源）、engine 兼容闸（宿主版本 = 应用版本，缺 engine 放行）、安装链路四修（入口三态/失败回滚/卸载删目录/多清单明确拒绝）、插件管理端到端实测全通、模板同步改标记发现 + 内嵌/磁盘一致性守门。
- 测试基线：server 251 文件/3765 用例、desktop 385 用例、`pnpm -r typecheck` 全绿。

## 关键文件地图

| 主题 | 文件 |
|---|---|
| 方案（唯一真相源） | `build/plugins.catalog.json` + 本目录三份文档 |
| 插件构建器 | `apps/desktop/scripts/build-plugins.mjs`（含**宿主边界硬闸**：db/state/auth/audit/logger/crypto/path-guard/exec-cmd/git/artifact-dir/conversation-lifecycle 任何导入形态一律重定向 shim，漏网新依赖构建期报 No matching export → 需扩桥） |
| 共享 shim 生成 | `apps/desktop/scripts/generate-host-shims.mjs` + `scripts/lib/host-shims.mjs`（改桥面后必跑；测试 host-shims.test.cjs 钉完备性） |
| 宿主桥 | `apps/server/src/host-bridge.ts`（**38 导出**，P4 增 authMiddleware/hardDeleteRow/resolveArtifactDirFor/ensureArtifactDirFor；扩面三同步：本文件 + design.md §6 + test/host-bridge.test.ts 快照） |
| 包扫描装载 | `apps/server/src/plugins/builtin-packages.ts`（plugins/builtin 目录 → registerBuiltin；index.ts 里 registerPkgOrSource 统一切换） |
| 前端桥/装载器 | `packages/ui/src/plugin-host-bridge.ts`（window.__YZ_HOST__）、`plugin-runtime.ts`（yz:// 装载，**尚未接线到真实插件**——P4 用） |
| yz:// 协议 | `apps/desktop/plugin-protocol.cjs`（纯函数有单测）+ main.cjs protocol.handle |
| 打包链 | electron-build.cjs / build-all-editions.cjs 自动跑 build-plugins；三份 electron-builder yml 拷 `plugins/builtin`；build-mobile-server.cjs 步骤 2.5 同步拷入移动端 |
| 插件选择集（P5） | `scripts/lib/plugin-selection.cjs`（规则）+ `apps/desktop/scripts/lib/plugin-build-selection.cjs`（统一解析：参数 > env > 档位预设；多档并集 / modeKeys） |
| 插件目录暂存（P5） | `apps/desktop/scripts/lib/plugin-stage.cjs`（prune/restore/verify 纯逻辑）+ `apps/desktop/scripts/stage-plugins.mjs`（CLI）；暂存区 `apps/server/plugins/.prune-hold/` |
| 裁剪泄漏断言（P5） | `scripts/verify-plugin-prune.cjs`（目录 + 产物标记串；读 `build/build-plugins.json` 兜底） |
| 打包选择集产物 | `build/build-plugins.json`（included/excluded/source/out/builtAt，gitignore） |
| 单独打包 .yzp（P6） | `scripts/package-plugin.cjs`（CLI）+ `scripts/lib/package-plugin.cjs`（目录/排除/校验纯逻辑） |
| engine 兼容闸（P6） | `apps/server/src/plugins/host-version.ts`（宿主版本 + 校验文案）+ `packages/core/src/plugin/semver.ts`（轻量 range） |
| .yzp 安装入口 | `apps/server/src/plugins/install-entry.ts`（backend/index.js → manifest.main → index.js） |
| 已安装包语义（P6） | `apps/server/src/plugins/installed-packages.ts`（扫描/多清单/卸载删目录/重启补绑） |
| 源码模板同步 | `scripts/sync-plugin-templates.mjs`（发现 generated 标记）+ `templates/index.ts`；一致性守门 `test/plugin-templates-sync.test.ts` |

## 常用命令

```bash
node apps/desktop/scripts/build-plugins.mjs --all --out=apps/server/plugins/builtin   # 重建全部插件包（后端）
node apps/desktop/scripts/build-plugins.mjs --all --with-frontend --out=apps/server/plugins/builtin  # 含前端 bundle（catalog.frontendBundle 的插件）
node apps/desktop/scripts/build-plugins.mjs --plugins=office-core,skins --out=apps/server/plugins/builtin  # 只构建选中（写 build/build-plugins.json）
node apps/desktop/scripts/stage-plugins.mjs prune|restore|verify --plugins=office-core,skins   # 未选插件目录暂存/恢复/断言
node scripts/verify-plugin-prune.cjs --plugins=office-core,skins [--dirs=apps/desktop/dist]     # 裁剪泄漏断言
node scripts/verify-edition-contents.cjs [--editions=lite,basic,pro]                          # 打包后内容清单断言（目录集合/manifest/残留文件）
node scripts/package.cjs desktop:lite --plugins=office-core,skins --dry-run                     # 先看选择集与排除项
node scripts/select-modes.cjs --modes=office --plugins=office-core,skins                      # 生成表（未选插件视图也剔除）
node scripts/package.cjs android --yes                                                # 出安卓 APK
node scripts/package-plugin.cjs --id=git-explorer [--out=dist-plugins]                # 单独打 .yzp（含文件清单+sha256）
node scripts/sync-plugin-templates.mjs                                               # 同步内嵌源码模板（按 generated 标记发现）
(cd apps/server && pnpm test) ; (cd apps/desktop && pnpm test)                        # 回归
```

## 后续任务（按序）

### P4 三模式插件新建 + 运行时化第二层（下一步）
1. 新建 `apps/server/src/plugins/clip-mode.ts` / `dev-mode.ts` / `wf-mode.ts`（后端）：clip 把 routes/clip.ts + services/clip-* + sfx-library + mcp/{ffmpeg,whisper}-runtime 迁入（manifest 声明 `contributes.mode` + ownedTables）；dev/wf 主要是视图+种子（引擎留 packages/core）。
2. **运行时化第二层**（用户核心诉求"装了就有"）：前端 mode store 按 modeDefs 动态合并**新模式 key**（AppMode 联合放宽为 string）；router 对插件模式 `addRoute`（走现有 syncPluginRoutes 机制，component 需先落 P4b 前端 bundle 化经 yz:// 装载）；conversations.ts VALID_MODES 改"基座+已注册插件模式"动态集合（**SQL 一字不动**，conversation-mode.test.ts 钉着）。
3. modes.catalog.json 退役（模式字段并入 plugins.catalog.json；select-modes/verify-mode-prune 适配）。

### P5 打包可选（2026-10-26 主体完成，剩 extraResources 按选 + 整包冒烟）
- package.cjs `--plugins=` ✅（分组 / requires 闭包 / office 锁定；`--modes` 兼容映射）。
- 插件目录 prune/restore/verify ✅、verify-plugin-prune ✅（已接进 build-all 的 electron-builder 之前）。
- extraResources 按选：皮肤资产随 skins ✅（assets 在插件目录内）、**python 运行时随 computer-use ❌ 未做**。
- 整包冒烟（三档产物内容断言）未跑 —— 需真实 electron-builder（约 3 分钟/档）。

### P6 单独打包 .yzp（2026-10-27 已完成）
- `scripts/package-plugin.cjs --id=X` ✅；engine 语义化校验 ✅（宿主版本 = 应用版本，缺 engine 放行）；安装端到端 ✅；多清单包安装 ✅；模板同步自动发现 ✅。剩余缺口见上方 P6 章节尾注（.yzp 前端入口字段）。

### P7 收尾
- 插件目录互导 lint；全档打包冒烟断言；CHANGELOG；皮肤双体系评估合并。

## 已知坑（新接手必读）

1. **宿主边界硬闸会拦新依赖**：插件要用新的宿主能力 → 先在 host-bridge.ts 扩导出（三同步，见上表），不是绕过它。
2. **内嵌后端（nodejs-mobile）V8 很老**：`\p{}` 正则等新语法解析即崩（表现为"移动端数据全没"——后端起不来）。新增 server 代码避免新语法，或运行时特性检测回落（见 experience.ts 范式）。
3. **移动端调试配方**（已打通）：无线 adb（`adb connect 192.168.5.70:5555`，MIUI 需关「系统优化」才能 adb 安装）→ `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` → CDP WebSocket 直接 evaluate 页面 DOM（真机 UI 验证的标准手段；uiautomator 抓不到 WebView 内容）。
4. **合成 click 在真机不可靠**、`input tap` 被 MIUI 拦（需「USB 调试(安全设置)」，也要 SIM）——页面验证用 CDP evaluate / location.hash。
5. cicd-pipeline 包内自带一份 ops-shell 助手拷贝（连接池独立、凭据同源 plugin_storage）——功能等价，若未来要共享池，经桥暴露连接注册表。
6. 别的任务的并行改动：feishu-stream.ts / scripts/package.cjs / 移动端管理页UI优化方案.md 单独一笔提交，勿混。
7. **前端 bundle 两个构建坑**（2026-10-26 实测）：① `build.lib` 不配会去找 `index.html` 直接失败；② 工作区 `packages/shared/src` 里残留过编译的 `.js`（如 index.js，缺新导出），Vite 默认 `.js` 先于 `.ts`，会把 `findProviderPreset` 这类新导出解析没 —— 已在 buildFrontend 里把 `resolve.extensions` 调成 `.ts` 优先。根因是工作区里的陈旧产物，清掉更干净。
8. **P5 裁剪的可恢复性**（2026-10-26）：未选插件目录是**移**到 `apps/server/plugins/.prune-hold/`，不是删。prune 开头先恢复上次残留；restore 遇到目标已存在（本轮重新构建过）会丢弃过期暂存副本。electron-build 有 `process.on('exit')` + 子进程 exit 双保险；`YZ_SKIP_PLUGIN_PRUNE=1` 可整段跳过。开发中若发现 builtin 少了插件目录，先跑 `stage-plugins.mjs restore`。
9. **多档构建的断言边界**：vite 只编一次（前端产物 = 各档并集），所以**文本泄漏断言只在并集选择集上做一次**（build-all）；逐档 electron-build 只做目录断言 —— 逐档扫文本必然误报（lite 包里当然有 pro 的 chunk）。
10. **build-plugins 的临时目录必须在 `--out` 内**：入口 stub 用 `packages:'external'` 打包，bare import（simple-git 等）要靠目录上溯解析到 server 的 node_modules；放系统 temp 会 `ERR_MODULE_NOT_FOUND`。现放在 `<out>/.yz-tmp/`，finally 整目录删除（此前临时入口落在产物根，会被 extraResources 拷进包）。
11. **`--modes` 不再只是"裁前端"**（P5 起）：package 按 design §7 映射成插件选择集（模式插件 + 全部非模式插件照旧带上），后端插件目录也随之裁剪；只想裁前端请用 `YZ_SKIP_PLUGIN_PRUNE=1`。
12. **多清单包必须有包 id**（2026-10-27）：`{ id, multi, manifests }` 的顶层 id 就是安装目录名；缺 id 的 .yzp（旧构建产物/数组形态）安装端直接拒绝。一个目录承载多个插件 → 卸载其中一个时目录要保留（`packageDirsToRemove`），重启恢复要按清单逐条补绑（`installedRebinds`）—— 别再按"目录名 === 插件 id"写任何新逻辑。
13. **源码模板有两份**（内嵌快照 + 真实 .ts）：安装包不带 .ts，导出功能在打包版只能读内嵌快照；dev 下路由优先读磁盘。两份不许漂移 —— `test/plugin-templates-sync.test.ts` 钉着（改插件源码必须重跑 `node scripts/sync-plugin-templates.mjs`，否则测试红）。
15. **前端 shim 必须随包、用相对路径**（2026-10-27）：bundle 的外置依赖写成 `../shared/…`，构建时把 `apps/desktop/host-shims/` 复制进 `<pkg>/shared/`。写死 `yz://shared/…` 只有 Electron 能解析，Web/移动端直接失败；另外 `.yzp` 排除规则里 `__frontend-entry-*` 只在**包根**算残留，`frontend/` 内的同名文件是 vite 产物分块（index.mjs 依赖它）。
14. **宿主版本从主进程注入**（P6）：打包版 resources 里没有 `apps/desktop/package.json`，`YZ_HOST_VERSION` 由 main.cjs 用 `app.getVersion()` 注入；漏注入时后端回落到 server 包版本或 `0.0.0` —— 后者会让所有带 engine 的 .yzp 被拒（宁可显式失败，也不误装）。
