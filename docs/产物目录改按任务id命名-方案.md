# 产物目录改按任务 id 命名 —— 方案（待拍板）

> 起因：用户问「应该是生成对应的任务 id 目录吧」。
> 结论先说：**这次生图图裂不是它引起的**（那个是前端 URL 拼接 bug，已修），
> 但现有命名方式确有真实隐患，建议改。本文只讲这一件事，确认后再动代码。

---

## 一、现状（代码实据）

目录规范单点在 `packages/shared/src/utils/artifact-paths.ts`：

```
<根>/.yan-zhi/tasks/<YYYY-MM-DD>-<会话标题>/<uploads|intermediate|deliverables>/
                              └─ buildArtifactTaskDirName()  L68
```

- 落盘侧：`apps/server/src/mcp/api-tool-executor.ts` `mediaTarget()` L338 → `ensureArtifactDirFor({conversationId, category})`
- 读取侧：`apps/server/src/index.ts` L153 静态路由 → `resolveArtifactDirFor({conversationId, category})`
- 两侧都经 `apps/server/src/services/artifact-dir.ts` 的 `resolveArtifactDirFor()` —
  它每次调用都**现查会话的当前标题**（`conversationArtifactMeta()` L30 读 `conversation.title`）再推导目录名

也就是说：**目录名不是一次性写死的，而是每次请求都拿「会话当前标题」重算出来的。**

## 二、隐患（两条，都可被用户正常操作触发）

| # | 触发方式 | 后果 | 严重度 |
|---|---|---|---|
| 1 | 会话**改名**（`packages/ui/src/composables/chat/useChat.ts:2609` 就有重命名入口，是常规操作） | 改名后读取侧算出的是新目录，而产物还在旧目录 → **此前的图片/视频/交付物全部 404**，磁盘上留成永久孤儿 | high |
| 2 | 同一天创建两个**同标题**会话（如都叫「分析最近的手机行业」，实测库里已有 3 条同名会话） | 两者共用同一目录，产物**混在一起**，互相看不见对方但文件堆在一处 | medium |
| 3 | 标题被 sanitize 后撞名（`A/B` 与 `A:B` 都被折叠成 `AB`） | 同 #2 | low |

注：会话标题**没有**自动生成/自动改写逻辑（全仓只有创建时必填 + PATCH 显式改），
所以 #1 现在只由用户手动改名触发，不是自发的。

## 三、方案

### 方案 A（推荐）：目录以会话 id 为键

```
<根>/.yan-zhi/tasks/<conversationId>/<category>/
例：C:\...\文档\.yan-zhi\tasks\e824e62a-e446-449b-bad8-62e86c71f510\deliverables\
```

- 读取侧**只凭 URL 里的 conversationId** 就能定位，完全不依赖标题 → 改名/撞名问题一并消失
- id 全局唯一且不可变，永不碰撞
- 代价：目录名不可读。但「人类可读」本来就由文件管理列表（会显示会话与文件名）和文件名承载，不是靠文件夹

改动点：
- `artifact-paths.ts`：`buildArtifactRelDir` 增加 id 分支（保留 title 版供回退）
- `artifact-dir.ts`：`resolveArtifactDirFor` 改为 id 优先
- `apps/server/src/index.ts` 静态路由：先试新目录，miss 再试旧目录（**历史文件零改动照常可访问**）
- `routes/files.ts` 的 `artifact-dir` 接口、前端 `useChat.ts` 的 `resolveArtifactDirFor` 同步
- 新增单测：改名后仍能解析到原目录、旧目录回退命中

### 方案 B（备选）：保留可读名，id 作为稳定后缀

```
<根>/.yan-zhi/tasks/<YYYY-MM-DD>-<标题>__<id8>/
```

- 目录名仍可读，读取侧按 `__<id8>` 后缀扫 `tasks/` 匹配
- 代价：每次媒体请求都要扫一层目录（可加缓存抵消），实现比 A 复杂

## 四、无论选哪个都要做的

1. **旧目录回退**：读取侧 miss 新规则 → 回退探测 `<date>-<title>` 旧目录，保证已存在的产物不丢
2. **不做批量搬运**：现有文件留在原地（回退能命中），避免一次性移动大量文件出错
3. 本次已修的两处不在本方案范围内（已完成）：
   - 前端 `/api/api/...` 重复前缀 → `resolveServerUrl`（图裂根因）
   - 生图/生视频产物未登记 `conversation_file`（文件管理空白根因）

## 五、请拍板

- [ ] A（会话 id，推荐）
- [ ] B（可读名 + id 后缀）
- [ ] 暂不改，只保留旧目录回退
