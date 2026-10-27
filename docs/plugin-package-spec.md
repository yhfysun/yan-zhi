# 插件包规范与开发指南（mode-pluginization / P0–P7）

> 真相源：`build/plugins.catalog.json`（打包选择集）+ `packages/core/src/plugin/types.ts`（manifest 类型）
> + `apps/server/src/host-bridge.ts`（桥面白名单）。本文只做索引与约定说明，冲突时以上述文件为准。

## 1. 包形态

内置与用户安装的磁盘结构完全一致：

```
plugins/<builtin|installed>/<id>/
  manifest.json        # 单清单，或多清单包装 { id, multi: true, count, manifests: [...] }
  backend/index.js     # esbuild 打包的后端入口（纯声明式插件可为空实现）
  frontend/index.mjs   # vite lib 构建的前端 bundle（无界面插件可无）
  assets/…             # 皮肤壁纸等静态资源（skins）
```

- 内置：`apps/server/plugins/builtin/<id>/`（dev）；打包后 `resources/server/dist/plugins/builtin/<id>/`。
  放在 server dist 下，bare import 才能沿目录上溯解析到 `resources/server/node_modules`。
- 已安装：`apps/server/plugins/installed/<包 id>/`（运行时数据，不入库）。
- 多清单包（skins）：**顶层 `id` 就是安装目录名**；卸载其中一个插件时，包内还有其它已注册插件则保留目录。

## 2. manifest 关键字段

| 字段 | 说明 |
|---|---|
| `id` | kebab-case，插件唯一 id（多清单包装的顶层 id 是包 id） |
| `version` | 必填；`.yzp` 文件名用它 |
| `engine` | 宿主兼容范围（语义化 range，如 `^0.1`）。**缺省 = 兼容**；不兼容时安装被拒 |
| `ownedTables` | 插件自有 SQL 表白名单（沙箱 db 只放行这些表 + plugin_storage） |
| `ui` | `{ entry }`：前端 bundle 入口；字符串为旧形态（保留兼容） |
| `contributes.mode` | 模式插件声明（key/label/route/entry/desktopOnly/fallbackAgent） |
| `contributes.routes` / `tools` / `themes` / … | 扩展点，见 types.ts |
| `permissions` | `fs / shell / git / db / network / clipboard / desktop-input / remote-shell / shop-write`（新增必须同步 VALID_PERMS） |

校验在 `packages/core/src/plugin/manifest.ts`：非法即抛（注册层不允许带病运行）。

## 3. 后端边界：宿主桥

插件对宿主能力的 import 一律走 `@yz/server-host`：

- dev/源码形态 → tsconfig paths 指向 `apps/server/src/host-bridge.ts`（直接 re-export）；
- 插件包形态 → 构建器把别名换成 shim，shim 读 `globalThis.__YZ_SERVER_HOST__`。

桥面当前 38 个导出，类别：db（受 ownedTables 约束）、createLogger、crypto、pushPluginAudit、
路径工具（PLUGINS_DIR / resolveBuiltinAssetsDir / resolveArtifactDirFor / ensureArtifactDirFor）、
path-guard 整面、exec-cmd（runCmd / lookupOnPath）、git、applyBuiltinSeed（运行时补种）、
authMiddleware / hardDeleteRow 等。**扩面三同步**：`host-bridge.ts` + `design.md §6` +
`apps/server/test/host-bridge.test.ts` 快照。

构建器的「宿主边界硬闸」只拦**有状态的宿主单例**（db/state/plugin-audit/logger/crypto/path-guard/
exec-cmd/git/artifact-dir）：任何导入形态都会被重定向，漏网新依赖会在构建期报
`No matching export` —— 此时应扩桥，而不是绕过。

插件目录之间**禁止互相 import**（`apps/server/test/plugin-isolation.test.ts`）；
共享能力走宿主桥或抽中立模块。

## 4. 构建与打包

```bash
# 全部插件（后端）
node apps/desktop/scripts/build-plugins.mjs --all --out=apps/server/plugins/builtin
# 含前端 bundle（catalog.frontendBundle: true 的插件）
node apps/desktop/scripts/build-plugins.mjs --all --with-frontend --out=apps/server/plugins/builtin
# 按选择集只构建选中项（office-core 锁定、requires 闭包、非法报错）
node apps/desktop/scripts/build-plugins.mjs --plugins=office-core,skins

# 裁剪：未选插件目录移入 apps/server/plugins/.prune-hold/（可恢复；崩溃残留下次先恢复）
node apps/desktop/scripts/stage-plugins.mjs prune|restore|verify --plugins=office-core,skins
node scripts/verify-plugin-prune.cjs --plugins=office-core,skins

# 单独打 .yzp（与内置产物同源）
node scripts/package-plugin.cjs --id=git-explorer [--out=dist-plugins]
```

产物：`dist-plugins/<id>-<version>.yzp`，脚本会打印文件清单与 sha256。

## 5. 安装规则（/api/plugins/install）

- 请求体：`{ base64 }`（安装/预览单条路径放宽到 64MB —— skins 整包 base64 ≈ 28MB）。
- 校验顺序：zip 里找 `manifest.json` → 解析形态 → `validateManifest` 逐条 → `engine` 与宿主版本比对
  → 重复 id 检查（多清单包覆盖包内全部 id）→ 解压 → 入口三态解析（`backend/index.js` → `manifest.main`
  → `index.js`）→ 逐条注册。
- 失败即回滚：注销已注册 id 并删掉半成品目录。
- 卸载：删除 DB 行；已安装插件连带删目录（多清单包保留仍有兄弟插件的目录）。
- 重启恢复：扫描 `plugins/installed/*`，按清单逐条补绑入口（不能假设目录名 === 插件 id）。

## 6. 守门测试

| 主题 | 文件 |
|---|---|
| catalog 契约 | `apps/server/test/plugin-catalog.test.ts` |
| manifest 新字段 | `apps/server/test/plugin-manifest-extensions.test.ts` |
| 安装闸（engine/入口） | `apps/server/test/plugin-install-guard.test.ts` |
| 多清单安装语义 | `apps/server/test/plugin-multi-install.test.ts` |
| 桥面快照 | `apps/server/test/host-bridge.test.ts` |
| 插件目录互导 | `apps/server/test/plugin-isolation.test.ts` |
| 源码模板一致性 | `apps/server/test/plugin-templates-sync.test.ts` |
| .yzp 打包纯逻辑 | `apps/desktop/test/package-plugin.test.cjs` |
| 裁剪/暂存 | `apps/desktop/test/plugin-stage.test.cjs`、`plugin-selection.test.cjs` |
| 安装包内容清单（打包后） | `scripts/verify-edition-contents.cjs` |

改了插件源码里的**导出模板**对应文件后，记得跑
`node scripts/sync-plugin-templates.mjs`（内嵌快照与磁盘不一致时测试直接红）。
