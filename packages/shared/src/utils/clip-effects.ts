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

export interface EffectPreset {
  /** 对外 id（工具参数值 / UI 选项值） */
  id: string;
  /** 中文名（UI 与工具描述共用） */
  label: string;
  /** 一句话说明它长什么样（给模型选效果用，也作 UI tooltip） */
  desc: string;
  /** ffmpeg 滤镜串（不含首尾逗号）；空串表示"不变" */
  filter: string;
  /** 分类（UI 分组用）。★ 值域必须覆盖全部表用到的分组 —— 漏一个就是编译期报错（好事，
   *  比 runtime 静默归类错误强）。 */
  group: EffectGroup;
}

/** 效果分组（滤镜 / 转场 / 文字 / 音效 四张表共用；UI 按这个顺序渲染分组）。 */
export type EffectGroup =
  | '基础' | '人像' | '电影' | '复古' | '风格化' | '特殊'   // 滤镜
  | '滑动' | '形状' | '特效'                                 // 转场
  | '进阶'                                                   // 文字动画
  | '变声' | '空间'                                          // 音效
  | '分屏' | '抠像';                                         // 蒙版

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
 * 字幕样式模板 —— 一键套用成套样式（对标剪映/必剪的"字幕模板"）。
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
    position?: 'bottom' | 'center' | 'top';
    safeArea?: boolean;
    /** 默认动画（用户仍可在属性面板改） */
    animation?: string;
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

/**
 * 画中画锚点：overlay 的 x/y 表达式（可用 main_w/main_h/overlay_w/overlay_h）。
 * ★ 与字幕 9 宫格同一套方位语义，UI 与渲染共用（单一真相源）。
 */
export const OVERLAY_POSITIONS: Array<{ id: string; label: string; x: string; y: string }> = [
  { id: 'topleft', label: '左上', x: 'main_w*0.04', y: 'main_h*0.04' },
  { id: 'top', label: '上中', x: '(main_w-overlay_w)/2', y: 'main_h*0.04' },
  { id: 'topright', label: '右上', x: 'main_w-overlay_w-main_w*0.04', y: 'main_h*0.04' },
  { id: 'left', label: '左中', x: 'main_w*0.04', y: '(main_h-overlay_h)/2' },
  { id: 'center', label: '居中', x: '(main_w-overlay_w)/2', y: '(main_h-overlay_h)/2' },
  { id: 'right', label: '右中', x: 'main_w-overlay_w-main_w*0.04', y: '(main_h-overlay_h)/2' },
  { id: 'bottomleft', label: '左下', x: 'main_w*0.04', y: 'main_h-overlay_h-main_h*0.04' },
  { id: 'bottom', label: '下中', x: '(main_w-overlay_w)/2', y: 'main_h-overlay_h-main_h*0.04' },
  { id: 'bottomright', label: '右下', x: 'main_w-overlay_w-main_w*0.04', y: 'main_h-overlay_h-main_h*0.04' },
];

export function overlayAnchorOf(id: string | undefined): { x: string; y: string } {
  const hit = OVERLAY_POSITIONS.find((p) => p.id === id);
  return hit ? { x: hit.x, y: hit.y } : { x: OVERLAY_POSITIONS[8].x, y: OVERLAY_POSITIONS[8].y };
}