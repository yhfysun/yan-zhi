---
name: video-editing
description: 剪辑模式（/clip）的详细操作参考：clip_project 工程能力全表、时间基准与陷阱、8 个成品配方（卡点/口播/产品/旅行/图文/对比/悬念/混剪）、失败排查与能力边界。配合 skill_video_editing 的流程骨架使用。
---

# 视频剪辑 · 详细参考

> 本文件是 `skill_video_editing` 正文里「详见」指向的那份参考。**流程看正文，参数与配方看这里。**

## When to use

- 要出成片：多段拼接、字幕、BGM、画中画、导出
- 要做某种"观感"（卡点 / 电影感 / 综艺花字 / 悬念解说）但不知道传哪些参数
- 渲染失败、字幕不出现、时长对不上、效果没生效
- 判断"这个效果我们的工具到底能不能做"

---

## 一、能力地图（工具能做到什么）

| 模块 | 能力 | 参数位置 |
|---|---|---|
| 素材 | 多段视频/图片首尾相接；每段独立裁剪、变速、裁剪画面、音量 | `add_clip` / `update_clip` |
| 画面 | 32 种**调色预设**（可调强度）+ 手动调节（明暗/冷暖/锐化/暗角）；17 种**结构特效**；淡入淡出；画面裁剪；蒙版（14 形状 + 5 色键）；旋转/镜像 | 同上 |
| 运镜 | 图片推拉（`kenburns`）；关键帧（缩放 / 位移 / 透明度） | `kenburns` / `keyframes` |
| 转场 | 25 种，挂在**后一段**上，可调时长 | `transition` |
| 字幕 | 任意条；8 种动画；字号/颜色/描边/底板/位置/安全区 | `add_text` / `update_text` |
| 声音 | 分段配音（替换或与原声混音）；整片 BGM（可自动闪避人声）；整片音效链（最多 4 个） | `audioFile` / `set_bgm` / `set_audio_fx` |
| 画中画 | 多层叠加，可选 9 宫格锚点与缩放 | `add_overlay` |
| 导出 | 分辨率/帧率任意；快速预览档 / 正式档 | `render` |
| 外围 | 自动字幕（whisper）、AI 配乐、AI 生图/生视频、音效库、节拍分析、单素材加工 | 其它工具 |

---

## 二、参数速查

### add_clip / update_clip（片段）

| 字段 | 类型 | 范围/取值 | 说明 |
|---|---|---|---|
| `file` | string | 本机绝对路径 | 必填 |
| `label` | string | — | 时间轴显示名 |
| `trimStart` / `trimEnd` | number | 秒，相对**该素材** | `trimEnd > trimStart` |
| `speed` | number | 0.25 ~ 4 | >1 加快；会改变时间轴长度。与 `speedCurve` 互斥 |
| `speedCurve` | array | `[{t 0~1, speed 0.25~4}]` | 曲线变速（源时间比例给倍速，渲染切成 8 片各自变速再拼）。会改变时长 |
| `colorPreset` | enum | 32 项 | 见 `colorPreset` 清单 |
| `colorStrength` | number | 0~1（缺省 1） | 预设强度。0.3~0.5 = 轻微色调，不明显 |
| `adjust` | object | `{brightness -0.5~0.5, contrast 0.5~1.8, saturation 0~2.5, temperature -1~1, sharpness 0~1, vignette 0~1}` | 手动调节，**叠在预设之上** |
| `fx` | enum | 17 项 | 结构类特效，与调色可叠加 |
| `fxParams` | object | 键见下方「特效参数」 | 特效强度，只传要改的键 |
| `fadeIn` / `fadeOut` | number | 秒 | 画面黑场过渡 |
| `kenburns` | object | `{direction:'in'\|'out', duration}` | **图片专属**运镜 |
| `mask` | object | `{shape?, scale?0.05~1, offsetX?/offsetY?-0.5~0.5, feather?0~200, key?}` | 形状与色键二选一，同时给时**色键优先** |
| `transition` | object | `{type, duration?0.1~5（默认0.8）}` | 挂在**后一段**；第一段无效 |
| `crop` | object | `{x?,y? 0~0.9, w?,h? 0.1~1}` | 裁子区域后**回填画幅**（不变形） |
| `audioFile` | string | 音频绝对路径 | 该段配音 |
| `keepOriginalAudio` | boolean | — | true = 与原声混音；缺省 = 替换原声 |
| `volume` | number | 0 起，1 = 不变 | 该段音量倍数 |
| `rotate` | number | 90 / 180 / 270 | 顺时针旋转。**先转正再按工程画幅补边裁切**，90/270 会大裁 |
| `flip` | string | `h` / `v` / `both` | 镜像翻转（左右 / 上下 / 两者） |
| `reverse` | boolean | — | 倒放（画面+音轨一起）。**单段 ≤ 10 秒**，超了直接拒绝渲染 |
| `keyframes` | array | `[{t 0~1, scale 1~3, offsetX/Y -0.5~0.5, opacity 0~1, ease?, bezier?}]` | 段内**比例**时间；`ease` 作用到**下一个点**；位移需配 `scale>1` |

### 特效参数（fxParams，只传要改的键）

| 特效 | 参数 |
|---|---|
| `shake` 镜头震动 | `amplitude` 0.002~0.03（默认 0.006）　`freq` 8~40（默认 23） |
| `pixelate` 马赛克 | `blocks` 4~48（默认 12，**越少越糊**） |
| `ghost` 残影 | `frames` 2~12（默认 6） |
| `bloom` 柔光 / `dream` 梦境 | `sigma` 柔化半径　`opacity` 强度 0.1~0.8 |
| `vhs` / `glitch` 故障 | `shift` 色偏　`noise` 噪点（vhs 另有 `saturation`） |
| `scanline` 扫描线 | `dim` 暗线深度 0.6~0.95 |
| `fisheye` 鱼眼 | `k1` 畸变强度　`k2` 边缘校正 |
| `tilt` 倾斜 | `angle` 0.01~0.2 |
| `drift` 呼吸漂浮 | `amplitude` 幅度　`speed` 速度 |
| `oldfilm` 老电影 | `noise` 颗粒　`vignette` 暗角强度 |
| `mirror` 镜像 | 无参数 |

### add_text（字幕）

| 字段 | 范围 | 说明 |
|---|---|---|
| `start` / `end` | 秒，相对**成片** | `end > start` |
| `animation` | `fade`/`pop`/`zoom`/`slide`/`typewriter`/`karaoke`/`flicker`/`flychar` | 缺省无动画 |
| `slideDirection` | `left`/`right`/`up`/`down` | 仅 `slide` |
| `fontSizePx` | 像素（1920 高基准），默认 88 | 竖屏建议 70~110 |
| `color` / `outlineColor` | `#RRGGBB` | — |
| `outlinePx` | 0~60，默认 12 | — |
| `backColor` | `#RRGGBBAA` | 有值 = 加底板 |
| `position` | `bottom`/`center`/`top` | 默认 bottom |
| `safeArea` | boolean | 抖音/快手/视频号**建议开**（避开底部进度条） |

### 其它

| op | 参数 | 备注 |
|---|---|---|
| `set_bgm` | `{file?, volume 0~1（默认0.25）, duck}` | 首次必须给 file；之后可只调音量/闪避 |
| `set_audio_fx` | `{fx:[...]}` | 整片串联，**最多 4 个**；空数组 = 清除 |
| `add_overlay` | `{overlays:[{file, start, end, pos, scale 0.05~1（默认0.35）}]}` | 时间相对成片；pos 走 9 宫格 |
| `render` | `{output?, preview?, quality?}` | `preview:true` = 快速预览档（低码率整段渲染，不是即时）。**正式导出会顺带出一张封面 jpg** |
| 质量档 | `quality: low/std/high` | low=省流 crf28·128k；std=推荐 crf21·192k；high=高清 crf18·256k（也可 `set_output` 设工程默认） |

---

## 三、关键帧缓动（ease）

`ease` 写在**起点**上，作用于「该点 → 下一个点」的过渡。

| ease | 观感 | 用在哪 |
|---|---|---|
| `linear`（缺省） | 匀速，机械 | 卡点硬切（故意要突兀时） |
| `in` | 缓慢起步 | 从静止慢慢推近 |
| `out` | 缓慢收住 | 快速推近后稳稳停住 |
| `inout` | 两头都缓（**推荐**） | 绝大多数运镜 |
| `bezier` | 自定义 `[x1,y1,x2,y2]` | 需要过冲/回弹 |

```json
"keyframes": [
  { "t": 0,   "scale": 1,    "ease": "inout" },
  { "t": 0.7, "scale": 1.12, "ease": "out"   },
  { "t": 1,   "scale": 1.12 }
]
```

- ⚠️ **必须有起点锚**：只给 `{t:0.7, scale:1.12}` 等于全程 1.12。要"从原尺寸推近"就写 `{t:0, scale:1}`。
- ⚠️ 最后一个点的 `ease` 无效（没有下一个点）。
- 透明度淡出同理：`[{t:0,opacity:1},{t:1,opacity:0}]`，**起点不能省**。

## 四、五个必须记住的语义（错一个就出错片）

### 1. 两种时间基准，不能混

- **片段内**（`trimStart` / `trimEnd` / `speed` / `keyframes.t`）→ 相对**该素材**或该段
- **成片时间**（字幕 / 画中画 / BGM 起点）→ 相对**拼接后**的时间轴

推算办法：`clip_project op=get` 会返回每段的 `timelineStart` / `timelineEnd`，**照着填，不要自己心算**。

### 2. 主视频轨是"首尾相接"的，不能留空隙

`clips` 是一维顺序数组，段与段之间**没有"开始时间"**。想让画面错开出现，只能：
- 用 `overlays`（画中画）或字幕层
- 或者前一段用图片/黑场占位

### 3. 有转场时，成片时长会变短

```
成片时长 = Σ(各段有效时长) − Σ(转场时长)
段有效时长 = (trimEnd − trimStart) ÷ speed
段有效时长（曲线变速）= Σ(每片源长 ÷ 该片倍速)
```

所以**加完转场（或改了变速 / 曲线变速）要重新 op=get 再排字幕**，否则字幕会整体偏早或偏晚。

### 4. 字幕样式是"取基准条"的全局样式

`buildSubtitleAssets` 取**基准条**（有动画时 = 第一条带动画的；否则 = 第一条底部字幕）的字号/颜色/描边/位置/底板套给**全部字幕**。
**每条的动画可以不同，但样式不能逐条不同。** 需要两种字号 → 拆成两个工程或先把文字做成图片。

### 5. 未知 `fx` 在 add_clip 里会被**静默丢弃**（update_clip 才会报错）

```text
add_clip  { fx: "shakee" }  → 成功，但没加任何特效（不报错）
update_clip{ fx: "shakee" } → 报错并列出全部可选 id
```
**做法：加特效优先用 `update_clip`，或加完再 `update_clip` 复核一次。** 调色预设拼错同理（预设不匹配时按"无调色"渲染）。

---

## 五、选型决策表（想要 X 观感 → 用 Y）

| 想要的观感 | 用什么 | 关键参数 |
|---|---|---|
| 节奏感 / 卡点 | 段落切点对齐节拍 + 短转场 + 变频 | `whiteflash`/`fadeblack` + `speed` |
| 电影感 | 低饱和青橙 + 黑边 + 缓动推镜 | `colorPreset:'cinema'` 或 `'teal'` + `crop` + `keyframes` |
| 高级感留白 | 黑场过渡 + 慢速 + 暗角 | `fadeblack` + `speed:0.8` + `'noir'`/`'vignette'` |
| 复古 / 怀旧 | 颗粒 + 褪色 + 录像带 | `'vintage'`/`'sepia'` + `fx:'oldfilm'` 或 `'vhs'` |
| 赛博 / 科技 | 高饱和 + 扫描线 / 故障 | `'neon'` + `fx:'scanline'`/`'glitch'` |
| 情绪推进 | 冷暖段切换 | 前段 `'cool'` → 后段 `'warm'`/`'dawn'` |
| 卡点（按音乐节拍切） | 一键卡点 | `clip_project op=beat_cut`（需先设 BGM；可 `beatTransition:"fade"` 挂短转场） |
| 运镜顺滑（不要模板味） | 关键帧 + 缓动 | `ease:'inout'`（线性是最像模板的写法） |
| 预设太浓 / 一眼假 | 降强度 | `colorStrength:0.3~0.5` |
| 素材暗、糊、偏色 | 手动调节 | `adjust:{brightness:0.1, sharpness:0.4, temperature:0.3}` |
| 人像皮肤发黄 | 降色温 + 提亮 | `adjust:{temperature:-0.3, brightness:0.06, saturation:0.95}` |
| 产品图不够锐 | 锐化 | `adjust:{sharpness:0.5, contrast:1.1}` |
| 情绪压暗 | 暗角 + 压曝光 | `adjust:{vignette:0.5, brightness:-0.08}` |
| 震动太猛像地震 | 降幅度 | `fx:'shake', fxParams:{amplitude:0.003}` |
| 马赛克遮不住 | 减块数 | `fx:'pixelate', fxParams:{blocks:6}` |
| 突然推近 / 强调 | 缓出收住 | 起点 `ease:'out'` |
| 慢动作爆点 | 曲线变速（中间放慢） | `speedCurve:[{t:0,speed:1},{t:0.5,speed:0.4},{t:1,speed:1}]` |
| 加速过场 / 压缩时间 | 曲线变速（整体加速） | `speedCurve:[{t:0,speed:3},{t:1,speed:3}]`（与 `speed:3` 等价，优先用 `speed`） |
| 由慢到常速 | 前慢后快 | `speedCurve:[{t:0,speed:0.4},{t:1,speed:1}]` |
| 强调某个词 | 弹跳 / 闪烁字幕 | `animation:'pop'` 或 `'flicker'` |
| 解说 / 悬念 | 打字机 + 压暗 | `'typewriter'` + `'night'` |
| 口播 / 跟读 | 卡拉OK 染色 | `'karaoke'` |
| 片头标题 | 缩放 / 逐字飞入 | `'zoom'` / `'flychar'` + `vlog`/`title` 字号 |
| 人物特写圈 | 圆形蒙版 + 聚焦上部 | `mask:{shape:'top_circle', scale:0.6}` |
| 分屏对比 | 左半屏 + 右半屏两段 | `mask:{shape:'split_left'}` / `'split_right'` |
| 抠绿幕合成 | 绿幕色键 + 画中画 | `mask:{key:'green_soft'}` + `add_overlay` |
| 图片动起来 | 推拉 | `kenburns:{direction:'in', duration:6}` |
| 双人/双景同框 | 画中画 | `add_overlay` + `pos:'bottomright'` + `scale:0.4` |
| 静音只留音乐 | 段音量 0 + BGM | `volume:0` + `set_bgm` |
| 手机竖拍方向不对 | 旋转 | `rotate:90`/`270`（多半要同时 `set_output` 改画幅） |
| 镜像画面 | 翻转 | `flip:"h"` |
| 倒放回放（魔术/反转） | 倒放 | `reverse:true`（单段 ≤10s；先裁短再倒） |
| 人声清楚、音乐不抢 | 闪避 | `set_bgm {duck:true}` |
| 多段音量忽大忽小 | 响度归一 | `set_audio_fx {fx:['loudnorm']}` |
| 底噪大 | 降噪 | `set_audio_fx {fx:['denoise']}` |

---

## 六、八个成品配方

> 每个配方都是**可直接照抄的 op 序列**。先把 `{素材}` 换成真实绝对路径。

### 配方 1 · 卡点燃剪（音乐视频 / 混剪）

```text
1) create      { name:"卡点燃剪", size:"1080x1920" }
2) add_clip    { clips:[ {file:A}, {file:B}, {file:C}, {file:D} ] }   ← 先粗排
3) set_bgm     { file:音乐, volume:0.9 }                              ← 卡点必须先有 BGM
4) beat_cut    { beatTransition:"fade", beatTransitionDuration:0.15 } ← 一键按拍切开（节拍不明显会拒绝）
5) get                                                                ← 段数变了，重新看 timeline
6) 微调：个别段 update_clip 调 speed / trimStart / trimEnd
7) set_audio_fx{ fx:["loudnorm"] }
8) render      { preview:true } → 确认 → render {}
```
**要点**：转场时长 0.15~0.25s 才有"卡"的感觉；超过 0.4s 会变成"软"。曲线变速段会被跳过（切开会让曲线每片重跑）。

### 配方 2 · 口播精剪（知识 / 带货口播）

```text
1) create      { name:"口播", size:"1080x1920" }
2) add_clip    { clips:[{file:口播原片}] }
3) 剪掉口误/停顿：update_clip 调 trimStart/trimEnd；多段则需要先切段
   （切段 = add_clip 同一文件多份，各给不同 trimStart/trimEnd）
4) 自动字幕：先跑 ASR（media_asr_transcribe）拿到 SRT；把每句 add_text
5) 字幕统一样式：update_text 逐条套 → animation:"typewriter" 或 "karaoke"
                fontSizePx:84, safeArea:true
6) set_audio_fx{ fx:["denoise","loudnorm"] }      ← 口播必做这两步
7) set_bgm     { file:轻音乐, volume:0.12, duck:true }
8) 重点句加强调：对应时段 update_text → animation:"pop"
9) render      { preview:true } → render {}
```
**要点**：口播的"专业感"80% 来自**降噪 + 响度 + 字幕对齐**，不是特效。

### 配方 3 · 产品展示（电商 / 参数种草）

```text
1) create      { name:"产品", size:"1080x1920" }
2) add_clip    { clips:[
     {file:产品主图, kenburns:{direction:"in", duration:4}},
     {file:细节图1,  kenburns:{direction:"out",duration:3}},
     {file:实拍视频}
   ] }
3) 统一色调：update_clip 全部 colorPreset:"bright" 或 "vivid"
4) 细节图加运镜关键帧：keyframes:[{t:0,scale:1},{t:1,scale:1.25,offsetX:0.08}]
5) 卖点字幕：add_text 用 pop，position:"center"，fontSizePx:110
6) 价格强调：最后 2 秒 pop 字幕 + 白闪转场进最后一段
7) set_bgm { file:轻快, volume:0.25 }
8) render { preview:true } → render {}
```
**要点**：产品片**不要**加震动/故障特效（会显得劣质）；靠运镜 + 明亮调色 + 大字卖点。

### 配方 4 · 旅行 Vlog

```text
1) create   { name:"Vlog", size:"1080x1920" }
2) add_clip { clips:[空镜1, 人像, 空镜2, 特写, 结尾] }
3) 统一色调：colorPreset:"film" 或 "dawn"（全段一致）
4) 段落呼吸：每段 fadeIn/fadeOut 0.15~0.25
5) 转场：update_clip 第2段起 transition:{type:"fade"|"smoothleft", duration:0.6}
6) 地点字幕：add_text  bottom + safeArea:true, animation:"slide"
7) BGM：set_bgm { volume:0.3, duck:true }
8) 旁白（可选）：api_tts_speak 生成音频 → add_clip 的 audioFile 挂到对应段
9) render { preview:true } → render {}
```
**要点**：Vlog 的观感靠**色调统一 + 转场一致**；不要每段换一种调色。

### 配方 5 · 图文成片（文章 / 干货）

```text
1) create   { name:"图文", size:"1080x1920" }
2) 每张图一段：add_clip { clips:[{file:图1,kenburns:{direction:"in",duration:5}}, ...] }
3) 字幕逐句：add_text  animation:"typewriter"，position:"bottom", safeArea:true
4) 旁白：api_tts_speak（先 api_tts_voices 查音色）→ audioFile 挂到段
5) set_bgm { volume:0.15, duck:true }
6) render { preview:true } → render {}
```
**要点**：图文片的字幕**必须与旁白逐句对齐**；时间从 op=get 的 timeline 推算。

### 配方 6 · 反差对比（前后 / 左右分屏）

```text
1) create   { name:"对比", size:"1080x1920" }
2) add_clip { clips:[
     {file:前, mask:{shape:"split_left",  scale:1}},
     {file:后, mask:{shape:"split_right", scale:1}, transition:{type:"fade",duration:0.4}}
   ] }
3) 中间加分割线字幕：add_text { text:"▶ 使用后", position:"center" }
4) 两段调色反向：前段 colorPreset:"fade"，后段 "vivid"
5) render { preview:true } → render {}
```
**要点**：`split_left` / `split_right` 是左右各一半，两段**分别**用一半，合起来才是一屏。

### 配方 7 · 悬念解说

```text
1) create   { name:"悬念", size:"1080x1920" }
2) add_clip { clips:[{file:空镜, colorPreset:"night", fx:"oldfilm"}] }
3) 字幕：typewriter，position:"center"，fontSizePx:96
4) 关键句加 flicker 强调
5) set_bgm { volume:0.3, duck:true }
6) set_audio_fx { fx:["denoise","loudnorm"] }
7) render { preview:true } → render {}
```
**要点**：悬念靠**慢 + 暗 + 打字机**，不靠花哨转场。

### 配方 8 · 高效率混剪（素材多、要快）

```text
1) clip_import 或 file_list 摸清素材
2) add_clip 一次性传 10~20 段（数组顺序即播放顺序）
3) 统一：update_clip 逐段套同一个 colorPreset
4) 节奏：奇偶段交替 speed 1.0 / 1.25；过长段 trimEnd 裁
5) 每 3~4 段加一个 transition
6) 全片 loudnorm；BGM duck
7) render { preview:true } → render {}
```
**要点**：混剪的效率来自**批量 add_clip**，不要一段一段调。

---

## 七、失败排查

| 现象 | 原因 | 处置 |
|---|---|---|
| 渲染失败在「加工第 N 段」 | 素材损坏 / 格式怪 | `media_edit op=trim` 试单段；或 `api_media_normalize` 转码 |
| 拼接后时长不对 | 各段规格不一致 | `api_media_normalize` 统一后重建 |
| 字幕不出现 | start/end 用了素材时间 | 用 op=get 的 `timelineStart/End` 重排 |
| 字幕整体偏早/偏晚 | 有转场，总时长缩短了；或改了变速/曲线变速 | 按「Σ段长 − Σ转场」重算；改完变速一律重新 `op=get` 拿新 timeline |
| 字幕太大/太小 | 字号按 1920 高基准 | 竖屏 70~110；横屏 50~80 |
| 某条字幕样式没生效 | 样式取基准条（全局） | 统一到基准条字号；要不同字号 → 拆工程 |
| 特效没反应 | `fx` id 拼错（add_clip 静默丢弃） | 用 `update_clip` 重设，它会报错并列出可选 id |
| 调色没反应 | preset id 不在 32 项里 | 同上，用 update_clip 复核 |
| 蒙版没效果 | shape 与 key 同时给（key 优先） | 只给一个 |
| 关键帧位移看不出 | `scale=1` 时没有画外内容可移 | 同时给 `scale:1.2` |
| 转场报错/黑屏 | 转场时长 > 某段时长 | duration 压到 ≤ 段长 × 0.5 |
| 图片段变成 3 秒 | 没给 `kenburns` | 给 `kenburns.duration` |
| BGM 没声音 | 音量太低 / 文件不可用 | volume ≥ 0.15；确认路径有效 |
| 人声被 BGM 盖 | 没开闪避 | `set_bgm { duck:true }` |

---

## 八、诚实边界（现在做不到，别承诺）

| 做不到 | 原因 | 替代 |
|---|---|---|
| 智能抠像（人像去背景） | 需分割模型运行时 | 绿幕/白底/黑底色键；或先外部处理 |
| 美颜 / 美体 | 需人脸网格模型 | — |
| AI 补帧 / 超分 | 需 RIFE / Real-ESRGAN | — |
| 曲线变速 | 工程只支持恒定倍速 | `media_edit op=speed` 先处理素材再导入 |
| 混合模式 / 图层顺序 | 叠加层只有一层且无 blend | — |
| 自由钢笔蒙版 | 只有参数化形状 | 用分屏/圆形/矩形组合近似 |
| 多机位 / 多时间线 | 未实现 | 先外部对齐再拼接 |
| 独立音效轨（点状音效） | 只能整片音效链 | 把音效混进一段素材再用 `audioFile` |
| 多段 BGM | 只有一条 | 先合成一条音频 |
| 多视频轨 | 主轨只有一条 | 用 `overlays` 叠画中画 |
| 逐条字幕不同字号 | 样式取基准条 | 拆工程 / 文字做图 |
| 实时播放预览 | 预览是抽单帧/整段快速渲染 | `render {preview:true}` 整段看 |

> 被问到这些能力时：**照实说不支持**，并给替代路径。编造"我帮你抠像"会让用户白等一轮。

---

## 九、交付口径

给：**成片路径、时长、段数与顺序、字幕条数与动画、BGM 与音量、封面路径、还需补什么**。

不要贴工程 json、不要贴整段 op 调用记录。渲染失败时给**失败步骤名 + 一条最可能的处置**。
