# post-comment — 发一条引导评论

## 页面锚点（**2026-10-15 实抓更正**）

真实 DOM **与旧配方不符**，以本表为准：

| 元素 | ✅ 实抓（正确） | ❌ 旧配方（已失效） |
|------|----------------|---------------------|
| 输入框 | `div.input-d24X73`（contenteditable，placeholder「有爱评论，说点好听的~」） | `.comment-input-inner-container` / `div.public-DraftEditor-content` |
| 发送按钮 | 可见文本「**发送**」 | `#comment-input-container span.wchsYBpK`（**未找到**） |

## 步骤

1. 打开 `https://creator.douyin.com/creator-micro/interactive/comment`
2. 选中目标作品
3. 在输入框**真实键盘键入**评论文案（Draft.js contenteditable —— **JS 设 innerText 不生效**）
4. 点「发送」
5. 核验：页内 fetch `comment/list` 接口，`total ≥ 1`

## ⚠️ 评论置顶 Web 端做不到（2026-10-14 穷尽验证，别再找）

2026-10-14 穷尽验证：后台评论管理只有「回复/删除/举报」，**全页无「置顶」字符串**；
公开视频页评论「…」菜单也无置顶项；接口 `is_pinned` 恒 0。

→ **要置顶只能手机 App 手动**；做完如实说明，不要再花步数找入口。

## 旁证

`www.douyin.com/video/<id>` 公开页显示「暂无评论」与接口 0 条吻合 → 可作**旁证**，不可作发送入口。
