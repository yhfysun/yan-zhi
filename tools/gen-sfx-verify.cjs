#!/usr/bin/env node
/**
 * 音效库实跑核验：逐个生成 → ffprobe 核验时长/音轨。
 *
 * ★★★ 为什么必须实跑：音效的坑全是运行时的（滤镜参数错、aac 不支持单声道、
 *   无限源没加 -t 会写出巨大文件）。编译与静态断言一律看不出来。
 *   实测踩到过的两个：① `riser` 的 aeval 参数写错直接失败；
 *   ② aac 编码器 **不支持单声道 1-channel 布局**（必须 -ac 2）。
 *
 * ★ bash 驱动（本机 node spawn 被沙箱拦成 EBUSY，见项目铁律）。
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..').replace(/\\/g, '/');
const FF = 'C:/Users/Administrator/AppData/Roaming/yan-zhi/server-data/ffmpeg/ffmpeg.exe';
const FFP = 'C:/Users/Administrator/AppData/Roaming/yan-zhi/server-data/ffmpeg/ffprobe.exe';
const OUT = path.join(ROOT, 'tmp/sfx-verify');
fs.mkdirSync(OUT, { recursive: true });

// 从实现读音效清单（不手写复刻 —— 复刻就是"测脚本不测实现"）
const src = fs.readFileSync(path.join(ROOT, 'apps/server/src/services/sfx-library.ts'), 'utf-8');
const items = [];
const re = /\{\s*id:\s*'([^']+)'[\s\S]*?input:\s*(\[[^\]]*\])[\s\S]*?af:\s*'([^']*)'[\s\S]*?maxSec:\s*([\d.]+)/g;
let m;
while ((m = re.exec(src))) {
  items.push({ id: m[1], input: m[2], af: m[3], maxSec: m[4] });
}
if (!items.length) { console.error('未从实现解析到音效项（正则与源码形态不符）'); process.exit(2); }

// 生成 bash 脚本
const lines = ['set -e'];
for (const it of items) {
  const out = `${OUT}/${it.id}.m4a`;
  // input 是 JS 数组字面量 → 转成 shell 参数
  const args = JSON.parse(it.input.replace(/'/g, '"')).map((x) => `'${x}'`).join(' ');
  lines.push(`echo "== ${it.id}"`);
  lines.push(`"$FF" -y -v error ${args} -af '${it.af}' -t ${it.maxSec} -c:a aac -ar 44100 -ac 2 '${out}'`);
}
fs.writeFileSync(path.join(OUT, 'run.sh'), lines.join('\n') + '\n', 'utf8');

// 核验清单也给 bash 用
fs.writeFileSync(path.join(OUT, 'items.txt'), items.map((i) => `${i.id}\t${i.maxSec}`).join('\n'), 'utf8');
console.log(`已从实现解析 ${items.length} 个音效，写出 run.sh 与 items.txt`);
console.log('接下来 bash：跑 run.sh → 逐个 ffprobe 核验');