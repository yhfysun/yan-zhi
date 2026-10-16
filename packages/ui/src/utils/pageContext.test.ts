// 页面内对话「页面上下文采集」的守门测试（P0）。
//
// 为什么要有（都是静默失效，用户看不出来）：
//   ① 上下文被整段灌进 prompt：整页几千字进 token，轻问答变贵 —— 上限必须真生效；
//   ② 读取失败被当成"页面是空的"：模型据此回答"这页没有内容"，而其实是没读到 —— 必须如实标注；
//   ③ 执行面口径没写进提示词：模型会新开标签页/传 tabId（page 空间的 tab 永不被认领，传了必被拒）
//      → "点第一条热搜"点到别的页上且**不报错**（本仓反复栽过的一类）。

import { afterEach, describe, it, expect } from 'vitest';
import {
  PAGE_CTX_SELECTION_LIMIT, PAGE_CTX_TEXT_LIMIT, buildPageTaskPrompt, collectPageContext,
  emptyContext, hostOf, isRealPageUrl, truncate,
} from './pageContext';

const originalWindow = (globalThis as any).window;
afterEach(() => { (globalThis as any).window = originalWindow; });

describe('truncate / hostOf / isRealPageUrl', () => {
  it('truncate：未超限原样返回，超限截断并标注原长', () => {
    expect(truncate('abc', 10)).toBe('abc');
    const long = 'x'.repeat(25);
    const out = truncate(long, 10);
    expect(out.startsWith('x'.repeat(10))).toBe(true);
    expect(out).toContain('原长 25 字');
  });

  it('hostOf：合法 URL 取 host，垃圾输入返回空串（绝不抛）', () => {
    expect(hostOf('https://www.baidu.com/s?wd=1')).toBe('www.baidu.com');
    expect(hostOf('not a url')).toBe('');
    expect(hostOf('')).toBe('');
  });

  it('isRealPageUrl：只有 http(s) 算"有页面"', () => {
    expect(isRealPageUrl('https://www.baidu.com')).toBe(true);
    expect(isRealPageUrl('http://127.0.0.1:5173/x')).toBe(true);
    expect(isRealPageUrl('about:blank')).toBe(false);
    expect(isRealPageUrl('')).toBe(false);
  });
});

describe('★ buildPageTaskPrompt：上下文 + 执行面口径', () => {
  const base = {
    ...emptyContext('https://www.baidu.com/', '百度一下，你就知道'),
    visibleText: '百度热搜：1 长征三问 2 存款利率',
    selection: '长征三问',
  };

  it('带上页面标题/地址/站点与可见文本、选中文字', () => {
    const p = buildPageTaskPrompt({ question: '第一条热搜是什么？', ctx: base });
    expect(p).toContain('百度一下，你就知道');
    expect(p).toContain('https://www.baidu.com/');
    expect(p).toContain('www.baidu.com');
    expect(p).toContain('百度热搜：1 长征三问');
    expect(p).toContain('长征三问');
    expect(p).toContain('第一条热搜是什么？');
  });

  it('可见文本按 PAGE_CTX_TEXT_LIMIT 截断（轻问答不为整页 token 买单）', () => {
    const p = buildPageTaskPrompt({ question: 'q', ctx: { ...base, visibleText: 'y'.repeat(PAGE_CTX_TEXT_LIMIT + 500) } });
    expect(p).toContain(`原长 ${PAGE_CTX_TEXT_LIMIT + 500} 字`);
    // 正文注入体积不超过上限 + 少量标记文字
    expect(p.length).toBeLessThan(PAGE_CTX_TEXT_LIMIT + PAGE_CTX_SELECTION_LIMIT + 1200);
  });

  it('★ 执行面口径逐条写进提示词（否则模型会新开页/传 tabId，且不报错）', () => {
    const p = buildPageTaskPrompt({ question: 'q', ctx: base });
    expect(p).toMatch(/不要新开标签页/);
    expect(p).toMatch(/不要传 tabId/);
    expect(p).toMatch(/browser_navigate/);      // 未绑定时的建锚办法
    expect(p).toMatch(/同一个地址/);
  });

  it('★ 读取失败如实告知（不假装页面为空）', () => {
    const p = buildPageTaskPrompt({ question: 'q', ctx: { ...emptyContext('https://x.com', 'X'), readFailed: true } });
    expect(p).toMatch(/读取失败/);
    expect(p).not.toMatch(/页面可见文本（宿主已抓取/);
  });

  it('没有可见文本也没有选区时，不产生空标题块', () => {
    const p = buildPageTaskPrompt({ question: 'q', ctx: emptyContext('https://x.com', 'X') });
    expect(p).not.toContain('【页面可见文本');
    expect(p).not.toContain('【用户在这页上选中的文字】');
  });
});

describe('★ collectPageContext：渲染层直读 + 失败降级', () => {
  it('Electron 端：读回选区与正文并落上限', async () => {
    const calls: any[] = [];
    (globalThis as any).window = {
      electronAPI: {
        browserView: {
          action: async (tabId: string, action: string, args: any) => {
            calls.push({ tabId, action, args });
            return { url: 'https://www.baidu.com/', result: { selection: '选中', text: 'z'.repeat(PAGE_CTX_TEXT_LIMIT + 20) } };
          },
        },
      },
    };
    const ctx = await collectPageContext('tab-1', { url: 'https://www.baidu.com/', title: '百度' });
    expect(calls[0]).toMatchObject({ tabId: 'tab-1', action: 'run_script' });
    expect(ctx.visibleText).toContain('原长');            // 超限已截断
    expect(ctx.selection).toBe('选中');
    expect(ctx.host).toBe('www.baidu.com');
    expect(ctx.readFailed).toBe(false);
  });

  it('读取失败（脚本报错）→ readFailed=true，不抛异常', async () => {
    (globalThis as any).window = { electronAPI: { browserView: { action: async () => ({ error: 'script 执行超时' }) } } };
    const ctx = await collectPageContext('tab-1', { url: 'https://x.com', title: 'X' });
    expect(ctx.readFailed).toBe(true);
    expect(ctx.visibleText).toBe('');
    expect(ctx.url).toBe('https://x.com');   // L0 仍在
  });

  it('非 Electron 端（无 electronAPI）→ 降级为只有 L0，仍可用于纯问答', async () => {
    (globalThis as any).window = {};
    const ctx = await collectPageContext('tab-1', { url: 'https://x.com', title: 'X' });
    expect(ctx).toMatchObject({ url: 'https://x.com', title: 'X', visibleText: '', readFailed: true });
  });

  it('起始主页/about:blank：**不读也不报失败**（本来就没有正文）', async () => {
    let called = 0;
    (globalThis as any).window = { electronAPI: { browserView: { action: async () => { called += 1; return { result: {} }; } } } };
    const ctx = await collectPageContext('tab-1', { url: '', title: '' });
    expect(called).toBe(0);
    expect(ctx.readFailed).toBe(false);
  });
});
