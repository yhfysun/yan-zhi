// 转场 + 音效链实跑核验（**bash 驱动版**）。
//
// ★★★ 为什么改成 bash 驱动（本项目铁律）：本机 node 的 spawn 被沙箱拦成 EBUSY
//   （连 `spawnSync(node, [tsx])` 都失败），所以**凡是要跨进程编排的验证一律 bash 直调**。
//   本脚本只做两件不 spawn 的事：① 生成渲染计划（走实现）② 写 run-*.sh；
//   真正跑 ffmpeg 由后续 bash 循环完成。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'tmp/transition-verify').replace(/\\/g, '/');
fs.mkdirSync(OUT, { recursive: true });

// 生成 tsx 脚本（import 走 file:/// + 正斜杠）
const gen = path.join(OUT, 'gen.mts').replace(/\\/g, '/');
fs.writeFileSync(gen, `
import { applyClipOp, type ClipProject } from 'file:///${ROOT}/apps/server/src/services/clip-project';
import { buildRenderPlan } from 'file:///${ROOT}/apps/server/src/services/clip-render';
import { writeFileSync, mkdirSync } from 'node:fs';
const A = ${JSON.stringify(path.join(OUT, 'a.mp4').replace(/\\/g, '/'))};
const B = ${JSON.stringify(path.join(OUT, 'b.mp4').replace(/\\/g, '/'))};
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
const durations: Record<string, number> = { [A]: 6, [B]: 5 };
const hasAudio: Record<string, boolean> = { [A]: true, [B]: true };
const cases: Array<[string, boolean, boolean]> = [['no-transition', false, false], ['with-transition', true, false], ['with-transition-fx', true, true]];
for (const [tag, tr, fx] of cases) {
  const proj = build(tr, fx);
  const workDir = ${JSON.stringify(OUT)} + '/work-' + tag;
  const outFile = ${JSON.stringify(OUT)} + '/' + tag + '.mp4';
  mkdirSync(workDir, { recursive: true });
  const r = buildRenderPlan({ project: proj, durations, hasAudio, workDir, outFile });
  if (!r.ok) { console.error(tag + ' PLAN FAIL: ' + r.error); process.exit(1); }
  for (const a of r.plan.assets) { writeFileSync(a.file.replace(/\\\\/g, '/'), a.content, 'utf8'); }
  const lines = ['set -e'];
  for (const st of r.plan.steps) {
    if (!st.args.length) continue;
    const q = st.args.map((x) => (/^[A-Za-z0-9._:+\\-/=,'@%]+$/.test(x) ? x : '"' + x.replace(/"/g, '\\\\"') + '"')).join(' ');
    lines.push('echo "== ' + st.label + '"');
    lines.push('"$FF" ' + q);
  }
  writeFileSync(${JSON.stringify(OUT)} + '/run-' + tag + '.sh', lines.join('\\n') + '\\n', 'utf8');
  console.log(tag + '|||' + r.plan.steps.map((x) => x.label).join(' | ') + '|||' + r.plan.totalDuration);
}
`, 'utf8');
console.log('gen.mts 已生成:', gen);
console.log('接下来由 bash 执行：① 生成计划 ② 跑 run-*.sh ③ 核验时长');