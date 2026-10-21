// 效果面板预览图 —— 把"效果库"从文字清单变成**能看见的卡片**。
//
// ★★★ 为什么需要（2026-10-21 用户：「剪辑模式可以向剪映、pr 靠齐…搞点效果库？音效库？转场，特效？」）：
//   效果注册表里早有 32 个调色 / 25 个转场 / 10 套字幕模板，但 UI 是下拉框和文字按钮 ——
//   用户只能靠名字猜「暖阳」和「黄昏」差在哪。剪映/Premiere 的效果面板之所以能用，
//   前提就是每个效果都有画面。本模块把「效果 × 样例」渲成一张小图或一段循环 mp4，落盘缓存。
//
// 诚实边界（预览不能骗人）：
//   · 调色 / 蒙版：**直接复用渲染链的滤镜串**（effectFilter / buildMaskFilter），
//     卡片上看到的就是导出后的样子，不是另画的示意图。
//   · 字幕模板：走 buildAss，与真实烧录同一份 ASS 生成器。
//   · 转场：用两帧样例跑真实的 xfade，transition id 就是导出用的那个。
//   · 样例优先取**当前工程第一段素材的真实画面**（用自家素材看效果最有说服力）；
//     没有工程 / 取帧失败才退到合成测试图（testsrc2）。
//
// 缓存：键 = 版本 + 效果种类 + id + 样例指纹 + 尺寸，产物落系统临时目录；
//   同一效果第二次打开面板不再起 ffmpeg（卡片网格一次要几十张，不缓存会明显卡）。

import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { runCmd } from './exec-cmd.js';
import { COLOR_EFFECTS, FX_EFFECTS, MASK_SHAPES, MASK_KEYS, TEXT_STYLES, TRANSITIONS, effectFilter, fxFilter } from '@yan-zhi/shared';
import { buildMaskFilter } from './clip-mask.js';
import { buildAss } from '../mcp/subtitle-style.js';
import { hexToAss, escFilterPath } from './clip-render.js';

/** 预览产物种类（与效果库的表一一对应）。 */
export type EffectPreviewKind = 'color' | 'fx' | 'mask' | 'style' | 'transition';

export interface EffectPreviewInput {
  kind: EffectPreviewKind;
  /** 效果 id（必须存在于对应注册表，否则报错 — 拒绝"看起来渲染成功但其实什么都没加"） */
  id: string;
  ffmpeg: string;
  /** 样例来源：本机媒体文件 + 取帧位置（秒）；为空则用合成测试图 */
  sample?: { file: string; atSec: number } | null;
  /** 转场用的第二个样例（可选；不给则由第一个样例派生出一个明显不同的画面） */
  sampleB?: { file: string; atSec: number } | null;
  width?: number;
  height?: number;
}

export interface EffectPreviewResult {
  ok: boolean;
  /** 产物绝对路径（ok=true 时） */
  file?: string;
  mime?: string;
  cached?: boolean;
  error?: string;
}

/** 缓存目录版本号：**改了预览算法就改这里**，否则用户会一直看到旧的（错的）缩略图。 */
const CACHE_VERSION = 'v1';
/** 卡片是 16:9（横屏面板统一）；素材是竖屏时居中裁切，不影响判断效果。 */
const DEFAULT_W = 320;
const DEFAULT_H = 180;
/** 缓存上限：32 调色 + 13 蒙版 + 10 字幕模板 + 25 转场，留足余量。 */
const CACHE_MAX = 400;
/** 转场预览：15fps / 1.2s 足够看清过渡，文件通常 < 60KB。 */
const TRANS_FPS = 15;
const TRANS_XFADE = 0.6;

/** 进行中的渲染任务（按产物路径去重；同一效果并发请求只渲一次）。 */
const inFlight = new Map<string, Promise<EffectPreviewResult>>();

function cacheDir(): string {
  return path.join(tmpdir(), `yz-effect-preview-${CACHE_VERSION}`);
}

function cacheKeyOf(input: EffectPreviewInput, W: number, H: number, extra: string): string {
  const sample = input.sample ? `${input.sample.file}|${input.sample.atSec.toFixed(2)}` : 'synthetic';
  const sampleB = input.sampleB ? `${input.sampleB.file}|${input.sampleB.atSec.toFixed(2)}` : 'derived';
  return createHash('sha1').update([input.kind, input.id, sample, sampleB, W, H, extra].join('|')).digest('hex').slice(0, 20);
}

/** 超上限时按 mtime 淘汰最旧的一部分（预览图随时可再生，不需要精细 LRU）。 */
async function pruneCache(dir: string): Promise<void> {
  try {
    const names = await readdir(dir);
    if (names.length <= CACHE_MAX) return;
    const rows = await Promise.all(names.map(async (n) => {
      const p = path.join(dir, n);
      try { return { p, at: (await stat(p)).mtimeMs }; } catch { return null; }
    }));
    const list = rows.filter((r): r is { p: string; at: number } => !!r).sort((a, b) => a.at - b.at);
    const drop = list.slice(0, Math.max(0, list.length - Math.floor(CACHE_MAX * 0.75)));
    await Promise.all(drop.map((r) => unlink(r.p).catch(() => undefined)));
  } catch { /* 清理失败不影响本次出图 */ }
}

async function ff(ffmpeg: string, args: string[], timeoutMs = 30000): Promise<{ ok: boolean; stderr: string }> {
  const r = await runCmd(ffmpeg, args, { timeoutMs, maxBuffer: 4 * 1024 * 1024 });
  return { ok: r.ok, stderr: r.ok ? '' : (r.stderr || r.error || '').slice(-400) };
}

/** 合成测试图（无工程时的兜底样例）。 */
async function syntheticSample(ffmpeg: string, W: number, H: number, dir: string): Promise<string> {
  const out = path.join(dir, `synthetic-${W}x${H}.png`);
  try { await stat(out); return out; } catch { /* 没生成过 */ }
  const r = await ff(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=1`, '-frames:v', '1', out]);
  return r.ok ? out : '';
}

/**
 * 绿幕/蓝幕/白底/黑底抠像的专用样张。
 * ★ 为什么不能拿普通画面做：色键在非对应底色的画面上**什么都不会发生**，
 *   卡片看起来就像"点了没反应"——比没有预览更糟。这里按 key 的底色现画一张。
 */
async function keySample(ffmpeg: string, keyId: string, W: number, H: number, dir: string): Promise<string> {
  const bg = keyId === 'blue' ? '0x0000FF' : keyId === 'white' ? 'white' : keyId === 'black' ? 'black' : '0x00FF00';
  const out = path.join(dir, `keysample-${keyId}-${W}x${H}.png`);
  try { await stat(out); return out; } catch { /* 没生成过 */ }
  const box = 'drawbox=x=iw*0.28:y=ih*0.18:w=iw*0.44:h=ih*0.64:c=0xFF8A3D@1:t=fill,drawbox=x=iw*0.28:y=ih*0.18:w=iw*0.44:h=ih*0.64:c=white@1:t=6';
  const r = await ff(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${bg}:s=${W}x${H}:r=1`, '-vf', box, '-frames:v', '1', out]);
  return r.ok ? out : '';
}

/** 从真实素材抽一帧作为样例（按文件 mtime + 取帧位置缓存）。 */
async function frameSample(
  ffmpeg: string, file: string, atSec: number, W: number, H: number, dir: string,
): Promise<string> {
  let mtime = 0;
  try { mtime = (await stat(file)).mtimeMs; } catch { return ''; }
  const key = createHash('sha1').update(`${file}|${mtime}|${atSec.toFixed(1)}|${W}x${H}`).digest('hex').slice(0, 16);
  const out = path.join(dir, `sample-${key}.png`);
  try { await stat(out); return out; } catch { /* 没生成过 */ }
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
  const r = await ff(ffmpeg, ['-y', '-v', 'error', '-ss', Math.max(0, atSec).toFixed(3), '-i', file, '-vf', vf, '-frames:v', '1', out]);
  if (r.ok) return out;
  // 图片素材没有时间轴：-ss 会失败，去掉再试一次
  const r2 = await ff(ffmpeg, ['-y', '-v', 'error', '-i', file, '-vf', vf, '-frames:v', '1', out]);
  return r2.ok ? out : '';
}

/** 取样例：真实素材优先，失败退合成图。 */
async function resolveSample(
  ffmpeg: string, s: { file: string; atSec: number } | null | undefined, W: number, H: number, dir: string,
): Promise<string> {
  if (s?.file) {
    const got = await frameSample(ffmpeg, s.file, s.atSec, W, H, dir);
    if (got) return got;
  }
  return syntheticSample(ffmpeg, W, H, dir);
}

/** 转场的第二个画面：没给第二个素材时，把第一个画面偏色，保证过渡看得见。 */
async function deriveSecondFrame(ffmpeg: string, samplePng: string, dir: string): Promise<string> {
  const out = path.join(dir, `sampleB-${createHash('sha1').update(samplePng).digest('hex').slice(0, 12)}.png`);
  try { await stat(out); return out; } catch { /* 没生成过 */ }
  const r = await ff(ffmpeg, ['-y', '-v', 'error', '-i', samplePng, '-vf', 'hue=h=140:s=1.4,eq=brightness=0.06', '-frames:v', '1', out]);
  return r.ok ? out : samplePng;
}

/**
 * 生成（或命中缓存）一张效果预览。
 * 调用方负责把 `file` 以对应 `mime` 返回给前端。
 */
export async function ensureEffectPreview(input: EffectPreviewInput): Promise<EffectPreviewResult> {
  /**
   * ★★★ 尺寸必须规整成偶数（2026-10-21 实跑踩到）：
   *   卡片高度按 16:9 算出来常是 135/113 这类奇数，而 libx264 + yuv420p
   *   **直接拒绝奇数高**（"height not divisible by 2"），表现是"某几张卡片永远无预览"。
   *   横竖屏卡片尺寸都由 UI 传入，所以在这里统一向下取偶，别让每个调用方各记一遍。
   */
  const even = (n: number) => n - (n % 2);
  const W = even(Math.max(120, Math.min(640, Math.round(input.width || DEFAULT_W))));
  const H = even(Math.max(68, Math.min(640, Math.round(input.height || DEFAULT_H))));

  // 先校验 id 存在于注册表 —— 拼错的 id 不能"渲染出一张原片"当成功
  const known = {
    color: COLOR_EFFECTS,
    fx: FX_EFFECTS,
    mask: [...MASK_SHAPES, ...MASK_KEYS],
    style: TEXT_STYLES,
    transition: TRANSITIONS,
  }[input.kind];
  if (!known) return { ok: false, error: `未知预览种类：${input.kind}` };
  if (!known.some((e) => e.id === input.id)) {
    return { ok: false, error: `效果不存在：${input.kind}/${input.id}` };
  }

  const dir = cacheDir();
  const extra = input.kind === 'mask' && MASK_KEYS.some((k) => k.id === input.id) ? 'keysample' : '';
  const key = cacheKeyOf(input, W, H, extra);
  // ★ 特效（fx）也出 mp4：震动/漂浮/残影是**时间相关**的，静帧看起来和原片一模一样 ——
  //   用户会以为"点了没反应"。让卡片动起来才叫预览。
  const moving = input.kind === 'transition' || input.kind === 'fx';
  const ext = moving ? 'mp4' : 'jpg';
  const outFile = path.join(dir, `${input.kind}-${input.id}-${key}.${ext}`);
  const mime = moving ? 'video/mp4' : 'image/jpeg';

  try { await stat(outFile); return { ok: true, file: outFile, mime, cached: true }; } catch { /* 未缓存 */ }

  /**
   * ★★★ 同一效果的并发请求必须合并（2026-10-21 实测）：
   *   卡片网格首次打开会同时请求十几条，两个请求都判定"未缓存"就各渲一份到**同一路径**，
   *   先完成的请求会读到另一个尚未写完的文件 → 浏览器拿到 0 字节/半截 mp4 → 卡片显示"无预览"。
   *   合并后同一 key 只跑一次渲染。
   */
  const key2 = `${outFile}`;
  const running = inFlight.get(key2);
  if (running) return running;

  const job = (async (): Promise<EffectPreviewResult> => {
    try {
      await mkdir(dir, { recursive: true });
      // 先写临时文件再原子改名：中途失败/并发读到的永远是完整文件
      // ★ 临时名必须**保留扩展名**（ffmpeg 按扩展名推断输出容器；改名成 .tmp 会直接失败）
      const tmp = path.join(dir, `${input.kind}-${input.id}-${key}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
      const result = await render(input, W, H, dir, tmp);
      if (!result.ok) {
        await unlink(tmp).catch(() => undefined);
        return result;
      }
      await rename(tmp, outFile);
      await pruneCache(dir);
      return { ok: true, file: outFile, mime, cached: false };
    } catch (e: unknown) {
      return { ok: false, error: `预览生成异常：${e instanceof Error ? e.message : String(e)}` };
    } finally {
      inFlight.delete(key2);
    }
  })();
  inFlight.set(key2, job);
  return job;
}

async function render(
  input: EffectPreviewInput, W: number, H: number, dir: string, outFile: string,
): Promise<EffectPreviewResult> {
  const ffmpeg = input.ffmpeg;
  const norm = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;

  // ── 动态特效（fx）：单帧 → 1.2s 循环 mp4（时间相关的效果必须动起来才看得出） ──
  if (input.kind === 'fx') {
    const samplePng = await resolveSample(ffmpeg, input.sample, W, H, dir);
    if (!samplePng) return { ok: false, error: '样例画面生成失败' };
    const f = fxFilter(input.id, W, H) ?? '';
    const vf = f ? `${norm},${f},format=yuv420p,fps=${TRANS_FPS}` : `${norm},format=yuv420p,fps=${TRANS_FPS}`;
    const r = await ff(ffmpeg, [
      '-y', '-v', 'error', '-loop', '1', '-t', String(TRANS_XFADE * 2), '-i', samplePng,
      '-vf', vf, '-t', String(TRANS_XFADE * 2),
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile,
    ], 40000);
    return r.ok ? { ok: true } : { ok: false, error: `特效预览失败：${r.stderr}` };
  }

  // ── 转场：两帧真实跑 xfade，产出循环 mp4（悬停播放） ──
  if (input.kind === 'transition') {
    const a = await resolveSample(ffmpeg, input.sample, W, H, dir);
    if (!a) return { ok: false, error: '样例画面生成失败' };
    const b = input.sampleB
      ? await resolveSample(ffmpeg, input.sampleB, W, H, dir)
      : await deriveSecondFrame(ffmpeg, a, dir);
    if (!b) return { ok: false, error: '转场第二画面生成失败' };
    const total = TRANS_XFADE * 2;
    const fc =
      `[0:v]${norm},fps=${TRANS_FPS},format=yuv420p[a];` +
      `[1:v]${norm},fps=${TRANS_FPS},format=yuv420p[b];` +
      `[a][b]xfade=transition=${input.id}:duration=${TRANS_XFADE}:offset=${TRANS_XFADE}[v]`;
    const r = await ff(ffmpeg, [
      '-y', '-v', 'error',
      '-loop', '1', '-t', String(total), '-i', a,
      '-loop', '1', '-t', String(total), '-i', b,
      '-filter_complex', fc, '-map', '[v]', '-t', String(total),
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile,
    ], 40000);
    return r.ok ? { ok: true } : { ok: false, error: `转场预览失败：${r.stderr}` };
  }

  // ── 蒙版：色键类用对应底色样张，形状类用普通样例 ──
  let samplePng: string;
  if (input.kind === 'mask' && MASK_KEYS.some((k) => k.id === input.id)) {
    samplePng = await keySample(ffmpeg, input.id, W, H, dir);
    if (!samplePng) samplePng = await resolveSample(ffmpeg, input.sample, W, H, dir);
  } else {
    samplePng = await resolveSample(ffmpeg, input.sample, W, H, dir);
  }
  if (!samplePng) return { ok: false, error: '样例画面生成失败' };

  // ── 字幕模板：写 ASS 再烧到样例上（与导出同一份 buildAss） ──
  if (input.kind === 'style') {
    const st = TEXT_STYLES.find((s) => s.id === input.id)!;
    const style = st.style;
    const fsPx = Math.max(6, Math.round((style.fontSizePx ?? 88) * H / 1920));
    const olPx = Math.max(0, Math.round((style.outlinePx ?? 12) * H / 1920));
    const mvPx = style.safeArea ? Math.round(420 * H / 1920) : Math.round(200 * H / 1920);
    const ass = buildAss(
      [{ start: 0, end: 3, text: '示例字幕 Aa', preset: 'none' }],
      {
        preset: 'none',
        playResX: W,
        playResY: H,
        fontSizePx: fsPx,
        primaryColor: hexToAss(style.color, '&H00FFFFFF&'),
        outlineColor: hexToAss(style.outlineColor, '&H00000000&'),
        outlinePx: olPx,
        ...(style.backColor ? { backColor: hexToAss(style.backColor, '&H7F000000') } : {}),
        alignment: style.position === 'top' ? 8 : style.position === 'center' ? 5 : 2,
        marginVPx: mvPx,
      },
    );
    if (!ass.ok) return { ok: false, error: ass.error };
    const assFile = `${outFile}.ass`;
    await writeFile(assFile, ass.ass, 'utf8');
    const r = await ff(ffmpeg, [
      '-y', '-v', 'error', '-loop', '1', '-i', samplePng,
      '-vf', `subtitles='${escFilterPath(assFile)}'`, '-ss', '0.5', '-frames:v', '1', '-q:v', '5', outFile,
    ]);
    // ASS 是中间产物，留着只是垃圾（缓存键已含效果 id，不会复用错）
    await unlink(assFile).catch(() => undefined);
    return r.ok ? { ok: true } : { ok: false, error: `字幕模板预览失败：${r.stderr}` };
  }

  // ── 调色 / 形状蒙版：拼滤镜链，出单帧 jpg（fx 已在上面走 mp4 分支） ──
  let filter = '';
  if (input.kind === 'color') {
    filter = effectFilter(input.id, COLOR_EFFECTS) ?? '';
  } else if (input.kind === 'mask') {
    const keyFilterOf = (id: string) => MASK_KEYS.find((k) => k.id === id)?.filter || null;
    const preset = MASK_KEYS.find((k) => k.id === input.id);
    filter = preset
      ? (keyFilterOf(input.id) ?? '')
      : (buildMaskFilter({ shape: input.id, scale: 0.78, offsetX: 0, offsetY: 0, feather: 0 }) ?? '');
  }
  // 蒙版滤镜内部已带来一段 rgba 链，末尾统一转 yuv 才能编码成 jpg
  const vf = filter ? `${filter},format=yuv420p` : 'format=yuv420p';
  const r = await ff(ffmpeg, ['-y', '-v', 'error', '-i', samplePng, '-vf', vf, '-frames:v', '1', '-q:v', '5', outFile]);
  return r.ok ? { ok: true } : { ok: false, error: `缩略图生成失败：${r.stderr}` };
}
