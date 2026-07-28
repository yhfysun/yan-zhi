## 1. 文档与品牌更新

- [x] 1.1 重写 README.md，体现"言智"品牌定位和三层商城架构
- [x] 1.2 更新 package.json 中的 description 为"言智 - 语言可控的智能体平台"
- [x] 1.3 新增 docs/design.md（项目设计文档，从 openspec design.md 整理）
- [x] 1.4 新增 docs/tasks.md（项目任务规划文档，从 openspec tasks.md 整理）

## 2. 数据库 Schema 扩展

- [x] 2.1 在 packages/core/src/db/schema.ts 中新增 custom_tool 表定义
- [x] 2.2 新增 remote_marketplace 表定义（远程商城源配置）
- [x] 2.3 新增 marketplace_cache 表定义（远程内容缓存）
- [x] 2.4 在 skill 表新增 source、remote_source_id、is_public 字段
- [x] 2.5 在 agent 表新增 source、remote_source_id、is_public 字段
- [x] 2.6 编写数据库迁移脚本（apps/server/src/db/migrations/）

## 3. 工具商城 - 后端

- [x] 3.1 定义 CustomTool 类型（packages/shared/src/types/marketplace.ts）
- [x] 3.2 实现 JS 代码沙箱执行器（packages/core/src/tool/sandbox.ts）
- [ ] 3.3 扩展 ToolRegistry 支持从数据库加载自定义工具
- [x] 3.4 创建 tools 管理路由（apps/server/src/routes/tools.ts）替代原 mcp.ts
- [x] 3.5 实现自定义工具 CRUD API（创建/编辑/删除/启用禁用）
- [ ] 3.6 实现内置工具列表 API（从 ToolRegistry 导出）
- [ ] 3.7 移除或标记废弃旧 MCP 路由（保留兼容过渡期）

## 4. Skill 商城 - 后端

- [x] 4.1 定义 Skill Marketplace Protocol 类型（packages/shared/src/types/marketplace.ts）
- [x] 4.2 创建远程 Skill 商城源管理路由（apps/server/src/routes/remote-sources.ts）
- [x] 4.3 实现远程 Skill 列表拉取与分页逻辑
- [x] 4.4 实现远程 Skill 详情获取
- [x] 4.5 实现远程 Skill 下载/复制到本地功能
- [x] 4.6 实现本地 Skill 作为商品暴露的商城 API（/api/marketplace/skills）
- [x] 4.7 实现远程内容缓存机制（定时/手动刷新）

## 5. 智能体商城 - 后端

- [x] 5.1 创建远程智能体商城源管理路由（apps/server/src/routes/marketplace.ts）
- [x] 5.2 实现远程智能体列表拉取与分页逻辑
- [x] 5.3 实现远程智能体详情获取（含工作流定义）
- [x] 5.4 实现远程智能体复制到本地功能
- [ ] 5.3 实现远程智能体详情获取（含工作流定义）
- [ ] 5.4 实现远程智能体复制到本地功能
- [x] 5.5 实现本地智能体作为商品暴露的商城 API（/api/marketplace/agents）
- [x] 5.6 智能体"发布到商城"开关与可见性控制

## 6. 商城服务端

- [x] 6.1 创建商城服务端入口路由（apps/server/src/routes/marketplace.ts）
- [x] 6.2 实现商城开关配置 API（开启/关闭服务端模式）
- [x] 6.3 实现内容可见性过滤（仅返回 is_public = true 的内容）
- [x] 6.4 实现商城访问权限中间件（none/bearer/api-key/basic）
- [x] 6.5 实现节点握手接口 GET /api/marketplace
- [x] 6.6 统一各商城 API 响应格式为 MarketplaceListResponse / MarketplaceDetailResponse

## 7. 远程商城源管理

- [x] 7.1 创建远程源统一管理路由（apps/server/src/routes/remote-sources.ts）
- [x] 7.2 实现远程源 CRUD API（添加/编辑/删除/启用禁用）
- [x] 7.3 实现远程源连接测试（验证 URL 和认证可用性）
- [x] 7.4 认证信息加密存储（使用与 API Key 相同的加密方案）

## 8. 工具商城 - 前端

- [ ] 8.1 将 Mcp.vue 重构为 ToolMarket.vue（工具商城页）
- [ ] 8.2 实现内置工具列表展示（卡片 + 详情弹窗）
- [ ] 8.3 实现自定义工具编辑器（代码编辑区 + Schema 表单）
- [ ] 8.4 实现远程工具源管理面板（添加/删除/切换远程源）
- [ ] 8.5 实现远程工具列表浏览（分页加载）
- [ ] 8.6 创建 tools store（packages/ui/src/stores/tools.ts）

## 9. Skill 商城 - 前端

- [ ] 9.1 升级 Skills.vue 支持本地/远程双视图切换
- [ ] 9.2 实现远程 Skill 商城源管理面板
- [ ] 9.3 实现远程 Skill 分页列表 + 搜索 + 分类筛选
- [ ] 9.4 实现"安装到本地"按钮与状态提示
- [ ] 9.5 更新 skills store 支持远程商城状态（packages/ui/src/stores/skill.ts）

## 10. 智能体商城 - 前端

- [ ] 10.1 升级 Agents.vue 支持本地/远程双视图切换
- [ ] 10.2 实现远程智能体商城源管理面板
- [ ] 10.3 实现远程智能体分页列表 + 搜索
- [ ] 10.4 实现"复制到本地"按钮与状态提示
- [ ] 10.5 更新 agents store 支持远程商城状态（packages/ui/src/stores/agent.ts）

## 11. 商城服务端 - 前端

- [ ] 11.1 在 Settings.vue 新增"商城服务端"配置区域
- [ ] 11.2 实现商城服务端开关
- [ ] 11.3 实现访问权限配置（认证类型选择、凭证配置）
- [ ] 11.4 新增 marketplace store（packages/ui/src/stores/marketplace.ts）

## 12. 聊天接口工具化

- [ ] 12.1 实现管理工具函数集（packages/core/src/tool/builtin/management.ts）
- [ ] 12.2 实现 list_platforms / add_platform 工具函数
- [ ] 12.3 实现 list_tools / enable_tool / disable_tool / add_custom_tool 工具函数
- [ ] 12.4 实现 list_skills / install_skill 工具函数
- [ ] 12.5 实现 list_agents / create_agent 工具函数
- [ ] 12.6 实现 add_remote_source / search_marketplace 工具函数
- [ ] 12.7 管理工具权限校验（仅已认证用户可调用）

## 13. 路由与类型整理

- [ ] 13.1 更新 apps/server/src/index.ts 注册所有新路由
- [ ] 13.2 更新 packages/shared/src/types/index.ts 导出新类型
- [ ] 13.3 更新 packages/ui/src/router/index.ts 调整路由（mcp → tools，新增 marketplace 相关路由）
- [ ] 13.4 更新 SideNav.vue 菜单项（MCP → 工具商城，新增商城管理入口）

## 14. 测试与验证

- [ ] 14.1 编写自定义工具 CRUD API 集成测试
- [ ] 14.2 编写 JS 沙箱执行器单元测试（正常/超时/异常/危险操作）
- [ ] 14.3 编写远程商城源连接测试
- [ ] 14.4 编写 Skill/Agent 下载到本地功能测试
- [ ] 14.5 编写商城 API 响应格式一致性测试
- [ ] 14.6 编写管理工具函数注册与权限测试
- [ ] 14.7 手动端到端验证：从远程商城安装 Skill → 在聊天中使用
