import { describe, it, expect } from 'vitest';
import hljs from './highlight';

describe('highlight 按需注册', () => {
  it('常用语言已注册并可用别名', () => {
    expect(hljs.getLanguage('typescript')).toBeTruthy();
    expect(hljs.getLanguage('js')).toBeTruthy();
    // jsx/tsx 是 javascript/typescript 语言定义自带的别名
    expect(hljs.getLanguage('jsx')).toBeTruthy();
    expect(hljs.getLanguage('tsx')).toBeTruthy();
  });

  it('未注册语言返回 undefined，调用方走转义兜底', () => {
    expect(hljs.getLanguage('not-a-real-language')).toBeUndefined();
  });

  it('高亮输出包含 token 标记', () => {
    const out = hljs.highlight('const a = 1;', { language: 'typescript' }).value;
    expect(out).toContain('hljs-keyword');
  });
});
