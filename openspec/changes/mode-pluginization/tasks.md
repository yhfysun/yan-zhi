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

- [ ] clip-mode：routes/clip.ts + services/clip-* + sfx-library + mcp/ffmpeg-runtime、whisper-runtime、subtitle-style 迁入；ClipWorkbench 转 bundle；种子（剪辑师智能体/任务类型）归位。
- [ ] dev-mode：CodeWorkbench 转 bundle；code 种子智能体/场景归位（code 工具留 packages/core 基座）。
- [ ] wf-mode：WorkflowWorkbench 转 bundle；wf 种子归位（workflow 引擎留基座）。
- [ ] builtin-task-mode-agents/builtin-scene-defs/builtin-task-type-defs 按模式拆分归位。
- [ ] 六模式全功能回归。

## P5 打包集成

- [ ] package.cjs `--plugins=` 多选（分组/requires 自动勾选/office 锁定）+ `--modes=` 兼容映射。
- [ ] extraResources 按选拷贝（皮肤资产随 skins、python 随 computer-use）；三档 preset 改插件集。
- [ ] verify-plugin-prune：未选插件产物不进安装包断言。
- [ ] edition.json 增 plugins 字段 → YZ_BUILD_PLUGINS → license 交集联动。
- [ ] lite/basic/pro 三档产物内容断言 + 冒烟。

## P6 单独打包

- [ ] `scripts/package-plugin.cjs --id=X` → dist-plugins/X-<version>.yzp（与内置同源产物）。
- [ ] 插件管理页端到端：安装/启停/卸载/再装；engine 语义化校验拒绝不兼容宿主。
- [ ] 模板同步 sync-plugin-templates.mjs ENTRIES 改目录枚举。

## P7 收尾

- [ ] 插件目录互导 lint（plugins/<id>/ 之间禁 import）。
- [ ] 全档打包冒烟 + 安装包内容清单断言。
- [ ] CHANGELOG + 开发者文档（插件包规范/桥面白名单/构建器用法）。
- [ ] （可选）skinSeries 并入 skins 插件评估；（可选）web 端 HTTP 装载。

---

# 🤝 接管指南（2026-10-25 交接，供后续智能体接手）

## 当前状态（全部已提交，测试全绿）

- **P0-P3 完成**：8 个内置插件（git-explorer/computer-use/remote-control/java-suite/ops-shell/cicd-pipeline/sec-lab/shop-ops）+ 28 套皮肤全部以「预构建插件包」形态运行（`apps/server/plugins/builtin/<id>/`，包优先、源码兜底）。
- **模式运行时化第一层完成**：ops/sec/shop 的 manifest 带 `contributes.mode`，`/api/plugins` 聚合 `modeDefs` 下发，前端 `pluginModeMeta()`（stores/mode.ts）查询，App.vue 切模式兜底智能体优先读插件声明。
- **插队修复（真机已验证）**：移动端免激活（license MOBILE_MODE 恒 pro 全量）、路由死循环三道闸（dev 恢复→/chat↔/code 循环→空白）、冷启动等待提示页、experience.ts 的 `\p{}` 正则炸老 V8（运行时特性检测回落）、远程控制移动端可达（设置列表直达项 + /remote 应用内跳转）、工作目录移动预设形态。
- 测试基线：server 251 文件/3765 用例、desktop 385 用例、`pnpm -r typecheck` 全绿。

## 关键文件地图

| 主题 | 文件 |
|---|---|
| 方案（唯一真相源） | `build/plugins.catalog.json` + 本目录三份文档 |
| 插件构建器 | `apps/desktop/scripts/build-plugins.mjs`（含**宿主边界硬闸**：db/state/audit/logger/crypto/path-guard/exec-cmd/git 任何导入形态一律重定向 shim，漏网新依赖构建期报 No matching export → 需扩桥） |
| 共享 shim 生成 | `apps/desktop/scripts/generate-host-shims.mjs` + `scripts/lib/host-shims.mjs`（改桥面后必跑；测试 host-shims.test.cjs 钉完备性） |
| 宿主桥 | `apps/server/src/host-bridge.ts`（33 导出；扩面三同步：本文件 + design.md §6 + test/host-bridge.test.ts 快照） |
| 包扫描装载 | `apps/server/src/plugins/builtin-packages.ts`（plugins/builtin 目录 → registerBuiltin；index.ts 里 registerPkgOrSource 统一切换） |
| 前端桥/装载器 | `packages/ui/src/plugin-host-bridge.ts`（window.__YZ_HOST__）、`plugin-runtime.ts`（yz:// 装载，**尚未接线到真实插件**——P4 用） |
| yz:// 协议 | `apps/desktop/plugin-protocol.cjs`（纯函数有单测）+ main.cjs protocol.handle |
| 打包链 | electron-build.cjs / build-all-editions.cjs 自动跑 build-plugins；三份 electron-builder yml 拷 `plugins/builtin`；build-mobile-server.cjs 步骤 2.5 同步拷入移动端 |

## 常用命令

```bash
node apps/desktop/scripts/build-plugins.mjs --all --out=apps/server/plugins/builtin   # 重建全部插件包
node scripts/package.cjs android --yes                                                # 出安卓 APK
(cd apps/server && pnpm test) ; (cd apps/desktop && pnpm test)                        # 回归
```

## 后续任务（按序）

### P4 三模式插件新建 + 运行时化第二层（下一步）
1. 新建 `apps/server/src/plugins/clip-mode.ts` / `dev-mode.ts` / `wf-mode.ts`（后端）：clip 把 routes/clip.ts + services/clip-* + sfx-library + mcp/{ffmpeg,whisper}-runtime 迁入（manifest 声明 `contributes.mode` + ownedTables）；dev/wf 主要是视图+种子（引擎留 packages/core）。
2. **运行时化第二层**（用户核心诉求"装了就有"）：前端 mode store 按 modeDefs 动态合并**新模式 key**（AppMode 联合放宽为 string）；router 对插件模式 `addRoute`（走现有 syncPluginRoutes 机制，component 需先落 P4b 前端 bundle 化经 yz:// 装载）；conversations.ts VALID_MODES 改"基座+已注册插件模式"动态集合（**SQL 一字不动**，conversation-mode.test.ts 钉着）。
3. modes.catalog.json 退役（模式字段并入 plugins.catalog.json；select-modes/verify-mode-prune 适配）。

### P5 打包可选（用户需求 2 完全体）
- package.cjs 加 `--plugins=` 多选（分组：模式/皮肤/功能；requires 自动勾选；office-core 锁定）；`--modes=` 兼容映射。
- extraResources 按选裁剪（builtin 目录按选择拷；皮肤资产随 skins、python 运行时随 computer-use——用 catalog 的 extraResources 字段）。
- verify-plugin-prune：断言未选插件的目录/chunk 不进包。

### P6 单独打包 .yzp（用户需求 3）
- `scripts/package-plugin.cjs --id=X`：zip plugins/builtin/X → dist-plugins/X-<ver>.yzp；插件管理页安装端到端（registerInstalled 链路已有）；engine 语义化版本校验。

### P7 收尾
- 插件目录互导 lint；全档打包冒烟断言；CHANGELOG；皮肤双体系评估合并。

## 已知坑（新接手必读）

1. **宿主边界硬闸会拦新依赖**：插件要用新的宿主能力 → 先在 host-bridge.ts 扩导出（三同步，见上表），不是绕过它。
2. **内嵌后端（nodejs-mobile）V8 很老**：`\p{}` 正则等新语法解析即崩（表现为"移动端数据全没"——后端起不来）。新增 server 代码避免新语法，或运行时特性检测回落（见 experience.ts 范式）。
3. **移动端调试配方**（已打通）：无线 adb（`adb connect 192.168.5.70:5555`，MIUI 需关「系统优化」才能 adb 安装）→ `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` → CDP WebSocket 直接 evaluate 页面 DOM（真机 UI 验证的标准手段；uiautomator 抓不到 WebView 内容）。
4. **合成 click 在真机不可靠**、`input tap` 被 MIUI 拦（需「USB 调试(安全设置)」，也要 SIM）——页面验证用 CDP evaluate / location.hash。
5. cicd-pipeline 包内自带一份 ops-shell 助手拷贝（连接池独立、凭据同源 plugin_storage）——功能等价，若未来要共享池，经桥暴露连接注册表。
6. 别的任务的并行改动：feishu-stream.ts / scripts/package.cjs / 移动端管理页UI优化方案.md 单独一笔提交，勿混。
