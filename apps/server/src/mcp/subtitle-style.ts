// 字幕动画 —— SRT → ASS 生成器（纯函数层）。
//
// 为什么是 ASS：SRT 只有时间轴没有样式，动画全靠 libass 的内联标签（\fad/\t/\move/\k）。
// ffmpeg 的 subtitles 滤镜对 .ass 文件会读取文件自身的 PlayResX/PlayResY，
// 因此这里把 PlayRes 设为**视频真实分辨率**，样式里的字号/边距就是真实像素，
// 与 media_compose 走 SRT+force_style 时的「384/288 比例换算」完全是两套体系，别混用。
//
// 预设一览（8 种）：fade 淡入淡出 / pop 弹跳入场 / zoom 缩放入场 / slide 滑动入场 /
//                   typewriter 打字机 / karaoke 卡拉OK染色 / flicker 描边闪烁 / flychar 逐字飞入
//
// ★ 动画实现取舍：
//   - 优先用「相对变换」（\fad/\t 缩放/描边变化），不依赖文本宽度，任何字号画幅都稳；
//   - 需要绝对坐标的（slide/typewriter/flychar）用估宽定位：CJK 字宽≈字号、ASCII≈0.55×字号，
//     与 api-tool-executor 里 drawtext 标题的估宽口径一致。

import { TEXT_ANIMATIONS } from '@yan-zhi/shared';

/** 动画预设定义（id 同时是 media_compose subtitleAnimation 参数的合法值） */
export interface SubtitlePresetDef {
  id: string;
  label: string;
  desc: string;
}

/**
 * 字幕动画预设**来自效果库**（@yan-zhi/shared 的 TEXT_ANIMATIONS）——单一真相源。
 *
 * ★★★ 此前这里自己定义了一份、core 的 schema enum 手写一份、UI 又手写一份 —— 三份必然漂移。
 *   现在新增一种字幕动画只改 shared/utils/clip-effects.ts 一处。
 *   `filter` 字段在效果库里只是标记用了哪些 ASS 标签（给人看），真正的标签拼装在本文件下方。
 *   ★ 兼容：对外仍导出 SUBTITLE_ANIMATION_PRESETS 这个名字，调用方无需改。
 */
export const SUBTITLE_ANIMATION_PRESETS: SubtitlePresetDef[] = TEXT_ANIMATIONS.map((e) => ({
  id: e.id, label: e.label, desc: e.desc,
}));

export interface AssCue {
  start: number;
  end: number;
  text: string;
  /** 该条自己的动画预设；缺省用 options.preset（**逐条动画**：一条片子可以混用多种动效） */
  preset?: string;
  /** 该条自己的滑入方向；缺省用 options.direction */
  slideDirection?: 'left' | 'right' | 'up' | 'down';
  /** 该条自己的对齐（逐条位置：标题在中间、字幕在底部）；缺省用 options.alignment */
  alignment?: number;
}

/** ASS 时间戳 H:MM:SS.cc（厘秒两位） */
export function formatAssTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.round((clamped - Math.floor(clamped)) * 100);
  const pad = (n: number, w = 2) => String(Math.min(n, w === 2 ? 99 : Infinity)).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

/** 解析 SRT 文本为字幕条目；非法块跳过，不整体失败。 */
export function parseSrt(srt: string): AssCue[] {
  const cues: AssCue[] = [];
  const blocks = String(srt || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) continue;
    // 首行可能是序号，跳过；找时间轴行
    const tl = lines.findIndex((l) => l.includes('-->'));
    if (tl < 0) continue;
    const m = lines[tl].match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/,
    );
    if (!m) continue;
    const toSec = (h: string, mi: string, s: string, ms: string) =>
      Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
    const start = toSec(m[1], m[2], m[3], m[4]);
    const end = toSec(m[5], m[6], m[7], m[8]);
    const text = lines.slice(tl + 1).join('\n').trim();
    if (!(end > start) || !text) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

/** 估文本宽度（PlayRes 像素）：CJK≈1 字号、其余≈0.55（与 drawtext 标题估宽同口径）。 */
function estTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const ch of text) units += ch.codePointAt(0)! > 0x2e80 ? 1 : 0.55;
  return units * fontSize;
}

/** 内联标签里的文本是「标签语法」：整块剥掉 {...} 标签组、残留花括号与 \字母 转义
 *  （只删花括号会把 'fscx999' 当明文渲染出来），换行转 \N。 */
function escAssText(t: string): string {
  return t
    .replace(/\{[^}]*\}/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\[A-Za-z]/g, '')
    .replace(/\\/g, '')
    .replace(/\n/g, '\\N');
}

export interface SlideDirection {
  /** 滑入方向：right=从右侧滑入（默认），left=从左侧，up=从下方，down=从上方 */
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface AssBuildOptions extends SlideDirection {
  preset: string;
  /** PlayRes（= 视频真实分辨率） */
  playResX: number;
  playResY: number;
  /** 字号（真实像素，PlayRes 空间） */
  fontSizePx: number;
  /** ASS 颜色 &HAABBGGRR&（由调用方 toAssColor 产出） */
  primaryColor: string;
  /** 卡拉OK高亮色（染色起点），默认黄色 */
  secondaryColor?: string;
  outlineColor: string;
  outlinePx: number;
  /**
   * 背景底板色 &HAABBGGRR&（可选）。给了就把 BorderStyle 设为 3（不透明框），
   * 这是 ASS 里"文字加底板"的**唯一正确做法**：BorderStyle=1 的 Outline 画的是描边
   * （沿字形轮廓），做不出"整块矩形底板"。剪映/必剪的标签样式都靠它。
   */
  backColor?: string;
  /** libass 对齐：2=底部居中 5=居中 8=顶部居中 */
  alignment: number;
  /** 垂直边距（真实像素） */
  marginVPx: number;
  fontFamily?: string;
}

const DEFAULT_SECONDARY = '&H0000FFFF&'; // 黄（BGR）

/** 生成 ASS 文本。cues 为空或 preset 非法返回 { ok:false }。 */
export function buildAss(
  cues: AssCue[],
  opts: AssBuildOptions,
): { ok: true; ass: string; events: number } | { ok: false; error: string } {
  const valid = (cues || []).filter((c) => c.end > c.start && String(c.text || '').trim());
  if (!valid.length) return { ok: false, error: '没有可用的字幕条目' };
  // 逐条预设（c.preset 优先）都要能认出来；整体预设也必须是合法的
  // 'none' 是显式的「这条不要动画」（用于混排：一部分条带动画、另一部分干净）
  const known = (id: string) => id === 'none' || SUBTITLE_ANIMATION_PRESETS.some((p) => p.id === id);
  const bad = valid.find((c) => c.preset && !known(c.preset));
  if (bad) {
    return {
      ok: false,
      error: `未知字幕动画预设：${bad.preset}（可选：${SUBTITLE_ANIMATION_PRESETS.map((p) => p.id).join(' / ')}）`,
    };
  }
  if (opts.preset && !known(opts.preset)) {
    return {
      ok: false,
      error: `未知字幕动画预设：${opts.preset}（可选：${SUBTITLE_ANIMATION_PRESETS.map((p) => p.id).join(' / ')}）`,
    };
  }

  const resX = Math.max(16, Math.round(opts.playResX));
  const resY = Math.max(16, Math.round(opts.playResY));
  const fs = Math.max(6, Math.round(opts.fontSizePx));
  const ol = Math.max(0, Math.round(opts.outlinePx));
  const mv = Math.max(0, Math.round(opts.marginVPx));
  const align = [2, 5, 8].includes(opts.alignment) ? opts.alignment : 2;
  const font = opts.fontFamily || 'Microsoft YaHei';

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${resX}`,
    `PlayResY: ${resY}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${font},${fs},${opts.primaryColor},${opts.secondaryColor || DEFAULT_SECONDARY},${opts.outlineColor},${opts.backColor || '&H7F000000'},0,0,0,0,100,100,0,0,${opts.backColor ? 3 : 1},${ol},1,${align},40,40,${mv},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const dialogue = (start: number, end: number, text: string) =>
    `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${text}`;

  // 绝对坐标定位（slide/typewriter/flychar 用）：按对齐方式算行的锚点。
  //   底部(2): 锚点=行底边中点 y=resY-mv；居中(5): y=resY/2；顶部(8): y=mv。
  //   （逐条的 alignment 已在循环内解析为 alignOpt / anchorX / rowY）

  const events: string[] = [];
  for (const c of valid) {
    const dur = c.end - c.start;
    const text = escAssText(c.text);
    const plain = c.text.replace(/[{}\\]/g, '');
    // 逐条覆盖：动画预设 / 滑入方向 / 对齐（标题居中、字幕底部这种混排靠它）
    const presetId = c.preset || opts.preset;
    const dirOpt = c.slideDirection || opts.direction;
    const alignOpt = [2, 5, 8].includes(c.alignment ?? -1) ? c.alignment! : align;
    if (!presetId || presetId === 'none') { events.push(dialogue(c.start, c.end, `{\\fad(300,300)}${text}`)); continue; }
    const anchorX = resX / 2;
    const rowY = alignOpt === 5 ? resY / 2 : alignOpt === 8 ? mv : resY - mv;

    switch (presetId) {
      case 'fade': {
        events.push(dialogue(c.start, c.end, `{\\fad(300,300)}${text}`));
        break;
      }
      case 'pop': {
        events.push(
          dialogue(
            c.start,
            c.end,
            `{\\fad(80,150)\\fscx70\\fscy70\\t(0,160,\\fscx118\\fscy118)\\t(160,340,\\fscx100\\fscy100)}${text}`,
          ),
        );
        break;
      }
      case 'zoom': {
        events.push(
          dialogue(c.start, c.end, `{\\fad(120,180)\\fscx55\\fscy55\\t(0,240,\\fscx100\\fscy100)}${text}`),
        );
        break;
      }
      case 'slide': {
        const dir = dirOpt || 'right';
        const dx = resX * 0.4;
        const dy = resY * 0.4;
        let x0 = anchorX;
        let y0 = rowY;
        if (dir === 'right') x0 = anchorX + dx;
        else if (dir === 'left') x0 = anchorX - dx;
        else if (dir === 'up') y0 = rowY + dy;
        else y0 = rowY - dy;
        events.push(
          dialogue(
            c.start,
            c.end,
            `{\\move(${Math.round(x0)},${Math.round(y0)},${Math.round(anchorX)},${Math.round(rowY)},0,300)\\fad(0,200)}${text}`,
          ),
        );
        break;
      }
      case 'typewriter': {
        // 逐字出现：每条 Dialogue 显示前 i+1 个字，同层后画的盖前画的，视觉上即打字。
        // 锚到左端（\an1/\an4/\an7 按垂直位置）保证文本增长时不左右跳。
        const chars = Array.from(plain);
        const step = Math.min(0.12, dur / Math.max(1, chars.length));
        const vAnchor = alignOpt === 5 ? 4 : alignOpt === 8 ? 7 : 1; // 中/顶/底 的左对齐变体
        const x0 = Math.max(20, anchorX - estTextWidth(plain, fs) / 2);
        for (let i = 0; i < chars.length; i++) {
          const t0 = c.start + i * step;
          events.push(
            dialogue(
              t0,
              c.end,
              `{\\an${vAnchor}\\pos(${Math.round(x0)},${Math.round(rowY)})\\fad(60,0)}${escAssText(chars.slice(0, i + 1).join(''))}`,
            ),
          );
        }
        break;
      }
      case 'karaoke': {
        // \k 单位是厘秒：每个字从 SecondaryColour 染到 PrimaryColour
        const chars = Array.from(plain);
        const per = Math.max(10, Math.round((dur * 100) / chars.length));
        const tags = chars.map((ch) => `{\\k${per}}${ch === ' ' ? ' ' : ch}`).join('');
        events.push(dialogue(c.start, c.end, `{\\fad(100,150)}${tags}`));
        break;
      }
      case 'flicker': {
        // 描边宽度脉冲两次（回到原值），强调感
        const big = Math.max(2, Math.round(ol * 2.5) || 4);
        events.push(
          dialogue(
            c.start,
            c.end,
            `{\\fad(80,150)\\t(0,150,\\bord${big})\\t(150,300,\\bord${ol})\\t(300,450,\\bord${big})\\t(450,600,\\bord${ol})}${text}`,
          ),
        );
        break;
      }
      case 'flychar': {
        // 每个字独立一条、绝对定位（中点锚 \an5），从上方 1.5 倍字高处落下
        const chars = Array.from(plain);
        const step = Math.min(0.1, dur / Math.max(1, chars.length));
        const totalW = estTextWidth(plain, fs);
        let x = Math.max(20, anchorX - totalW / 2);
        const dy = Math.round(fs * 1.5);
        for (let i = 0; i < chars.length; i++) {
          const ch = chars[i];
          const w = estTextWidth(ch, fs);
          const cx = x + w / 2;
          const t0 = c.start + i * step;
          events.push(
            dialogue(
              t0,
              c.end,
              `{\\an5\\pos(${Math.round(cx)},${Math.round(rowY - fs / 2)})\\move(${Math.round(cx)},${Math.round(rowY - fs / 2 - dy)},${Math.round(cx)},${Math.round(rowY - fs / 2)},0,250)\\fad(80,0)}${escAssText(ch)}`,
            ),
          );
          x += w;
        }
        break;
      }
    }
  }

  return { ok: true, ass: header + '\n' + events.join('\n') + '\n', events: events.length };
}
