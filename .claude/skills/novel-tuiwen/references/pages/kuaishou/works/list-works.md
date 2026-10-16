# list-works — 列作品 / 取公开链接

## 步骤

1. 打开 `https://cp.kuaishou.com/article/manage/video?status=2`（已发布）
2. 读页头「共 N 个作品」与卡片列表
3. 需要链接时，用卡片上的作品 id 拼 `https://www.kuaishou.com/short-video/<id>`

## 页面锚点（2026-10 实抓）

```
https://cp.kuaishou.com/article/manage/video?status=2
├─ 页头：文本「共 N 个作品」
├─ 卡片：div.video-item.video-item--published        ← 已发布态
├─ 列表容器：.main-container-infinite-list
├─ 顶部按钮：button.publish-button 「发布作品」
└─ 隐藏弹层：div.el-dialog__wrapper（如「近7天的下载记录」）
```

**两条读取路径（推荐第二条）**

| 方式 | 做法 | 说明 |
|------|------|------|
| A. 刮 DOM | `browser_run_script` 取 `[class*="video-item"]` 的文本 | 脆弱，卡片改版即挂 |
| B. 读 Vue 实例（推荐） | 卡片元素 `el.__vue__.$props.videoInfo` | 实抓可用：含作品 id、时长（`progress`）、发布时间等结构化字段 |

**页面自身接口**（比刮 DOM 更稳，`fetch` 页内调用）

```
GET https://cp.kuaishou.com/rest/v2/creator/pc/autho...（作品列表）
返回 fetchListRest.nextCursor → 翻页游标（无限滚动即靠它）
```
> 实抓时该接口曾返回 `{"result":500002,...}`，即**未登录/被风控**时的响应 —— 遇到它先确认登录态，别重试。

## 输出

作品清单：集数 / 时长 / 发布时间 / 状态 / 公开链接（`short-video/<id>`）。
