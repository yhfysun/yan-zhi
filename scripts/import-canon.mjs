#!/usr/bin/env node
// 典籍文库批量导入脚本（docs/传统文化与音乐学习模式方案-2026-11-14.md §4.2b）。
// 用途：P1 断代大库分批导入 —— 从 tools/canon-src/ 读取 chinese-poetry（MIT）等
// 公版语料 JSON，规整字段后走 canon-store.upsertCanonWorks（按 id 幂等 upsert，可重跑）。
//
// 用法：node scripts/import-canon.mjs [文件或目录]...
//   - 不带参数：导入 tools/canon-src/ 下全部 *.json
//   - 文件格式：每行一个条目，或数组，字段
//     { id, title, author, dynasty, genre, collection?, tags?, popularity?, difficulty?, text, source }
//   - dynasty 必须是：先秦|两汉|魏晋南北朝|唐|五代|宋|元|明|清
//   - genre 必须是：经|诗|词|曲|文|蒙学
//
// ★ 精读层注解（人工预写）不经过本脚本 —— 本脚本只写 canon_work（文库层原文），
//   不碰 canon_gloss 的 verified 记录（canon-store 层有 assisted 不覆盖 verified 守卫）。
import fs from 'node:fs';
import path from 'node:path';

const DYNASTIES = new Set(['先秦', '两汉', '魏晋南北朝', '唐', '五代', '宋', '元', '明', '清']);
const GENRES = new Set(['经', '诗', '词', '曲', '文', '蒙学']);

function parseArgs() {
  const args = process.argv.slice(2);
  const root = path.resolve(import.meta.dirname, '..');
  const targets = args.length ? args : [path.join(root, 'tools', 'canon-src')];
  const files = [];
  for (const t of targets) {
    const p = path.resolve(t);
    if (!fs.existsSync(p)) {
      console.error(`[import-canon] 路径不存在：${p}`);
      continue;
    }
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      files.push(...fs.readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => path.join(p, f)));
    } else {
      files.push(p);
    }
  }
  return files;
}

function loadWorks(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.works) ? parsed.works : null;
  if (!arr) throw new Error(`${file}: 期望 JSON 数组或 { works: [...] }`);
  return arr;
}

async function main() {
  const files = parseArgs();
  if (!files.length) {
    console.log('[import-canon] 无可导入文件（tools/canon-src/ 为空）。P0 精选集已随包内嵌（canon-data.ts），无需本脚本。');
    return;
  }
  const { upsertCanonWorks, canonCollections } = await import('../src/learning/culture/canon-store.js');
  let total = 0;
  for (const file of files) {
    let items;
    try { items = loadWorks(file); }
    catch (e) { console.error(`[import-canon] 跳过 ${file}：${e.message}`); continue; }
    const valid = [];
    for (const it of items) {
      if (!it.id || !it.title || !it.text) { console.warn(`[import-canon] 缺 id/title/text，跳过：${it.id ?? it.title ?? '(未命名)'}`); continue; }
      if (!DYNASTIES.has(it.dynasty)) { console.warn(`[import-canon] dynasty 非法（${it.dynasty}），跳过：${it.id}`); continue; }
      if (!GENRES.has(it.genre)) { console.warn(`[import-canon] genre 非法（${it.genre}），跳过：${it.id}`); continue; }
      valid.push({
        id: String(it.id),
        title: String(it.title),
        author: String(it.author ?? '佚名'),
        dynasty: it.dynasty,
        genre: it.genre,
        collection: String(it.collection ?? ''),
        tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
        popularity: ['classic', 'notable', 'normal'].includes(it.popularity) ? it.popularity : 'normal',
        difficulty: ['蒙学', '入门', '进阶', '深造'].includes(it.difficulty) ? it.difficulty : '入门',
        text: String(it.text),
        source: String(it.source ?? 'chinese-poetry'),
      });
    }
    if (!valid.length) continue;
    const r = upsertCanonWorks(valid);
    total += valid.length;
    console.log(`[import-canon] ${path.basename(file)}：新增 ${r.inserted} / 更新 ${r.updated}`);
  }
  const cols = canonCollections();
  console.log(`[import-canon] 完成。文库总量 ${cols.total} 篇；朝代分布 ${cols.dynasties.map((d) => `${d.key}=${d.count}`).join(' / ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
