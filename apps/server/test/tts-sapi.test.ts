/**
 * SAPI 语音合成脚本生成单测。
 *
 * 红线背景（本机真实踩坑）：PowerShell 对非 ASCII 内容的编码处理极易翻车
 * （中文路径 / 中文音色名写在脚本里 → 因编码错乱直接炸）。
 * 因此脚本本体强制纯 ASCII：文本经 UTF-8 临时文件传入、路径经 spawn 参数传入。
 * 这条防线一旦破防，中文环境用户的 TTS 会静默失败，所以用测试钉死。
 */
import { describe, it, expect } from 'vitest';
import { buildSapiScript } from '../src/mcp/tts-sapi';

describe('buildSapiScript · SAPI 脚本生成', () => {
  it('脚本本体必须纯 ASCII（PowerShell 编码陷阱）', () => {
    const s = buildSapiScript();
    expect(/^[\x00-\x7F]*$/.test(s)).toBe(true);
  });

  it('含关键语句：参数声明 / 落盘 / 朗读 / 释放', () => {
    const s = buildSapiScript();
    for (const k of ['param(', '$Text', 'SetOutputToWaveFile', '.Speak(', 'Dispose']) {
      expect(s).toContain(k);
    }
  });

  it('中文音色自动选择逻辑存在（zh 前缀匹配，选中失败不中断）', () => {
    const s = buildSapiScript();
    expect(s).toContain('-like "zh*"');
    expect(s).toContain('try { $s.SelectVoice');
  });

  it('语速与音色均为可选参数（留空走自动）', () => {
    const s = buildSapiScript();
    expect(s).toContain('[string]$Voice');
    expect(s).toContain('[int]$Rate');
    expect(s).toContain('if ($Voice -ne "")');
  });
});
