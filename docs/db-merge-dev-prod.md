# dev 与安装版数据库合并方案

> 2026-10-10 · 目标：dev 与安装版**共用一套库 + 同一端口**，`pnpm dev:desktop` 启动即可对着真实数据测试。

## 一、现状（实测，非推测）

| 项 | 安装版（生产） | dev 模式 |
|---|---|---|
| userData | `%APPDATA%\yan-zhi` | `%APPDATA%\yan-zhi-dev` |
| DATA_DIR | `...\yan-zhi\server-data` | `...\yan-zhi-dev\server-data`（**目录从未创建**） |
| 库文件 | `data.db` **159 MB**，50 张表 | — |
| 端口 | 3001 | 3002 |
| 模型/bin | 共享 `yan-zhi`（已设计共享） | 同左 |

**另有 dev 遗留库**：`apps/server/data.db`（28.5 MB，10-08 最后写）
—— 这是 `7b53156 fix(dev): 开发模式注入 DATA_DIR` **修复之前**，dev 把库落在源码目录留下的。

### dev 遗留库损坏情况（已确诊）

- 症状：`malformed database schema (sqlite_autoindex_knowledge_doc_1) - orphan index`
- 根因：**4 个孤儿索引**（`idx_kb_base_user` / `idx_kb_doc_base` / `idx_kb_visibility` /
  `sqlite_autoindex_knowledge_doc_1`）指向**不存在的表** `knowledge_base` / `knowledge_doc`
  —— 典型 schema 迁移中断残留（dev 库 40 表，生产库 50 表，缺的正是这两张）
- **已验证可修复**：`PRAGMA writable_schema=ON` 后删这 4 个索引 → 40 表全部可读
- 可读数据：14 会话 / **1127 消息** / 7 用户 / 95 模型 / 45 本体 / 54 技能 / 8 自定义工具 / 25 智能体

## 二、目标口径（用户已拍板）

1. **两库真合并** —— dev 数据并入生产库
2. **端口统一 3001**
3. **不做 schema 保护** —— 直接共用

## 三、合并策略

### 3.1 库路径统一

改 **dev 的 DATA_DIR 指向生产目录**（`%APPDATA%\yan-zhi\server-data`）。

理由：`main.cjs` 的 DATA_DIR 是 `path.join(app.getPath('userData'), 'server-data')`，
而 dev 的 userData 被 `instance.cjs` 设成 `yan-zhi-dev`。
**只需让 dev 也用生产 userData**，库路径自然统一 —— 且 `models/`、`bin/` 本来就共享。

**落点**（二选一，推荐 A）：
- **A. 改 `instance.cjs`**：让 `DEV_USERDATA_NAME = DEFAULT_USERDATA_NAME`（即不再分离 userData）。
  ⚠️ 副作用：dev 的 localStorage / keyring / 浏览器存储也一起共用（可能是好事，登录态共享）。
- **B. 只改 DATA_DIR**：dev 保 `yan-zhi-dev` userData，但显式把 `DATA_DIR` 指到 `yan-zhi/server-data`。
  只共用数据库，其余状态仍隔离。但需同时改 `bin/dev.mjs` + `dev.cjs` 的 `resolveDevDataDir()`。

### 3.2 端口统一

`instance.cjs` 的 `DEV_API_PORT` 从 `3002` 改 `3001`。

⚠️ 副作用：dev 与安装版**不能同时启动**（抢单实例锁 + 端口），且 dev 会顶替安装版。
若想"平时也能同开"，建议保留 3002、只统一库 —— **此项需再确认**。

### 3.3 dev 数据并入生产

对 dev 遗留库（`apps/server/data.db`）逐表迁移：

1. **先修**：删 4 个孤儿索引 → 库可打开
2. **按表 INSERT OR IGNORE** 把 dev 独有行并入生产库
   - 主键冲突：跳过（保留生产侧）
   - 关联完整性：conversation→message→conversation_file 层级按 id 走
   - 冲突域：`platform` / `model`（两库都有 95 个模型，会大量重名）→ 需去重策略
3. **迁移后清理**：dev 遗留库改名归档（不删），源码目录不再有库

### 3.4 防复发

- `apps/server/data.db*` 加入 `.gitignore`（确认是否已有）
- `db.ts` 的 `dataDir` 兜底 `path.join(__dirname, '..')` 是**事故根源**
  （dev 无 DATA_DIR 时落到源码目录）→ 建议改成**显式报错**或落到 `%APPDATA%`，
  不再静默落到源码目录

## 四、风险分级

| 风险 | 级别 | 说明 |
|---|---|---|
| 写坏生产库（159MB 真数据） | **high** | 必须：①先关所有 yan-zhi 进程 ②合并前完整备份 |
| dev 分支 schema 迁移改坏生产库 | **high** | 用户选择"不做保护" → 建议**至少**在合并前备份一次 |
| 模型/平台去重后 id 漂移 | medium | 会话引用的 model_id 若被换会显示异常 |
| 端口统一后两实例互斥 | low | 设计使然，用户已知 |

## 五、执行顺序（待确认后执行）

1. **停进程** + 备份生产库（`data.db` + `-wal` + `-shm`，sha256 记档）
2. 修复 dev 遗留库（删孤儿索引），导出各表数据
3. 按表合并进生产库（冲突跳过 / 去重）
4. 改代码：库路径统一（3.1）+ 端口（3.2，待确认）
5. `.gitignore` + `db.ts` 兜底加固（防复发）
6. 启动 dev 验证：能读到 159MB 库的 3887 条消息 + dev 并入的 1127 条
7. 归档 dev 遗留库

## 六、待确认（已在 2026-10-10 全部拍板）

- [x] 3.1 → **A：连 userData 一起共用**
- [x] 3.2 → **端口统一 3001**
- [x] 3.3 → **模型/平台以生产为准**

---

## 七、执行结果（2026-10-10 已完成）

### 备份
- `server-data/backups/data.db.20261010-175836.bak`（159 MB，sha256 `3af658670e0b...`）
  —— 校验：integrity ok / 3887 消息 / 20 会话 / 50 表

### 合并（脚本 `scripts/merge-dev-db.py`，可重复执行）
dev 库修复方式：`PRAGMA writable_schema=ON` 删 4 个孤儿索引 + 逐行容错读取
（`skill` 表整表失败 → 逐行抢回 45 行，坏 9 行）。

| 表 | 合并前 | 合并后 | 新增 |
|---|---|---|---|
| conversation | 20 | **34** | +14 |
| message | 3887 | **5014** | +1127 |
| user | 1 | **7** | +6 |
| model | 24 | **109** | +85（去重） |
| platform | 2 | **9** | +7 |
| skill | 49 | **54** | +5 |
| agent / ontology / plugin | — | 不变 | 同 id 跳过（以生产为准） |

清理：删除 2 条孤儿 `knowledge_chunk`（dev 测试数据，引用不存在的 doc/base）→
`foreign_key_check` = 0 违规、`integrity_check` = ok。

### 代码改动
| 文件 | 改动 |
|---|---|
| `apps/desktop/instance.cjs` | `DEV_API_PORT = DEFAULT_API_PORT`（3001）；`DEV_USERDATA_NAME = DEFAULT_USERDATA_NAME`（yan-zhi）；`seedFrom` 改按「路径是否相同」判定（防自我复制） |
| `bin/dev.mjs` | `DEV_USERDATA_NAME = 'yan-zhi'`；`DEV_API_PORT = 3001`；`guardProductionPort` 提示语改为「先退出正式版」；DevTools 目录探测简化为单目录 |
| `apps/server/scripts/dev.cjs` | `DEV_USERDATA_NAME = 'yan-zhi'` |
| `packages/shared/src/utils/local-server.ts` | `DEV_API_PORT = DEFAULT_API_PORT`（3001） |
| `apps/server/src/db.ts` | ★ 兜底加固：无 DATA_DIR 时落 `%APPDATA%/yan-zhi/server-data` + 醒目警告，**不再静默落源码目录** |
| `.gitignore` | 注释更新（`*.db` 规则已覆盖） |
| `apps/desktop/main.cjs` / `preload.cjs` | 注释更新（逻辑本就走 `API_PORT` 变量，无硬编码） |

### 测试更新（钉新口径）
`apps/desktop/test/instance.test.cjs`（26 pass）、`data-dir-injection.test.cjs`（6 pass）
—— 原断言「端口必须错开 / userData 必须不同」全部反转为「必须相同」。

### 归档
- dev 遗留库移到 `server-data/backups/legacy-dev-db/data.db.corrupt-dev-legacy-20261010`（28.5 MB）
- `apps/server/` 下的 `data.db*` 已清空

### 验证
- 全仓 `pnpm -r typecheck` 全绿（8 包）
- desktop 全部测试 134 项全过
- dev 的 `DATA_DIR` 实测解析 = `%APPDATA%\yan-zhi\server-data`（177.6 MB，含合并后数据）
- `seedFrom === null`（不会自我复制）

### 使用方式（新）
```
pnpm dev:desktop     # 直接对着真实库（%APPDATA%/yan-zhi/server-data/data.db）
```
⚠️ dev 与安装版**不能同时启动**（同端口 3001 + 同单实例锁）。临时并存：
`YANZHI_API_PORT=3002 pnpm dev:desktop`（但库仍同一份）。

### 回滚
```bash
cp "server-data/backups/data.db.20261010-175836.bak" "server-data/data.db"
```

