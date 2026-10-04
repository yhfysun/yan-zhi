---
name: novel-tuiwen
description: 小说推文全自动产线：授权平台选书→过滤打分→取授权正文→Edge-TTS 配音→背景视频合成 4:3 成片。对应内置工具 novel_tuiwen + api_media_fetch。
---

# 小说推文视频（全自动产线）

## 流程（聊天内一句话触发，skill_novel_tuiwen）
1. 选书：授权平台（巨日禄/番茄推文等）榜单/书架 → 浏览器工具抓书目
2. 过滤：题材热度/开头钩子/竞争度打分，取 Top1-3
3. 取文：仅授权平台正文；平台不给全文就 ask_user，禁止爬盗版站
4. 落盘 file_write → novel/<书名>/ch01.txt
5. 背景：链接走 api_media_fetch（yt-dlp 缺失先 media_install_ytdlp）；本地文件直接传
6. 出片 novel_tuiwen { chapter, title, bg_video, voice? }
7. 回报选书理由 + 成片路径

## 应用内用法
novel_tuiwen { chapter: "novel/书名/ch01.txt", title: "书名", bg_video: "bg1.mp4,bg2.mp4" }
产物：4:3 (1080x1440) mp4，deliverable，落 <工作目录>/output/

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
