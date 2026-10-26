# 技术设计：模式插件化与插件运行时包

> 对应 proposal.md。三条用户决策已钉死：① 模式插件走**运行时动态装载**（.yzp 装进现有应用即生效）；② 共享依赖宿主注入不复制；③ 后端拆不出去的留基座，前端必须拆出。

## 1. 统一插件包形态

内置（随包）与用户安装（.yzp）磁盘结构完全一致：

```
plugins/<builtin|installed>/<id>/
  manifest.json
  backend/index.js      # esbuild 打包的后端入口（纯声明式插件可无）
  frontend/index.mjs …  # vite lib 独立构建的 ESM 前端 bundle + css（无界面插件可无）
  assets/…              # 皮肤壁纸等静态资源
```

物理位置：
- **内置**：`<server>/plugins/builtin/<id>/`。dev = `apps/server/plugins/builtin/`；打包 = `resources/server/dist/plugins/builtin/`（electron-builder extraResources 拷贝）。放 server dist 下是为了 bare import 沿目录上溯解析到 `resources/server/node_modules`（原生依赖不复制进插件）。
- **用户安装**：沿用现有 `PLUGINS_DIR`（`resources/server/dist/apps/plugins/installed/<id>/`），零改动。

"打包包含与否" = 打包脚本是否拷贝该目录；未选 = 物理不存在。"单独打包" = 同一目录 zip 成 .yzp（与内置产物同源，杜绝行为漂移）。

## 2. manifest 扩展（全部向后兼容的新增字段）

```jsonc
{
  "id": "clip-mode", "version": "0.1.0",
  "engine": "^0.1",                       // 宿主兼容（semver range，install 时校验）
  "ownedTables": ["shop_product"],        // 插件自有 SQL 表白名单（沙箱 db 放行）
  "ui": { "entry": "frontend/index.mjs" },// 赋予现有 ui 字段真实语义（string 为旧形态，保留兼容）
  "contributes": {
    "mode": {                             // 模式插件声明模式
      "key": "clip", "label": "剪辑模式", "icon": "VideoCamera", "route": "/clip",
      "entry": "frontend/index.mjs",      // 模式工作台入口（同 ui.entry 时可省）
      "desktopOnly": false,
      "fallbackAgent": "a_builtin_clip_agent",
      "chatPlacement": "center"
    }
  }
}
```

校验（`packages/core/src/plugin/manifest.ts`）：mode.key 须 kebab-case 且不与基座/其它插件冲突（冲突在注册层报错）；engine 须合法 semver range（用现有依赖或轻量自检，不新增运行时依赖）；ownedTables 表名须 `[a-z_][a-z0-9_]*`。

## 3. 共享依赖：宿主注入，不复制

### 3.1 前端

- `packages/ui/src/plugin-host-bridge.ts` 在应用启动早期挂载：
  ```ts
  window.__YZ_HOST__ = {
    apiVersion: 1,
    m: { vue, vueRouter, pinia, elementPlus, elementPlusIcons },  // import * 命名空间
    api: { /* store 白名单 + 公共工具，见 §6 */ },
  };
  ```
- **`yz://` 特权协议**（`main.cjs`，`protocol.registerSchemesAsPrivileged` + `protocol.handle`）：
  - `yz://shared/<name>.mjs` → `apps/desktop/host-shims/`（构建期生成，见 §5）；
  - `yz://plugin/<id>/<path>` → 定位插件目录（内置 resources 路径 → 已安装 PLUGINS_DIR → dev 的 `apps/server/plugins/{builtin,installed}/`），带 CORS 头（file:// 源的 Origin 为 null，须 `Access-Control-Allow-Origin: *`）。
- 插件前端 bundle：vite lib mode 构建，共享依赖 external 并经 rollup `output.paths` 改写到 `yz://shared/*.mjs`。**改写命名导出问题**由 shim 解决：shim 文件内含被共享模块**全量命名导出**的转发（`export const ref = __m.ref; …`），导出名清单由生成脚本从真实模块枚举，并有守门测试断言每个导出运行时非 undefined。
- 装载器（`packages/ui/src/plugin-runtime.ts`）：拉 `/api/plugins` 快照 → enabled 且有 `ui.entry`/`contributes.mode.entry` → `import('yz://plugin/<id>/frontend/index.mjs')`（web 构建回落 `http://<server>/api/plugin-assets/<id>/…`）→ 注册路由/侧栏/组件。失败走现有 `RouteFallback`，不黑屏。CSS 随插件 chunk 注入 `<link>`。
- **宿主内部模块外置（P4 实装）**：工作台视图从 `stores/ composables/ api/ utils/` 取能力，这些模块含模块级单例（如 `stores/mode` 的 `activeMode`）。构建期把这些 import 改写为 `yz://shared/host/<key>.mjs`，shim 从 `window.__YZ_HOST__.mods[key]` 取**宿主同一份命名空间**（`packages/ui/src/host-modules.ts` 的 eager glob 登记）。随包复制只允许出现在组件（`.vue`）层——组件无模块级状态。
- 路由解析顺序（P4）：插件前端 bundle → 构建期 `PLUGIN_VIEW_LOADERS` → `RouteFallback`。中间那层保证「没跑 `--with-frontend` 的包」行为与之前完全一致。

### 3.2 后端

- 插件源码对宿主内部的 import 统一改为 **`@yz/server-host`**：
  - **dev/源码注册形态**：tsconfig paths 把它指到 `apps/server/src/host-bridge.ts`，直接 re-export db/logger/crypto/audit 等（单进程直连，行为与现状一致）；
  - **插件包形态**：`build-plugins.mjs` 用 esbuild 打包时把别名换成生成的 shim（读 `globalThis.__YZ_SERVER_HOST__`），服务端在 import 插件入口**之前**注入该全局。
- 原生依赖（better-sqlite3 等）external，靠 §1 的目录布局上溯解析；纯 JS 依赖打进 bundle。
- 数据：自有表经 `ownedTables` 白名单走扩展后的沙箱 db（`sandbox-db.ts` 放行清单由 manifest 提供）；KV 照旧 plugin_storage。

## 4. 模式运行时装配

- 放行四维交集：**物理在包 ∩ 用户启用 ∩ 授权档（EDITION_MODES 不动）∩ 构建选择**。服务端插件快照（`/api/plugins`）聚合 `modeDefs` 下发。
- 前端 `stores/mode.ts`：`MODE_DEFS` 改为"基座 office（构建期生成表保留）+ 运行时合并插件贡献"；`visibleModeDefs` 过滤逻辑不变（desktopOnly/license）。
- 路由：`router/index.ts` 对插件模式 `router.addRoute`（走现有 `syncPluginRoutes` 同一机制）；`MODE_ROUTE_KEYS` 硬编码逐步退役为注册表。
- `App.vue` 的 fallbackAgent 硬编码改从 manifest `contributes.mode.fallbackAgent` 读。
- `conversations.ts` 的 `VALID_MODES` 白名单改为"基座 + 已注册插件模式"动态集合；**SQL 形态一字不动**（`conversation-mode.test.ts` 钉住）。
- 模式缺席行为与现状一致：会话数据保留、入口消失、装回插件即恢复。

## 5. 构建器与 shim 生成

- `apps/desktop/scripts/generate-host-shims.mjs`：在 Node 里动态 import vue / vue-router / pinia / element-plus / @element-plus/icons-vue，`Object.keys` 枚举命名导出，生成 `host-shims/<name>.mjs`（转发到 `window.__YZ_HOST__.m[name]`）。element-plus 若在 Node 不可直接 import 则回落解析其 d.ts。产物进 git（避免"没跑生成脚本就打包"的坑）？——**不进 git**，desktop `build` 链第一步生成，dev 首次缺失时现场生成。
- `apps/desktop/scripts/build-plugins.mjs --id=<id> [--all]`：
  - 读 `build/plugins.catalog.json` 条目 → 后端 esbuild bundle（alias `@yz/server-host` → shim，external node:*/原生依赖）→ `<staging>/<id>/backend/index.js`；
  - 前端 vite lib build → `<staging>/<id>/frontend/`；
  - 拷 manifest + assets → 完整插件包。
- esbuild 加为 `apps/desktop` devDependency（与 vite 5.4 同代版本）。

## 6. 桥面白名单（权限边界，快照测试钉住）

前端 `api` 白名单（P0 初版，扩面必须显式改测试）：
- stores：useChatStore、usePluginStore、useModeStore、useSettingsStore、useSceneConfigStore、useLicenseStore
- 工具：apiFetch、pluginAssetUrl、ElMessage/ElNotification 透传
- 公共组件：ConsoleShell、TaskListSection、HoverMenu
- Electron：`window.electronAPI` 整体透传（主进程能力，含 remote-control 的 rc:* 通道）
后端白名单（host-bridge 导出面）：db（受 ownedTables/沙箱约束）、createLogger、crypto（encrypt/decrypt）、pushPluginAudit、PLUGINS_DIR/resolveBuiltinAssetsDir 等路径工具；P3 增 path-guard 整面 + exec-cmd（runCmd/lookupOnPath）；P4（clip-mode）增 authMiddleware、hardDeleteRow（会话硬删唯一出口）、resolveArtifactDirFor/ensureArtifactDirFor（产物目录，**必须**走桥——模块内的 hereDir 若被复制进插件包会算错根目录）；P5 前置增 applyBuiltinSeed（插件 activate 运行时补种）。
- 构建器宿主闸只拦**有状态的宿主单例**（db/state/plugin-audit/logger/crypto/path-guard/exec-cmd/git/artifact-dir）；auth 与 conversation-lifecycle 是无模块级状态的纯代码，复制无害，**不进闸**（进了会逼着桥面无限扩）。现有 38 导出。

## 7. 打包改造（P5）

- `package.cjs`：`--plugins=` 多选（分组：模式/皮肤/功能；requires 自动勾选；office 锁定）；`--modes=` 兼容映射（office→恒含、clip→clip-mode、ops→ops-shell+cicd-pipeline+java-suite…）。
- extraResources 按选拷贝：皮肤资产随 skins、python 运行时随 computer-use；剪辑 ffmpeg/whisper 本就运行时下载不进包。
- 三档 preset（插件集）：lite = office-core+skins；basic = +dev-mode+wf-mode；pro = 全部。
- `verify-plugin-prune`：断言未选插件的产物（前端 chunk/后端目录/资产）不在安装包。
- server tsc 不再编译插件源码后，主产物只含基座。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 桥面失控（插件摸到不该摸的） | 白名单 + 快照测试 + 插件目录互导 lint，三层守门 |
| file:// 源动态 import 跨域 | yz:// 协议带 corsEnabled + 响应显式 ACAO:*；dev/web 双路径各有冒烟 |
| 旧包升级残留 plugin 表行 | `loadFromDb` 已容忍缺席；`task_type.source` 清理预留已有 |
| 模式装载失败黑屏 | 装载器 try/catch → RouteFallback（已存在），office 不走远程装载 |
| 版本漂移（.yzp 装进旧宿主） | manifest.engine + window.__YZ_HOST__.apiVersion 双重校验 |
| 构建时长 | 插件并行构建；server 产物变薄反而更快 |
| 双皮肤体系（skinSeries vs skins 插件） | 本期不动，P7 评估合并 |
| remote-control 特例 | preload `rc:*` 通道保留不动，electronAPI 经桥整体透传 |

## 9. 本期明确不做

在线插件市场/自动更新；workflow 引擎、code 工具等公共能力下沉拆分（属基座）；第三方插件任意前端代码的权限模型细化（ui.entry 本期面向第一方插件）；web/mobile 端插件装载（预留 HTTP 变体，后期可选）。
