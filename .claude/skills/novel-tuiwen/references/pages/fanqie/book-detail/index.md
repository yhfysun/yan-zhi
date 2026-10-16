# 番茄达人中心 · 书详情（取授权正文）

> URL：`/page/content/book-detail?tab_type=2&top_tab_genre=-1&book_id=<id>&genre=0`
> 实抓：2026-10-06（CDP `get_dom`，book_id=7452620888077241368）

## 何时用

- 看书籍信息与目录
- **逐章取授权正文**（番茄官网 fanqienovel.com 正文有字体混淆，正文一律从这里拿）

## ⚠️ URL 三参数缺一不可

`tab_type` / `top_tab_genre` / `genre` **一个都不能少**。
缺参数时正文区**永远卡「加载中...」**（4 轮复验实证）→ 补全参数重新导航即恢复。

## 操作文件

| 操作 | 说明 |
|------|------|
| fetch-text.md | 逐章抓正文拼接落盘 |

## 页面骨架（实抓）

```
div.kol-page.book-detail-page-uyEg2j.column
├─ div.arco-page-header.kol-page-header
│  ├─ .arco-page-header-title > .kol-page-header-title.clickable > span.page-title-*（书名 + 返回箭头）
│  └─ .arco-page-header-head-extra > button「别名推广」
└─ div.main-G5W5uE
   ├─ div.w-card.sider-left-IxzcaP（左栏）
   │  ├─ .book-info-*：.kol-book-cover / .book-name-* / .book-author-*
   │  │   / .book-tags-*（已完结·58.4万字·8.2分）/ .book-id-*（"BookID: <id>"）
   │  │   / .book-abstract-*（简介；折叠时点 a.arco-typography-operation-expand「展开」）
   │  │   / .book-category-list-* > .arco-tag.arco-tag-checked（分类标签）
   │  └─ .catalogue-whVvAH（目录）
   │     ├─ p.catalogue__header-title-*「目录」
   │     └─ .catalogue__list-* > div.catalogue__item-*
   │        ├─ .catalogue__item-text-*（"第N章 标题"）
   │        ├─ 当前章 .catalogue__item--active-*；未解锁章 .catalogue__item--disable-*（带锁，点了没正文）
   │        └─ .copy-izbQNP（复制图标，仅 active 项有）
   └─ div.sider-right-paDsBC（右栏 = 正文阅读区，**点目录章节后加载**）
      └─ .sider-right-wrap-* > div.w-card.chapter-detail-*
         ├─ .chapter-title-*（"第N章 标题"）
         ├─ .chapter-content-* > div#content.chapter > p（**一段一个 p，正文全在此，无字体混淆**）
         └─ .chapter-btn-group-* > button「下一章」        ← 逐章循环的锚点
```
