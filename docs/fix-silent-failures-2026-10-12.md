# 两个前端静默失效 —— 根因与修复（2026-10-12）

> 状态：**均已落地**（测试 + 变异验证全过；ui 全量 725 过 0 失败；vue-tsc exit 0）

---

## 一、`Failed to resolve component: AiDiffView / CodeConflictEditor`

**用户实报**：
```
CodeEditorArea.vue:256 Failed to resolve component: AiDiffView
CodeEditorArea.vue:256 Failed to resolve component: CodeConflictEditor
```

### 根因

两个组件文件**一直存在**（`packages/ui/src/components/code/` 同目录），模板里也一直在用：

| 组件 | 模板位置 | 用途 |
|---|---|---|
| `AiDiffView` | `CodeEditorArea.vue:149` | 模型改动的 diff 对比（应用 / 回退 / 忽略） |
| `CodeConflictEditor` | `CodeEditorArea.vue:226` | 合并冲突解决（三栏 IDE 风格弹窗） |

但 `<script setup>` 里**从未 import 它们**。`<script setup>` 不会自动注册同目录组件 ——
未 import 即"未注册" ⇒ Vue 运行时解析失败 + console warn + **该处 UI 静默不渲染**。

后果（严重）：
- `AiDiffView` 不渲染 ⇒ **模型改动看不到 diff，点不到「应用/回退」**
- `CodeConflictEditor` 不渲染 ⇒ **合并冲突无法解决**

**对照佐证**：`components/code/panels/AiChangesReviewPanel.vue:55` 有
`import AiDiffView from '../AiDiffView.vue'` —— **同一组件在那边是正常 import 的**，
只有 `CodeEditorArea.vue` 漏了。属"复制/重构时漏带 import"。

### 修复

`CodeEditorArea.vue` 补两行 import（含 why 注释）。

### 守门测试（新增 `components/componentRegistration.test.ts`，5 项）

**通用扫描器**：遍历 `packages/ui/src` 全部 `.vue`，模板里出现的**大驼峰标签**必须满足其一：
① `import Foo from '...'` ② `const Foo = defineAsyncComponent(...)` ③ `components: { Foo }`
④ **递归自引用**（文件名 == 标签名，Vue SFC 天然支持）⑤ Element Plus 图标（全局全量注册）

★ 三条"扫描器自证"（防假绿）：抓到的标签数 > 0 / `isRegistered` 对未 import 必须返回 false /
扫描文件数 > 50。

### 扫描器实现中踩到的两个坑（都有实测依据）

| # | 坑 | 后果 | 修法 |
|---|---|---|---|
| ① | 用 `<template[\s\S]*?</template>` **非贪婪配对** | 模板内有大量**嵌套 `<template v-if>`**，第一个内层 `</template>` 就闭合 ⇒ 后半段的 `<CodeConflictEditor>` **扫不到**（变异实测漏判） | 改**反向法**：剥掉 `<script>`/`<style>` 剩下的就是模板，天然免疫嵌套 |
| ② | 在**未剥注释**的 script 上判 `import Foo` | 注释里写"对照：`panels/X.vue` 里有 `import AiDiffView from '...'`" ⇒ **被当成真 import** ⇒ 漏判（变异实测：删掉真 import 后扫描器仍判"已注册"） | 先 `stripComments()` 再判 |

### 变异验证

删掉新加的 import → **全量扫描器精准报出**
`components\code\CodeEditorArea.vue → <AiDiffView>` 与 `→ <CodeConflictEditor>`，定点测试同时红。

---

## 二、`GET /api/plugins net::ERR_CONNECTION_REFUSED`（dev 冷启动）

**用户实报**：dev 启动时 console 报
```
backend-ready.ts:55  GET http://127.0.0.1:3001/api/license/default  net::ERR_CONNECTION_REFUSED
client.ts:144        GET http://127.0.0.1:3001/api/plugins         net::ERR_CONNECTION_REFUSED
```

### 现场（主进程日志铁证）

```
17:25:34  [后端] 用 Electron Node.js + tsx 启动
17:26:06  [后端] MSG: 启动超时，强制创建窗口      ← ★ 32 秒 > 主进程 30 秒健康检查上限
17:26:35  [renderer] 后端基址: http://127.0.0.1:3001/api   ← 前端挂载，请求必然被拒
```

`main.cjs` 的健康检查是 `60 次 × 500ms = 30 秒` 硬上限；tsx **冷编译**超过就放弃等待、
强行建窗 ⇒ 前端挂载时后端还没监听 ⇒ `ERR_CONNECTION_REFUSED`。

**当时后端稍后就绪**（事后 curl 验证 `license/default=200`、`plugins=200`），
所以这**主要是 dev 环境的启动竞态**，不是后端坏。

### 真缺陷：`plugin.refresh()` 漏了 waitForBackend

| store/view | 是否 `await waitForBackend()` |
|---|---|
| `auth.ts:loadUser` | ✅ |
| `license.ts:init` | ✅ |
| `useChat.ts:onMounted` | ✅ |
| `views/Agents.vue` | ✅ |
| `views/Models.vue` | ✅ |
| **`stores/plugin.ts:refresh`** | ❌ **漏**（本次修复） |

`ModeSwitcher.vue:185` 在 onMounted 直接 `pluginStore.refresh()` —— 属**启动关键路径**。
被拒后 `plugins.value` 为空、`loaded` 不置位、**后续也不会自动重试** ⇒ **插件列表静默缺 UI**。

**为什么必须补**（不只是"减少一条红日志"）：
- 项目的统一口径就是"启动期首个请求前先 `await waitForBackend()`"（见 `api/backend-ready.ts` 顶部）
- 它是**幂等 + 有记忆**的（就绪后立即返回、零额外延迟）⇒ 放在这里对"运行期再刷新"零代价

**修复**：`plugin.ts` import + `refresh()` 首行 `await waitForBackend()`。

**守门测试**：在 `mobilePackagingAndColdStart.test.ts`（该文件本就管这条口径）加一项，
断言 `waitForBackend` 出现在 `/plugins` 请求**之前**。变异（删掉等待）→ 精确红。

### 未做（需拍板的独立议题）

主进程 30 秒硬上限对 tsx 冷启动偏紧。可选方向（**本次未动**）：
1. 把上限调大（如 90s）—— 但会让"后端真崩了"时用户干等更久
2. 超时后不"强制建窗"，而是显示明确的"后端启动中/失败"态 —— 属 UI 变更
3. dev 下预编译 server（可显著缩短冷启动）

---

## 三、共同教训

两个问题**形态不同、教训同源**：

| | 问题一 | 问题二 |
|---|---|---|
| 形态 | 模板用了但未注册 | 启动期请求未等后端 |
| 表现 | **UI 静默不渲染** | **数据静默为空** |
| 为什么难发现 | 不报错、不崩，只在渲染到该分支时 warn | 一条红日志，之后一切正常 |

> **「静默失效」家族的共同点：不抛异常、不崩溃，只是少了一块东西。**
> 防守手段也应一致 —— **静态扫描**（问题一：把"模板标签 vs 注册"变成 CI 断言）
> 与 **口径统一 + 定点守门**（问题二：所有启动期请求都必须过 `waitForBackend` 这道门）。
