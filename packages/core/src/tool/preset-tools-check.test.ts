// 回归测试：db.ts 预置自定义工具（seedCustomTools）的代码在 runInSandbox 里真实可用。
// 注意：此处代码与 db.ts seed 为同源拷贝——若修改 seed 工具代码，请同步更新本文件。
import { describe, it, expect } from 'vitest';
import { runInSandbox } from './sandbox';

const textStats = `function textStats(input) {
  var text = String(input && input.text || '');
  var words = text.split(/\\s+/).filter(function (w) { return w.length > 0; });
  var lines = text.split(/\\r?\\n/);
  var nonBlank = text.replace(/\\s/g, '');
  return { chars: text.length, words: words.length, lines: lines.length, nonBlankChars: nonBlank.length };
}`;

const jsonExtract = `function jsonExtract(input) {
  var cur = input && input.data;
  var parts = String(input && input.path || '').split('.').filter(function (p) { return p.length > 0; });
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return null;
    cur = cur[parts[i]];
  }
  return cur === undefined ? null : cur;
}`;

const timestampConvert = `function timestampConvert(input) {
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function fmt(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' '
      + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  if (input && input.timestamp !== undefined && input.timestamp !== null && input.timestamp !== '') {
    var ms = Number(input.timestamp);
    if (isNaN(ms)) return { error: 'timestamp 不是有效数字' };
    return { date: fmt(new Date(ms)), timestamp: ms };
  }
  if (input && input.dateStr) {
    var s = String(input.dateStr).replace(/-/g, '/').replace('T', ' ');
    var t = new Date(s).getTime();
    if (isNaN(t)) return { error: '无法解析日期字符串: ' + input.dateStr };
    return { date: fmt(new Date(t)), timestamp: t };
  }
  return { error: '需提供 timestamp 或 dateStr 之一' };
}`;

const regexTest = `function regexTest(input) {
  var pattern = String(input && input.pattern || '');
  var flags = String((input && input.flags) || 'g');
  if (flags.indexOf('g') === -1) flags += 'g';
  var text = String((input && input.text) || '');
  var re;
  try { re = new RegExp(pattern, flags); } catch (e) { return { error: '正则无效: ' + e.message }; }
  var out = [], m;
  while ((m = re.exec(text)) !== null) {
    out.push({ match: m[0], index: m.index, groups: m.slice(1) });
    if (out.length >= 50) break;
    if (m[0].length === 0) re.lastIndex++;
  }
  return { count: out.length, matches: out };
}`;

const unitConvert = `function unitConvert(input) {
  var v = Number(input && input.value);
  var from = String((input && input.from) || '').toLowerCase();
  var to = String((input && input.to) || '').toLowerCase();
  if (isNaN(v)) return { error: 'value 不是有效数字' };
  var toBase = {
    m: 1, km: 1000, cm: 0.01, mm: 0.001, ft: 0.3048, mi: 1609.344, inch: 0.0254,
  };
  var weightBase = { kg: 1, g: 0.001, mg: 0.000001, t: 1000, lb: 0.45359237, oz: 0.028349523 };
  var temps = { c: 1, f: 1, k: 1 };
  function toC(x, u) {
    if (u === 'c') return x;
    if (u === 'f') return (x - 32) * 5 / 9;
    if (u === 'k') return x - 273.15;
    return NaN;
  }
  function fromC(x, u) {
    if (u === 'c') return x;
    if (u === 'f') return x * 9 / 5 + 32;
    if (u === 'k') return x + 273.15;
    return NaN;
  }
  var result;
  if (toBase[from] !== undefined && toBase[to] !== undefined) {
    result = v * toBase[from] / toBase[to];
  } else if (weightBase[from] !== undefined && weightBase[to] !== undefined) {
    result = v * weightBase[from] / weightBase[to];
  } else if (temps[from] !== undefined && temps[to] !== undefined) {
    result = fromC(toC(v, from), to);
  } else {
    return { error: '不支持的单位组合: ' + from + ' -> ' + to };
  }
  return { value: v, from: from, to: to, result: Math.round(result * 1e6) / 1e6 };
}`;

describe('预置自定义工具（db.ts seed 同款代码）沙箱实测', () => {
  it('text_stats', async () => {
    const r = await runInSandbox(textStats, 'textStats', { text: 'hello world\nfoo bar' }, { timeout: 3000 });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(String(r.content[0].text))).toEqual({ chars: 19, words: 4, lines: 2, nonBlankChars: 16 });
  });

  it('json_extract', async () => {
    const r = await runInSandbox(jsonExtract, 'jsonExtract', { data: { user: { tags: ['a', 'b'], name: 'yz' } }, path: 'user.tags.1' }, { timeout: 3000 });
    expect(r.isError).toBeFalsy();
    expect(String(r.content[0].text)).toBe('b');
  });

  it('timestamp_convert 双向', async () => {
    const r1 = await runInSandbox(timestampConvert, 'timestampConvert', { timestamp: 1785988800000 }, { timeout: 3000 });
    const d1 = JSON.parse(String(r1.content[0].text));
    expect(d1.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    const r2 = await runInSandbox(timestampConvert, 'timestampConvert', { dateStr: '2026-09-05 20:00:00' }, { timeout: 3000 });
    const d2 = JSON.parse(String(r2.content[0].text));
    expect(d2.timestamp).toBeGreaterThan(1.7e12);
  });

  it('regex_test 含捕获组', async () => {
    const r = await runInSandbox(regexTest, 'regexTest', { pattern: '(\\w+)@(\\w+)', text: 'a@b c@d' }, { timeout: 3000 });
    const d = JSON.parse(String(r.content[0].text));
    expect(d.count).toBe(2);
    expect(d.matches[0].groups).toEqual(['a', 'b']);
  });

  it('unit_convert 三类单位', async () => {
    const km2mi = JSON.parse(String((await runInSandbox(unitConvert, 'unitConvert', { value: 100, from: 'km', to: 'mi' }, { timeout: 3000 })).content[0].text));
    expect(km2mi.result).toBeCloseTo(62.1371, 3);
    const c2f = JSON.parse(String((await runInSandbox(unitConvert, 'unitConvert', { value: 100, from: 'c', to: 'f' }, { timeout: 3000 })).content[0].text));
    expect(c2f.result).toBe(212);
    const kg2lb = JSON.parse(String((await runInSandbox(unitConvert, 'unitConvert', { value: 1, from: 'kg', to: 'lb' }, { timeout: 3000 })).content[0].text));
    expect(kg2lb.result).toBeCloseTo(2.204622, 5);
  });
});
