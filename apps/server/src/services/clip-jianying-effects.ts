// 我们的效果 id → 剪映内置资源（resource_id / effect_id）。
//
// 数据源：pyJianYingDraft 0.3.1 的 metadata（Apache-2.0，2026-10 版）。
// ★ 只收**免费**资源：剪映的付费特效对非会员可能锁定/加载失败，宁可不映射也不要生成坏草稿。
// ★ 语义是「近似对齐」：我们的预设是 ffmpeg 自定义参数，剪映的是平台滤镜/特效，
//   观感不会逐像素一致；参数（强度/幅度）只映射能对应上的，映射不上的用剪映默认值并写 warning。
// ★ 剪映打开草稿时会按需下载未缓存资源 —— 首次打开个别效果可能短暂显示“加载中/加载失败”，
//   这是剪映的下载行为，不是草稿损坏。

export interface JyRef {
  /** 剪映里的效果名（排障时按名字找） */
  name: string;
  /** 资源 id（素材/资源包） */
  resourceId: string;
  /** 效果 id（剪映效果面板的 id） */
  effectId: string;
}

export interface JyTransitionRef extends JyRef {
  /** 与上一段是否重叠（剪映 TransitionMeta.is_overlap） */
  isOverlap: boolean;
  /** 剪映默认时长（秒） */
  defaultDurationSec: number;
}

/** 调色预设：kind=filter 走剪映滤镜（materials.effects），kind=effect 走视频特效（materials.video_effects）。 */
export interface JyColorRef extends JyRef {
  kind: 'filter' | 'effect';
}

/** 转场（挂在前一段上；剪映的语义与 pyJianYingDraft 一致） */
export const JY_TRANSITIONS: Record<string, JyTransitionRef> = {
  fade: { name: '叠化', resourceId: '6724845717472416269', effectId: '322577', isOverlap: true, defaultDurationSec: 0.5 },
  dissolve: { name: '色彩溶解', resourceId: '6724846004274729480', effectId: '322583', isOverlap: true, defaultDurationSec: 0.5 },
  fadeblack: { name: '闪黑', resourceId: '6724239388189921806', effectId: '321493', isOverlap: false, defaultDurationSec: 0.5 },
  fadewhite: { name: '闪白', resourceId: '6724845376098013708', effectId: '322575', isOverlap: false, defaultDurationSec: 0.5 },
  wipeleft: { name: '向左擦除', resourceId: '6724849999336706573', effectId: '2917283', isOverlap: true, defaultDurationSec: 0.5 },
  wiperight: { name: '向右擦除', resourceId: '6724849898857959950', effectId: '2917284', isOverlap: true, defaultDurationSec: 0.5 },
  wipeup: { name: '向上擦除', resourceId: '6724849456891564557', effectId: '2917281', isOverlap: true, defaultDurationSec: 0.5 },
  wipedown: { name: '向下擦除', resourceId: '6724849752921346573', effectId: '2917282', isOverlap: true, defaultDurationSec: 0.5 },
  slideleft: { name: '左移', resourceId: '6726711499676455435', effectId: '2917286', isOverlap: true, defaultDurationSec: 1.0 },
  slideright: { name: '右移', resourceId: '6726711296063967748', effectId: '2917287', isOverlap: true, defaultDurationSec: 1.0 },
  slideup: { name: '上移', resourceId: '6724846395116753416', effectId: '2917279', isOverlap: true, defaultDurationSec: 0.5 },
  slidedown: { name: '下移', resourceId: '6724849276100284942', effectId: '2917280', isOverlap: true, defaultDurationSec: 0.5 },
  // 平滑推移没有单独的“缓动”资源，用同方向的滑动转场近似
  smoothleft: { name: '左移', resourceId: '6726711499676455435', effectId: '2917286', isOverlap: true, defaultDurationSec: 1.0 },
  smoothright: { name: '右移', resourceId: '6726711296063967748', effectId: '2917287', isOverlap: true, defaultDurationSec: 1.0 },
  circleopen: { name: '圆形扫描', resourceId: '6851775006418932238', effectId: '813992', isOverlap: true, defaultDurationSec: 1.0 },
  circleclose: { name: '圆形遮罩', resourceId: '6725767129519362573', effectId: '2916676', isOverlap: true, defaultDurationSec: 0.5 },
  radial: { name: '圆形扫描', resourceId: '6851775006418932238', effectId: '813992', isOverlap: true, defaultDurationSec: 1.0 },
  pixelize: { name: '马赛克', resourceId: '6724866519022440967', effectId: '4212631', isOverlap: true, defaultDurationSec: 1.0 },
  zoomin: { name: '推近', resourceId: '6724226861666144779', effectId: '359359', isOverlap: false, defaultDurationSec: 1.0 },
  hlslice: { name: '横向分割', resourceId: '7083771238564237861', effectId: '4211685', isOverlap: true, defaultDurationSec: 0.5 },
  vuslice: { name: '竖向分割', resourceId: '7083771107706147364', effectId: '4211686', isOverlap: true, defaultDurationSec: 0.5 },
  squeezev: { name: '竖向拉幕', resourceId: '6726711903684399619', effectId: '2917285', isOverlap: true, defaultDurationSec: 1.0 },
  squeezeh: { name: '横向拉幕', resourceId: '6724492948144132621', effectId: '2917278', isOverlap: true, defaultDurationSec: 1.0 },
  coverleft: { name: '横向拉幕', resourceId: '6724492948144132621', effectId: '2917278', isOverlap: true, defaultDurationSec: 1.0 },
  revealright: { name: '向右擦除', resourceId: '6724849898857959950', effectId: '2917284', isOverlap: true, defaultDurationSec: 0.5 },
};

/** 调色预设 → 剪映滤镜/特效（免费资源；无免费对应项的预设不在这里，导出时写 warning） */
export const JY_COLORS: Record<string, JyColorRef> = {
  bright: { kind: 'filter', name: '清晰明亮', resourceId: '7433813603758722342', effectId: '7433813603758722342' },
  vivid: { kind: 'filter', name: '高饱和', resourceId: '7127653121966230814', effectId: '7127653121966230814' },
  soft: { kind: 'filter', name: '奶油', resourceId: '7127618513048571173', effectId: '7127618513048571173' },
  sharp: { kind: 'filter', name: '高清明亮', resourceId: '7434564801990266162', effectId: '7434564801990266162' },
  warm: { kind: 'filter', name: '暖食', resourceId: '7127653100269210916', effectId: '7127653100269210916' },
  cool: { kind: 'filter', name: '清冷', resourceId: '7405602958748028186', effectId: '7405602958748028186' },
  skin: { kind: 'filter', name: '亮肤', resourceId: '7127655008715230495', effectId: '7127655008715230495' },
  blush: { kind: 'filter', name: '粉肤', resourceId: '7296493947625557286', effectId: '7296493947625557286' },
  portrait_bw: { kind: 'effect', name: '变黑白', resourceId: '6730911849706951179', effectId: '634055' },
  cinema: { kind: 'filter', name: '质感电影', resourceId: '7395858604311596299', effectId: '7395858604311596299' },
  teal: { kind: 'filter', name: '青橙', resourceId: '7127615575865478430', effectId: '7127615575865478430' },
  night: { kind: 'filter', name: '暗夜', resourceId: '7127823728070659358', effectId: '7127823728070659358' },
  dawn: { kind: 'filter', name: '日出', resourceId: '7325383700240256296', effectId: '7325383700240256296' },
  dusk: { kind: 'filter', name: '日落橘', resourceId: '7127669630667066655', effectId: '7127669630667066655' },
  film: { kind: 'effect', name: '胶片', resourceId: '6708624565657932292', effectId: '635097' },
  noir: { kind: 'effect', name: '变黑白', resourceId: '6730911849706951179', effectId: '634055' },
  vintage: { kind: 'filter', name: '复古工业', resourceId: '7127608212483820837', effectId: '7127608212483820837' },
  sepia: { kind: 'filter', name: '深褐', resourceId: '7127615347703811336', effectId: '7127615347703811336' },
  retro80: { kind: 'filter', name: '1980', resourceId: '7127828208690433311', effectId: '7127828208690433311' },
  fade: { kind: 'filter', name: '褪色', resourceId: '7127668404764380447', effectId: '7127668404764380447' },
  bw: { kind: 'effect', name: '变黑白', resourceId: '6730911849706951179', effectId: '634055' },
  bw_hc: { kind: 'effect', name: '变黑白', resourceId: '6730911849706951179', effectId: '634055' },
  dreamy: { kind: 'effect', name: '光晕', resourceId: '6714239617916211716', effectId: '634095' },
  vignette: { kind: 'effect', name: '暗角', resourceId: '6723086142658318860', effectId: '634057' },
  invert: { kind: 'effect', name: '彩色负片', resourceId: '6914995893653475847', effectId: '1005840' },
  glitch: { kind: 'effect', name: '色差故障', resourceId: '6706773498922013191', effectId: '634773' },
  neon: { kind: 'effect', name: '霓虹灯', resourceId: '6829182808485794311', effectId: '742028' },
};

/** 结构特效 → 剪映视频特效（免费资源） */
export const JY_FX: Record<string, JyRef> = {
  shake: { name: '震动', resourceId: '6761645818723176968', effectId: '634075' },
  drift: { name: '摇摆', resourceId: '6709706542674874888', effectId: '634743' },
  ghost: { name: '幻影', resourceId: '6723059630676644364', effectId: '634751' },
  scanline: { name: '隔行扫描', resourceId: '6976152376457564708', effectId: '1168118' },
  vhs: { name: '录像带', resourceId: '6706773534074475012', effectId: '634887' },
  glitch: { name: '色差故障', resourceId: '6706773498922013191', effectId: '634773' },
  bloom: { name: '光晕', resourceId: '6714239617916211716', effectId: '634095' },
  oldfilm: { name: '老电影', resourceId: '6706773498506777095', effectId: '635095' },
  dream: { name: '梦境', resourceId: '6841460732639318542', effectId: '773088' },
  fisheye: { name: '广角', resourceId: '7086792017837036046', effectId: '1700284' },
  mirror: { name: '镜像', resourceId: '6956148985400660517', effectId: '1115964' },
  tilt: { name: '摇摆 II', resourceId: '6821460674577699342', effectId: '717392' },
  pixelate: { name: '低像素', resourceId: '6810945511005098509', effectId: '703237' },
};

export interface JyMaskRef extends JyRef {
  /** 剪映蒙版的 resource_type（line/circle/rectangle/geometric_shape） */
  resourceType: string;
  /** 默认宽高比（宽/高，相对素材） */
  aspectRatio: number;
  /** 蒙版旋转角度（分屏用线性蒙版旋转） */
  rotation?: number;
}

/** 蒙版形状 → 剪映蒙版（剪映只有 6 种基础蒙版，其余用近似组合） */
export const JY_MASKS: Record<string, JyMaskRef> = {
  circle: { name: '圆形', resourceType: 'circle', resourceId: '6791700663249146381', effectId: '636075', aspectRatio: 1.0 },
  ellipse: { name: '圆形', resourceType: 'circle', resourceId: '6791700663249146381', effectId: '636075', aspectRatio: 1.0 },
  rect: { name: '矩形', resourceType: 'rectangle', resourceId: '6791700809454195207', effectId: '636077', aspectRatio: 1.0 },
  rounded: { name: '矩形', resourceType: 'rectangle', resourceId: '6791700809454195207', effectId: '636077', aspectRatio: 1.0 },
  heart: { name: '爱心', resourceType: 'geometric_shape', resourceId: '6794051276482023949', effectId: '636079', aspectRatio: 1.115 },
  star: { name: '星形', resourceType: 'geometric_shape', resourceId: '6794051169434997255', effectId: '636081', aspectRatio: 1.05 },
  diamond: { name: '矩形', resourceType: 'rectangle', resourceId: '6791700809454195207', effectId: '636077', aspectRatio: 1.0, rotation: 45 },
  split_left: { name: '线性', resourceType: 'line', resourceId: '6791652175668843016', effectId: '636071', aspectRatio: 1.0, rotation: 90 },
  split_right: { name: '线性', resourceType: 'line', resourceId: '6791652175668843016', effectId: '636071', aspectRatio: 1.0, rotation: 270 },
  split_top: { name: '线性', resourceType: 'line', resourceId: '6791652175668843016', effectId: '636071', aspectRatio: 1.0, rotation: 0 },
  split_bottom: { name: '线性', resourceType: 'line', resourceId: '6791652175668843016', effectId: '636071', aspectRatio: 1.0, rotation: 180 },
  // 人物大头：圆形聚焦画面上部（centerY 在导出时按 scale/位置算）
  top_circle: { name: '圆形', resourceType: 'circle', resourceId: '6791700663249146381', effectId: '636075', aspectRatio: 1.0 },
};

export interface JyChromaRef {
  color: string;
  intensity: number;
  shadow: number;
  edge: number;
  spill: number;
}

/** 色键抠像 → 剪映色度抠图（materials.chromas） */
export const JY_CHROMA: Record<string, JyChromaRef> = {
  green: { color: '#00FF00FF', intensity: 0.30, shadow: 0.10, edge: 0.10, spill: 0.0 },
  green_soft: { color: '#00FF00FF', intensity: 0.20, shadow: 0.06, edge: 0.06, spill: 0.0 },
  blue: { color: '#0000FFFF', intensity: 0.30, shadow: 0.10, edge: 0.10, spill: 0.0 },
  white: { color: '#FFFFFFFF', intensity: 0.30, shadow: 0.10, edge: 0.10, spill: 0.0 },
  black: { color: '#000000FF', intensity: 0.20, shadow: 0.08, edge: 0.08, spill: 0.0 },
};

/** 画面淡入/淡出（剪映入场/出场动画） */
export const JY_FADE_IN: JyRef = { name: '渐显', resourceId: '6798320778182922760', effectId: '624705' };
export const JY_FADE_OUT: JyRef = { name: '渐隐', resourceId: '6798320902548230669', effectId: '624707' };

// ===== 字幕动画（剪映文字入场/出场动画；免费资源）=====
/** 字幕动画预设 → 剪映文字入场动画 */
export const JY_TEXT_INTRO: Record<string, JyRef> = {
  fade: { name: '渐显', resourceId: '6724916044072227332', effectId: '1644304' },
  pop: { name: '弹入', resourceId: '6887482184844710413', effectId: '1644313' },
  zoom: { name: '放大', resourceId: '6724919499042066958', effectId: '1644264' },
  typewriter: { name: '打字机 I', resourceId: '6724920249654710791', effectId: '1644275' },
  karaoke: { name: '卡拉OK', resourceId: '6771294855785091588', effectId: '1558840' },
  flicker: { name: '闪动', resourceId: '7035902226602136071', effectId: '1644322' },
  flychar: { name: '随机飞入', resourceId: '6872642542765085191', effectId: '1644309' },
};

/** 字幕动画预设 → 剪映文字出场动画（目前只映射 fade 的淡出） */
export const JY_TEXT_OUTRO: Record<string, JyRef> = {
  fade: { name: '渐隐', resourceId: '6724919382104871427', effectId: '1644600' },
};

/** slide 按方向选剪映文字滑动动画 */
export const JY_TEXT_SLIDE: Record<string, JyRef> = {
  left: { name: '向左滑动', resourceId: '6763470195894784525', effectId: '1644277' },
  right: { name: '向右滑动', resourceId: '6724920136056181256', effectId: '1644266' },
  up: { name: '向上滑动', resourceId: '6763470111253729803', effectId: '1644267' },
  down: { name: '向下滑动', resourceId: '6724921985282871816', effectId: '1644268' },
};
