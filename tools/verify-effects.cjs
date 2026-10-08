#!/usr/bin/env node
/**
 * verify-effects.cjs —— 逐个实跑效果库里的滤镜，确认 ffmpeg 能接受且产物可解。
 *
 * ★★★ 为什么必须实跑（本项目铁律）：滤镜的坑全是运行时的（参数名写错、滤镜不存在、
 *   单位不对），`tsc`/静态断言一律看不出来 —— 只会"命令成功但画面没变化"或直接报错。
 *   本项目已有先例：FontSize 被当像素用、drawtext 与 libass 单位相反。
 *
 * 判据：每条滤镜都跑一次真 ffmpeg，产物用 ffprobe 解出视频流才算通过。
 * 用法：node tools/verify-effects.cjs
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FF = 'C:/Users/Administrator/AppData/Roaming/yan-zhi/server-data/ffmpeg/ffmpeg.exe';
const OUT = path.resolve(__dirname, '../tmp/effect-verify');
fs.mkdirSync(OUT, { recursive: true });

// 效果库（与 apps/server/src/services/clip-effects.ts 同源；这里内联以免依赖 TS 编译）
const COLOR_EFFECTS = [
  ['none', ''], ['bright', 'eq=brightness=0.06:saturation=1.05'], ['vivid', 'eq=saturation=1.35:contrast=1.08'],
  ['soft', 'eq=contrast=0.92:saturation=0.88:brightness=0.03'], ['sharp', 'unsharp=5:5:0.9:5:5:0'],
  ['warm', 'colorbalance=rs=.15:gs=.05:bs=-.10,eq=saturation=1.06'], ['cool', 'colorbalance=rs=-.08:bs=.15,eq=saturation=1.02'],
  ['skin', 'smartblur=lr=1:ls=-0.5:lt=5,eq=brightness=0.04:saturation=1.04'],
  ['blush', 'colorbalance=rs=.10:gs=-.02:bs=.04,eq=saturation=1.10:brightness=0.03'],
  ['portrait_bw', 'hue=s=0,eq=contrast=1.10:brightness=0.04'],
  ['cinema', 'colorbalance=rs=-.06:bs=.10,eq=saturation=0.90:contrast=1.12'],
  ['teal', 'colorbalance=rs=.12:bs=-.12:gm=.06,eq=saturation=1.05:contrast=1.08'],
  ['night', 'colorbalance=bs=.22:gm=.05,eq=brightness=-0.06:saturation=0.85:contrast=1.06'],
  ['dawn', 'colorbalance=rs=.10:gs=.04:bs=.02,eq=brightness=0.05:contrast=0.90:saturation=0.94'],
  ['dusk', 'colorbalance=rs=.16:bs=.06:gm=-.04,eq=saturation=1.08:contrast=1.04'],
  ['film', 'eq=contrast=1.10:saturation=.90:gamma=.96,noise=alls=6:allf=t'],
  ['noir', 'hue=s=0,eq=contrast=1.35:brightness=-0.04,vignette=PI/4.5'],
  ['vintage', 'curves=vintage,eq=saturation=.85:contrast=1.05'],
  ['sepia', 'colorbalance=rs=.20:gs=.10:bs=-.15,eq=saturation=0.55:contrast=1.04'],
  ['retro80', 'colorbalance=rs=.16:bs=.14:gm=-.06,eq=saturation=1.15:contrast=1.06'],
  ['fade', 'eq=brightness=.05:saturation=.75:contrast=.92'],
  ['bw', 'hue=s=0'], ['bw_hc', 'hue=s=0,eq=contrast=1.28'],
  ['sketch', 'edgedetect=low=0.08:high=0.28'],
  ['neon', 'eq=saturation=1.55:contrast=1.20:brightness=0.02'],
  ['dreamy', 'gblur=sigma=1.2,eq=brightness=0.06:saturation=1.06'],
  ['vignette', 'vignette=PI/4'],
  ['invert', 'negate'], ['glitch', 'chromashift=cbh=4:crh=-4,eq=saturation=1.20'],
  ['thermal', 'hue=h=180:s=2.2,eq=contrast=1.15'],
];
const AUDIO_EFFECTS = [
  ['none', ''], ['denoise', 'afftdn=nr=12:nf=-25'], ['denoise_strong', 'afftdn=nr=24:nf=-30'],
  ['loud', 'loudnorm=I=-16:TP=-1.5:LRA=11'],
  ['radio', 'highpass=f=400,lowpass=f=3000,volume=1.2'],
  ['phone', 'highpass=f=500,lowpass=f=2500,acrusher=bits=8:mix=0.3'],
  ['deep', 'asetrate=44100*0.92,aresample=44100,atempo=1.087'],
  ['chipmunk', 'asetrate=44100*1.12,aresample=44100,atempo=0.893'],
  ['reverb', 'aecho=0.8:0.85:60|120:0.5|0.3'],
];
const TRANSITIONS = ['fade','dissolve','fadeblack','fadewhite','wipeleft','wiperight','wipeup','wipedown',
  'slideleft','slideright','slideup','slidedown','smoothleft','smoothright','circleopen','circleclose',
  'radial','pixelize','zoomin','hlslice','vuslice','squeezev','squeezeh','coverleft','revealright'];

function run(args, timeout = 60000) {
  try {
    execFileSync(FF, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, err: '' };
  } catch (e) {
    return { ok: false, err: String((e.stderr || e.message || '')).slice(-260) };
  }
}

function probe(file) {
  try {
    const out = execFileSync(FF.replace(/ffmpeg\.exe$/, 'ffprobe.exe'),
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 1024 * 1024 }).toString().trim();
    return out.includes('video');
  } catch { return false; }
}

const results = { ok: [], fail: [] };

// ① 视频滤镜：一次一条，真跑
for (const [id, f] of COLOR_EFFECTS) {
  if (!f) { results.ok.push(`color:${id}（空=不变，跳过实跑）`); continue; }
  const out = path.join(OUT, `v-${id}.mp4`);
  const r = run(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=0.6:r=15',
    '-vf', `${f},format=yuv420p`, '-c:v', 'libx264', '-preset', 'ultrafast', out]);
  if (r.ok && probe(out)) results.ok.push(`color:${id}`);
  else results.fail.push(`color:${id} → ${r.err || '产物无视频流'}`);
}

// ② 音频滤镜
//
// ★ 判据用「能解出音频流」而不是「文件字节数 > 200」：
//   第一版按字节数判，`denoise`（anlmdn）被误判失败 —— 0.6s 正弦本身很小，
//   降噪后更小 → m4a 不到 200 字节。**这是验证脚本的判据 bug，不是效果的问题**
//   （同一命令手工跑是成功的、有正常的 AAC 流）。
//   → 判据必须是"产物能被解出对应流"，与视频那组保持同一口径。
const probeAudio = (file) => {
  try {
    const out = execFileSync(FF.replace(/ffmpeg\.exe$/, 'ffprobe.exe'),
      ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 1024 * 1024 }).toString().trim();
    return out.includes('audio');
  } catch { return false; }
};
for (const [id, f] of AUDIO_EFFECTS) {
  if (!f) { results.ok.push(`audio:${id}（空=不变，跳过实跑）`); continue; }
  const out = path.join(OUT, `a-${id}.m4a`);
  const r = run(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.6',
    '-af', f, '-c:a', 'aac', out]);
  if (r.ok && probeAudio(out)) results.ok.push(`audio:${id}`);
  else results.fail.push(`audio:${id} → ${r.err || '产物无音频流'}`);
}

// ③ 转场：两段 xfade（每个 transition 名都要被 ffmpeg 认）
for (const t of TRANSITIONS) {
  const out = path.join(OUT, `x-${t}.mp4`);
  const r = run(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=1:r=15',
    '-f', 'lavfi', '-i', 'testsrc=s=320x240:d=1:r=15',
    '-filter_complex', `[0:v][1:v]xfade=transition=${t}:duration=0.4:offset=0.6,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'ultrafast', out]);
  if (r.ok && probe(out)) results.ok.push(`xfade:${t}`);
  else results.fail.push(`xfade:${t} → ${r.err || '产物无视频流'}`);
}

console.log(`=== 效果库实跑核验：通过 ${results.ok.length} / 失败 ${results.fail.length} ===`);
if (results.fail.length) {
  console.log('\n❌ 失败项（参数或滤镜名有问题，必须修）：');
  for (const f of results.fail) console.log('  ' + f);
}
if (!results.fail.length) console.log('\n🎉 全部效果实测可用');
process.exit(results.fail.length ? 1 : 0);