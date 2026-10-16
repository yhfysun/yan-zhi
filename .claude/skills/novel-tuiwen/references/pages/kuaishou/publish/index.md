# 快手 · 发布作品

> 站点：**`cp.kuaishou.com`**（快手创作者服务平台）
> 入口：`https://cp.kuaishou.com/article/publish/video`
> 实抓：2026-10-15 / 2026-10-16，账号昵称 `yqdbgz`
> ⚠️ 旧文档写的 `creator.kuaishou.com` 是**错的** —— 真实域名是 `cp.kuaishou.com`。

## 何时用

把小说推文成片发布到快手（与抖音并列的发布目标）。

## 展示

单页工作台。左侧固定导航三件套：**发布作品 / 作品管理 / 合集管理**。
发布页从左到右：上传区（视频/图文/全景视频三个 tab）→ 作品描述富文本 → 底部「发布」。

## 公共说明（踩过的坑）

- **技术栈 = Element UI + CSS Modules 混用**（`el-dialog__wrapper`、`_description_17g9x_24`）。
  CSS Modules 后缀（`17g9x_24`）会随构建漂 → **一律用「文本 + placeholder + `[class*=前缀]`」定位**，别写死完整类名。
- ⚠️ **页面处于 hidden（预览面板收起）时，微前端懒加载被节流** → 页面可见正文只剩「请开启浏览器的 JavaScript 功能」，
  看起来像空壳/假死。**发布前先让用户把预览面板展开**，否则会反复误判成"站点挂了"。
- 发布是**不可逆**动作：**必须 `confirm_user` 确认后才点「发布」**。
- 成功后页面会跳 `…/article/manage/video?status=2&from=publish` —— 以此 + 作品管理列表新出现该作品作为成功判据。

## 操作文件

| 操作 | 说明 |
|------|------|
| publish-video.md | 上传 → 填描述 → 发布 → 核验 |
| ../works/index.md | 发布后到作品管理核验（`../works/list-works.md`） |
