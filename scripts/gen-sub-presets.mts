// 字幕动画 8 预设实跑验证：生成测试视频 → 每种预设烧录 ASS → 抽帧供肉眼核验。
// 用 tsx 直跑（在 apps/server 目录下），ffmpeg 用 bash 直调（node spawn 会被沙箱拦成 EBUSY，别在这脚本里 spawn ffmpeg）。
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildAss, SUBTITLE_ANIMATION_PRESETS, type AssCue } from 'file:///C:/Users/Administrator/Desktop/github/yan-zhi-master/apps/server/src/mcp/subtitle-style';

const OUT = 'C:/Users/Administrator/Desktop/github/yan-zhi-master/tmp/vfx-sub';
mkdirSync(OUT, { recursive: true });

const cues: AssCue[] = [
  { start: 0.2, end: 3.2, text: '科技赋能美好生活' },
  { start: 3.4, end: 7.0, text: '字幕动画 Second Line!' },
];

for (const p of SUBTITLE_ANIMATION_PRESETS) {
  const r = buildAss(cues, {
    preset: p.id,
    playResX: 1080,
    playResY: 1920,
    fontSizePx: 96,
    primaryColor: '&H00FFFFFF&',
    outlineColor: '&H00000000&',
    outlinePx: 3,
    alignment: 2,
    marginVPx: 300,
    direction: 'right',
  });
  if (!r.ok) { console.error(`[${p.id}] buildAss FAIL: ${r.error}`); process.exit(1); }
  writeFileSync(path.join(OUT, `${p.id}.ass`), r.ass, 'utf8');
  console.log(`[${p.id}] ass ok, events=${r.events}`);
}
console.log('DONE');
