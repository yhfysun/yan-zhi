## Context

当前项目使用 Vue 3 + Element Plus + Pinia，页面布局在 `App.vue` 中通过 flex 布局管理：左侧 240px 固定导航栏 + 右侧弹性主内容区。聊天页面 `Chat.vue` 内部还有第二层 280px 会话侧边栏。

项目已有文件读写工具（`file_read`/`file_write`）和 FS 适配器（`readDir`/`readFile`/`writeFile`/`remove`/`exists`），但没有集中的文件浏览管理界面，且 `file_read` 仅支持纯文本读取。

**核心设计决策**：文件的上下文传递采用"引用传递"模式——不把文件内容塞进 prompt，而是给模型一个文件引用（ID + 元信息 + 前几行预览），模型需要时通过 `file_read` 工具自行读取。

## Goals / Non-Goals

**Goals:**
- 移除 App.vue 左侧全局 sidebar，改为右上角 topbar 圆钮导航
- 将用户登录/退出操作收纳到右上角用户头像圆钮
- 聊天页面新增滚到底部/顶部的浮动跳转按钮
- 聊天页面右侧新增可折叠文件管理面板
- 文件上传后生成唯一 ID，引用传递时只发送元信息 + 前 5 行预览
- `file_read` 工具增强：支持 Excel 解析（sheet + 行列范围），输出 CSV/JSON
- 统一 CSS 变量体系（语义色、阴影、圆角层级）
- 页面切换动画加位移效果
- 列表页增加骨架屏加载态
- Toast 通知位置移至右上角

**Non-Goals:**
- 不把完整文件内容拼入 prompt（上下文有限且昂贵）
- 不改变路由结构和 Store 逻辑
- 不改变聊天核心功能（发送、流式、工具调用等）
- 不实现 Excel 的图表/公式/样式解析（只解析数据）
- 不涉及移动端适配

## Decisions

### 1. 文件引用传递机制

上传文件后，系统生成如下引用对象发给模型：

```json
{
  "fileId": "f_a1b2c3d4",
  "fileName": "sales_report.xlsx",
  "type": "xlsx",
  "size": 245760,
  "preview": "Sheet1: [col1, col2, col3]\nRow1: 2024-Q1, Beijing, 150000\nRow2: 2024-Q1, Shanghai, 230000\n..."
}
```

- 文本文件：preview 为前 5 行原文
- Excel 文件：preview 为第一个 sheet 的前 3 行 + 列名
- 图片/二进制：preview 为元信息文字描述

**理由**: 大模型一次调用上下文有限（8K-128K），文件可能很大。引用传递让模型自行决策何时读取哪些部分，省 token 且灵活。

### 2. Excel 解析方案

使用 `xlsx` 库（SheetJS 社区版）在 `file_read` 工具的 execute 中增加分支：

```
file_read 参数扩增:
  path: string (必须)
  encoding?: 'utf-8' | 'base64'
  sheet?: string           // 新增：指定 sheet 名，不传则返回第一个
  range?: string           // 新增：eg. "A1:D100"，不传则返回全表
  format?: 'csv' | 'json'  // 新增：输出格式，默认 csv
```

**理由**: SheetJS 是 Excel 解析的事实标准，纯 JS 不依赖原生库，Node/Web/Desktop 三端都能跑。xlsx 包本身约 1.2MB，可动态 import 避免核心包膨胀。

### 3. 文件 ID 生成

使用 `nanoid` 或简单 `crypto.randomUUID()` 生成短 ID，前缀 `f_` 标识文件引用。文件存储在工作目录 `workspace/files/` 下。

### 4. Topbar 实现

Element Plus Dropdown，position: fixed 右上角。

### 5. CSS 变量分层

三层 token：Primitive → Semantic → Component。

## Risks / Trade-offs

- **xlsx 库体积**: 1.2MB 可能增大包体积。→ 动态 import，仅在使用时加载
- **文件安全**: 删除操作不可逆。→ 二次确认弹窗
- **大 Excel 解析**: 1M+ 行的 Excel 可能内存爆炸。→ range 参数支持分页读取，默认限制 10000 行
- **文件引用与实际文件不同步**: 文件被外部删除后引用失效。→ file_read 会返回 "file not found" 错误，模型可处理
