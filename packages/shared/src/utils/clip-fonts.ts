// 字体注册表（P1-2：字体选择）
//
// ★ 为什么是注册表而不是让模型/用户直接填 ASS 字体名：
//   ① 三处要用同一份清单 —— 工具 schema 的 enum、UI 下拉、渲染时的 \fn 解析；
//      写第二份必然漂移（本项目反复踩过）；
//   ② 字体名拼错时 libass 会**静默回退**到默认字体，用户只会觉得"选了没反应"；
//   ③ 只收 Windows 自带且有中文字形的字体，避免"选了变方块"。
//
// ★ assName 是 libass/fontconfig 的族名（不是文件名）。本机 ffmpeg 的 fontconfig
//   能直接查到 Windows 字体目录（实测 SimSun / KaiTi / SimHei 均生效）。

export interface FontFamilyPreset {
  id: string;
  /** 中文显示名（UI 下拉与工具描述共用） */
  label: string;
  /** ASS Style Fontname / \fn 的族名 */
  assName: string;
}

export const DEFAULT_FONT_FAMILY_ID = 'msyh';

export const FONT_FAMILIES: FontFamilyPreset[] = [
  { id: 'msyh', label: '微软雅黑', assName: 'Microsoft YaHei' },
  { id: 'simhei', label: '黑体', assName: 'SimHei' },
  { id: 'simsun', label: '宋体', assName: 'SimSun' },
  { id: 'kaiti', label: '楷体', assName: 'KaiTi' },
  { id: 'fangsong', label: '仿宋', assName: 'FangSong' },
  { id: 'dengxian', label: '等线', assName: 'DengXian' },
  { id: 'youyuan', label: '幼圆', assName: 'YouYuan' },
  { id: 'lishu', label: '隶书', assName: 'LiSu' },
  { id: 'xingkai', label: '行楷', assName: 'STXingkai' },
];

/** 按 id 查字体；未知/空返回 null（调用方应保持默认字体，不猜别的字体）。 */
export function fontFamilyOf(id: string | undefined): FontFamilyPreset | null {
  const key = String(id ?? '').trim().toLowerCase();
  if (!key) return null;
  return FONT_FAMILIES.find((f) => f.id === key) || null;
}

/** 取 ASS 族名；未知 id 回落到默认（微软雅黑）。 */
export function fontAssNameOf(id: string | undefined): string {
  return fontFamilyOf(id)?.assName || fontFamilyOf(DEFAULT_FONT_FAMILY_ID)!.assName;
}

export function fontFamilyIds(): string[] {
  return FONT_FAMILIES.map((f) => f.id);
}

/** 紧凑清单「id=名称」—— 工具描述与报错共用。 */
export function fontFamilyCatalogText(): string {
  return FONT_FAMILIES.map((f) => `${f.id}=${f.label}`).join('、');
}
