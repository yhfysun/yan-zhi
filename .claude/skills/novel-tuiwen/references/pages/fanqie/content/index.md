# 番茄达人中心 · 内容库（选书）

> 入口：`https://kol.fanqieopen.com/page/content?tab_type=2&top_tab_genre=-1`
> 实抓：2026-10-06（CDP `get_dom`，非推测）

## 何时用

按榜单挑书：爆款榜 / 阅读榜 / 潜力榜，再做频段筛选（男频/女频）。

## 展示

书目卡片：排名、书名、作者/题材/字数/上架日期/评分，右上角「别名推广」按钮。

## 操作文件

| 操作 | 说明 |
|------|------|
| browse.md | 浏览榜单 / 搜书 / 进书详情 |

## 页面骨架（实抓）

```
div#kol-content-box
└─ div.kol-page.page-*.column
   ├─ div.header-*（页头：标题「番茄小说」+ 通知轮播 kol-notice-bar-* + 查看任务规则）
   └─ div.list-*
      ├─ div.task-menu.menu-*                       ← 榜单切换
      │  ├─ .task-menu-first > .task-menu-first-item（网文[active] / 漫画 / 有声书 / 漫剧 / 短剧）
      │  └─ .task-menu-second > .task-menu-second-item（爆款榜[active] / 阅读榜 / 潜力榜 / 全部内容）
      ├─ div.filter-* > .arco-radio-group（频段：全部/男频/女频，button.arco-btn-text）
      ├─ .sort-row-* > .arco-tabs（排序 tab）+ 搜索框
      │    input.arco-input[placeholder="请输入作者名/书名/BookID"]   ← 受控组件
      └─ 书目卡片：
         div.book-hQ7GYr
         ├─ div.book-main-TYd2nR
         │  ├─ .book-main-thumb-* > .book-main-rank-* > span.book-main-rank-val-*（排名）
         │  └─ .book-main-cnt-*
         │     ├─ .book-title-* > div.book-title-txt-*          ← 书名
         │     └─ .book-category-* > span（作者/题材/字数/上架日期/评分，用 .book-category-item-split-* 分隔）
         └─ div.book-opt-*
            ├─ button.arco-btn-secondary（图标按钮）
            └─ .arco-space.c-promotions > button「别名推广」     ← 点它进书详情/申词
```
