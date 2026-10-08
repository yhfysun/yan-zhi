// 剪辑工程端到端实跑：建工程 → 生成渲染计划 → 写 assets → 输出可 bash 执行的命令清单。
// 分成两步是因为本机 node 子进程 spawn 被沙箱拦成 EBUSY —— ffmpeg 一律 bash 直调。
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { applyClipOp, type ClipProject } from 'file:///C:/Users/Administrator/Desktop/github/yan-zhi-master/apps/server/src/services/clip-project';
import { buildRenderPlan } from 'file:///C:/Users/Administrator/Desktop/github/yan-zhi-master/apps/server/src/services/clip-render';

const W = 'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/vfx-clip';
const WORK = path.join(W, 'work');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

function step(cur: ClipProject | null, op: string, args: Record<string, unknown>): ClipProject {
  const r = applyClipOp(cur, op, args);
  if (!r.ok) { console.error(`[${op}] ${r.error}`); process.exit(1); }
  console.log(`[${op}] ${r.note}`);
  return r.project;
}

let p: ClipProject | null = null;
p = step(p, 'create', { name: '端到端验证片', size: '1080x1920', fps: 30 });
p = step(p, 'add_clip', {
  clips: [
    // 段1：裁 1~5s，带配音（替换原声），淡入
    { file: `${W}/a.mp4`, label: 'A段', trimStart: 1, trimEnd: 5, audioFile: `${W}/voice.m4a`, fadeIn: 0.5 },
    // 段2：无音轨 → 应自动补静音；2 倍速；调色
    { file: `${W}/b.mp4`, label: 'B段', speed: 2, colorPreset: 'cool' },
    // 段3：静态图 → kenburns 运镜 4s
    { file: `${W}/pic.png`, label: 'C段图', kenburns: { direction: 'in', duration: 4 } },
  ],
});
p = step(p, 'add_text', {
  texts: [
    { text: '片头标题字幕', start: 0.2, end: 2.5, animation: 'zoom' },
    { text: '中段卡拉OK逐字', start: 3.0, end: 6.0, animation: 'karaoke', safeArea: true },
    { text: '结尾稳妥淡入', start: 6.5, end: 9.5, animation: 'fade' },
  ],
});
p = step(p, 'set_bgm', { file: `${W}/bgm.m4a`, volume: 0.3, duck: true });
p = step(p, 'get', {});

const durations = { [`${W}/a.mp4`]: 7, [`${W}/b.mp4`]: 5, [`${W}/pic.png`]: 0 };
const hasAudio = { [`${W}/a.mp4`]: true, [`${W}/b.mp4`]: false, [`${W}/pic.png`]: false };

const planned = buildRenderPlan({
  project: p!, durations, hasAudio,
  workDir: WORK, outFile: path.join(W, 'final.mp4'),
  bgmFile: `${W}/bgm.m4a`,
  imageFiles: [`${W}/pic.png`],
});
if (!planned.ok) { console.error(planned.error); process.exit(1); }
const { steps, assets, totalDuration } = planned.plan;

for (const a of assets) { mkdirSync(path.dirname(a.file), { recursive: true }); writeFileSync(a.file, a.content, 'utf8'); }
console.log(`\n总时长预算 ${totalDuration}s，步骤 ${steps.length}，assets ${assets.length}`);

const FF = 'C:/Users/Administrator/AppData/Roaming/yan-zhi/server-data/ffmpeg/ffmpeg.exe';
const lines = [`FF="${FF}"`, 'set -e'];
for (const s of steps) {
  if (!s.args.length) continue;
  const quoted = s.args.map((x) => (/^[A-Za-z0-9._:+\-/=,'@%]+$/.test(x) ? x : `"${x.replace(/"/g, '\\"')}"`)).join(' ');
  lines.push(`echo "== ${s.label}"`);
  lines.push(`"$FF" ${quoted}`);
}
writeFileSync(path.join(W, 'run.sh'), lines.join('\n') + '\n', 'utf8');
console.log('已写出 run.sh');
for (const s of steps) console.log(` - ${s.label}`);