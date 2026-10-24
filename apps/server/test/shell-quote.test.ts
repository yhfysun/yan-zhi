import { describe, expect, it } from 'vitest';
import { quoteCmdArg, quoteArgsForWindowsShell } from '../src/services/shell-quote.js';

/**
 * Windows shell:true 参数转义（2026-10-24）。
 *
 * 背景：spawn(..., {shell:true}) 只拼接不转义，工作目录带空格时参数被拆碎 ——
 * 实测后台启动器收到 `--job-dir C:\...\yz` 和未知参数 `job`/`test`，直接 exit 2。
 */
describe('quoteCmdArg', () => {
  it('无空白/元字符 → 原样返回', () => {
    expect(quoteCmdArg('python')).toBe('python');
    expect(quoteCmdArg('C:\\tools\\ffmpeg.exe')).toBe('C:\\tools\\ffmpeg.exe');
    expect(quoteCmdArg('--job-dir')).toBe('--job-dir');
  });

  it('★ 含空格路径 → 包引号（这是拆参数的根因）', () => {
    expect(quoteCmdArg('C:\\Users\\me\\Desktop\\小说 推文'))
      .toBe('"C:\\Users\\me\\Desktop\\小说 推文"');
  });

  it('空串 → 空引号（否则 cmd 会把这个参数吞掉）', () => {
    expect(quoteCmdArg('')).toBe('""');
  });

  it('内部双引号转义', () => {
    expect(quoteCmdArg('say "hi" now')).toBe('"say \\"hi\\" now"');
  });

  it('结尾反斜杠加倍，避免吃掉收尾引号', () => {
    expect(quoteCmdArg('C:\\dir with space\\')).toBe('"C:\\dir with space\\\\"');
  });

  it('cmd 元字符（& | < > ( ) 等）也触发引号', () => {
    expect(quoteCmdArg('a&b')).toBe('"a&b"');
    expect(quoteCmdArg('a|b')).toBe('"a|b"');
  });

  it('批量转义保持顺序与长度', () => {
    const args = ['python', 'C:\\a b\\x.py', '--flag'];
    expect(quoteArgsForWindowsShell(args)).toEqual(['python', '"C:\\a b\\x.py"', '--flag']);
  });
});
