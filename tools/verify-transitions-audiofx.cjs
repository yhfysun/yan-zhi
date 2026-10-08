// 转场 + 音效链实跑核验：从实现生成渲染计划 → bash 跑 ffmpeg → ffprobe 核验时长/流。
//
// ★ 判据（不只是"命令没报错"）：
//   ① 转场让**总时长变短**（xfade 重叠掉 duration 秒）—— 这是转场真的生效的铁证；
//   ② 无转场时走 -c copy 直拼（不应出现 xfade 步骤）；
//   ③ 音效链步骤存在且产物能解出音轨。
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const FF = 'C:/Users/Administrator/AppData/Roaming/yan-zhi/server-data/ffmpeg/ffmpeg.exe';
const FFP = 'C:/Users/Administrator/AppData/Roaming/yan-zhi/server-data/ffmpeg/ffprobe.exe';
const ROOT = path.resolve(__dirname, '..').replace(/\\/g, '/');   // ★ file:/// 需要正斜杠
const OUT = path.join(ROOT, 'tmp/transition-verify');
fs.mkdirSync(OUT, { recursive: true });

const ffprobeDur = (f) => {
  try {
    return Number(execFileSync(FFP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).toString().trim());
  } catch { return 0; }
};
const hasStream = (f, kind) => {
  try {
    const out = execFileSync(FFP, ['-v', 'error', '-select_streams', `${kind}:0`, '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).toString().trim();
    return out.includes(kind);
  } catch { return false; }
};

(async () => {
  // 造两段规格一致的素材（6s / 5s，都有音轨）——转场要求规格一致
  const mk = (name, dur, freq) => {
    const f = path.join(OUT, name);
    if (fs.existsSync(f)) return f;
    execFileSync(FF, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=640x360:d=${dur}:r=30`,
      '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${dur}`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    return f;
  };
  const A = mk('a.mp4', 6, 440);
  const B = mk('b.mp4', 5, 660);
  console.log('素材:', ffprobeDur(A).toFixed(2) + 's +', ffprobeDur(B).toFixed(2) + 's');

  // 用 tsx 生成渲染计划（走实现，不手写 ffmpeg 命令）
  const gen = path.join(OUT, 'gen.mts');
  fs.writeFileSync(gen, `
import { applyClipOp, type ClipProject } from 'file:///${ROOT}/apps/server/src/services/clip-project';
import { buildRenderPlan } from 'file:///${ROOT}/apps/server/src/services/clip-render';
import { writeFileSync, mkdirSync } from 'node:fs';
const A = ${JSON.stringify(A.replace(/\\/g, '/'))};
const B = ${JSON.stringify(B.replace(/\\/g, '/'))};
function build(withTransition: boolean, withAudioFx: boolean): ClipProject {
  let p: ClipProject | null = null;
  const step = (op: string, args: Record<string, unknown>) => {
    const r = applyClipOp(p, op, args);
    if (!r.ok) throw new Error(op + ': ' + r.error);
    p = r.project;
  };
  step('create', { name: 't', size: '640x360', fps: 30 });
  step('add_clip', { clips: [
    { file: A, label: 'A' },
    { file: B, label: 'B', ...(withTransition ? { transition: { type: 'fade', duration: 1.0 } } : {}) },
  ] });
  if (withAudioFx) step('set_audio_fx', { fx: ['denoise', 'loud'] });
  return p!;
}
const durations = { [A]: 6, [B]: 5 };
const hasAudio = { [A]: true, [B]: true };
for (const [tag, tr, fx] of [['no-transition', false, false], ['with-transition', true, false], ['with-transition-fx', true, true]] as const) {
  const proj = build(tr, fx);
  const workDir = ${JSON.stringify(OUT.replace(/\\/g, '/'))} + '/work-' + tag;
  const outFile = ${JSON.stringify(OUT.replace(/\\/g, '/'))} + '/' + tag + '.mp4';
  const r = buildRenderPlan({ project: proj, durations, hasAudio, workDir, outFile, bgmFile: undefined });
  if (!r.ok) { console.error(tag + ' PLAN FAIL: ' + r.error); process.exit(1); }
  mkdirSync(workDir, { recursive: true });
  for (const a of r.plan.assets) { const d = a.file.replace(/\\\\/g, '/'); writeFileSync(d, a.content, 'utf8'); }
  const lines = ['set -e'];
  for (const st of r.plan.steps) {
    if (!st.args.length) continue;
    const q = st.args.map((x) => (/^[A-Za-z0-9._:+\\-/=,'@%]+$/.test(x) ? x : '"' + x.replace(/"/g, '\\\\"') + '"')).join(' ');
    lines.push('echo "== ' + st.label + '"');
    lines.push('"$FF" ' + q);
  }
  writeFileSync(${JSON.stringify(OUT.replace(/\\/g, '/'))} + '/run-' + tag + '.sh', lines.join('\\n') + '\\n', 'utf8');
  // 报告步骤标签（用于断言"有转场才走 xfade"）
  console.log(tag + '|||' + r.plan.steps.map((x) => x.label).join(' | ') + '|||' + r.plan.totalDuration);
}
`, 'utf8');
  const NODE = process.execPath;
  const TSX = path.join(ROOT, 'node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/cli.mjs');
  execFileSync(NODE, [TSX, gen], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });

  const results = { ok: [], fail: [] };
  const planInfo = {};
  // 重新跑一次拿标签（上面已打印到 stdout，这里用文件读更稳）
  const infoRaw = execFileSync(NODE, [TSX, gen], { encoding: 'utf8', timeout: 120000 });
  for (const line of infoRaw.trim().split('\n')) {
    const [tag, labels, dur] = line.split('|||');
    planInfo[tag] = { labels, totalDuration: Number(dur) };
  }

  for (const tag of Object.keys(planInfo)) {
    const sh = path.join(OUT, `run-${tag}.sh`);
    try {
      execFileSync('bash', [sh.replace(/\\/g, '/')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, env: { ...process.env, FF } });
    } catch (e) {
      results.fail.push(`${tag} 渲染失败: ${String(e.stderr || e.message).slice(-200)}`);
      continue;
    }
    const out = path.join(OUT, `${tag}.mp4`);
    const dur = ffprobeDur(out);
    const v = hasStream(out, 'v');
    const a = hasStream(out, 'a');
    if (!v || !a) { results.fail.push(`${tag} 产物缺流（video=${v} audio=${a}）`); continue; }
    results.ok.push(`${tag}: ${dur.toFixed(2)}s (video+audio)`);
    planInfo[tag].actualDuration = dur;
  }

  console.log('\n=== 转场/音效实跑核验 ===');
  for (const o of results.ok) console.log('  ✅ ' + o);
  for (const f of results.fail) console.log('  ❌ ' + f);

  // ★ 关键断言：转场让总时长变短
  const noTr = planInfo['no-transition']?.actualDuration || 0;
  const withTr = planInfo['with-transition']?.actualDuration || 0;
  console.log('\n--- 判定 ---');
  console.log(`无转场时长 ${noTr.toFixed(2)}s / 有转场时长 ${withTr.toFixed(2)}s`);
  console.log('转场使时长缩短约 1s(转场时长) →', (noTr - withTr) > 0.6 && (noTr - withTr) < 1.4 ? '✅ 转场生效' : '❌ 转场未生效或时长异常');
  console.log('无转场走直拼（步骤里不应有 xfade）→', !planInfo['no-transition']?.labels?.includes('xfade') ? '✅ 走 copy 直拼' : '❌ 无转场也重编码了');
  console.log('有转场步骤含 xfade →', planInfo['with-transition']?.labels?.includes('转场') ? '✅' : '❌');
  console.log('音效链步骤出现 →', planInfo['with-transition-fx']?.labels?.includes('音效链') ? '✅' : '❌');
  process.exit(results.fail.length ? 1 : 0);
})();