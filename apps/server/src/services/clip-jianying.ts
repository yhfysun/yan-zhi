// 剪映剪辑（Jianying）—— 检测本机剪映、把剪辑工程导出成剪映草稿、启动剪映。
//
// 两种剪辑模式的分工（产品口径）：
//   · 应用内剪辑（clip_project + ClipWorkbench）：语义与成片完全可控，渲染在本应用；
//   · 剪映剪辑（本文件）：把工程翻译成剪映草稿，用户在剪映里继续剪、预览、导出 ——
//     剪映的实时预览/特效库/手动微调更强，这条路是「让用户在顺手的工具里完成」。
//
// ★ 草稿格式来源：pyJianYingDraft 0.3.x（Apache-2.0）的模板与 Track/Segment 导出规则，
//   见 clip-jianying-template.ts。新建草稿在剪映 5.9 / 10.8 / 11.1 可打开（向下兼容）。
// ★ 诚实边界：草稿只承载「素材 + 裁剪 + 变速 + 字幕 + BGM + 画中画」。
//   调色/结构特效/蒙版/转场/关键帧/倒放/曲线变速/音效链没有对应资源 id，不能凭空编造
//   （编造会让草稿打不开或效果错乱）——一律降级，并在 warnings 里逐项如实列出。
import { existsSync, readdirSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ClipProject, ClipSegment, ClipText, ClipOverlay } from './clip-project.js';
import { segmentDuration, trimmedSourceLength } from './clip-render.js';
import {
  JIANYING_DRAFT_CONTENT_TEMPLATE,
  JIANYING_DRAFT_META_TEMPLATE,
} from './clip-jianying-template.js';
import {
  JY_TRANSITIONS, JY_COLORS, JY_FX, JY_MASKS, JY_CHROMA, JY_FADE_IN, JY_FADE_OUT,
  JY_TEXT_INTRO, JY_TEXT_OUTRO, JY_TEXT_SLIDE,
  type JyColorRef, type JyRef, type JyMaskRef, type JyTransitionRef,
} from './clip-jianying-effects.js';

/** 秒 → 微秒（草稿的时间单位是微秒，整数）。 */
const US = 1_000_000;
/** 图片没有时长时给 3 秒（与应用内渲染的默认图片段一致）。 */
const DEFAULT_IMAGE_SEC = 3;
/** 图片素材在剪映里的「素材时长」——pyJianYingDraft 用 3 小时占位。 */
const PHOTO_MATERIAL_US = 10_800_000_000;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|heic)$/i;
/** 字号换算：我们的 fontSizePx 以 1920 高为基准，剪映的 size 以画布比例计。 */
const TEXT_SIZE_SCALE = 200 / 1920;

// ===== 安装 / 草稿目录检测 =====

export interface JianyingInstallInfo {
  installed: boolean;
  exe?: string;
  version?: string;
  draftRoot?: string;
  checked: { exe: string[]; draftRoots: string[] };
  note: string;
}

export interface JianyingDraftSummary {
  name: string;
  dir: string;
  updatedAt: number;
  durationSec?: number;
  /** 新版剪映保存的草稿可能不是明文 JSON（读不出内容时为 true）。 */
  encrypted?: boolean;
}

/** 剪映可执行文件的常见位置（Windows 优先；也覆盖 macOS/Linux 的常见布局）。 */
export function jianyingExeCandidates(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  const out: string[] = [];
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(env.USERPROFILE || '', 'AppData', 'Local');
    out.push(
      path.join(local, 'JianyingPro', 'JianyingPro.exe'),
      path.join(local, 'Programs', 'JianyingPro', 'JianyingPro.exe'),
      'C:\\Program Files\\JianyingPro\\JianyingPro.exe',
      'C:\\Program Files (x86)\\JianyingPro\\JianyingPro.exe',
    );
    // 剪映升级器的实际布局：%LOCALAPPDATA%\JianyingPro\Apps\<版本>\JianyingPro.exe
    const apps = path.join(local, 'JianyingPro', 'Apps');
    try {
      for (const d of readdirSync(apps)) out.push(path.join(apps, d, 'JianyingPro.exe'));
    } catch { /* 没装 / 没有该目录 */ }
  } else if (platform === 'darwin') {
    out.push(
      '/Applications/剪映专业版.app/Contents/MacOS/剪映专业版',
      '/Applications/JianyingPro.app/Contents/MacOS/JianyingPro',
    );
  } else {
    const home = env.HOME || '';
    out.push(path.join(home, 'JianyingPro', 'JianyingPro'), '/opt/JianyingPro/JianyingPro');
  }
  return [...new Set(out)];
}

/** 剪映草稿根目录的候选位置（可在环境变量 JIANYING_DRAFT_ROOT 显式指定）。 */
export function jianyingDraftRootCandidates(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  const home = env.USERPROFILE || env.HOME || '';
  const out: string[] = [];
  if (env.JIANYING_DRAFT_ROOT) out.push(path.resolve(env.JIANYING_DRAFT_ROOT));
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    out.push(
      // 剪映专业版经典位置
      path.join(local, 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft'),
      path.join(local, 'JianyingPro', 'User Data', 'Projects', 'JianyingPro Drafts'),
      // 用户可在「全局设置 → 草稿位置」改到文档目录
      path.join(home, 'Documents', 'JianyingPro Drafts'),
      path.join(home, 'Documents', '剪映草稿'),
      // 兜底：Projects 父目录（部分版本不再带 com.lveditor.draft 子目录）
      path.join(local, 'JianyingPro', 'User Data', 'Projects'),
    );
  } else if (platform === 'darwin') {
    out.push(
      path.join(home, 'Movies', 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft'),
      path.join(home, 'Movies', 'JianyingPro Drafts'),
    );
  } else {
    out.push(
      path.join(home, '.local', 'share', 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft'),
      path.join(home, 'JianyingPro Drafts'),
    );
  }
  return [...new Set(out)];
}

/** 找草稿根目录：优先「确实有草稿」的目录，其次「存在但为空」的目录。 */
export function findJianyingDraftRoot(opts: {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  exists?: (p: string) => boolean;
} = {}): string | null {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const exists = opts.exists ?? existsSync;
  const explicit = env.JIANYING_DRAFT_ROOT ? path.resolve(env.JIANYING_DRAFT_ROOT) : '';
  if (explicit && exists(explicit)) return explicit;
  const existing = jianyingDraftRootCandidates(env, platform).filter((p) => p && exists(p));
  if (!existing.length) return null;
  const withDrafts = existing.find((p) => listJianyingDrafts(p, 1).length > 0);
  if (withDrafts) return withDrafts;
  // ★ 没有草稿时只接受「名字就是草稿根」的目录。Projects 父目录是兜底候选：
  //   若它存在但草稿根还没建（首次启动剪映前），写进去会落在错误层级 —— 宁可返回 null 让用户指路。
  const named = existing.find((p) => /(com\.lveditor\.draft|JianyingPro Drafts|剪映草稿)$/i.test(p));
  return named || null;
}

/** 检测本机是否装了剪映；Windows 上补一次注册表查询（安装目录被自定义时路径枚举会落空）。 */
export async function detectJianying(opts: {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  exists?: (p: string) => boolean;
  registryLookup?: () => Promise<string | null>;
  versionOf?: (exe: string) => Promise<string | null>;
} = {}): Promise<JianyingInstallInfo> {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const exists = opts.exists ?? existsSync;
  const exeCandidates = jianyingExeCandidates(env, platform);
  let exe = exeCandidates.find((p) => exists(p)) || null;
  if (!exe && platform === 'win32') {
    try { exe = await (opts.registryLookup ?? findJianyingExeFromRegistry)(); } catch { exe = null; }
  }
  const draftRoot = findJianyingDraftRoot({ env, platform, exists });
  let version: string | undefined;
  if (exe) {
    try { version = (await (opts.versionOf ?? probeExeVersion)(exe)) || undefined; } catch { /* 版本只是展示信息 */ }
  }
  const note = !exe
    ? '未检测到剪映专业版：可以照常使用应用内剪辑；要装剪映请让用户从官网安装后重试。'
    : !draftRoot
      ? '已检测到剪映，但没找到草稿目录：先打开一次剪映（或在其「全局设置 → 草稿位置」确认路径），也可以用 draftRoot 参数显式指定。'
      : `剪映已就绪${version ? `（v${version}）` : ''}，草稿目录：${draftRoot}`;
  return {
    installed: !!exe,
    ...(exe ? { exe } : {}),
    ...(version ? { version } : {}),
    ...(draftRoot ? { draftRoot } : {}),
    checked: { exe: exeCandidates, draftRoots: jianyingDraftRootCandidates(env, platform) },
    note,
  };
}

function runPowerShell(script: string, timeoutMs = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err ? null : (String(stdout || '').trim() || null)),
    );
  });
}

/** 从卸载注册表里找剪映安装目录（脚本保持纯 ASCII，避免中文参数的编码问题）。 */
async function findJianyingExeFromRegistry(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const roots = [
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  const script = [
    `$roots = @(${roots.map((r) => `'${r}'`).join(',')})`,
    'foreach ($r in $roots) {',
    '  Get-ChildItem $r -ErrorAction SilentlyContinue | ForEach-Object {',
    '    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue;',
    "    if ($p.InstallLocation -match 'Jianying') { $p.InstallLocation }",
    "    if ($p.DisplayIcon -match 'Jianying') { $p.DisplayIcon }",
    '  }',
    '}',
  ].join('\n');
  const out = await runPowerShell(script);
  if (!out) return null;
  for (const line of out.split(/\r?\n/)) {
    const raw = line.trim().replace(/^"|"$/g, '');
    if (!raw) continue;
    const exe = /\.exe/i.test(raw) ? raw.replace(/,\d+$/, '') : path.join(raw, 'JianyingPro.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}

async function probeExeVersion(exe: string): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const safe = exe.replace(/'/g, "''");
  const out = await runPowerShell(`(Get-Item -LiteralPath '${safe}').VersionInfo.ProductVersion`);
  return out ? out.split(/\r?\n/)[0].trim() || null : null;
}

/** 只看文件头判断「是不是明文 JSON」——不整份 parse（草稿可达数 MB，同步读会阻塞事件循环）。 */
function looksPlainJson(file: string): boolean | undefined {
  try {
    const st = statSync(file);
    if (st.size > 8 * 1024 * 1024) return undefined; // 太大不判断，避免内存尖峰
    const fd = openSync(file, 'r');
    try {
      const buf = Buffer.alloc(64);
      const n = readSync(fd, buf, 0, 64, 0);
      const head = buf.subarray(0, n).toString('utf8').replace(/^﻿/, '').trimStart();
      return head.startsWith('{');
    } finally {
      closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

/** 列出草稿根目录下的草稿（按最后修改时间倒序）。 */
export function listJianyingDrafts(root: string, limit = 50): JianyingDraftSummary[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const rows: Array<JianyingDraftSummary & { contentFile: string }> = [];
  for (const name of entries) {
    const dir = path.join(root, name);
    const contentFile = path.join(dir, 'draft_content.json');
    const metaFile = path.join(dir, 'draft_meta_info.json');
    if (!existsSync(contentFile) && !existsSync(metaFile)) continue;
    let updatedAt = 0;
    try { updatedAt = statSync(dir).mtimeMs; } catch { /* 忽略 */ }
    let displayName = name;
    let durationSec: number | undefined;
    try {
      const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Record<string, unknown>;
      if (typeof meta.draft_name === 'string' && meta.draft_name.trim()) displayName = meta.draft_name.trim();
      const us = Number(meta.tm_duration);
      if (Number.isFinite(us) && us > 0) durationSec = us / US;
    } catch { /* 没有 meta / 非明文都按目录名展示 */ }
    rows.push({
      name: displayName,
      dir,
      updatedAt,
      ...(durationSec ? { durationSec } : {}),
      contentFile,
    });
  }
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
  return rows.slice(0, Math.max(1, limit)).map(({ contentFile, ...row }) => {
    // 只对最终要返回的条目做「是否明文」探测（先排序截断，避免扫全目录）
    const plain = looksPlainJson(contentFile);
    return { ...row, ...(plain === false ? { encrypted: true } : {}) };
  });
}

// ===== 草稿生成 =====

export interface JianyingMediaInfo {
  durationSec?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

export interface JianyingDraftInput {
  project: ClipProject;
  /** 按素材绝对路径索引的探测信息（时长/尺寸）。缺省时按「时长未知」降级。 */
  media: Record<string, JianyingMediaInfo>;
  name: string;
  draftDir?: string;
  draftRoot?: string;
}

export interface JianyingDraftStats {
  clips: number;
  images: number;
  texts: number;
  audios: number;
  overlays: number;
  transitions: number;
  durationSec: number;
}

export interface JianyingDraftBuild {
  content: Record<string, unknown>;
  meta: Record<string, unknown>;
  stats: JianyingDraftStats;
  warnings: string[];
}

export function parseCanvasSize(size: string | undefined): { width: number; height: number } {
  const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i.exec(String(size || '').trim());
  if (!m) return { width: 1080, height: 1920 };
  return { width: Number(m[1]), height: Number(m[2]) };
}

/** 草稿名 = 草稿文件夹名。去掉 Windows 非法字符，避免剪映/资源管理器打不开。 */
export function sanitizeDraftName(raw: string): string {
  let name = String(raw || '').replace(/[\\/:*?"<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) name = '未命名草稿';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name = `草稿-${name}`;
  return name;
}

/** 重名不覆盖 —— 剪映里同名草稿会混淆，也避免覆盖用户已有工程。 */
export function uniqueDraftDir(root: string, name: string, exists: (p: string) => boolean = existsSync): string {
  const base = path.join(root, sanitizeDraftName(name));
  if (!exists(base)) return base;
  for (let i = 2; i < 100; i++) {
    const p = path.join(root, `${path.basename(base)} (${i})`);
    if (!exists(p)) return p;
  }
  return path.join(root, `${path.basename(base)}-${Date.now()}`);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function hexId(): string {
  return randomUUID().replace(/-/g, '');
}

function upperUuid(): string {
  return randomUUID().toUpperCase();
}

function secToUs(sec: number): number {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * US);
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

/** 十六进制颜色 → 剪映的 [r,g,b]（0~1 浮点）。 */
export function hexToRgb01(input: string | undefined, fallback: [number, number, number] = [1, 1, 1]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(String(input || '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function hexAlpha(input: string | undefined): number {
  const m = /^#?[0-9a-f]{6}([0-9a-f]{2})$/i.exec(String(input || '').trim());
  return m ? parseInt(m[1], 16) / 255 : 1;
}

/** 裁剪区（比例）→ 剪映素材的 crop 四角。缺省 = 全画面。 */
function cropOf(crop?: ClipSegment['crop']): Record<string, number> {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const x = clamp(Number(crop?.x ?? 0), 0, 0.9);
  const y = clamp(Number(crop?.y ?? 0), 0, 0.9);
  const w = clamp(Number(crop?.w ?? 1), 0.1, 1);
  const h = clamp(Number(crop?.h ?? 1), 0.1, 1);
  const right = Math.min(1, x + w);
  const bottom = Math.min(1, y + h);
  return {
    upper_left_x: x, upper_left_y: y,
    upper_right_x: right, upper_right_y: y,
    lower_left_x: x, lower_left_y: bottom,
    lower_right_x: right, lower_right_y: bottom,
  };
}

function videoMaterial(
  file: string,
  isImage: boolean,
  info: JianyingMediaInfo,
  canvas: { width: number; height: number },
  fallbackDurationSec = 0,
  crop?: ClipSegment['crop'],
): Record<string, unknown> {
  const id = hexId();
  // 探测失败（时长 0）时用段有效时长兜底：素材时长 0 会让剪映里该段不可见
  const duration = isImage ? PHOTO_MATERIAL_US : (secToUs(info.durationSec || 0) || secToUs(fallbackDurationSec));
  return {
    audio_fade: null,
    category_id: '',
    category_name: 'local',
    check_flag: 63487,
    crop: cropOf(crop),
    crop_ratio: 'free',
    crop_scale: 1.0,
    duration,
    height: Number(info.height) > 0 ? Number(info.height) : canvas.height,
    id,
    local_material_id: '',
    material_id: id,
    material_name: baseName(file),
    media_path: '',
    path: file,
    type: isImage ? 'photo' : 'video',
    width: Number(info.width) > 0 ? Number(info.width) : canvas.width,
  };
}

function audioMaterial(file: string, durationSec: number): Record<string, unknown> {
  const id = hexId();
  return {
    app_id: 0,
    category_id: '',
    category_name: 'local',
    check_flag: 3,
    copyright_limit_type: 'none',
    duration: secToUs(durationSec),
    effect_id: '',
    formula_id: '',
    id,
    local_material_id: id,
    music_id: id,
    name: baseName(file),
    path: file,
    source_platform: 0,
    type: 'extract_music',
    wave_points: [],
  };
}

function speedMaterial(speed: number): Record<string, unknown> {
  return { curve_speed: null, id: hexId(), mode: 0, speed, type: 'speed' };
}

function baseSegment(materialId: string, startUs: number, durationUs: number): Record<string, unknown> {
  return {
    enable_adjust: true,
    enable_color_correct_adjust: false,
    enable_color_curves: true,
    enable_color_match_adjust: false,
    enable_color_wheels: true,
    enable_lut: true,
    enable_smart_color_adjust: false,
    last_nonzero_volume: 1.0,
    reverse: false,
    track_attribute: 0,
    track_render_index: 0,
    visible: true,
    id: hexId(),
    material_id: materialId,
    target_timerange: { start: startUs, duration: durationUs },
    common_keyframes: [],
    keyframe_refs: [],
  };
}

function videoSegment(params: {
  materialId: string;
  speedId: string;
  startUs: number;
  durationUs: number;
  sourceStartUs: number;
  sourceDurationUs: number;
  speed: number;
  volume: number;
  flip?: 'h' | 'v' | 'both';
  rotate?: number;
  scaleX?: number;
  scaleY?: number;
  transformX?: number;
  transformY?: number;
  extraRefs?: string[];
  commonKeyframes?: Array<Record<string, unknown>>;
  reverse?: boolean;
}): Record<string, unknown> {
  return {
    ...baseSegment(params.materialId, params.startUs, params.durationUs),
    source_timerange: { start: params.sourceStartUs, duration: params.sourceDurationUs },
    speed: params.speed,
    volume: params.volume,
    extra_material_refs: [params.speedId, ...(params.extraRefs || [])],
    is_tone_modify: false,
    reverse: params.reverse === true,
    clip: {
      alpha: 1.0,
      flip: {
        horizontal: params.flip === 'h' || params.flip === 'both',
        vertical: params.flip === 'v' || params.flip === 'both',
      },
      rotation: params.rotate || 0,
      scale: { x: params.scaleX ?? 1, y: params.scaleY ?? 1 },
      transform: { x: params.transformX ?? 0, y: params.transformY ?? 0 },
    },
    uniform_scale: { on: true, value: 1.0 },
    hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
    ...(params.commonKeyframes?.length ? { common_keyframes: params.commonKeyframes } : {}),
  };
}

function audioSegment(params: {
  materialId: string;
  speedId: string;
  startUs: number;
  durationUs: number;
  sourceStartUs: number;
  sourceDurationUs: number;
  volume: number;
}): Record<string, unknown> {
  return {
    ...baseSegment(params.materialId, params.startUs, params.durationUs),
    source_timerange: { start: params.sourceStartUs, duration: params.sourceDurationUs },
    speed: 1,
    volume: params.volume,
    extra_material_refs: [params.speedId],
    is_tone_modify: false,
    clip: null,
    hdr_settings: null,
  };
}

function textMaterial(text: ClipText): Record<string, unknown> {
  const content = String(text.text || '');
  const color = hexToRgb01(text.color, [1, 1, 1]);
  const outlineColor = hexToRgb01(text.outlineColor, [0, 0, 0]);
  const outlinePx = text.outlinePx == null ? 12 : Math.max(0, Number(text.outlinePx) || 0);
  const fontSizePx = text.fontSizePx == null ? 88 : Math.max(1, Number(text.fontSizePx) || 88);
  // 剪映 size 是画布相对字号；fontSizePx 以 1920 高为基准 → 8~60 的常用区间
  const size = Math.min(60, Math.max(2, fontSizePx * TEXT_SIZE_SCALE));
  const style: Record<string, unknown> = {
    fill: { alpha: 1.0, content: { render_type: 'solid', solid: { alpha: 1.0, color } } },
    range: [0, content.length],
    size,
    bold: false,
    italic: false,
    underline: false,
    strokes: outlinePx > 0
      ? [{ content: { solid: { alpha: 1.0, color: outlineColor } }, width: Math.min(0.2, outlinePx * 0.002) }]
      : [],
  };
  const mat: Record<string, unknown> = {
    id: hexId(),
    content: JSON.stringify({ styles: [style], text: content }),
    typesetting: 0,
    alignment: 1,
    letter_spacing: 0,
    line_spacing: 0.02,
    line_feed: 1,
    line_max_width: 0.82,
    force_apply_line_max_width: false,
    check_flag: 7 | (outlinePx > 0 ? 8 : 0) | (text.backColor ? 16 : 0),
    type: 'text',
    global_alpha: 1.0,
  };
  if (text.backColor) {
    const m = /^#?([0-9a-f]{6})/i.exec(text.backColor);
    mat.background_style = 1;
    mat.background_color = m ? `#${m[1]}` : '#000000';
    mat.background_alpha = hexAlpha(text.backColor);
    mat.background_round_radius = 0.0;
    mat.background_height = 0.14;
    mat.background_width = 0.14;
    mat.background_horizontal_offset = 0;
    mat.background_vertical_offset = 0;
  }
  return mat;
}

function textSegment(text: ClipText, materialId: string, speedId: string, extraRefs: string[] = []): Record<string, unknown> {
  const y = text.position === 'center' ? 0 : text.position === 'top' ? 0.6 : (text.safeArea ? -0.55 : -0.8);
  return {
    ...baseSegment(materialId, secToUs(Number(text.start) || 0), secToUs((Number(text.end) || 0) - (Number(text.start) || 0))),
    source_timerange: null,
    speed: 1,
    volume: 1,
    extra_material_refs: [speedId, ...extraRefs],
    is_tone_modify: false,
    clip: {
      alpha: 1.0,
      flip: { horizontal: false, vertical: false },
      rotation: 0,
      scale: { x: 1, y: 1 },
      transform: { x: 0, y },
    },
    uniform_scale: { on: true, value: 1.0 },
  };
}

/** 把一组片段按「不重叠」装箱，映射成草稿的轨道（同轨片段不能重叠）。 */
function packTracks(segments: Array<Record<string, unknown>>): Array<Array<Record<string, unknown>>> {
  const sorted = [...segments].sort((a, b) => {
    const ta = a.target_timerange as { start: number };
    const tb = b.target_timerange as { start: number };
    return ta.start - tb.start;
  });
  const bins: Array<{ end: number; segs: Array<Record<string, unknown>> }> = [];
  for (const seg of sorted) {
    const range = seg.target_timerange as { start: number; duration: number };
    const bin = bins.find((b) => b.end <= range.start);
    if (bin) {
      bin.segs.push(seg);
      bin.end = range.start + range.duration;
    } else {
      bins.push({ end: range.start + range.duration, segs: [seg] });
    }
  }
  return bins.map((b) => b.segs);
}

function overlayTransform(ov: ClipOverlay): { x: number; y: number } {
  const scale = ov.scale == null ? 0.35 : Math.min(1, Math.max(0.05, Number(ov.scale) || 0.35));
  const m = 1 - scale; // 贴边时的最大位移（以半画布为单位）
  const pos = String(ov.pos || 'bottomright');
  const x = pos.includes('left') ? -m : pos.includes('right') ? m : 0;
  const y = pos.includes('top') ? m : pos.includes('bottom') ? -m : 0;
  return { x, y };
}

// ===== 剪映素材：滤镜 / 视频特效 / 转场 / 蒙版 / 色度抠图 / 动画 / 关键帧 =====
// 结构取自 pyJianYingDraft 的 Filter / VideoEffect / Transition / Mask / Chroma /
// SegmentAnimations / KeyframeList 导出实现（Apache-2.0，见 clip-jianying-effects.ts）。

function filterMaterial(ref: JyColorRef, intensity: number): Record<string, unknown> {
  const raw = Number(intensity);
  const value = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
  return {
    adjust_params: [],
    algorithm_artifact_path: '',
    apply_target_type: 0,
    bloom_params: null,
    category_id: '',
    category_name: '',
    color_match_info: { source_feature_path: '', target_feature_path: '', target_image_path: '' },
    effect_id: ref.effectId,
    enable_skin_tone_correction: false,
    exclusion_group: [],
    face_adjust_params: [],
    formula_id: '',
    id: hexId(),
    intensity_key: '',
    multi_language_current: '',
    name: ref.name,
    panel_id: '',
    platform: 'all',
    resource_id: ref.resourceId,
    source_platform: 1,
    sub_type: 'none',
    time_range: null,
    type: 'filter',
    value,
    version: '',
  };
}

function videoEffectMaterial(ref: JyRef): Record<string, unknown> {
  return {
    adjust_params: [],
    apply_target_type: 0,
    apply_time_range: null,
    category_id: '',
    category_name: '',
    common_keyframes: [],
    disable_effect_faces: [],
    effect_id: ref.effectId,
    formula_id: '',
    id: hexId(),
    name: ref.name,
    platform: 'all',
    render_index: 11000,
    resource_id: ref.resourceId,
    source_platform: 0,
    time_range: null,
    track_render_index: 0,
    type: 'video_effect',
    value: 1.0,
    version: '',
  };
}

function transitionMaterial(ref: JyTransitionRef, durationUs: number): Record<string, unknown> {
  return {
    category_id: '',
    category_name: '',
    duration: durationUs,
    effect_id: ref.effectId,
    id: hexId(),
    is_overlap: ref.isOverlap,
    name: ref.name,
    platform: 'all',
    resource_id: ref.resourceId,
    type: 'transition',
  };
}

function maskMaterials(ref: JyMaskRef, seg: ClipSegment): { legacy: Record<string, unknown>; common: Record<string, unknown> } {
  const isRect = ref.resourceType === 'rectangle';
  const isSplit = ref.resourceType === 'line';
  const isTopCircle = seg.mask?.shape === 'top_circle';
  const size = isSplit ? 1 : Math.min(1, Math.max(0.05, Number(seg.mask?.scale ?? 0.5)));
  const id = hexId();
  const config = {
    aspectRatio: ref.aspectRatio,
    centerX: Number(seg.mask?.offsetX ?? 0),
    centerY: isTopCircle ? 0.35 : Number(seg.mask?.offsetY ?? 0),
    feather: Math.min(1, Math.max(0, Number(seg.mask?.feather ?? 0) / 200)),
    height: size,
    invert: false,
    rotation: ref.rotation || 0,
    roundCorner: seg.mask?.shape === 'rounded' ? 0.2 : 0,
    width: isRect ? size : size * ref.aspectRatio,
  };
  const legacy: Record<string, unknown> = {
    config,
    id,
    name: ref.name,
    platform: 'all',
    position_info: '',
    resource_type: ref.resourceType,
    resource_id: ref.resourceId,
    type: 'mask',
  };
  // 新版剪映读 common_mask（旧版读 masks）；两份同 id，extra_material_refs 只引用一次
  const common: Record<string, unknown> = {
    ...legacy,
    category: 'video',
    category_id: 'jichu',
    category_name: '基础',
    is_old_version: false,
    loader_work_space: '',
    panel: '',
    source_platform: 0,
    track_segment: '',
    text_config: {
      align_type: 15, bold_width: 0.0, char_spacing: 0.0, content: '',
      font_name: '', font_path: '', font_resource_id: '', font_size: 15.0,
      has_underline: false, italic_degree: 0, line_gap: 0.0, scale: 1.0,
    },
    config: { ...config, expansion: 0.0 },
  };
  return { legacy, common };
}

function chromaMaterial(ref: { color: string; intensity: number; shadow: number; edge: number; spill: number }): Record<string, unknown> {
  return {
    color: ref.color,
    edge_smooth_value: ref.edge,
    id: hexId(),
    intensity_value: ref.intensity,
    shadow_value: ref.shadow,
    should_transfer_color: true,
    spill_value: ref.spill,
    type: 'chroma',
    version: 'v2',
  };
}

function animationMaterial(
  entries: Array<{ ref: JyRef; type: 'in' | 'out'; startUs: number; durationUs: number }>,
  opts: { text?: boolean } = {},
): { id: string; material: Record<string, unknown> } {
  const id = hexId();
  return {
    id,
    material: {
      id,
      type: 'sticker_animation',
      multi_language_current: 'none',
      animations: entries.map((e) => ({
        anim_adjust_params: null,
        platform: 'all',
        panel: opts.text ? '' : 'video',
        material_type: opts.text ? 'sticker' : 'video',
        name: e.ref.name,
        id: e.ref.effectId,
        type: e.type,
        resource_id: e.ref.resourceId,
        start: Math.max(0, Math.round(e.startUs)),
        duration: Math.max(0, Math.round(e.durationUs)),
      })),
    },
  };
}

function keyframeList(prop: string, points: Array<{ t: number; value: number }>, targetUs: number): Record<string, unknown> {
  return {
    id: hexId(),
    keyframe_list: points.map((p) => ({
      curveType: 'Line',
      graphID: '',
      left_control: { x: 0.0, y: 0.0 },
      right_control: { x: 0.0, y: 0.0 },
      id: hexId(),
      time_offset: Math.max(0, Math.round(p.t * targetUs)),
      values: [Math.round(p.value * 10000) / 10000],
    })),
    material_id: '',
    property_type: prop,
  };
}

/** 补 0/1 端点：我们的渲染语义是“端点外 clamp”，剪映关键帧也按首尾值保持，语义一致。 */
function withAnchors(points: Array<{ t: number; value: number }>): Array<{ t: number; value: number }> {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  if (!sorted.length) return sorted;
  const out = [...sorted];
  if (out[0].t > 0) out.unshift({ t: 0, value: out[0].value });
  if (out[out.length - 1].t < 1) out.push({ t: 1, value: out[out.length - 1].value });
  return out;
}

/**
 * 把剪映工程翻译成草稿 JSON（纯函数，便于单测）。
 * 时间单位统一微秒；字幕/画中画时间与 clip 工程一致（相对成片，不含转场压缩）。
 */
export function buildJianyingDraft(input: JianyingDraftInput): JianyingDraftBuild {
  const project = input.project;
  const canvas = parseCanvasSize(project.output?.size);
  const fps = project.output?.fps && project.output.fps > 0 ? project.output.fps : 30;
  const content = clone(JIANYING_DRAFT_CONTENT_TEMPLATE) as Record<string, any>;
  content.canvas_config = { width: canvas.width, height: canvas.height, ratio: 'original' };
  content.fps = fps;
  content.config.maintrack_adsorb = true;
  content.name = input.name || '';
  // 草稿自身 id / 时间戳：固定模板 id 会让多份草稿共用同一 id；时间戳用于剪映草稿箱排序
  const nowSec = Math.floor(Date.now() / 1000);
  content.id = upperUuid();
  content.create_time = nowSec;
  content.update_time = nowSec;

  const materials = content.materials as Record<string, any[]>;
  // 模板里没有 common_mask（新版剪映蒙版），补齐所有会被写入的素材数组
  for (const key of ['videos', 'audios', 'texts', 'speeds', 'effects', 'video_effects', 'material_animations', 'masks', 'common_mask', 'chromas', 'transitions']) {
    if (!Array.isArray(materials[key])) materials[key] = [];
  }
  const warnings = new Set<string>();
  const tracks: Array<Record<string, unknown>> = [];

  const videoSegs: Array<Record<string, unknown>> = [];
  const voiceSegs: Array<Record<string, unknown>> = [];
  const textSegs: Array<Record<string, unknown>> = [];
  let clipCount = 0;
  let imageCount = 0;
  let audioCount = 0;
  let overlayCount = 0;
  let cursorSec = 0;
  let transitionCount = 0;
  let prevVideoSeg: Record<string, unknown> | null = null;

  // —— 主视频轨：顺序首尾相接 ——
  for (const seg of project.clips) {
    const isImage = IMAGE_RE.test(seg.file);
    const info = input.media[seg.file] || {};
    let srcSec: number;
    let tgtSec: number;
    if (isImage) {
      tgtSec = Number(seg.kenburns?.duration) > 0 ? Number(seg.kenburns!.duration) : DEFAULT_IMAGE_SEC;
      srcSec = tgtSec;
    } else {
      const raw = Number(info.durationSec) || 0;
      srcSec = trimmedSourceLength(seg as ClipSegment, raw);
      tgtSec = segmentDuration(seg as ClipSegment, raw);
      if (!(srcSec > 0) || !(tgtSec > 0)) {
        warnings.add(`素材时长未知或裁剪为空，已跳过：${baseName(seg.file)}`);
        continue;
      }
      if (seg.speedCurve?.length) warnings.add('曲线变速没有剪映草稿对应结构，已按「平均倍速」导出（总时长不变）');
    }
    const extraRefs: string[] = [];
    const keyframeLists: Array<Record<string, unknown>> = [];

    // 调色预设 → 剪映滤镜（materials.effects）或视频特效（materials.video_effects）
    if (seg.colorPreset && seg.colorPreset !== 'none') {
      const ref = JY_COLORS[seg.colorPreset];
      if (!ref) {
        warnings.add(`调色预设「${seg.colorPreset}」没有对应的免费剪映资源，未迁移`);
      } else if (ref.kind === 'filter') {
        const fm = filterMaterial(ref, seg.colorStrength ?? 1);
        materials.effects.push(fm);
        extraRefs.push(String(fm.id));
      } else {
        const em = videoEffectMaterial(ref);
        materials.video_effects.push(em);
        extraRefs.push(String(em.id));
        if (seg.colorStrength != null && seg.colorStrength < 1) {
          warnings.add(`调色预设「${seg.colorPreset}」映射为剪映特效，强度未迁移（用剪映默认强度）`);
        }
      }
    }
    if (seg.adjust) warnings.add('手动调节（亮度/对比/色温/锐化/暗角）没有剪映草稿字段，未迁移');

    // 结构特效 fx → 剪映视频特效
    if (seg.fx) {
      const ref = JY_FX[seg.fx];
      if (!ref) {
        warnings.add(`结构特效「${seg.fx}」没有对应的免费剪映资源，未迁移`);
      } else {
        const em = videoEffectMaterial(ref);
        materials.video_effects.push(em);
        extraRefs.push(String(em.id));
        if (seg.fxParams && Object.keys(seg.fxParams).length) {
          warnings.add(`特效「${seg.fx}」的参数未迁移（用剪映默认参数）`);
        }
      }
    }

    // 蒙版：色键优先（与渲染语义一致）；形状走剪映蒙版
    if (seg.mask?.key) {
      const ref = JY_CHROMA[seg.mask.key];
      if (!ref) warnings.add(`色键「${seg.mask.key}」没有对应的剪映资源，未迁移`);
      else {
        const cm = chromaMaterial(ref);
        materials.chromas.push(cm);
        extraRefs.push(String(cm.id));
      }
    } else if (seg.mask?.shape && seg.mask.shape !== 'none') {
      const ref = JY_MASKS[seg.mask.shape];
      if (!ref) warnings.add(`蒙版形状「${seg.mask.shape}」没有对应的剪映蒙版，未迁移`);
      else {
        const { legacy, common } = maskMaterials(ref, seg);
        materials.masks.push(legacy);
        materials.common_mask.push(common);
        extraRefs.push(String(legacy.id));
        // 剪映只有 线性/镜面/圆形/矩形/爱心/星形 六种基础蒙版
        if (['ellipse', 'rounded', 'diamond', 'split_left', 'split_right', 'split_top', 'split_bottom', 'top_circle'].includes(seg.mask.shape)) {
          warnings.add(`蒙版「${seg.mask.shape}」已近似映射为剪映基础蒙版（观感可能有差异）`);
        }
      }
    }
    // 裁剪已经写进素材 crop（见 videoMaterial），这里不再告警

    // 淡入淡出 → 剪映入场/出场动画（渐显/渐隐）
    if ((seg.fadeIn && seg.fadeIn > 0) || (seg.fadeOut && seg.fadeOut > 0)) {
      const durUs = secToUs(tgtSec);
      const entries: Array<{ ref: JyRef; type: 'in' | 'out'; startUs: number; durationUs: number }> = [];
      if (seg.fadeIn && seg.fadeIn > 0) {
        entries.push({ ref: JY_FADE_IN, type: 'in', startUs: 0, durationUs: Math.min(durUs, secToUs(seg.fadeIn)) });
      }
      if (seg.fadeOut && seg.fadeOut > 0) {
        const outUs = Math.min(durUs, secToUs(seg.fadeOut));
        entries.push({ ref: JY_FADE_OUT, type: 'out', startUs: durUs - outUs, durationUs: outUs });
      }
      const anim = animationMaterial(entries);
      materials.material_animations.push(anim.material);
      extraRefs.push(anim.id);
    }

    // 关键帧（缩放/位移/透明度）→ 剪映 common_keyframes
    const durUsForKf = secToUs(tgtSec);
    if (seg.keyframes?.length) {
      const scaleP = seg.keyframes.filter((k) => k.scale != null).map((k) => ({ t: k.t, value: Number(k.scale) }));
      const xP = seg.keyframes.filter((k) => k.offsetX != null).map((k) => ({ t: k.t, value: Number(k.offsetX) }));
      // 剪映 position_y 上移为正，我们的 offsetY 正方向向下 → 取反
      const yP = seg.keyframes.filter((k) => k.offsetY != null).map((k) => ({ t: k.t, value: -Number(k.offsetY) }));
      const aP = seg.keyframes.filter((k) => k.opacity != null).map((k) => ({ t: k.t, value: Number(k.opacity) }));
      if (scaleP.length) keyframeLists.push(keyframeList('UNIFORM_SCALE', withAnchors(scaleP), durUsForKf));
      if (xP.length) keyframeLists.push(keyframeList('KFTypePositionX', withAnchors(xP), durUsForKf));
      if (yP.length) keyframeLists.push(keyframeList('KFTypePositionY', withAnchors(yP), durUsForKf));
      if (aP.length) keyframeLists.push(keyframeList('KFTypeAlpha', withAnchors(aP), durUsForKf));
      if (seg.keyframes.some((k) => k.ease && k.ease !== 'linear')) {
        warnings.add('关键帧缓动（in/out/inout/bezier）未迁移：剪映草稿按线性插值');
      }
    }
    // 图片推拉（kenburns）→ 缩放关键帧（已有显式 scale 关键帧时不重复添加）
    const hasScaleKeyframe = keyframeLists.some((l) => l.property_type === 'UNIFORM_SCALE');
    if (isImage && seg.kenburns && seg.kenburns.direction !== 'none' && !hasScaleKeyframe) {
      const pts = seg.kenburns.direction === 'in'
        ? [{ t: 0, value: 1 }, { t: 1, value: 1.12 }]
        : [{ t: 0, value: 1.12 }, { t: 1, value: 1 }];
      keyframeLists.push(keyframeList('UNIFORM_SCALE', pts, durUsForKf));
    }
    if (seg.reverse) warnings.add('倒放已写入草稿的 reverse 字段；剪映版本差异可能导致不生效，请在剪映里确认');

    const mat = videoMaterial(seg.file, isImage, info, canvas, srcSec, seg.crop);
    materials.videos.push(mat);
    const speedId = hexId();
    materials.speeds.push({ curve_speed: null, id: speedId, mode: 0, speed: isImage ? 1 : srcSec / tgtSec, type: 'speed' });
    // 该段有配音且不保留原声 → 原声静音（与 clip 工程语义一致）
    const volume = seg.audioFile && !seg.keepOriginalAudio ? 0 : (seg.volume ?? 1);
    const durationUs = secToUs(tgtSec);
    const segJson = videoSegment({
      materialId: String(mat.id),
      speedId,
      startUs: secToUs(cursorSec),
      durationUs,
      sourceStartUs: secToUs(isImage ? 0 : (seg.trimStart ?? 0)),
      sourceDurationUs: secToUs(srcSec),
      speed: isImage ? 1 : srcSec / tgtSec,
      volume: Math.max(0, Number(volume) || 0),
      ...(seg.flip ? { flip: seg.flip } : {}),
      ...(seg.rotate ? { rotate: seg.rotate } : {}),
      extraRefs,
      ...(keyframeLists.length ? { commonKeyframes: keyframeLists } : {}),
      ...(seg.reverse ? { reverse: true } : {}),
    });
    videoSegs.push(segJson);

    // 转场：工程里挂在“后一段”上，剪映语义是挂在**前一段**上
    if (seg.transition && prevVideoSeg) {
      const ref = JY_TRANSITIONS[seg.transition.type];
      if (!ref) {
        warnings.add(`转场「${seg.transition.type}」没有对应的免费剪映转场，未迁移`);
      } else {
        const dur = seg.transition.duration && seg.transition.duration > 0 ? seg.transition.duration : ref.defaultDurationSec;
        const tm = transitionMaterial(ref, secToUs(dur));
        materials.transitions.push(tm);
        (prevVideoSeg.extra_material_refs as string[]).push(String(tm.id));
        transitionCount++;
      }
    }
    prevVideoSeg = segJson;
    cursorSec += tgtSec;
    if (isImage) imageCount++; else clipCount++;

    // 分段配音：与段同起，时长不超过段长
    if (seg.audioFile) {
      const audioInfo = input.media[seg.audioFile] || {};
      const audioDur = Math.min(tgtSec, Number(audioInfo.durationSec) > 0 ? Number(audioInfo.durationSec) : tgtSec);
      const audioMat = audioMaterial(seg.audioFile, audioDur);
      materials.audios.push(audioMat);
      const sid = hexId();
      materials.speeds.push({ curve_speed: null, id: sid, mode: 0, speed: 1, type: 'speed' });
      voiceSegs.push(audioSegment({
        materialId: String(audioMat.id),
        speedId: sid,
        startUs: secToUs(cursorSec - tgtSec),
        durationUs: secToUs(audioDur),
        sourceStartUs: 0,
        sourceDurationUs: secToUs(audioDur),
        volume: 1,
      }));
      audioCount++;
    }
  }

  // —— 字幕轨：按不重叠装箱（可能拆成多条文字轨）——
  for (const t of project.texts || []) {
    const start = Number(t.start) || 0;
    const end = Number(t.end) || 0;
    if (!String(t.text || '').trim() || !(end > start)) {
      if (String(t.text || '').trim()) warnings.add('有字幕时长为 0，已跳过');
      continue;
    }
    const textDurationUs = secToUs(end - start);
    const textExtraRefs: string[] = [];
    if (t.animation) {
      const introRef = t.animation === 'slide'
        ? (JY_TEXT_SLIDE[String(t.slideDirection || 'right')] || JY_TEXT_SLIDE.right)
        : JY_TEXT_INTRO[t.animation];
      if (!introRef) {
        warnings.add(`字幕动画「${t.animation}」没有对应的剪映文字动画，未迁移`);
      } else {
        const animDur = Math.min(textDurationUs, 500_000);
        const entries: Array<{ ref: JyRef; type: 'in' | 'out'; startUs: number; durationUs: number }> = [
          { ref: introRef, type: 'in', startUs: 0, durationUs: animDur },
        ];
        const outroRef = JY_TEXT_OUTRO[t.animation];
        if (outroRef) {
          entries.push({ ref: outroRef, type: 'out', startUs: Math.max(0, textDurationUs - animDur), durationUs: animDur });
        }
        const anim = animationMaterial(entries, { text: true });
        materials.material_animations.push(anim.material);
        textExtraRefs.push(anim.id);
      }
    }
    const mat = textMaterial(t);
    materials.texts.push(mat);
    const speedId = hexId();
    materials.speeds.push({ curve_speed: null, id: speedId, mode: 0, speed: 1, type: 'speed' });
    textSegs.push(textSegment(t, String(mat.id), speedId, textExtraRefs));
  }

  // —— 画中画：每条叠加各占一条视频轨 ——
  const overlayTracks: Array<Array<Record<string, unknown>>> = [];
  for (const ov of project.overlays || []) {
    const start = Number(ov.start) || 0;
    const end = Number(ov.end) || 0;
    if (!(end > start)) continue;
    const info = input.media[ov.file] || {};
    const isImage = IMAGE_RE.test(ov.file);
    const mat = videoMaterial(ov.file, isImage, info, canvas, end - start);
    materials.videos.push(mat);
    const speedId = hexId();
    materials.speeds.push({ curve_speed: null, id: speedId, mode: 0, speed: 1, type: 'speed' });
    const scale = ov.scale == null ? 0.35 : Math.min(1, Math.max(0.05, Number(ov.scale) || 0.35));
    const tr = overlayTransform(ov);
    overlayTracks.push([videoSegment({
      materialId: String(mat.id),
      speedId,
      startUs: secToUs(start),
      durationUs: secToUs(end - start),
      sourceStartUs: 0,
      sourceDurationUs: secToUs(end - start),
      speed: 1,
      volume: 1,
      scaleX: scale,
      scaleY: scale,
      transformX: tr.x,
      transformY: tr.y,
    })]);
    if (ov.blend && String(ov.blend) !== 'normal') warnings.add('画中画混合模式未迁移，已按普通覆盖导出');
    overlayCount++;
  }

  // —— BGM：整片一条音频轨 ——
  const bgmSegs: Array<Record<string, unknown>> = [];
  if (project.bgm?.file) {
    const info = input.media[project.bgm.file] || {};
    const bgmDur = Number(info.durationSec) > 0 ? Number(info.durationSec) : cursorSec;
    const usable = Math.min(bgmDur, cursorSec);
    if (usable > 0) {
      const mat = audioMaterial(project.bgm.file, bgmDur);
      materials.audios.push(mat);
      const speedId = hexId();
      materials.speeds.push({ curve_speed: null, id: speedId, mode: 0, speed: 1, type: 'speed' });
      bgmSegs.push(audioSegment({
        materialId: String(mat.id),
        speedId,
        startUs: 0,
        durationUs: secToUs(usable),
        sourceStartUs: 0,
        sourceDurationUs: secToUs(usable),
        volume: Math.max(0, Math.min(1, Number(project.bgm.volume ?? 0.25) || 0)),
      }));
      audioCount++;
      if (project.bgm.duck) warnings.add('BGM 自动闪避（duck）未迁移：剪映里需要手动做音量关键帧');
    }
  }
  // —— 定时音频层（P0-7）：每段一条音频段，按成片时间摆到自己的位置 ——
  for (const a of project.audios || []) {
    const start = Math.max(0, a.start);
    const dur = Math.min(a.end, cursorSec) - start;
    if (!(dur > 0.01)) continue;
    const info = input.media[a.file] || {};
    const matDur = Number(info.durationSec) > 0
      ? Number(info.durationSec)
      : dur + (a.trimStart ?? 0);
    const mat = audioMaterial(a.file, matDur);
    materials.audios.push(mat);
    const speedId = hexId();
    materials.speeds.push({ curve_speed: null, id: speedId, mode: 0, speed: 1, type: 'speed' });
    bgmSegs.push(audioSegment({
      materialId: String(mat.id),
      speedId,
      startUs: secToUs(start),
      durationUs: secToUs(dur),
      sourceStartUs: secToUs(a.trimStart ?? 0),
      sourceDurationUs: secToUs(dur),
      volume: Math.max(0, Math.min(1, Number(a.volume ?? 1) || 0)),
    }));
    audioCount++;
    if (a.fadeIn || a.fadeOut) warnings.add('音频层淡入淡出未迁移：剪映里需要手动做音量关键帧');
  }

  if (project.audioFx?.length) warnings.add('整片音效链（降噪/响度等）未迁移：剪映导出前可自行处理');

  // —— 组装轨道（顺序即渲染层级：视频在下、文字在上）——
  const trackJson = (type: string, segs: Array<Record<string, unknown>>) => ({
    attribute: 0,
    flag: 0,
    id: hexId(),
    is_default_name: true,
    name: '',
    segments: segs,
    type,
  });
  if (videoSegs.length) tracks.push(trackJson('video', videoSegs));
  for (const segs of overlayTracks) tracks.push(trackJson('video', segs));
  if (bgmSegs.length) tracks.push(trackJson('audio', bgmSegs));
  if (voiceSegs.length) tracks.push(trackJson('audio', voiceSegs));
  for (const segs of packTracks(textSegs)) tracks.push(trackJson('text', segs));

  // render_index：轨道顺序即层级（越大越靠上）
  tracks.forEach((track, index) => {
    for (const seg of track.segments as Array<Record<string, unknown>>) {
      seg.render_index = index;
      seg.track_render_index = 0;
    }
  });
  content.tracks = tracks;

  // 总时长：主轨 cursor 与其它轨道的最晚结束取大
  let endUs = secToUs(cursorSec);
  for (const track of tracks) {
    for (const seg of track.segments as Array<Record<string, unknown>>) {
      const r = seg.target_timerange as { start: number; duration: number };
      endUs = Math.max(endUs, r.start + r.duration);
    }
  }
  content.duration = endUs;

  const meta = clone(JIANYING_DRAFT_META_TEMPLATE) as Record<string, any>;
  meta.draft_id = upperUuid();
  meta.draft_name = input.name || '';
  meta.draft_fold_path = input.draftDir || '';
  meta.draft_root_path = input.draftRoot || '';
  meta.tm_duration = endUs;
  meta.tm_draft_cloud_modified = Math.floor(Date.now() / 1000);

  return {
    content,
    meta,
    stats: {
      clips: clipCount,
      images: imageCount,
      texts: textSegs.length,
      audios: audioCount,
      overlays: overlayCount,
      transitions: transitionCount,
      durationSec: endUs / US,
    },
    warnings: [...warnings],
  };
}

/** 原子占位：mkdir 成功即「这个名字归我」，避免先查后建在并发导出时互相覆盖。 */
async function reserveDraftDir(root: string, name: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const base = sanitizeDraftName(name);
  for (let i = 0; i < 100; i++) {
    const candidate = path.join(root, i === 0 ? base : `${base} (${i + 1})`);
    try {
      await mkdir(candidate);
      return candidate;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error(`同名草稿过多：${base}`);
}

/** 落盘：写出 draft_content.json + draft_meta_info.json（同名目录自动加序号，绝不覆盖）。 */
export async function exportClipProjectToJianyingDraft(opts: {
  project: ClipProject;
  draftRoot: string;
  name?: string;
  media?: Record<string, JianyingMediaInfo>;
}): Promise<{
  draftDir: string;
  draftName: string;
  contentFile: string;
  metaFile: string;
  stats: JianyingDraftStats;
  warnings: string[];
}> {
  const draftRoot = path.resolve(opts.draftRoot);
  const wanted = sanitizeDraftName(opts.name || opts.project.name || '未命名草稿');
  const draftDir = await reserveDraftDir(draftRoot, wanted);
  const draftName = path.basename(draftDir);
  try {
    const built = buildJianyingDraft({
      project: opts.project,
      media: opts.media || {},
      name: draftName,
      draftDir,
      draftRoot,
    });
    const contentFile = path.join(draftDir, 'draft_content.json');
    const metaFile = path.join(draftDir, 'draft_meta_info.json');
    await writeFile(contentFile, JSON.stringify(built.content, null, 2), 'utf8');
    await writeFile(metaFile, JSON.stringify(built.meta, null, 2), 'utf8');
    return { draftDir, draftName, contentFile, metaFile, stats: built.stats, warnings: built.warnings };
  } catch (e) {
    // 失败不留下半份草稿（空目录在剪映草稿箱里会显示成坏草稿）
    try { await rm(draftDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
    throw e;
  }
}

// ===== 导出成片：定位剪映刚导出的文件 =====
// 剪映 7+ 隐藏了 UIAutomation 控件，导出只能由「电脑使用」插件点 UI 完成；
// 导出完成后我们按常见导出目录 + 修改时间把文件找回来，交给发布链路。

export interface JianyingExportCandidate {
  file: string;
  name: string;
  bytes: number;
  mtime: number;
}

/** 扫描常见导出目录里最近的视频文件（默认 2 小时内、最多 20 条）。 */
export function findRecentJianyingExports(opts: {
  dirs?: string[];
  sinceMinutes?: number;
  limit?: number;
  env?: NodeJS.ProcessEnv;
} = {}): JianyingExportCandidate[] {
  const env = opts.env ?? process.env;
  const home = env.USERPROFILE || env.HOME || '';
  const dirs = opts.dirs?.length
    ? opts.dirs
    : [
      path.join(home, 'Videos', 'JianyingPro'),
      path.join(home, 'Videos'),
      path.join(home, 'Desktop'),
      path.join(home, 'Downloads'),
      path.join(home, 'Documents'),
    ];
  const since = Date.now() - Math.max(1, opts.sinceMinutes ?? 120) * 60_000;
  const limit = Math.max(1, Math.min(100, opts.limit ?? 20));
  const out: JianyingExportCandidate[] = [];
  const seen = new Set<string>();

  const walk = (dir: string, depth: number) => {
    if (depth > 2) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      if (!/\.(mp4|mov|mkv|webm)$/i.test(e.name)) continue;
      try {
        const st = statSync(p);
        if (st.mtimeMs < since) continue;
        if (seen.has(p)) continue;
        seen.add(p);
        out.push({ file: p, name: e.name, bytes: st.size, mtime: st.mtimeMs });
      } catch { /* 忽略读不到的文件 */ }
    }
  };
  for (const d of dirs) if (d) walk(d, 0);
  out.sort((a, b) => b.mtime - a.mtime);
  return out.slice(0, limit);
}

/** 启动剪映（只接受真正的剪映可执行文件；不保证打开指定草稿：剪映 6+ 没有可用命令行）。 */
export function openJianying(exe: string): Promise<{ ok: boolean; error?: string }> {
  const name = path.basename(exe);
  // 防御纵深：即使调用方传错路径，也不能把这里变成任意进程启动器
  if (!/^(JianyingPro\.exe|JianyingPro|剪映专业版)$/i.test(name)) {
    return Promise.resolve({ ok: false, error: `拒绝启动非剪映可执行文件：${name}` });
  }
  if (!existsSync(exe)) return Promise.resolve({ ok: false, error: `剪映可执行文件不存在：${exe}` });
  return new Promise((resolve) => {
    try {
      const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
      let settled = false;
      child.once('error', (e) => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: e.message });
      });
      child.once('spawn', () => {
        if (settled) return;
        settled = true;
        child.unref();
        resolve({ ok: true });
      });
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
