// 实况条「正在做什么」标签的守门测试。
//
// 背景（2026-10-24）：接入 AgentScope 客户端的活动标签交互 —— 状态条显示
// 「正在点击「发布」」而不是永远「执行中」。标签由工具名 + 参数在入栈时算好，
// 所以这里的断言就是"用户会看到的那句话"。

import { describe, it, expect } from 'vitest';
import { describeBrowserAction } from './browser-step-label';

describe('describeBrowserAction', () => {
  it('导航只显示主机名，不把整条 URL 糊在状态条上', () => {
    expect(describeBrowserAction('browser_navigate', { url: 'https://creator.douyin.com/creator-micro/home?x=1' }))
      .toBe('打开 creator.douyin.com');
    expect(describeBrowserAction('browser_navigate', { url: 'baidu.com/s?wd=x' })).toBe('打开 baidu.com');
    expect(describeBrowserAction('browser_navigate', {})).toBe('打开网页');
  });

  it('点击优先用可读文案，退化到 selector / index', () => {
    expect(describeBrowserAction('browser_click', { text: '发布' })).toBe('点击「发布」');
    expect(describeBrowserAction('browser_click', { selector: '#submit-btn' })).toBe('点击「#submit-btn」');
    expect(describeBrowserAction('browser_click', { index: 12 })).toBe('点击「12」');
    expect(describeBrowserAction('browser_click', {})).toBe('点击');
  });

  it('输入把长文本截断（状态条不换行）', () => {
    const long = '这是一个特别特别特别长的标题文本内容示例';
    const label = describeBrowserAction('browser_type', { text: long });
    expect(label.startsWith('输入「')).toBe(true);
    expect(label).toContain('…');
    expect(label.length).toBeLessThanOrEqual(22);
  });

  it('批量填表给出条数，其余动作各有专属动词', () => {
    expect(describeBrowserAction('browser_fill_form', { fields: [{}, {}, {}] })).toBe('填写表单 3 项');
    expect(describeBrowserAction('browser_scroll', { dy: -300 })).toBe('滚动↑');
    expect(describeBrowserAction('browser_scroll', { dy: 300 })).toBe('滚动↓');
    expect(describeBrowserAction('browser_press_key', { key: 'Enter' })).toBe('按键 Enter');
    expect(describeBrowserAction('browser_wait_for', { seconds: 3 })).toBe('等待 3s');
    expect(describeBrowserAction('browser_upload', {})).toBe('上传文件');
    expect(describeBrowserAction('browser_get_page_info', {})).toBe('读取页面');
  });

  it('内部动作名带后缀也能识别；未知工具退化成通用文案且不抛错', () => {
    expect(describeBrowserAction('browser_navigate(openInNewTab)', { url: 'https://a.com/x' })).toBe('打开 a.com');
    expect(describeBrowserAction('browser_some_new_tool', null)).toBe('浏览器操作');
    expect(describeBrowserAction('', undefined)).toBe('浏览器操作');
  });
});
