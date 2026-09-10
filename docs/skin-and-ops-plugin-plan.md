# 方案：皮肤系统 + 运维插件（shell / docker / 运维智能体）

> 状态：待确认（确认后开干）
> 基于当前源码实际盘点，非推测。

---

## 一、现状盘点（源码结论）

### 1.1 现有插件体系已具备的能力

| 能力 | 现状 | 位置 |
|---|---|---|
| 插件清单 | manifest + contributes 声明式扩展点 | `packages/core/src/plugin/manifest.ts` |
| 扩展点类型 | tools / **themes** / layouts / sidebar / routes / settingsTabs / chatEnhancers / backendRoutes | `packages/core/src/plugin/types.ts` |
| 主题贡献 | 插件可贡献 ThemePalette（调色板），`applyTheme` 已支持插件主题回退 | `packages/ui/src/stores/settings.ts:281` |
| 插件页面 | routes 贡献 → 动态注册前端路由，组件约定目录自动扫描 | `packages/ui/src/plugin-component-registry.ts`、`router/index.ts:193` |
| 侧栏入口 | sidebar 贡献 → 渲染进「插件」分组 | `SideNav.vue:228` |
| 安装/导出 | .yzp（zip）安装、预览权限确认、导出回 .yzp | `apps/server/src/routes/plugins.ts` |
| 内置插件源码包 | 内置插件可导出 manifest+源码+README 的 zip（PLUGIN_TEMPLATES） | `plugins.ts:96`、`plugins/templates/index.ts` |
| 内置插件先例 | computer-use（PowerShell + Win32，权限护栏/审计/急停模式完整） | `apps/server/src/plugins/computer-use.ts` |
| 本机命令执行 | cmd-exec 内置工具已存在（本机 shell） | `packages/core/src/tool/builtin/cmd-exec.ts` |
| 智能体挂载 | agent 支持 skillIds / subAgentIds / 工具绑定，call_agent 委派机制成熟 | `packages/ui/src/stores/agent.ts` |

### 1.2 缺口（本次要补的）

1. **皮肤 ≠ 调色板**：现有 ThemePalette 只有颜色（primary/orb/gradient），无壁纸/背景图、无皮肤预览图、无皮肤市场化概念。
2. **无 SSH / Docker 能力**：仓库无 ssh2 / dockerode 依赖；cmd-exec 只能本机执行，连不了远程服务器。
3. **「更多」下拉不接插件**：插件 sidebar 贡献只进侧栏「插件」分组，进不了用户下拉菜单（设置/记忆/数据源/…那个菜单）。
4. **无终端 UI**：没有 xterm.js，无会话（连接配置）管理。

---

## 二、可行性结论（回答"现在的插件功能可以做到？"）

**骨架全都可以，四成现成、六成要补**：

| 需求 | 结论 |
|---|---|
| 皮肤作为插件、用户可自定义 | ✅ 现成。contributes.themes 机制已在，扩展 ThemePalette 即可 |
| 内置皮肤可下载源码包 | ✅ 现成。复用 PLUGIN_TEMPLATES export source 模式 |
| 插件加「更多」菜单 | ⚠️ 半现成。sidebar 贡献已有，需给 SidebarItem 加 `group: 'more'` 目标位 |
| 连接服务器执行命令 | ❌ 要补。需引入 ssh2 + 新增远程 shell 工具族 |
| Docker 管理 | ❌ 要补。dockerode（本地 socket/TCP）+ SSH 隧道两条路 |
| 挂载运维智能体（对话+命令双模式） | ✅ 基本现成。agent + 工具绑定 + call_agent 已支持，缺的只是工具本体和运维页面 |
| 皮肤/插件高清图片系列包 | ⚠️ 要补资源。见 §3.4 图片来源方案 |

---

## 三、方案设计

### 3.1 皮肤系统（皮肤 = 插件的一种）

**数据模型扩展**（`packages/core/src/plugin/types.ts`）：

```ts
// 新增 SkinTheme，ThemePalette 扩展可选字段，保持向后兼容
interface ThemePalette {
  // ...现有字段不动
  kind?: 'palette' | 'skin';        // 缺省 palette，老插件不受影响
  preview?: string;                  // 皮肤预览图（插件包内相对路径）
  wallpaper?: {                      // 壁纸（按深浅色各一张）
    light: string;                   // 包内相对路径，安装后由 /plugin-assets/:id/ 静态服务
    dark: string;
    blur?: number;                   // 毛玻璃强度
    mask?: string;                   // 遮罩透明度，保证文字可读
  };
}
```

**关键机制**：

- 插件安装目录新增静态资源路由 `GET /api/plugin-assets/:pluginId/*`（authMiddleware 保护），皮肤包内的壁纸/预览图直接 HTTP 可取，避免 base64 塞 manifest。
- `settings.applyTheme` 扩展：命中 kind='skin' 的主题时，把 wallpaper 写入 CSS 变量（`--app-wallpaper` 等），`App.vue` 根容器渲染背景层（毛玻璃 + 遮罩），聊天/侧栏等 surface 保持半透明——仿 WorkBuddy/Codex 的整体质感。
- **皮肤页独立于插件管理页**：设置里新增「皮肤库」tab（或独立入口），按分类（动漫 / 风景 / 美图 / 简约 / 全部）网格展示预览图，点击即换；同时展示已安装皮肤包，支持卸载。
- **内置皮肤可下载源码包**：完全复用 PLUGIN_TEMPLATES + `/export?format=source` 模式，皮肤包 = manifest + 壁纸目录 + README，用户二改后可打成 .yzp 重装 → 天然支持"用户自定义皮肤"。
- 设置页主题选择器升级：从色点 chip 升级为带预览图的卡片网格（内置调色板保持原样式，皮肤显示预览图）。

**内置皮肤首批规划**（每套 4~6 张系列图，light/dark 各配）：

| 分类 | 皮肤 | 内容 |
|---|---|---|
| 动漫 | 樱夜 / 赛博宵 / 云海物语 | AI 生成动漫场景壁纸（版权干净） |
| 风景 | 山川 / 海岸 / 极光 | CC0 实拍高清图 |
| 美图 | 抽象流体 / 几何渐变 / 星空 | CC0 / AI 生成 |
| 简约 | 默认（现有 5 套调色板收编为"简约"分类，零改动兼容） | — |

### 3.2 运维插件（builtin：`ops-shell`）

形态完全对齐 computer-use 先例：manifest + 入口模块 + 权限护栏 + 审计，默认 disabled。

**新增依赖**：`ssh2`（远程命令/SFTP，纯 JS 无原生编译，符合 Windows 打包约束）；`dockerode`（Docker API）。

**贡献内容**：

```ts
contributes: {
  tools: [
    'ssh_exec',        // 远程执行命令（超时/输出截断/危险命令黑名单）
    'ssh_upload',      // SFTP 上传文件
    'ssh_download',    // SFTP 下载文件
    'docker_ps',       // 容器列表
    'docker_logs',     // 容器日志
    'docker_restart',  // 容器重启（确认后）
  ],
  sidebar: [
    { id: 'ops', label: '运维', route: '/ops', icon: 'ops', group: 'more', order: 50 },
  ],
  routes: [{ path: '/ops', name: 'ops', component: 'views/plugin/OpsConsole.vue' }],
}
```

**连接管理**：新表 `ops_connection`（名称/host/port/用户/认证方式 password|key/标签），密钥加密存储（复用现有 auth_config_enc 模式）。连接支持打标签（如"生产/测试"），危险操作按标签升级确认。

**运维控制台页面**（`views/plugin/OpsConsole.vue`，插件 route 页面）：

- 左侧：连接列表（分组标签）+ 连接/断开
- 右侧双模式切换：
  - **命令模式**：xterm.js 真终端（SSH PTY 交互流），支持多 tab 多会话
  - **对话模式**：聊天面板，底层 = 一个预置的「运维智能体」agent（system prompt 为运维专家 + 绑定 ssh_exec/docker_* 工具），走现有 call_agent/聊天链路；模型执行命令时在对话流里回显 `[tool_call: ssh_exec]` 证据与输出
- Docker 视图：选中连接后可切"容器"面板（列表/日志/重启）

**运维智能体（内置，a_builtin_ops_agent）**：

- 不是新机制，就是一条内置 agent 记录：描述"服务器运维专家"，工具绑定上述 ssh/docker 工具，subAgent 能力复用现有体系
- 权限挂钩：仅当 ops-shell 插件 enabled 时该 agent 可用；未启用时对话模式提示引导去插件管理开启（插件管理页内的既有文案，不算新增用户侧入口）

**护栏**（对齐 computer-use 标准）：

- 新权限 `remote-shell` 加入 VALID_PERMS
- 危险命令黑名单（rm -rf /、mkfs、dd of=/dev/、shutdown 等，可按连接标签放宽但二次确认）
- 生产标签连接的写操作强制 confirm_user
- 全量审计入 plugin_storage.audit（命令、目标主机、耗时、退出码）
- SSH 会话空闲超时自动断开；密钥不明文落库、不出现在日志

### 3.3 「更多」菜单接入插件

- `SidebarItem` 增加可选 `group?: 'nav' | 'more'`（缺省 'nav' 保持现状）；`group: 'more'` 的项渲染进 SideNav 用户下拉菜单（设置/记忆管理/…之下、退出登录之上，divided 分隔）
- 运维插件即用 `group: 'more'` 放「运维」入口 → 点击开 `/ops` 控制台 = "点主页面就能连服务器执行命令"
- Web 窄屏/移动端不渲染 more 分组（下拉菜单本来就是桌面形态）

### 3.4 皮肤图片来源（版权安全）

| 来源 | 用途 | 说明 |
|---|---|---|
| AI 生成（ImageGen） | 动漫类全套 | 版权最干净，风格可控，按系列出 4~6 张 |
| CC0 图库（Pixabay/Pexels，Unsplash License） | 风景/美图 | 高分辨率原图打包进皮肤包，注明来源于 README |
| 禁用 | pixiv/番剧截图/影视剧照 | 版权不可控，不进内置包 |

皮肤包体积控制：单张 WebP 压缩至 ≤800KB（2560×1600），单包 ≤6MB；.yzp 安装走现有 base64 通道无压力。

### 3.5 交付形态

- 内置皮肤 4~6 套 + 内置插件 ops-shell：随包发布（builtin，默认部分 enabled）
- 皮肤包/插件包源码下载：设置→皮肤库 / 插件管理页各加"下载源码包"按钮（复用 export source）
- 后续可把皮肤/插件发布进 ToolMarket 市场链路（远期，本次不做）

---

## 四、风险分级

| 风险 | 级别 | 对策 |
|---|---|---|
| ssh2 引入后的打包体积/兼容 | low | 纯 JS 实现，无 node-gyp，node-llama-cpp 同模式已验证 |
| 壁纸导致 UI 可读性下降（文字压图） | medium | 遮罩 + 毛玻璃默认值保守，surface 不透明度可配 |
| 运维智能体误操作生产服务器 | high | 黑名单 + 生产标签二次确认 + 全量审计 + 默认 disabled |
| 皮肤包图片版权 | medium | 仅 AI 生成 + CC0，README 留来源记录 |
| xterm.js 移动端体验 | low | 运维控制台 route 标记 desktop-only（when: 'desktop'），移动端隐藏 |

---

## 五、实施步骤（确认后执行）

1. **P0 皮肤机制**：ThemePalette 扩展 + plugin-assets 静态路由 + App.vue 背景层 + 皮肤库 UI + 设置主题选择器升级（不动现有 5 套调色板行为）
2. **P0 内置皮肤包**：AI 生成动漫系列 + 收集 CC0 风景/美图 → 打包 4~6 套 .yzp 内置 + 源码模板导出
3. **P1 运维插件**：ssh2/dockerode 依赖 + ops-shell 插件（工具族 + 连接管理 + 护栏审计）
4. **P1 运维控制台**：OpsConsole 页面（xterm 命令模式 + 对话模式 + Docker 面板）+ 更多菜单 group:'more' 接入
5. **P2 运维智能体**：a_builtin_ops_agent 预置 + 对话链路联调
6. 每步收口：typecheck + 测试类（manifest 校验 / 护栏黑名单 / 连接加密存储）+ 自检

改动范围：`packages/core/src/plugin/*`、`packages/ui/src`（settings/App/SideNav/Settings/新增皮肤库与 OpsConsole）、`apps/server/src`（plugins.ts 静态资源路由、plugins/ops-shell.ts、db 迁移 ops_connection）、`apps/server/src/plugins/templates`（皮肤+运维模板）。

**确认没问题回复"开干"，按 P0 → P1 → P2 顺序实施。**
