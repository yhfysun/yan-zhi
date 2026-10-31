// 剪辑工程文件（clip project）—— 剪辑模式（clip mode）的唯一事实源。
//
// 设计要点：
//   1. **纯数据 + 纯函数**：所有编辑操作（增删片段/改参数/挪位置）都是 `applyClipOp` 里
//      的确定性变换，不碰磁盘、不碰 ffmpeg → 可脱机单测（本机 vitest 有时跑不起来，
//      纯函数层是最便宜的可验证面）。
//   2. **UI 与智能体共享同一份工程**：前端时间轴拖拽与模型调 `clip_project` 走的是
//      同一组 op，落同一个 json。不为 UI 另造一套编辑模型（否则两边必然漂移）。
//   3. **渲染只有一个出口**：工程 → ffmpeg 的翻译在 `clip-render.ts`，UI 不自己拼命令。
//
// 时间语义（务必分清，混用必然错位）：
//   · 片段内时间（trimStart/trimEnd/speed）→ **相对该段原始素材**；
//   · 字幕/BGM 时间 → **相对成片（拼接后）**，由调用方按各段时长累计推算。

import { FX_EFFECTS, fxParamsOf, speedCurveIsFlat, SPEED_MIN, SPEED_MAX, blendModeOf, OVERLAY_POSITIONS, type BlendModeId, type LayerKfPoint, type LayerTransform } from '@yan-zhi/shared';

export interface ClipSegment {
  id: string;
  /** 素材本机绝对路径 */
  file: string;
  /** 时间轴上的显示名（默认取文件名） */
  label?: string;
  /** 裁剪起（秒，相对该素材） */
  trimStart?: number;
  /** 裁剪止（秒，相对该素材）；不给则到素材结尾 */
  trimEnd?: number;
  /** 变速倍数：>1 加快 <1 放慢（1/缺省=不变） */
  speed?: number;
  /**
   * 曲线变速：按源时间比例给倍速，渲染时量化成若干恒定倍速的切片再拼接。
   * ★ 与 `speed` **互斥**（有曲线时以曲线为准）；与 fadeIn/fadeOut 可共存
   *   （淡入淡出在"源时间"里生效，随画面一起被时移，语义一致）。
   */
  speedCurve?: Array<{ t: number; speed: number }>;
  /** 调色预设（见 shared 的 COLOR_EFFECTS，32 项） */
  colorPreset?: string;
  /**
   * 预设强度 0~1（缺省 1 = 全量）。
   * ★ 实现是「原片与滤镜结果按比例混合」，所以对**任意**预设都成立（含噪点/暗角这类无法线性插值的）。
   */
  colorStrength?: number;
  /**
   * 手动调节（在预设之上叠加）：亮度/对比/饱和/色温/锐化/暗角。
   * ★ 缺省值 = 不变（brightness 0、contrast 1、saturation 1、temperature 0、sharpness 0、vignette 0）。
   */
  adjust?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    temperature?: number;
    sharpness?: number;
    vignette?: number;
  };
  /** 动态特效 id（见 shared 的 FX_EFFECTS：震动/扫描线/残影/柔光/马赛克…） */
  fx?: string;
  /**
   * 动态特效参数（键见效果注册表 FX_EFFECTS[].params）。
   * ★ 只存**偏离默认值**的键：工程文件要能一眼看出调了什么。
   * ★ 未知键/越界值在归一化时丢弃或钳制 —— 脏值只会得到"看着正常但画面不对"的滤镜。
   */
  fxParams?: Record<string, number>;
  /** 画面淡入秒（相对该段起点） */
  fadeIn?: number;
  /** 画面淡出秒（相对该段终点） */
  fadeOut?: number;
  /**
   * 静态图片运镜（图片素材专属）。
   * ★ direction='none' = 静止画面，只借用 duration 表达"这一张图持续几秒"
   *   （定格帧用它：既要不动的画面，又要能改时长）。
   */
  kenburns?: { direction: 'in' | 'out' | 'none'; duration: number };
  /**
   * 蒙版：只显示素材的某一部分。
   * ★ shape 走 geq 的 alpha 表达式（圆形/矩形/心形/分屏…）；
   *   key 走色键抠像（绿幕/蓝幕/白底/黑底）。两者互斥，同时给时 key 优先。
   */
  mask?: {
    shape?: string;
    /** 形状内缩比例 0.1~1（1 = 铺满画面；越小蒙版越小） */
    scale?: number;
    /** 形状中心偏移（相对画面宽/高的比例，-0.5~0.5） */
    offsetX?: number;
    offsetY?: number;
    /** 边缘羽化像素（0 = 硬边） */
    feather?: number;
    /** 色键预设 id（green/blue/white/black 等） */
    key?: string;
  };
  /**
   * 与前一段之间的转场（**挂在后一段上**，语义 = "我进来时怎么出现"）。
   * ★ 为什么挂在后一段而不是做成独立"转场轨"：转场本质是两段的连接属性，
   *   独立轨道会引入"转场必须正好覆盖交界处"的一致性约束，编辑时极易错位
   *   （剪映的转场也是显示在两段交界处的后一段上）。
   */
  transition?: {
    /** 转场类型 id（见效果库 TRANSITIONS） */
    type: string;
    /** 转场时长（秒），默认 0.8 */
    duration?: number;
  };
  /** 该段配音音频（绝对路径）；与 keepOriginalAudio 二选一语义 */
  audioFile?: string;
  /** true=保留原声与配音混音；false/缺省=用配音替换原声 */
  keepOriginalAudio?: boolean;
  /** 该段整体音量倍数（1/缺省=不变） */
  volume?: number;
  /**
   * 倒放该段（画面与音轨一起倒）。
   * ★ 单段有时长上限（render 层 REVERSE_MAX_SEC）：ffmpeg 的 reverse 要把整段帧读进内存。
   */
  reverse?: boolean;
  /** 顺时针旋转角度：**先转正再按工程画幅补边裁切**（90/270 会大裁，多半要同时改输出规格） */
  rotate?: 90 | 180 | 270;
  /** 镜像翻转：h=水平（左右镜像）　v=垂直（上下）　both=两者 */
  flip?: 'h' | 'v' | 'both';
  /**
   * 画面裁剪：只保留素材的一个子区域（比例 0~1，相对素材画面）。
   * ★ 裁剪后回填到工程画幅（fill，不变形）—— 与"裁掉黑边/杂物"的手动剪辑语义一致。
   */
  crop?: {
    /** 裁剪区左上角（比例 0~0.9） */
    x?: number;
    y?: number;
    /** 裁剪区宽高（比例 0.1~1；1 = 到边） */
    w?: number;
    h?: number;
  };
  /**
   * 关键帧动画（运镜/淡入淡出的任意组合）。
   * ★ t 是**段内时间比例 0~1**（不是秒）——改变速/裁剪后动画跟着段走，不跟墙钟走；
   *   0 点 = 段开头，1 = 段结尾。点之间线性插值，首尾之外 clamp。
   * ★ scale/offset 驱动 zoompan（推拉摇），opacity 驱动 geq alpha（整段淡入淡出）。
   */
  keyframes?: Array<{
    t: number;
    /** 画面缩放倍数（1 = 不缩放，最大 3） */
    scale?: number;
    /** 视野中心偏移（比例 -0.5~0.5，正 x 向右 / 正 y 向下） */
    offsetX?: number;
    offsetY?: number;
    /** 透明度 0~1（垫黑底合成；0 = 全黑） */
    opacity?: number;
    /**
     * 到**下一个关键帧**之间的缓动（缺省 linear）。
     * ★ 缓动只影响"这一段的过渡曲线"，不改变端点值；linear 段不插点，表达式长度不变。
     */
    ease?: 'linear' | 'in' | 'out' | 'inout' | 'bezier';
    /** ease=bezier 的控制点 [x1,y1,x2,y2]（CSS cubic-bezier 同义） */
    bezier?: [number, number, number, number];
  }>;
}

/**
 * 音频层（P0-7）：成片时间轴上的一段声音 —— 独立音效（转场"唰"声）或第二段 BGM 都用它。
 * ★ 与 `project.bgm` 的分工：bgm 是**整片铺底**（没有显式时长，铺满成片）；
 *   音频层是**定时**的（start/end 明确）。两段 BGM 无缝接 = 两个首尾相接的音频层。
 * ★ 时间语义：start/end 相对成片；trimStart 相对**素材**（从第几秒开始取）。
 */
export interface ClipAudio {
  id: string;
  /** 音频素材本机绝对路径 */
  file: string;
  /** 相对成片的起始秒 */
  start: number;
  /** 相对成片的结束秒 */
  end: number;
  /** 音量倍数 0~2，缺省 1 */
  volume?: number;
  /** 淡入秒（片头，从 0 起） */
  fadeIn?: number;
  /** 淡出秒（片尾） */
  fadeOut?: number;
  /**
   * 从素材的第几秒开始取（缺省 0）
   * ★ 不做 duck（说话自动压低）：侧链要看到"人声"，而音频层本身就是音效/BGM，压自己没意义。
   *   需要闪避的整片铺底音乐仍然走 project.bgm（它有 duck）。
   */
  trimStart?: number;
}

/**
 * 贴纸层（P1-1）：一张带透明的图（库生成或用户导入）叠在画面上，可随时间出现/消失。
 * ★ 与画中画的区别：贴纸按**画面宽度比例**缩放（scale，缺省 0.3）、默认居中、没有音轨与混合模式；
 *   渲染走同一套 overlay 链路，变换与关键帧语义完全一致。
 */
export interface ClipSticker {
  id: string;
  /** PNG/WebP（带透明）本机绝对路径 */
  file: string;
  /** 相对成片的起始/结束秒 */
  start: number;
  end: number;
  /** 宽度占画面宽度的比例 0.02~1，缺省 0.3 */
  scale?: number;
  /** 中心偏移（-0.5~0.5，0=居中） */
  x?: number;
  y?: number;
  /** 旋转角度（度，正=顺时针） */
  rotation?: number;
  /** 不透明度 0~1 */
  opacity?: number;
  /** 变换关键帧（t 为层内 0~1，语义同画中画） */
  keyframes?: LayerKfPoint[];
}

/** 画中画（叠加轨）：在成片的某段时间里把一个小画面叠在主画面上。 */
export interface ClipOverlay {
  id: string;
  /** 叠加素材（视频/图片）本机绝对路径 */
  file: string;
  /** 相对成片的起始/结束秒 */
  start: number;
  end: number;
  /** 锚点方位（见效果库 OVERLAY_POSITIONS）；缺省 bottomright */
  pos?: string;
  /** 叠加画面的缩放倍数（相对素材自身尺寸，0.05~1） */
  scale?: number;
  /**
   * 混合模式（见 shared 的 BLEND_MODES）；缺省 = normal（普通覆盖）。
   * ★ 只存非 normal 值：normal 是默认语义，写进文件只会让老工程比对出现噪音。
   */
  blend?: BlendModeId;
  /**
   * 中心偏移（相对画面宽/高，-0.5~0.5，0=居中）；**设置后覆盖 pos 九宫格**。
   * ★ 老工程只有 pos，渲染仍走锚点表达式（逐字节不变）；细调位置与关键帧用 x/y。
   */
  x?: number;
  y?: number;
  /** 旋转角度（度，正=顺时针）；缺省 0 */
  rotation?: number;
  /** 不透明度 0~1；缺省 1（不打点也生效，打点则由关键帧接管） */
  opacity?: number;
  /** 变换关键帧（t 为层内 0~1；x/y 是中心偏移、scale 是倍数，语义与静态字段相同） */
  keyframes?: LayerKfPoint[];
}

export interface ClipText {
  id: string;
  text: string;
  /** 相对成片的起始秒 */
  start: number;
  /** 相对成片的结束秒 */
  end: number;
  /** 字幕动画预设 id（见 mcp/subtitle-style.ts 的 8 种）；缺省=无动画 */
  animation?: string;
  /** animation=slide 时的滑入方向 */
  slideDirection?: 'left' | 'right' | 'up' | 'down';
  /** 字号（像素，1920 高基准）；缺省 88 */
  fontSizePx?: number;
  /** 颜色 #RRGGBB；缺省白色 */
  color?: string;
  /** 描边色 #RRGGBB；缺省黑色 */
  outlineColor?: string;
  /** 描边宽度（像素，1920 高基准）；缺省 12 */
  outlinePx?: number;
  /** 背景底板色 #RRGGBBAA（A=不透明度）；不填 = 无底板 */
  backColor?: string;
  /** 位置；缺省 bottom */
  position?: 'bottom' | 'center' | 'top';
  /** 竖屏安全区（字幕上抬避开底部 UI）；缺省 false */
  safeArea?: boolean;
  /**
   * 文字层变换（P0-2b）：与画中画同语义 —— x/y 是**相对画面宽高的中心偏移**（-0.5~0.5，0=居中），
   * scale 是字号倍数（1=原字号），rotation 是角度（正=顺时针），opacity 0~1。
   * ★ 一旦有变换，字幕改走 ASS 渲染（\pos/\frz/\fscx/\fscy/\alpha）；
   *   没有变换的老工程仍走原来的 SRT(+force_style) 路径，出片逐字节不变。
   * ★ 有变换时**不再套文字动画预设**（两者都是整条 cue 的内联标签，混在一起语义不清）。
   */
  transform?: LayerTransform;
  /** 变换关键帧（t 为**层内** 0~1 比例，层的时间范围即 start~end） */
  keyframes?: LayerKfPoint[];
}

export interface ClipProject {
  /**
   * 轨道模型 v2（P0-1）：落盘格式只有 clips + layers + bgm/audioFx。
   *
   * ★ 存储与内存的分工（这是本模型的全部约定）：
   *   · **落盘（writeClipProject）**：texts/overlays 被剥离，图层镜像进 layers ——
   *     layers 是唯一持久化形态（方案文档 4.1 的"迁移而不是并存"）；
   *   · **内存（readClipProject 之后）**：由 layers **派生**出 texts/overlays 视图字段，
   *     渲染/预览/路由/摘要/UI 全部继续读 v1 形状 —— 这些消费方一行不改，
   *     "预览所见=成片所得"与既有 101 条单测零漂移；
   *   · applyClipOp 继续操作 texts/overlays（op 语义不变，模型与 UI 无感），
   *     落盘时再镜像回 layers。投影是**机械映射**（同一份纯函数，双向可逆），
   *     不存在两套编辑语义 —— 这与方案文档否决的"双模型并存"（两套实现）不同。
   */
  version: 2;
  name: string;
  updatedAt: number;
  output: { size: string; fps: number; quality?: ExportQuality };
  /** 视频主轨：按数组顺序首尾相接（保持既有渲染/时长语义） */
  clips: ClipSegment[];
  /**
   * 通用图层轨（唯一持久化存储）：字幕/画中画都在这里。
   * ★ kind=text ↔ texts 视图；kind=video ↔ overlays 视图（投影见 v1FieldsFromLayers /
   *   layersFromV1Fields）。将来 P0-2/P0-3 的新 kind（sticker/effect）只存在于 layers，
   *   v1 视图看不到 —— 新图层从 P0-2 起直接渲染自 layers。
   */
  layers: Layer[];
  /**
   * 字幕视图字段（**仅内存**，由 layers 派生；落盘时剥离）。
   * v1 消费方（clip-render 的字幕管线 / UI / 摘要）读这里。
   */
  texts: ClipText[];
  /** 画中画视图字段（仅内存，由 layers 派生；落盘时剥离） */
  overlays?: ClipOverlay[];
  /**
   * 音频层视图字段（仅内存，由 kind=audio 的 layers 派生；落盘时剥离）。
   * ★ 与 bgm 并存：bgm 是整片铺底（无时长），这里是定时音频（音效/多段 BGM）。
   */
  audios?: ClipAudio[];
  /** 贴纸视图字段（仅内存，由 kind=sticker 的 layers 派生；落盘时剥离） */
  stickers?: ClipSticker[];
  /**
   * 音效链（整片，按数组顺序串联）。
   * ★ 放"整片"而不是每段：降噪/响度归一这类是**工程级标准化**（多段素材音量忽大忽小，
   *   逐段处理反而会在段落交界处出现响度台阶）；而变声/混响这类也是整片统一更省事。
   *   需要逐段不同音效时用 media_edit 单独处理该段再当素材用。
   */
  audioFx?: string[];
  /** 背景音乐（整片）。★ P0-1 诚实边界：BGM 保持工程级，音频轨模型归 P0-7。 */
  bgm?: { file: string; volume: number; duck: boolean };
}

// ===== 轨道模型 v2（P0-1）：图层类型与双向投影 =====
//
// ★★★ 为什么引入 layers（方案文档 4.1）：
//   v1 的 texts/overlays 是两套平行叠加轨，表达不了图层顺序/混合模式/图层级关键帧，
//   也加不了贴纸/特效层。v2 统一成 layers[]：track 决定上下（大者在上），
//   P0-2/P0-3 在 Layer.transform 上长出变换与混合。
// ★ 与方案文档 4.1 的两处**诚实偏差**（实施定案）：
//   ① bgm 不迁进 layers（音频轨模型是 P0-7 的事，本期只做图像/文字层）；
//   ② 内存保留 texts/overlays 投影视图（消费方零改动），落盘只写 layers ——
//     迁移的本质是"序列化格式换了"，不是"运行时数据结构换了"。

export type LayerKind = 'text' | 'image' | 'video' | 'sticker' | 'audio' | 'effect';

/**
 * 通用图层。
 * ★ kind=text 时 text 字段沿用既有 ClipText 结构（样式/动画全保留，不丢字段）；
 *   其余 kind 用 file + transform。
 * ★ transform.x/y 是相对画面宽/高的比例偏移（-0.5~0.5，0=居中）——
 *   与 v1 画中画 pos 九宫格锚点等价换算（topleft → x=-0.25,y=-0.25 …）。
 * ★ keyframes 复用段关键帧的 ease 语义（t 为图层内 0~1 比例）；P0-2 接渲染，本期只存不渲。
 */
export interface Layer {
  id: string;
  kind: LayerKind;
  /** image/video/sticker 层的素材路径 */
  file?: string;
  /** text 层的字幕内容（沿用 v1 字幕结构，start/end 与层 start/end 同值） */
  text?: ClipText;
  /** 成片时间轴上的起止秒 */
  start: number;
  end: number;
  /** 轨道序号：同刻多图层的叠放次序（大者在上）。v1 迁移固定：text=1、video(画中画)=0 */
  track: number;
  /** 变换（P0-2 画中画已接渲染；P0-2b 文字层也接了 —— 字幕走 ASS 内联标签） */
  transform: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    opacity?: number;
    /** 混合模式（P0-3：渲染已消费；值来自 shared 的 BLEND_MODES） */
    blend?: BlendModeId;
    /**
     * 九宫格锚点（v1 视图 pos 的原样保留）。与 x/y 二选一：
     * 有 pos 时位置由锚点表达式决定（老工程走这条，渲染逐字节不变）。
     */
    pos?: string;
  };
  /** 图层级关键帧（P0-2 已接渲染；t 为层内 0~1 比例） */
  keyframes?: LayerKfPoint[];
  /** 音频层专属（P0-7 已接渲染）：音量/淡入淡出/素材内起点 */
  audio?: { volume?: number; fadeIn?: number; fadeOut?: number; trimStart?: number };
}

/** v1 工程文件（迁移函数的输入形态）：texts 必有、overlays 可选。 */
export interface ClipProjectV1 {
  version: 1;
  name: string;
  updatedAt: number;
  output: { size: string; fps: number; quality?: ExportQuality };
  clips: ClipSegment[];
  texts: ClipText[];
  audioFx?: string[];
  bgm?: { file: string; volume: number; duck: boolean };
  overlays?: ClipOverlay[];
}

/** 画中画九宫格锚点 → transform.x/y（比例 -0.5~0.5，0=居中；**来自 shared 的 OVERLAY_POSITIONS**，不另写一份）。 */
const OVERLAY_POS_TO_XY: Record<string, { x: number; y: number }> = Object.fromEntries(
  OVERLAY_POSITIONS.map((p) => [p.id, { x: p.fx, y: p.fy }]),
);

/**
 * transform.x/y 是否**恰好**等于某个九宫格值（旧 v2 文件由 pos 投影而来，读回时要还原成 pos）。
 * ★ 用精确相等而不是"最近锚点"：任意微小偏移都属于显式位置，不能被吸附成锚点
 *   （吸附会让用户细调的位置在每次读盘后跳回格点）。
 */
function gridIdOfXY(x: number | undefined, y: number | undefined): string | null {
  if (x == null || y == null) return null;
  for (const [id, p] of Object.entries(OVERLAY_POS_TO_XY)) {
    if (Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6) return id;
  }
  return null;
}

/**
 * 图层 transform → 文字层变换视图（P0-2b 反向投影）。
 * ★ 只挑文字层支持的 5 个字段（blend/pos 属于画中画），并丢掉等价默认值：
 *   老工程的 text 层 transform 是空对象 → 读回来仍是 undefined → 渲染继续走 SRT 原路径。
 */
function textTransformOf(t: Layer['transform'] | undefined): LayerTransform | undefined {
  if (!t) return undefined;
  const out: LayerTransform = {
    ...(t.x != null ? { x: t.x } : {}),
    ...(t.y != null ? { y: t.y } : {}),
    ...(t.scale != null && Math.abs(t.scale - 1) > 1e-6 ? { scale: t.scale } : {}),
    ...(t.rotation != null && Math.abs(t.rotation) > 1e-6 ? { rotation: t.rotation } : {}),
    ...(t.opacity != null && t.opacity < 0.999 ? { opacity: t.opacity } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

/**
 * v1 字段（texts/overlays）→ layers（正向投影；迁移与落盘共用）。
 * ★ 纯函数、确定性：同一输入永远得到同一 layers（id 保留原值，不重排）。
 */
export function layersFromV1Fields(texts: ClipText[], overlays: ClipOverlay[], audios: ClipAudio[] = [], stickers: ClipSticker[] = []): Layer[] {
  const layers: Layer[] = [];
  for (const t of texts) {
    // ★ 变换/关键帧存在**图层**上（Layer.transform/keyframes），不塞进 l.text ——
    //   否则同一份数据在层里出现两次，落盘后读者不知道该信哪个。
    const { transform, keyframes, ...textBody } = t;
    layers.push({
      id: t.id,
      kind: 'text',
      text: { ...textBody },
      start: t.start,
      end: t.end,
      track: 1,
      transform: transform ? { ...transform } : {},
      ...(keyframes?.length ? { keyframes: keyframes.map((k) => ({ ...k })) } : {}),
    });
  }
  for (const o of overlays) {
    const hasXY = o.x != null || o.y != null;
    // ★ 位置二选一：显式 x/y 优先；否则用九宫格 pos + 等价比例坐标（pos 是权威，
    //   等价坐标留给只认 x/y 的消费方；两者都由 pos 推导，不会漂移）。
    const xy = OVERLAY_POS_TO_XY[o.pos || 'bottomright'] ?? OVERLAY_POS_TO_XY.bottomright;
    layers.push({
      id: o.id,
      kind: 'video',
      file: o.file,
      start: o.start,
      end: o.end,
      track: 0,
      transform: {
        ...(hasXY ? { x: o.x ?? 0, y: o.y ?? 0 } : { x: xy.x, y: xy.y, pos: o.pos || 'bottomright' }),
        ...(o.scale != null ? { scale: o.scale } : {}),
        ...(o.rotation != null && Math.abs(o.rotation) > 0.001 ? { rotation: o.rotation } : {}),
        ...(o.opacity != null && o.opacity < 0.999 ? { opacity: o.opacity } : {}),
        ...(o.blend && o.blend !== 'normal' ? { blend: o.blend } : {}),
      },
      ...(o.keyframes?.length ? { keyframes: o.keyframes.map((k) => ({ ...k })) } : {}),
    });
  }
  // 音频层（P0-7）：时间/素材在顶部字段，音量/淡入淡出/闪避/素材内起点收在 audio 里
  for (const a of audios) {
    layers.push({
      id: a.id,
      kind: 'audio',
      file: a.file,
      start: a.start,
      end: a.end,
      track: 2,
      transform: {},
      audio: {
        ...(a.volume != null ? { volume: a.volume } : {}),
        ...(a.fadeIn != null ? { fadeIn: a.fadeIn } : {}),
        ...(a.fadeOut != null ? { fadeOut: a.fadeOut } : {}),
        ...(a.trimStart != null ? { trimStart: a.trimStart } : {}),
      },
    });
  }
  // 贴纸层（P1-1）：track=2（在字幕之下；音频层不参与视觉叠放）
  for (const s of stickers) {
    layers.push({
      id: s.id,
      kind: 'sticker',
      file: s.file,
      start: s.start,
      end: s.end,
      track: 2,
      transform: {
        ...(s.x != null ? { x: s.x } : {}),
        ...(s.y != null ? { y: s.y } : {}),
        scale: s.scale ?? 0.3,
        ...(s.rotation != null && Math.abs(s.rotation) > 0.001 ? { rotation: s.rotation } : {}),
        ...(s.opacity != null && s.opacity < 0.999 ? { opacity: s.opacity } : {}),
      },
      ...(s.keyframes?.length ? { keyframes: s.keyframes.map((k) => ({ ...k })) } : {}),
    });
  }
  return layers;
}

/**
 * layers → v1 视图字段（反向投影；读入 v2 文件后派生内存形状用）。
 * ★ 只认 kind=text / kind=video 且字段完整的新图层；其余 kind（P0-2 起的
 *   sticker/effect…）留在 layers 里，v1 视图看不到（也不会被反向投影丢掉 ——
 *   正向投影落盘时以**内存 texts/overlays + 原 layers 中的新 kind** 合并重建）。
 */
export function v1FieldsFromLayers(layers: Layer[]): { texts: ClipText[]; overlays: ClipOverlay[]; audios: ClipAudio[]; stickers: ClipSticker[] } {
  const texts: ClipText[] = [];
  const overlays: ClipOverlay[] = [];
  const audios: ClipAudio[] = [];
  const stickers: ClipSticker[] = [];
  for (const l of layers) {
    if (l.kind === 'text' && l.text) {
      const tf = textTransformOf(l.transform);
      texts.push({
        ...l.text,
        start: l.start,
        end: l.end,
        ...(tf ? { transform: tf } : {}),
        ...(l.keyframes?.length ? { keyframes: l.keyframes.map((k) => ({ ...k })) } : {}),
      });
    } else if (l.kind === 'video' && l.file) {
      const t = l.transform || {};
      // ★ 位置还原顺序：pos（新写入/老工程）→ 恰好落在九宫格上的 x/y（旧 v2 文件由 pos 投影而来）
      //   → 真正的显式偏移。判错了会让画中画位置整体漂移，且不报错。
      const gridId = !t.pos ? gridIdOfXY(t.x, t.y) : null;
      const position: { pos?: string; x?: number; y?: number } = t.pos
        ? { pos: t.pos }
        : gridId
          ? { pos: gridId }
          : t.x != null || t.y != null
            ? { x: t.x ?? 0, y: t.y ?? 0 }
            : { pos: 'bottomright' };
      overlays.push({
        id: l.id,
        file: l.file,
        start: l.start,
        end: l.end,
        ...position,
        ...(t.scale != null ? { scale: t.scale } : {}),
        ...(t.rotation != null && Math.abs(t.rotation) > 0.001 ? { rotation: t.rotation } : {}),
        ...(t.opacity != null && t.opacity < 0.999 ? { opacity: t.opacity } : {}),
        ...(t.blend && t.blend !== 'normal' ? { blend: t.blend } : {}),
        ...(l.keyframes?.length ? { keyframes: l.keyframes.map((k) => ({ ...k })) } : {}),
      });
    } else if (l.kind === 'audio' && l.file) {
      const a = l.audio || {};
      audios.push({
        id: l.id,
        file: l.file,
        start: l.start,
        end: l.end,
        ...(a.volume != null && Math.abs(a.volume - 1) > 1e-6 ? { volume: a.volume } : {}),
        ...(a.fadeIn != null && a.fadeIn > 0 ? { fadeIn: a.fadeIn } : {}),
        ...(a.fadeOut != null && a.fadeOut > 0 ? { fadeOut: a.fadeOut } : {}),
        ...(a.trimStart != null && a.trimStart > 0 ? { trimStart: a.trimStart } : {}),
      });
    } else if (l.kind === 'sticker' && l.file) {
      const t = l.transform || {};
      stickers.push({
        id: l.id,
        file: l.file,
        start: l.start,
        end: l.end,
        scale: t.scale ?? 0.3,
        ...(t.x != null ? { x: t.x } : {}),
        ...(t.y != null ? { y: t.y } : {}),
        ...(t.rotation != null && Math.abs(t.rotation) > 0.001 ? { rotation: t.rotation } : {}),
        ...(t.opacity != null && t.opacity < 0.999 ? { opacity: t.opacity } : {}),
        ...(l.keyframes?.length ? { keyframes: l.keyframes.map((k) => ({ ...k })) } : {}),
      });
    }
  }
  return { texts, overlays, audios, stickers };
}

/**
 * v1 → v2 纯函数迁移（readClipProject 读到 v1 文件时调用）。
 * ★ 保留 texts/overlays 在返回值里（内存消费方立即可用）；落盘由 writeClipProject 剥离。
 * ★ bgm/audioFx 原样保留（P0-1 不迁移音频，见模型注释的诚实边界）。
 */
export function migrateV1ToV2(p: ClipProjectV1): ClipProject {
  return {
    version: 2,
    name: p.name,
    updatedAt: p.updatedAt,
    output: { ...p.output },
    clips: p.clips.map((c) => ({ ...c })),
    layers: layersFromV1Fields(p.texts, p.overlays || []),
    texts: p.texts.map((t) => ({ ...t })),
    ...(p.overlays ? { overlays: p.overlays.map((o) => ({ ...o })) } : {}),
    ...(p.audioFx ? { audioFx: [...p.audioFx] } : {}),
    ...(p.bgm ? { bgm: { ...p.bgm } } : {}),
  };
}

const DEFAULT_OUTPUT = { size: '1080x1920', fps: 30 };

/** 导出质量档：直接对应渲染的 crf/preset/音轨码率（见 clip-render 的 QUALITY_PRESETS）。 */
export type ExportQuality = 'low' | 'std' | 'high';
const QUALITY_IDS = new Set(['low', 'std', 'high']);

/** 解析 quality 参数（三档之外一律报错，不静默回落 —— 用户以为"高清"导出了个糊的更难查）。 */
function parseQuality(v: unknown): ExportQuality | null {
  if (v == null) return null;
  const q = String(v).trim().toLowerCase();
  return QUALITY_IDS.has(q) ? (q as ExportQuality) : null;
}

export function createEmptyProject(name = '未命名剪辑'): ClipProject {
  return {
    version: 2,
    name,
    updatedAt: Date.now(),
    output: { ...DEFAULT_OUTPUT },
    clips: [],
    layers: [],
    texts: [],
  };
}

/** 生成可读且确定性的 id：c1/c2… t1/t2… o1/o2… a1/a2… s1/s2…（从现有最大序号 +1）。 */
function nextId(prefix: 'c' | 't' | 'o' | 'a' | 's', existing: Array<{ id: string }>): string {
  let max = 0;
  for (const it of existing) {
    const m = String(it.id || '').match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

export type ClipOpResult =
  | { ok: true; project: ClipProject; note: string }
  | { ok: false; error: string };

// ===== 校验：只校验结构与自身一致性；素材是否存在 / 时长范围由调用方（含磁盘）把关 =====
function numOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 归一化蒙版配置。
 *
 * ★ 纯函数、只做**范围钳制与字段白名单**（不校验形状合法性 —— 那由 clip-mask 的
 *   buildMaskFilter 决定，未知形状会被忽略，不会污染渲染）。返回 null = 无有效蒙版。
 * ★ 必须归一化：写进工程的脏值（如 feather: -5、scale: 99）会让 ffmpeg 生成
 *   非法表达式 → 命令失败，而失败点在渲染时，报错离用户操作很远。
 */
function normalizeMask(v: unknown): ClipSegment['mask'] | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const shape = String(m.shape ?? '').trim();
  const key = String(m.key ?? '').trim();
  const scale = typeof m.scale === 'number' ? Math.max(0.05, Math.min(1, m.scale)) : undefined;
  const offsetX = typeof m.offsetX === 'number' ? Math.max(-0.5, Math.min(0.5, m.offsetX)) : undefined;
  const offsetY = typeof m.offsetY === 'number' ? Math.max(-0.5, Math.min(0.5, m.offsetY)) : undefined;
  const feather = typeof m.feather === 'number' ? Math.max(0, Math.min(200, m.feather)) : undefined;
  const hasShape = shape && shape !== 'none';
  const hasKey = key && key !== 'none';
  if (!hasShape && !hasKey) return null;
  return {
    ...(hasShape ? { shape } : {}),
    ...(scale != null ? { scale } : {}),
    ...(offsetX != null ? { offsetX } : {}),
    ...(offsetY != null ? { offsetY } : {}),
    ...(feather != null ? { feather } : {}),
    ...(hasKey ? { key } : {}),
  };
}

/**
 * 归一化画面裁剪配置。返回 null = 无有效裁剪（全画幅或字段全缺省）。
 * ★ 只做范围钳制（x/y 0~0.9、w/h 0.1~1），不校验 x+w<=1 —— 越界由 ffmpeg crop 自然夹住
 *   （crop 宽高超出画面会被夹到边界），此处不必重复实现同样的夹取。
 */
function normalizeCrop(v: unknown): ClipSegment['crop'] | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const x = Math.max(0, Math.min(0.9, numOr(m.x, 0)));
  const y = Math.max(0, Math.min(0.9, numOr(m.y, 0)));
  const w = Math.max(0.1, Math.min(1, numOr(m.w, 1)));
  const h = Math.max(0.1, Math.min(1, numOr(m.h, 1)));
  if (w >= 0.999 && h >= 0.999) return null;   // 全画幅 = 没裁
  return { x, y, w, h };
}

/**
 * 归一化关键帧数组。返回 undefined = 无有效关键帧。
 *
 * ★ 2026-10-30 改了「有意义」的判据（关键帧缓动一起做的）：
 *   旧规则是**逐点**判断"偏离恒等值才算有意义"，于是 `{ t:0, scale:1 }` 这种
 *   "从原尺寸开始"的锚点会被丢掉 —— 剩下 `{ t:1, scale:1.5 }` 变成全程 1.5，
 *   用户以为在推镜、其实画面是静的。缓动更依赖端点锚：没有起点就到不了 1.0。
 *   新规则：**只要给了属性就保留该点**，最后再看整条曲线是否恒定（恒定才整体丢弃）。
 * ★ 同 t 去重保留后者：t 越界钳到 0/1 后常与端点撞在一起，不去重会让表达式出现
 *   两段同 t 的区间（buildPiecewiseExpr 里除零兜底，但语义不明确）。
 */
const EASE_TYPES = new Set(['linear', 'in', 'out', 'inout', 'bezier']);

function normalizeBezier(v: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(v) || v.length !== 4) return undefined;
  const n = v.map((x) => Number(x));
  if (!n.every(Number.isFinite)) return undefined;
  // x 必须在 0~1（保证 x(t) 单调可反解）；y 放宽到 -1~2 以支持过冲回弹
  const cl = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  return [cl(n[0], 0, 1), cl(n[1], -1, 2), cl(n[2], 0, 1), cl(n[3], -1, 2)];
}

function normalizeKeyframes(v: unknown): ClipSegment['keyframes'] {
  if (!Array.isArray(v)) return undefined;
  const raw: NonNullable<ClipSegment['keyframes']> = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const rawT = numOr(m.t, NaN);
    if (!Number.isFinite(rawT)) continue;
    // t 越界钳到 0~1（用户/模型说 3s 超段时落端点，不整点丢弃）
    const t = Math.max(0, Math.min(1, rawT));
    const scale = m.scale == null ? undefined : Math.max(1, Math.min(3, numOr(m.scale, 1)));
    const offsetX = m.offsetX == null ? undefined : Math.max(-0.5, Math.min(0.5, numOr(m.offsetX, 0)));
    const offsetY = m.offsetY == null ? undefined : Math.max(-0.5, Math.min(0.5, numOr(m.offsetY, 0)));
    const opacity = m.opacity == null ? undefined : Math.max(0, Math.min(1, numOr(m.opacity, 1)));
    // 一个属性都没给的点没有意义（真正的"空点"）
    if (scale == null && offsetX == null && offsetY == null && opacity == null) continue;
    const easeRaw = String(m.ease ?? '').trim().toLowerCase();
    const ease = EASE_TYPES.has(easeRaw) ? (easeRaw as NonNullable<NonNullable<ClipSegment['keyframes']>[number]['ease']>) : undefined;
    const bezier = ease === 'bezier' ? normalizeBezier(m.bezier) : undefined;
    raw.push({
      t: Number(t.toFixed(4)),
      ...(scale != null ? { scale } : {}),
      ...(offsetX != null ? { offsetX } : {}),
      ...(offsetY != null ? { offsetY } : {}),
      ...(opacity != null ? { opacity } : {}),
      ...(ease ? { ease } : {}),
      ...(bezier ? { bezier } : {}),
    });
  }
  if (!raw.length) return undefined;

  // 同 t 去重（保留后者：稳定排序下即输入顺序靠后的那个）
  raw.sort((a, b) => a.t - b.t);
  const dedup: NonNullable<ClipSegment['keyframes']> = [];
  for (const p of raw) {
    const last = dedup[dedup.length - 1];
    if (last && Math.abs(last.t - p.t) < 1e-6) dedup[dedup.length - 1] = p;
    else dedup.push(p);
  }

  // 整条曲线恒定（缩放恒 1、无位移、透明度恒 1）→ 这些点不会产生任何画面变化
  const animates =
    dedup.some((p) => p.scale != null && Math.abs(p.scale - 1) > 0.001) ||
    dedup.some((p) => (p.offsetX != null && Math.abs(p.offsetX) > 0.001) || (p.offsetY != null && Math.abs(p.offsetY) > 0.001)) ||
    dedup.some((p) => p.opacity != null && p.opacity < 0.999);
  return animates ? dedup : undefined;
}

/**
 * 归一化速度曲线。返回 null = 不启用（点太少 / 曲线基本平直 —— 平直时切片只是白付编码）。
 * ★ 极值必须按注册表常量钳制：0 倍速会让输出时长无穷大，4 倍以上音轨已经没有可懂度。
 */
function normalizeSpeedCurve(v: unknown): ClipSegment['speedCurve'] | null {
  if (!Array.isArray(v)) return null;
  const pts: Array<{ t: number; speed: number }> = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    const t = numOr(m.t, NaN);
    const sp = numOr(m.speed, NaN);
    if (!Number.isFinite(t) || !Number.isFinite(sp)) continue;
    pts.push({ t: Math.max(0, Math.min(1, t)), speed: Math.max(SPEED_MIN, Math.min(SPEED_MAX, sp)) });
  }
  if (pts.length < 2) return null;
  pts.sort((a, b) => a.t - b.t);
  const dedup: Array<{ t: number; speed: number }> = [];
  for (const p of pts) {
    const last = dedup[dedup.length - 1];
    if (last && Math.abs(last.t - p.t) < 1e-6) dedup[dedup.length - 1] = p;
    else dedup.push(p);
  }
  if (dedup.length < 2 || speedCurveIsFlat(dedup)) return null;
  return dedup.map((p) => ({ t: Number(p.t.toFixed(4)), speed: Number(p.speed.toFixed(3)) }));
}

/**
 * 归一化特效参数。返回 null = 无需写字段（无参数 / 全部等于默认值）。
 * ★ 键必须来自效果注册表：拼错的键进不了表达式，却会让用户以为"我调了但没反应"。
 */
function normalizeFxParams(fxId: string, v: unknown): ClipSegment['fxParams'] | null {
  if (!fxId || !v || typeof v !== 'object' || Array.isArray(v)) return null;
  const defs = fxParamsOf(fxId);
  if (!defs.length) return null;
  const m = v as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const d of defs) {
    const raw = m[d.key];
    if (raw == null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const clamped = Number(Math.max(d.min, Math.min(d.max, n)).toFixed(4));
    if (Math.abs(clamped - d.default) > 1e-6) out[d.key] = clamped;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * 归一化手动调节。返回 null = 全默认（不写字段）。
 * ★ 值域按 ffmpeg 滤镜的安全区间收窄：越界值不会报错，只会让画面糊掉或爆掉（比报错更难查）。
 */
function normalizeAdjust(v: unknown): ClipSegment['adjust'] | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const pick = (key: string, lo: number, hi: number): number | undefined => {
    const raw = m[key];
    if (raw == null) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) return undefined;
    return Number(Math.max(lo, Math.min(hi, n)).toFixed(3));
  };
  const brightness = pick('brightness', -0.5, 0.5);
  const contrast = pick('contrast', 0.5, 1.8);
  const saturation = pick('saturation', 0, 2.5);
  const temperature = pick('temperature', -1, 1);
  const sharpness = pick('sharpness', 0, 1);
  const vignette = pick('vignette', 0, 1);
  // 与默认值等价的项不写：工程文件要能一眼看出"用户到底调了什么"
  const out = {
    ...(brightness != null && Math.abs(brightness) > 0.001 ? { brightness } : {}),
    ...(contrast != null && Math.abs(contrast - 1) > 0.001 ? { contrast } : {}),
    ...(saturation != null && Math.abs(saturation - 1) > 0.001 ? { saturation } : {}),
    ...(temperature != null && Math.abs(temperature) > 0.001 ? { temperature } : {}),
    ...(sharpness != null && sharpness > 0.001 ? { sharpness } : {}),
    ...(vignette != null && vignette > 0.001 ? { vignette } : {}),
  };
  return Object.keys(out).length ? out : null;
}

/**
 * 旋转角度归一化：只接受 90/180/270。
 * ★ 0/缺省 = 不旋转 → 不写字段（工程文件里不该出现无意义的 rotate:0）。
 */
function normalizeRotate(v: unknown): ClipSegment['rotate'] | undefined {
  const n = Number(v);
  return n === 90 || n === 180 || n === 270 ? n : undefined;
}

/** 镜像归一化：h/v/both；其它值视为"无"。 */
function normalizeFlip(v: unknown): ClipSegment['flip'] | undefined {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'h' || s === 'v' || s === 'both' ? s : undefined;
}

const KF_EASES = new Set(['linear', 'in', 'out', 'inout', 'bezier']);

/**
 * 归一化图层关键帧：只保留有意义的点（至少带一个值）。
 * ★ 值域钳制而不是丢弃：滑出画面/负数缩放这类脏值进 ffmpeg 会得到"看起来正常但不对"的
 *   滤镜表达式（表达式不报错），钳制是唯一能保证出片可预期的做法。
 */
function normalizeLayerKeyframes(v: unknown): LayerKfPoint[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LayerKfPoint[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const k = raw as Record<string, unknown>;
    const t = Number(k.t);
    if (!Number.isFinite(t)) continue;
    const pt: LayerKfPoint = { t: Number(Math.max(0, Math.min(1, t)).toFixed(3)) };
    const take = (key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', lo: number, hi: number) => {
      const n = Number(k[key]);
      if (!Number.isFinite(n)) return;
      pt[key] = Number(Math.max(lo, Math.min(hi, n)).toFixed(4));
    };
    take('x', -0.5, 0.5);
    take('y', -0.5, 0.5);
    take('scale', 0.05, 5);
    take('rotation', -180, 180);
    take('opacity', 0, 1);
    const hasVal = pt.x != null || pt.y != null || pt.scale != null || pt.rotation != null || pt.opacity != null;
    if (!hasVal) continue;
    const ease = String(k.ease ?? '').trim().toLowerCase();
    if (KF_EASES.has(ease)) pt.ease = ease as LayerKfPoint['ease'];
    if (Array.isArray(k.bezier) && k.bezier.length === 4 && k.bezier.every((n) => Number.isFinite(Number(n)))) {
      pt.bezier = k.bezier.map(Number) as [number, number, number, number];
    }
    out.push(pt);
  }
  return out.length ? out.sort((a, b) => a.t - b.t) : undefined;
}

/**
 * 归一化文字层静态变换（P0-2b）：值域与 normalizeLayerKeyframes 同一套。
 * ★ 等价默认值不写字段（x/y=0、scale=1、rotation=0、opacity=1）—— 工程文件要能一眼看出改了什么；
 *   全默认返回 null，调用方据此删除 transform 字段 → 该字幕回到 SRT 原渲染路径。
 */
function normalizeTextTransform(v: unknown): LayerTransform | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const take = (key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', lo: number, hi: number): number | undefined => {
    if (m[key] == null) return undefined;
    const n = Number(m[key]);
    if (!Number.isFinite(n)) return undefined;
    return Number(Math.max(lo, Math.min(hi, n)).toFixed(4));
  };
  const x = take('x', -0.5, 0.5);
  const y = take('y', -0.5, 0.5);
  const scale = take('scale', 0.05, 5);
  const rotation = take('rotation', -180, 180);
  const opacity = take('opacity', 0, 1);
  const out: LayerTransform = {
    ...(x != null && Math.abs(x) > 0.0001 ? { x } : {}),
    ...(y != null && Math.abs(y) > 0.0001 ? { y } : {}),
    ...(scale != null && Math.abs(scale - 1) > 0.0001 ? { scale } : {}),
    ...(rotation != null && Math.abs(rotation) > 0.0001 ? { rotation } : {}),
    ...(opacity != null && opacity < 0.999 ? { opacity } : {}),
  };
  return Object.keys(out).length ? out : null;
}

/** 归一化画中画条目（时间钳制到 0~总长，由调用方给 total；这里先做结构与值域）。 */
function normalizeOverlay(v: unknown, id: string): ClipOverlay | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const file = String(m.file ?? '').trim();
  const start = Math.max(0, numOr(m.start, 0));
  const end = numOr(m.end, 0);
  if (!file || !(end > start)) return null;
  const pos = String(m.pos ?? '').trim() || 'bottomright';
  const scale = Math.max(0.05, Math.min(1, numOr(m.scale, 0.35)));
  // ★ 混合模式只收注册表里的合法 id；非法值一律丢弃（回落普通覆盖）。
  //   静默变成"另一种混合"比不生效更难查，所以不做任何猜测性映射。
  const bm = m.blend == null ? null : blendModeOf(String(m.blend));
  const blend = bm && bm.id !== 'normal' ? bm.id : undefined;
  // 变换扩展（P0-2）：缺省不写字段，老工程的渲染/落盘形状不变
  const clampNum = (val: unknown, lo: number, hi: number): number | undefined => {
    if (val == null) return undefined;
    const n = Number(val);
    if (!Number.isFinite(n)) return undefined;
    return Number(Math.max(lo, Math.min(hi, n)).toFixed(4));
  };
  const x = clampNum(m.x, -0.5, 0.5);
  const y = clampNum(m.y, -0.5, 0.5);
  const rotation = clampNum(m.rotation, -180, 180);
  const opacity = clampNum(m.opacity, 0, 1);
  const keyframes = normalizeLayerKeyframes(m.keyframes);
  return {
    id, file, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), pos, scale,
    ...(blend ? { blend } : {}),
    ...(x != null ? { x } : {}),
    ...(y != null ? { y } : {}),
    ...(rotation != null && Math.abs(rotation) > 0.001 ? { rotation } : {}),
    ...(opacity != null && opacity < 0.999 ? { opacity } : {}),
    ...(keyframes ? { keyframes } : {}),
  };
}

/**
 * 归一化音频层（P0-7）。返回 null = 非法（缺素材或时间不成立）。
 * ★ 淡入淡出不能超过本段时长：`afade=t=out:st=` 若落在段尾之后，ffmpeg 不报错、只是**静默不生效**；
 *   钳到段长是唯一能让用户"调了就看得到"的做法。
 */
function normalizeAudio(v: unknown, id: string): ClipAudio | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const file = String(m.file ?? '').trim();
  const start = Math.max(0, numOr(m.start, 0));
  const end = numOr(m.end, 0);
  if (!file || !(end > start)) return null;
  const dur = end - start;
  const clampNum = (val: unknown, lo: number, hi: number): number | undefined => {
    if (val == null) return undefined;
    const n = Number(val);
    if (!Number.isFinite(n)) return undefined;
    return Number(Math.max(lo, Math.min(hi, n)).toFixed(3));
  };
  const volume = clampNum(m.volume, 0, 2);
  const fadeIn = clampNum(m.fadeIn, 0, Math.min(10, dur));
  const fadeOut = clampNum(m.fadeOut, 0, Math.min(10, dur));
  const trimStart = clampNum(m.trimStart, 0, 24 * 3600);
  return {
    id,
    file,
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
    ...(volume != null && Math.abs(volume - 1) > 0.001 ? { volume } : {}),
    ...(fadeIn != null && fadeIn > 0.001 ? { fadeIn } : {}),
    ...(fadeOut != null && fadeOut > 0.001 ? { fadeOut } : {}),
    ...(trimStart != null && trimStart > 0.001 ? { trimStart } : {}),
  };
}

/** 归一化贴纸层（P1-1）：值域与画中画一致，只是没有音轨/混合模式，缩放按画面宽度比例。 */
function normalizeSticker(v: unknown, id: string): ClipSticker | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  const file = String(m.file ?? '').trim();
  const start = Math.max(0, numOr(m.start, 0));
  const end = numOr(m.end, 0);
  if (!file || !(end > start)) return null;
  const clampNum = (val: unknown, lo: number, hi: number): number | undefined => {
    if (val == null) return undefined;
    const n = Number(val);
    if (!Number.isFinite(n)) return undefined;
    return Number(Math.max(lo, Math.min(hi, n)).toFixed(4));
  };
  const scale = Number(Math.max(0.02, Math.min(1, numOr(m.scale, 0.3))).toFixed(4));
  const x = clampNum(m.x, -0.5, 0.5);
  const y = clampNum(m.y, -0.5, 0.5);
  const rotation = clampNum(m.rotation, -180, 180);
  const opacity = clampNum(m.opacity, 0, 1);
  const keyframes = normalizeLayerKeyframes(m.keyframes);
  return {
    id, file,
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
    scale,
    ...(x != null ? { x } : {}),
    ...(y != null ? { y } : {}),
    ...(rotation != null && Math.abs(rotation) > 0.001 ? { rotation } : {}),
    ...(opacity != null && opacity < 0.999 ? { opacity } : {}),
    ...(keyframes ? { keyframes } : {}),
  };
}

/**
 * 归一化转场配置。返回 null = 无转场（第一段不需要转场，也没有"前一段"可接）。
 * ★ 只做范围钳制与字段白名单；type 的合法性由效果库校验（api-tool-executor），
 *   这里不引效果库以避免 services ↔ shared 的循环依赖。
 */
function normalizeTransition(v: unknown): ClipSegment['transition'] | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const m = v as Record<string, unknown>;
  const type = String(m.type ?? '').trim();
  if (!type || type === 'none') return null;
  const duration = typeof m.duration === 'number' ? Math.max(0.1, Math.min(5, m.duration)) : undefined;
  return { type, ...(duration != null ? { duration } : {}) };
}

function optionalPositive(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** 定位片段：按 id 优先，其次 1 基序号（用户说「第 2 段」时模型传 index=2）。 */
function locateClip(project: ClipProject, args: Record<string, unknown>): { idx: number } | { error: string } {
  const id = String(args.id ?? '').trim();
  if (id) {
    const idx = project.clips.findIndex((c) => c.id === id);
    if (idx < 0) return { error: `找不到片段 id=${id}（现有：${project.clips.map((c) => c.id).join(', ') || '无'}）` };
    return { idx };
  }
  const raw = Number(args.index);
  if (!Number.isFinite(raw)) return { error: '需要 id 或 index（片段序号，从 1 开始）' };
  const idx = Math.round(raw) - 1;
  if (idx < 0 || idx >= project.clips.length) {
    return { error: `片段序号越界：${raw}（当前共 ${project.clips.length} 段）` };
  }
  return { idx };
}

/** 定位字幕：同 locateClip 的规则。 */
function locateText(project: ClipProject, args: Record<string, unknown>): { idx: number } | { error: string } {  const id = String(args.id ?? '').trim();
  if (id) {
    const idx = project.texts.findIndex((t) => t.id === id);
    if (idx < 0) return { error: `找不到字幕 id=${id}（现有：${project.texts.map((t) => t.id).join(', ') || '无'}）` };
    return { idx };
  }
  const raw = Number(args.index);
  if (!Number.isFinite(raw)) return { error: '需要 id 或 index（字幕序号，从 1 开始）' };
  const idx = Math.round(raw) - 1;
  if (idx < 0 || idx >= project.texts.length) {
    return { error: `字幕序号越界：${raw}（当前共 ${project.texts.length} 条）` };
  }
  return { idx };
}

/** 定位画中画：按 id 优先，其次 1 基序号；返回 -1 = 没找到。 */
function locateOverlay(project: ClipProject, args: Record<string, unknown>): number {
  const overlays = project.overlays || [];
  const id = String(args.id ?? '').trim();
  if (id) return overlays.findIndex((o) => o.id === id);
  const raw = Number(args.index);
  if (!Number.isFinite(raw)) return -1;
  const idx = Math.round(raw) - 1;
  return idx >= 0 && idx < overlays.length ? idx : -1;
}

/** 定位音频层：按 id 优先，其次 1 基序号；返回 -1 = 没找到。 */
function locateAudio(project: ClipProject, args: Record<string, unknown>): number {
  const audios = project.audios || [];
  const id = String(args.id ?? '').trim();
  if (id) return audios.findIndex((a) => a.id === id);
  const raw = Number(args.index);
  if (!Number.isFinite(raw)) return -1;
  const idx = Math.round(raw) - 1;
  return idx >= 0 && idx < audios.length ? idx : -1;
}

/** 定位贴纸层：按 id 优先，其次 1 基序号；返回 -1 = 没找到。 */
function locateSticker(project: ClipProject, args: Record<string, unknown>): number {
  const list = project.stickers || [];
  const id = String(args.id ?? '').trim();
  if (id) return list.findIndex((s) => s.id === id);
  const raw = Number(args.index);
  if (!Number.isFinite(raw)) return -1;
  const idx = Math.round(raw) - 1;
  return idx >= 0 && idx < list.length ? idx : -1;
}

/** 字幕条目校验：时间必须成对且 end > start；文本非空。 */
function validateText(raw: Record<string, unknown>, fallback?: Partial<ClipText>): { ok: true; value: Omit<ClipText, 'id'> } | { ok: false; error: string } {
  const text = String(raw.text ?? fallback?.text ?? '').trim();
  if (!text) return { ok: false, error: '字幕 text 不能为空' };
  const start = numOr(raw.start ?? fallback?.start, 0);
  const end = numOr(raw.end ?? fallback?.end, 0);
  if (!(end > start)) {
    return { ok: false, error: `字幕时间无效：「${text}」start=${start} → end=${end}（需要 end > start）` };
  }
  const posRaw = String(raw.position ?? fallback?.position ?? '').trim().toLowerCase();
  const position = posRaw === 'center' || posRaw === 'top' || posRaw === 'bottom' ? (posRaw as ClipText['position']) : undefined;
  const dirRaw = String(raw.slideDirection ?? fallback?.slideDirection ?? '').trim().toLowerCase();
  const slideDirection =
    dirRaw === 'left' || dirRaw === 'right' || dirRaw === 'up' || dirRaw === 'down'
      ? (dirRaw as ClipText['slideDirection'])
      : undefined;
  // ★ transform/keyframes 用「显式给了才覆盖」：patch 里传 null/[] 即清除（回到 SRT 原路径）
  const transform = normalizeTextTransform(raw.transform !== undefined ? raw.transform : fallback?.transform);
  const keyframes = normalizeLayerKeyframes(raw.keyframes !== undefined ? raw.keyframes : fallback?.keyframes);
  const value: Omit<ClipText, 'id'> = {
    text, start, end,
    ...(String(raw.animation ?? fallback?.animation ?? '').trim()
      ? { animation: String(raw.animation ?? fallback?.animation).trim().toLowerCase() } : {}),
    ...(slideDirection ? { slideDirection } : {}),
    ...(raw.fontSizePx != null || fallback?.fontSizePx != null
      ? { fontSizePx: Math.max(6, Math.round(numOr(raw.fontSizePx ?? fallback?.fontSizePx, 88))) } : {}),
    ...(raw.color != null || fallback?.color != null ? { color: String(raw.color ?? fallback?.color) } : {}),
    ...(raw.outlineColor != null || fallback?.outlineColor != null
      ? { outlineColor: String(raw.outlineColor ?? fallback?.outlineColor) } : {}),
    ...(raw.outlinePx != null || fallback?.outlinePx != null
      ? { outlinePx: Math.max(0, Math.min(60, numOr(raw.outlinePx ?? fallback?.outlinePx, 12))) } : {}),
    ...(raw.backColor != null || fallback?.backColor != null
      ? { backColor: String(raw.backColor ?? fallback?.backColor) } : {}),
    ...(position ? { position } : {}),
    ...(raw.safeArea === true || fallback?.safeArea === true ? { safeArea: true } : {}),
    ...(transform ? { transform } : {}),
    ...(keyframes ? { keyframes } : {}),
  };
  return { ok: true, value };
}

/**
 * 应用一次剪辑操作。**纯函数**：输入工程 → 输出新工程（不改原对象）。
 *
 * op 一览：
 *   create / get            —— 工程元信息（create 可带 name 与 output）
 *   set_output {size,fps}   —— 改导出规格
 *   add_clip {clips:[...]}  —— 追加片段（可一次多段）
 *   update_clip {id|index, patch}
 *   remove_clip {id|index}
 *   move_clip {id|index, to}—— 挪到第 to 位（1 基）
 *   clear_clips
 *   add_text {texts:[...]}  —— 加字幕（单条也走数组，模型不必记两种形状）
 *   update_text {id|index, patch}
 *   remove_text {id|index}
 *   clear_texts
 *   set_bgm {file,volume,duck} / clear_bgm / set_audio_fx {fx:[...]}
 *   add_audio {audios:[{file,start,end,volume?,fadeIn?,fadeOut?,trimStart?}]}
 *     —— 定时音频层（转场音效 / 多段 BGM）；/ update_audio / remove_audio / clear_audios
 */
export function applyClipOp(
  base: ClipProject | null,
  op: string,
  args: Record<string, unknown>,
): ClipOpResult {
  const project: ClipProject = base
    ? {
        ...base,
        clips: [...base.clips],
        // ★ layers 一并拷贝：ops 继续操作 texts/overlays 视图，layers 镜像在
        //   writeClipProject（序列化边界）统一重建 —— op 层不逐 op 维护镜像，
        //   否则 20 个 op 每个都要记得同步，漏一个就漂移。
        layers: (base.layers || []).map((l) => ({
          ...l,
          ...(l.text ? { text: { ...l.text } } : {}),
          ...(l.transform ? { transform: { ...l.transform } } : {}),
        })),
        texts: [...base.texts],
        output: { ...base.output },
        ...(base.overlays ? { overlays: [...base.overlays] } : {}),
        ...(base.audios ? { audios: [...base.audios] } : {}),
        ...(base.stickers ? { stickers: [...base.stickers] } : {}),
      }
    : createEmptyProject();
  const touch = () => { project.updatedAt = Date.now(); };

  const action = String(op || '').trim().toLowerCase();
  switch (action) {
    case 'create': {
      const name = String(args.name ?? '').trim();
      if (name) project.name = name;
      const size = String(args.size ?? '').trim();
      if (size) {
        if (!/^\d{2,5}x\d{2,5}$/.test(size)) return { ok: false, error: `size 形如 1080x1920：${size}` };
        project.output.size = size;
      }
      if (args.fps != null) project.output.fps = Math.min(Math.max(Math.round(numOr(args.fps, 30)), 1), 120);
      if (args.quality != null) {
        const q = parseQuality(args.quality);
        if (!q) return { ok: false, error: `quality 只能是 low / std / high：${String(args.quality)}` };
        project.output.quality = q;
      }
      touch();
      return { ok: true, project, note: `工程「${project.name}」${base ? '已更新元信息' : '已创建'}（${project.output.size}@${project.output.fps}）` };
    }

    case 'get':
      return { ok: true, project, note: '工程已读取' };

    case 'set_output': {
      const size = String(args.size ?? '').trim();
      if (size) {
        if (!/^\d{2,5}x\d{2,5}$/.test(size)) return { ok: false, error: `size 形如 1080x1920：${size}` };
        project.output.size = size;
      }
      if (args.fps != null) project.output.fps = Math.min(Math.max(Math.round(numOr(args.fps, 30)), 1), 120);
      if (args.quality != null) {
        const q = parseQuality(args.quality);
        if (!q) return { ok: false, error: `quality 只能是 low / std / high：${String(args.quality)}` };
        project.output.quality = q;
      }
      touch();
      return { ok: true, project, note: `导出规格改为 ${project.output.size}@${project.output.fps}` };
    }

    case 'add_clip': {
      const raw = Array.isArray(args.clips) ? args.clips : [];
      if (!raw.length) return { ok: false, error: 'clips 必填且为非空数组（每项至少 { file }）' };
      const added: string[] = [];
      for (let i = 0; i < raw.length; i++) {
        const c = (raw[i] ?? {}) as Record<string, unknown>;
        const file = String(c.file ?? '').trim();
        if (!file) return { ok: false, error: `clips[${i}].file 必填（素材本机绝对路径）` };
        const trimStart = c.trimStart == null ? undefined : Math.max(0, numOr(c.trimStart, 0));
        const trimEnd = c.trimEnd == null ? undefined : Math.max(0, numOr(c.trimEnd, 0));
        if (trimStart != null && trimEnd != null && !(trimEnd > trimStart)) {
          return { ok: false, error: `clips[${i}] 裁剪区间无效：${trimStart}s → ${trimEnd}s` };
        }
        const speed = c.speed == null ? undefined : Math.min(Math.max(numOr(c.speed, 1), 0.25), 4);
        const speedCurve = normalizeSpeedCurve(c.speedCurve);
        const kb = c.kenburns as Record<string, unknown> | undefined;
        const mask = normalizeMask(c.mask);
        const transition = normalizeTransition(c.transition);
        const fadeIn = optionalPositive(c.fadeIn);
        const fadeOut = optionalPositive(c.fadeOut);
        const label = String(c.label ?? '').trim();
        const colorPreset = String(c.colorPreset ?? '').trim();
        // 特效 id 必须真实存在：写进一个拼错的 id 会让渲染"什么都没发生"却不报错
        const fxRaw = String(c.fx ?? '').trim().toLowerCase();
        const fx = FX_EFFECTS.some((e) => e.id === fxRaw) ? fxRaw : '';
        const fxParams = fx ? normalizeFxParams(fx, c.fxParams) : null;
        const audioFile = String(c.audioFile ?? '').trim();
        const crop = normalizeCrop(c.crop);
        const keyframes = normalizeKeyframes(c.keyframes);
        const rotate = normalizeRotate(c.rotate);
        const flip = normalizeFlip(c.flip);
        const adjust = normalizeAdjust(c.adjust);
        const csRaw = c.colorStrength == null ? NaN : Number(c.colorStrength);
        const colorStrength = Number.isFinite(csRaw) ? Math.max(0, Math.min(1, csRaw)) : undefined;
        const seg: ClipSegment = {
          id: nextId('c', project.clips),
          file,
          ...(label ? { label } : {}),
          ...(trimStart != null ? { trimStart } : {}),
          ...(trimEnd != null ? { trimEnd } : {}),
          ...(speed != null && !speedCurve && Math.abs(speed - 1) > 0.001 ? { speed } : {}),
          ...(speedCurve ? { speedCurve } : {}),
          ...(colorPreset ? { colorPreset: colorPreset.toLowerCase() } : {}),
          ...(colorStrength != null && Math.abs(colorStrength - 1) > 0.001 ? { colorStrength } : {}),
          ...(adjust ? { adjust } : {}),
          ...(fx ? { fx } : {}),
          ...(fxParams ? { fxParams } : {}),
          ...(fadeIn != null ? { fadeIn } : {}),
          ...(fadeOut != null ? { fadeOut } : {}),
          ...(kb ? { kenburns: { direction: kb.direction === 'out' ? 'out' : kb.direction === 'none' ? 'none' : 'in', duration: Math.max(1, numOr(kb.duration, 6)) } } : {}),
          ...(mask ? { mask } : {}),
          ...(transition ? { transition } : {}),
          ...(audioFile ? { audioFile } : {}),
          ...(c.keepOriginalAudio === true ? { keepOriginalAudio: true } : {}),
          ...(c.volume != null ? { volume: Math.max(0, numOr(c.volume, 1)) } : {}),
          ...(crop ? { crop } : {}),
          ...(keyframes ? { keyframes } : {}),
          ...(c.reverse === true ? { reverse: true } : {}),
          ...(rotate ? { rotate } : {}),
          ...(flip ? { flip } : {}),
        };
        project.clips.push(seg);
        added.push(seg.id);
      }
      touch();
      return { ok: true, project, note: `已追加 ${added.length} 段（${added.join(', ')}），当前共 ${project.clips.length} 段` };
    }

    case 'update_clip': {
      const loc = locateClip(project, args);
      if ('error' in loc) return { ok: false, error: loc.error };
      const cur = project.clips[loc.idx];
      const patch = (args.patch && typeof args.patch === 'object' ? args.patch : args) as Record<string, unknown>;
      // 允许 1 基序号定位后不传参数？不允许 —— 静默无变更等于骗人。
      const KEYS = ['file', 'label', 'trimStart', 'trimEnd', 'speed', 'colorPreset', 'colorStrength', 'adjust', 'fx', 'fxParams', 'fadeIn', 'fadeOut', 'kenburns', 'mask', 'transition', 'audioFile', 'keepOriginalAudio', 'volume', 'crop', 'keyframes', 'reverse', 'rotate', 'flip'];
      if (!KEYS.some((k) => patch[k] !== undefined)) {
        return { ok: false, error: `update_clip 至少要改一个字段：${KEYS.join(' / ')}` };
      }
      const next: ClipSegment = { ...cur };
      if (patch.file !== undefined) {
        const f = String(patch.file).trim();
        if (!f) return { ok: false, error: 'file 不能改成空' };
        next.file = f;
      }
      if (patch.label !== undefined) next.label = String(patch.label).trim() || undefined;
      if (patch.trimStart !== undefined) next.trimStart = Math.max(0, numOr(patch.trimStart, 0));
      if (patch.trimEnd !== undefined) next.trimEnd = Math.max(0, numOr(patch.trimEnd, 0));
      if (next.trimStart != null && next.trimEnd != null && !(next.trimEnd > next.trimStart)) {
        return { ok: false, error: `裁剪区间无效：${next.trimStart}s → ${next.trimEnd}s（需要 trimEnd > trimStart）` };
      }
      if (patch.speed !== undefined) {
        const sp = Math.min(Math.max(numOr(patch.speed, 1), 0.25), 4);
        if (Math.abs(sp - 1) < 0.001) delete next.speed; else next.speed = sp;
        // 恒定倍速与曲线互斥：设了倍速就清掉曲线
        if (patch.speedCurve === undefined) delete next.speedCurve;
      }
      if (patch.speedCurve !== undefined) {
        const sc = normalizeSpeedCurve(patch.speedCurve);
        if (sc) { next.speedCurve = sc; delete next.speed; } else delete next.speedCurve;
      }
      if (patch.colorPreset !== undefined) {
        const cp = String(patch.colorPreset).trim().toLowerCase();
        if (cp) next.colorPreset = cp; else delete next.colorPreset;
      }
      if (patch.colorStrength !== undefined) {
        const n = Number(patch.colorStrength);
        if (Number.isFinite(n) && Math.abs(n - 1) > 0.001) next.colorStrength = Math.max(0, Math.min(1, n));
        else delete next.colorStrength;
      }
      if (patch.adjust !== undefined) {
        const a = normalizeAdjust(patch.adjust);
        if (a) next.adjust = a; else delete next.adjust;
      }
      if (patch.fx !== undefined) {
        const fx = String(patch.fx).trim().toLowerCase();
        if (!fx) delete next.fx;
        // ★ 未知 id 直接报错（不静默忽略）：模型拼错时必须让它自己看到可选清单，
        //   否则用户会得到一条"看起来加了特效、其实没加"的片子。
        else if (!FX_EFFECTS.some((e) => e.id === fx)) {
          return { ok: false, error: `未知特效：${fx}（可选：${FX_EFFECTS.map((e) => e.id).join(' / ')}）` };
        } else next.fx = fx;
      }
      // 特效参数：换了特效要重算（旧参数属于旧特效）；只改参数时按新 id 归一化
      if (patch.fx !== undefined || patch.fxParams !== undefined) {
        const p = normalizeFxParams(next.fx || '', patch.fxParams !== undefined ? patch.fxParams : next.fxParams);
        if (p) next.fxParams = p; else delete next.fxParams;
      }
      if (patch.fadeIn !== undefined) { const v = optionalPositive(patch.fadeIn); if (v == null) delete next.fadeIn; else next.fadeIn = v; }
      if (patch.fadeOut !== undefined) { const v = optionalPositive(patch.fadeOut); if (v == null) delete next.fadeOut; else next.fadeOut = v; }
      if (patch.kenburns !== undefined) {
        const kb = patch.kenburns as Record<string, unknown> | null;
        if (kb && typeof kb === 'object') next.kenburns = { direction: kb.direction === 'out' ? 'out' : kb.direction === 'none' ? 'none' : 'in', duration: Math.max(1, numOr(kb.duration, 6)) };
        else delete next.kenburns;
      }
      if (patch.mask !== undefined) {
        const m = normalizeMask(patch.mask);
        if (m) next.mask = m; else delete next.mask;
      }
      if (patch.transition !== undefined) {
        const tr = normalizeTransition(patch.transition);
        if (tr) next.transition = tr; else delete next.transition;
      }
      if (patch.audioFile !== undefined) {
        const a = String(patch.audioFile).trim();
        if (a) next.audioFile = a; else delete next.audioFile;
      }
      if (patch.keepOriginalAudio !== undefined) {
        if (patch.keepOriginalAudio === true) next.keepOriginalAudio = true; else delete next.keepOriginalAudio;
      }
      if (patch.volume !== undefined) {
        const v = Math.max(0, numOr(patch.volume, 1));
        if (Math.abs(v - 1) < 0.001) delete next.volume; else next.volume = v;
      }
      if (patch.crop !== undefined) {
        const cr = normalizeCrop(patch.crop);
        if (cr) next.crop = cr; else delete next.crop;
      }
      if (patch.keyframes !== undefined) {
        const kf = normalizeKeyframes(patch.keyframes);
        if (kf) next.keyframes = kf; else delete next.keyframes;
      }
      if (patch.reverse !== undefined) {
        if (patch.reverse === true) next.reverse = true; else delete next.reverse;
      }
      if (patch.rotate !== undefined) {
        const r = normalizeRotate(patch.rotate);
        if (r) next.rotate = r; else delete next.rotate;
      }
      if (patch.flip !== undefined) {
        const f = normalizeFlip(patch.flip);
        if (f) next.flip = f; else delete next.flip;
      }
      project.clips[loc.idx] = next;
      touch();
      return { ok: true, project, note: `片段 ${next.id} 已更新` };
    }

    case 'remove_clip': {
      const loc = locateClip(project, args);
      if ('error' in loc) return { ok: false, error: loc.error };
      const [gone] = project.clips.splice(loc.idx, 1);
      touch();
      return { ok: true, project, note: `已删除片段 ${gone.id}（剩 ${project.clips.length} 段）` };
    }

    case 'move_clip': {
      const loc = locateClip(project, args);
      if ('error' in loc) return { ok: false, error: loc.error };
      const to = Math.round(numOr(args.to, 0));
      if (to < 1 || to > project.clips.length) {
        return { ok: false, error: `to 越界：${to}（只能在 1~${project.clips.length}）` };
      }
      const [seg] = project.clips.splice(loc.idx, 1);
      project.clips.splice(to - 1, 0, seg);
      touch();
      return { ok: true, project, note: `片段 ${seg.id} 已移到第 ${to} 位` };
    }

    case 'clear_clips':
      project.clips = [];
      touch();
      return { ok: true, project, note: '视频轨已清空' };

    case 'add_text': {
      const raw = Array.isArray(args.texts) ? args.texts : [];
      if (!raw.length) return { ok: false, error: 'texts 必填且为非空数组（每项 { text, start, end }）' };
      const added: string[] = [];
      for (let i = 0; i < raw.length; i++) {
        const v = validateText((raw[i] ?? {}) as Record<string, unknown>);
        if (!v.ok) return { ok: false, error: `texts[${i}]：${v.error}` };
        const item: ClipText = { id: nextId('t', project.texts), ...v.value };
        project.texts.push(item);
        added.push(item.id);
      }
      touch();
      return { ok: true, project, note: `已加 ${added.length} 条字幕（${added.join(', ')}），当前共 ${project.texts.length} 条` };
    }

    case 'update_text': {
      const loc = locateText(project, args);
      if ('error' in loc) return { ok: false, error: loc.error };
      const cur = project.texts[loc.idx];
      const patch = (args.patch && typeof args.patch === 'object' ? args.patch : args) as Record<string, unknown>;
      const merged = { ...cur, ...patch };
      const v = validateText(merged as Record<string, unknown>, cur);
      if (!v.ok) return { ok: false, error: v.error };
      const next: ClipText = { id: cur.id, ...v.value };
      project.texts[loc.idx] = next;
      touch();
      return { ok: true, project, note: `字幕 ${next.id} 已更新` };
    }

    case 'remove_text': {
      const loc = locateText(project, args);
      if ('error' in loc) return { ok: false, error: loc.error };
      const [gone] = project.texts.splice(loc.idx, 1);
      touch();
      return { ok: true, project, note: `已删除字幕 ${gone.id}（剩 ${project.texts.length} 条）` };
    }

    case 'clear_texts':
      project.texts = [];
      touch();
      return { ok: true, project, note: '字幕轨已清空' };

    case 'set_bgm': {
      const file = String(args.file ?? '').trim();
      if (file) {
        project.bgm = {
          file,
          volume: args.volume == null ? 0.25 : Math.min(Math.max(numOr(args.volume, 0.25), 0), 1),
          duck: args.duck === true,
        };
      } else if (project.bgm) {
        // 只调音量/闪避时允许不重传文件
        project.bgm = {
          ...project.bgm,
          volume: args.volume == null ? project.bgm.volume : Math.min(Math.max(numOr(args.volume, project.bgm.volume), 0), 1),
          duck: args.duck == null ? project.bgm.duck : args.duck === true,
        };
      } else {
        return { ok: false, error: '还没有 BGM：首次设置必须给 file（音频绝对路径）' };
      }
      touch();
      return { ok: true, project, note: `BGM 已设置（音量 ${project.bgm.volume}${project.bgm.duck ? '，说话自动压低' : ''}）` };
    }

    case 'set_audio_fx': {
      const raw = Array.isArray(args.fx) ? args.fx.map((x) => String(x).trim()).filter(Boolean) : null;
      if (raw === null) return { ok: false, error: 'fx 必填且为数组（音效 id 列表，按顺序串联；传空数组=清除）' };
      if (!raw.length) { delete project.audioFx; touch(); return { ok: true, project, note: '已清除音效链' }; }
      if (raw.length > 4) return { ok: false, error: `音效最多串联 4 个（当前 ${raw.length} 个）：音效叠加过多会互相污染，听感反而更差` };
      project.audioFx = raw;
      touch();
      return { ok: true, project, note: `音效链已设置（${raw.length} 个：${raw.join(' → ')}）` };
    }

    case 'add_overlay': {
      const raw = Array.isArray(args.overlays) ? args.overlays : [args];
      const added: string[] = [];
      for (let i = 0; i < raw.length; i++) {
        const ov = normalizeOverlay(raw[i], nextId('o', project.overlays || []));
        if (!ov) return { ok: false, error: `overlays[${i}] 非法：需要 file + end > start` };
        if (!project.overlays) project.overlays = [];
        // id 按当前数组取号后重算（循环内逐个 push，避免撞号）
        ov.id = nextId('o', project.overlays);
        project.overlays.push(ov);
        added.push(ov.id);
      }
      touch();
      return { ok: true, project, note: `已加 ${added.length} 个画中画（${added.join(', ')}）` };
    }

    case 'update_overlay': {
      if (!project.overlays?.length) return { ok: false, error: '工程里还没有画中画' };
      const idx = locateOverlay(project, args);
      if (idx < 0) return { ok: false, error: `找不到画中画（现有：${project.overlays.map((o) => o.id).join(', ')}）` };
      const patch = (args.patch && typeof args.patch === 'object' ? args.patch : args) as Record<string, unknown>;
      const merged = normalizeOverlay({ ...project.overlays[idx], ...patch }, project.overlays[idx].id);
      if (!merged) return { ok: false, error: 'update_overlay 结果非法（file 不能清空；end 必须大于 start）' };
      project.overlays[idx] = merged;
      touch();
      return { ok: true, project, note: `画中画 ${merged.id} 已更新` };
    }

    case 'remove_overlay': {
      if (!project.overlays?.length) return { ok: false, error: '工程里还没有画中画' };
      const idx = locateOverlay(project, args);
      if (idx < 0) return { ok: false, error: `找不到画中画（现有：${project.overlays.map((o) => o.id).join(', ')}）` };
      const [gone] = project.overlays.splice(idx, 1);
      if (!project.overlays.length) delete project.overlays;
      touch();
      return { ok: true, project, note: `已删除画中画 ${gone.id}` };
    }

    case 'add_audio': {
      const raw = Array.isArray(args.audios) ? args.audios : [args];
      const added: string[] = [];
      for (let i = 0; i < raw.length; i++) {
        if (!project.audios) project.audios = [];
        const item = normalizeAudio(raw[i], '');
        if (!item) return { ok: false, error: `audios[${i}] 非法：需要 file + end > start（start/end 相对成片）` };
        // id 按当前数组重新取号，避免同一批里撞号
        item.id = nextId('a', project.audios);
        project.audios.push(item);
        added.push(item.id);
      }
      touch();
      return { ok: true, project, note: `已加 ${added.length} 段音频（${added.join(', ')}）` };
    }

    case 'update_audio': {
      if (!project.audios?.length) return { ok: false, error: '工程里还没有音频层' };
      const idx = locateAudio(project, args);
      if (idx < 0) return { ok: false, error: `找不到音频层（现有：${project.audios.map((a) => a.id).join(', ')}）` };
      const patch = (args.patch && typeof args.patch === 'object' ? args.patch : args) as Record<string, unknown>;
      const merged = normalizeAudio({ ...project.audios[idx], ...patch }, project.audios[idx].id);
      if (!merged) return { ok: false, error: 'update_audio 结果非法（file 不能清空；end 必须大于 start）' };
      project.audios[idx] = merged;
      touch();
      return { ok: true, project, note: `音频 ${merged.id} 已更新` };
    }

    case 'remove_audio': {
      if (!project.audios?.length) return { ok: false, error: '工程里还没有音频层' };
      const idx = locateAudio(project, args);
      if (idx < 0) return { ok: false, error: `找不到音频层（现有：${project.audios.map((a) => a.id).join(', ')}）` };
      const [gone] = project.audios.splice(idx, 1);
      if (!project.audios.length) delete project.audios;
      touch();
      return { ok: true, project, note: `已删除音频 ${gone.id}` };
    }

    case 'clear_audios':
      delete project.audios;
      touch();
      return { ok: true, project, note: '音频层已清空' };

    case 'add_sticker': {
      const raw = Array.isArray(args.stickers) ? args.stickers : [args];
      const added: string[] = [];
      for (let i = 0; i < raw.length; i++) {
        if (!project.stickers) project.stickers = [];
        const item = normalizeSticker(raw[i], '');
        if (!item) return { ok: false, error: `stickers[${i}] 非法：需要 file（PNG/WebP）+ end > start` };
        item.id = nextId('s', project.stickers);
        project.stickers.push(item);
        added.push(item.id);
      }
      touch();
      return { ok: true, project, note: `已加 ${added.length} 个贴纸（${added.join(', ')}）` };
    }

    case 'update_sticker': {
      if (!project.stickers?.length) return { ok: false, error: '工程里还没有贴纸' };
      const idx = locateSticker(project, args);
      if (idx < 0) return { ok: false, error: `找不到贴纸（现有：${project.stickers.map((s) => s.id).join(', ')}）` };
      const patch = (args.patch && typeof args.patch === 'object' ? args.patch : args) as Record<string, unknown>;
      const merged = normalizeSticker({ ...project.stickers[idx], ...patch }, project.stickers[idx].id);
      if (!merged) return { ok: false, error: 'update_sticker 结果非法（file 不能清空；end 必须大于 start）' };
      project.stickers[idx] = merged;
      touch();
      return { ok: true, project, note: `贴纸 ${merged.id} 已更新` };
    }

    case 'remove_sticker': {
      if (!project.stickers?.length) return { ok: false, error: '工程里还没有贴纸' };
      const idx = locateSticker(project, args);
      if (idx < 0) return { ok: false, error: `找不到贴纸（现有：${project.stickers.map((s) => s.id).join(', ')}）` };
      const [gone] = project.stickers.splice(idx, 1);
      if (!project.stickers.length) delete project.stickers;
      touch();
      return { ok: true, project, note: `已删除贴纸 ${gone.id}` };
    }

    case 'clear_stickers':
      delete project.stickers;
      touch();
      return { ok: true, project, note: '贴纸层已清空' };

    case 'clear_bgm':
      delete project.bgm;
      touch();
      return { ok: true, project, note: 'BGM 已移除' };

    default:
      return {
        ok: false,
        error:
          `未知 op：${op}。可选：create / get / set_output / add_clip / update_clip / remove_clip / ` +
          `move_clip / clear_clips / add_text / update_text / remove_text / clear_texts / set_bgm / clear_bgm / ` +
          `add_overlay / update_overlay / remove_overlay / add_audio / update_audio / remove_audio / clear_audios / ` +
          `add_sticker / update_sticker / remove_sticker / clear_stickers`,
      };
  }
}

/**
 * 下一段音频的默认落点（秒）：接在**最后一条音频层**之后；没有音频层就从 0 开始。
 * ★ 用途是 P1-8 的 add_tts：多句旁白连续调用时自然首尾相接，调用方不必自己累加时长
 *   （模型手算时长必错，而且错了不报错，只是"配音压在前面一句上"）。
 */
export function nextAudioSlot(project: ClipProject): number {
  return (project.audios || []).reduce((m, a) => Math.max(m, a.end), 0);
}

/**
 * 摘要工程（给模型看的紧凑视图，别把整份 json 塞进上下文）。
 * 时间轴用「累计起止」表示，模型据此推算字幕时间，不必自己累加各段时长。
 */
export function summarizeProject(p: ClipProject, durations: Record<string, number> = {}): Record<string, unknown> {
  let cursor = 0;
  const clips = p.clips.map((c, i) => {
    const raw = durations[c.id] ?? durations[c.file] ?? 0;
    let dur = raw;
    if (raw > 0) {
      const ts = c.trimStart ?? 0;
      const te = Math.min(c.trimEnd ?? raw, raw); // 与 segmentDuration 同口径：裁剪不越界
      dur = Math.max(0, te - ts) / (c.speed ?? 1);
    }
    const start = cursor;
    cursor += dur;
    return {
      index: i + 1,
      id: c.id,
      label: c.label || c.file.split(/[\\/]/).pop(),
      file: c.file,
      ...(dur > 0 ? { timelineStart: Number(start.toFixed(2)), timelineEnd: Number(cursor.toFixed(2)), duration: Number(dur.toFixed(2)) } : {}),
      ...(c.trimStart != null ? { trimStart: c.trimStart } : {}),
      ...(c.trimEnd != null ? { trimEnd: c.trimEnd } : {}),
      ...(c.speed ? { speed: c.speed } : {}),
      ...(c.speedCurve ? { speedCurve: c.speedCurve } : {}),
      ...(c.colorPreset ? { colorPreset: c.colorPreset } : {}),
      ...(c.colorStrength != null ? { colorStrength: c.colorStrength } : {}),
      ...(c.adjust ? { adjust: c.adjust } : {}),
      ...(c.fx ? { fx: c.fx } : {}),
      ...(c.fxParams ? { fxParams: c.fxParams } : {}),
      ...(c.fadeIn ? { fadeIn: c.fadeIn } : {}),
      ...(c.fadeOut ? { fadeOut: c.fadeOut } : {}),
      ...(c.kenburns ? { kenburns: c.kenburns } : {}),
      ...(c.audioFile ? { audioFile: c.audioFile } : {}),
      ...(c.keepOriginalAudio ? { keepOriginalAudio: true } : {}),
      ...(c.volume != null ? { volume: c.volume } : {}),
      ...(c.crop ? { crop: c.crop } : {}),
      ...(c.keyframes ? { keyframes: c.keyframes } : {}),
      ...(c.reverse ? { reverse: true } : {}),
      ...(c.rotate ? { rotate: c.rotate } : {}),
      ...(c.flip ? { flip: c.flip } : {}),
    };
  });
  return {
    name: p.name,
    output: p.output,
    totalDuration: Number(cursor.toFixed(2)),
    clipCount: p.clips.length,
    clips,
    texts: p.texts.map((t, i) => ({ index: i + 1, ...t })),
    ...(p.bgm ? { bgm: p.bgm } : {}),
    ...(p.overlays?.length ? { overlays: p.overlays.map((o, i) => ({ index: i + 1, ...o })) } : {}),
    ...(p.audios?.length ? { audios: p.audios.map((a, i) => ({ index: i + 1, ...a })) } : {}),
    ...(p.stickers?.length ? { stickers: p.stickers.map((s, i) => ({ index: i + 1, ...s })) } : {}),
  };
}