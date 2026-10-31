// 剪映剪辑（clip_jianying）守门：
//   1) 草稿结构/时间轴必须与工程语义一致（否则剪映里时间错位且不报错）；
//   2) 未迁移能力必须显式出现在 warnings 里（静默丢效果比报错更难查）；
//   3) 安装/草稿目录探测不依赖本机真实安装（用临时目录模拟，测试可脱机跑）。
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getApiToolRegistry, initApiToolRegistry } from '@yan-zhi/core';
import {
  parseCanvasSize, sanitizeDraftName, uniqueDraftDir, hexToRgb01,
  buildJianyingDraft, exportClipProjectToJianyingDraft, detectJianying,
  findJianyingDraftRoot, listJianyingDrafts, openJianying, findRecentJianyingExports,
  type JianyingMediaInfo,
} from '../src/services/clip-jianying.js';
import type { ClipProject } from '../src/services/clip-project.js';
import { JIANYING_SKILL_FILES } from '../src/skills/jianying-editing-files.generated.js';

const US = 1_000_000;
const dirs: string[] = [];
function tempDir(prefix = 'jy-test-'): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* 忽略 */ } }
});

/** 构造一份覆盖主要能力的工程（视频/图片/变速/字幕/BGM/配音/画中画/转场/调色）。 */
function makeProject(): ClipProject {
  return {
    version: 2,
    name: '测试工程',
    updatedAt: 0,
    output: { size: '1080x1920', fps: 30 },
    clips: [
      { id: 'c1', file: 'C:/media/a.mp4', trimStart: 1, trimEnd: 5 },
      { id: 'c2', file: 'C:/media/b.mp4', speed: 2, colorPreset: 'cinema', transition: { type: 'fade', duration: 0.5 } },
      { id: 'c3', file: 'C:/media/pic.png', kenburns: { direction: 'in', duration: 4 } },
    ],
    layers: [],
    texts: [
      { id: 't1', text: '第一句', start: 0, end: 2, position: 'bottom', safeArea: true },
      { id: 't2', text: '第二句', start: 3, end: 5, position: 'top', animation: 'pop', backColor: '#00000099' },
    ],
    overlays: [
      { id: 'o1', file: 'C:/media/logo.png', start: 1, end: 3, pos: 'topright', scale: 0.4, blend: 'screen' },
    ],
    bgm: { file: 'C:/media/bgm.mp3', volume: 0.3, duck: true },
  };
}

const media: Record<string, JianyingMediaInfo> = {
  'C:/media/a.mp4': { durationSec: 10, width: 1080, height: 1920, hasAudio: true },
  'C:/media/b.mp4': { durationSec: 8, width: 1080, height: 1920, hasAudio: true },
  'C:/media/pic.png': { width: 1080, height: 1920 },
  'C:/media/logo.png': { width: 200, height: 200 },
  'C:/media/bgm.mp3': { durationSec: 60 },
};

describe('小工具', () => {
  it('parseCanvasSize 解析常见规格并兜底竖屏', () => {
    expect(parseCanvasSize('1080x1920')).toEqual({ width: 1080, height: 1920 });
    expect(parseCanvasSize('1920×1080')).toEqual({ width: 1920, height: 1080 });
    expect(parseCanvasSize('')).toEqual({ width: 1080, height: 1920 });
  });

  it('sanitizeDraftName 去掉 Windows 非法字符与保留名', () => {
    expect(sanitizeDraftName('  a/b:c*d?  ')).toBe('a b c d');
    expect(sanitizeDraftName('')).toBe('未命名草稿');
    expect(sanitizeDraftName('CON')).toBe('草稿-CON');
  });

  it('uniqueDraftDir 重名加序号，不覆盖', () => {
    const root = 'C:/drafts'.replace(/\//g, path.sep);
    const taken = new Set([path.join(root, '片 (1)')]);
    const exists = (p: string) => taken.has(p);
    const got = uniqueDraftDir(root, '片 (1)', exists);
    expect(path.basename(got)).toBe('片 (1) (2)');
  });

  it('hexToRgb01 支持 #RRGGBB / #RRGGBBAA', () => {
    expect(hexToRgb01('#FF0000')).toEqual([1, 0, 0]);
    expect(hexToRgb01('#00FF00AA')).toEqual([0, 1, 0]);
    expect(hexToRgb01('bad')).toEqual([1, 1, 1]);
  });
});

describe('buildJianyingDraft', () => {
  const built = buildJianyingDraft({ project: makeProject(), media, name: '测试草稿' });
  const content = built.content as any;

  it('画布/帧率/名称按工程写入', () => {
    expect(content.canvas_config).toEqual({ width: 1080, height: 1920, ratio: 'original' });
    expect(content.fps).toBe(30);
    expect(content.name).toBe('测试草稿');
  });

  it('主视频轨按顺序首尾相接，裁剪/变速折算正确', () => {
    const videoTracks = content.tracks.filter((t: any) => t.type === 'video' && t.segments.length === 3);
    expect(videoTracks).toHaveLength(1);
    const segs = videoTracks[0].segments;
    // c1：trim 1~5 → 源 4s，速度 1 → 目标 4s
    expect(segs[0].source_timerange).toEqual({ start: 1 * US, duration: 4 * US });
    expect(segs[0].target_timerange).toEqual({ start: 0, duration: 4 * US });
    // c2：整段 8s，speed 2 → 目标 4s，起点接在 4s
    expect(segs[1].target_timerange).toEqual({ start: 4 * US, duration: 4 * US });
    expect(segs[1].speed).toBeCloseTo(2, 5);
    // c3：图片 kenburns 4s
    expect(segs[2].target_timerange).toEqual({ start: 8 * US, duration: 4 * US });
    expect(content.duration).toBe(12 * US);
  });

  it('定时音频层（P0-7）导出为独立音频段：起点/时长/音量/素材内起点', () => {
    const p: ClipProject = {
      ...makeProject(),
      audios: [{ id: 'a1', file: 'C:/media/whoosh.wav', start: 1, end: 1.8, volume: 0.6, trimStart: 0.5 }],
    };
    const c = buildJianyingDraft({ project: p, media, name: '音频层' }).content as any;
    expect(c.materials.audios).toHaveLength(2);   // BGM + 音效
    const audioTrack = c.tracks.find((t: any) => t.type === 'audio');
    const seg = audioTrack.segments.find((s: any) => s.target_timerange.start === 1 * US);
    expect(seg.target_timerange).toEqual({ start: 1 * US, duration: 0.8 * US });
    expect(seg.source_timerange.start).toBe(0.5 * US);
    expect(seg.volume).toBeCloseTo(0.6, 5);
  });

  it('素材与变速条目数量与片段对应', () => {
    expect(content.materials.videos).toHaveLength(4); // 3 主轨 + 1 画中画
    expect(content.materials.videos[2].type).toBe('photo');
    expect(content.materials.speeds.length).toBeGreaterThanOrEqual(3);
    expect(content.materials.audios).toHaveLength(1); // BGM
    expect(content.materials.texts).toHaveLength(2);
  });

  it('字幕内容/样式/位置写入，且时间正确', () => {
    const first = JSON.parse(content.materials.texts[0].content);
    expect(first.text).toBe('第一句');
    expect(first.styles[0].size).toBeGreaterThan(0);
    const textTrack = content.tracks.find((t: any) => t.type === 'text');
    expect(textTrack.segments[0].target_timerange).toEqual({ start: 0, duration: 2 * US });
    // 底部+安全区 → y 上抬（不是默认 -0.8）
    expect(textTrack.segments[0].clip.transform.y).toBeCloseTo(-0.55, 5);
    // 顶部字幕 y 为正
    const top = textTrack.segments.find((s: any) => s.target_timerange.start === 3 * US);
    expect(top.clip.transform.y).toBeCloseTo(0.6, 5);
  });

  it('画中画单独一条视频轨，缩放写入 clip.scale', () => {
    const overlayTrack = content.tracks.find((t: any) => t.type === 'video' && t.segments.length === 1);
    expect(overlayTrack).toBeTruthy();
    expect(overlayTrack.segments[0].clip.scale.x).toBeCloseTo(0.4, 5);
    expect(overlayTrack.segments[0].clip.transform.x).toBeGreaterThan(0);
  });

  it('调色映射为剪映滤镜，转场挂到前一段', () => {
    // cinema → 质感电影（免费滤镜）
    expect(content.materials.effects.some((e: any) => e.type === 'filter' && e.name === '质感电影')).toBe(true);
    expect(content.materials.transitions).toHaveLength(1);
    expect(content.materials.transitions[0].name).toBe('叠化');
    const videoTrack = content.tracks.find((t: any) => t.type === 'video' && t.segments.length === 3);
    expect(videoTrack.segments[0].extra_material_refs).toContain(content.materials.transitions[0].id);
    expect(built.stats.transitions).toBe(1);
  });

  it('图片 kenburns 映射为缩放关键帧', () => {
    const videoTrack = content.tracks.find((t: any) => t.type === 'video' && t.segments.length === 3);
    const imgSeg = videoTrack.segments[2];
    const kf = imgSeg.common_keyframes.find((l: any) => l.property_type === 'UNIFORM_SCALE');
    expect(kf).toBeTruthy();
    const values = kf.keyframe_list.map((k: any) => k.values[0]);
    expect(values[0]).toBeCloseTo(1, 5);
    expect(values[values.length - 1]).toBeCloseTo(1.12, 5);
  });

  it('调色强度 0 不会被当成默认 1', () => {
    const p = makeProject();
    p.clips[1].colorStrength = 0;
    const b = buildJianyingDraft({ project: p, media, name: '强度' });
    const filter = (b.content as any).materials.effects.find((e: any) => e.type === 'filter');
    expect(filter.value).toBe(0);
  });

  it('字幕动画映射为剪映文字动画', () => {
    expect(content.materials.material_animations).toHaveLength(1);
    const anim = content.materials.material_animations[0].animations[0];
    expect(anim.name).toBe('弹入');
    expect(anim.material_type).toBe('sticker');
    expect(anim.type).toBe('in');
  });

  it('已映射能力不再进 warnings，真正未迁移的仍逐项列出', () => {
    const text = built.warnings.join('\n');
    expect(text).not.toContain('调色预设');
    expect(text).not.toContain('转场');
    expect(text).not.toContain('kenburns');
    expect(text).not.toContain('字幕动画');
    expect(text).toContain('BGM 自动闪避');
    expect(text).toContain('混合模式');
  });

  it('stats 与草稿一致', () => {
    expect(built.stats.clips).toBe(2);
    expect(built.stats.images).toBe(1);
    expect(built.stats.texts).toBe(2);
    expect(built.stats.overlays).toBe(1);
    expect(built.stats.audios).toBe(1);
    expect(built.stats.durationSec).toBe(12);
  });

  it('meta 写入草稿名/时长/路径', () => {
    const meta = built.meta as any;
    expect(meta.draft_name).toBe('测试草稿');
    expect(meta.tm_duration).toBe(12 * US);
  });
});

describe('buildJianyingDraft · 效果映射', () => {
  function makeFxProject(): ClipProject {
    return {
      version: 2,
      name: '效果映射',
      updatedAt: 0,
      output: { size: '1080x1920', fps: 30 },
      clips: [
        {
          id: 'a', file: 'C:/media/a.mp4', fx: 'shake', fxParams: { amplitude: 0.01 },
          mask: { shape: 'circle', scale: 0.6 }, fadeIn: 0.4, fadeOut: 0.3, reverse: true,
          keyframes: [{ t: 0, scale: 1 }, { t: 0.5, scale: 1.2 }, { t: 1, scale: 1 }],
        },
        { id: 'b', file: 'C:/media/b.mp4', mask: { key: 'green' }, transition: { type: 'zoomin', duration: 0.4 } },
      ],
      layers: [],
      texts: [],
    };
  }
  const fxMedia = {
    'C:/media/a.mp4': { durationSec: 10 },
    'C:/media/b.mp4': { durationSec: 8 },
  };
  const built = buildJianyingDraft({ project: makeFxProject(), media: fxMedia, name: '效果映射' });
  const content = built.content as any;
  const vtrack = content.tracks.find((t: any) => t.type === 'video' && t.segments.length === 2);
  const segA = vtrack.segments[0];
  const segB = vtrack.segments[1];

  it('结构特效 → 剪映视频特效（免费资源）', () => {
    expect(content.materials.video_effects.some((e: any) => e.name === '震动' && e.type === 'video_effect')).toBe(true);
    expect(built.warnings.join('\n')).toContain('参数未迁移');
  });

  it('蒙版形状 → 剪映蒙版（masks + common_mask 同 id）', () => {
    expect(content.materials.masks).toHaveLength(1);
    expect(content.materials.masks[0].resource_type).toBe('circle');
    expect(content.materials.common_mask).toHaveLength(1);
    expect(content.materials.common_mask[0].id).toBe(content.materials.masks[0].id);
    expect(segA.extra_material_refs).toContain(content.materials.masks[0].id);
  });

  it('色键 → 剪映色度抠图', () => {
    expect(content.materials.chromas).toHaveLength(1);
    expect(content.materials.chromas[0].color).toBe('#00FF00FF');
    expect(content.materials.chromas[0].type).toBe('chroma');
    expect(segB.extra_material_refs).toContain(content.materials.chromas[0].id);
  });

  it('淡入淡出 → 剪映入场/出场动画', () => {
    expect(content.materials.material_animations).toHaveLength(1);
    const anims = content.materials.material_animations[0].animations;
    expect(anims.map((a: any) => a.type).sort()).toEqual(['in', 'out']);
    expect(anims.find((a: any) => a.type === 'in').name).toBe('渐显');
    expect(anims.find((a: any) => a.type === 'out').name).toBe('渐隐');
    expect(segA.extra_material_refs).toContain(content.materials.material_animations[0].id);
  });

  it('关键帧 → common_keyframes（缩放/位移/透明度）', () => {
    const kf = segA.common_keyframes.find((l: any) => l.property_type === 'UNIFORM_SCALE');
    expect(kf).toBeTruthy();
    expect(kf.keyframe_list).toHaveLength(3);
    expect(kf.keyframe_list.every((k: any) => k.curveType === 'Line')).toBe(true);
  });

  it('倒放写入 reverse 字段并提示确认', () => {
    expect(segA.reverse).toBe(true);
    expect(built.warnings.join('\n')).toContain('倒放');
  });

  it('转场 → 剪映转场，挂在前一段', () => {
    expect(content.materials.transitions).toHaveLength(1);
    expect(content.materials.transitions[0].name).toBe('推近');
    expect(segA.extra_material_refs).toContain(content.materials.transitions[0].id);
    expect(built.stats.transitions).toBe(1);
  });

  it('没有免费对应项的预设如实告警，不静默丢效果', () => {
    const p = makeFxProject();
    p.clips[0].colorPreset = 'sketch';
    p.clips[0].fx = 'not-a-real-fx';
    p.clips[0].mask = { shape: 'not-a-real-mask' };
    const b = buildJianyingDraft({ project: p, media: fxMedia, name: '告警' });
    const text = b.warnings.join('\n');
    expect(text).toContain('调色预设');
    expect(text).toContain('结构特效');
    expect(text).toContain('蒙版形状');
  });
});

describe('exportClipProjectToJianyingDraft', () => {
  it('落盘两份 JSON，重名不覆盖', async () => {
    const root = tempDir();
    const first = await exportClipProjectToJianyingDraft({
      project: makeProject(), draftRoot: root, name: '成片', media,
    });
    expect(existsSync(first.contentFile)).toBe(true);
    expect(existsSync(first.metaFile)).toBe(true);
    const content = JSON.parse(readFileSync(first.contentFile, 'utf8'));
    expect(content.tracks.length).toBeGreaterThan(0);
    const meta = JSON.parse(readFileSync(first.metaFile, 'utf8'));
    expect(meta.draft_name).toBe('成片');
    expect(meta.draft_fold_path).toBe(first.draftDir);

    const second = await exportClipProjectToJianyingDraft({
      project: makeProject(), draftRoot: root, name: '成片', media,
    });
    expect(second.draftDir).not.toBe(first.draftDir);
    expect(path.basename(second.draftDir)).toBe('成片 (2)');
  });

  it('并发导出同名工程也不会互相覆盖（原子占位）', async () => {
    const root = tempDir();
    const [a, b] = await Promise.all([
      exportClipProjectToJianyingDraft({ project: makeProject(), draftRoot: root, name: '并发', media }),
      exportClipProjectToJianyingDraft({ project: makeProject(), draftRoot: root, name: '并发', media }),
    ]);
    expect(a.draftDir).not.toBe(b.draftDir);
    expect(existsSync(a.contentFile)).toBe(true);
    expect(existsSync(b.contentFile)).toBe(true);
  });
});

describe('检测剪映安装与草稿目录', () => {
  it('从常见路径识别安装与草稿根（不依赖真实安装）', async () => {
    const local = tempDir('jy-local-');
    const exe = path.join(local, 'JianyingPro', 'Apps', '5.9.0', 'JianyingPro.exe');
    const draftRoot = path.join(local, 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft');
    mkdirSync(path.dirname(exe), { recursive: true });
    mkdirSync(draftRoot, { recursive: true });
    writeFileSync(exe, '');

    const info = await detectJianying({
      env: { ...process.env, LOCALAPPDATA: local, USERPROFILE: path.join(local, 'home') },
      platform: 'win32',
      exists: existsSync,
      registryLookup: async () => null,
      versionOf: async () => '5.9.0',
    });
    expect(info.installed).toBe(true);
    expect(info.exe).toBe(exe);
    expect(info.version).toBe('5.9.0');
    expect(info.draftRoot).toBe(draftRoot);

    // 找到的草稿根必须被 list 识别
    const d = path.join(draftRoot, '已有草稿');
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, 'draft_content.json'), '{}');
    writeFileSync(path.join(d, 'draft_meta_info.json'), JSON.stringify({ draft_name: '已有草稿', tm_duration: 9 * US }));
    const drafts = listJianyingDrafts(draftRoot);
    expect(drafts.map((x) => x.name)).toContain('已有草稿');
    expect(drafts[0].durationSec).toBe(9);
  });

  it('没装剪映时如实返回未安装', async () => {
    const empty = tempDir('jy-empty-');
    const info = await detectJianying({
      env: { ...process.env, LOCALAPPDATA: empty, USERPROFILE: empty },
      platform: 'win32',
      exists: existsSync,
      registryLookup: async () => null,
      versionOf: async () => null,
    });
    expect(info.installed).toBe(false);
    expect(info.note).toContain('未检测到剪映');
  });

  it('openJianying 拒绝非剪映可执行文件（不会被当成任意进程启动器）', async () => {
    const fake = path.join(tempDir('jy-exe-'), 'payload.exe');
    writeFileSync(fake, '');
    const r = await openJianying(fake);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('拒绝启动');
  });

  it('findRecentJianyingExports 只返回时间窗内的视频（递归两层）', () => {
    const root = tempDir('jy-exp-');
    const nested = path.join(root, 'sub');
    mkdirSync(nested);
    const recent = path.join(nested, 'a.mp4');
    const old = path.join(root, 'old.mp4');
    const txt = path.join(root, 'note.txt');
    writeFileSync(recent, 'x');
    writeFileSync(old, 'x');
    writeFileSync(txt, 'x');
    const past = new Date(Date.now() - 3 * 3600 * 1000);
    utimesSync(old, past, past);
    const files = findRecentJianyingExports({ dirs: [root], sinceMinutes: 60 });
    expect(files.map((f) => f.name)).toEqual(['a.mp4']);
    expect(files[0].file).toBe(recent);
  });

  it('只有 Projects 父目录但草稿根未建时，不误判为草稿根', () => {
    const local = tempDir('jy-projects-');
    const projects = path.join(local, 'JianyingPro', 'User Data', 'Projects');
    mkdirSync(projects, { recursive: true });
    const root = findJianyingDraftRoot({
      env: { ...process.env, LOCALAPPDATA: local, USERPROFILE: local },
      platform: 'win32',
      exists: existsSync,
    });
    expect(root).toBeNull();
  });
});

describe('clip_jianying 工具面', () => {
  it('已注册且 op 覆盖 detect/export/list/open', () => {
    initApiToolRegistry();
    let hit: any = null;
    for (const tools of getApiToolRegistry().values()) {
      hit = tools.find((t) => t.name === 'clip_jianying') || hit;
    }
    expect(hit, 'clip_jianying 未注册（模型将看不到）').toBeTruthy();
    expect(hit.inputSchema.properties.op.enum).toEqual(['detect', 'export', 'find_export', 'list', 'open']);
    for (const k of ['name', 'draftRoot', 'open', 'limit', 'sinceMinutes', 'nameHint']) {
      expect(hit.inputSchema.properties[k], `缺参数 ${k}`).toBeTruthy();
    }
    // ★ open 不接受自定义 exe（安全边界：否则等于一条绕过 exec 审批的任意进程启动通道）
    expect(hit.inputSchema.properties.exe).toBeUndefined();
  });
});

describe('剪映剪辑 skill 种子', () => {
  it('references 文件与 .claude/skills/jianying-editing/SKILL.md 逐字一致（改了 md 要重跑同步脚本）', () => {
    const mdFile = path.resolve(__dirname, '../../../.claude/skills/jianying-editing/SKILL.md');
    const raw = readFileSync(mdFile, 'utf8').split('\r\n').join('\n');
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim() + '\n';
    expect(JIANYING_SKILL_FILES).toHaveLength(1);
    expect(JIANYING_SKILL_FILES[0].path).toBe('references/jianying-playbook.md');
    expect(JIANYING_SKILL_FILES[0].content).toBe(body);
  });
});
