// 内置皮肤包：皮肤 = 插件的一种（contributes.themes + kind:'skin'）。
// 纯声明式（无入口逻辑），壁纸/预览图为静态资源，位于 assets/plugin-assets/<skinId>/，
// 运行时经 /api/plugin-assets/<skinId>/<file> 提供服务，随安装包 extraResources 分发。
// 用户可在「设置 → 皮肤库」切换，也可在插件管理页下载源码包二改后打成 .yzp 重装（自定义皮肤）。
// surface 块（玻璃面板/边框/圆角/按钮）由 settings.applyTheme 下发为 CSS 变量，skin.css 消费。
import { getPluginManager } from '@yan-zhi/core';
import type { PluginManifest, PluginModule, ThemePalette } from '@yan-zhi/core';

/** 皮肤图片文件约定：wallpaper.webp 主壁纸（深浅色共用，遮罩区分），预览图直接复用壁纸 */
const WALLPAPER = 'wallpaper.webp';
const PREVIEW = 'wallpaper.webp';

/** 构造皮肤主题贡献块（配色取自壁纸主色调，surface 定制弹窗/边框/圆角/按钮风格） */
function skinTheme(
  id: string,
  name: string,
  category: string,
  palette: Pick<ThemePalette, 'primary' | 'primaryLight' | 'primaryDark' | 'accent' | 'gradient' | 'orb1' | 'orb2' | 'orb3'>,
  wallpaperMask: number,
  surface?: ThemePalette['surface'],
): ThemePalette {
  return {
    id,
    name,
    kind: 'skin',
    category,
    preview: PREVIEW,
    wallpaper: { light: WALLPAPER, dark: WALLPAPER, mask: wallpaperMask },
    ...palette,
    ...(surface ? { surface } : {}),
  };
}

export const SKIN_MANIFESTS: PluginManifest[] = [
  {
    id: 'skin-sakura-night',
    name: '樱夜物语',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动漫系列 · 夜色樱花与月下小镇，暗色调为主，配樱粉主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-sakura-night', '樱夜物语', '动漫', {
          primary: '#E86A8A',
          primaryLight: '#FBE3E9',
          primaryDark: '#9F3B55',
          accent: '#D9506F',
          gradient: 'linear-gradient(135deg, #E86A8A, #9F3B55)',
          orb1: '#E86A8A',
          orb2: '#F0A0B8',
          orb3: '#9F3B55',
        }, 0.45, {
          glass: '#FFF5F7', glassDark: '#241B20', glassAlpha: 0.84,
          border: 'rgba(232,106,138,0.35)', borderDark: 'rgba(232,106,138,0.30)',
          radius: 14, buttonRadius: 18,
        }),
      ],
    },
  },
  {
    id: 'skin-cyber-neon',
    name: '赛博宵',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动漫系列 · 赛博朋克霓虹街景，深蓝底配霓虹青紫主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-cyber-neon', '赛博宵', '动漫', {
          primary: '#38BDF8',
          primaryLight: '#DBF0FD',
          primaryDark: '#0C6E9E',
          accent: '#A78BFA',
          gradient: 'linear-gradient(135deg, #38BDF8, #A78BFA)',
          orb1: '#38BDF8',
          orb2: '#A78BFA',
          orb3: '#0EA5E9',
        }, 0.5, {
          glass: '#0E1626', glassDark: '#0A101C', glassAlpha: 0.80, glassAlphaDark: 0.82,
          border: 'rgba(56,189,248,0.45)', borderDark: 'rgba(56,189,248,0.40)',
          radius: 8, buttonRadius: 4, buttonText: '#EAF6FF',
        }),
      ],
    },
  },
  {
    id: 'skin-cloud-sea',
    name: '云海物语',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动漫系列 · 云海之上的晴空与飞鸟，明快治愈系，配天青主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-cloud-sea', '云海物语', '动漫', {
          primary: '#0E9BB5',
          primaryLight: '#DCF2F7',
          primaryDark: '#0A6A7D',
          accent: '#2BB3CD',
          gradient: 'linear-gradient(135deg, #0E9BB5, #2BB3CD)',
          orb1: '#0E9BB5',
          orb2: '#5BC8DB',
          orb3: '#0A6A7D',
        }, 0.42, {
          glass: '#F0FAFD', glassDark: '#14242B', glassAlpha: 0.86,
          border: 'rgba(14,155,181,0.30)',
          radius: 16, buttonRadius: 14,
        }),
      ],
    },
  },
  {
    id: 'skin-star-train',
    name: '星夜列车',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动漫系列 · 星河下穿行草原的蒸汽列车，车窗暖光与流萤，配靛蓝金主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-star-train', '星夜列车', '动漫', {
          primary: '#6D8FE0',
          primaryLight: '#E3EAFB',
          primaryDark: '#2C3E75',
          accent: '#F0C040',
          gradient: 'linear-gradient(135deg, #6D8FE0, #F0C040)',
          orb1: '#6D8FE0',
          orb2: '#F0C040',
          orb3: '#2C3E75',
        }, 0.45, {
          glass: '#F2F6FF', glassDark: '#131C30', glassAlpha: 0.84,
          border: 'rgba(109,143,224,0.35)',
          radius: 14, buttonRadius: 14,
        }),
      ],
    },
  },
  {
    id: 'skin-gakuen-dusk',
    name: '学园夕映',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动漫系列 · 放学后的教室与金色夕阳，青春怀旧，配夕橙主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-gakuen-dusk', '学园夕映', '动漫', {
          primary: '#E9814E',
          primaryLight: '#FCE9DC',
          primaryDark: '#8C3F1E',
          accent: '#E9A23E',
          gradient: 'linear-gradient(135deg, #E9814E, #E9A23E)',
          orb1: '#E9814E',
          orb2: '#F2B05E',
          orb3: '#8C3F1E',
        }, 0.42, {
          glass: '#FFF7EF', glassDark: '#241811', glassAlpha: 0.86,
          border: 'rgba(233,129,78,0.32)',
          radius: 12, buttonRadius: 12,
        }),
      ],
    },
  },
  {
    id: 'skin-qin-moon',
    name: '秦时明月',
    version: '1.0.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动漫系列 · 国风武侠：白衣剑客与青铜机关鸟月下同框，水墨群山，朱砂青铜主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-qin-moon', '秦时明月', '动漫', {
          primary: '#B04A3A',
          primaryLight: '#F7E8E3',
          primaryDark: '#5E241C',
          accent: '#C9A227',
          gradient: 'linear-gradient(135deg, #B04A3A, #C9A227)',
          orb1: '#B04A3A',
          orb2: '#C9A227',
          orb3: '#5E241C',
        }, 0.5, {
          glass: '#F7F1E8', glassDark: '#1C1712', glassAlpha: 0.87, glassAlphaDark: 0.80,
          border: 'rgba(176,74,58,0.42)', borderDark: 'rgba(201,162,39,0.35)',
          radius: 10, buttonRadius: 8, buttonText: '#FFF8F0',
        }),
      ],
    },
  },
  {
    id: 'skin-grand-line',
    name: '伟大航路',
    version: '1.0.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动漫系列 · 热血航海：草帽船长立于船头破浪，大浪与落日，珊瑚橙海蓝主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-grand-line', '伟大航路', '动漫', {
          primary: '#D95D39',
          primaryLight: '#FBE7DC',
          primaryDark: '#8A3018',
          accent: '#3EA6C9',
          gradient: 'linear-gradient(135deg, #D95D39, #3EA6C9)',
          orb1: '#D95D39',
          orb2: '#3EA6C9',
          orb3: '#8A3018',
        }, 0.42, {
          glass: '#FFF6EC', glassDark: '#1E1B14', glassAlpha: 0.84,
          border: 'rgba(217,93,57,0.38)',
          radius: 14, buttonRadius: 24,
        }),
      ],
    },
  },
  {
    id: 'skin-ninja-village',
    name: '忍道',
    version: '1.0.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动漫系列 · 热血忍者：橙色战衣少年掌中螺旋查克拉，忍者村夕照，橙绿撞色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-ninja-village', '忍道', '动漫', {
          primary: '#E07B39',
          primaryLight: '#FBE9DA',
          primaryDark: '#8F4A1A',
          accent: '#3E8E5C',
          gradient: 'linear-gradient(135deg, #E07B39, #3E8E5C)',
          orb1: '#E07B39',
          orb2: '#3E8E5C',
          orb3: '#8F4A1A',
        }, 0.42, {
          glass: '#FBF4EA', glassDark: '#1F1A12', glassAlpha: 0.85,
          border: 'rgba(224,123,57,0.38)',
          radius: 12, buttonRadius: 10,
        }),
      ],
    },
  },
  {
    id: 'skin-cat-cafe',
    name: '猫语午后',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动物系列 · 暖阳窗台的猫咪咖啡馆，治愈系奶油拿铁色调',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-cat-cafe', '猫语午后', '动物', {
          primary: '#C98A4B',
          primaryLight: '#F7EBDD',
          primaryDark: '#7A4E22',
          accent: '#D9A05B',
          gradient: 'linear-gradient(135deg, #C98A4B, #D9A05B)',
          orb1: '#C98A4B',
          orb2: '#E0B078',
          orb3: '#7A4E22',
        }, 0.4, {
          glass: '#FFF9F2', glassDark: '#231A12', glassAlpha: 0.88,
          border: 'rgba(201,138,75,0.30)',
          radius: 16, buttonRadius: 16,
        }),
      ],
    },
  },
  {
    id: 'skin-deer-forest',
    name: '鹿鸣林深',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '动物系列 · 晨雾森林里的鹿与光斑，梦幻童话氛围，配森绿主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-deer-forest', '鹿鸣林深', '动物', {
          primary: '#5FA777',
          primaryLight: '#E2F3E8',
          primaryDark: '#2E5C40',
          accent: '#7FBF8E',
          gradient: 'linear-gradient(135deg, #5FA777, #7FBF8E)',
          orb1: '#5FA777',
          orb2: '#9CCFA8',
          orb3: '#2E5C40',
        }, 0.45, {
          glass: '#F3FAF5', glassDark: '#14231A', glassAlpha: 0.85,
          border: 'rgba(95,167,119,0.32)',
          radius: 14, buttonRadius: 14,
        }),
      ],
    },
  },
  {
    id: 'skin-fern-jungle',
    name: '绿屿仙踪',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '植物系列 · 热带雨林蕨类与光柱，清新翠绿治愈，配翡翠绿主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-fern-jungle', '绿屿仙踪', '植物', {
          primary: '#3E9B6C',
          primaryLight: '#DFF3E8',
          primaryDark: '#1E5C3C',
          accent: '#5BB87F',
          gradient: 'linear-gradient(135deg, #3E9B6C, #5BB87F)',
          orb1: '#3E9B6C',
          orb2: '#7FCB9C',
          orb3: '#1E5C3C',
        }, 0.45, {
          glass: '#F1FAF4', glassDark: '#12211A', glassAlpha: 0.86,
          border: 'rgba(62,155,108,0.30)',
          radius: 12, buttonRadius: 12,
        }),
      ],
    },
  },
  {
    id: 'skin-bamboo-rain',
    name: '竹雨听风',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '植物系列 · 细雨中的青绿竹林，水墨禅意，配黛青主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-bamboo-rain', '竹雨听风', '植物', {
          primary: '#4E9E8A',
          primaryLight: '#E0F2ED',
          primaryDark: '#24574A',
          accent: '#6FB5A0',
          gradient: 'linear-gradient(135deg, #4E9E8A, #6FB5A0)',
          orb1: '#4E9E8A',
          orb2: '#8FCCC0',
          orb3: '#24574A',
        }, 0.45, {
          glass: '#F0F9F6', glassDark: '#122420', glassAlpha: 0.86,
          border: 'rgba(78,158,138,0.32)',
          radius: 10, buttonRadius: 8,
        }),
      ],
    },
  },
  {
    id: 'skin-star-stage',
    name: '星光舞台',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '明星系列 · 偶像演唱会紫金舞台与荧光灯海，热烈梦幻',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-star-stage', '星光舞台', '明星', {
          primary: '#B84D8C',
          primaryLight: '#F8E5F1',
          primaryDark: '#6B2460',
          accent: '#E3B23E',
          gradient: 'linear-gradient(135deg, #B84D8C, #E3B23E)',
          orb1: '#B84D8C',
          orb2: '#E3B23E',
          orb3: '#6B2460',
        }, 0.5, {
          glass: '#FBF0F7', glassDark: '#1E1220', glassAlpha: 0.82,
          border: 'rgba(184,77,140,0.40)',
          radius: 14, buttonRadius: 20,
        }),
      ],
    },
  },
  {
    id: 'skin-superstar',
    name: '巨星之夜',
    version: '1.0.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '明星系列 · 聚光灯下的巨星剪影与荧光棒海洋，紫金主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-superstar', '巨星之夜', '明星', {
          primary: '#9B5DE0',
          primaryLight: '#F1E6FC',
          primaryDark: '#5C2E8A',
          accent: '#E3B23E',
          gradient: 'linear-gradient(135deg, #9B5DE0, #E3B23E)',
          orb1: '#9B5DE0',
          orb2: '#E3B23E',
          orb3: '#5C2E8A',
        }, 0.5, {
          glass: '#FAF2FD', glassDark: '#1B1224', glassAlpha: 0.82,
          border: 'rgba(155,93,224,0.40)',
          radius: 14, buttonRadius: 20,
        }),
      ],
    },
  },
  {
    id: 'skin-red-carpet',
    name: '星夜红毯',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '明星系列 · 星光典礼红毯之夜，鎏金散景与快门星芒，配绛红主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-red-carpet', '星夜红毯', '明星', {
          primary: '#C03038',
          primaryLight: '#FBE4E5',
          primaryDark: '#6E1420',
          accent: '#D45B62',
          gradient: 'linear-gradient(135deg, #C03038, #D45B62)',
          orb1: '#C03038',
          orb2: '#E08A90',
          orb3: '#6E1420',
        }, 0.5, {
          glass: '#FDF3F3', glassDark: '#200F13', glassAlpha: 0.84,
          border: 'rgba(192,48,56,0.38)',
          radius: 12, buttonRadius: 8,
        }),
      ],
    },
  },
  {
    id: 'skin-mountain-dawn',
    name: '山川晓色',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '风景系列 · 晨光中的雪山与云海，冷暖对冲，配日出橙主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-mountain-dawn', '山川晓色', '风景', {
          primary: '#D97706',
          primaryLight: '#FBEBD9',
          primaryDark: '#92400E',
          accent: '#EA9A3E',
          gradient: 'linear-gradient(135deg, #D97706, #EA9A3E)',
          orb1: '#D97706',
          orb2: '#F5B04C',
          orb3: '#92400E',
        }, 0.42, {
          glass: '#FFF8F0', glassDark: '#241D16', glassAlpha: 0.85,
          border: 'rgba(217,119,6,0.32)',
          radius: 12, buttonRadius: 10,
        }),
      ],
    },
  },
  {
    id: 'skin-aurora',
    name: '极光之夜',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '风景系列 · 极夜雪原上的极光帷幕，深色沉浸，配极光绿主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-aurora', '极光之夜', '风景', {
          primary: '#34D399',
          primaryLight: '#D8F5E9',
          primaryDark: '#0E8C63',
          accent: '#2DD4BF',
          gradient: 'linear-gradient(135deg, #34D399, #2DD4BF)',
          orb1: '#34D399',
          orb2: '#2DD4BF',
          orb3: '#0E8C63',
        }, 0.5, {
          glass: '#EFFCF7', glassDark: '#0E1F1B', glassAlpha: 0.82,
          border: 'rgba(52,211,153,0.38)',
          radius: 14, buttonRadius: 12,
        }),
      ],
    },
  },
  {
    id: 'skin-fluid-dream',
    name: '流体幻彩',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '美图系列 · 抽象流体艺术，梦幻渐变流动感，配洋红紫主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-fluid-dream', '流体幻彩', '美图', {
          primary: '#C026D3',
          primaryLight: '#F8E3FA',
          primaryDark: '#86198F',
          accent: '#E879F9',
          gradient: 'linear-gradient(135deg, #C026D3, #E879F9)',
          orb1: '#C026D3',
          orb2: '#E879F9',
          orb3: '#86198F',
        }, 0.45, {
          glass: '#FDF2FC', glassDark: '#221022', glassAlpha: 0.84,
          border: 'rgba(192,38,211,0.30)',
          radius: 16, buttonRadius: 16,
        }),
      ],
    },
  },
  {
    id: 'skin-ink-mono',
    name: '墨色浮生',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '黑白系列 · 黑白摄影雾中城市天际线，高对比极简质感',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-ink-mono', '墨色浮生', '黑白', {
          primary: '#4A4A52',
          primaryLight: '#E8E8EC',
          primaryDark: '#2B2B30',
          accent: '#8A8A94',
          gradient: 'linear-gradient(135deg, #4A4A52, #8A8A94)',
          orb1: '#4A4A52',
          orb2: '#9A9AA4',
          orb3: '#2B2B30',
        }, 0.4, {
          glass: '#F4F4F6', glassDark: '#17171A', glassAlpha: 0.88,
          border: 'rgba(74,74,82,0.40)',
          radius: 6, buttonRadius: 4,
        }),
      ],
    },
  },
  {
    id: 'skin-ink-gold',
    name: '黑金墨韵',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '黑白系列 · 墨色流动与鎏金笔触，黑金艺术装饰风，奢华极简',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-ink-gold', '黑金墨韵', '黑白', {
          primary: '#B08D2E',
          primaryLight: '#F6EED8',
          primaryDark: '#5C4714',
          accent: '#C9A94E',
          gradient: 'linear-gradient(135deg, #B08D2E, #C9A94E)',
          orb1: '#B08D2E',
          orb2: '#D9C070',
          orb3: '#5C4714',
        }, 0.45, {
          glass: '#FAF6EA', glassDark: '#191410', glassAlpha: 0.86,
          border: 'rgba(176,141,46,0.45)',
          radius: 8, buttonRadius: 6,
        }),
      ],
    },
  },
  {
    id: 'skin-dunhuang-feitian',
    name: '敦煌飞天',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '传统文化系列 · 敦煌壁画飞天与飘带，矿物配色土红石绿，配赭石主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-dunhuang-feitian', '敦煌飞天', '传统文化', {
          primary: '#C1653A',
          primaryLight: '#F9E9DE',
          primaryDark: '#7A3A1E',
          accent: '#3E8E7E',
          gradient: 'linear-gradient(135deg, #C1653A, #3E8E7E)',
          orb1: '#C1653A',
          orb2: '#3E8E7E',
          orb3: '#7A3A1E',
        }, 0.42, {
          glass: '#F9F1E6', glassDark: '#20140D', glassAlpha: 0.87,
          border: 'rgba(193,101,58,0.40)',
          radius: 8, buttonRadius: 6,
        }),
      ],
    },
  },
  {
    id: 'skin-green-landscape',
    name: '青绿千里',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '传统文化系列 · 千里江山图式青绿山水，石青石绿绢本质感，配青玉主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-green-landscape', '青绿千里', '传统文化', {
          primary: '#2E7D6B',
          primaryLight: '#DEEFEB',
          primaryDark: '#164C42',
          accent: '#4E9B8A',
          gradient: 'linear-gradient(135deg, #2E7D6B, #4E9B8A)',
          orb1: '#2E7D6B',
          orb2: '#7DBFB0',
          orb3: '#164C42',
        }, 0.42, {
          glass: '#F0F7F4', glassDark: '#101E1B', glassAlpha: 0.86,
          border: 'rgba(46,125,107,0.35)',
          radius: 10, buttonRadius: 8,
        }),
      ],
    },
  },
  {
    id: 'skin-taiji',
    name: '太极玄机',
    version: '1.1.0',
    category: '皮肤',
    author: 'yan-zhi',
    description: '太极系列 · 水墨阴阳化生云海山峦，道法自然的平衡意境，配黛蓝朱砂主色',
    permissions: [],
    contributes: {
      themes: [
        skinTheme('skin-taiji', '太极玄机', '太极', {
          primary: '#3E4A66',
          primaryLight: '#E2E7F0',
          primaryDark: '#232B3E',
          accent: '#B54A44',
          gradient: 'linear-gradient(135deg, #3E4A66, #B54A44)',
          orb1: '#3E4A66',
          orb2: '#B54A44',
          orb3: '#232B3E',
        }, 0.45, {
          glass: '#F2F4F7', glassDark: '#14181F', glassAlpha: 0.88,
          border: 'rgba(62,74,102,0.40)',
          radius: 10, buttonRadius: 8,
        }),
      ],
    },
  },
];

/** 皮肤为纯声明式插件，无入口逻辑；占位模块满足 registerBuiltin 签名 */
const noopSkinModule: PluginModule = { activate() {} };

/** 注册全部内置皮肤（默认启用；皮肤只贡献主题，无工具/网络/桌面输入，风险面为零） */
export async function registerBuiltinSkins(): Promise<void> {
  const mgr = getPluginManager();
  for (const manifest of SKIN_MANIFESTS) {
    await mgr.registerBuiltin(manifest, noopSkinModule, true);
  }
}
