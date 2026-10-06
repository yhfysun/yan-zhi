# 番茄达人中心 · 真实 DOM 结构样本（2026-10-06 实抓）

> 来源：CDP `get_dom` 实抓（书 book_id=7452620888077241368），非手写推测。
> ⚠️ 类名带 hash 后缀会漂（如 `book-title-txt-_CIhYa`），**匹配用稳定前缀 + 文本**，别写死 hash。
> 抓取手段：`browser_action { action:'get_dom', maxNodes:2500, depth:20, selector:'<容器类名前缀>' }`。

## 0. 全局骨架（所有页共用）

```
body
└─ div.root
   └─ div.kol-container-yd1s0v.with-sidebar.has-header
      ├─ div.container-header-WvBsp_.kol-container-header-*        ← 顶栏（创作工具/小程序/帮助中心/在线客服/账号）
      └─ div.kol-main-xYpEa5
         ├─ div.container-sidebar-yT3wLf.kol-main-sidebar-*        ← 左侧菜单
         │  └─ div.arco-menu.arco-menu-light.arco-menu-vertical.kol-menu-*
         │     └─ div.arco-menu-inner
         │        ├─ div.arco-menu-inline > div.arco-menu-inline-header（分组头：内容库 / 申词记录）
         │        │  └─ div.arco-menu-inline-content > div.arco-menu-item.arco-menu-item-indented
         │        │     └─ a.menu-item-gZYTSO[href=/page/content?tab_type=2&top_tab_genre=-1]（番茄小说）
         │        └─ div.arco-menu-item > a.menu-item-gZYTSO（主页/批量记录/我的收益/课程中心）
         └─ div#kol-content-box.kol-main-content-*                 ← 页面主体挂载点
```

菜单结构对照：内容库（红果短剧 tab_type=6 / 番茄小说 tab_type=2 / 红果漫剧 tab_type=16）、申词记录、批量记录 /page/batch-history、我的收益 /page/income。

## 1. 内容库列表页（/page/content?tab_type=2）

```
div#kol-content-box
└─ div.kol-page.page-*.column
   ├─ div.header-*（页头：标题「番茄小说」+ 通知轮播 kol-notice-bar-* + 查看任务规则）
   └─ div.list-*
      ├─ div.task-menu.menu-*                                ← 榜单切换
      │  ├─ .task-menu-first > .task-menu-first-item（网文[active] / 漫画 / 有声书 / 漫剧 / 短剧）
      │  └─ .task-menu-second > .task-menu-second-item（爆款榜[active] / 阅读榜 / 潜力榜 / 全部内容）
      ├─ div.filter-* > .arco-radio-group（频段筛选：全部/男频/女频，button.arco-btn-text）
      ├─ .sort-row-* > .arco-tabs（排序 tab）+ 搜索框：
      │    input.arco-input[placeholder="请输入作者名/书名/BookID"]   ← 受控组件，原生 setter + input 事件
      └─ 书目卡片（每个榜单项一个）：
         div.book-hQ7GYr
         ├─ div.book-main-TYd2nR
         │  ├─ .book-main-thumb-* > .book-main-rank-* > span.book-main-rank-val-*（排名数字）
         │  └─ .book-main-cnt-*
         │     ├─ .book-title-* > div.book-title-txt-*        ← 书名（text）
         │     └─ .book-category-* > span（作者 / 题材 / 字数 / 上架日期 / 评分，用 .book-category-item-split-* 分隔）
         └─ div.book-opt-*
            ├─ button.arco-btn-secondary（图标按钮）
            └─ .arco-space.c-promotions > button「别名推广」    ← 点它进书详情/申词
```

## 2. 书详情页（/page/content/book-detail?tab_type=2&top_tab_genre=-1&book_id=<id>&genre=0）

⚠️ URL 三参数（tab_type/top_tab_genre/genre）缺一正文区必卡「加载中」。

```
div.kol-page.book-detail-page-uyEg2j.column
├─ div.arco-page-header.kol-page-header
│  ├─ .arco-page-header-title > .kol-page-header-title.clickable > span.page-title-*（书名 + 返回箭头）
│  └─ .arco-page-header-head-extra > button「别名推广」
└─ div.main-G5W5uE
   ├─ div.w-card.sider-left-IxzcaP（左栏）
   │  ├─ .book-info-*：封面 .kol-book-cover / .book-name-* / .book-author-*（作者）
   │  │   / .book-tags-*（已完结·58.4万字·8.2分）/ .book-id-*（"BookID: <id>"）
   │  │   / .book-abstract-*（作品简介，折叠需点 a.arco-typography-operation-expand「展开」）
   │  │   / .book-category-list-* > .arco-tag.arco-tag-checked（分类标签）
   │  └─ .catalogue-whVvAH（目录）
   │     ├─ p.catalogue__header-title-*「目录」
   │     └─ .catalogue__list-* > div.catalogue__item-*（每章一项）
   │        ├─ .catalogue__item-text-*（"第N章 标题"）
   │        ├─ 当前章：.catalogue__item--active-*；未解锁章：.catalogue__item--disable-*（带锁 svg，点了没正文）
   │        └─ .copy-izbQNP（复制图标，仅 active 项有）
   └─ div.sider-right-paDsBC（右栏 = 正文阅读区，**点目录章节后加载**）
      └─ .sider-right-wrap-* > div.w-card.chapter-detail-*
         ├─ .chapter-title-*（"第N章 标题"）
         ├─ .chapter-content-* > div#content.chapter > p（**一段一个 p，正文逐段全在此**，无字体混淆）
         └─ .chapter-btn-group-* > button「下一章」             ← 逐章循环抓取的锚点
```

抓正文链路：click 目录项（文本定位 `.catalogue__item-text-*`）→ 等 `.chapter-content-*` 出现 → 取 `div#content.chapter` 的可见文本 → 点「下一章」→ 循环。

## 3. 实抓注意事项

- 左栏目录 60+ 章，整页 get_dom 会被目录吃掉节点配额（800 不够）→ **用 selector 定位容器**或 maxNodes≥2500。
- 别名管理（申词记录→别名管理）、回填抽屉结构见 `references/fanqie-dom.md`（本文件是其网页结构样本补充）。
- 受控输入（搜索框）：原生 value setter + `dispatchEvent(new Event('input',{bubbles:true}))`，回车用 keydown Enter（keyCode 13）。
