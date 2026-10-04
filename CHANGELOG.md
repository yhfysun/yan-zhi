# Changelog

本文件记录言智（yan-zhi）各版本变更，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

## [Unreleased]

### Added
- **后台并行子智能体（P2-6）**：`call_agent` 新增 `async: true` —— 立即返回启动回执，子 ReAct 后台独立执行，完成后结果自动发回本会话（任务仍在跑 → 注入通道唤醒下一轮；已收尾 → 落库普通消息，与工作流结果反写同口径）。并发上限 3（超出直接引导等待或改同步，不排队）；主循环**不等待**后台任务（防"空轮等待"烧 token），收尾时有在跑任务会落一条明示消息；工作任务型子智能体不套后台壳（防双重投递）；中止级联、重启不恢复（方案拍板）。闸门/文案在 `services/background-subagents.ts`（行为测试）+ 12 例接线守卫
- ★ 修复前端子智能体并发流合并：`subAgentMsgIds` 改为 `parentToolCallId::subAgentId` 复合键 —— 同一 agent 的两个后台任务此前会把两路 token 流合流进同一条消息（服务端 chunk/tool_call 事件补发 parentToolCallId）
- **项目级技能目录（P2-8）**：工作目录 `.yan-zhi/skills/*.md` 自动发现并注入系统提示 —— frontmatter（name/description/triggers）+ 正文 SOP，与 DB 技能同一套触发词命中规则（命中注入完整流程、未命中只给名称），同名时**项目技能覆盖挂载技能**；mtime+size 指纹缓存（每轮 ReAct 构建提示词不重读盘）、不写 skill 表（目录即真相源）、单文件解析失败只 warn 跳过；独立 `services/project-skills.ts` + 6 例功能测试
- **用户工具钩子 P2a（P2-7）**：设置页新增「工具钩子」——用户声明式规则 `{ 工具(可 * 通配) + 匹配内容(大小写不敏感子串) + 动作 }`，动作二选一：**弹窗确认**（每次调用先弹窗点头，授权不记忆、无人值守 fail-safe 拒绝，复用 path-guard 弹窗通道）或**直接拒绝**（拒绝原因回喂模型并明示"不要绕过"）。执行点在缺参检查后、危险命令护栏前（deny 短路省一次弹窗）；deny 与 confirm 并存时 deny 优先。新增 `user_hook` 表 + `routes/user-hooks.ts` CRUD + `services/user-hooks.ts` 匹配（进程内缓存、db 异常 fail-open 不污染缓存）
- **编码反馈闭环（P0）**：新增 `code_diagnostics` 内置工具（tsc --noEmit 类型检查 / ESLint / node --check 语法检查，自动探测项目配置，结果缓存 90s）；`file_write`/`file_edit` 成功改写代码文件后自动跑诊断并把问题回喂到工具结果，模型当场自修（`YZ_AUTO_DIAGNOSE=0` 可关闭）
- **代码树解析（AST）**：新增 `code-ast.ts`，用 TypeScript Compiler API 做精确符号/导入/调用边提取（多行签名、箭头函数、类方法宿主、vue SFC 行号对齐）；`code_outline` / `code_refs` / `code_graph` 在编译器可用时自动走 AST，浏览器端回退原启发式
- **file_edit 多 hunk 编辑**：支持 `edits` 数组一次原子改多处（任一未命中则不落盘）；精确未命中时回退行尾空白容忍的模糊匹配
- **危险命令护栏（P1）**：`cmd_exec`/`python_exec` 命中破坏性模式（递归删除/格式化/强推/关机/删库等 16 类）时**每次单独弹窗授权**（红色警示、不给"记住本会话"），不复用首次授权、永不记忆；无人值守 fail-safe 拒绝
- **项目级整体回滚（P1）**：新增 `POST /workspace/changes/rollback-all`，一键把项目目录下全部待审模型修改退回修改前（新建文件删除）；「模型修改审查」面板加"全部回退"按钮（二次确认）
- **自动验证循环（P1）**：任务改过代码文件但从未跑过构建/测试/类型检查时，收尾前自动注入验证提醒（每任务最多 2 次），对齐 Claude Code hooks / Cline auto-test 的"改完必须验"
- **语义代码检索（P1）**：新增 `api_code_semantic_search` 工具 + `services/code-index.ts`——embedding 管道（平台配置优先/Ollama 兜底）接到代码库，按文件增量建索引（mtime+size 变化才重嵌，80 行窗口），余弦检索返回 文件:行号+片段；默认暴露给所有智能体，需已配置 embedding 模型
- **@ 目录引用（P1）**：输入框 @ 浮层支持目录匹配（目录从文件索引路径推导，蓝色文件夹图标置顶展示）；目录引用不读内容，注入"请用 file_list/code_search/code_semantic_search 自行探索"的说明
- **聊天流内嵌 diff 卡片**：`file_edit` 工具卡片下方内联展示 before/after diff（`ChatFileChangeCard`），支持直接「接受修改 / 回退」，不再需要切工作台；新增 `GET /workspace/changes/latest` 端点按会话+路径反查待审快照
- **多文件修改汇总 review 面板**：代码工作台侧栏新增「模型修改审查」视图（`AiChangesReviewPanel`），全部待审文件列表 + 逐文件 diff 与应用/回退
- 新增 `.github/workflows/ci.yml`：PR 与 push 触发，跑 typecheck + 单元测试，做质量卡关
- 新增 `apps/server/Dockerfile`：支持 server 容器化部署
- 新增 `CHANGELOG.md`

### Fixed
- ★ hunk 级选择性接受（P2-2）丢失行尾风格与末尾换行：快照存原始内容（Windows 下是 CRLF）而合并输出固定 `\n` join → **CRLF 文件部分接受后整个文件行尾变 LF、末尾换行丢失**（未被选中的"保持 before"无从谈起）——输出改为沿用 after 的行尾风格与末尾换行（全选重建逐字节等于 after）；顺带消除 `applyHunkSelection` 复制的 hunk 分组逻辑（写死 context=3，改 context 必然静默失配）→ 与 `computeHunks` 共享 `analyze()`，9+3 例回归
- ★ llm-task-manager 两处权限档兜底 fail-open（`task.permissionMode || 'default'`：查不到档位就按可写放行）改为 fail-safe readonly —— 守门测试反向断言逼出，2026-09-27 拍板口径的漏网实现
- sqlite-driver 的 sql.js 回退对 `:memory:` 库落盘 ENOENT（写 `:memory:.tmp` 文件）—— 测试迁移到统一驱动入口时暴露
- 修复 6 个存量红测试（26→0）：conversation-mode / model-resolve 迁移到 openSqlite 统一驱动入口（better-sqlite3 已重编为 Electron ABI，系统 Node 无法加载）；license-edition 预置码时长断言改为时间不变量（expireAt − 签发日）；media-fetch-tools / fileWriteAndPreviewFix / mobilePackagingAndColdStart 的源码扫描断言同步重构后现状（MEDIA_TOOLS→artifact-hooks、登记分支→registerAfterToolHook、SideNav 登录入口文案）；sandbox 测试按“受限 require”设计更新语义；context-view-layering keepFirst 按方案 A（头部并入摘要、覆盖段恒为前缀）更新
- ★ fs-walk 目录探测在 Windows 上把**文件**判成目录（`exists(path + '/')` 对文件返回 true）→ 无 `listDirEntries` 的适配器（Web 端）walk 全树返回空，code_refs/code_graph/文件遍历全废 —— 改为 stat 优先、readDir 探测兜底
- code_diagnostics 在 Windows 下解析出 0 条问题：execFile 的 stdout 是 CRLF，行尾 
 使 `(.*)$` 匹配失败 —— tsc/eslint 解析前归一化换行
- code-ast 的 `export const` exported 恒为 false（export 修饰符在 VariableStatement 而非 VariableDeclarationList 上）
- code_refs 引用扫描误杀：排除"任何声明行"把 `const out = calc(1, 2)` 里的 calc 引用一并吞掉 —— 收紧为只排除本符号自己的声明行
- file_edit 修改快照存原始相对路径：before 快照按进程 cwd 读取错位、`/workspace/changes` 按目录前缀过滤永远匹配不上（编辑器提示条不出现）——快照路径现按工作目录解析为绝对路径

### Changed
- 技能正文截断收敛单点 `truncateSkillBody`（DB 技能内联 2000 与项目技能常量双份、半角/全角文案刚写就漂移 —— 统一为唯一实现，带守卫测试防再分叉）
- **hunk 级选择性接受（P2-2）**：diff 每个 hunk「✓ 接受此块」——选中的块套用、未选中的回退 before（`services/hunk-apply.ts` LCS 三方合并；盘上被手改时 409 走整文件审查）；聊天 diff 卡片与审查视图均可按块接受
- **@ 符号级引用（P2-1）**：`@` 浮层支持代码符号（服务端 `GET /workspace/symbols` 用 AST 解析 + 双缓存），选中内联注入「[符号 name · 路径:行号]」
- **数据查询契约模式（本体 × QueryContract 融合 P1，2026-10-03 拍板）**：新增 `services/ontology-contract.ts` 契约装配器——`api_data_query` 支持 `contract: true`：filters 只能按名引用本体声明的过滤器（自由 SQL 条件被拒，对模型关掉编译器的"裸条件放行"注入面），返回契约菜单（dimensions/measures/filters/selections 名单）+ 业务名列映射（看板不暴露物理字段名）；草稿态本体不可见；数据查询助手 SOP 更新为契约模式优先
- **code_diagnostics 支持 Vue 项目**：项目装了 vue-tsc 时自动改用（覆盖 .vue 的类型错误，输出格式与 tsc 一致，解析/缓存零改动；超时下限抬到 180s）
- **语义索引读时惰性增量**：检索时抽查文件新鲜度（5 分钟节流），过期则后台增量重建——当次查询照常返回并注明"索引更新中"，无需手动 reindex
- **预置授权码构建时现签**：新增 `apps/desktop/scripts/pre-sign-license.cjs`（私钥缺失明确报错中止打包，`YZ_SKIP_LICENSE_SIGN=1` 逃生舱并清除残留码）；`gen-license.mjs --out` 批量现签三档 + payload 携带 `signedAt`；`license.ts` 优先读包内 `license/default-codes.json`（存量包回退源码常量）+ 剩余 <14 天启动告警；main.cjs 打包版注入 `YZ_LICENSE_CODES_FILE`
- **sqlite-driver 移动端参数化**：flush 周期/防抖经 `YZ_SQLITE_FLUSH_INTERVAL_MS` / `YZ_SQLITE_FLUSH_DEBOUNCE_MS` 可配（移动端收尾方案 #3）
- 统一所有子包版本号到 `0.1.1`（server / web / mobile / ui / core / shared 从 0.1.0 升级）
- 更新 `README.md`：补充代码工作台、Python 内置运行时、SFTP 文件管理、数据查询契约、插件分类等 10+ 新功能状态；修正文档导航路径；更新打包说明；补充 Python 运行时说明；补全项目结构
- 重写 `项目近期更新与风险分析.md` 为 2026-09-12 快照

## [0.1.1] - 2026-09-05

### Added
- **代码工作台（/code IDE 模式）**：从聊天模式独立出 IDE 风格代码开发模式，目录树懒加载、CodeMirror 多语言高亮、文件 tab、环境配置分 tab、任务面板改造为工作台
- **内置 Python 运行时**：改用 python-build-standalone 随包分发（离线可用），附带 doyz 文档处理 / 网安工具 / PDF 预览脚本
- **运维 SFTP 文件管理**：ops-shell 插件新增 SFTP + 连接分组 + 插件 DB 沙箱
- **file_to_markdown 内置工具**：办公文档（Word/Excel/PDF）→ Markdown 转换
- **数据查询契约 / 动态看板**：大模型产 QueryContract + 参数化受控执行 + 对话内动态看板
- **git 冲突解决**：三栏式冲突解决能力（对标 IDEA）
- **插件分类**：功能 / 皮肤 / 操作 / 自定义四类分组
- **皮肤库扩充至 23 款** + surface 深度定制
- **Excel 样式化预览 + PDF 高保真渲染**
- 内置智能体统一改名为「助手」

### Changed
- 桌面端 productName 从「言智」改为「yan-zhi」，安装目录规范化 + userData 迁移
- 目录树改为按层级懒加载 + 滚动懒加载
- 移除 Word 内嵌预览及相关依赖

### Fixed
- 文件预览二进制乱码修复（PDF/Excel/Word）
- mammoth 与 SheetJS 的 Node 侧读取修复
- Windows 打包失败（installer.nsh 入库）
- 残留 Electron 主进程导致重跑叠窗口看到旧界面

## [0.1.0] - 2026-08-30

### Added
- 浏览器工具鲁棒性优化、可用模型查询
- 数据源无登录体系
- 桌面端更新
- 插件系统（`.yzp` 插件包，8 类扩展点）
- 皮肤系统（皮肤即插件）
- ops-shell 运维插件
- computer-use 电脑操作插件
- 定时任务与自动化
- Git 集成
- 五维记忆管理
- License 授权系统
- Anthropic 协议支持
- 桌面端从 Tauri 迁移到 Electron
- 知识库语义检索（bge-small-zh 向量模型）
- 局域网访问
- 消息中心与节点互聊