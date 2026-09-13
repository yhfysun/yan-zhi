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

/** 系列纹理母题：决定各部位图案的形状语言 */
type Motif = 'seal' | 'ink' | 'tie' | 'bamboo' | 'weave';

/** 各系列色板 */
const P: Record<string, Palette> = {
  cinnabar: { paper: '#F7F1E5', paper2: '#EFDCC3', dark: '#1F1512', dark2: '#2C1D15', primary: '#C2410C', deep: '#7C2D12', accent: '#B45309', soft: '#E8956B' },
  ink: { paper: '#F4F1EB', paper2: '#E7E2D8', dark: '#1A1A18', dark2: '#262624', primary: '#57534E', deep: '#292524', accent: '#78716C', soft: '#A8A29E' },
  indigo: { paper: '#E9EEF5', paper2: '#D8E2EE', dark: '#141F33', dark2: '#1B3150', primary: '#2C4A6E', deep: '#1B3150', accent: '#3B82A8', soft: '#7FA8C9' },
  pine: { paper: '#EBF2ED', paper2: '#DCE9E0', dark: '#13221B', dark2: '#1B3126', primary: '#2F6B4F', deep: '#1D4A36', accent: '#4A8571', soft: '#7BAF94' },
  clay: { paper: '#F6EBE1', paper2: '#EDDACB', dark: '#241713', dark2: '#30201A', primary: '#B05A45', deep: '#7E3B2A', accent: '#C07A5C', soft: '#D9A184' },
};

/** 母题平铺单元（用于 <pattern>，线条低透明度保证任意底色可读） */
function motifTile(m: Motif, c: Palette, size: number, op: number): string {
  const s = size;
  switch (m) {
    case 'seal': // 印章斜纹 + 小方印
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<path d='M0 ${s}L${s} 0' stroke='${c.primary}' stroke-opacity='${op}' stroke-width='1'/>` +
        `<rect x='${s * 0.18}' y='${s * 0.18}' width='${s * 0.2}' height='${s * 0.2}' rx='${s * 0.04}' fill='none' stroke='${c.primary}' stroke-opacity='${op * 0.8}' stroke-width='1'/></pattern>`;
    case 'ink': // 墨晕点阵（大小双圆）
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<circle cx='${s * 0.3}' cy='${s * 0.3}' r='${s * 0.16}' fill='${c.primary}' fill-opacity='${op}'/>` +
        `<circle cx='${s * 0.75}' cy='${s * 0.72}' r='${s * 0.09}' fill='${c.primary}' fill-opacity='${op * 0.75}'/></pattern>`;
    case 'tie': // 靛染双波纹
      return `<pattern id='m' width='${s * 2}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<path d='M0 ${s * 0.5}Q${s * 0.5} 0 ${s} ${s * 0.5}T${s * 2} ${s * 0.5}' fill='none' stroke='${c.primary}' stroke-opacity='${op}' stroke-width='1.2'/>` +
        `<path d='M0 ${s * 0.75}Q${s * 0.5} ${s * 0.25} ${s} ${s * 0.75}T${s * 2} ${s * 0.75}' fill='none' stroke='${c.primary}' stroke-opacity='${op * 0.55}' stroke-width='1'/></pattern>`;
    case 'bamboo': // 竹叶三片
      return `<pattern id='m' width='${s * 1.6}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<path d='M${s * 0.2} ${s * 0.8}Q${s * 0.55} ${s * 0.55} ${s * 0.9} ${s * 0.15}' fill='none' stroke='${c.primary}' stroke-opacity='${op}' stroke-width='1.4'/>` +
        `<path d='M${s * 0.55} ${s * 0.85}Q${s * 0.9} ${s * 0.7} ${s * 1.25} ${s * 0.4}' fill='none' stroke='${c.primary}' stroke-opacity='${op * 0.7}' stroke-width='1.2'/>` +
        `<path d='M${s * 0.9} ${s * 0.95}Q${s * 1.2} ${s * 0.85} ${s * 1.5} ${s * 0.65}' fill='none' stroke='${c.primary}' stroke-opacity='${op * 0.5}' stroke-width='1'/></pattern>`;
    case 'weave': // 陶纹同心弧
    default:
      return `<pattern id='m' width='${s}' height='${s}' patternUnits='userSpaceOnUse'>` +
        `<path d='M0 ${s}A${s} ${s} 0 0 1 ${s} 0' fill='none' stroke='${c.primary}' stroke-opacity='${op}' stroke-width='1.1'/>` +
        `<path d='M0 ${s * 1.4}A${s * 1.4} ${s * 1.4} 0 0 1 ${s * 1.4} 0' fill='none' stroke='${c.primary}' stroke-opacity='${op * 0.55}' stroke-width='1'/></pattern>`;
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

/** ===== 壁纸（按系列画标志性大图形，深浅两版） ===== */
function wallpaper(p: Palette, m: Motif, dark: boolean): string {
  const W = 1600, H = 1000;
  const base = dark ? lg('bg', p.dark, p.dark2, 'v') : lg('bg', p.paper, p.paper2, 'd');
  const inkOp = dark ? 1.6 : 1; // 深色下图形略提亮
  let deco = '';
  switch (m) {
    case 'seal': { // 朱砂：山峦 + 印章方阵 + 暖阳
      deco =
        `<circle cx='${W * 0.78}' cy='${H * 0.22}' r='150' fill='url(#--sun)'/>` +
        `<rect x='${W * 0.13}' y='${H * 0.16}' width='64' height='64' rx='10' transform='rotate(12 ${W * 0.13} ${H * 0.16})' fill='none' stroke='${p.primary}' stroke-opacity='${0.22 * inkOp}' stroke-width='2'/>` +
        `<rect x='${W * 0.2}' y='${H * 0.3}' width='40' height='40' rx='7' transform='rotate(-8 ${W * 0.2} ${H * 0.3})' fill='none' stroke='${p.accent}' stroke-opacity='${0.16 * inkOp}' stroke-width='2'/>` +
        `<rect x='${W * 0.68}' y='${H * 0.52}' width='46' height='46' rx='8' transform='rotate(16 ${W * 0.68} ${H * 0.52})' fill='none' stroke='${p.primary}' stroke-opacity='${0.13 * inkOp}' stroke-width='2'/>` +
        `<path d='M0 ${H * 0.78}Q${W * 0.2} ${H * 0.66} ${W * 0.42} ${H * 0.76}T${W} ${H * 0.7}V${H}H0Z' fill='${p.primary}' fill-opacity='${0.10 * inkOp}'/>` +
        `<path d='M0 ${H * 0.86}Q${W * 0.28} ${H * 0.74} ${W * 0.55} ${H * 0.84}T${W} ${H * 0.8}V${H}H0Z' fill='${p.deep}' fill-opacity='${0.12 * inkOp}'/>` +
        `<path d='M0 ${H * 0.93}Q${W * 0.35} ${H * 0.83} ${W * 0.7} ${H * 0.91}T${W} ${H * 0.88}V${H}H0Z' fill='${p.primary}' fill-opacity='${0.08 * inkOp}'/>`;
      break;
    }
    case 'ink': { // 松烟：墨晕三团 + 飞鸟
      deco =
        `<circle cx='${W * 0.24}' cy='${H * 0.3}' r='240' fill='url(#--halo1)'/>` +
        `<circle cx='${W * 0.72}' cy='${H * 0.6}' r='300' fill='url(#--halo2)'/>` +
        `<circle cx='${W * 0.5}' cy='${H * 0.82}' r='200' fill='url(#--halo1)'/>` +
        `<path d='M${W * 0.62} ${H * 0.26}q30 -18 60 0M${W * 0.68} ${H * 0.3}q24 -14 48 0' fill='none' stroke='${dark ? p.soft : p.deep}' stroke-opacity='${0.4 * inkOp}' stroke-width='3' stroke-linecap='round'/>` +
        `<path d='M${W * 0.1} ${H * 0.88}Q${W * 0.3} ${H * 0.8} ${W * 0.52} ${H * 0.87}T${W} ${H * 0.84}' fill='none' stroke='${dark ? p.soft : p.primary}' stroke-opacity='${0.14 * inkOp}' stroke-width='4'/>`;
      break;
    }
    case 'tie': { // 靛青：星空 + 扎染波带
      let stars = '';
      for (let i = 0; i < 90; i++) {
        const x = ((i * 331 + 97) % W), y = ((i * 197 + 53) % (H * 0.62)), r = 0.8 + ((i * 7) % 5) * 0.45;
        stars += `<circle cx='${x}' cy='${y}' r='${r.toFixed(1)}' fill='${dark ? '#E2E9F0' : p.primary}' fill-opacity='${dark ? (0.25 + ((i * 13) % 40) / 100) : 0.18}'/>`;
      }
      deco = stars +
        `<path d='M0 ${H * 0.72}Q${W * 0.25} ${H * 0.64} ${W * 0.5} ${H * 0.72}T${W} ${H * 0.72}' fill='none' stroke='${p.soft}' stroke-opacity='${0.2 * inkOp}' stroke-width='2'/>` +
        `<path d='M0 ${H * 0.8}Q${W * 0.25} ${H * 0.72} ${W * 0.5} ${H * 0.8}T${W} ${H * 0.8}' fill='none' stroke='${p.soft}' stroke-opacity='${0.12 * inkOp}' stroke-width='2'/>` +
        `<circle cx='${W * 0.82}' cy='${H * 0.18}' r='110' fill='url(--sun)'/>`;
      break;
    }
    case 'bamboo': { // 松绿：层峦 + 雾带 + 竹叶
      deco =
        `<path d='M0 ${H * 0.7}Q${W * 0.18} ${H * 0.58} ${W * 0.4} ${H * 0.68}T${W} ${H * 0.62}V${H}H0Z' fill='${p.primary}' fill-opacity='${0.10 * inkOp}'/>` +
        `<path d='M0 ${H * 0.82}Q${W * 0.25} ${H * 0.7} ${W * 0.55} ${H * 0.8}T${W} ${H * 0.76}V${H}H0Z' fill='${p.deep}' fill-opacity='${0.14 * inkOp}'/>` +
        `<rect x='0' y='${H * 0.55}' width='${W}' height='70' fill='${dark ? p.soft : '#FFFFFF'}' fill-opacity='${dark ? 0.05 : 0.28}'/>` +
        `<rect x='0' y='${H * 0.64}' width='${W}' height='44' fill='${dark ? p.soft : '#FFFFFF'}' fill-opacity='${dark ? 0.04 : 0.2}'/>` +
        `<path d='M${W * 0.12} ${H * 0.2}q70 -40 130 -6M${W * 0.16} ${H * 0.24}q52 -30 96 -4' fill='none' stroke='${p.primary}' stroke-opacity='${0.3 * inkOp}' stroke-width='3' stroke-linecap='round'/>` +
        `<circle cx='${W * 0.8}' cy='${H * 0.2}' r='95' fill='url(--sun)'/>`;
      break;
    }
    case 'weave': // 陶土：陶轮同心弧 + 沙丘
    default: {
      deco =
        `<g fill='none' stroke='${p.primary}' stroke-opacity='${0.13 * inkOp}' stroke-width='2'>` +
        `<circle cx='${W * 0.76}' cy='${H * 0.26}' r='90'/><circle cx='${W * 0.76}' cy='${H * 0.26}' r='140'/>` +
        `<circle cx='${W * 0.76}' cy='${H * 0.26}' r='190'/><circle cx='${W * 0.76}' cy='${H * 0.26}' r='240'/></g>` +
        `<path d='M0 ${H * 0.8}Q${W * 0.3} ${H * 0.68} ${W * 0.6} ${H * 0.78}T${W} ${H * 0.72}V${H}H0Z' fill='${p.primary}' fill-opacity='${0.10 * inkOp}'/>` +
        `<path d='M0 ${H * 0.9}Q${W * 0.35} ${H * 0.8} ${W * 0.68} ${H * 0.88}T${W} ${H * 0.84}V${H}H0Z' fill='${p.deep}' fill-opacity='${0.10 * inkOp}'/>`;
      break;
    }
  }
  const sun = rg('--sun', dark ? p.soft : p.accent, dark ? 0.2 : 0.3);
  const halo1 = rg('--halo1', dark ? p.soft : p.primary, dark ? 0.1 : 0.08);
  const halo2 = rg('--halo2', dark ? p.soft : p.deep, dark ? 0.12 : 0.09);
  return uri(`<svg ${SVG_HEAD} viewBox='0 0 ${W} ${H}' preserveAspectRatio='xMidYMid slice'>` +
    `<defs>${base}${sun}${halo1}${halo2}${motifTile(m, p, 26, 0.05)}</defs>` +
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
};

const SERIES_NAME: Record<string, string> = {
  cinnabar: '朱砂·印', ink: '松烟·墨', indigo: '靛青·染', pine: '松绿·雾', clay: '陶土·纹',
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
        // 内置系列壁纸自带完整构图，遮罩/模糊调低让图形可辨识
        mask: 0.26, blur: 6,
      },
      preview: wl,
      surface: {
        glass, glassDark,
        glassAlpha: 0.88, glassAlphaDark: 0.9,
        border: `color-mix(in srgb, ${p.primary} 22%, #E5DECF)`,
        borderDark: `color-mix(in srgb, ${p.primary} 30%, #2E2A26)`,
        radius: 14, buttonRadius: 8, glassBlur: 16,
        overlayColor: darkOverlay(id), overlayBlur: 5,
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
