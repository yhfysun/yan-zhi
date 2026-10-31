// 剪辑效果库 —— **唯一真相源**（滤镜预设 + 转场 + 文字动画 + 音效）。
//
// ★★★ 为什么抽成独立模块（2026-10-07）：
//   效果库此前散在三处（api-tool-executor 的 COLOR_PRESETS / XFADE_TYPES、subtitle-style 的
//   SUBTITLE_ANIMATION_PRESETS），而**对外暴露的 enum 写在 packages/core 的工具 schema 里** →
//   三份清单必须手工同步，漏一处就是"模型能传但实现不认"或反之。
//   商用剪辑软件（剪映/Premiere/达芬奇）的效果面板之所以能用，前提就是
//   「一份注册表 → 同时驱动 UI 列表、工具参数校验、渲染实现」。
//   → 本模块定义注册表；api-tool-executor 只消费，schema 的 enum 也从这里取。
//
// ★ 判据：新增一个效果 = 只改这里一处。若发现还要去别处改 enum，说明又漂移了。
// ★ 每个预设的 ffmpeg 参数**必须实测**（编译通过 ≠ 滤镜有效），见 tools/verify-effects.cjs。

/** 效果可调参数的声明（UI 滑杆、工具描述、渲染取值同源）。 */
export interface EffectParam {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
}

export interface EffectPreset {
  /** 对外 id（工具参数值 / UI 选项值） */
  id: string;
  /** 中文名（UI 与工具描述共用） */
  label: string;
  /** 一句话说明它长什么样（给模型选效果用，也作 UI tooltip） */
  desc: string;
  /** ffmpeg 滤镜串（不含首尾逗号）；空串表示"不变"。`{W}/{H}` 是画幅占位符，`{key}` 是参数占位符 */
  filter: string;
  /** 分类（UI 分组用） */
  group: EffectGroup;
  /** 可调参数；缺省 = 该效果没有参数 */
  params?: EffectParam[];
}

/** 效果分组（滤镜 / 转场 / 文字 / 音效 四张表共用；UI 按这个顺序渲染分组）。 */
export type EffectGroup =
  | '基础' | '人像' | '电影' | '复古' | '风格化' | '特殊'   // 滤镜
  | '滑动' | '形状' | '特效'                                 // 转场
  | '进阶'                                                   // 文字动画
  | '变声' | '空间'                                          // 音效
  | '分屏' | '抠像'                                          // 蒙版
  | '动效' | '故障' | '氛围' | '扭曲' | '像素';               // 特效（FX）

/**
 * 调色/滤镜预设。
 *
 * 设计口径：**每个滤镜都要能在任何素材上给出稳定、不翻车的观感** ——
 * 商用软件的滤镜之所以好用，是因为它们都是"温和且确定"的；
 * 追求夸张效果会让 90% 的素材变得难看。
 * 参数含义（ffmpeg）：eq=brightness(-1~1)/contrast(0~3)/saturation(0~3)/gamma(0.1~3)；
 * hue=s(饱和度)/h(色相角)；colorbalance=rs/gs/bs（阴影/中间调/高光各带 r/g/b）；
 * vignette 暗角；noise 颗粒；unsharp 锐化；gblur 高斯模糊；curves 曲线预设。
 */
export const COLOR_EFFECTS: EffectPreset[] = [
  // ── 基础 ──
  { id: 'none', label: '原片', desc: '不做任何调色', filter: '', group: '基础' },
  { id: 'bright', label: '明亮', desc: '整体提亮、通透感', filter: 'eq=brightness=0.06:saturation=1.05', group: '基础' },
  { id: 'vivid', label: '鲜艳', desc: '加饱和加对比，画面更抢眼', filter: 'eq=saturation=1.35:contrast=1.08', group: '基础' },
  { id: 'soft', label: '柔和', desc: '降对比降饱和，舒服不刺眼', filter: 'eq=contrast=0.92:saturation=0.88:brightness=0.03', group: '基础' },
  { id: 'sharp', label: '清晰', desc: '锐化细节，适合风景/产品', filter: 'unsharp=5:5:0.9:5:5:0', group: '基础' },
  { id: 'warm', label: '暖阳', desc: '偏黄暖调，温馨', filter: 'colorbalance=rs=.15:gs=.05:bs=-.10,eq=saturation=1.06', group: '基础' },
  { id: 'cool', label: '清冷', desc: '偏蓝冷调，干净', filter: 'colorbalance=rs=-.08:bs=.15,eq=saturation=1.02', group: '基础' },

  // ── 人像 ──
  { id: 'skin', label: '柔肤', desc: '轻微磨皮提亮肤色', filter: 'smartblur=lr=1:ls=-0.5:lt=5,eq=brightness=0.04:saturation=1.04', group: '人像' },
  { id: 'blush', label: '蜜桃', desc: '粉嫩调，适合人像/甜系', filter: 'colorbalance=rs=.10:gs=-.02:bs=.04,eq=saturation=1.10:brightness=0.03', group: '人像' },
  { id: 'portrait_bw', label: '人像黑白', desc: '黑白但保留皮肤明度层次', filter: 'hue=s=0,eq=contrast=1.10:brightness=0.04', group: '人像' },

  // ── 电影 ──
  { id: 'cinema', label: '电影感', desc: '青橙色调+低饱和，广告常用', filter: 'colorbalance=rs=-.06:bs=.10,eq=saturation=0.90:contrast=1.12', group: '电影' },
  { id: 'teal', label: '青橙', desc: '强青橙分离，风格化明显', filter: 'colorbalance=rs=.12:bs=-.12:gm=.06,eq=saturation=1.05:contrast=1.08', group: '电影' },
  { id: 'night', label: '夜戏', desc: '压暗压蓝，夜景氛围', filter: 'colorbalance=bs=.22:gm=.05,eq=brightness=-0.06:saturation=0.85:contrast=1.06', group: '电影' },
  { id: 'dawn', label: '晨曦', desc: '低对比暖雾感，清晨', filter: 'colorbalance=rs=.10:gs=.04:bs=.02,eq=brightness=0.05:contrast=0.90:saturation=0.94', group: '电影' },
  { id: 'dusk', label: '黄昏', desc: '橙紫夕阳调', filter: 'colorbalance=rs=.16:bs=.06:gm=-.04,eq=saturation=1.08:contrast=1.04', group: '电影' },
  { id: 'film', label: '胶片', desc: '颗粒+降饱和，胶片质感', filter: 'eq=contrast=1.10:saturation=.90:gamma=.96,noise=alls=6:allf=t', group: '电影' },
  { id: 'noir', label: '黑色电影', desc: '高对比黑白+暗角', filter: 'hue=s=0,eq=contrast=1.35:brightness=-0.04,vignette=PI/4.5', group: '电影' },

  // ── 复古 ──
  { id: 'vintage', label: '怀旧', desc: '褪色泛黄，老照片', filter: 'curves=vintage,eq=saturation=.85:contrast=1.05', group: '复古' },
  { id: 'sepia', label: '棕褐', desc: '经典棕褐色调', filter: 'colorbalance=rs=.20:gs=.10:bs=-.15,eq=saturation=0.55:contrast=1.04', group: '复古' },
  { id: 'retro80', label: '八零年代', desc: '洋红青双色调，复古霓虹', filter: 'colorbalance=rs=.16:bs=.14:gm=-.06,eq=saturation=1.15:contrast=1.06', group: '复古' },
  { id: 'fade', label: '褪色', desc: '低对比低饱和，文艺', filter: 'eq=brightness=.05:saturation=.75:contrast=.92', group: '复古' },

  // ── 风格化 ──
  { id: 'bw', label: '黑白', desc: '纯灰度', filter: 'hue=s=0', group: '风格化' },
  { id: 'bw_hc', label: '硬调黑白', desc: '高对比黑白，纪实', filter: 'hue=s=0,eq=contrast=1.28', group: '风格化' },
  { id: 'sketch', label: '素描', desc: '描边线条，手绘感', filter: 'edgedetect=low=0.08:high=0.28', group: '风格化' },
  { id: 'neon', label: '霓虹', desc: '高饱和高对比，赛博感', filter: 'eq=saturation=1.55:contrast=1.20:brightness=0.02', group: '风格化' },
  { id: 'dreamy', label: '梦幻', desc: '柔化+提亮，朦胧感', filter: 'gblur=sigma=1.2,eq=brightness=0.06:saturation=1.06', group: '风格化' },
  { id: 'vignette', label: '暗角', desc: '四角压暗，聚焦主体', filter: 'vignette=PI/4', group: '风格化' },

  // ── 特殊 ──
  { id: 'invert', label: '反色', desc: '互补色反转，实验感', filter: 'negate', group: '特殊' },
  { id: 'glitch', label: '故障风', desc: '色差位移，赛博故障', filter: 'chromashift=cbh=4:crh=-4,eq=saturation=1.20', group: '特殊' },
  { id: 'thermal', label: '热成像', desc: '伪彩色，科技感', filter: 'hue=h=180:s=2.2,eq=contrast=1.15', group: '特殊' },
];

/** 转场类型（xfade 支持的 transition 名；已按观感分档，UI 直接按这个列出）。 */
export const TRANSITIONS: EffectPreset[] = [
  { id: 'fade', label: '叠化', desc: '最通用的交叉溶解', filter: 'fade', group: '基础' },
  { id: 'dissolve', label: '溶解', desc: '噪点式溶解', filter: 'dissolve', group: '基础' },
  { id: 'fadeblack', label: '黑场过渡', desc: '经黑场切换，节奏感强', filter: 'fadeblack', group: '基础' },
  { id: 'fadewhite', label: '白闪', desc: '经白场切换，闪白转场', filter: 'fadewhite', group: '基础' },
  { id: 'wipeleft', label: '左擦除', desc: '从左往右擦除', filter: 'wipeleft', group: '滑动' },
  { id: 'wiperight', label: '右擦除', desc: '从右往左擦除', filter: 'wiperight', group: '滑动' },
  { id: 'wipeup', label: '上擦除', desc: '自下往上擦除', filter: 'wipeup', group: '滑动' },
  { id: 'wipedown', label: '下擦除', desc: '自上往下擦除', filter: 'wipedown', group: '滑动' },
  { id: 'slideleft', label: '左滑入', desc: '整帧左向滑动', filter: 'slideleft', group: '滑动' },
  { id: 'slideright', label: '右滑入', desc: '整帧右向滑动', filter: 'slideright', group: '滑动' },
  { id: 'slideup', label: '上滑入', desc: '整帧向上滑动', filter: 'slideup', group: '滑动' },
  { id: 'slidedown', label: '下滑入', desc: '整帧向下滑动', filter: 'slidedown', group: '滑动' },
  { id: 'smoothleft', label: '平滑左推', desc: '带缓动的左推', filter: 'smoothleft', group: '滑动' },
  { id: 'smoothright', label: '平滑右推', desc: '带缓动的右推', filter: 'smoothright', group: '滑动' },
  { id: 'circleopen', label: '圆形展开', desc: '圆形放大铺满', filter: 'circleopen', group: '形状' },
  { id: 'circleclose', label: '圆形收拢', desc: '圆形缩小消失', filter: 'circleclose', group: '形状' },
  { id: 'radial', label: '径向擦除', desc: '绕中心旋转擦除', filter: 'radial', group: '形状' },
  { id: 'pixelize', label: '像素化', desc: '像素块过渡，科技感', filter: 'pixelize', group: '特效' },
  { id: 'zoomin', label: '放大推入', desc: '放大冲入下一段', filter: 'zoomin', group: '特效' },
  { id: 'hlslice', label: '水平切条', desc: '横向切片错位', filter: 'hlslice', group: '特效' },
  { id: 'vuslice', label: '垂直切条', desc: '纵向切片错位', filter: 'vuslice', group: '特效' },
  { id: 'squeezev', label: '垂直挤压缩', desc: '纵向挤压切换', filter: 'squeezev', group: '特效' },
  { id: 'squeezeh', label: '水平挤压缩', desc: '横向挤压切换', filter: 'squeezeh', group: '特效' },
  { id: 'coverleft', label: '左覆盖', desc: '下一段从左侧盖上来', filter: 'coverleft', group: '特效' },
  { id: 'revealright', label: '右揭示', desc: '揭开幕布式右移', filter: 'revealright', group: '特效' },
];

/** 文字动画（字幕预设；渲染在 mcp/subtitle-style.ts，这里只做 id/label/desc 的单一来源）。 */
export const TEXT_ANIMATIONS: EffectPreset[] = [
  { id: 'fade', label: '淡入淡出', desc: '通用最稳，任何场景都不出错', filter: '\\fad(300,300)', group: '基础' },
  { id: 'pop', label: '弹跳入场', desc: '缩放过冲回弹，卡点感', filter: '\\t(fscx,fscy)', group: '基础' },
  { id: 'zoom', label: '缩放入场', desc: '从小到大放大定格，强调', filter: '\\t(fscx,fscy)', group: '基础' },
  { id: 'slide', label: '滑动入场', desc: '从画面一侧滑入（可指定方向）', filter: '\\move', group: '基础' },
  { id: 'typewriter', label: '打字机', desc: '逐字出现，旁白/解说感', filter: '逐字 Dialogue', group: '进阶' },
  { id: 'karaoke', label: '卡拉OK染色', desc: '逐字高亮染色，跟读感', filter: '\\k', group: '进阶' },
  { id: 'flicker', label: '描边闪烁', desc: '描边脉冲，强调关键词', filter: '\\t(bord)', group: '进阶' },
  { id: 'flychar', label: '逐字飞入', desc: '每字从上方依次落位，活泼', filter: '\\move + 逐字', group: '进阶' },
];

/**
 * 蒙版（mask）—— 视频里"只显示素材的某一部分"。
 *
 * ★★★ 为什么现在补（2026-10-07 用户问「蒙版不能建立？」）：
 *   此前**一行都没实现**，而 ffmpeg 的蒙版滤镜（colorkey / chromakey / geq / crop）
 *   本机实测全部可用 —— 属于"能力具备但完全没接"的空白。
 *
 * 两种实现路径（按 id 分发，见 api-tool-executor 的 mask op）：
 *   · 形状类（circle/rect/heart/…）：用 **geq 的 alpha 表达式**逐像素算（无外部依赖）；
 *   · 色键类（green/blue/screen）：用 colorkey 按颜色抠除（绿幕/蓝幕）。
 * ★ filter 字段对形状类只作标记（真正的表达式在 api-tool-executor 里按 shape 生成），
 *   对色键类是可直接用的滤镜串。
 */
export const MASK_SHAPES: EffectPreset[] = [
  { id: 'none', label: '无蒙版', desc: '显示完整画面', filter: '', group: '基础' },
  { id: 'circle', label: '圆形', desc: '圆形取景，画面外透明', filter: 'geq:circle', group: '形状' },
  { id: 'ellipse', label: '椭圆', desc: '椭圆取景（适合人物特写）', filter: 'geq:ellipse', group: '形状' },
  { id: 'rect', label: '矩形', desc: '矩形取景，四角裁切', filter: 'geq:rect', group: '形状' },
  { id: 'rounded', label: '圆角矩形', desc: '圆角边框，柔和', filter: 'geq:rounded', group: '形状' },
  { id: 'heart', label: '心形', desc: '心形取景，浪漫', filter: 'geq:heart', group: '形状' },
  { id: 'star', label: '星形', desc: '五角星取景，醒目', filter: 'geq:star', group: '形状' },
  { id: 'diamond', label: '菱形', desc: '菱形取景', filter: 'geq:diamond', group: '形状' },
  { id: 'linear', label: '线性渐变', desc: '沿一个方向渐变擦除（角度/位置可调，P1-4）', filter: 'geq:linear', group: '形状' },
  { id: 'split_left', label: '左半屏', desc: '只显示左半边（分屏用）', filter: 'geq:split_left', group: '分屏' },
  { id: 'split_right', label: '右半屏', desc: '只显示右半边（分屏用）', filter: 'geq:split_right', group: '分屏' },
  { id: 'split_top', label: '上半屏', desc: '只显示上半部分', filter: 'geq:split_top', group: '分屏' },
  { id: 'split_bottom', label: '下半屏', desc: '只显示下半部分', filter: 'geq:split_bottom', group: '分屏' },
  { id: 'top_circle', label: '人物大头（上圆）', desc: '圆形聚焦画面上部（口播头像圈）', filter: 'geq:top_circle', group: '形状' },
];

/** 色键抠像（按颜色抠除；绿幕/蓝幕素材合成必备）。 */
export const MASK_KEYS: EffectPreset[] = [
  { id: 'green', label: '绿幕抠像', desc: '抠掉绿色背景（最常用）', filter: 'colorkey=0x00FF00:0.30:0.10', group: '抠像' },
  { id: 'green_soft', label: '绿幕抠像·柔和', desc: '相似度更低，保留毛发边缘细节', filter: 'colorkey=0x00FF00:0.20:0.06', group: '抠像' },
  { id: 'blue', label: '蓝幕抠像', desc: '抠掉蓝色背景', filter: 'colorkey=0x0000FF:0.30:0.10', group: '抠像' },
  { id: 'white', label: '白底去底', desc: '抠掉白色背景（白底素材合成）', filter: 'colorkey=0xFFFFFF:0.30:0.10', group: '抠像' },
  { id: 'black', label: '黑底去底', desc: '抠掉黑色背景（黑底素材合成）', filter: 'colorkey=0x000000:0.20:0.08', group: '抠像' },
];

/**
 * HSL 分色色带（P1-6）：八个色相中心 + 中文名。
 * ★ 三端共用（工具 enum / UI 色带按钮 / 生成 3D LUT 的中心角），写第二份必然漂移。
 * ★ hueDeg 是该色带的代表色相（度）；渲染时按"到中心的角距离"做线性权重（±45° 内生效），
 *   相邻色带自然重叠，不会出现硬边。
 */
export const HSL_BANDS: Array<{ id: string; label: string; hueDeg: number }> = [
  { id: 'red', label: '红', hueDeg: 0 },
  { id: 'orange', label: '橙', hueDeg: 30 },
  { id: 'yellow', label: '黄', hueDeg: 60 },
  { id: 'green', label: '绿', hueDeg: 120 },
  { id: 'cyan', label: '青', hueDeg: 180 },
  { id: 'blue', label: '蓝', hueDeg: 240 },
  { id: 'purple', label: '紫', hueDeg: 280 },
  { id: 'magenta', label: '品红', hueDeg: 320 },
];

export function hslBandOf(id: string | undefined): { id: string; label: string; hueDeg: number } | null {
  const key = String(id ?? '').trim().toLowerCase();
  return key ? HSL_BANDS.find((b) => b.id === key) || null : null;
}

export function hslBandIds(): string[] {
  return HSL_BANDS.map((b) => b.id);
}

/** 字幕样式模板 —— 一键套用成套样式（对标剪映/必剪的"字幕模板"）。
 *
 * ★★★ 为什么需要（2026-10-07 用户问「字幕啥的素材不能建立？」）：
 *   此前只能逐项调字号/颜色/描边/位置 —— 想做出"商用软件那种好看的字幕"
 *   要手动试十几次参数。模板把**成套观感**沉淀成一行，才是"能用"与"好用"的差别。
 *   ★ 字段语义与 ClipText 一一对应（见 clip-project.ts），套用即写进字幕条目。
 */
export interface TextStylePreset {
  id: string;
  label: string;
  desc: string;
  /** 套用的样式（只写需要覆盖的字段） */
  style: {
    fontSizePx?: number;
    color?: string;
    outlineColor?: string;
    outlinePx?: number;
    /** 背景底板色（#RRGGBBAA，A 为不透明度；不填=无底板） */
    backColor?: string;
    bold?: boolean;
    italic?: boolean;
    position?: 'bottom' | 'center' | 'top';
    safeArea?: boolean;
    /** 默认动画（用户仍可在属性面板改） */
    animation?: string;
    // ── P1-2 排版 ──
    /** 字距（像素，1920 基准） */
    letterSpacingPx?: number;
    /** 行距（额外行间隙，像素，1920 基准） */
    lineSpacingPx?: number;
    /** 花字/气泡底板色（用大描边撑成圆角底板） */
    plateColor?: string;
    /** 底板厚度（像素，1920 基准） */
    platePaddingPx?: number;
  };
}

export const TEXT_STYLES: TextStylePreset[] = [
  {
    id: 'plain', label: '素白', desc: '白字黑边，最通用',
    style: { fontSizePx: 88, color: '#FFFFFF', outlineColor: '#000000', outlinePx: 12, position: 'bottom' },
  },
  {
    id: 'vlog', label: 'Vlog 大字', desc: '大号白字重描边，短视频标配',
    style: { fontSizePx: 120, color: '#FFFFFF', outlineColor: '#000000', outlinePx: 20, position: 'center', bold: true, animation: 'pop' },
  },
  {
    id: 'title', label: '片头标题', desc: '超大标题+缩放入场',
    style: { fontSizePx: 150, color: '#FFFFFF', outlineColor: '#1F2937', outlinePx: 16, position: 'center', bold: true, animation: 'zoom' },
  },
  {
    id: 'news', label: '新闻条', desc: '白字蓝底，资讯感',
    style: { fontSizePx: 84, color: '#FFFFFF', outlineColor: '#0B4A8F', outlinePx: 6, backColor: '#0B4A8FCC', position: 'bottom', safeArea: true },
  },
  {
    id: 'yellow', label: '醒目黄', desc: '黄字黑边，强提示',
    style: { fontSizePx: 110, color: '#FFE600', outlineColor: '#000000', outlinePx: 18, position: 'center', bold: true, animation: 'flicker' },
  },
  {
    id: 'narration', label: '解说旁白', desc: '中等白字+打字机，口播感',
    style: { fontSizePx: 84, color: '#FFFFFF', outlineColor: '#000000', outlinePx: 10, position: 'bottom', safeArea: true, animation: 'typewriter' },
  },
  {
    id: 'lyric', label: '歌词跟读', desc: '居中大号+逐字染色',
    style: { fontSizePx: 120, color: '#FFFFFF', outlineColor: '#000000', outlinePx: 14, position: 'center', bold: true, animation: 'karaoke' },
  },
  {
    id: 'elegant', label: '文艺细体', desc: '小号低对比，安静',
    style: { fontSizePx: 72, color: '#F5F5F5', outlineColor: '#333333', outlinePx: 6, position: 'bottom', animation: 'fade' },
  },
  {
    id: 'tag', label: '标签底板', desc: '深色底板+白字，压任何画面都清楚',
    style: { fontSizePx: 78, color: '#FFFFFF', outlineColor: '#000000', outlinePx: 4, backColor: '#000000B3', position: 'bottom', safeArea: true },
  },
  {
    id: 'punch', label: '重击强调', desc: '超大黄字+弹跳，卡点爆点',
    style: { fontSizePx: 160, color: '#FFD400', outlineColor: '#7A2E00', outlinePx: 22, position: 'center', bold: true, animation: 'pop' },
  },
  // ── P1-2 花字 / 气泡 / 排版 ──
  {
    id: 'huazi', label: '花字（红底白字）', desc: '大描边撑成圆角底板，综艺/口播标题',
    style: { fontSizePx: 110, color: '#FFFFFF', outlineColor: '#8A1200', outlinePx: 8, plateColor: '#E23A1A', platePaddingPx: 26, position: 'center', bold: true },
  },
  {
    id: 'plate-dark', label: '气泡底板', desc: '半透明深色圆角底板，压任何画面都清楚',
    style: { fontSizePx: 84, color: '#FFFFFF', outlineColor: '#000000', outlinePx: 4, plateColor: '#000000CC', platePaddingPx: 28, position: 'bottom', safeArea: true },
  },
  {
    id: 'neon', label: '霓虹发光', desc: '青字深蓝描边，赛博/夜店感',
    style: { fontSizePx: 104, color: '#7CF9FF', outlineColor: '#0B3A8F', outlinePx: 18, position: 'center', bold: true },
  },
  {
    id: 'wide-title', label: '宽字距标题', desc: '大字距片头标题，电影/综艺片头',
    style: { fontSizePx: 118, color: '#FFFFFF', outlineColor: '#1F2937', outlinePx: 12, letterSpacingPx: 24, position: 'center', bold: true },
  },
];

/** 字幕对齐方式（ASS Alignment 值：1-3 底/4-6 中/7-9 顶，3 的倍数=靠右）。 */
export const TEXT_ALIGNMENTS: Array<{ id: string; label: string; align: number }> = [
  { id: 'bottom_left', label: '左下', align: 1 },
  { id: 'bottom', label: '底部居中', align: 2 },
  { id: 'bottom_right', label: '右下', align: 3 },
  { id: 'center_left', label: '左中', align: 4 },
  { id: 'center', label: '居中', align: 5 },
  { id: 'center_right', label: '右中', align: 6 },
  { id: 'top_left', label: '左上', align: 7 },
  { id: 'top', label: '顶部居中', align: 8 },
  { id: 'top_right', label: '右上', align: 9 },
];

/** 音效/音频处理（背景音乐、降噪、变声等）。 */
export const AUDIO_EFFECTS: EffectPreset[] = [
  { id: 'none', label: '原声', desc: '不做处理', filter: '', group: '基础' },
  // ★★ 降噪必须用 afftdn（FFT 降噪），**不能用 anlmdn**：
  //   实测本机 ffmpeg 构建下 anlmdn **产出 44 字节的损坏文件**（moov atom not found），
  //   0.6s 与 3s 素材都一样；同一素材换 highpass 对照正常 → 是滤镜本身的问题。
  //   这类"命令成功、文件写出来了、但内容是坏的"最危险：不实跑根本发现不了。
  { id: 'denoise', label: '降噪', desc: '抑制环境底噪（人声/口播常用）', filter: 'afftdn=nr=12:nf=-25', group: '基础' },
  { id: 'denoise_strong', label: '强降噪', desc: '更激进地压底噪（素材很吵时用）', filter: 'afftdn=nr=24:nf=-30', group: '基础' },
  { id: 'loud', label: '响度归一', desc: '拉平音量（多段拼接后必做）', filter: 'loudnorm=I=-16:TP=-1.5:LRA=11', group: '基础' },
  { id: 'radio', label: '收音机', desc: '窄频带，老式广播感', filter: 'highpass=f=400,lowpass=f=3000,volume=1.2', group: '风格化' },
  { id: 'phone', label: '电话音', desc: '极窄频带+失真，电话听筒感', filter: 'highpass=f=500,lowpass=f=2500,acrusher=bits=8:mix=0.3', group: '风格化' },
  { id: 'deep', label: '低沉', desc: '降调，厚重感', filter: 'asetrate=44100*0.92,aresample=44100,atempo=1.087', group: '变声' },
  { id: 'chipmunk', label: '尖细', desc: '升调，卡通感', filter: 'asetrate=44100*1.12,aresample=44100,atempo=0.893', group: '变声' },
  { id: 'reverb', label: '空间混响', desc: '大房间混响，空旷感', filter: 'aecho=0.8:0.85:60|120:0.5|0.3', group: '空间' },
];

/**
 * 动态特效（FX）—— 与「滤镜」分开的一张表。
 *
 * ★★★ 为什么单独一张表（2026-10-21 用户：「再加点特效？」）：
 *   调色表里的 32 项全是**静态颜色变换**（eq/colorbalance/hue）。剪映/Premiere 的「特效」
 *   是另一类东西：扫描线、故障、残影、柔光、马赛克 —— 改的是画面结构，不是色调。
 *   混进调色表等于让「我想调个色」在 45 项里翻找。
 *
 * ★ 滤镜串里的 {W}/{H} 是**画幅占位符**，渲染时由 fxFilter() 换成工程输出尺寸。
 *   为什么需要：震动/马赛克这类效果必须精确产出 W×H —— 差一个像素，
 *   整条片子的 concat -c copy 就会失败或被迫重编码（而报错完全指不到这里）。
 */
export const FX_EFFECTS: EffectPreset[] = [
  // ── 动效 ──
  {
    id: 'shake', label: '镜头震动', group: '动效',
    desc: '手持晃动感，动作/爆点镜头用',
    filter: `scale={W}*1.08:-2,crop={W}:{H}:x='(iw-{W})/2+iw*{amplitude}*sin(t*{freq})':y='(ih-{H})/2+ih*{amplitude}*cos(t*{freq})',setsar=1`,
    params: [
      { key: 'amplitude', label: '幅度', min: 0.002, max: 0.03, default: 0.006, step: 0.001 },
      { key: 'freq', label: '频率', min: 8, max: 40, default: 23, step: 1 },
    ],
  },
  {
    id: 'drift', label: '呼吸漂浮', group: '动效',
    desc: '缓慢上下浮动，静态照片也能"活"起来',
    filter: `scale={W}*1.06:-2,crop={W}:{H}:x='(iw-{W})/2':y='(ih-{H})/2+ih*{amplitude}*sin(t*{speed})',setsar=1`,
    params: [
      { key: 'amplitude', label: '幅度', min: 0.004, max: 0.03, default: 0.01, step: 0.001 },
      { key: 'speed', label: '速度', min: 0.5, max: 4, default: 1.6, step: 0.1 },
    ],
  },
  {
    id: 'ghost', label: '残影拖尾', group: '动效',
    desc: '前几帧叠影，运动镜头有速度感',
    filter: `tmix=frames={frames}`,
    params: [{ key: 'frames', label: '叠加帧数', min: 2, max: 12, default: 6, step: 1 }],
  },

  // ── 故障 ──
  {
    id: 'scanline', label: '扫描线', group: '故障',
    desc: '老显示器横向扫描纹，赛博/复古科技感',
    filter: `geq=lum='lum(X,Y)*if(mod(Y,3),1,{dim})':cb='cb(X,Y)':cr='cr(X,Y)'`,
    params: [{ key: 'dim', label: '暗线深度', min: 0.6, max: 0.95, default: 0.82, step: 0.01 }],
  },
  {
    id: 'vhs', label: '录像带', group: '故障',
    desc: '色偏+噪点，九十年代家用录像',
    filter: `chromashift=cbh={shift}:crh=-{shift},eq=saturation={saturation}:contrast=1.05,noise=alls={noise}:allf=t`,
    params: [
      { key: 'shift', label: '色偏移', min: 1, max: 8, default: 3, step: 1 },
      { key: 'saturation', label: '饱和度', min: 1, max: 1.5, default: 1.25, step: 0.05 },
      { key: 'noise', label: '噪点', min: 2, max: 24, default: 10, step: 1 },
    ],
  },
  {
    id: 'glitch', label: '色差故障', group: '故障',
    desc: '红蓝通道错位，电子故障感',
    filter: `chromashift=cbh={shift}:crh=-{shift},noise=alls={noise}:allf=t`,
    params: [
      { key: 'shift', label: '错位', min: 2, max: 16, default: 6, step: 1 },
      { key: 'noise', label: '噪点', min: 0, max: 20, default: 6, step: 1 },
    ],
  },

  // ── 氛围 ──
  {
    id: 'bloom', label: '柔光', group: '氛围',
    desc: '高光溢出的柔焦，人像/回忆镜头',
    filter: `split[a][b];[b]gblur=sigma={sigma}[g];[a][g]blend=all_mode=screen:all_opacity={opacity}`,
    params: [
      { key: 'sigma', label: '柔化半径', min: 4, max: 30, default: 14, step: 1 },
      { key: 'opacity', label: '强度', min: 0.1, max: 0.8, default: 0.35, step: 0.05 },
    ],
  },
  {
    id: 'oldfilm', label: '老电影', group: '氛围',
    desc: '颗粒+暗角+褪色，年代感',
    filter: `noise=alls={noise}:allf=t,curves=vintage,vignette=PI/{vignette}`,
    params: [
      { key: 'noise', label: '颗粒', min: 2, max: 24, default: 14, step: 1 },
      { key: 'vignette', label: '暗角强度', min: 3, max: 8, default: 4, step: 0.5 },
    ],
  },
  {
    id: 'dream', label: '梦境叠影', group: '氛围',
    desc: '柔化叠回原片，朦胧幻想感',
    filter: `split[a][b];[b]gblur=sigma={sigma}[g];[a][g]blend=all_mode=overlay:all_opacity={opacity}`,
    params: [
      { key: 'sigma', label: '柔化半径', min: 3, max: 24, default: 8, step: 1 },
      { key: 'opacity', label: '强度', min: 0.1, max: 0.8, default: 0.4, step: 0.05 },
    ],
  },

  // ── 扭曲 ──
  {
    id: 'fisheye', label: '鱼眼', group: '扭曲', desc: '广角畸变，夸张/搞笑镜头',
    filter: `lenscorrection=k1={k1}:k2={k2}`,
    params: [
      { key: 'k1', label: '畸变强度', min: 0.1, max: 0.8, default: 0.4, step: 0.05 },
      { key: 'k2', label: '边缘校正', min: 0.05, max: 0.4, default: 0.2, step: 0.05 },
    ],
  },
  { id: 'mirror', label: '镜像', group: '扭曲', desc: '水平翻转，制造对称构图', filter: `hflip` },
  {
    id: 'tilt', label: '倾斜', group: '扭曲', desc: '轻微旋转，动感/不安定',
    filter: `rotate={angle}:ow=iw:oh=ih:fillcolor=black`,
    params: [{ key: 'angle', label: '角度', min: 0.01, max: 0.2, default: 0.06, step: 0.01 }],
  },

  // ── 像素 ──
  {
    id: 'pixelate', label: '马赛克', group: '像素', desc: '像素块化，遮挡/风格化',
    filter: `scale=iw/{blocks}:ih/{blocks},scale={W}:{H}:flags=neighbor`,
    params: [{ key: 'blocks', label: '块数（越少越糊）', min: 4, max: 48, default: 12, step: 1 }],
  },
];

/** 取某效果的可调参数声明（UI 渲染滑杆、工具描述共用同一份）。 */
export function fxParamsOf(id: string): EffectParam[] {
  return FX_EFFECTS.find((e) => e.id === id)?.params || [];
}

/**
 * 生成「效果 id → 参数：键 范围 默认」的紧凑清单（塞进工具描述，让模型知道能传哪些键）。
 * ★ 必须从注册表生成：手写第二份清单必然与实现漂移（本项目反复踩过）。
 */
export function fxParamCatalogText(): string {
  return FX_EFFECTS
    .filter((e) => e.params?.length)
    .map((e) => `${e.id}（${e.params!.map((p) => `${p.key} ${p.min}~${p.max} 默认${p.default}`).join('、')}）`)
    .join('；');
}

/**
 * 取 FX 滤镜串（把 {W}/{H} 换成画幅、{key} 换成参数值）。
 * ★ 找不到返回 null —— 调用方应"什么都不加"，绝不回退到别的特效：
 *   让模型/用户传错 id 时静默变成另一种观感，比不生效更难查。
 * ★ 参数越界/缺失一律回落到注册表里的默认值：脏值进 ffmpeg 表达式只会得到
 *   一条"看起来正常但画面不对"的滤镜，排查成本极高。
 */
export function fxFilter(id: string, W: number, H: number, params?: Record<string, number>): string | null {
  const hit = FX_EFFECTS.find((e) => e.id === id);
  if (!hit || !hit.filter) return null;
  let out = hit.filter.replace(/\{W\}/g, String(Math.round(W))).replace(/\{H\}/g, String(Math.round(H)));
  for (const p of hit.params || []) {
    const raw = params?.[p.key];
    const v = typeof raw === 'number' && Number.isFinite(raw)
      ? Math.max(p.min, Math.min(p.max, raw))
      : p.default;
    out = out.replace(new RegExp(`\\{${p.key}\\}`, 'g'), String(Number(v.toFixed(4))));
  }
  return out;
}

/** 按 id 取滤镜串（找不到返回 null，调用方决定报错还是回落）。 */
export function effectFilter(id: string, table: EffectPreset[]): string | null {
  const hit = table.find((e) => e.id === id);
  return hit ? hit.filter : null;
}

/** 取全部 id（给工具 schema 的 enum 用，保证前后端同一份清单）。 */
export function effectIds(table: EffectPreset[]): string[] {
  return table.map((e) => e.id);
}

/** 生成「id=中文名（说明）」的紧凑清单文本（塞进工具描述，让模型知道有哪些可选）。 */
export function effectCatalogText(table: EffectPreset[], excludeIds: string[] = []): string {
  const skip = new Set(excludeIds);
  const byGroup = new Map<string, EffectPreset[]>();
  for (const e of table) {
    if (skip.has(e.id)) continue;
    const arr = byGroup.get(e.group) || [];
    arr.push(e);
    byGroup.set(e.group, arr);
  }
  const parts: string[] = [];
  for (const [g, list] of byGroup) {
    parts.push(`${g}：${list.map((e) => `${e.id}=${e.label}`).join('、')}`);
  }
  return parts.join('；');
}

/**
 * 按 group 分组（UI 的 <optgroup> 直接消费）。
 * ★ UI 与工具 schema 用**同一份**分组结构：面板里看到的顺序 = 模型能选到的顺序，
 *   不会出现"UI 里有这个滤镜但模型不知道"这类漂移。
 */
export function groupEffects(table: EffectPreset[], excludeIds: string[] = []): Array<{ group: string; items: EffectPreset[] }> {
  const skip = new Set(excludeIds);
  const byGroup = new Map<string, EffectPreset[]>();
  for (const e of table) {
    if (skip.has(e.id)) continue;
    const arr = byGroup.get(e.group) || [];
    arr.push(e);
    byGroup.set(e.group, arr);
  }
  return [...byGroup.entries()].map(([group, items]) => ({ group, items }));
}

// ===== 关键帧表达式（缩放/位移/透明度动画的单一实现） =====

/** 一个关键帧：t 为段内时间比例（0~1），v 为属性值。 */
export interface KfPoint { t: number; v: number }

/**
 * 关键帧点列 → ffmpeg 分段线性表达式（嵌套 if(lt(...))）。
 *
 * ★★★ 为什么是唯一实现（2026-10-08）：缩放/位移/透明度三处都要生成同形状的表达式，
 *   各写一份必然漂移；且表达式正确性靠单测锁定（此处输出直接进 ffmpeg，错了不报错只不生效）。
 * 语义：点之间线性插值，首点之前取首值、末点之后取末值（clamp，不外推）。
 * 输入不要求有序（内部按 t 排序）；空/单点返回常量。
 * @param varName ffmpeg 表达式里的时间变量（zoompan 用 'ot'，geq 用 'T'）
 */
export function buildPiecewiseExpr(points: KfPoint[], varName: string): string {
  const pts = points
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .map((p) => ({ t: Math.max(0, Math.min(1, p.t)), v: p.v }))
    .sort((a, b) => a.t - b.t);
  if (!pts.length) return '0';
  if (pts.length === 1) return fmtNum(pts[0].v);
  // 去重相邻同 t（保留后者），避免除零
  const dedup: KfPoint[] = [];
  for (const p of pts) {
    if (dedup.length && Math.abs(dedup[dedup.length - 1].t - p.t) < 1e-6) dedup[dedup.length - 1] = p;
    else dedup.push(p);
  }
  if (dedup.length === 1) return fmtNum(dedup[0].v);
  // 从后往前拼嵌套：if(lt(T,t1), lerp(v0,v1), if(lt(T,t2), lerp(v1,v2), vLast))
  let expr = fmtNum(dedup[dedup.length - 1].v);
  for (let i = dedup.length - 2; i >= 0; i--) {
    const a = dedup[i], b = dedup[i + 1];
    const span = b.t - a.t;
    const lerp = span < 1e-6
      ? fmtNum(b.v)
      : `(${fmtNum(a.v)}+${fmtNum(b.v - a.v)}*(${varName}-${fmtNum(a.t)})/${fmtNum(span)})`;
    expr = `if(lt(${varName},${fmtNum(b.t)}),${lerp},${expr})`;
  }
  return expr;
}

function fmtNum(n: number): string {
  return Number(n.toFixed(6)).toString();
}

// ===== 关键帧缓动（easing）=====
//
// ★★★ 为什么需要（2026-10-30）：此前所有关键帧都是**分段线性**插值 ——
//   运镜一律"匀速起、匀速停"，这正是"模板味"的最大来源。商用剪辑软件之所以
//   看起来顺滑，靠的就是 ease-in-out 这类缓动曲线。
//
// 做法：**在生成表达式之前把缓动采样成更多线性点**。
//   · 渲染侧零改动（还是 buildPiecewiseExpr，只是点变多）；
//   · 线性段不插点（表达式长度不变，老工程出片逐字节一致）；
//   · 采样密度可调（默认 16 点/段，肉眼已分辨不出折线）。

/** 缓动类型。语义：**本点 → 下一点**之间的过渡方式。 */
export type EaseType = 'linear' | 'in' | 'out' | 'inout' | 'bezier';

/** 带缓动的关键帧点（KfPoint + 过渡到下一段的缓动）。 */
export interface EasePoint extends KfPoint {
  ease?: EaseType;
  /** ease=bezier 时的四个控制点参数 [x1,y1,x2,y2]（与 CSS cubic-bezier 同义） */
  bezier?: [number, number, number, number];
}

const EASE_BEZIER: Record<Exclude<EaseType, 'linear' | 'bezier'>, [number, number, number, number]> = {
  // 与 CSS 同名曲线一致，观感可预期：
  in: [0.42, 0, 1, 1],
  out: [0, 0, 0.58, 1],
  inout: [0.42, 0, 0.58, 1],
};

/**
 * 三次贝塞尔缓动求值：给定线性进度 x∈[0,1]，返回缓动后的 y。
 *
 * 端点固定为 (0,0) 与 (1,1)，控制点为 (x1,y1)/(x2,y2) —— 与 CSS cubic-bezier 同义。
 * x(t) 在 [0,1] 上单调（控制点 x 钳在 0~1 时），用牛顿迭代反解 t，失败退回二分。
 * 这些数值细节必须正确：错了不会报错，只会让运镜"看起来有点怪"。
 */
export function cubicBezierEase(x: number, x1: number, y1: number, x2: number, y2: number): number {
  const cx = Math.max(0, Math.min(1, x));
  if (cx <= 0) return 0;
  if (cx >= 1) return 1;
  const ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cxx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1, by = 3 * y2 - 6 * y1, cyy = 3 * y1;
  const sampleX = (t: number) => ((ax * t + bx) * t + cxx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cyy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cxx;

  // 牛顿迭代（初值取 x，通常 3~4 步即收敛）
  let t = cx;
  for (let i = 0; i < 8; i++) {
    const d = sampleX(t) - cx;
    if (Math.abs(d) < 1e-6) return sampleY(t);
    const s = slopeX(t);
    if (Math.abs(s) < 1e-6) break;
    t -= d / s;
  }
  // 退化/越界 → 二分兜底（x(t) 单调）
  let lo = 0, hi = 1;
  t = cx;
  for (let i = 0; i < 32; i++) {
    const v = sampleX(t);
    if (Math.abs(v - cx) < 1e-6) break;
    if (v < cx) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return sampleY(t);
}

/** 按类型求缓动值（linear/缺省 = 原样返回）。 */
export function easeValue(x: number, ease?: EaseType, bezier?: [number, number, number, number]): number {
  const p = Math.max(0, Math.min(1, x));
  if (!ease || ease === 'linear') return p;
  if (ease === 'bezier') {
    const b = bezier && bezier.length === 4 ? bezier : EASE_BEZIER.inout;
    return cubicBezierEase(p, b[0], b[1], b[2], b[3]);
  }
  const b = EASE_BEZIER[ease];
  return cubicBezierEase(p, b[0], b[1], b[2], b[3]);
}

/** 单段最多插多少个点（防止表达式膨胀：4 个关键帧 × 16 ≈ 64 点已是上限量级）。 */
export const EASE_SAMPLES = 16;
/** 表达式总点数硬上限（超出后自动降低采样密度）。 */
const EASE_MAX_POINTS = 96;

/**
 * 把带缓动的关键帧点列**重采样**成纯线性点列（供 buildPiecewiseExpr 用）。
 *
 * 规则：
 *   · 只有「本点 ease 非 linear」的段才插点 —— 全线性输入原样返回（零性能/零行为变化）；
 *   · 每段插 samples 个中间点（不含两端重复点）；
 *   · 首尾值严格保留（避免缓动求值的浮点误差改变端点）；
 *   · 输入不要求有序（内部排序）；
 *   · 点数超过 EASE_MAX_POINTS 时自动降采样，保证 ffmpeg 表达式不至于过长。
 */
export function easePointList(pts: EasePoint[], samples: number = EASE_SAMPLES): KfPoint[] {
  const sorted = pts
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .map((p) => ({ ...p, t: Math.max(0, Math.min(1, p.t)) }))
    .sort((a, b) => a.t - b.t);
  if (sorted.length < 2) return sorted.map((p) => ({ t: p.t, v: p.v }));
  const needsEase = sorted.some((p, i) => i < sorted.length - 1 && p.ease && p.ease !== 'linear');
  if (!needsEase) return sorted.map((p) => ({ t: p.t, v: p.v }));

  // 采样密度：保证总点数不炸
  const segCount = sorted.length - 1;
  const n = Math.max(2, Math.min(samples, Math.floor((EASE_MAX_POINTS - sorted.length) / Math.max(1, segCount))));

  const out: KfPoint[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = sorted[i], b = sorted[i + 1];
    const span = b.t - a.t;
    out.push({ t: a.t, v: a.v });
    if (span > 1e-9 && a.ease && a.ease !== 'linear') {
      for (let k = 1; k < n; k++) {
        const x = k / n;
        const e = easeValue(x, a.ease, a.bezier);
        out.push({ t: a.t + span * x, v: a.v + (b.v - a.v) * e });
      }
    }
  }
  const last = sorted[sorted.length - 1];
  out.push({ t: last.t, v: last.v });
  return out;
}


// ===== 曲线变速（speed ramp）=====
//
// ★★★ 为什么必须"切片"而不是一条表达式（2026-10-30 定案）：
//   ffmpeg 没有内置变速曲线。理论上可以用一条分段 setpts 表达式表达
//   （输出时间 = 速度的积分，分段线性速度→分段二次），但**音轨做不到**：
//   atempo 只接受常量，rubberband 也不支持时变。视频动了音频不动 = 音画分离。
//   所以走"按源时间切成 N 段、每段恒定倍速、再拼起来"，音画同一套切片边界。
//
// ★ 时间语义（务必分清）：
//   · points 的 t 是**源时间**比例 0~1（这段素材被裁后的区间），speed 是该处倍速；
//   · 输出时长 = Σ(每片源长 ÷ 该片倍速) —— 比源时长更短或更长取决于倍速。

export interface SpeedPoint { t: number; speed: number }
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4;
/** 切片数：8 段已能做出顺滑的"慢入快出"，再高只是多付编码次数。 */
export const SPEED_SLICES = 8;

/** 在 points 上线性插值取 t 处的倍速（首尾之外 clamp）。 */
export function speedAt(points: SpeedPoint[], t: number): number {
  if (!points.length) return 1;
  const x = Math.max(0, Math.min(1, t));
  if (x <= points[0].t) return points[0].speed;
  const last = points[points.length - 1];
  if (x >= last.t) return last.speed;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (x <= b.t) {
      const span = b.t - a.t;
      return span <= 1e-9 ? b.speed : a.speed + (b.speed - a.speed) * ((x - a.t) / span);
    }
  }
  return last.speed;
}

/**
 * 把曲线量化成 N 个恒定倍速的切片（每片取中点倍速）。
 * ★ 渲染、时长计算、预览定位**必须**都用这一份切片结果，否则三处口径漂移
 *   （典型症状：时间轴长度与成片对不上，字幕整体偏移且无人报错）。
 */
export function speedSlices(points: SpeedPoint[], n: number = SPEED_SLICES): Array<{ t0: number; t1: number; speed: number }> {
  const count = Math.max(2, Math.round(n));
  const out: Array<{ t0: number; t1: number; speed: number }> = [];
  for (let i = 0; i < count; i++) {
    const t0 = i / count;
    const t1 = (i + 1) / count;
    const speed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, speedAt(points, (t0 + t1) / 2)));
    out.push({ t0, t1, speed });
  }
  return out;
}

/** 曲线是否真的有变化（整体差 < 2% 视作恒定，不必切片）。 */
export function speedCurveIsFlat(points: SpeedPoint[]): boolean {
  if (points.length < 2) return true;
  const speeds = points.map((p) => p.speed);
  return Math.max(...speeds) - Math.min(...speeds) < 0.02;
}

/** 曲线下的**输出**总时长（srcLen = 被裁后的源时长，秒）。 */
export function speedCurveDuration(points: SpeedPoint[], srcLen: number, n: number = SPEED_SLICES): number {
  if (!(srcLen > 0)) return 0;
  let total = 0;
  for (const s of speedSlices(points, n)) total += (srcLen * (s.t1 - s.t0)) / s.speed;
  return total;
}

/**
 * 输出时间偏移 → 源时间偏移（预览定位 / 抽帧用）。
 * 逐片累加输出时长，找到落在哪一片，再按该片倍速换算。
 */
export function speedCurveOutToSrc(points: SpeedPoint[], outOffset: number, srcLen: number, n: number = SPEED_SLICES): number {
  if (!(srcLen > 0)) return 0;
  const slices = speedSlices(points, n);
  let cursorOut = 0;
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const srcSpan = srcLen * (s.t1 - s.t0);
    const outSpan = srcSpan / s.speed;
    if (outOffset < cursorOut + outSpan || i === slices.length - 1) {
      return srcLen * s.t0 + Math.max(0, outOffset - cursorOut) * s.speed;
    }
    cursorOut += outSpan;
  }
  return srcLen;
}

/**
 * 画中画锚点：overlay 的 x/y 表达式（可用 main_w/main_h/overlay_w/overlay_h）。
 * ★ 与字幕 9 宫格同一套方位语义，UI 与渲染共用（单一真相源）。
 */
export const OVERLAY_POSITIONS: Array<{
  id: string; label: string; x: string; y: string;
  /** 该锚点等价的比例坐标（-0.5~0.5，0=居中）—— UI 细调位置/打关键帧时用来做初值，别再手写一份 */
  fx: number; fy: number;
}> = [
  { id: 'topleft', label: '左上', x: 'main_w*0.04', y: 'main_h*0.04', fx: -0.25, fy: -0.25 },
  { id: 'top', label: '上中', x: '(main_w-overlay_w)/2', y: 'main_h*0.04', fx: 0, fy: -0.25 },
  { id: 'topright', label: '右上', x: 'main_w-overlay_w-main_w*0.04', y: 'main_h*0.04', fx: 0.25, fy: -0.25 },
  { id: 'left', label: '左中', x: 'main_w*0.04', y: '(main_h-overlay_h)/2', fx: -0.25, fy: 0 },
  { id: 'center', label: '居中', x: '(main_w-overlay_w)/2', y: '(main_h-overlay_h)/2', fx: 0, fy: 0 },
  { id: 'right', label: '右中', x: 'main_w-overlay_w-main_w*0.04', y: '(main_h-overlay_h)/2', fx: 0.25, fy: 0 },
  { id: 'bottomleft', label: '左下', x: 'main_w*0.04', y: 'main_h-overlay_h-main_h*0.04', fx: -0.25, fy: 0.25 },
  { id: 'bottom', label: '下中', x: '(main_w-overlay_w)/2', y: 'main_h-overlay_h-main_h*0.04', fx: 0, fy: 0.25 },
  { id: 'bottomright', label: '右下', x: 'main_w-overlay_w-main_w*0.04', y: 'main_h-overlay_h-main_h*0.04', fx: 0.25, fy: 0.25 },
];

export function overlayAnchorOf(id: string | undefined): { x: string; y: string } {
  const hit = OVERLAY_POSITIONS.find((p) => p.id === id);
  return hit ? { x: hit.x, y: hit.y } : { x: OVERLAY_POSITIONS[8].x, y: OVERLAY_POSITIONS[8].y };
}

// ===== 混合模式（blend mode）=====
//
// ★★★ 为什么要有这张表（2026-10-31，P0-3 混合模式）：
//   画中画此前只能普通覆盖（src-over），做不出剪映的「双重曝光」（滤色/叠加）
//   与「提亮光斑」（线性减淡）。混合模式同时驱动 **UI 下拉 / 工具参数 / 渲染滤镜**，
//   与 COLOR_EFFECTS 同一条铁律：新增一个模式只改这里一处。
//
// ★ 字段分工（三者缺一不可）：
//   · id     —— 对外参数值（工程文件 / 工具 / UI）；
//   · mode   —— ffmpeg `blend` 滤镜的 all_mode 名。**不能直接拿 id 当 mode**：
//               ffmpeg 里没有 'add'，加法叫 'addition'（实测文档口径），id≠mode 是常态；
//   · neutral—— 中性填充色：blend 是**全画面**运算，而画中画只占一块，
//               其余像素必须填「该模式下不改变下层」的颜色（滤色→黑、正片叠底→白、
//               叠加/柔光→中灰），否则整帧会被一起提亮/压暗。这是本实现的正确性前提。
export type BlendModeId = 'normal' | 'screen' | 'multiply' | 'overlay' | 'softlight' | 'add' | 'darken' | 'lighten';

export interface BlendModePreset {
  id: BlendModeId;
  /** 中文名（UI 下拉与工具描述共用） */
  label: string;
  /** 一句话观感（给模型选模式用，也作 UI tooltip） */
  desc: string;
  /** ffmpeg blend 的 all_mode 值；null = 不做混合（普通覆盖，走 overlay 路径） */
  mode: string | null;
  /** 该模式下对下层无影响的中性色 #RRGGBB；normal 为 null */
  neutral: string | null;
}

export const BLEND_MODES: BlendModePreset[] = [
  { id: 'normal', label: '正常', desc: '普通覆盖（默认，不做混合）', mode: null, neutral: null },
  { id: 'screen', label: '滤色', desc: '提亮叠影：暗部透出下层，双重曝光/光斑', mode: 'screen', neutral: '#000000' },
  { id: 'multiply', label: '正片叠底', desc: '压暗叠影：亮部被压暗，压字/烟雾/阴影', mode: 'multiply', neutral: '#FFFFFF' },
  { id: 'overlay', label: '叠加', desc: '对比增强：暗更暗亮更亮，质感强化', mode: 'overlay', neutral: '#808080' },
  { id: 'softlight', label: '柔光', desc: '柔和提对比，人像/氛围柔化', mode: 'softlight', neutral: '#808080' },
  { id: 'add', label: '线性减淡', desc: '加法提亮：光斑/火焰/粒子叠加', mode: 'addition', neutral: '#000000' },
  { id: 'darken', label: '变暗', desc: '只取更暗的像素，暗部压叠影', mode: 'darken', neutral: '#FFFFFF' },
  { id: 'lighten', label: '变亮', desc: '只取更亮的像素，亮部透出', mode: 'lighten', neutral: '#000000' },
];

/** 按 id 取混合模式；未知/缺省返回 null（调用方按「正常覆盖」处理，绝不猜）。 */
export function blendModeOf(id: string | undefined): BlendModePreset | null {
  if (!id) return null;
  const key = String(id).trim().toLowerCase();
  return BLEND_MODES.find((m) => m.id === key) || null;
}

/** 全部合法 id（工具 schema 的 enum 与 UI 下拉同源）。 */
export function blendModeIds(): BlendModeId[] {
  return BLEND_MODES.map((m) => m.id);
}

/** 生成「id=中文名（观感）」清单（塞进工具描述；从注册表生成，不手写第二份）。 */
export function blendCatalogText(): string {
  return BLEND_MODES.filter((m) => m.id !== 'normal').map((m) => `${m.id}=${m.label}（${m.desc}）`).join('、');
}

// ===== 图层关键帧（P0-2：画中画/文字层的变换与透明度动画）=====
//
// ★ 一套数据两种消费方式（同语义，不许分叉）：
//   · 渲染：交给 buildPiecewiseExpr 生成 ffmpeg 时间表达式（逐帧求值）；
//   · 预览：交给 sampleLayerKfs 直接算出某一时刻的数值（单帧）。
//   t 一律是**层内** 0~1 比例（0=层起始，1=层结束），与段关键帧的时间语义一致。
export interface LayerKfPoint {
  t: number;
  /** 相对画面宽/高的中心偏移（-0.5~0.5，0=居中） */
  x?: number;
  y?: number;
  /** 相对基准尺寸的倍数（1=原尺寸） */
  scale?: number;
  /** 旋转角度（度，正=顺时针） */
  rotation?: number;
  /** 不透明度 0~1 */
  opacity?: number;
  /** 本点 → 下一点的过渡曲线 */
  ease?: EaseType;
  bezier?: [number, number, number, number];
}

/**
 * 图层变换的静态值（P0-2b：文字层与画中画同语义）。
 * ★ 单一真相源：ClipText.transform、Layer.transform、ASS 生成（\pos/\frz/\fscx/\fscx）共用这一份，
 *   否则"工程里存的是什么"与"渲出来的是什么"会各说一套。
 * ★ x/y 是**相对画面宽高的中心偏移**（-0.5~0.5，0=居中），不是像素。
 */
export interface LayerTransform {
  x?: number; y?: number; scale?: number; rotation?: number; opacity?: number;
}

/** 关键帧采样结果 = 变换静态值（同一组字段）。 */
export type LayerKfValues = LayerTransform;

const LAYER_KF_KEYS = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;

// ===== 特效层（P1-3）=====
//
// ★ 与 ClipSegment.fx（片段特效）的区别：片段特效挂在片段上、整段生效；
//   特效层有自己的 start/end，可以只在某 2 秒里闪一下，也可以多条叠加（闪光 + 颗粒）。
//
// ★ 两类实现（渲染分流，见 clip-render 的特效层步骤）：
//   · source —— 程序化生成一段全屏素材（暖白光 / 暖橙漏光 / 黑白点），
//               按 alpha 叠在上层；强度 = alpha。
//   · filter —— 直接作用在主画面上（胶片颗粒），用 enable 限定时间窗口。
//
// ★ 为什么是注册表而不是渲染里 if (fx === 'flash')：工具 schema、UI 卡片、op 归一化
//   三处都要认同一份 id 清单；写第二份必然漂移（本项目反复踩过）。

export type EffectLayerKind = 'source' | 'filter';

export interface EffectLayerPreset {
  id: string;
  label: string;
  /** 一句话观感（UI 卡片与工具描述共用） */
  desc: string;
  kind: EffectLayerKind;
  /** 默认强度 0~1（op 不传 intensity 时用它） */
  defaultIntensity: number;
}

export const EFFECT_LAYERS: EffectLayerPreset[] = [
  { id: 'flash', label: '闪光', desc: '暖白闪一下，卡点 / 转场强调', kind: 'source', defaultIntensity: 0.55 },
  { id: 'light-leak', label: '漏光', desc: '暖橙光晕轻微闪烁，胶片 / 回忆感', kind: 'source', defaultIntensity: 0.7 },
  { id: 'sparkle', label: '星点闪烁', desc: '随机白点闪烁，梦幻 / 庆典氛围', kind: 'source', defaultIntensity: 0.7 },
  { id: 'grain', label: '胶片颗粒', desc: '动态噪点，复古 / 纪实质感', kind: 'filter', defaultIntensity: 0.4 },
];

/** 按 id 查特效层预设；未知/空返回 null（调用方应"什么都不加"，绝不回退到别的特效）。 */
export function effectLayerOf(id: string | undefined): EffectLayerPreset | null {
  const key = String(id ?? '').trim().toLowerCase();
  if (!key) return null;
  return EFFECT_LAYERS.find((e) => e.id === key) || null;
}

export function effectLayerIds(): string[] {
  return EFFECT_LAYERS.map((e) => e.id);
}

/** 紧凑清单「id=名称（说明）」—— 工具描述与报错信息共用。 */
export function effectLayerCatalogText(): string {
  return EFFECT_LAYERS.map((e) => `${e.id}=${e.label}（${e.desc}）`).join('、');
}

/**
 * 在层内时间 t（0~1）采样关键帧得到变换值。
 * ★ 每个属性**独立插值**（只给了 scale 的点不参与 x 的插值），否则稀疏打点会互相拉扯；
 *   端点之外 clamp（不外推）；没有该属性的点一律忽略。
 */
export function sampleLayerKfs(pts: LayerKfPoint[] | undefined, t: number): LayerKfValues {
  const out: LayerKfValues = {};
  if (!pts?.length) return out;
  const tc = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  for (const key of LAYER_KF_KEYS) {
    const ps = pts
      .filter((p) => Number.isFinite(p[key] as number))
      .map((p) => ({ t: Math.max(0, Math.min(1, p.t)), v: p[key] as number, ease: p.ease, bezier: p.bezier }))
      .sort((a, b) => a.t - b.t);
    if (!ps.length) continue;
    if (tc <= ps[0].t) { out[key] = ps[0].v; continue; }
    const last = ps[ps.length - 1];
    if (tc >= last.t) { out[key] = last.v; continue; }
    for (let i = 1; i < ps.length; i++) {
      const a = ps[i - 1], b = ps[i];
      if (tc <= b.t) {
        const span = b.t - a.t;
        const e = span < 1e-9 ? 1 : easeValue((tc - a.t) / span, a.ease, a.bezier);
        out[key] = a.v + (b.v - a.v) * e;
        break;
      }
    }
  }
  return out;
}