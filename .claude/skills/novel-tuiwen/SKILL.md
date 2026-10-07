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
- 上传视频用 browser_upload（filechooser 模式：clickSelector 点上传按钮自动投递本地文件）
- 🚫 书名红线：出片 title 传别名（书名会烧进标题条）、ending 传「搜索别名XX看后续」、发布文案禁书名——别名才白挂
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
- 口播结构：钩子(正文第一句) + 正文段(第二句起) + 结尾引导
- 顶部引导语支持**自动两行 + 0.6s 淡入**（2026-10-07）：banner 传长句（如「搜「别名」看全文｜打开番茄小说」）会自动在自然分隔处（｜|，,、空格）断成两行居中显示 —— 不需要自己插换行。想让分行更刻意，可在 banner 里显式写 `\n` 或真实换行（按行拆，最多 2 行）。⚠️ 项目自带 ffmpeg 是 2019 版，**不支持 drawtext 的 text_align/line_spacing** → 多行是靠「按行链式 drawtext」实现（每行一个 filter、y 逐行下移）；改这块别用这两个选项，会报 `Option not found`。
- 口播/画面/发布全链路「书名红线」：见下方「书名红线」条
- TTS 朗读规范化：时间→「X点X分秒」、进度 a/b（含 1\|4 转义）→中文分数、HP/MP/buff/BOSS 等术语→中文；①②③→「第一，」、3-5→「3到5」、→/&/≥→读法、装饰符号删除；只改送 TTS 文本，字幕显示原文。术语表在 tts_gen.py GAME_TERMS。；2026-10-07 修复「第一段重复」（旧版 hook 复用 segs[0][:40] 且 segments[0] 原样保留 → 开头 40 字念两遍；旧产物有此问题属预期，重跑即愈）。
- 🔎 系列化建议（用户 2026-10-07 提出）：同一本书多章出片时，**让相邻章节的成片"接得上"**——① 勾子/封面都挂同一别名（观众搜同一词）；② 标题统一前缀「搜「别名」看全文｜第N章 <章名>」（账号主页一眼看成一串）；③ 发布时加「合集/合集名」（抖音发布页「添加合集」），把系列归到同一合集 → 观众能在合集里连着刷下一章。多章可 scheduled_task 逐日自动出片。
- 📺 抖音合集（2026-10-07）系列化正解：发布页「发布设置」区 →「**添加到合集**」：首次点它会弹「创建新合集」（合集名 **≤20 字**，建议用别名/书名主题，别叫「我的作品集」），之后同系列发布直接勾选它 → 主页显示「第N集」，**后续同合集视频按发布时间自动累加集数**。**兜底/回溯**：creator.douyin.com → 内容管理 →「**合集管理**」→ 自定义创建合集（名称≤20字 + 简介 + 1:1 封面 1080×1080）→ 进合集「添加作品」勾选历史视频（单次 ≤50）→ 加入合集（可把已发布的第1章、第2章一起归入）。权限：**网页端需实名认证（无粉丝门槛）**；App 端需 ≥1万粉。发布页找不到合集入口 = 账号未开权限 → 别死磕，走兜底路径或如实报告。

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
