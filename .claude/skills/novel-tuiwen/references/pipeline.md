# 出片产线（novel_tuiwen）

## 应用内调用

```
novel_tuiwen { chapter: "novel/书名/ch03.txt", title: "书名", alias: "狐王痴狂",
               chapter_num: "3", bg_video: "bg1.mp4,bg2.mp4",
               bgm: "auto", ambience: "auto", sfx: "auto", out: "03-output" }
```

`chapter` = 章节正文 txt 路径；`chapter_num` = 第几集（画面大字 + 文件名 + 发布文案）。

`images`（2026-10-24）：图片轮播。图文成品做口播视频时，把轮播图路径逗号分隔按顺序传入；每张图覆盖若干整句，切图边界由**真实配音时长**算出，与字幕、配音同源，不会不同步。图片等比缩小 + 居中补底（不裁剪图内文字）。传了 `images` 就不要再传 `bg_video`。

`rate`（2026-10-24）：配音语速，默认 `+10%`（短视频口播偏快更好完播）。传 `"0"` 回原速，也认 `1.1`（倍率）/ `10`（百分比）。语速变化会自动作废旧分段配音重合成。

`bgm`（2026-10-24）：`auto`（默认）/ `none` / 音频路径。`auto` 先找 `<工作目录>/00-source/bgm/` 下的音频；没有就本地合成 4 和弦循环垫（免版权），缓存到 `<outdir>/.bgm/auto_<mood>.m4a`，全集复用。

`verbatim`（2026-10-24）：通用口播模式。`true` 时按原稿逐段口播，不改写、不加钩子、不加小说默认结尾；未传 `aspect` 默认 `9:16`。适合抖音运营等非小说内容。

`out_name`：成片文件名（不含路径）。

产物：**4:3 (1080x1440) mp4**，deliverable，落 `<工作目录>/output/`，文件名 `别名_第N章.mp4`。

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

## BGM（2026-10-24）

- 默认 `bgm:"auto"`：**素材优先** —— `<工作目录>/00-source/bgm/` 下按文件名排序取第一条（mp3/m4a/wav/flac/aac/ogg）；
- 没有素材 → 本地合成：按剧情选 `warm` / `suspense` / `epic` 三套 4 和弦循环垫（正弦三和弦 + 慢速颤音 + 低通 + 淡入淡出），缓存到 `<outdir>/.bgm/auto_<mood>.m4a`；
- 合成失败自动回落环境音，**不阻塞出片**；
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
