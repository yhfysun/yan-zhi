# UI 交互一致性审查与改造（2026-09-05）

审查范围：`packages/ui/src/**` 全部「新建 / 新增 / 编辑」类操作。
结论基线：共 21 处 → 弹窗 18 处（86%）+ 内嵌 3 处（14%）+ 路由跳转 0 处。

## 一、P0 阻断缺陷（已修）

**`views/DataSourcesPage.vue` 删除数据源：点「取消」照样删除。**

```ts
// 修复前：cancel 会以 reject 抛出，被 catch 吞掉后代码继续往下走
await ElMessageBox.confirm(...).catch(() => null);
const res = await api.delete(`/datasources/${ds.id}`);
```

改为 `try { await confirm } catch { return }`，与 `MemoryManage.vue:404`、`Agents.vue:293` 的既有正确写法对齐。

## 二、内嵌表单弹窗化（3 处 → 0 处）

| 位置 | 原形态 | 问题 | 现状 |
|---|---|---|---|
| `views/DataSourcesPage.vue` | 表单卡片插进 `.ds-grid` 首位 | 打开即整片重排；编辑时「顶部编辑卡 + 列表里同一条原卡」并存；不支持 Esc | 改为 `FormDialog` |
| `components/memory/MemoryManage.vue:42` 手动新增 | 顶部内联表单 | 「手动新增」是取反开关，已打开时再点会静默关闭并丢弃已输入内容 | 改为 `FormDialog` |
| `components/memory/MemoryManage.vue:96` 编辑 | `el-table` 展开行内编辑 | 窄屏挤压；保存后强制跳回第 1 页 | 改为 `FormDialog`，展开列随之移除 |

配套修复：
- ✅ `DataSourcesPage.vue` 主「保存」按钮 `:loading` 恒 false（`saving = alsoTest`，保存传 false）→ 改为 `saving = true`
- ✅ `MemoryManage.vue` `reload()` 写死 `page: 1` → 新增 `reload(keepPage)`，新增/编辑后就地刷新

## 三、新增通用组件 `components/FormDialog.vue`

抽取自项目内最规范的 `AgentEditDialog.vue`，统一承载：

- ✅ `v-model` 双向 + `isEdit` 标题自动切换（新建 X / 编辑 X）
- ✅ 默认 `:close-on-click-modal="false"` —— 防误点遮罩丢失输入
- ✅ `destroy-on-close`
- ✅ `@closed` 事件，供父组件复位（弹窗只销毁内部 DOM，表单状态在父组件里必须自己清）
- ✅ 可选 `unsavedGuard` + `dirty`：有未保存修改时，X / Esc / 取消均拦截并二次确认
- ✅ `footer` 插槽（可完全自定义，插槽暴露 `close()` 走同一套守卫）
- ✅ **`bodyClass` 属性**：把设计令牌作用域带进 teleport 出去的弹窗。数据源页传 `dw-root`，否则 `.dw-root .ds-*` 选择器在弹窗内全部失效

用法示例：

```vue
<FormDialog
  v-model="formOpen"
  :is-edit="!!editingId"
  title-create="新建数据源"
  title-edit="编辑数据源"
  width="720px"
  :loading="saving"
  :unsaved-guard="true"
  :dirty="formDirty"
  body-class="dw-root"
  @submit="save(false)"
  @closed="onFormClosed"
>
  <!-- 表单体 -->
  <template #footer="{ close }">
    <el-button @click="close()">取消</el-button>
  </template>
</FormDialog>
```

## 四、全站弹窗遮罩保护收口（17 处）

给带输入的表单弹窗补 `:close-on-click-modal="false"`，避免误点遮罩丢失输入。

- ✅ `views/Agents.vue:152` 添加远程智能体商城
- ✅ `views/ChatHub.vue:171,179` 设置昵称 / 节点设置
- ✅ `views/Peers.vue:83,91` 设置昵称 / 节点设置
- ✅ `components/chat/ChatSidebar.vue:148` 编辑空间
- ✅ `views/Knowledge.vue:223,249` 新建知识库 / 添加文档
- ✅ `views/Mcp.vue:76` 新增 MCP 服务
- ✅ `views/PlatformDetail.vue:86,122` 添加模型 / 批量设置上下文窗口
- ✅ `views/ToolMarket.vue:208,255` 自定义工具编辑器（含大段 JS 代码）/ 远程工具商城
- ✅ `views/skill-market/LocalSkillMarket.vue:87` 从 Markdown 导入
- ✅ `views/skill-market/MarketplaceCards.vue:38` 添加远程 Skill 商城
- ✅ `components/plugin/PluginManager.vue:60` 插件配置（textarea JSON）
- ✅ `components/BrowserPanel.vue:247` 保存密码

只读展示类弹窗（浏览历史、工具列表、日志、运行结果等）未加，点了也不会丢数据。

## 五、改动的坑与结论

- ✅ **teleport 陷阱**：`el-dialog` 默认 `append-to-body`，弹窗 DOM 不在 `.dw-root` 内，所有 `.dw-root .ds-*` 样式失效。必须靠 `bodyClass` 在弹窗内容外层重建令牌作用域。
- ✅ **误报纠正**：初评认为 `Knowledge.vue`、`LocalSkillMarket.vue` 缺 `@closed` 会残留上次输入。核查后确认二者在 `openCreate/openEdit` 时已完整重设表单（`Knowledge.vue:552,561,652`；`LocalSkillMarket.vue:167,174`），**不存在残留问题，未做多余改动**。
- ✅ 清理 `MemoryManage.vue` 中随行内编辑一同失效的样式：`.inline-form*`、`.row-edit-form`、`.row-edit-empty`、`.el-table__expand-*` 隐藏规则。

## 六、验证

```
cd packages/ui && npx vue-tsc --noEmit   # 通过，无输出
cd apps/web    && npx vue-tsc --noEmit   # 通过，无输出
```

未做手动冒烟：数据源弹窗、记忆新增/编辑弹窗建议实际点一遍，重点看未保存守卫与 teleport 后的样式。

## 七、遗留（未做，可单独排期）

- 全站弹窗均无 `draggable`，长表单在矮屏依赖 `.el-dialog__body` 全局滚动兜底
- 数据源列表一次拉全量、无分页、无批量操作（记忆已有分页，两者不一致）
- 数据源空态仅一行文案，无操作引导（记忆已有 `el-empty` + 引导）
- 删除操作无撤销机制
- 移动端（Capacitor）下多数弹窗为居中窄卡片而非全屏
