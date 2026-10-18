# novel-tuiwen 小说推文自动出片管线

第一阶段产物：`改编 → TTS 配音 → ffmpeg 合成 → 发布文案` 全自动出片。
支持两种画面模式：**背景视频模式**（修驴蹄/骑单车等解压视频铺底，推荐）与分镜图模式（占位帧，后续接 ComfyUI AI 绘图）。

## 一键出片

```bash
PY=C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe
cd pipeline
# 背景视频模式(推荐)
"$PY" run_pipeline.py --input ../sample/chapter01.txt --title 废井怀表 \
    --alias 狐王痴狂 --chapter 1 --bg-video "背景1.mp4,背景2.mp4"
# 产物: ../output/狐王痴狂_第1集.mp4 (1080x1440 4:3)
#      + ../output/chapter01_work/publish.txt (发布表单标题+内容)
```

## 画面结构 v4（2026-10-18）：首帧即含全部基本信息

```
┌──────────────────────────┐
│ 搜『别名』看全文｜番茄小说  │ ← 顶部常驻标题条（黑底半透明，≤2行自动断行，首帧全显无淡入）
│                   [第N集] │ ← 右上角常驻角标（全程可见，任何一帧当封面都带集数）
│                          │
│         第N集            │ ← 大字（H*11.5%），首帧即全显（无淡入）→保持到3s→0.5s淡出
│                          │
│        字幕...           │ ← ASS 单行快切：白字加粗+黑描边，宽 ≤0.80*W 必不超屏
└──────────────────────────┘
```

- ★ v4 动机（2026-10-18 用户反馈）：平台封面取 t=0 首帧，v3 标题条 0.6s/大字 0.4s 淡入
  导致首帧字几乎全透明——用户刷到看不到别名/平台/集数。v4 去掉两处淡入 + 常驻角标，
  并在合成后自动抽首帧落盘 `<成片名>_封面.png`（发布时直接当首页图片上传）
- 角标 y 固定在标题条 2 行最大高度之下：长标题居中几乎占满行宽，贴顶会与角标重叠
- 「第N章/第N集」**不再常驻标题条**——大字只在前 3 秒 + 角标全程常驻（一集一个号，够了）
- 标题条书名号用『』：老版 ffmpeg drawtext 把「」渲染成窄引号
- 字幕防超屏：全角标点（…… —— "" 等 U+2000~206F）按全角计宽 + 宽度系数 0.88→0.80

## 分步

```bash
# 1) 改编: 章节txt -> 分镜脚本JSON (默认规则切分; --use-llm 走 OpenAI 兼容端点钩子化改编)
python script_gen.py --input chapter.txt --output script.json [--use-llm]
# 2) 配音: Edge-TTS 逐段合成, 真实时长写回 script.json
python tts_gen.py --script script.json --outdir audio/ [--voice zh-CN-YunxiNeural]
# 3) 合成: 背景视频(或分镜图) + 标题条 + 「第N集」大字/常驻角标 + libass字幕 + 配音 -> mp4 + 封面图
python compose_video.py --script script.json --outdir ../output \
    --bg-video bg1.mp4,bg2.mp4 [--alias 狐王痴狂 --chapter 1] [--bgm bgm.mp3] [--keep-temp]
# 4) 发布文案: 表单标题+内容模板 -> <workdir>/publish.txt（run_pipeline 已自动跑）
python publish_copy.py --script script.json --alias 狐王痴狂 --chapter 1 [--stdout]
```

## 发布文案模板（publish_copy.py，单一真相源）

【标题】≤30 字：`{别名} 第{N}集｜{钩子前18字}`（禁原书名）

【内容】五段固定结构：

```
{别名} 第{N}集
{hook}
{正文预告：第一段截60字}…
后续更精彩，点击左下角继续看👉
#小说 #推文 {别名}
```

## 画面合成细节

- 4:3 = 1080x1440，25fps；背景视频循环铺满（concat demuxer 方案，老版 ffmpeg 兼容）
- **顶部标题条**：`--alias` 自动拼「搜『别名』看全文｜番茄小说」；`--banner` 可覆盖；
  ≤2 行 + 半透明黑底条(0.55)，超宽在分隔符处自动断行；文件名 `别名_第N集.mp4`
- **「第N集」大字**：`--chapter` 传入时叠加，H*11.5% 字号 + 黑描边投影，
  **不加 box**（老版 ffmpeg box+alpha 淡出期出彩色伪影）
- **字幕**：直接生成 ASS（PlayRes=真实分辨率）烧录；**无底框**——白字加粗+黑描边(3px)+轻投影；
  字号随画幅 H*4.2%；长句**单行快切**+每条 140ms 淡入淡出（逐句推进的滚动观感）
- 音频：逐段 TTS mp3 → concat 成单条 aac；`--bgm` 混入 BGM（音量 0.12）

## 依赖与环境

- Python venv: `edge-tts` 已装（pypi 直连）；**本机受限网络下 edge-tts 403**
  （Microsoft 语音端点不可达），TTS 需代理或换源
- ffmpeg: `C:\APP\EVCapture\ffmpeg.exe`（2016 版 N-80694，libx264/aac/drawtext 齐全），
  可用 `FFMPEG` / `FFPROBE` 环境变量覆盖。
  ★ 老版两坑已踩平：drawtext 无 `line_spacing`/`text_align`；drawbox 不认 `t=fill`（用 `t=max`）
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

## 守门测试

```bash
cd pipeline && python -m pytest test_screen_structure.py -v   # 13 项，无需 ffmpeg
```

覆盖：全角标点计宽 / ASS 单行不超屏 / 标题条『』与特殊字符转义 / 第N集 alpha 收尾与 % 转义 /
无 box / 发布文案标题≤30字与五段结构 / 章节号从文件名推断

## 后续接入点（对应总方案）

- **绘图**：把 `scene` 字段喂 ComfyUI 工作出图 → `--images img1.png,img2.png` 传入
- **LLM 改编**：设 `OPENAI_BASE_URL` / `OPENAI_API_KEY` 后加 `--use-llm`
- **发布/回传/数据**：yan-zhi 内置浏览器 + pageAgent（第二阶段）；publish.txt 内容直接贴表单
