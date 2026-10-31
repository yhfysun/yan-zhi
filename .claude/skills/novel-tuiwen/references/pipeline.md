# 出片产线（novel_tuiwen）

## 应用内调用

```
novel_tuiwen { chapter: "novel/书名/ch03.txt", title: "书名", alias: "狐王痴狂",
               chapter_num: "3", storyboard: "{...分镜 JSON...}",
               bgm: "auto", out: "03-output" }
```

`chapter` = 章节正文 txt 路径；`chapter_num` = 第几集（画面大字 + 文件名 + 发布文案）。

## 首帧契约（v4，2026-10-18 定稿，**冻结——不接受顺手改动**）

平台取成片第 0 帧当封面/首屏，所以**任何画面引擎都必须满足**（kinetic 与背景视频/图片轮播两条路径一致）：

| 元素 | 规格 | 位置 |
|---|---|---|
| 顶部标题条 | 别名＋平台（或 `banner`），首帧全显、无淡入 | 顶部居中 |
| 「第N集」角标 | 全程常驻、无 alpha | 右上角 |
| 「第N集」大字 | 第 0 帧全显 → 保持 3.0s → 0.5s 淡出 | 画面中部 |
| 主要内容（第一镜 hook） | 第 0 帧全显（不做入场动画） | 中部 |

- 集数来自 `chapter_num`；**系列视频必须显式传**，缺省按文件名数字推断（不可靠）。
- 守门测试：`test_screen_structure.py`（drawtext 路径）+ `test_kinetic.py`（kinetic 路径）。
- ⚠️ 改转场 / 字幕 / 背景合成等画面代码时**不得改动上表**。
  2026-10-28 kinetic 变成默认画面引擎时漏了「中部大字 + 首帧静态」→ 抖音成片开头
  「第几集没有、主要内容没有」（用户实报），回归的就是这条契约。

## 动态排版画面（kinetic，2026-10-28 默认）

**旧画面为什么丑**：整图 `-loop 1` 编码 → 一张张硬切，没有入场/转场/内部运动；图文卡片里
已经写了口播原文，底部又叠一条同句字幕 = 同一句话看两遍，还互相压。

**现方案**：逐帧 PIL 绘制（`kinetic.py`，rawvideo 管道直喂 ffmpeg，不落中间图、不做 concat）。

- **元素入场**：标题上滑+淡入（逐行错开 0.09s）、要点卡片逐条滑入（全部在前 2 秒出齐）、
  代码块/表格整块淡入上浮
- **场景转场**：最后 0.3s 交叉淡化到下一镜的入场态（fade through background）
- **字幕**：底部打字机逐字打出，一行一句，长句按标点切块、时间按宽度分摊；带黑描边
- **常驻元素**：顶部条（`--banner` / `alias`）+ 右上角「第N集」角标 + 底部进度条
- **素材底图层**（2026-10-28，**默认不加**）：`bg_images` 省略 = 纯版式背景（渐变 + 网格），
  图文 / 知识口播 / 数据讲解类内容用这个最清楚。只有素材和选题**明确同题**时才传图片路径
  （如悬疑配暗色雾林、治愈配海边）；`auto` 只扫 `00-source/images`、`02-work/images` **两个图片库目录**，
  **不扫 `00-source` 根目录**（那里混着背景视频/封面/杂物，盲扫 = 随便挂个不搭的素材）。
  每张图按镜头轮转，做 **Ken Burns**（慢推 1.0→1.075 + 四方向平移）+ 暗色蒙版；大标题加投影。
- **转场**：场景字段 `transition` ∈ `fade`（默认交叉淡化）/ `push`（左推）/ `wipe`（擦除）/ `zoom`（缩放淡入），
  时长 0.3s，`push/wipe/zoom` 会带上下一镜的入场态。
- **版式随画幅**：4:3 / 9:16 / 16:9 全部按 `H` 比例算；内容块垂直居中（`_place` 的 bias）

**分镜结构**（`--storyboard`，工具入参 `storyboard`）：

```json
{"scenes": [
  {"type": "hook", "seg": 0, "kicker": "AI 干活 · 第03期",
   "title": "明天开会\nPPT 一页没做", "highlight": "强调行", "sub": "补充说明"},
  {"type": "statement", "seg": 1, "w": 1.1, "title": "...", "highlight": "...", "note": "..."},
  {"type": "points", "seg": 2, "title": "...", "points": ["① ...", "② ...", "③ ..."]},
  {"type": "warning", "seg": 6, "title": "三个坑", "points": ["..."]},
  {"type": "code", "seg": 5, "title": "...", "code": "=SUMIFS(...)", "note": "..."},
  {"type": "table", "seg": 4, "title": "...", "columns": ["区域","金额"], "rows": [["华东","45600"]]},
  {"type": "cta", "seg": 7, "title": "...", "button": "评论区说说", "note": "..."}
]}
```

**11 种版式**：`hook` 开场 / `statement` 陈述 / `points` 要点卡 / `warning` 坑位卡 /
`quote` 金句（左强调竖条+大字）/ `steps` 编号流程（圆序号+连接线）/
`stat` 大数字（0→目标滚动）/ `compare` 左右对比（两栏从两侧滑入）/
`code` 代码块 / `table` 数据表 / `cta` 行动号召。

- **强调色**：任意文本里写 `[重点]`，方括号内用主题强调色渲染（不参与排版计量）。
- **主题**：顶层 `"theme": "dark" | "light"`；dark 偏资讯/知识，light 偏生活方式。
- **字幕断句**（2026-10-28 二次修正）：**切块只看标点，绝不看显示宽度**。
  在 `。！？!?…，,；;：:、` 处断开，标点跟在前块尾部；过短块（<6 字，如「好。」）并进下一句防闪。
  宽度只决定这一块**折几行、字号缩多少**（`fit_block`，最多 2 行自适应缩字号）。
  时间轴按**音节权重**（`speech_weight`：汉字 1、英文按字母折半、数字折 0.6）分配，不按像素宽度 ——
  否则英文块会占过多时间、听起来和画面脱节。
- **字幕样式** `subtitle_style`：`typewriter`（默认，逐句打字机 + 断句，平台主流、定点阅读）
  / `ticker`（整句单行：放得下就居中静态，放不下就左对齐起步随语速左移，读完贴右边界）。
  ticker 永远不需要断句，但长句要跟着字移动视线，回读不如定点方便。

- `seg` = 第几段旁白（0 起；hook 也算第 0 段）。**一段旁白可拆成多个场景**，时长按 `w` 比例分
  —— 口播一段 10s 只给一张画面太闷，拆成 2 镜才有节奏。
- 全部场景都不写 `seg` 时，`scenes` 数量必须与旁白段数一致（1:1）。
- **卡片只写关键词/短句，不要抄旁白原文** —— 字幕会另外逐字打出，抄原文就又变成重复。
- `sub` 是画面上的「阅读行」，和底部字幕不是一回事；**不要把旁白原文填进 `sub`**。
- 省略 storyboard 时按旁白自动生成分镜（取头两个短句当标题/强调），比原来的深色占位帧好看得多。

`visual`（默认 `auto`）：`auto` = 有 storyboard 或无背景素材 → kinetic，否则沿用 bg_video/images；
也可强制 `kinetic` / `images` / `bg_video`。

`images`（2026-10-24，2026-10-28 降级为备选）：图片轮播。图文成品做口播视频时，把轮播图路径逗号分隔按顺序传入；每张图覆盖若干整句，切图边界由**真实配音时长**算出，与字幕、配音同源，不会不同步。图片等比缩小 + 居中补底（不裁剪图内文字）。传了 `images` 就不要再传 `bg_video`。
⚠️ **图内已经写了口播文字时不要用 images**：底部字幕会把同一句话再打一遍，一屏两层字，观感很差。这种素材改用 `storyboard`。

`rate`（2026-10-24，默认值 2026-10-27 调到 `+15%`）：配音语速（短视频口播偏快更好完播）。传 `"0"` 回原速，也认 `1.15`（倍率）/ `15`（百分比）。语速变化会自动作废旧分段配音重合成。

段间停顿（2026-10-27）：每段配音由管线按**上一段句末标点**自动补静音（句号≈260ms / 问号≈360ms / 逗号≈130ms），字幕与画面时间轴同步后移。不要在文案里用省略号或空行手动造停顿。

`voice`（2026-10-27）：默认 `zh-CN-YunjianNeural`（云健，厚实、讲故事感强）；备选 `zh-CN-YunxiNeural`（年轻偏平）/ `zh-CN-YunxiaNeural` / `zh-CN-XiaoyiNeural`（女声）。换音色会自动作废旧分段配音重合成。

`sfx`（2026-10-28）：**不再在片头放 riser**——它是 1.2s 粉噪扫频，紧贴第一句人声，听感是「开头一串沙沙杂音」（用户实报）。现在只在剧情高能句（≥2s 起、间隔 ≥6s、最多 4 个）点缀 impact/heartbeat，音量 0.35；混音末尾加 60ms 淡入，杀掉首样本突变。

`bgm`（2026-10-24）：`auto`（默认）/ `none` / 音频路径。`auto` 先找 `<工作目录>/00-source/bgm/` 下的音频；没有就本地合成 4 和弦循环垫（免版权），缓存到 `<outdir>/.bgm/auto_<mood>.m4a`，全集复用。

`verbatim`（2026-10-24）：通用口播模式。`true` 时按原稿逐段口播，不改写、不加钩子、不加小说默认结尾；未传 `aspect` 默认 `9:16`。适合抖音运营等非小说内容。

`out_name`：成片文件名（不含路径）。

产物：mp4（`aspect` 决定 4:3=1080×1440 / 9:16=1080×1920 / 16:9=1920×1080），deliverable，
落 `<工作目录>/output/`（或 `out`），文件名 `别名_第N集.mp4`（无别名时按标题）。

## 标题条三要素（2026-10-11 必带）

**别名 + 番茄小说 + 第几章**，自动拼成「搜「别名」看全文｜番茄小说 第N章」——
传 `alias` + `chapter` 即可，不用手拼 banner；`--banner` 仍可显式覆盖。
⚠️ **不传 alias/chapter 会告警**（标题条只剩书名 = 违反书名红线）。
标题条自动 ≤2 行（自然分隔符优先断行）+ 半透明黑底条，超宽自动缩字号。

## 口播结构

钩子（正文第一句）+ 正文段（第二句起）+ 结尾引导。

## 字幕（2026-10-11 重做，SRT 改 ASS 直出）

- **无底框**（黑底 box 太丑已撤）—— 白字加粗 + 黑描边(3px) + 轻投影
- 字号随画幅 `H*4.2%`（ASS `PlayRes` = 真实分辨率，FontSize 即像素，4:3≈60px / 9:16≈80px）
- **长句单行快切 + 每条 140ms 淡入淡出** = 字幕逐句推进的滚动观感，不再两行长块换行
- `MarginV`：**9:16 = H*14%**（2026-10-24 上移，避开抖音底部账号名/进度条；此前 H*5% 约 96px 会被 UI 盖住，手机上看像「没有字幕」）；4:3 = H*7%；16:9 = H*5%
- 9:16 字号 = H*4.6%，其余 H*4.2%
- `MarginV = H*5%`；老版 ffmpeg(4.2) 兼容

## BGM（2026-10-28 重写）

- 默认 `bgm:"auto"`：**素材优先** —— `<工作目录>/00-source/bgm/` 下按文件名排序取第一条（mp3/m4a/wav/flac/aac/ogg）；
- 没有素材 → **本地编曲**：8s 循环（4 和弦 × 2s），四拍底鼓 + 贝斯根音 + 8 分琶音 + 铺底 pad，
  峰值归一化；按剧情选 `warm` / `suspense` / `epic` 三套节奏型，缓存到 `<outdir>/.bgm/auto_<mood>.m4a`；
  - 旧版是 4 个正弦三和弦叠加 + 低通，音色极薄，在旁白里基本听不见（用户实报「没有背景音乐」）→ 已换掉；
- 音量 `--bgm-level` 默认 **0.20**（旧 0.12），压过旁白时自动过 `sidechaincompress` 闪避；
- BGM 与环境音可以**同时存在**：有 BGM 时环境音自动降到 0.05，两路都过 `sidechaincompress` 被旁白闪避；
- 想统一系列风格：第一次出片前用 `music_compose` 生成一段（style `cn`/`gentle`、bpm 70–80、4 和弦、bars 16–32），放到 `00-source/bgm/<别名>.m4a`，后续自动复用。

## 顶部引导语（2026-10-11 实装）

自动 ≤2 行：长句在自然分隔处（`｜ | ， , 、 空格`）断成两行居中，每行带半透明黑底 box。
想让分行更刻意，可在 `banner` 里显式写 `\n` 或真实换行。
⚠️ 项目自带 ffmpeg 是 **2019 版**，**不支持 `drawtext` 的 `text_align` / `line_spacing`** →
多行是靠「**按行链式 drawtext**」实现；改这块别用这两个选项，会报 `Option not found`。

## ⚠️⚠️ 背景合成循环失效（2026-10-09 修复，最重要）

项目自带 ffmpeg 是 **2019 版**（`git-2019-10-22`），**不支持「多输入 `-stream_loop -1` + concat 滤镜」**——
此写法下 `-stream_loop` 对多输入**静默失效**，输出被**最短的那条输入轨**截断。

- **症状**：成片时长 = 前 1~2 段背景时长之和（如 29.4+78.7=108.1s），而口播有 400+s
  → 视频早早黑屏结束、台词只念了 1/4。**不报错**，极易误判成"配音没生成"。
- **现修法**（`compose_video.py` `bg_clips` 分支已重写）：
  1. 每段背景**先归一化**（scale/crop/fps/setsar + `-an`）成 `bgclip_XX.mp4`
  2. `probe_duration` + `-count_frames` 探测**实际可解码时长**，**坏素材/截断文件会被跳过并告警**
  3. 按顺序**循环重复片段列表**拼到累计 ≥ total
  4. `concat` demuxer（`-c copy`，cwd=tmp + 纯文件名）生成 `bg_full.mp4`
  5. 主命令改为**单输入** `bg_full.mp4` + `trim=total`
  实测：3 段拼 4 轮 = 216.24s（精确）。
- ⚠️ **素材完整性必查**：`bg-ocean-evening.webm` 曾是**坏素材**（元数据报 14.585s/30fps，
  实际只解出 **47 帧 = 1.6s**，报 `File ended prematurely`）→ 混进列表会把背景拼短。
  脚本现在会自动检出并跳过；但下载新素材后仍建议 `ffprobe -count_frames` 验一遍真实帧数。
- ⚡ **性能缓存（2026-10-24）**：背景归一化结果按「源路径 + 大小 + mtime + 目标规格」缓存，
  默认复用（`REUSE_BGCLIP=0` 可关）；源已是 h264/yuv420p 且规格匹配时直接 `-c:v copy` 不重编码；
  坏素材校验改用 `-count_packets`（秒级），不再 `-count_frames` 全解码（259s 素材曾要十几分钟）。
  `SKIP_FRAMECHECK=1` 可跳过校验。

## TTS 朗读规范化

时间 →「X点X分秒」；进度 a/b（含 `1\|4` 转义）→ 中文分数；HP/MP/buff/BOSS 等术语 → 中文；
①②③ →「第一，」；3-5 →「3到5」；`→` / `&` / `≥` → 读法；装饰符号删除。
**只改送 TTS 文本，字幕显示原文**。术语表在 `tts_gen.py` 的 `GAME_TERMS`。
2026-10-07 修复「第一段重复」（旧版 hook 复用 `segs[0][:40]` 且 `segments[0]` 原样保留 → 开头 40 字念两遍；旧产物有此问题属预期，重跑即愈）。

## 系列化建议（2026-10-07）

同一本书多章出片时，让相邻章节的成片「接得上」：

1. 钩子/封面都挂**同一别名**（观众搜同一词）
2. 标题统一前缀「搜「别名」看全文｜第N章 <章名>」（账号主页一眼看成一串）
3. **第一次发布就把合集建好并勾选第一集**（抖音见 `pages/douyin/publish/collection.md`）——
   不要先发完再补归集：第 1 集不在合集，「第N集」从开头就断；合集创建要审核 1–3h，
   首集在发布页创建后，后续集直接勾选 → 观众能在合集里连着刷下一章

多章可 `scheduled_task` 逐日自动出片。

## 依赖

- **ffmpeg 兜底（2026-10-09 更正）**：本机实际在 `C:\Program Files\EVCapture\ffmpeg.exe`
  （**不是** `C:\APP\EVCapture\` —— 那个路径不存在，旧写法害脚本一度找不到）。
  `find_ffmpeg` 已改为**多候选**：`$FFMPEG` → `C:\Program Files\EVCapture\ffmpeg.exe`
  → `C:\APP\EVCapture\ffmpeg.exe` → PATH。ffprobe 与 ffmpeg 同目录。
- **edge-tts**（缺失时 `pip install edge-tts -i https://mirrors.aliyun.com/pypi/simple/`）
  ⚠️ **Tuna 镜像没有 edge-tts**（`No matching distribution found`），要用**阿里镜像**才装得上。
- 内置 Python venv：`C:\Users\yhfys\.workbuddy\binaries\python\envs\default\Scripts\python.exe`

## CLI 直跑（开发）

```bash
# ★ 管线唯一源码 = packages/core/src/tool/builtin/python-scripts/novel_tuiwen/
#   运行时副本 <工作目录>/.yan-zhi/tools/novel_tuiwen/ 由工具按内容哈希自动同步 —— 别去手改副本，
#   也不要再在别处维护第二份源码（仓库里曾有一份 novel-tuiwen/pipeline/，已删除）。
PY=C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe
PIPE=packages/core/src/tool/builtin/python-scripts/novel_tuiwen
"$PY" "$PIPE/run_pipeline.py" --input novel-tuiwen/sample/chapter01.txt \
    --outdir novel-tuiwen/output --title 废井怀表 \
    --alias 狐王痴狂 --chapter 1 --bg-video "bg.mp4"
```

## 背景素材选取

**优先本地已有素材**（如 `00-source/` 下文件直接传 `bg_video`）。
题材首选「风景 / 海洋 / 动物世界 / 延时自然」等舒缓、无人声、可循环的素材 ——
与口播不抢注意力、符合平台调性；按氛围挑（悬疑/末日 → 夜景/暗调/荒野，治愈/日常 → 明亮自然/海洋/萌宠）。
外链实测（2026-10-06）：mixkit 资产直链服务端必 403（签名 URL，换 UA/Referer/代理都没用，**别再试**）；
pixabay 页面链接 404（需真实文件直链且易过期）；pexels 可下但慢（超时自动转代理）。
链接走 `api_media_fetch`（yt-dlp 缺失先 `media_install_ytdlp`）；没有素材就占位画面。
