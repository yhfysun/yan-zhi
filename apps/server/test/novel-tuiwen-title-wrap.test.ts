import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 小说推文成片「顶部引导语自动两行 + 淡入」防回归测试。
 *
 * 背景（用户 2026-10-07 反馈）：视频顶部标题此前是**单行** drawtext，
 * 「搜「狐王痴狂」看全文｜打开番茄小说」这类长引导语在 1080 宽画面上会超宽/贴边。
 *
 * 修法：
 *   ① 新增 wrap_title()：按自然分隔处（｜|，,、空格）折成 ≤2 行，找不到就硬切；
 *   ② compose 里改用**按行链式 drawtext**（每行一个 filter、y 逐行下移），
 *      而不是 text_align / line_spacing —— 项目自带 ffmpeg 是 2019 版，实测不支持这两个
 *      选项（会报 Option not found）。这条是本轮踩过的坑，必须钉住；
 *   ③ 加 0.6s 淡入（alpha 表达式）。
 *
 * 验证方式：
 *   - 行为断言：用与 python `wrap_title` 等价的 JS 实现验证折行语义；
 *   - 结构断言：直接读 python 源码，钉死「渲染不含 text_align/line_spacing」「链式 drawtext」等不变量。
 */

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SRC = fs.readFileSync(
  path.join(REPO_ROOT, 'packages/core/src/tool/builtin/python-scripts/novel_tuiwen/compose_video.py'),
  'utf8',
);

/** 与 python wrap_title 等价的 JS 实现（语义镜像，用于行为断言） */
function wrapTitle(s: string, maxChars: number, maxLines = 2): string[] {
  const t = (s || '').trim().replace(/\\n/g, '\n');
  if (!t) return [''];
  const explicit = t.split('\n').map((x) => x.trim()).filter(Boolean);
  let lines: string[];
  if (explicit.length > 1) {
    lines = explicit.slice(0, maxLines);
  } else {
    const line = explicit[0];
    if (line.length <= maxChars) {
      lines = [line];
    } else {
      const mid = Math.floor(line.length / 2);
      let best = -1;
      for (const mt of line.matchAll(/[｜|，,、\s]/g)) {
        const idx = mt.index as number;
        if (idx <= maxChars && (best < 0 || Math.abs(idx - mid) < Math.abs(best - mid))) best = idx;
      }
      const cut = best > 0 ? best : maxChars;
      lines = [line.slice(0, cut).trim(), line.slice(cut).trim().replace(/^[｜|，,、 ]+/, '')];
    }
  }
  const out = lines.filter(Boolean).map((ln) => ln.slice(0, maxChars));
  return out.length ? out.slice(0, maxLines) : [''];
}

describe('novel_tuiwen 顶部引导语折行', () => {
  it('长引导语在 ｜ 分隔处折成两行（真实 banner 用例）', () => {
    expect(wrapTitle('搜「狐王痴狂」看全文｜打开番茄小说', 15)).toEqual(['搜「狐王痴狂」看全文', '打开番茄小说']);
  });

  it('短标题保持单行', () => {
    expect(wrapTitle('第2章 收银员员工须知', 15)).toEqual(['第2章 收银员员工须知']);
  });

  it('无分隔符的超长句按 max_chars 硬切', () => {
    const r = wrapTitle('这是一句没有任何分隔符的超长引导语需要硬切', 12);
    expect(r.length).toBe(2);
    for (const ln of r) expect(ln.length).toBeLessThanOrEqual(12);
  });

  it('banner 里显式换行优先（按行拆，最多 2 行）', () => {
    expect(wrapTitle('第一行内容\n第二行内容', 20)).toEqual(['第一行内容', '第二行内容']);
  });

  it('每行都不超过 max_chars', () => {
    for (const w of [6, 10, 15, 20]) {
      const r = wrapTitle('搜「狐王痴狂」看全文｜打开番茄小说更精彩', w);
      for (const ln of r) expect(ln.length).toBeLessThanOrEqual(w);
    }
  });
});

describe('compose_video.py 标题渲染实现不变量', () => {
  it('★ 标题渲染不得使用 text_align（2019 版 ffmpeg 实测不支持 → Option not found）', () => {
    // 只检查代码行（注释里会提到这个词）
    const codeOnly = SRC.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(codeOnly).not.toMatch(/text_align\s*=/);
  });

  it('用按行链式 drawtext 实现多行（title_vf 由多个 drawtext 段 join）', () => {
    expect(SRC).toContain('title_vf = ",".join(_parts)');
    expect(SRC).toMatch(/y=\{80 \+ _i \* _line_step\}/);
  });

  it('带 0.6s 淡入（alpha 表达式）', () => {
    expect(SRC).toContain("alpha='if(lt(t,0.6),t/0.6,1)'");
  });

  it('wrap_title 保留「显式换行优先 + 自然分隔折行 + 硬切兜底」三条规则', () => {
    const fn = SRC.match(/def wrap_title[\s\S]*?\n(?=def )/)?.[0] || '';
    expect(fn).toMatch(/split\("\\n"\)/); // 显式换行
    expect(fn).toMatch(/finditer\(r"\[｜\|，,、\\s\]"/); // 自然分隔
    expect(fn).toMatch(/cut = best if best > 0 else max_chars/); // 硬切兜底
  });
});