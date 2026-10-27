// run_script 语义熔断（服务端 Playwright 链路）单测 —— 与桌面端 main.cjs 同一判据
import { describe, it, expect } from 'vitest';
import { fuseNormUrl, scriptFuseCheck, scriptFuseKey } from '../src/services/script-fuse.js';

const PAGE = 'https://creator.douyin.com/creator-micro/content/post/video?mid=7700959060102794505&enter_from=edit_item';
const SEL = 'div[data-slate-editor="true"]';

const destructive = (topic: string, log = '') =>
  `const ed=document.querySelector('${SEL}');`
  + `ed.focus();document.execCommand('delete');`
  + `document.execCommand('insertText',false,'#${topic}');`
  + (log ? `log.push('${log}');` : '');

describe('script-fuse', () => {
  it('只读脚本不参与熔断', () => {
    const st = new Map();
    const read = `return document.querySelector('${SEL}').innerText;`;
    expect(scriptFuseKey(read)).toBeNull();
    for (let i = 0; i < 10; i++) expect(scriptFuseCheck(read, PAGE, st).blocked).toBe(false);
  });

  it('光标定位（selectNodeContents 建 Range + 插入）不算破坏性脚本', () => {
    const s = `const ed=document.querySelector('${SEL}');`
      + "const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);"
      + "const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);"
      + "document.execCommand('insertText',false,'#');";
    expect(scriptFuseKey(s)).toBeNull();
    const st = new Map();
    for (let i = 0; i < 5; i++) expect(scriptFuseCheck(s, PAGE, st).blocked).toBe(false);
  });

  it('同目标同载荷：第 2 次拒绝', () => {
    const st = new Map();
    expect(scriptFuseCheck(destructive('周报'), PAGE, st).blocked).toBe(false);
    const r = scriptFuseCheck(destructive('周报'), PAGE, st);
    expect(r.blocked).toBe(true);
    expect(r.message).toContain('同一编辑目标');
  });

  it('换 log / 加等待不能绕过', () => {
    const st = new Map();
    scriptFuseCheck(destructive('周报', '第一版日志文案很长，超过二十个字符就会被排除在载荷之外'), PAGE, st);
    const r = scriptFuseCheck(
      destructive('周报', '第二版日志换了措辞与标点，同样超过二十个字符不应影响指纹') + 'await sleep(300);',
      PAGE,
      st,
    );
    expect(r.blocked).toBe(true);
  });

  it('同目标换文案：第 4 次拒绝', () => {
    const st = new Map();
    expect(scriptFuseCheck(destructive('周报'), PAGE, st).blocked).toBe(false);
    expect(scriptFuseCheck(destructive('Excel技巧'), PAGE, st).blocked).toBe(false);
    expect(scriptFuseCheck(destructive('职场'), PAGE, st).blocked).toBe(false);
    expect(scriptFuseCheck(destructive('打工人'), PAGE, st).blocked).toBe(true);
  });

  it('&t=2 不能重置计数', () => {
    const st = new Map();
    scriptFuseCheck(destructive('周报'), PAGE, st);
    expect(scriptFuseCheck(destructive('周报'), PAGE + '&t=2', st).blocked).toBe(true);
    expect(fuseNormUrl(PAGE + '&t=2&_t=9')).toBe(fuseNormUrl(PAGE));
  });

  it('不同作品各自计数', () => {
    const st = new Map();
    const other = PAGE.replace('7700959060102794505', '7700901457016425754');
    scriptFuseCheck(destructive('周报'), PAGE, st);
    expect(scriptFuseCheck(destructive('周报'), other, st).blocked).toBe(false);
  });
});
