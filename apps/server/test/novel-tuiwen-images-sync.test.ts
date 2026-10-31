import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 小说推文「图片轮播 + 配音 + 字幕」同步与语速的不变量（2026-10-24）。
 *
 * 背景（用户实报）：图文成品做口播视频时，画面/字幕/配音三条轴各算各的 ——
 *   · 手写脚本按「逐段图片编码时长」累计，每段取整丢几十毫秒，7 段就短了 5.6s；
 *   · 字幕按逐段 probe 时长累加，与实际拼接后的音频长度对不上 → 越往后越不同步；
 *   · 语速只能用原速，用户要更快的口播。
 *
 * 本测试钉住的修法：
 *   ① 图片区间按 **cue 边界**切（cue 来自真实配音时长）→ 换图/换字幕/换句同源；
 *   ② 最后一张图多铺 1s，再由 -t total 裁齐 → 画面严格覆盖音频；
 *   ③ 旁白合成后用**真实音频时长**对 cues 做比例校正；
 *   ④ 图片用等比缩小 + 补底（不裁剪，避免切掉图内文字）；
 *   ⑤ TTS 支持语速（默认 +10%），语速变了旧分段作废。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PY_DIR = path.join(REPO_ROOT, 'packages/core/src/tool/builtin/python-scripts/novel_tuiwen');
const COMPOSE = fs.readFileSync(path.join(PY_DIR, 'compose_video.py'), 'utf8');
const TTS = fs.readFileSync(path.join(PY_DIR, 'tts_gen.py'), 'utf8');
const RUNPY = fs.readFileSync(path.join(PY_DIR, 'run_pipeline.py'), 'utf8');

/** 只取代码行（剔除注释），避免注释里提到旧写法时误判 */
const codeOnly = (src: string) =>
  src.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

const COMPOSE_CODE = codeOnly(COMPOSE);
const TTS_CODE = codeOnly(TTS);

describe('compose_video.py：图片轮播的时间轴与配音同源', () => {
  it('支持 --images，且轮播分支按 cue 边界切图', () => {
    expect(COMPOSE_CODE).toMatch(/"--images"/);
    expect(COMPOSE_CODE).toMatch(/def plan_image_slots\(cues, n_images\)/);
    expect(COMPOSE_CODE).toMatch(/plan_image_slots\(cues, len\(usable\)\)/);
    // 切分点只落在 cue 边界：区间端点直接取自 cues[a][0] / cues[b][1]
    const fn = COMPOSE_CODE.match(/def plan_image_slots[\s\S]*?(?=\ndef )/)?.[0] || '';
    expect(fn).toMatch(/cues\[a\]\[0\]/);
    expect(fn).toMatch(/cues\[b\]\[1\]/);
  });

  it('★ 最后一张图多铺 1s（防逐帧取整让画面提前收尾），最终由 -t total 裁齐', () => {
    expect(COMPOSE_CODE).toMatch(/end = total \+ 1\.0/);
    expect(COMPOSE_CODE).toMatch(/"-t", f"\{total:\.2f\}"/);
  });

  it('图片等比缩小 + 补底，不裁剪（图文素材的文字不能被切掉）', () => {
    const imgBranch = COMPOSE_CODE.match(/if images:[\s\S]*?\n        else:/)?.[0] || '';
    expect(imgBranch).toMatch(/force_original_aspect_ratio=decrease/);
    expect(imgBranch).toMatch(/pad=\{W\}:\{H\}/);
    expect(imgBranch).not.toMatch(/crop=\{W\}:\{H\}/);
  });

  it('★ 旁白合成后按真实音频时长校正 cue，且字幕在音频之后才生成', () => {
    expect(COMPOSE_CODE).toMatch(/real_audio = probe_duration\(ffmpeg, audio_out\)/);
    expect(COMPOSE_CODE).toMatch(/k = real_audio \/ t/);
    expect(COMPOSE_CODE).toMatch(/cues = \[\(s \* k, e \* k, txt\)/);
    // 顺序：先出音频 → 再校正 cue → 再建 ASS（否则字幕用的还是未校正的时间）
    const audioIdx = COMPOSE_CODE.indexOf('audio_out = build_audio_bed(');
    const corrIdx = COMPOSE_CODE.indexOf('real_audio = probe_duration(ffmpeg, audio_out)');
    const assIdx = COMPOSE_CODE.indexOf('build_ass(cues, ass, sub_font_px, margin_v)');
    expect(audioIdx).toBeGreaterThan(-1);
    expect(corrIdx).toBeGreaterThan(audioIdx);
    expect(assIdx).toBeGreaterThan(corrIdx);
  });

  it('成片总长取「校正后的 cue 末尾」与「真实音频」的较大值', () => {
    expect(COMPOSE_CODE).toMatch(/total = max\(t, real_audio\)/);
  });
});

describe('tts_gen.py：语速可调 + 换语速后旧分段作废', () => {
  it('★ 支持 --rate，并以 rate 调用 Edge-TTS', () => {
    expect(TTS_CODE).toMatch(/"--rate"/);
    expect(TTS_CODE).toMatch(/Communicate\(text, voice, rate=rate\)/);
  });

  it('语速参数宽容解析（+10% / 10 / 1.1 / 0 都认）', () => {
    expect(TTS_CODE).toMatch(/def normalize_rate\(rate: str\)/);
    const fn = TTS_CODE.match(/def normalize_rate[\s\S]*?(?=\n\ndef )/)?.[0] || '';
    expect(fn).toMatch(/%/);
    // 带小数且落在 0.2~3 之间按倍率解释（1.1 → +10%，0.9 → -10%）
    expect(fn).toMatch(/0\.2 <= v <= 3\.0/);
  });

  it('★ 语速变化 → 删除旧 seg_*.mp3 并重合成（否则画面/字幕按旧时长排）', () => {
    expect(TTS_CODE).toMatch(/prev_rate = str\(script\.get\("tts_rate"\) or ""\)/);
    expect(TTS_CODE).toMatch(/startswith\("seg_"\)/);
    expect(TTS_CODE).toMatch(/script\["tts_rate"\] = rate/);
  });
});

describe('run_pipeline.py：参数透传', () => {
  it('把 --images 传给 compose_video', () => {
    expect(RUNPY).toMatch(/\["--images", a\.images\]/);
  });

  it('把 --rate 传给 tts_gen，默认 +15%（YZ_TTS_RATE 可覆盖）', () => {
    expect(RUNPY).toMatch(/\["--rate", a\.rate\]/);
    expect(RUNPY).toMatch(/YZ_TTS_RATE/);
    // 2026-10-27 默认语速从 +10% 调到 +15%（短视频口播偏快更好完播）——断言随口径更新
    expect(RUNPY).toMatch(/"\+15%"/);
  });
});
