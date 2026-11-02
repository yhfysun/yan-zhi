/**
 * 报告导出（P3）：markdown 直接返回 base64；非法格式 400。
 * Word/PDF 分支依赖随包 Python/doyz，不在单测里跑。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { secLabModule } from '../src/plugins/sec-lab.js';

function setup() {
  const store = new Map<string, unknown>();
  let mount: ((app: any) => void) | null = null;
  const ctx = {
    storage: {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => { store.set(k, v); },
      delete: async (k: string) => { store.delete(k); },
    },
    registerTool: () => {},
    registerBackendRoute: (fn: any) => { mount = fn; },
    log: () => {},
  };
  const routes: Record<string, (req: any, res: any) => any> = {};
  const def = (m: string) => (p: string, h: any) => { routes[`${m} ${p}`] = h; };
  return { ctx, routes, app: { get: def('GET'), post: def('POST'), put: def('PUT'), delete: def('DELETE') }, mount: () => mount };
}

function res() {
  const r: any = { code: 200, body: null, status(c: number) { r.code = c; return r; }, json(d: any) { r.body = d; return r; } };
  return r;
}

let routes: Record<string, (req: any, res: any) => any>;

beforeEach(async () => {
  const { ctx, routes: r, app, mount } = setup();
  await secLabModule.activate(ctx as any);
  mount()!(app);
  routes = r;
});

describe('报告导出 · markdown', () => {
  it('返回 base64 + 文件名 + 计数', async () => {
    const out = res();
    await routes['POST /report/export']({ body: { format: 'markdown' } }, out);
    expect(out.code).toBe(200);
    expect(out.body.data.filename).toMatch(/\.md$/);
    expect(out.body.data.mimeType).toBe('text/markdown');
    const text = Buffer.from(out.body.data.base64, 'base64').toString('utf8');
    expect(text).toContain('安全');
    expect(typeof out.body.data.count).toBe('number');
  });

  it('非法格式明确报错', async () => {
    const out = res();
    await routes['POST /report/export']({ body: { format: 'exe' } }, out);
    expect(out.code).toBe(400);
    expect(out.body.error).toContain('docx / pdf / markdown');
  });

  it('未知作业 id：404 风格可读错误', async () => {
    const out = res();
    await routes['POST /report/export']({ body: { format: 'markdown', jobId: 'nope' } }, out);
    expect(out.code).toBe(400);
    expect(out.body.error).toContain('未找到作业');
  });
});
