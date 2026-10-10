/**
 * 注释地雷守门（2026-10-09）。
 *
 * ★★★ 为什么必须有（本次真实事故）：
 *   `tool-permission.ts` 的一行 `//` 注释里写了"斜杠+星号"的通配写法，
 *   它被"剥注释"类工具当成**块注释起点**，与下方真注释的结束符配成一对 →
 *   把两者之间的**真实代码整段吃掉**（`api_conversation_setup` / `api_custom_tool_create`
 *   等写工具登记凭空消失）。表现是"代码明明写了却不生效" + 源码断言假红，极难归因。
 *   （写本文件时又踩了一次：本文件的 JSDoc 里写了那个结束符，直接把自己注释闭合了。）
 *
 * 本测试扫服务端/共享包源码：① 禁止行注释里出现块注释起始序列；
 * ② 结构性兜底：WRITE_TOOLS 切片必须能看到末尾那批写工具登记。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const ROOTS = [
  resolve(__dirname, '..', 'src'),
  resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src'),
  resolve(__dirname, '..', '..', '..', 'packages', 'core', 'src'),
];

// 用字符串拼出两个两字符序列与引号码点，避免在本文件里书写这些序列
const OPEN_RE = '/' + '\\*';     // 正则转义形式
const CLOSE_RE = '\\*' + '/';
const SQ = 39, DQ = 34, BQ = 96; // ' " `

function walk(dir: string, out: string[] = []): string[] {
  let ents: string[] = [];
  try { ents = readdirSync(dir); } catch { return out; }
  for (const e of ents) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (extname(p) === '.ts') out.push(p);
  }
  return out;
}

/** 扫描器：逐字符走一遍，按需决定"字符串是否保留" */
function scan(src: string, keepStrings: boolean): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    // 行注释：原样保留（地雷正是在这里被检出；剥注释时整行丢弃）
    if (c === '/' && src[i + 1] === '/') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      if (keepStrings) out += src.slice(start, i); // 保留原样
      continue;
    }
    // 块注释：整体跳过
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // 字符串字面量
    const cp = src.charCodeAt(i);
    if (cp === SQ || cp === DQ || cp === BQ) {
      const q = src[i];
      const start = i;
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        i++;
      }
      // keepStrings=true → 原样保留（结构核验需要工具名）；false → 替换成占位（防误报）
      out += keepStrings ? src.slice(start, i) : 'S';
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 地雷扫描：去掉字符串字面量（避免把字符串/正则里的序列误判为注释地雷） */
const stripStringsAndBlocks = (src: string) => scan(src, false);
/** 结构核验：只去注释，保留字符串（否则工具名也一起没了） */
const stripCommentsOnly = (src: string) => scan(src, true).replace(/^[ \t]*\/\/.*$/gm, '');

/** 行注释里出现块注释起始序列 = 地雷（会把后面代码吞进块注释） */
const LANDMINE = new RegExp('(^|[^:])//[^\\n]*' + OPEN_RE);

describe('注释地雷守门：行注释里不得出现块注释起始序列', () => {
  it('★★ 全量扫描：任何 .ts 的行注释都不许含该地雷序列', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const f of walk(root)) {
        const clean = stripStringsAndBlocks(readFileSync(f, 'utf8'));
        clean.split('\n').forEach((l, i) => {
          if (LANDMINE.test(l)) offenders.push(f + ':' + (i + 1) + '  ' + l.trim().slice(0, 80));
        });
      }
    }
    expect(
      offenders,
      '★ 行注释里出现块注释起始序列 —— 会把后续真实代码吞进块注释（历史上导致写工具登记凭空消失）:\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('★★ 结构性核验：WRITE_TOOLS 必须真的包含末尾那批写工具（防"注释吞代码"复发）', () => {
    const PERM = readFileSync(resolve(__dirname, '..', 'src', 'tool-permission.ts'), 'utf8');
    const code = stripCommentsOnly(PERM);
    const idx = code.indexOf('const WRITE_TOOLS');
    expect(idx, '★ 找不到 WRITE_TOOLS（剥注释后再切片失败）').toBeGreaterThan(-1);
    const end = code.indexOf('const UNCONTROLLABLE_PREFIXES');
    expect(end, '★ 找不到 UNCONTROLLABLE_PREFIXES（切片终点缺失）').toBeGreaterThan(idx);
    const ws = code.slice(idx, end);
    for (const t of [
      'api_conversation_setup', 'api_custom_tool_create', 'api_custom_tool_update',
      'api_custom_tool_delete', 'api_custom_tool_toggle', 'api_custom_tool_execute',
      'api_space_memory_append', 'api_experience_write', 'api_message_send',
    ]) {
      expect(ws, '★ WRITE_TOOLS 切片里找不到 ' + t + ' —— 写工具登记被注释地雷吃掉了').toContain(t);
    }
  });
});