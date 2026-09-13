# Changelog

本文件记录言智（yan-zhi）各版本变更，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

## [Unreleased]

### Added
- 新增 `.github/workflows/ci.yml`：PR 与 push 触发，跑 typecheck + 单元测试，做质量卡关
- 新增 `apps/server/Dockerfile`：支持 server 容器化部署
- 新增 `CHANGELOG.md`

### Changed
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