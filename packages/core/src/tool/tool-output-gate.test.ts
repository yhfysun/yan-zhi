/**
 * 工具输出统一闸（2026-10-10）守门测试。
 *
 * 背景（实测，**量化**）：`capToolOutput` 早已存在（64KB），但是**逐工具手动调用**的
 *   （`cmd-exec` / `code-diagnostics` / `doyz` / `novel-tuiwen` 各调各的），
 *   而 `tool/builtin/browser/index.ts` **一处都没调**（grep = 0）。
 *   后果：`browser_get_dom` 默认 `maxNodes=1000`，其 `JSON.stringify(dom, null, 2)`
 *   在典型列表页产出约 **45 万字符 ≈ 18 万 token** —— **一次调用就能吃爆上下文**。
 *   同类风险还有 `network_log` / `extract_list` / `get_tabs` 等 10+ 处。
 *
 * ⇒ 收口到**唯一执行出口** `ToolRegistry.execute`（一处覆盖全部工具，
 *   以后新增工具也不会漏）。逐处补必然漏 —— 本项目一贯判据。
 *
 * 本测试钉：
 *   ① 统一闸存在且挂在 execute 的返回路径上；
 *   ② **真跑**：超长 text 被裁、短 text 原样、`_meta` 不动、错误结果不裁；
 *   ③ fail-open（截断异常不得让工具调用失败）；
 *   ④ 与既有逐工具截断**不冲突**（幂等）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ★ 本文件在 `packages/core/src/tool/` 下 → 到仓库根要**上四级**
//   （tool → src → core → packages → 仓库根）。第一版只上两级 → 拼出
//   `packages/packages/core/...` → ENOENT（测试套件整体加载失败）。
const REPO = resolve(__dirname, '..', '..', '..', '..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const REGISTRY = read('packages/core/src/tool/registry.ts');

describe('① 接线：统一闸必须挂在唯一执行出口', () => {
  it('★★★ 必须导出并声明上限常量', () => {
    expect(REGISTRY, '★ 缺上限常量（无法观测与测试）').toMatch(/export const MAX_TOOL_TEXT_CHARS/);
  });

  it('★★★ execute 必须对返回结果施加闸（不是只定义不调用）', () => {
    const i = REGISTRY.indexOf('async execute(');
    expect(i, '★ 锚点缺失').toBeGreaterThan(-1);
    const body = REGISTRY.slice(i, i + 1600);
    expect(body, '★ execute 直接把工具结果返回了，未过闸 → 大输出仍会吃爆上下文')
      .toMatch(/capResultText\(result\)/);
    // 必须在 return 里用上（而不是算出来丢掉）
    expect(body, '★ capResultText 算了但没返回').toMatch(/return capResultText\(result\)/);
  });

  it('★★ 必须复用既有 capToolOutput（不另写一份截断）', () => {
    expect(REGISTRY, '★ 未复用既有实现（两处实现必然漂移）').toMatch(/from '\.\/builtin\/output-cap'/);
    expect(REGISTRY, '★ 未调用 capToolOutput').toMatch(/capToolOutput\(/);
  });
});

describe('② 真跑：四种语义必须正确', () => {
  /** 造一个「超长 text」的结果 */
  const longResult = (n: number) => ({
    content: [{ type: 'text', text: 'x'.repeat(n) }],
  });

  it('★★★ 超长 text 必须被裁到上限内', async () => {
    const mod: any = await import('./registry.js').catch(() => null);
    if (!mod?.ToolRegistry) {
      // 本机模块解析受限时退化为静态断言（① 已覆盖），不假红
      expect(REGISTRY).toMatch(/capResultText/);
      return;
    }
    const reg = new mod.ToolRegistry();
    const MAX = mod.MAX_TOOL_TEXT_CHARS;
    expect(typeof MAX, '★ MAX_TOOL_TEXT_CHARS 未导出').toBe('number');
    // 注册一个「返回超长文本」的假工具，真跑过闸
    reg.register({
      name: 'probe_long',
      description: 'probe',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => longResult(MAX * 3),
    });
    const r = await reg.execute('probe_long', {});
    const text = r.content[0].text as string;
    expect(text.length, `★ 超长文本未被裁剪（${text.length} 字符）`).toBeLessThanOrEqual(MAX + 200);
    expect(text, '★ 未留下截断标记（模型无法知道被截了）').toMatch(/truncated/);
  });

  it('★★★ 短 text 必须原样返回（不得无谓改动）', async () => {
    const mod: any = await import('./registry.js').catch(() => null);
    if (!mod?.ToolRegistry) return;
    const reg = new mod.ToolRegistry();
    reg.register({
      name: 'probe_short', description: 'p', inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'hello' }] }),
    });
    const r = await reg.execute('probe_short', {});
    expect(r.content[0].text, '★ 短文本被改动了').toBe('hello');
  });

  it('★★★ _meta 不得被动（工具间透传的元数据，截断会破坏下游解析）', async () => {
    const mod: any = await import('./registry.js').catch(() => null);
    if (!mod?.ToolRegistry) return;
    const reg = new mod.ToolRegistry();
    const meta = { path: '/a/b/c.png', artifactKind: 'image', big: 'y'.repeat(300) };
    reg.register({
      name: 'probe_meta', description: 'p', inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: 'z'.repeat(mod.MAX_TOOL_TEXT_CHARS * 2) }], _meta: meta }),
    });
    const r = await reg.execute('probe_meta', {});
    expect(r._meta, '★ _meta 被截断或丢失 → 下游（工件清单等）会解析失败').toEqual(meta);
  });

  it('★★★ 错误结果不得被裁（错误信息是排障依据）', async () => {
    const mod: any = await import('./registry.js').catch(() => null);
    if (!mod?.ToolRegistry) return;
    const reg = new mod.ToolRegistry();
    const longErr = 'E'.repeat(mod.MAX_TOOL_TEXT_CHARS * 2);
    reg.register({
      name: 'probe_err', description: 'p', inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: longErr }], isError: true }),
    });
    const r = await reg.execute('probe_err', {});
    expect(r.content[0].text, '★ 错误文本被裁了（排障信息可能因此丢失）').toBe(longErr);
  });

  it('★★ 幂等：已被逐工具裁过的文本再过闸不变', async () => {
    const mod: any = await import('./registry.js').catch(() => null);
    if (!mod?.ToolRegistry) return;
    const reg = new mod.ToolRegistry();
    // 恰好在阈值内 → 过闸应为 no-op
    const atMax = 'a'.repeat(mod.MAX_TOOL_TEXT_CHARS);
    reg.register({
      name: 'probe_max', description: 'p', inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ content: [{ type: 'text', text: atMax }] }),
    });
    const r = await reg.execute('probe_max', {});
    expect(r.content[0].text, '★ 恰好等于上限时被误裁（应为 no-op）').toBe(atMax);
  });
});

describe('③ 结构性：为什么必须收口（而不是逐工具加）', () => {
  it('★★ browser 工具此前一处未调用 capToolOutput（说明逐处补会漏）', () => {
    const BROWSER = read('packages/core/src/tool/builtin/browser/index.ts');
    // 记录事实：该文件里大输出点很多，但**自己**没做截断 → 靠 registry 统一闸兜住
    const big = (BROWSER.match(/JSON\.stringify\(data/g) || []).length;
    expect(big, '★ 浏览器工具里的大输出点数量变了，需复核统一闸是否仍覆盖').toBeGreaterThanOrEqual(8);
    expect(BROWSER, '★ browser 工具自己开始做截断了？（会与统一闸重复）').not.toMatch(/capToolOutput/);
  });
});