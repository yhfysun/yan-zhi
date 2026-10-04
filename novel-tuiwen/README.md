# novel-tuiwen 小说推文自动出片管线

第一阶段产物：`改编 → TTS 配音 → ffmpeg 合成` 全自动出片。
支持两种画面模式：**背景视频模式**（修驴蹄/骑单车等解压视频铺底，推荐）与分镜图模式（占位帧，后续接 ComfyUI AI 绘图）。

## 一键出片

```bash
PY=C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe
cd pipeline
# 背景视频模式(推荐)
"$PY" run_pipeline.py --input ../sample/chapter01.txt --title 废井怀表 \
    --bg-video "背景1.mp4,背景2.mp4"
# 产物: ../output/废井怀表_chapter01.mp4 (1080x1440 4:3, 标题+字幕+配音)
```

## 分步

```bash
# 1) 改编: 章节txt -> 分镜脚本JSON (默认规则切分; --use-llm 走 OpenAI 兼容端点钩子化改编)
python script_gen.py --input chapter.txt --output script.json [--use-llm]
# 2) 配音: Edge-TTS 逐段合成, 真实时长写回 script.json
python tts_gen.py --script script.json --outdir audio/ [--voice zh-CN-YunxiNeural]
# 3) 合成: 背景视频(或分镜图) + 标题 + libass字幕 + 配音 -> mp4
python compose_video.py --script script.json --outdir ../output \
    --bg-video bg1.mp4,bg2.mp4 [--bgm bgm.mp3] [--keep-temp]
```

## 画面合成细节

- 4:3 = 1080x1440，25fps；背景视频 cover 裁剪 + `-stream_loop` 循环铺满全片
- 标题：顶部居中白字黑边（drawtext, msyh.ttc），字号 `--title-size 64`
- 字幕：SRT(UTF-8-BOM) → libass `subtitles` 滤镜烧录；长句按 40 字切块、时间按字数比例分摊
- 音频：逐段 TTS mp3 → concat 成单条 aac；`--bgm` 混入 BGM（音量 0.12）

## 依赖与环境

- Python venv: `edge-tts` 已装（pypi 直连）
- ffmpeg: 暂用 `C:\APP\EVCapture\ffmpeg.exe`（libx264/aac/zoompan/drawtext 齐全），
  可用 `FFMPEG` / `FFPROBE` 环境变量覆盖；建议后续换成新版静态包
  （gyan.dev 直连可用但慢，60s 下载不完 80MB，需后台长下载）
- drawtext 中文必须 `fontfile=C\:/Windows/Fonts/msyh.ttc`（本机无 fontconfig 配置）

## 分镜脚本 JSON 结构

```json
{
  "title": "废井怀表",
  "hook": "前3秒钩子",
  "segments": [{"text": "口播文案", "scene": "画面描述", "audio": "audio/seg_001.mp3", "duration": 12.5}],
  "ending": "悬念结尾",
  "hook_audio": "audio/seg_000.mp3", "ending_audio": "audio/seg_00N.mp3"
}
```

## 后续接入点（对应总方案）

- **绘图**：把 `scene` 字段喂 ComfyUI 工作流出图 → `--images img1.png,img2.png` 传入
- **LLM 改编**：设 `OPENAI_BASE_URL` / `OPENAI_API_KEY` 后加 `--use-llm`
- **发布/回传/数据**：yan-zhi 内置浏览器 + pageAgent（第二阶段）
