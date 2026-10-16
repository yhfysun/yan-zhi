# 出片产线（novel_tuiwen）

## 应用内调用

```
novel_tuiwen { chapter: "novel/书名/ch03.txt", title: "书名", alias: "狐王痴狂",
               chapter: "3", bg_video: "bg1.mp4,bg2.mp4" }
```

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
- `MarginV = H*5%`；老版 ffmpeg(4.2) 兼容

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

## TTS 朗读规范化

时间 →「X点X分秒」；进度 a/b（含 `1\|4` 转义）→ 中文分数；HP/MP/buff/BOSS 等术语 → 中文；
①②③ →「第一，」；3-5 →「3到5」；`→` / `&` / `≥` → 读法；装饰符号删除。
**只改送 TTS 文本，字幕显示原文**。术语表在 `tts_gen.py` 的 `GAME_TERMS`。
2026-10-07 修复「第一段重复」（旧版 hook 复用 `segs[0][:40]` 且 `segments[0]` 原样保留 → 开头 40 字念两遍；旧产物有此问题属预期，重跑即愈）。

## 系列化建议（2026-10-07）

同一本书多章出片时，让相邻章节的成片「接得上」：

1. 钩子/封面都挂**同一别名**（观众搜同一词）
2. 标题统一前缀「搜「别名」看全文｜第N章 <章名>」（账号主页一眼看成一串）
3. 发布时加**合集**（抖音见 `pages/douyin/publish/collection.md`），把系列归到同一合集
   → 观众能在合集里连着刷下一章

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
PY=C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe
cd novel-tuiwen/pipeline
"$PY" run_pipeline.py --input ../sample/chapter01.txt --title 废井怀表 \
    --alias 狐王痴狂 --chapter 1 --bg-video "bg.mp4"
```

## 背景素材选取

**优先本地已有素材**（如 `00-source/` 下文件直接传 `bg_video`）。
题材首选「风景 / 海洋 / 动物世界 / 延时自然」等舒缓、无人声、可循环的素材 ——
与口播不抢注意力、符合平台调性；按氛围挑（悬疑/末日 → 夜景/暗调/荒野，治愈/日常 → 明亮自然/海洋/萌宠）。
外链实测（2026-10-06）：mixkit 资产直链服务端必 403（签名 URL，换 UA/Referer/代理都没用，**别再试**）；
pixabay 页面链接 404（需真实文件直链且易过期）；pexels 可下但慢（超时自动转代理）。
链接走 `api_media_fetch`（yt-dlp 缺失先 `media_install_ytdlp`）；没有素材就占位画面。
