#!/usr/bin/env node
/**
 * 空间记忆瘦身脚本（P0 配套，2026-10-09）。
 *
 * 背景：生产空间记忆 `小说推文/MEMORY.md` 实测 12786 字符，27 条任务进展行占 81%
 *   （平均 381 字），而注入上限仅 6000 → 每次新会话开局被超长流水账压垮，形成
 *   "越断记忆越长 → 越容易再断"的正反馈。新版 appendTaskProgress 已改为
 *   「注入版压一行要点 + 滚动淘汰」，但**存量文件**不会自动缩水 —— 本脚本一次性清理。
 *
 * 语义（与 services/space-memory.ts 保持一致）：
 *   · 保留头部（#/> 开头）与所有**非**任务进展行（决策/普通记忆）原样；
 *   · 任务进展行只保留最近 KEEP 条，且每条压缩到 ≤ MAX 字（优先保留"成片路径/落盘"）；
 *   · 清理前**强制备份**为 <file>.bak-<ts>。
 *
 * 用法：
 *   node tools/prune-space-memory.cjs "<MEMORY.md 路径>"            # 预览（dry-run，不写）
 *   node tools/prune-space-memory.cjs "<MEMORY.md 路径>" --apply    # 实际执行（先备份）
 */
const fs = require('node:fs');
const path = require('node:path');

const KEEP = 8;
const MAX = 300;
const MARK = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} 任务【/;

/** 与 server 侧 compactProgressSummary 同口径：优先抽产物路径 */
const PATTERNS = [
  /(成片路径|产物路径|落盘|已写入|文件路径|输出路径)[：:][^。；;]{0,180}/,
  /(C:\\[^\s。；;]{6,180})/,
  /(\/[\w\-./]{8,180}\.(mp4|txt|json|md|mp3|srt))/,
];

function compact(line) {
  for (const p of PATTERNS) {
    const m = line.match(p);
    if (m && m[0] && m[0].trim().length >= 6) {
      const hit = m[0].trim();
      return hit.length > MAX ? hit.slice(0, MAX) + '…' : hit;
    }
  }
  // 无产物路径 → 保留行首（含形态/智能体名 + 摘要开头）
  return line.length > MAX ? line.slice(0, MAX) + '…' : line;
}

/**
 * 分段：头注 + 若干 entry。旧数据里有 entry 内嵌换行（历史 bug），
 * 必须把续行归属到它所属的 entry，否则会误删"被保留 entry"的正文、或留下孤儿片段。
 * entry 起始行判定 = 以 "- " 开头。
 */
function segment(lines) {
  const header = [];
  const entries = [];
  let cur = null;
  for (const l of lines) {
    if (l.startsWith('- ')) { if (cur) entries.push(cur); cur = [l]; }
    else if (cur) cur.push(l);
    else header.push(l);
  }
  if (cur) entries.push(cur);
  return { header, entries };
}

function prune(content) {
  const { header, entries } = segment(content.split('\n'));
  const progress = entries.filter((e) => MARK.test(e[0]));
  const others = entries.filter((e) => !MARK.test(e[0]));
  const keepProgress = progress.slice(Math.max(0, progress.length - KEEP));
  // 保留 entry：普通记忆原样（多行也保留）；任务进展只保留最近 KEEP 条并压成一行
  const out = [
    ...header,
    ...others.map((e) => e.join('\n')),
    ...keepProgress.map((e) => compact(e.join(' ').replace(/\s+/g, ' ').trim())),
  ];
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n'), before: progress.length, after: keepProgress.length };
}

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) { console.error('用法: node tools/prune-space-memory.cjs "<MEMORY.md 路径>" [--apply]'); process.exit(2); }
if (!fs.existsSync(file)) { console.error('文件不存在:', file); process.exit(2); }

const raw = fs.readFileSync(file, 'utf8');
const { text, before, after } = prune(raw);
console.log(`文件: ${file}`);
console.log(`原始: ${raw.length} 字符 / 任务进展行 ${before} 条`);
console.log(`清理后: ${text.length} 字符 / 任务进展行 ${after} 条`);
if (!apply) {
  console.log('\n[dry-run] 未写盘。加 --apply 实际执行（会先备份）。');
  process.exit(0);
}
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${file}.bak-${ts}`;
fs.copyFileSync(file, backup);
fs.writeFileSync(file, text, 'utf8');
console.log(`\n✅ 已备份: ${backup}`);
console.log(`✅ 已写回: ${file}`);