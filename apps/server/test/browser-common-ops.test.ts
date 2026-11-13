import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

let BrowserWaitForTool: any;
let BrowserWaitTool: any;
let BrowserNewTabTool: any;
let BrowserSwitchTabTool: any;
let BrowserGetTabsTool: any;
let BrowserPressKeyTool: any;
let BrowserClickTool: any;
let BrowserTypeTool: any;
let BrowserWaitForRequestTool: any;
let normalizeServerTabId: (value: unknown) => number | null;
let shouldActivateNewTab: (background: unknown) => boolean;
let waitForPageCondition: (
  page: any,
  condition: { selector?: string; url?: string; text?: string },
  timeoutMs: number,
) => Promise<any>;
let recordDownloadProgress: (rec: any, bytes: number, totalBytes: number, now?: number) => any;

beforeAll(async () => {
  const [core, route] = await Promise.all([
    import('../../../packages/core/src/tool/builtin/browser/index.js'),
    import('../src/routes/browser.js'),
  ]);
  BrowserWaitForTool = core.BrowserWaitForTool;
  BrowserWaitTool = core.BrowserWaitTool;
  BrowserNewTabTool = core.BrowserNewTabTool;
  BrowserSwitchTabTool = core.BrowserSwitchTabTool;
  BrowserGetTabsTool = core.BrowserGetTabsTool;
  BrowserPressKeyTool = core.BrowserPressKeyTool;
  BrowserClickTool = core.BrowserClickTool;
  BrowserTypeTool = core.BrowserTypeTool;
  BrowserWaitForRequestTool = core.BrowserWaitForRequestTool;
  normalizeServerTabId = route.normalizeServerTabId;
  shouldActivateNewTab = route.shouldActivateNewTab;
  waitForPageCondition = route.waitForPageCondition;
  recordDownloadProgress = route.recordDownloadProgress;
});

beforeEach(() => {
  mockFetch.mockReset();
});

describe('browser_wait_for 契约', () => {
  it('没有任何等待条件时直接报错，不再空等 10 秒后假装成功', async () => {
    const tool = new BrowserWaitForTool();
    const result = await tool.execute({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('selector');
    expect(result.content[0].text).toContain('browser_wait');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('timeout 在工具层夹到 1..30000ms，避免 IPC 被异常大值拖死', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { waited: 'text', text: '完成' } }),
    });

    const tool = new BrowserWaitForTool();
    await tool.execute({ text: '完成', timeout: 999_999 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.timeout).toBe(30000);
  });

  it('执行面返回等待超时时，工具必须返回 error，不能输出成功文案', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: 'timeout', error: '等待文本超时（5000ms）：完成' } }),
    });

    const tool = new BrowserWaitForTool();
    const result = await tool.execute({ text: '完成', timeout: 5000 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('等待文本超时');
  });

  it('服务端 URL 条件超时必须 reject，不能把超时包装成 waited=url', async () => {
    const page = {
      url: () => 'https://example.test/login',
      waitForFunction: vi.fn(async () => {
        throw new Error('Timeout 30000ms exceeded');
      }),
    };

    await expect(
      waitForPageCondition(page, { url: '/dashboard' }, 50),
    ).rejects.toThrow(/超时|Timeout/);
  });
});

describe('browser_wait 契约', () => {
  it('固定等待同样夹到 1..10000ms', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { waited: 10000 } }),
    });

    const tool = new BrowserWaitTool();
    await tool.execute({ timeout: 999_999 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.timeout).toBe(10000);
  });

  it('wait_for_request 同样夹到 1..30000ms', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { url: 'https://example.test/api', status: 200 } }),
    });
    const tool = new BrowserWaitForRequestTool();
    await tool.execute({ urlPattern: '/api', timeout: 999_999 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.timeout).toBe(30000);
  });
});

describe('大文件下载进度契约', () => {
  it('服务端记录已下载/总量/百分比/速度/ETA', () => {
    const rec = {
      bytes: 0,
      totalBytes: 0,
      startedAt: 0,
      updatedAt: 0,
      lastBytes: 0,
      lastSampleAt: 0,
      speedBps: 0,
      etaMs: null,
    };
    recordDownloadProgress(rec, 100, 1000, 1000);
    expect(rec.percent).toBe(10);
    expect(rec.speedBps).toBe(100);
    expect(rec.etaMs).toBe(9000);
    recordDownloadProgress(rec, 300, 1000, 2000);
    expect(rec.percent).toBe(30);
    expect(rec.speedBps).toBeGreaterThan(0);
    expect(rec.etaMs).toBeGreaterThan(0);
  });

  it('Playwright 保存阶段改用流式写入以持续更新进度', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/browser.ts'),
      'utf8',
    );
    const downloadListener = source.slice(
      source.indexOf("page.on('download'"),
      source.indexOf("// C5 网络请求完成事件"),
    );
    expect(downloadListener).toContain('createReadStream');
    expect(downloadListener).toContain('recordDownloadProgress');
    expect(downloadListener).toContain('downloadSizeHints');
    expect(downloadListener).toContain('await pipeline(stream, counter, fs.createWriteStream(savePath))');
    expect(downloadListener).toContain('await download.saveAs(savePath)'); // createReadStream 不可用时的兜底
    const downloadAction = source.slice(
      source.indexOf("case 'download': {"),
      source.indexOf("case 'downloads': {"),
    );
    expect(downloadAction).toContain('waitForDownloadStart(beforeDownload, 10000)');
    expect(downloadAction).toContain("status: 'progressing'");
  });
});

describe('200 + data.error 不能被工具层包装成成功', () => {
  it('switch_tab 目标不存在时返回 error', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { error: 'tabId 9 不存在' } }),
    });
    const result = await new BrowserSwitchTabTool().execute({ tabId: 9 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('不存在');
  });

  it('new_tab 执行面失败时不得输出“已打开”', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { error: '浏览器未就绪' } }),
    });
    const result = await new BrowserNewTabTool().execute({ url: 'https://example.test' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('未就绪');
  });

  it('get_tabs 返回错误时不得读取 tabs.length 后抛裸异常', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { error: '页面已关闭' } }),
    });
    const result = await new BrowserGetTabsTool().execute({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('页面已关闭');
  });

  it('press_key 执行面失败时返回 error', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { error: '无聚焦元素' } }),
    });
    const result = await new BrowserPressKeyTool().execute({ key: 'Enter' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('无聚焦元素');
  });

  it('click 的 not_found / stale_index / rejected 必须以 isError 返回', async () => {
    for (const data of [
      { status: 'not_found', error: '元素未找到' },
      { status: 'stale_index', error: 'index 已失效' },
      { status: 'rejected', error: '原生 checkbox 请用 fill_form' },
    ]) {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data }),
      });
      const result = await new BrowserClickTool().execute({ index: 1 });
      expect(result.isError, JSON.stringify(data)).toBe(true);
    }
  });

  it('type 的 stale_index / failed 必须以 isError 返回', async () => {
    for (const data of [
      { status: 'stale_index', error: 'index 已失效' },
      { status: 'failed', error: '输入未生效' },
    ]) {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data }),
      });
      const result = await new BrowserTypeTool().execute({ index: 1, text: '你好' });
      expect(result.isError, JSON.stringify(data)).toBe(true);
    }
  });
});

describe('服务端标签页 ID 契约', () => {
  it('兼容 number / numeric string / tab-N 三种写法', () => {
    expect(normalizeServerTabId(3)).toBe(3);
    expect(normalizeServerTabId('3')).toBe(3);
    expect(normalizeServerTabId('tab-3')).toBe(3);
    expect(normalizeServerTabId(' TAB-03 ')).toBe(3);
  });

  it('拒绝空值、负数和非 tab id', () => {
    for (const value of [null, undefined, '', 'tab-x', -1, '1.5']) {
      expect(normalizeServerTabId(value)).toBeNull();
    }
  });

  it('只有 background=true 才不抢当前活动页', () => {
    expect(shouldActivateNewTab(undefined)).toBe(true);
    expect(shouldActivateNewTab(false)).toBe(true);
    expect(shouldActivateNewTab(true)).toBe(false);
  });

  it('get_tabs 必须回传工具契约里的 tabId；new_tab 后台打开不得抢锚', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/browser.ts'),
      'utf8',
    );
    const getTabs = source.slice(
      source.indexOf("case 'get_tabs': {"),
      source.indexOf("// ========== C5", source.indexOf("case 'get_tabs': {")),
    );
    expect(getTabs).toMatch(/tabId:\s*tid/);
    const newTab = source.slice(
      source.indexOf("case 'new_tab': {"),
      source.indexOf("case 'switch_tab': {"),
    );
    expect(newTab).toMatch(/shouldActivateNewTab\(args\.background\)/);
    expect(newTab).toContain('pageInstance');
    expect(source).toContain('const reuseContext = reusePage?.context?.()');
  });

  it('click 触发 target=_blank/window.open 时，popup 必须登记为可读写的 tab', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/browser.ts'),
      'utf8',
    );
    expect(source).toContain("page.on('popup'");
    expect(source).toContain('registerServerTabPage');
    expect(source).toContain('openedTabs');
  });

  it('navigate 的显式 tabId 非法/不存在时不能静默回落当前页', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/routes/browser.ts'),
      'utf8',
    );
    const nav = source.slice(
      source.indexOf("router.post('/navigate'"),
      source.indexOf("router.post('/action'"),
    );
    expect(nav).toContain('normalizeServerTabId(tabId)');
    expect(nav).toContain('无效的 tabId');
    expect(nav).toContain('tabId ${tid} 不存在');
    expect(nav).not.toContain('Number(tabId)');
    const action = source.slice(
      source.indexOf("router.post('/action'"),
      source.indexOf("// 统一 click/type 结果结构"),
    );
    expect(action).toContain('无效的 tabId');
    expect(action).toContain('tabId ${reqTabId} 不存在');
    expect(action).toMatch(/else \{\s*page = await withTimeout\(getPage/);
  });
});
