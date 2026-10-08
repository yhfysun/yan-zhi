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
  /** 调色预设（warm/cool/bw/vintage/vivid/film/fade） */
  colorPreset?: string;
  /** 画面淡入秒（相对该段起点） */
  fadeIn?: number;
  /** 画面淡出秒（相对该段终点） */
  fadeOut?: number;
  /** 静态图片运镜（图片素材专属） */
  kenburns?: { direction: 'in' | 'out'; duration: number };
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
  }>;
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
}

export interface ClipProject {
  version: 1;
  name: string;
  updatedAt: number;
  output: { size: string; fps: number };
  /** 视频轨：按数组顺序首尾相接 */
  clips: ClipSegment[];
  /** 字幕轨：时间相对成片 */
  texts: ClipText[];
  /**
   * 音效链（整片，按数组顺序串联）。
   * ★ 放"整片"而不是每段：降噪/响度归一这类是**工程级标准化**（多段素材音量忽大忽小，
   *   逐段处理反而会在段落交界处出现响度台阶）；而变声/混响这类也是整片统一更省事。
   *   需要逐段不同音效时用 media_edit 单独处理该段再当素材用。
   */
  audioFx?: string[];
  /** 背景音乐（整片） */
  bgm?: { file: string; volume: number; duck: boolean };
  /** 画中画叠加轨（时间相对成片；按数组顺序叠加，后叠的在上层） */
  overlays?: ClipOverlay[];
}

const DEFAULT_OUTPUT = { size: '1080x1920', fps: 30 };

export function createEmptyProject(name = '未命名剪辑'): ClipProject {
  return {
    version: 1,
    name,
    updatedAt: Date.now(),
    output: { ...DEFAULT_OUTPUT },
    clips: [],
    texts: [],
  };
}

/** 生成可读且确定性的 id：c1/c2… t1/t2… o1/o2…（从现有最大序号 +1，删了中间项也不会撞号）。 */
function nextId(prefix: 'c' | 't' | 'o', existing: Array<{ id: string }>): string {
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
 * ★ 每个点必须有 t（0~1）且至少带一个属性；scale=1 且无其它属性的点视为无意义，丢弃。
 */
function normalizeKeyframes(v: unknown): ClipSegment['keyframes'] {
  if (!Array.isArray(v)) return undefined;
  const out: NonNullable<ClipSegment['keyframes']> = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    const rawT = numOr(m.t, NaN);
    if (!Number.isFinite(rawT)) continue;
    // t 越界钳到 0~1（用户/模型说 3s 超段时落端点，不整点丢弃）
    const t = Math.max(0, Math.min(1, rawT));
    const scale = m.scale == null ? undefined : Math.max(1, Math.min(3, numOr(m.scale, 1)));
    const offsetX = m.offsetX == null ? undefined : Math.max(-0.5, Math.min(0.5, numOr(m.offsetX, 0)));
    const offsetY = m.offsetY == null ? undefined : Math.max(-0.5, Math.min(0.5, numOr(m.offsetY, 0)));
    const opacity = m.opacity == null ? undefined : Math.max(0, Math.min(1, numOr(m.opacity, 1)));
    const meaningful = (scale != null && Math.abs(scale - 1) > 0.001) ||
      (offsetX != null && Math.abs(offsetX) > 0.001) || (offsetY != null && Math.abs(offsetY) > 0.001) ||
      (opacity != null && opacity < 0.999);
    if (!meaningful) continue;
    out.push({ t: Number(t.toFixed(4)), ...(scale != null ? { scale } : {}), ...(offsetX != null ? { offsetX } : {}), ...(offsetY != null ? { offsetY } : {}), ...(opacity != null ? { opacity } : {}) });
  }
  return out.length ? out.sort((a, b) => a.t - b.t) : undefined;
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
  return { id, file, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), pos, scale };
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
 */
export function applyClipOp(
  base: ClipProject | null,
  op: string,
  args: Record<string, unknown>,
): ClipOpResult {
  const project: ClipProject = base
    ? { ...base, clips: [...base.clips], texts: [...base.texts], output: { ...base.output }, ...(base.overlays ? { overlays: [...base.overlays] } : {}) }
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
        const kb = c.kenburns as Record<string, unknown> | undefined;
        const mask = normalizeMask(c.mask);
        const transition = normalizeTransition(c.transition);
        const fadeIn = optionalPositive(c.fadeIn);
        const fadeOut = optionalPositive(c.fadeOut);
        const label = String(c.label ?? '').trim();
        const colorPreset = String(c.colorPreset ?? '').trim();
        const audioFile = String(c.audioFile ?? '').trim();
        const crop = normalizeCrop(c.crop);
        const keyframes = normalizeKeyframes(c.keyframes);
        const seg: ClipSegment = {
          id: nextId('c', project.clips),
          file,
          ...(label ? { label } : {}),
          ...(trimStart != null ? { trimStart } : {}),
          ...(trimEnd != null ? { trimEnd } : {}),
          ...(speed != null && Math.abs(speed - 1) > 0.001 ? { speed } : {}),
          ...(colorPreset ? { colorPreset: colorPreset.toLowerCase() } : {}),
          ...(fadeIn != null ? { fadeIn } : {}),
          ...(fadeOut != null ? { fadeOut } : {}),
          ...(kb ? { kenburns: { direction: kb.direction === 'out' ? 'out' : 'in', duration: Math.max(1, numOr(kb.duration, 6)) } } : {}),
          ...(mask ? { mask } : {}),
          ...(transition ? { transition } : {}),
          ...(audioFile ? { audioFile } : {}),
          ...(c.keepOriginalAudio === true ? { keepOriginalAudio: true } : {}),
          ...(c.volume != null ? { volume: Math.max(0, numOr(c.volume, 1)) } : {}),
          ...(crop ? { crop } : {}),
          ...(keyframes ? { keyframes } : {}),
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
      const KEYS = ['file', 'label', 'trimStart', 'trimEnd', 'speed', 'colorPreset', 'fadeIn', 'fadeOut', 'kenburns', 'mask', 'transition', 'audioFile', 'keepOriginalAudio', 'volume', 'crop', 'keyframes'];
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
      }
      if (patch.colorPreset !== undefined) {
        const cp = String(patch.colorPreset).trim().toLowerCase();
        if (cp) next.colorPreset = cp; else delete next.colorPreset;
      }
      if (patch.fadeIn !== undefined) { const v = optionalPositive(patch.fadeIn); if (v == null) delete next.fadeIn; else next.fadeIn = v; }
      if (patch.fadeOut !== undefined) { const v = optionalPositive(patch.fadeOut); if (v == null) delete next.fadeOut; else next.fadeOut = v; }
      if (patch.kenburns !== undefined) {
        const kb = patch.kenburns as Record<string, unknown> | null;
        if (kb && typeof kb === 'object') next.kenburns = { direction: kb.direction === 'out' ? 'out' : 'in', duration: Math.max(1, numOr(kb.duration, 6)) };
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
          `add_overlay / update_overlay / remove_overlay`,
      };
  }
}

/**
 * 工程摘要（给模型看的紧凑视图，别把整份 json 塞进上下文）。
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
      ...(c.colorPreset ? { colorPreset: c.colorPreset } : {}),
      ...(c.fadeIn ? { fadeIn: c.fadeIn } : {}),
      ...(c.fadeOut ? { fadeOut: c.fadeOut } : {}),
      ...(c.kenburns ? { kenburns: c.kenburns } : {}),
      ...(c.audioFile ? { audioFile: c.audioFile } : {}),
      ...(c.keepOriginalAudio ? { keepOriginalAudio: true } : {}),
      ...(c.volume != null ? { volume: c.volume } : {}),
      ...(c.crop ? { crop: c.crop } : {}),
      ...(c.keyframes ? { keyframes: c.keyframes } : {}),
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
  };
}