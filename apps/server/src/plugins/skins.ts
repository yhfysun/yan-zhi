// 内置皮肤包：皮肤 = 插件的一种（contributes.themes + kind:'skin'）。
// 纯声明式（无入口逻辑），壁纸/预览图为静态资源，位于 assets/plugin-assets/<skinId>/，
// 运行时经 /api/plugin-assets/<skinId>/<file> 提供服务，随安装包 extraResources 分发。
// 用户可在「设置 → 皮肤库」切换，也可在插件管理页下载源码包二改后打成 .yzp 重装（自定义皮肤）。
import { getPluginManager } from '@yan-zhi/core';
import type { PluginManifest, PluginModule, ThemePalette } from '@yan-zhi/core';

/** 皮肤图片文件约定：wallpaper.webp 主壁纸（深浅色共用，遮罩区分），预览图直接复用壁纸 */
const WALLPAPER = 'wallpaper.webp';
const PREVIEW = 'wallpaper.webp';

/** 构造皮肤主题贡献块（配色取自壁纸主色调，保证 UI 主色与壁纸协调） */
function skinTheme(
  id: string,
  name: string,
  category: string,
  palette: Pick<ThemePalette, 'primary' | 'primaryLight' | 'primaryDark' | 'accent' | 'gradient' | 'orb1' | 'orb2' | 'orb3'>,
  wallpaperMask: number,
): ThemePalette {
  return {
    id,
    name,
    kind: 'skin',
    category,
    preview: PREVIEW,
    wallpaper: { light: WALLPAPER, dark: WALLPAPER, mask: wallpaperMask },
    ...palette,
  };
}

export const SKIN_MANIFESTS: PluginManifest[] = [
  {
    id: 'skin-sakura-night',
    name: '樱夜物语',
    version: '1.0.0',
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
        }, 0.45),
      ],
    },
  },
  {
    id: 'skin-cyber-neon',
    name: '赛博宵',
    version: '1.0.0',
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
        }, 0.5),
      ],
    },
  },
  {
    id: 'skin-cloud-sea',
    name: '云海物语',
    version: '1.0.0',
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
        }, 0.42),
      ],
    },
  },
  {
    id: 'skin-mountain-dawn',
    name: '山川晓色',
    version: '1.0.0',
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
        }, 0.42),
      ],
    },
  },
  {
    id: 'skin-aurora',
    name: '极光之夜',
    version: '1.0.0',
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
        }, 0.5),
      ],
    },
  },
  {
    id: 'skin-fluid-dream',
    name: '流体幻彩',
    version: '1.0.0',
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
        }, 0.45),
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
