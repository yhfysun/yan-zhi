// 浏览器自动化内置工具集 —— 调用服务端 /api/browser/* 端点（Playwright）
// 包含：navigate / click / type / press_key / scroll / hover / get_text / get_dom / wait / screenshot
import type { BuiltInTool } from '../../types';
import type { McpCallResult } from '../../../mcp/client';

/** 获取 auth token（浏览器/web/桌面端均可访问 localStorage） */
function getAuthToken(): string | null {
  try { return localStorage.getItem('auth_token'); } catch { return null; }
}

/** 调用浏览器 API 端点 */
async function callBrowserApi(path: string, method: 'GET' | 'POST' = 'POST', body?: unknown): Promise<unknown> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch('/api/browser' + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || json.error) {
    throw new Error(json.error || `请求失败 (${res.status})`);
  }
  return json.data ?? json;
}

function ok(text: string): McpCallResult {
  return { content: [{ type: 'text', text }] };
}
function err(msg: string): McpCallResult {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

// ========== 导航 ==========
export class BrowserNavigateTool implements BuiltInTool {
  name = 'browser_navigate';
  description = 'Navigate the built-in browser to a URL. Opens a visible browser window.';
  inputSchema = {
    type: 'object',
    properties: { url: { type: 'string', description: 'The URL to navigate to.' } },
    required: ['url'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const url = args.url as string;
      if (!url) return err('url is required');
      const data = await callBrowserApi('/navigate', 'POST', { url }) as any;
      return ok(`Navigated to ${data.url}\nTitle: ${data.title}`);
    } catch (e: any) { return err(e?.message || '导航失败'); }
  }
}

// ========== 点击 ==========
export class BrowserClickTool implements BuiltInTool {
  name = 'browser_click';
  description = 'Click an element in the browser by CSS selector or coordinates. Uses real mouse movement.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the element to click.' },
      x: { type: 'number', description: 'X coordinate (if no selector).' },
      y: { type: 'number', description: 'Y coordinate (if no selector).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      await callBrowserApi('/action', 'POST', { action: 'click', selector: args.selector, x: args.x, y: args.y });
      return ok(`Clicked ${args.selector || `(${args.x}, ${args.y})`}`);
    } catch (e: any) { return err(e?.message || '点击失败'); }
  }
}

// ========== 输入文本 ==========
export class BrowserTypeTool implements BuiltInTool {
  name = 'browser_type';
  description = 'Type text into a focused element or element by selector. Uses real keyboard input (per-character).';
  inputSchema = {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text to type.' },
      selector: { type: 'string', description: 'CSS selector to focus before typing (optional).' },
    },
    required: ['text'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const text = args.text as string;
      if (!text) return err('text is required');
      await callBrowserApi('/action', 'POST', { action: 'type', selector: args.selector, text });
      return ok(`Typed ${text.length} characters${args.selector ? ' into ' + args.selector : ''}`);
    } catch (e: any) { return err(e?.message || '输入失败'); }
  }
}

// ========== 按键 ==========
export class BrowserPressKeyTool implements BuiltInTool {
  name = 'browser_press_key';
  description = 'Press a keyboard key (e.g. Enter, Tab, Escape). Uses real keyboard input.';
  inputSchema = {
    type: 'object',
    properties: { key: { type: 'string', description: 'Key name: Enter, Tab, Escape, ArrowDown, etc.' } },
    required: ['key'],
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const key = args.key as string;
      if (!key) return err('key is required');
      await callBrowserApi('/action', 'POST', { action: 'press', key });
      return ok(`Pressed key: ${key}`);
    } catch (e: any) { return err(e?.message || '按键失败'); }
  }
}

// ========== 滚动 ==========
export class BrowserScrollTool implements BuiltInTool {
  name = 'browser_scroll';
  description = 'Scroll the browser page or a specific element into view.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector to scroll into view (optional).' },
      x: { type: 'number', description: 'Horizontal scroll delta (default 0).' },
      y: { type: 'number', description: 'Vertical scroll delta (default 300).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      await callBrowserApi('/action', 'POST', { action: 'scroll', selector: args.selector, x: args.x, y: args.y });
      return ok(`Scrolled ${args.selector ? 'to ' + args.selector : `by (${args.x || 0}, ${args.y || 300})`}`);
    } catch (e: any) { return err(e?.message || '滚动失败'); }
  }
}

// ========== 悬停 ==========
export class BrowserHoverTool implements BuiltInTool {
  name = 'browser_hover';
  description = 'Hover over an element by selector or coordinates. Uses real mouse movement.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of the element to hover.' },
      x: { type: 'number', description: 'X coordinate (if no selector).' },
      y: { type: 'number', description: 'Y coordinate (if no selector).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      await callBrowserApi('/action', 'POST', { action: 'hover', selector: args.selector, x: args.x, y: args.y });
      return ok(`Hovered ${args.selector || `(${args.x}, ${args.y})`}`);
    } catch (e: any) { return err(e?.message || '悬停失败'); }
  }
}

// ========== 获取文本 ==========
export class BrowserGetTextTool implements BuiltInTool {
  name = 'browser_get_text';
  description = 'Get text content of an element by selector, or the entire page HTML.';
  inputSchema = {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector to get text from (omit for full page content).' },
    },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'get_text', selector: args.selector });
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      return ok(text.slice(0, 8000));
    } catch (e: any) { return err(e?.message || '获取文本失败'); }
  }
}

// ========== 获取 DOM ==========
export class BrowserGetDomTool implements BuiltInTool {
  name = 'browser_get_dom';
  description = 'Get a summary of the current page DOM structure (preview, truncated).';
  inputSchema = { type: 'object', properties: {} };
  async execute(): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'get_dom' }) as any;
      return ok(`DOM length: ${data.length}\nPreview:\n${data.preview}`);
    } catch (e: any) { return err(e?.message || '获取 DOM 失败'); }
  }
}

// ========== 等待 ==========
export class BrowserWaitTool implements BuiltInTool {
  name = 'browser_wait';
  description = 'Wait for a specified duration (milliseconds, max 10000).';
  inputSchema = {
    type: 'object',
    properties: { timeout: { type: 'number', description: 'Duration in milliseconds (default 1000, max 10000).' } },
  };
  async execute(args: Record<string, unknown>): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'wait', timeout: args.timeout }) as any;
      return ok(`Waited ${data.waited}ms`);
    } catch (e: any) { return err(e?.message || '等待失败'); }
  }
}

// ========== 截图 ==========
export class BrowserScreenshotTool implements BuiltInTool {
  name = 'browser_screenshot';
  description = 'Take a screenshot of the current browser page. Returns base64 image data.';
  inputSchema = { type: 'object', properties: {} };
  async execute(): Promise<McpCallResult> {
    try {
      const data = await callBrowserApi('/action', 'POST', { action: 'screenshot' }) as any;
      return ok(`Screenshot captured (${(data.base64 || '').length} bytes base64)`);
    } catch (e: any) { return err(e?.message || '截图失败'); }
  }
}

/** 所有浏览器工具类列表 */
export const BrowserToolClasses = [
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserPressKeyTool,
  BrowserScrollTool,
  BrowserHoverTool,
  BrowserGetTextTool,
  BrowserGetDomTool,
  BrowserWaitTool,
  BrowserScreenshotTool,
];

/** 所有浏览器工具的暴露名（裸名） */
export const BROWSER_TOOL_NAMES = [
  'browser_navigate', 'browser_click', 'browser_type', 'browser_press_key',
  'browser_scroll', 'browser_hover', 'browser_get_text', 'browser_get_dom',
  'browser_wait', 'browser_screenshot',
];
