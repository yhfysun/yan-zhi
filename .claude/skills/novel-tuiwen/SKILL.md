---
name: novel-tuiwen
description: 小说推文全自动产线：授权平台选书→过滤打分→取授权正文→Edge-TTS 配音→背景视频合成 4:3 成片。对应内置工具 novel_tuiwen + api_media_fetch。
---

# 小说推文视频（全自动产线）

## 授权平台（多渠道，按序尝试，单家卡住换下一家）
1. 番茄达人中心（字节官方）https://kol.fanqieopen.com — **首选**，书/正文/别名/回填全 Web 端闭环（2026-10 实测走通）
2. 七猫 https://zuozhe.qimao.com — 偏情感/家庭/年代文，竞争小
3. 书旗小说（阿里）https://www.shuqi.com
4. 纵横小说 https://www.zongheng.com — 男频/玄幻向
5. 巨日禄 https://www.jurilu.com — 2026-10 实测不可达，跳过，仅作候选

聚合渠道（右豹/小果繁星/即客/U客直谈）只有微信小程序，浏览器工具进不去。番茄官网 fanqienovel.com 正文有字体混淆，正文一律从达人中心书详情拿。

## 番茄达人中心完整流程（2026-10 实测）
1. 选书：内容库→番茄小说 /page/content?tab_type=2（爆款榜/阅读榜/潜力榜 + 男频/女频；卡片带「别名推广」；搜索框 placeholder「请输入作者名/书名/BookID」，受控组件用原生 setter 输入）
2. 取正文（✅ 全文可拿）：书详情 /page/content/book-detail?tab_type=2&top_tab_genre=-1&book_id=<id>&genre=0 ⚠️ URL 必须带全参数（tab_type/top_tab_genre/genre 一个都不能少）：缺参数时正文区永远卡「加载中...」（4 轮复验实证），补全参数重新导航即恢复。 → 左侧目录全量章节 → 点章节右侧加载完整正文（无字体混淆，逐章抓取拼接成 txt）。点章节无反应时改用 x/y 坐标点击；正文从「第N章」切到「下一章」，点「下一章」逐章循环
3. 申词建别名：书详情「别名推广」或 申词记录→别名管理→「批量创建别名」，3-5 字关键词（如 狐王痴狂）→ 等「别名状态=生效中」「书籍状态=可用」；发文必须挂生效中别名
4. 出片：novel_tuiwen 出 4:3 成片，口播/字幕引导搜索该别名关键词
5. 回填发文：别名管理行内「回填发文」抽屉（arco Drawer，自动带出书名/别名）→「抖音发文→添加发文」填抖音号+视频链接提交——**不回填不结算**；⚠️ **新别名 7 天内不回填会失效**，发布完当天回填

## 流程（聊天内一句话触发，skill_novel_tuiwen）
1. 选书：上表授权平台按序尝试，浏览器工具抓书目；抓不到就换下一家，不死磕
2. 过滤：题材热度/开头钩子/竞争度打分，取 Top1-3
3. 正文：从达人中心书详情逐章抓全文落盘 file_write → novel/<书名>/chNN.txt（其他平台不给全文时 ask_user）
4. 背景：**优先本地已有素材**（如 00-source/ 下文件直接传 bg_video）。外链实测（2026-10-06）：mixkit 资产直链服务端必 403（签名 URL，换 UA/Referer/代理都没用，别再试）；pixabay 页面链接 404（需真实文件直链且易过期）；pexels 可下但慢（超时自动转代理）。链接走 api_media_fetch（yt-dlp 缺失先 media_install_ytdlp）；没有素材就占位画面
5. 出片 novel_tuiwen { chapter, title, bg_video, voice? }
6. 发布（抖音，需确认）：creator.douyin.com/creator-micro/content/upload 网页上传，标题带别名关键词+话题；**confirm_user 确认后才点发布**
7. 回填发文：抽屉内「抖音发文→添加发文」填抖音号+视频链接提交——不回填不结算，7 天内不回填别名失效
8. 回报选书理由 + 成片路径 + 发布/回填状态

## 页面 DOM 速查（全站 arco-design；类名带 hash 后缀会漂，优先「文本+结构」匹配）
- 左侧菜单：分组头 div.arco-menu-inline-header（内容库/申词记录），子项 div.arco-menu-item.arco-menu-item-indented；顶部同构 a.menu-item-*
- 内容库：书目卡片带「别名推广」；搜索框 input.arco-input（placeholder「请输入作者名/书名/BookID」，受控组件用原生 setter 输入）
- 书详情：目录「第N章 …」文本节点，点章节右侧加载正文；点不动改 x/y 坐标点击；正文末尾「下一章」逐章循环
- 别名管理：搜索框 input.arco-input；button.arco-btn（批量创建别名/批量回填发文/批量导出）；行内「回填发文/查看/删除」在 div.arco-space 里
- 回填抽屉 .arco-drawer（遮罩 .arco-drawer-mask）：「抖音发文→添加发文」填抖音号+视频链接；合成事件对 mask/Esc 无效，关抽屉点「取消提交」按钮
- 状态判定：别名状态=生效中 且 书籍状态=可用 才可发文

## 平台现状（2026-10 实测）
- 番茄达人中心：全链路 Web 端闭环 ✅（书/正文/别名/回填）
- 七猫/书旗/纵横：无 Web 推广门户（推广子域不可达，授权在小程序/聚合渠道）→ 仅作书源参考，产线以番茄为主
- 抖音创作者平台 creator.douyin.com：Web 上传可达 ✅，登录态需用户在浏览器面板登录一次

## 应用内用法
novel_tuiwen { chapter: "novel/书名/ch01.txt", title: "书名", bg_video: "bg1.mp4,bg2.mp4" }
产物：4:3 (1080x1440) mp4，deliverable，落 <工作目录>/output/
- 口播结构：钩子(正文第一句) + 正文段(第二句起) + 结尾引导；2026-10-07 修复「第一段重复」（旧版 hook 复用 segs[0][:40] 且 segments[0] 原样保留 → 开头 40 字念两遍；旧产物有此问题属预期，重跑即愈）。

## 依赖
- ffmpeg 兜底 C://APP//EVCapture//ffmpeg.exe（FFMPEG/FFPROBE 环境变量可覆盖）
- edge-tts（缺失时 pip install edge-tts -i https://pypi.org/simple）

## CLI 直跑（开发）
```bash
PY=C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe
cd novel-tuiwen/pipeline
"$PY" run_pipeline.py --input ../sample/chapter01.txt --title 废井怀表 --bg-video "bg.mp4"
```

## 赛道规则（巨日禄工具宝箱）
- 4:3 画面；别关联中视频；别发小红书（封号）；日更+持续回传
- 只发布已授权书目，未授权搬运侵权
