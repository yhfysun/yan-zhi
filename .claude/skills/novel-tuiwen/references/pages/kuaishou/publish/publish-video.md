# publish-video — 发布一条作品

> 能力与坑见 index.md

## 输入

- 本地成片路径（`novel_tuiwen` 产物 `别名_第N章.mp4`）
- 作品描述文案（**带别名关键词，禁书名** —— 书名红线见 SKILL）
- 是否确认发布（`confirm_user`）

## 步骤

1. 打开 `https://cp.kuaishou.com/article/publish/video`（关掉旧 tab，别复用）
2. 在「上传视频」tab 下点上传区（或拖拽区）→ `browser_upload` 投递本地文件
3. 等转码：轮询页面出现时长/进度、上传区不再是「拖拽视频到此或点击上传」
4. 填**作品描述**（见下方锚点）
5. `confirm_user` 确认 → 点「发布」
6. 轮询成功判据（见下），**严禁再 navigate 回上传页**（会清空已填内容）

## 页面锚点（2026-10 实抓）

```
https://cp.kuaishou.com/article/publish/video   title=「快手创作者服务平台」
├─ 左侧导航：发布作品 / 作品管理 / 合集管理
├─ 发布入口按钮：button.publish-button   文本「发布作品」
├─ 上传区：文本「上传视频」「上传图文」「上传全景视频」「拖拽视频到此或点击上传」
│           另有「视频大小…」限制说明
│   → browser_upload（filechooser 模式：clickSelector 点上传按钮投递本地文件）
├─ 作品描述（富文本）：[contenteditable=true][class*=_description_]
│   placeholder：「作品描述不会写？试试智能文案」；相邻有「智能话题」「好友」「活动推荐」
│   ⚠️ 受控富文本：JS 设 innerText 不生效，走 execCommand('insertText') 或真键盘键入
├─ 弹层：div.el-dialog__wrapper（如「近7天的下载记录」）
└─ 「发布」按钮：底部主提交
    ⚠️ 文本「发布」在页面里**不唯一**（实抓 matched=2）→ 别只按文本点，
       先 get_page_info 拿编号再点，或用容器结构收窄
```

## 成功判据

1. URL 变为 `article/manage/video?status=2&from=publish`
2. 作品管理列表出现该作品（`div.video-item.video-item--published`，见 `../works/list-works.md`）
3. 页面出现「发布成功 / 审核中」类文案（**文案集合待补全**：实抓只确认了跳转+列表两条）

> ⚠️ `?status=` 语义：`2` = 已发布，`1` = 疑似审核中（**推断**，未逐字核实；核验时按原文读，别只认数字）。

## Browser 操作

```text
1) 打开并上传（一次到位，别先 open 再传）
   browser_navigate  url=https://cp.kuaishou.com/article/publish/video
   browser_upload    clickSelector=[上传按钮/拖拽区]  file=<本地 mp4>
2) 轮询转码：browser_get_page_content（调小 maxTextLength）
3) 填描述：对 [contenteditable=true][class*=_description_] 走 execCommand insertText
4) confirm_user 确认 → browser_click 点「发布」（先编号定位）
5) 轮询 URL 跳转 + 作品管理列表核验
```

## 风控

新号先人工养 1-2 周；单号单浏览器指纹；**日发 ≤3 条**；拟人化（随机延时、真人轨迹）。见 SKILL「赛道规则」。
