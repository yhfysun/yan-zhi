// 贴纸库 —— **素材生成式**（不打包二进制，用 ffmpeg 画 PNG）。P1-1。
//
// ★ 为什么合成而不是内置 PNG：
//   ① 体积：一张 512² PNG 几十 KB，几十个贴纸就是十几 MB，而合成只要几十行参数；
//   ② 可调：颜色/字号/文案都在注册表里，改观感不用重新出图；
//   ③ 版权：形状与文字都是自己画的，没有素材授权问题。
//   ⚠️ 明确做不到的：插画级贴纸（人物/手绘）。那些走**用户导入**（任意 PNG/WebP）。
//
// ★ 透明：输入用 color=black@0.0 + format=rgba，输出 PNG 带 alpha；
//   合成到视频时走画中画的 overlay 链路（同一套变换/关键帧）。
// ★ 字体：微软雅黑（Windows 自带），与字幕同字体，观感统一。

export interface StickerItem {
  id: string;
  label: string;
  desc: string;
  group: '标记' | '符号';
  /** 画布边长（正方形，渲染时按图层 scale 缩放） */
  size: number;
  /** ffmpeg 滤镜链（在 format=rgba 之后） */
  vf: string;
}

const FONT = "fontfile='C\\:/Windows/Fonts/msyh.ttc'";

/** 居中文字（可带描边）。文本只接受注册表里的常量，不做用户拼接 —— 免转义问题。 */
function centered(text: string, size: number, color: string, border = 0): string {
  return `drawtext=${FONT}:text='${text}':fontsize=${size}:fontcolor=${color}:x=(w-text_w)/2:y=(h-text_h)/2`
    + (border > 0 ? `:borderw=${border}:bordercolor=white` : '');
}

function badgeBox(color: string): string {
  return `drawbox=x=56:y=186:w=400:h=140:color=${color}@0.95:t=fill`;
}

export const STICKER_LIBRARY: StickerItem[] = [
  {
    id: 'badge-new', label: 'NEW 标签', desc: '红色胶囊标签，标"新到/上新"', group: '标记', size: 512,
    vf: `${badgeBox('0xE53935')},${centered('NEW', 96, 'white')}`,
  },
  {
    id: 'badge-hot', label: 'HOT 标签', desc: '橙色胶囊标签，标"热门/爆款"', group: '标记', size: 512,
    vf: `${badgeBox('0xFB8C00')},${centered('HOT', 96, 'white')}`,
  },
  {
    id: 'badge-focus', label: '重点', desc: '黑底金字标签，圈重点信息', group: '标记', size: 512,
    vf: `${badgeBox('0x111111')},${centered('重点', 96, '0xFFD54F')}`,
  },
  {
    id: 'arrow-right', label: '箭头', desc: '黄色右箭头，指向画面元素', group: '符号', size: 512,
    vf: centered('→', 320, '0xFFD54F', 10),
  },
  {
    id: 'check', label: '对勾', desc: '绿色对勾，标"通过/正确"', group: '符号', size: 512,
    vf: centered('✓', 360, '0x22C55E', 8),
  },
  {
    id: 'star', label: '星星', desc: '黄色星星，标"收藏/亮点"', group: '符号', size: 512,
    vf: centered('★', 360, '0xFACC15', 8),
  },
];

export function stickerById(id: string): StickerItem | null {
  const key = String(id || '').trim();
  return STICKER_LIBRARY.find((s) => s.id === key) || null;
}

/** 单个贴纸的 ffmpeg 参数（调用方负责选二进制与落盘目录）。 */
export function stickerArgs(item: StickerItem, outFile: string): string[] {
  return [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', `color=c=black@0.0:s=${item.size}x${item.size}:d=1`,
    '-vf', `format=rgba,${item.vf}`,
    '-frames:v', '1', outFile,
  ];
}
