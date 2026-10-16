# 番茄达人中心（kol.fanqieopen.com）

> 平台总览 + **全站共用骨架**（2026-10-06 CDP 实抓）。各页细节见同目录子页面。

## 何时用

选书 / 取正文 / 建别名 / 回填发文 —— 全链路都在这一个站点。

## 页面

| 页面 | 文档 | 说明 |
|------|------|------|
| 内容库（选书） | `content/index.md` | 榜单切换 / 搜书 / 进书详情 |
| 书详情（取正文） | `book-detail/index.md` | 目录 / 正文阅读区 / 逐章抓取 |
| 别名管理（申词 · 回填） | `alias-manage/index.md` | 批量建别名 / **回填发文** |

## 全站骨架（所有页共用）

```text
body
└─ div.root
   └─ div.kol-container-yd1s0v.with-sidebar.has-header
      ├─ div.container-header-WvBsp_.kol-container-header-*     ← 顶栏（创作工具/小程序/帮助中心/在线客服/账号）
      └─ div.kol-main-xYpEa5
         ├─ div.container-sidebar-yT3wLf.kol-main-sidebar-*     ← 左侧菜单
         │  └─ div.arco-menu.arco-menu-light.arco-menu-vertical.kol-menu-*
         │     └─ div.arco-menu-inner
         │        ├─ div.arco-menu-inline > div.arco-menu-inline-header（分组头：内容库 / 申词记录）
         │        │  └─ div.arco-menu-inline-content > div.arco-menu-item.arco-menu-item-indented
         │        │     └─ a.menu-item-gZYTSO[href=/page/content?tab_type=2&top_tab_genre=-1]（番茄小说）
         │        └─ div.arco-menu-item > a.menu-item-gZYTSO（主页 / 批量记录 / 我的收益 / 课程中心）
         └─ div#kol-content-box.kol-main-content-*              ← 页面主体挂载点
```

- **菜单结构对照**：内容库（红果短剧 `tab_type=6` / 番茄小说 `tab_type=2` / 红果漫剧 `tab_type=16`）、
  **申词记录**（同样按 `tab_type` 分）、批量记录 `/page/batch-history`、我的收益 `/page/income`。
- `div#kol-content-box` 是**每个页面主体的挂载点** —— 定位不到元素时，先确认页面主体挂在哪。
- 定位一律「文本 + `[class*=前缀]`」；类名带 hash 后缀会漂（见 `../../common/arco-dom.md`）。
