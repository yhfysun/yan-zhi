/**
 * 内置系列皮肤（builtin skin series）
 *
 * 每个内置主题色配一整套同系列纹理，全部为内联 SVG data URI（零图片资源依赖、
 * 跟随主题色程序化生成）。覆盖部位：
 *   wallpaper(深/浅) / 分类标签(catTag) / 会话列表(taskList) / 输入框(input) /
 *   按钮(button) / 弹窗(dialog) / 弹窗标题栏(titlebar) / 菜单(menu) /
 *   代码模式(code) / 浏览器外壳(browser) / 滚动条(scrollbar)
 *
 * 同一系列内每个部位图案不同（横幅斜纹/点阵/波纹/叶片/弧纹各有变化），
 * 跨系列风格迥异（印章纸墨 / 水墨 / 靛染星空 / 山雾竹影 / 陶纹暖沙）。
 */

/** SVG → data URI（属性统一用单引号，减小编码体积） */
function uri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SVG_HEAD = `xmlns='http://www.w3.org/2000/svg'`;

/** 系列色板 */
interface Palette {
  paper: string; // 浅底主色
  paper2: string; // 浅底渐变副色
  dark: string; // 深底主色
  dark2: string; // 深底渐变副色
  primary: string; // 系列主色
  deep: string; // 深主色
  accent: string; // 强调色
  soft: string; // 浅主色（高亮用）
}

/**
 * 系列纹理母题：决定各部位图案的形状语言
 * 后 5 个（cloud/culm/ripple/crackle/dune）为「高级简约」系列：
 * 线条更细、留白更多，配色走低饱和东方色（霁蓝 / 苍竹 / 碧潭 / 月白瓷 / 砂丘）。
 */
type Motif = 'seal' | 'ink' | 'tie' | 'bamboo' | 'weave' | 'cloud' | 'culm' | 'ripple' | 'crackle' | 'dune';

/** 各系列色板 */
const P: Record<string, Palette> = {
  /* ===== 共同底：中浅「有色相的纸色」（2026-09-18 第四版定稿）=====
     前三版教训：① 饱和刺眼 → ② 降饱和发灰（"太老气"）→ ③ 提亮到近白后图形全部看不见
     （"没啥变化"，headless 截图证实整张是白纸）。
     定稿：底色必须是**能看出色相的中浅纸色**，而不是近白；配合图形 opacity 0.3~0.6 一档，
     每套才能一眼可辨。面板/控件仍走半透明玻璃，不影响可读性。
     改配色必须同步 stores/settings.ts 的 THEMES 与 views/Settings.vue 的 chip 色。 */
  cinnabar: { paper: '#F7EDE5', paper2: '#EFDACA', dark: '#201412', dark2: '#2C1B18', primary: '#C7382E', deep: '#8E2318', accent: '#E06A50', soft: '#F09A82' },
  ink: { paper: '#EFEFEC', paper2: '#DFDFDA', dark: '#16181C', dark2: '#20232A', primary: '#3A3F47', deep: '#1E2126', accent: '#6B7280', soft: '#A9B0B8' },
  indigo: { paper: '#E6EEF8', paper2: '#D3E2F3', dark: '#101B2A', dark2: '#16283E', primary: '#2864A8', deep: '#173A6B', accent: '#4C8BD0', soft: '#8FB8E5' },
  pine: { paper: '#E5F0E9', paper2: '#D0E5D9', dark: '#0F1F19', dark2: '#162E24', primary: '#2E7D5B', deep: '#1C5540', accent: '#4FA97F', soft: '#8FCBB2' },
  clay: { paper: '#F8EBDF', paper2: '#EFD8C3', dark: '#211712', dark2: '#2E211A', primary: '#C4704F', deep: '#8E4527', accent: '#E09778', soft: '#F2C0A6' },
  // ===== 简约系列（同一策略：中浅有色相底 + 鲜亮东方色）=====
  cloud: { paper: '#E8F0F8', paper2: '#D5E4F2', dark: '#0F1B26', dark2: '#16293B', primary: '#5B8DB8', deep: '#35648E', accent: '#8FB8DA', soft: '#BCD6EC' },
  bamboo: { paper: '#E8F2E6', paper2: '#D4E7D1', dark: '#101D12', dark2: '#182B1B', primary: '#6CA96E', deep: '#417347', accent: '#94C496', soft: '#C0DEBE' },
  ripple: { paper: '#E1F1F1', paper2: '#CBE7E8', dark: '#0D1D1F', dark2: '#142C30', primary: '#2AA198', deep: '#177774', accent: '#58C4C0', soft: '#97DFDB' },
  /* 瓷·冰 = 白瓷 + 冰块（2026-09-18 第三版定稿）。
     前两版的问题：① primary 用影青釉青 #6B9184 → 变青瓷；② 改银白后底色太白，
     而冰块的"受光面是纯白"→ **白块在白底上根本看不见**，只剩暗块 → 整体发灰没感觉。
     定稿关键：**底色必须比"受光面白块"略暗一档**，白块才跳得出来（这是冰的体积感来源）。
     所以底 = 瓷白偏冷 #F4F9FC（不是纯白），配纯白棱面 + 冷蓝背光面 + 斜向反光带。
     与云霁（饱和天蓝）、涟碧（湖青）区分：瓷冰是白为主、近看才见冷蓝。 */
  porcelain: { paper: '#F4F9FC', paper2: '#DFEDF6', dark: '#141C23', dark2: '#1E2A34', primary: '#7C9AAD', deep: '#4E6B80', accent: '#A8C6D8', soft: '#DCEAF0' },
  dune: { paper: '#F8EFDC', paper2: '#EFE0C0', dark: '#1D170F', dark2: '#2A2115', primary: '#C99559', deep: '#96682F', accent: '#E2B87A', soft: '#F2D6A8' },
};

/** 母题平铺单元（用于 <pattern>，线条低透明度保证任意底色可读） */
function motifTile(m: Motif, c: Palette, size: number, op: number): string {
  const s = size;
  switch (m) {
    /* 经典系列的母题同步"瘦身"（2026-09-18）：线条更细、图形更小、留白更多。
       透明度仍由 op 统一控制，这里只调形状与权重，避免平铺后显得碎、花。 */
    case 'seal': // 印章斜纹 + 小方印（方印缩小压淡，只作点缀）
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<path d='M0 ${s}L${s} 0' stroke='${c.primary}' stroke-opacity='${op * 0.7}' stroke-width='0.9'/>` +
        `<rect x='${s * 0.2}' y='${s * 0.2}' width='${s * 0.13}' height='${s * 0.13}' rx='${s * 0.03}' fill='none' stroke='${c.primary}' stroke-opacity='${op * 0.45}' stroke-width='0.9'/></pattern>`;
    case 'ink': // 墨晕点阵（大小双圆，缩小留白）
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<circle cx='${s * 0.3}' cy='${s * 0.3}' r='${s * 0.12}' fill='${c.primary}' fill-opacity='${op}'/>` +
        `<circle cx='${s * 0.75}' cy='${s * 0.72}' r='${s * 0.06}' fill='${c.primary}' fill-opacity='${op * 0.6}'/></pattern>`;
    case 'tie': // 靛染双波纹（次纹压淡，避免两道一样重显乱）
      return `<pattern id='m' width='${s * 2}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<path d='M0 ${s * 0.5}Q${s * 0.5} 0 ${s} ${s * 0.5}T${s * 2} ${s * 0.5}' fill='none' stroke='${c.primary}' stroke-opacity='${op}' stroke-width='1'/>` +
        `<path d='M0 ${s * 0.78}Q${s * 0.5} ${s * 0.28} ${s} ${s * 0.78}T${s * 2} ${s * 0.78}' fill='none' stroke='${c.primary}' stroke-opacity='${op * 0.4}' stroke-width='0.8'/></pattern>`;
    case 'bamboo': // 松针束（松绿·雾专用）：短枝 + 两束放射针叶 —— 原竹叶三片与"松"名不符
      return `<pattern id='m' width='${s * 1.6}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<g fill='none' stroke='${c.primary}' stroke-linecap='round'>` +
        `<path d='M0 ${s * 0.4}h${s * 0.75}' stroke-opacity='${op}' stroke-width='1.1'/>` +
        `<path d='M${s * 0.4} ${s * 0.4}l${s * 0.26} -${s * 0.16}M${s * 0.4} ${s * 0.4}l${s * 0.3} -${s * 0.02}M${s * 0.4} ${s * 0.4}l${s * 0.24} ${s * 0.16}' stroke-opacity='${op}' stroke-width='0.8'/>` +
        `<path d='M${s * 0.75} ${s * 0.4}l${s * 0.24} -${s * 0.14}M${s * 0.75} ${s * 0.4}l${s * 0.28} ${s * 0.02}M${s * 0.75} ${s * 0.4}l${s * 0.2} ${s * 0.18}' stroke-opacity='${op * 0.7}' stroke-width='0.8'/>` +
        `<path d='M${s * 0.15} ${s * 0.85}l${s * 0.24} -${s * 0.12}M${s * 0.15} ${s * 0.85}l${s * 0.28} ${s * 0.04}' stroke-opacity='${op * 0.45}' stroke-width='0.8'/>` +
        `</g></pattern>`;
    /* ===== 简约系列：全部遵循「平铺轴两端同色 / 端点对齐」约束 =====
       竖向跨界的元素（竹竿、开片竖裂）起止 y 必须分别为 0 与 s，
       横向跨界的元素（水波、涟漪）起止 x 必须分别为 0 与 s，否则接缝处会错位断开。 */
    case 'cloud': // 流云：如意云头 + 飘带（细线，大留白）
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<g fill='none' stroke='${c.primary}' stroke-opacity='${op}' stroke-width='1.1' stroke-linecap='round'>` +
        `<path d='M${s * 0.1} ${s * 0.58}a${s * 0.15} ${s * 0.15} 0 0 1 ${s * 0.22} -${s * 0.11}a${s * 0.12} ${s * 0.12} 0 0 1 ${s * 0.19} ${s * 0.02}a${s * 0.11} ${s * 0.11} 0 0 1 ${s * 0.14} ${s * 0.13}'/>` +
        `<path d='M${s * 0.16} ${s * 0.82}q${s * 0.28} -${s * 0.16} ${s * 0.56} ${s * 0.02}' stroke-opacity='${op * 0.55}'/>` +
        `</g></pattern>`;
    case 'culm': // 竹：粗竿 + 竹节 + 细竿 + 两片叶
      return `<pattern id='m' width='${s * 1.5}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<g fill='none' stroke='${c.primary}' stroke-opacity='${op}' stroke-linecap='round'>` +
        `<path d='M${s * 0.34} 0V${s}' stroke-width='1.7'/>` +
        `<path d='M${s * 0.27} ${s * 0.32}h${s * 0.14}M${s * 0.27} ${s * 0.76}h${s * 0.14}' stroke-width='1.2'/>` +
        `<path d='M${s * 1.02} 0V${s}' stroke-width='0.9' stroke-opacity='${op * 0.5}'/>` +
        `<path d='M${s * 0.96} ${s * 0.5}h${s * 0.12}' stroke-width='0.9' stroke-opacity='${op * 0.5}'/>` +
        `<path d='M${s * 0.34} ${s * 0.5}q${s * 0.3} -${s * 0.2} ${s * 0.56} -${s * 0.13}' stroke-width='1'/>` +
        `<path d='M${s * 0.98} ${s * 0.68}q${s * 0.24} -${s * 0.07} ${s * 0.38} -${s * 0.26}' stroke-width='0.9' stroke-opacity='${op * 0.65}'/>` +
        `</g></pattern>`;
    case 'ripple': // 涟漪：两道横向水波（起止 y 相同，横向平铺不断）
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<g fill='none' stroke='${c.primary}' stroke-width='1' stroke-linecap='round'>` +
        `<path d='M0 ${s * 0.56}q${s * 0.25} -${s * 0.28} ${s * 0.5} 0q${s * 0.25} ${s * 0.28} ${s * 0.5} 0' stroke-opacity='${op}'/>` +
        `<path d='M0 ${s * 0.88}q${s * 0.25} -${s * 0.2} ${s * 0.5} 0q${s * 0.25} ${s * 0.2} ${s * 0.5} 0' stroke-opacity='${op * 0.5}'/>` +
        `</g></pattern>`;
    case 'crackle': // 碎冰（白瓷）：不规则小冰砖，靠抖动而非等分，减弱瓷砖感
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<g fill='none' stroke='${c.primary}' stroke-width='0.9' stroke-linejoin='round'>` +
        `<path d='M0 0L${s * 0.58} ${s * 0.05}L${s * 0.5} ${s * 0.44}L0 ${s * 0.47}Z' stroke-opacity='${op}'/>` +
        `<path d='M${s * 0.58} ${s * 0.05}L${s} 0L${s} ${s * 0.52}L${s * 0.5} ${s * 0.44}Z' stroke-opacity='${op * 0.7}'/>` +
        `<path d='M0 ${s * 0.47}L${s * 0.5} ${s * 0.44}L${s * 0.62} ${s * 0.96}L0 ${s}Z' stroke-opacity='${op * 0.75}'/>` +
        `<path d='M${s * 0.5} ${s * 0.44}L${s} ${s * 0.52}L${s} ${s}L${s * 0.62} ${s * 0.96}Z' stroke-opacity='${op * 0.55}'/>` +
        `<path d='M${s * 0.2} ${s * 0.1}L${s * 0.16} ${s * 0.4}' stroke-opacity='${op * 0.3}'/>` +
        `<path d='M${s * 0.72} ${s * 0.6}L${s * 0.68} ${s * 0.92}' stroke-opacity='${op * 0.28}'/>` +
        `</g></pattern>`;
    case 'dune': // 砂丘沉积：短横线 + 细砂点（极简，靠点线节奏而非图形）
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<g fill='${c.primary}'>` +
        `<rect x='${s * 0.08}' y='${s * 0.3}' width='${s * 0.3}' height='1' fill-opacity='${op}'/>` +
        `<rect x='${s * 0.52}' y='${s * 0.3}' width='${s * 0.2}' height='1' fill-opacity='${op * 0.75}'/>` +
        `<rect x='${s * 0.2}' y='${s * 0.7}' width='${s * 0.26}' height='1' fill-opacity='${op * 0.65}'/>` +
        `<rect x='${s * 0.6}' y='${s * 0.7}' width='${s * 0.28}' height='1' fill-opacity='${op * 0.85}'/>` +
        `<circle cx='${s * 0.88}' cy='${s * 0.46}' r='${s * 0.035}' fill-opacity='${op * 0.75}'/>` +
        `<circle cx='${s * 0.14}' cy='${s * 0.86}' r='${s * 0.035}' fill-opacity='${op * 0.55}'/>` +
        `</g></pattern>`;
    case 'weave': // 陶纹同心弧（次弧压淡，只留一圈主弧）
    default:
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<path d='M0 ${s}A${s} ${s} 0 0 1 ${s} 0' fill='none' stroke='${c.primary}' stroke-opacity='${op}' stroke-width='1'/>` +
        `<path d='M0 ${s * 1.4}A${s * 1.4} ${s * 1.4} 0 0 1 ${s * 1.4} 0' fill='none' stroke='${c.primary}' stroke-opacity='${op * 0.4}' stroke-width='0.85'/></pattern>`;
  }
}

/** 线性渐变定义 */
function lg(id: string, from: string, to: string, angle: 'v' | 'd'): string {
  const c = angle === 'v'
    ? `<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>`
    : `<stop offset='0' stop-color='${from}'/><stop offset='0.55' stop-color='${to}'/><stop offset='1' stop-color='${from}'/>`;
  return `<linearGradient id='${id}' x1='0' y1='0' x2='${angle === 'v' ? 0 : 1}' y2='${angle === 'v' ? 1 : 0.35}'>${c}</linearGradient>`;
}

/** 径向晕染定义 */
function rg(id: string, color: string, op: number): string {
  return `<radialGradient id='${id}'><stop offset='0' stop-color='${color}' stop-opacity='${op}'/><stop offset='1' stop-color='${color}' stop-opacity='0'/></radialGradient>`;
}

/**
 * ===== 立体景深（2026-09-18 起，全套内置皮肤统一方向）=====
 * 背景：此前所有内置皮肤都是"平色块 + 淡轮廓线"，用户反馈「太平面/没感觉」。
 * 立体感的三个要素（缺一不可）：
 *   ① 斜面渐变：同一块层从**顶亮到底暗**（模拟受光），平色填充永远出不来体积；
 *   ② 轮廓光（rim light）：层顶那条边提亮，是"层与层分开"的关键；
 *   ③ 落影：上层在下层上投一条暗带，表达"谁在前谁在后"。
 * 全部做成内联 <defs>（整幅壁纸只画一次、不平铺，可自由用 id），id 由调用方保证唯一。
 */
function layer3d(
  id: string, d: string,
  cTop: string, cBot: string,      // 斜面上/下色
  rim: string,                      // 轮廓光色
  op: number, rimOp: number,
  shadow?: { d: string; dy: number; color: string; op: number },
): string {
  return `<defs><linearGradient id='${id}' x1='0' y1='0' x2='0' y2='1'>` +
    `<stop offset='0' stop-color='${cTop}'/><stop offset='0.6' stop-color='${cBot}'/><stop offset='1' stop-color='${cBot}'/>` +
    `</linearGradient></defs>` +
    (shadow ? `<path d='${shadow.d}' fill='${shadow.color}' fill-opacity='${shadow.op}' transform='translate(0 ${shadow.dy})'/>` : '') +
    `<path d='${d}' fill='url(#${id})' fill-opacity='${op}'/>` +
    `<path d='${d}' fill='none' stroke='${rim}' stroke-width='2.4' stroke-opacity='${rimOp}'/>`;
}

/** 透视分层：第 k/N 层的前缘 y（指数插值 → 近处间距大，形成纵深） */
function perspY(k: number, n: number, y0: number, y1: number, pow = 1.4): number {
  return y0 + (y1 - y0) * Math.pow(n <= 1 ? 0 : k / (n - 1), pow);
}

/** ===== 壁纸（按系列画标志性大图形，深浅两版） ===== */
function wallpaper(p: Palette, m: Motif, dark: boolean): string {
  const W = 1600, H = 1000;
  const base = dark ? lg('bg', p.dark, p.dark2, 'v') : lg('bg', p.paper, p.paper2, 'd');
  const inkOp = dark ? 1.6 : 1; // 深色下图形略提亮
  let deco = '';
  /**
   * 立体层简写（统一立体方向，2026-09-18）：斜面渐变 + 轮廓光 + 可选落影。
   * 用法：L('id唯一', 路径d, 面顶色, 面底色, 不透明度, 轮廓光强度, 落影?)
   * ⚠️ id 必须全局唯一（同一张图里多个层不能重名，否则后面的引用会指向第一个）。
   */
  const L = (
    id: string, d: string, cTop: string, cBot: string,
    op = 1, rimOp = 0.5,
    shadow?: { d: string; dy: number; color: string; op: number },
  ) => layer3d(id, d, cTop, cBot, dark ? p.soft : '#FFFFFF', op * inkOp, rimOp * inkOp,
    shadow ? { ...shadow, op: shadow.op * inkOp } : undefined);
  switch (m) {
    case 'seal': { // 朱砂：三层山峦（立体：斜面渐变 + 轮廓光 + 落影）+ 单枚闲章 + 暖阳
      const s1 = `M0 ${H * 0.62}Q${W * 0.16} ${H * 0.44} ${W * 0.34} ${H * 0.6}T${W * 0.68} ${H * 0.52}T${W} ${H * 0.62}V${H}H0Z`;
      const s2 = `M0 ${H * 0.78}Q${W * 0.22} ${H * 0.6} ${W * 0.46} ${H * 0.76}T${W} ${H * 0.7}V${H}H0Z`;
      const s3 = `M0 ${H * 0.9}Q${W * 0.32} ${H * 0.76} ${W * 0.62} ${H * 0.88}T${W} ${H * 0.85}V${H}H0Z`;
      deco =
        `<circle cx='${W * 0.76}' cy='${H * 0.2}' r='135' fill='url(#--sun)'/>` +
        `<rect x='${W * 0.14}' y='${H * 0.16}' width='64' height='64' rx='9' transform='rotate(10 ${W * 0.14} ${H * 0.16})' fill='${p.primary}' fill-opacity='${0.16 * inkOp}'/>` +
        `<rect x='${W * 0.14}' y='${H * 0.16}' width='64' height='64' rx='9' transform='rotate(10 ${W * 0.14} ${H * 0.16})' fill='none' stroke='${p.primary}' stroke-opacity='${0.5 * inkOp}' stroke-width='2.2'/>` +
        L('sn1', s1, p.soft, p.accent, 0.5, 0.4, { d: s2, dy: 10, color: p.deep, op: 0.14 }) +
        L('sn2', s2, p.accent, p.primary, 0.62, 0.42, { d: s3, dy: 9, color: p.deep, op: 0.18 }) +
        L('sn3', s3, p.primary, p.deep, 0.78, 0.36);
      break;
    }
    case 'ink': { // 松烟：远山云海（3D：层峦斜面 + 轮廓光 + 落影）+ 飞鸟 + 墨晕
      const k1 = `M0 ${H * 0.5}Q${W * 0.14} ${H * 0.3} ${W * 0.3} ${H * 0.46}T${W * 0.6} ${H * 0.4}T${W} ${H * 0.48}V${H}H0Z`;
      const k2 = `M0 ${H * 0.68}Q${W * 0.2} ${H * 0.5} ${W * 0.42} ${H * 0.66}T${W * 0.8} ${H * 0.6}T${W} ${H * 0.7}V${H}H0Z`;
      const k3 = `M0 ${H * 0.86}Q${W * 0.3} ${H * 0.72} ${W * 0.58} ${H * 0.84}T${W} ${H * 0.82}V${H}H0Z`;
      deco =
        `<circle cx='${W * 0.26}' cy='${H * 0.18}' r='240' fill='url(#--halo1)'/>` +
        `<circle cx='${W * 0.78}' cy='${H * 0.36}' r='300' fill='url(#--halo2)'/>` +
        L('ik1', k1, dark ? p.soft : p.accent, dark ? p.deep : p.primary, 0.3, 0.26, { d: k2, dy: 10, color: p.deep, op: 0.14 }) +
        L('ik2', k2, dark ? p.soft : p.primary, dark ? p.deep : p.deep, 0.42, 0.3, { d: k3, dy: 9, color: p.deep, op: 0.18 }) +
        L('ik3', k3, dark ? p.deep : p.deep, dark ? p.dark : p.deep, 0.5, 0.24) +
        `<path d='M${W * 0.6} ${H * 0.2}q30 -18 60 0M${W * 0.66} ${H * 0.24}q24 -14 48 0' fill='none' stroke='${dark ? p.soft : p.deep}' stroke-opacity='${0.52 * inkOp}' stroke-width='3.4' stroke-linecap='round'/>` +
        `<path d='M${W * 0.1} ${H * 0.62}Q${W * 0.3} ${H * 0.55} ${W * 0.52} ${H * 0.61}T${W} ${H * 0.58}' fill='none' stroke='${dark ? p.soft : '#FFFFFF'}' stroke-opacity='${0.3 * inkOp}' stroke-width='14' stroke-linecap='round'/>` +
        `<path d='M${W * 0.1} ${H * 0.74}Q${W * 0.34} ${H * 0.68} ${W * 0.6} ${H * 0.73}T${W} ${H * 0.7}' fill='none' stroke='${dark ? p.soft : '#FFFFFF'}' stroke-opacity='${0.22 * inkOp}' stroke-width='10' stroke-linecap='round'/>`;
      break;
    }
    case 'tie': { // 靛青：夜空 + 立体积层（扎染晕带做成起伏的"染缸地貌"）+ 疏星
      let stars = '';
      for (let i = 0; i < 45; i++) {
        const x = ((i * 331 + 97) % W), y = ((i * 197 + 53) % (H * 0.55)), r = 0.7 + ((i * 7) % 5) * 0.35;
        stars += `<circle cx='${x}' cy='${y}' r='${r.toFixed(1)}' fill='${dark ? '#E2E9F0' : p.primary}' fill-opacity='${dark ? (0.45 + ((i * 13) % 30) / 100) : 0.32}'/>`;
      }
      // 扎染起伏层：每层顶面渐变（靛深浅）+ 轮廓光（靛染的"白芯"）+ 落影
      const t1 = `M0 ${H * 0.52}Q${W * 0.16} ${H * 0.44} ${W * 0.34} ${H * 0.52}T${W * 0.7} ${H * 0.48}T${W} ${H * 0.54}V${H}H0Z`;
      const t2 = `M0 ${H * 0.68}Q${W * 0.2} ${H * 0.58} ${W * 0.44} ${H * 0.68}T${W * 0.78} ${H * 0.62}T${W} ${H * 0.7}V${H}H0Z`;
      const t3 = `M0 ${H * 0.84}Q${W * 0.28} ${H * 0.74} ${W * 0.54} ${H * 0.84}T${W} ${H * 0.8}V${H}H0Z`;
      deco = stars +
        `<circle cx='${W * 0.82}' cy='${H * 0.16}' r='110' fill='url(#--sun)'/>` +
        L('tie1', t1, dark ? p.primary : p.accent, dark ? p.deep : p.primary, 0.5, 0.4, { d: t2, dy: 10, color: p.deep, op: 0.2 }) +
        L('tie2', t2, dark ? p.deep : p.primary, dark ? p.dark : p.deep, 0.62, 0.36, { d: t3, dy: 9, color: p.deep, op: 0.22 }) +
        L('tie3', t3, dark ? p.dark : p.deep, dark ? p.dark : p.deep, 0.7, 0.28);
      break;
    }
    case 'bamboo': { // 松绿·雾：层峦 + 松枝针束（原竹叶与"松"不符）+ 雾带 + 日
      const g = dark ? p.soft : p.primary;
      const needle = (x: number, y: number, k: number, o: number) =>
        `<g fill='none' stroke='${g}' stroke-opacity='${o * inkOp}' stroke-width='2.4' stroke-linecap='round'>` +
        `<path d='M${W * x} ${H * y}l${W * 0.055 * k} -${H * 0.05 * k}M${W * x} ${H * y}l${W * 0.07 * k} -${H * 0.012 * k}M${W * x} ${H * y}l${W * 0.06 * k} ${H * 0.032 * k}'/>` +
        `</g>`;
      const m1 = `M0 ${H * 0.7}Q${W * 0.18} ${H * 0.58} ${W * 0.4} ${H * 0.68}T${W} ${H * 0.62}V${H}H0Z`;
      const m2 = `M0 ${H * 0.82}Q${W * 0.25} ${H * 0.7} ${W * 0.55} ${H * 0.8}T${W} ${H * 0.76}V${H}H0Z`;
      deco =
        L('pn1', m1, p.accent, p.primary, 0.42, 0.34, { d: m2, dy: 9, color: p.deep, op: 0.16 }) +
        L('pn2', m2, p.primary, p.deep, 0.62, 0.34) +
        `<rect x='0' y='${H * 0.55}' width='${W}' height='70' fill='${dark ? p.soft : '#FFFFFF'}' fill-opacity='${dark ? 0.06 : 0.34}'/>` +
        `<rect x='0' y='${H * 0.64}' width='${W}' height='44' fill='${dark ? p.soft : '#FFFFFF'}' fill-opacity='${dark ? 0.05 : 0.24}'/>` +
        // 松枝：枝干带厚度感（主干粗 + 针束）
        `<path d='M${W * 0.06} ${H * 0.26}h${W * 0.16}' fill='none' stroke='${p.deep}' stroke-opacity='${0.45 * inkOp}' stroke-width='6' stroke-linecap='round'/>` +
        `<path d='M${W * 0.06} ${H * 0.253}h${W * 0.16}' fill='none' stroke='${p.soft}' stroke-opacity='${0.3 * inkOp}' stroke-width='2' stroke-linecap='round'/>` +
        needle(0.14, 0.26, 1, 0.5) +
        needle(0.2, 0.24, 0.8, 0.4) +
        `<path d='M${W * 0.6} ${H * 0.34}h${W * 0.13}' fill='none' stroke='${p.deep}' stroke-opacity='${0.36 * inkOp}' stroke-width='4.8' stroke-linecap='round'/>` +
        needle(0.67, 0.34, 0.7, 0.38) +
        `<circle cx='${W * 0.8}' cy='${H * 0.18}' r='95' fill='url(#--sun)'/>`;
      break;
    }
    case 'cloud': { // 霁云：立体积云（顶亮底暗 + 落影）+ 细线飘带 + 雾带 + 淡日
      // 云要有体积：先用"暗底云"整体下沉一层当落影，再叠"亮顶云"，中间用小圆堆出起伏
      const cloud = (cx: number, cy: number, k: number, shadowOnly = false) => {
        const top = shadowOnly ? (dark ? p.deep : p.primary) : (dark ? p.soft : '#FFFFFF');
        const bot = dark ? p.deep : p.accent;
        const body = [
          `<ellipse cx='${cx}' cy='${cy}' rx='${W * 0.085 * k}' ry='${H * 0.038 * k}'/>`,
          `<ellipse cx='${cx - W * 0.05 * k}' cy='${cy + H * 0.012 * k}' rx='${W * 0.05 * k}' ry='${H * 0.028 * k}'/>`,
          `<ellipse cx='${cx + W * 0.055 * k}' cy='${cy + H * 0.014 * k}' rx='${W * 0.058 * k}' ry='${H * 0.03 * k}'/>`,
          `<circle cx='${cx - W * 0.012 * k}' cy='${cy - H * 0.024 * k}' r='${H * 0.032 * k}'/>`,
        ].join('');
        if (shadowOnly) {
          return `<g fill='${bot}' fill-opacity='${(dark ? 0.2 : 0.3) * k}' transform='translate(0 ${9 * k})'>${body}</g>`;
        }
        const id = `cf${Math.round(cx)}_${Math.round(cy)}`;
        return `<defs><linearGradient id='${id}' x1='0' y1='0' x2='0' y2='1'>` +
          `<stop offset='0' stop-color='${top}'/><stop offset='0.65' stop-color='${top}'/><stop offset='1' stop-color='${bot}'/>` +
          `</linearGradient></defs>` +
          `<g fill='url(#${id})' fill-opacity='${(dark ? 0.24 : 0.72) * k}'>${body}</g>` +
          // 云顶轮廓光
          `<ellipse cx='${cx - W * 0.012 * k}' cy='${cy - H * 0.034 * k}' rx='${W * 0.032 * k}' ry='${H * 0.012 * k}' fill='${dark ? p.soft : '#FFFFFF'}' fill-opacity='${(dark ? 0.18 : 0.8) * k}'/>`;
      };
      deco =
        `<circle cx='${W * 0.74}' cy='${H * 0.18}' r='120' fill='url(#--sun)'/>` +
        cloud(W * 0.3, H * 0.26, 1, true) +
        cloud(W * 0.3, H * 0.26, 1) +
        cloud(W * 0.68, H * 0.44, 0.75, true) +
        cloud(W * 0.68, H * 0.44, 0.75) +
        cloud(W * 0.2, H * 0.58, 0.55, true) +
        cloud(W * 0.2, H * 0.58, 0.55) +
        `<path d='M${W * 0.42} ${H * 0.35}q${W * 0.14} -${H * 0.025} ${W * 0.28} ${H * 0.01}' fill='none' stroke='${dark ? p.soft : p.primary}' stroke-opacity='${0.22 * inkOp}' stroke-width='2.4' stroke-linecap='round'/>` +
        `<path d='M${W * 0.1} ${H * 0.44}q${W * 0.1} -${H * 0.02} ${W * 0.2} ${H * 0.006}' fill='none' stroke='${dark ? p.soft : p.primary}' stroke-opacity='${0.14 * inkOp}' stroke-width='2' stroke-linecap='round'/>` +
        `<rect x='0' y='${H * 0.74}' width='${W}' height='80' fill='${dark ? p.soft : '#FFFFFF'}' fill-opacity='${dark ? 0.05 : 0.3}'/>` +
        `<rect x='0' y='${H * 0.85}' width='${W}' height='46' fill='${dark ? p.soft : '#FFFFFF'}' fill-opacity='${dark ? 0.035 : 0.2}'/>`;
      break;
    }
    case 'culm': { // 苍竹：左侧成林竹竿（粗细三级 + 明显竹节）+ 成簇竹叶 + 雾带
      const g = dark ? p.soft : p.primary;
      const culm = (x: number, w: number, o: number) =>
        `<g stroke='${g}' stroke-opacity='${o * inkOp}' fill='none' stroke-linecap='round'>` +
        `<path d='M${W * x} ${H}V${H * 0.02}' stroke-width='${w}'/>` +
        `<path d='M${W * x - w * 0.85} ${H * 0.24}h${w * 1.7}M${W * x - w * 0.85} ${H * 0.48}h${w * 1.7}M${W * x - w * 0.85} ${H * 0.72}h${w * 1.7}' stroke-width='${w * 0.45}' stroke-opacity='${o * 1.3 * inkOp}'/>` +
        `</g>`;
      const leaf = (x: number, y: number, k: number, flip = 1) =>
        `<path d='M${W * x} ${H * y}q${W * 0.09 * k * flip} -${H * 0.05 * k} ${W * 0.17 * k * flip} -${H * 0.02 * k}q-${W * 0.08 * k * flip} ${H * 0.035 * k} -${W * 0.17 * k * flip} ${H * 0.02 * k}Z' fill='${g}' fill-opacity='${(dark ? 0.3 : 0.4) * inkOp}'/>`;
      deco =
        culm(0.1, 30, 0.32) +
        culm(0.165, 16, 0.24) +
        culm(0.215, 9, 0.16) +
        leaf(0.115, 0.3, 1) + leaf(0.13, 0.38, 0.7, -1) +
        leaf(0.18, 0.52, 0.8) + leaf(0.19, 0.58, 0.55, -1) +
        leaf(0.1, 0.66, 0.6) +
        `<rect x='0' y='${H * 0.62}' width='${W}' height='76' fill='${dark ? p.soft : '#FFFFFF'}' fill-opacity='${dark ? 0.06 : 0.3}'/>` +
        `<rect x='0' y='${H * 0.75}' width='${W}' height='50' fill='${dark ? p.soft : '#FFFFFF'}' fill-opacity='${dark ? 0.045 : 0.2}'/>`;
      break;
    }
    case 'ripple': { // 碧潭：立体水波（每道波带顶亮底暗 + 轮廓光）+ 月与倒影 + 碎波光
      const g = dark ? p.soft : p.primary;
      const wave = (id: number, y: number, amp: number, o: number) => {
        const d = `M0 ${H * y}q${W * 0.12} -${H * amp} ${W * 0.24} ${0}t${W * 0.24} 0t${W * 0.24} 0t${W * 0.24} 0V${H}H0Z`;
        return L(`wv${id}`, d, dark ? p.primary : '#FFFFFF', dark ? p.dark : p.accent, o, o * 0.9);
      };
      deco =
        `<circle cx='${W * 0.8}' cy='${H * 0.16}' r='115' fill='url(#--sun)'/>` +
        // 月在水中的倒影（竖向拉长的亮柱 = 水面的立体纵深）
        `<defs><linearGradient id='moonglow' x1='0' y1='0' x2='0' y2='1'>` +
        `<stop offset='0' stop-color='${p.soft}' stop-opacity='${0.4 * inkOp}'/><stop offset='1' stop-color='${p.soft}' stop-opacity='0'/></linearGradient></defs>` +
        `<rect x='${W * 0.775}' y='${H * 0.26}' width='${W * 0.05}' height='${H * 0.5}' fill='url(#moonglow)'/>` +
        wave(1, 0.46, 0.035, 0.5) +
        wave(2, 0.56, 0.03, 0.44) +
        wave(3, 0.66, 0.026, 0.38) +
        wave(4, 0.76, 0.022, 0.32) +
        wave(5, 0.86, 0.018, 0.26) +
        // 碎波光（近处更密更亮）
        (() => {
          let s = '';
          for (let row = 0; row < 6; row++) {
            const y = H * (0.5 + row * 0.085);
            for (let i = 0; i < 8; i++) {
              const x = W * (0.05 + i * 0.12) + ((row * 53) % 60) - 30;
              const len = 40 + ((row * 31 + i * 17) % 70);
              s += `<path d='M${x} ${y}h${len}' stroke='${row % 2 ? p.soft : g}' stroke-opacity='${(0.5 + row * 0.06) * inkOp}' stroke-width='${2.4 + row * 0.2}' stroke-linecap='round' fill='none'/>`;
            }
          }
          return s;
        })();
      break;
    }
    case 'crackle': { /* ★★ 冰河（3D 场景，2026-09-18 重做）
       前五版都在"冰块本身"上打转，用户否了五次，最后一次点破要害：
         「**没有河岸，也没有3d的感觉**」→ 缺的不是冰块细节，是**场景与透视**。
       这版改成完整场景（自远向近 5 层，越近越大越亮 = 空气透视）：
         ① 远岸（上缘）：雪坡 + 冰崖剪影，压住画面上方
         ② 河面中段：浮冰群（小块、偏冷偏暗 = 远）
         ③ 河面近段：大块浮冰（大、亮、带厚度侧面 + 落影）
         ④ 左右近岸：压住两角，围出"中间是河"的构图
         ⑤ 前景冰缘：最亮最大，横贯底部
       3D 要素：每块冰都有「顶面（亮）+ 厚度侧面（暗）+ 轮廓光 + 投在河面的落影」，
       层与层之间用落影拉开前后关系。 */
      const hash = (i: number, j: number, k: number) => {
        const x = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
        return x - Math.floor(x);
      };
      const iceTop = dark ? p.primary : '#FFFFFF';
      const iceSide = dark ? p.dark : p.accent;   // 厚度侧面（暗）
      const snowTop = dark ? p.deep : '#FFFFFF';
      const snowSide = dark ? p.dark : p.accent;

      // 一块浮冰：**棱角分明的不规则冰排**（冰是脆性断裂，不会是卵石圆角）
      // 顶面由 6~7 个抖动顶点构成，每个顶点独立抖动 → 块块形状不同；厚度侧面沿朝向观察者的边下压
      const floe = (id: string, cx: number, cy: number, rw: number, rh: number, near: number, seed: number) => {
        const n = 7;
        const pts: Array<[number, number]> = [];
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 - Math.PI * 0.5;
          const jr = 0.62 + hash(seed, k, 6) * 0.62;   // 半径抖动 → 棱角长短不一
          pts.push([cx + Math.cos(a) * rw * jr, cy + Math.sin(a) * rh * jr]);
        }
        const poly = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z';
        // 厚度：把「下半圈」顶点整体下移，形成可见的冰体侧面
        const low = pts.filter(([, y]) => y > cy - rh * 0.1);
        const side = low.length >= 2
          ? `M${low[0][0].toFixed(1)} ${low[0][1].toFixed(1)}` +
            low.slice(1).map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('') +
            low.slice().reverse().map(([x, y]) => `L${x.toFixed(1)} ${(y + 6 + near * 14).toFixed(1)}`).join('') + 'Z'
          : '';
        return layer3d(id, poly, iceTop, iceSide,
          dark ? p.soft : '#FFFFFF',
          (dark ? 0.44 : 0.66 + near * 0.3) * inkOp,
          (dark ? 0.2 + near * 0.18 : 0.34 + near * 0.5) * inkOp,
          side ? { d: side, dy: 2 + near * 6, color: dark ? '#000000' : p.deep, op: (dark ? 0.32 : 0.2) * inkOp } : undefined) +
          // 浮冰投在河面的落影（横向椭圆，越近越大）
          `<ellipse cx='${cx + rw * 0.08}' cy='${(cy + rh * 1.35).toFixed(1)}' rx='${(rw * 0.92).toFixed(1)}' ry='${(rh * 0.26).toFixed(1)}' fill='${dark ? '#000000' : p.primary}' fill-opacity='${(dark ? 0.26 : 0.11) * inkOp}'/>`;
      };

      // ① 远岸：雪坡 + 冰崖
      const farBank = `M0 0H${W}V${H * 0.17}C${W * 0.78} ${H * 0.1} ${W * 0.62} ${H * 0.2} ${W * 0.46} ${H * 0.15}C${W * 0.3} ${H * 0.1} ${W * 0.16} ${H * 0.19} 0 ${H * 0.13}Z`;
      // 侧面（雪坡的厚度 = 3D 关键）
      const farSide = `M0 ${H * 0.13}C${W * 0.16} ${H * 0.19} ${W * 0.3} ${H * 0.1} ${W * 0.46} ${H * 0.15}C${W * 0.62} ${H * 0.2} ${W * 0.78} ${H * 0.1} ${W} ${H * 0.17}V${H * 0.22}C${W * 0.78} ${H * 0.15} ${W * 0.62} ${H * 0.25} ${W * 0.46} ${H * 0.2}C${W * 0.3} ${H * 0.15} ${W * 0.16} ${H * 0.24} 0 ${H * 0.18}Z`;
      // 左右近岸
      const bankL = `M0 ${H * 0.44}C${W * 0.07} ${H * 0.5} ${W * 0.1} ${H * 0.62} ${W * 0.06} ${H * 0.74}C${W * 0.04} ${H * 0.84} ${W * 0.05} ${H * 0.94} 0 ${H}V${H * 0.44}Z`;
      const bankR = `M${W} ${H * 0.36}C${W * 0.93} ${H * 0.44} ${W * 0.9} ${H * 0.56} ${W * 0.94} ${H * 0.7}C${W * 0.97} ${H * 0.82} ${W * 0.95} ${H * 0.93} ${W} ${H}V${H * 0.36}Z`;
      // 前景冰缘
      const fore = `M0 ${H * 0.9}C${W * 0.16} ${H * 0.85} ${W * 0.3} ${H * 0.94} ${W * 0.48} ${H * 0.9}S${W * 0.8} ${H * 0.95} ${W} ${H * 0.88}V${H}H0Z`;
      const foreSide = `M0 ${H * 0.9}C${W * 0.16} ${H * 0.85} ${W * 0.3} ${H * 0.94} ${W * 0.48} ${H * 0.9}S${W * 0.8} ${H * 0.95} ${W} ${H * 0.88}V${H}H0Z`;

      // ②③ 浮冰群：远小块（上）→ 近大块（下）
      let floes = '';
      const rows: Array<[number, number, number, number]> = [
        [0.24, 7, 0.02, 0],
        [0.36, 6, 0.03, 0.35],
        [0.5, 5, 0.045, 0.6],
        [0.66, 4, 0.06, 0.8],
      ];
      rows.forEach(([y, n, size, near], ri) => {
        for (let i = 0; i < n; i++) {
          const cx = W * ((i + 0.5) / n) + (hash(ri, i, 1) - 0.5) * W * 0.1;
          const cy = H * y + (hash(ri, i, 2) - 0.5) * H * 0.06;
          const rw = W * size * (0.72 + hash(ri, i, 3) * 0.85);
          // 扁长比也随机：有的接近方，有的拉长成冰排
          const ratio = 0.34 + hash(ri, i, 7) * 0.3;
          floes += floe(`fl${ri}_${i}`, cx, cy, rw, rw * ratio, near, ri * 31 + i * 7);
        }
      });

      deco =
        `<circle cx='${W * 0.78}' cy='${H * 0.08}' r='150' fill='url(#--sun)'/>` +
        // 河面底色（比两岸暗，形成"中间是河"）
        `<rect x='0' y='${H * 0.12}' width='${W}' height='${H * 0.82}' fill='${dark ? p.deep : p.paper2}' fill-opacity='${(dark ? 0.5 : 0.5) * inkOp}'/>` +
        // 河面纵向渐变（远处冷暗、近处亮）→ 透视
        `<defs><linearGradient id='riv' x1='0' y1='0' x2='0' y2='1'>` +
        `<stop offset='0' stop-color='${dark ? p.dark : p.primary}' stop-opacity='0.32'/>` +
        `<stop offset='0.55' stop-color='${dark ? p.deep : p.accent}' stop-opacity='0.14'/>` +
        `<stop offset='1' stop-color='${dark ? p.primary : '#FFFFFF'}' stop-opacity='${dark ? 0.2 : 0.5}'/>` +
        `</linearGradient></defs>` +
        `<rect x='0' y='${H * 0.12}' width='${W}' height='${H * 0.82}' fill='url(#riv)'/>` +
        floes +
        // ① 远岸（顶面 + 厚度侧面的暗带 → 站起来的雪坡）
        layer3d('bankSide', farSide, snowSide, snowSide, dark ? p.soft : '#FFFFFF', (dark ? 0.4 : 0.5) * inkOp, 0.2 * inkOp) +
        layer3d('bank', farBank, snowTop, dark ? p.deep : p.accent, dark ? p.soft : '#FFFFFF', (dark ? 0.5 : 0.92) * inkOp, (dark ? 0.3 : 0.75) * inkOp) +
        // ④ 左右近岸（带厚度侧面）
        layer3d('bkL', bankL, dark ? p.primary : '#FFFFFF', dark ? p.dark : p.accent, dark ? p.soft : '#FFFFFF', (dark ? 0.4 : 0.7) * inkOp, (dark ? 0.24 : 0.55) * inkOp) +
        layer3d('bkR', bankR, dark ? p.primary : '#FFFFFF', dark ? p.dark : p.accent, dark ? p.soft : '#FFFFFF', (dark ? 0.4 : 0.7) * inkOp, (dark ? 0.24 : 0.55) * inkOp) +
        // ⑤ 前景冰缘（最亮，压住底部）
        layer3d('foreSide', foreSide, iceSide, iceSide, dark ? p.soft : '#FFFFFF', (dark ? 0.3 : 0.4) * inkOp, 0.16 * inkOp, { d: foreSide, dy: 14, color: p.deep, op: dark ? 0.3 : 0.14 }) +
        layer3d('fore', fore, iceTop, iceSide, dark ? p.soft : '#FFFFFF', (dark ? 0.5 : 0.96) * inkOp, (dark ? 0.34 : 0.85) * inkOp) +
        /* ===== 瓷器感（用户：瓷冰要有瓷器感 + 冰块的3d）=====
           冰块与河岸已经有了，缺的是"这是瓷器上的画"这层。
           两件事：① **釉面光泽** —— 一条宽的斜向高光扫过全幅（瓷器釉面的镜面反光）；
                   ② **开片纹** —— 金丝铁线式的细裂纹网格覆盖全幅（哥窑/汝窑的标志）。 */
        // ① 釉面斜向高光：**窄而柔**（先前 0.34/0.5 宽幅像激光束，瓷器釉光是细长的一道）
        `<defs><linearGradient id='glaze' x1='0' y1='0' x2='1' y2='1'>` +
        `<stop offset='0' stop-color='#FFFFFF' stop-opacity='0'/>` +
        `<stop offset='0.46' stop-color='#FFFFFF' stop-opacity='${dark ? 0.04 : 0.2}'/>` +
        `<stop offset='0.5' stop-color='#FFFFFF' stop-opacity='${dark ? 0.07 : 0.32}'/>` +
        `<stop offset='0.54' stop-color='#FFFFFF' stop-opacity='${dark ? 0.04 : 0.2}'/>` +
        `<stop offset='1' stop-color='#FFFFFF' stop-opacity='0'/></linearGradient></defs>` +
        `<path d='M${-W * 0.06} ${H * 0.92}L${W * 0.36} ${-H * 0.08}L${W * 0.44} ${-H * 0.08}L${W * 0.02} ${H * 0.92}Z' fill='url(#glaze)'/>` +
        `<path d='M${W * 0.6} ${H * 1.04}L${W * 0.88} ${-H * 0.04}L${W * 0.92} ${-H * 0.04}L${W * 0.64} ${H * 1.04}Z' fill='url(#glaze)'/>` +
        // ② 开片（金丝铁线）：不规则折线网格 + 少量长贯裂纹
        (() => {
          let cracks = '';
          const nn = 13;
          for (let i = 1; i < nn; i++) {
            let d = `M${(W / nn) * i + (hash(i, 0, 11) - 0.5) * 90} 0`;
            for (let j = 1; j <= 6; j++) {
              d += `L${(W / nn) * i + (hash(i, j, 12) - 0.5) * 130} ${(H / 6) * j}`;
            }
            cracks += `<path d='${d}'/>`;
          }
          for (let i = 1; i < 7; i++) {
            let d = `M0 ${(H / 7) * i + (hash(0, i, 13) - 0.5) * 60}`;
            for (let j = 1; j <= 9; j++) {
              d += `L${(W / 9) * j} ${(H / 7) * i + (hash(j, i, 14) - 0.5) * 90}`;
            }
            cracks += `<path d='${d}'/>`;
          }
          // 铁线（粗且深）叠在金丝（细且浅）之上，还原"金丝铁线"两种开片
          return `<g fill='none' stroke='${dark ? p.soft : p.deep}' stroke-width='1' stroke-linejoin='round' stroke-opacity='${(dark ? 0.26 : 0.2) * inkOp}'>${cracks}</g>` +
            `<g fill='none' stroke='${dark ? p.soft : p.primary}' stroke-width='1.6' stroke-linejoin='round' stroke-opacity='${(dark ? 0.2 : 0.14) * inkOp}'>` +
            `<path d='M0 ${H * 0.3}L${W * 0.3} ${H * 0.34}L${W * 0.62} ${H * 0.28}L${W} ${H * 0.36}'/>` +
            `<path d='M${W * 0.3} ${H * 0.34}L${W * 0.26} ${H * 1}'/>` +
            `<path d='M${W * 0.62} ${H * 0.28}L${W * 0.68} ${H * 1}'/>` +
            `<path d='M${W * 0.34} 0L${W * 0.42} ${H * 0.6}L${W * 0.36} ${H * 1}'/>` +
            `</g>`;
        })();
      break;
    }
    case 'dune': { // 砂丘：三层丘体（立体：斜面 + 丘顶轮廓光 + 落影）+ 贴丘日 + 风纹
      const g = dark ? p.soft : p.primary;
      const q1 = `M0 ${H * 0.56}C${W * 0.22} ${H * 0.42} ${W * 0.4} ${H * 0.66} ${W * 0.62} ${H * 0.54}S${W * 0.9} ${H * 0.4} ${W} ${H * 0.5}V${H}H0Z`;
      const q2 = `M0 ${H * 0.74}C${W * 0.26} ${H * 0.6} ${W * 0.48} ${H * 0.84} ${W * 0.7} ${H * 0.72}S${W * 0.92} ${H * 0.58} ${W} ${H * 0.68}V${H}H0Z`;
      const q3 = `M0 ${H * 0.9}C${W * 0.3} ${H * 0.8} ${W * 0.52} ${H * 0.96} ${W * 0.76} ${H * 0.88}S${W * 0.94} ${H * 0.8} ${W} ${H * 0.86}V${H}H0Z`;
      deco =
        `<circle cx='${W * 0.72}' cy='${H * 0.34}' r='125' fill='url(#--sun)'/>` +
        L('dn1', q1, p.soft, p.primary, 0.42, 0.5, { d: q2, dy: 10, color: p.deep, op: 0.16 }) +
        L('dn2', q2, p.primary, p.deep, 0.6, 0.44, { d: q3, dy: 9, color: p.deep, op: 0.18 }) +
        L('dn3', q3, p.deep, p.deep, 0.5, 0.3) +
        `<g fill='none' stroke='${g}' stroke-opacity='${0.26 * inkOp}' stroke-width='2.2' stroke-linecap='round'>` +
        `<path d='M${W * 0.08} ${H * 0.3}q${W * 0.06} -${H * 0.03} ${W * 0.12} 0'/>` +
        `<path d='M${W * 0.28} ${H * 0.22}q${W * 0.05} -${H * 0.025} ${W * 0.1} 0'/>` +
        `<path d='M${W * 0.5} ${H * 0.38}q${W * 0.05} -${H * 0.025} ${W * 0.1} 0'/>` +
        `</g>`;
      break;
    }
    case 'weave': // 陶土：立体陶轮（同心弧带宽窄渐变 + 高光）+ 沙丘两层（带体积）
    default: {
      // 陶轮：每个同心环画成"环带"（外沿暗 + 内沿亮），模拟拉坯的立体旋纹
      const rings = [100, 165, 230];
      const wheel = rings.map((r, idx) => {
        const id = `ring${idx}`;
        return `<defs><radialGradient id='${id}' cx='0.5' cy='0.5' r='0.5'>` +
          `<stop offset='0.82' stop-color='${dark ? p.deep : p.accent}' stop-opacity='0'/>` +
          `<stop offset='0.9' stop-color='${dark ? p.primary : p.primary}' stop-opacity='${0.3 * inkOp}'/>` +
          `<stop offset='0.96' stop-color='${dark ? p.soft : '#FFFFFF'}' stop-opacity='${0.45 * inkOp}'/>` +
          `<stop offset='1' stop-color='${dark ? p.primary : p.deep}' stop-opacity='${0.34 * inkOp}'/>` +
          `</radialGradient></defs>` +
          `<circle cx='${W * 0.76}' cy='${H * 0.26}' r='${r}' fill='none' stroke='url(#${id})' stroke-width='16'/>`;
      }).join('');
      const d1 = `M0 ${H * 0.8}Q${W * 0.3} ${H * 0.66} ${W * 0.6} ${H * 0.78}T${W} ${H * 0.72}V${H}H0Z`;
      const d2 = `M0 ${H * 0.9}Q${W * 0.35} ${H * 0.78} ${W * 0.68} ${H * 0.88}T${W} ${H * 0.84}V${H}H0Z`;
      deco =
        L('cl1', d1, dark ? p.soft : '#FFFFFF', p.primary, 0.5, 0.42, { d: d2, dy: 10, color: p.deep, op: 0.18 }) +
        L('cl2', d2, p.primary, p.deep, 0.62, 0.34) +
        wheel;
      break;
    }
  }
  // ===== 全局图形浓度（2026-09-18 第四版）：前几版图形全被"底色太白 + 透明度太低"吃掉，
  // 用户连看三版都反馈"没啥变化"。这里统一提档，各系列再各自微调。
  const sun = rg('--sun', dark ? p.soft : p.accent, dark ? 0.34 : 0.46);
  const halo1 = rg('--halo1', dark ? p.soft : p.primary, dark ? 0.2 : 0.15);
  const halo2 = rg('--halo2', dark ? p.soft : p.deep, dark ? 0.24 : 0.17);
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMidYMid slice'>` +
    `<defs>${base}${sun}${halo1}${halo2}${motifTile(m, p, 26, 0.16)}</defs>` +
    `<rect width='${W}' height='${H}' fill='url(#bg)'/>` +
    `<rect width='${W}' height='${H}' fill='url(#m)'/>${deco}</svg>`);
}

/** ===== 分类标签横幅（220×64，主色条 + 明显母题纹理） ===== */
function catTag(p: Palette, m: Motif): string {
  const g = lg('bg', p.paper, p.paper2, 'd');
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 220 64' preserveAspectRatio='xMidYMid slice'>` +
    `<defs>${g}${motifTile(m, p, 18, 0.24)}<linearGradient id='a' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='${p.primary}' stop-opacity='0.85'/><stop offset='1' stop-color='${p.accent}' stop-opacity='0.55'/></linearGradient></defs>` +
    `<rect width='220' height='64' fill='url(#bg)'/>` +
    `<rect width='220' height='64' fill='url(#m)'/>` +
    `<rect width='6' height='64' fill='url(#a)'/></svg>`);
}

/** ===== 会话/任务列表底纹（420×300） =====
    可见度说明：图案叠在半透明玻璃面板之上，透明度过低（<0.1）会完全看不见，
    这里按"能看清纹理又不压文字"调至 0.16 / 行线 0.14 */
function taskList(p: Palette, m: Motif): string {
  const rows: string[] = [];
  for (let y = 18; y < 300; y += 44) rows.push(`<line x1='16' y1='${y}' x2='404' y2='${y}' stroke='${p.primary}' stroke-opacity='0.14' stroke-width='1'/>`);
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 420 300'>` +
    `<defs>${motifTile(m, p, 30, 0.16)}</defs>` +
    `<rect width='420' height='300' fill='url(#m)'/>${rows.join('')}</svg>`);
}

/** ===== 输入框底纹（320×72 母题点阵，明显可辨） ===== */
function inputPat(p: Palette, m: Motif): string {
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 320 72'>` +
    `<defs>${motifTile(m, p, 22, 0.22)}</defs>` +
    `<rect width='320' height='72' fill='url(#m)'/></svg>`);
}

/** ===== 按钮微纹（180×44） ===== */
function buttonPat(p: Palette, m: Motif): string {
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 180 44'>` +
    `<defs>${motifTile(m, p, 14, 0.2)}</defs>` +
    `<rect width='180' height='44' fill='url(#m)'/></svg>`);
}

/** ===== 弹窗底图（760×520 大晕染 + 角饰，主视觉级可见度） ===== */
function dialogPat(p: Palette, m: Motif): string {
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 760 520' preserveAspectRatio='xMidYMid slice'>` +
    `<defs>${rg('h1', p.primary, 0.26)}${rg('h2', p.accent, 0.2)}${motifTile(m, p, 28, 0.12)}</defs>` +
    `<rect width='760' height='520' fill='url(#m)'/>` +
    `<circle cx='660' cy='60' r='220' fill='url(#h1)'/>` +
    `<circle cx='80' cy='480' r='180' fill='url(#h2)'/></svg>`);
}

/** ===== 弹窗标题栏（760×56 主色带 + 母题白纹） ===== */
function titlebarPat(p: Palette, m: Motif): string {
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 760 56' preserveAspectRatio='xMidYMid slice'>` +
    `<defs><linearGradient id='bg' x1='0' y1='0' x2='1' y2='0'>` +
    `<stop offset='0' stop-color='${p.primary}'/><stop offset='1' stop-color='${p.deep}'/></linearGradient>` +
    motifTile(m, { ...p, primary: '#FFFFFF' }, 20, 0.22).replace(`id='m'`, `id='mw'`) + `</defs>` +
    `<rect width='760' height='56' fill='url(#bg)'/>` +
    `<rect width='760' height='56' fill='url(#mw)'/></svg>`);
}

/** ===== 菜单底图（260×360：左主色竖条 + 竖向母题，明显可辨）
 *  dark=true 时底改用 p.dark 深底 + p.soft 亮母题，杜绝暗色主题白底白字 */
function menuPat(p: Palette, m: Motif, dark = false): string {
  const base = dark ? lg('bg', p.dark, p.dark2, 'v') : lg('bg', p.paper, p.paper2, 'v');
  const motifColor = dark ? { ...p, primary: p.soft } : p;
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 260 360' preserveAspectRatio='xMidYMid slice'>` +
    `<defs>${base}${motifTile(m, motifColor, 24, 0.18)}</defs>` +
    `<rect width='260' height='360' fill='url(#bg)'/>` +
    `<rect width='260' height='360' fill='url(#m)'/>` +
    `<rect width='5' height='360' fill='${p.primary}' fill-opacity='${dark ? 0.85 : 0.75}'/></svg>`);
}

/** ===== 代码模式底图（960×640：格网 + 角饰，区别于壁纸大图形） ===== */
function codePat(p: Palette, m: Motif): string {
  const lines: string[] = [];
  for (let x = 0; x <= 960; x += 48) lines.push(`<line x1='${x}' y1='0' x2='${x}' y2='640' stroke='${p.primary}' stroke-opacity='0.07' stroke-width='1'/>`);
  for (let y = 0; y <= 640; y += 48) lines.push(`<line x1='0' y1='${y}' x2='960' y2='${y}' stroke='${p.primary}' stroke-opacity='0.06' stroke-width='1'/>`);
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 960 640' preserveAspectRatio='xMidYMid slice'>` +
    `<defs>${motifTile(m, p, 26, 0.1)}${rg('h', p.primary, 0.16)}</defs>` +
    `<rect width='960' height='640' fill='url(#m)'/>${lines.join('')}` +
    `<circle cx='880' cy='580' r='200' fill='url(#h)'/></svg>`);
}

/** ===== 浏览器外壳横幅（920×80：横向母题 + 底部主色细条，明显可辨）
 *  dark=true 时底改用 p.dark 深底 + p.soft 亮母题，杜绝暗色主题白底白字 */
function browserPat(p: Palette, m: Motif, dark = false): string {
  const base = dark ? lg('bg', p.dark, p.dark2, 'd') : lg('bg', p.paper, p.paper2, 'd');
  const motifColor = dark ? { ...p, primary: p.soft } : p;
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 920 80' preserveAspectRatio='xMidYMid slice'>` +
    `<defs>${base}${motifTile(m, motifColor, 20, 0.2)}</defs>` +
    `<rect width='920' height='80' fill='url(#bg)'/>` +
    `<rect width='920' height='80' fill='url(#m)'/>` +
    `<rect y='77' width='920' height='3' fill='${p.primary}' fill-opacity='0.5'/></svg>`);
}

/** ===== 系列完整定义 ===== */
export interface BuiltinSkinSeries {
  /** skin id，形如 builtin:cinnabar */
  id: string;
  /** 展示名 */
  name: string;
  /** 选中系列时同步切换到的主题色 id */
  palette: string;
  wallpaper: { light: string; dark: string; mask: number; blur: number };
  preview: string;
  surface: {
    glass: string; glassDark: string;
    glassAlpha: number; glassAlphaDark: number;
    border: string; borderDark: string;
    radius: number; buttonRadius: number; glassBlur: number;
    overlayColor: string; overlayBlur: number;
    catTagPattern: string; taskListPattern: string; inputPattern: string;
    buttonPattern: string; dialogPattern: string; titlebarPattern: string;
    menuPattern: string; menuPatternDark: string;
    codePattern: string; browserPattern: string; browserPatternDark: string;
    scrollbarThumb: string; dividerColor: string;
    buttonText: string;
    /** 输入框边框色（EP 输入框与自定义输入容器共用） */
    inputBorder: string;
  };
}

const MOTIF_BY_ID: Record<string, Motif> = {
  cinnabar: 'seal', ink: 'ink', indigo: 'tie', pine: 'bamboo', clay: 'weave',
  cloud: 'cloud', bamboo: 'culm', ripple: 'ripple', porcelain: 'crackle', dune: 'dune',
};

const SERIES_NAME: Record<string, string> = {
  cinnabar: '朱砂·印', ink: '松烟·墨', indigo: '靛青·染', pine: '松绿·雾', clay: '陶土·纹',
  cloud: '云·霁', bamboo: '竹·篁', ripple: '涟·碧', porcelain: '瓷·冰', dune: '砂·丘',
};

/** 生成全部内置系列（模块加载时一次性生成，之后纯常量读取） */
function buildSeries(): BuiltinSkinSeries[] {
  const out: BuiltinSkinSeries[] = [];
  for (const id of Object.keys(P)) {
    const p = P[id];
    const m = MOTIF_BY_ID[id];
    const wl = wallpaper(p, m, false);
    const wd = wallpaper(p, m, true);
    // 深浅玻璃底色随系列：浅色用纸色，深色用系列深底
    const glass = p.paper, glassDark = p.dark;
    out.push({
      id: `builtin:${id}`,
      name: SERIES_NAME[id] || id,
      palette: id,
      wallpaper: {
        light: wl, dark: wd,
        // 构图已按系列做足浓度，遮罩调低只做轻微压底，别再糊掉图形（2026-09-18 第二轮反馈"没变化"的根因之一）
        mask: 0.16, blur: 4,
      },
      preview: wl,
      surface: {
        glass, glassDark,
        glassAlpha: 0.88, glassAlphaDark: 0.9,
        border: `color-mix(in srgb, ${p.primary} 22%, #E5DECF)`,
        borderDark: `color-mix(in srgb, ${p.primary} 30%, #2E2A26)`,
        radius: 14, buttonRadius: 8, glassBlur: 16,
        // 弹窗遮罩模糊：与 skin.css 的 --skin-overlay-blur 默认值保持一致（14px）。
        // 内置系列显式下发了 overlayBlur，改 CSS 回落值对它们无效 —— 要调两边一起改。
        overlayColor: darkOverlay(id), overlayBlur: 14,
        catTagPattern: uriOf(catTag(p, m)),
        taskListPattern: uriOf(taskList(p, m)),
        inputPattern: uriOf(inputPat(p, m)),
        buttonPattern: uriOf(buttonPat(p, m)),
        dialogPattern: uriOf(dialogPat(p, m)),
        titlebarPattern: uriOf(titlebarPat(p, m)),
        menuPattern: uriOf(menuPat(p, m)),
        menuPatternDark: uriOf(menuPat(p, m, true)),
        codePattern: uriOf(codePat(p, m)),
        browserPattern: uriOf(browserPat(p, m)),
        browserPatternDark: uriOf(browserPat(p, m, true)),
        scrollbarThumb: `color-mix(in srgb, ${p.primary} 45%, transparent)`,
        dividerColor: `color-mix(in srgb, ${p.primary} 18%, transparent)`,
        buttonText: '#FFFFFF',
        inputBorder: `color-mix(in srgb, ${p.primary} 26%, transparent)`,
      },
    });
  }
  return out;
}

/** 浅色主题下弹窗遮罩随系列微着色 */
function darkOverlay(id: string): string {
  switch (id) {
    case 'cinnabar': return 'rgba(124, 45, 18, 0.18)';
    case 'ink': return 'rgba(41, 37, 36, 0.22)';
    case 'indigo': return 'rgba(27, 49, 80, 0.2)';
    case 'pine': return 'rgba(29, 74, 54, 0.18)';
    case 'cloud': return 'rgba(44, 67, 86, 0.18)';
    case 'bamboo': return 'rgba(70, 82, 47, 0.16)';
    case 'ripple': return 'rgba(26, 78, 73, 0.18)';
    case 'porcelain': return 'rgba(67, 99, 90, 0.2)';
    case 'dune': return 'rgba(87, 76, 62, 0.18)';
    case 'clay': return 'rgba(126, 59, 42, 0.18)';
    default: return 'transparent';
  }
}

/** 包一层：catTag 等函数已返回 uri，这里再包是为了保持调用点一致（防御式） */
function uriOf(v: string): string {
  return v.startsWith('data:') ? v : uri(v);
}

export const BUILTIN_SKIN_SERIES: BuiltinSkinSeries[] = buildSeries();

export function isBuiltinSkinId(id: string): boolean {
  return typeof id === 'string' && id.startsWith('builtin:');
}

export function builtinSeriesFor(id: string): BuiltinSkinSeries | undefined {
  return BUILTIN_SKIN_SERIES.find((s) => s.id === id);
}

/** 内置系列对应主题色 id（builtin:cinnabar → cinnabar） */
export function builtinSeriesPalette(id: string): string | undefined {
  return builtinSeriesFor(id)?.palette;
}
