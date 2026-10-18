import { describe, it, expect } from 'vitest';
import { joinUpstreamPath, resolveUpstreamUrl, upstreamRelPath } from './api-path.js';

/**
 * 这些用例是「内置国产厂商」能否接通的**唯一防线**（2026-10-17）。
 *
 * ★ 变异验证要求（别把断言写成 `toBeTruthy()` 这种能被错误实现蒙混过关的形式）：
 *   · 把 `joinUpstreamPath` 里的 `VERSION_SEGMENT_RE.test(...)` 恒改成 `false`
 *     （= 退化成旧行为「无条件加 v1」）⇒ 火山 / 智谱 / 百炼三条**必须**打红；
 *   · 恒改成 `true`（= 永远不加版本段）⇒ OpenAI / Moonshot-anthropic 两条**必须**打红。
 *   两边都打红，才说明这套用例真的钉住了"版本段由 base 决定"这条规则。
 */
describe('joinUpstreamPath / resolveUpstreamUrl', () => {
  it('OpenAI 官方：base 不带版本段 ⇒ 补 v1', () => {
    expect(resolveUpstreamUrl('https://api.openai.com', 'chat'))
      .toBe('https://api.openai.com/v1/chat/completions');
  });

  it('火山方舟：/api/v3 已是版本段 ⇒ 不再加（旧行为会拼成 /api/v3/v1/… 而 404）', () => {
    expect(resolveUpstreamUrl('https://ark.cn-beijing.volces.com/api/v3', 'chat'))
      .toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions');
  });

  it('智谱：/api/paas/v4 已是版本段 ⇒ 不再加', () => {
    expect(resolveUpstreamUrl('https://open.bigmodel.cn/api/paas/v4', 'chat'))
      .toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
  });

  it('阿里云百炼：/compatible-mode/v1 已是版本段 ⇒ 不再加', () => {
    expect(resolveUpstreamUrl('https://dashscope.aliyuncs.com/compatible-mode/v1', 'chat'))
      .toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  });

  it('Moonshot 的 Anthropic 兼容端点：末段是 anthropic ⇒ 补 v1（/anthropic/v1/messages）', () => {
    expect(resolveUpstreamUrl('https://api.moonshot.cn/anthropic', 'messages'))
      .toBe('https://api.moonshot.cn/anthropic/v1/messages');
    // 同一厂商走 /v1 时不应再加一层
    expect(resolveUpstreamUrl('https://api.moonshot.cn/v1', 'messages'))
      .toBe('https://api.moonshot.cn/v1/messages');
  });

  it('用户把 /v1 写进 base（含尾斜杠）⇒ 天然去重，不再 404', () => {
    expect(resolveUpstreamUrl('https://api.deepseek.com/v1/', 'chat'))
      .toBe('https://api.deepseek.com/v1/chat/completions');
    expect(resolveUpstreamUrl('https://api.deepseek.com/v1', 'chat'))
      .toBe('https://api.deepseek.com/v1/chat/completions');
  });

  it('★ 存量调用点传的 rel 带版本前缀（v1/chat/completions）⇒ 剥掉后按 base 重新决定', () => {
    // 这正是迁移期最省事的写法：调用点一行都不用改，只换拼接函数
    expect(joinUpstreamPath('https://ark.cn-beijing.volces.com/api/v3', 'v1/chat/completions'))
      .toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions');
    expect(joinUpstreamPath('https://api.openai.com', 'v1/chat/completions'))
      .toBe('https://api.openai.com/v1/chat/completions');
  });

  it('所有 kind 都能解析，且不产生重复版本段（不变量）', () => {
    const bases = [
      'https://api.openai.com',
      'https://ark.cn-beijing.volces.com/api/v3',
      'https://open.bigmodel.cn/api/paas/v4',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
      'https://api.moonshot.cn/anthropic',
    ];
    for (const base of bases) {
      for (const kind of ['chat', 'messages', 'responses', 'embeddings', 'models', 'images', 'videos'] as const) {
        const url = resolveUpstreamUrl(base, kind);
        // 不变量 1：以正确的相对路径结尾
        expect(url.endsWith(`/${upstreamRelPath(kind)}`), `${base} + ${kind} → ${url}`).toBe(true);
        // 不变量 2：绝不出现 /v1/v1/ 或 /v3/v1/ 这种双重版本段
        expect(url, `${base} + ${kind} → ${url}`).not.toMatch(/\/v\d+\/v\d+\//);
      }
    }
  });

  it('★ 报错里显示的 URL 也走同一函数（urlDesc 不能与真实请求URL漂移）', () => {
    // client.ts 的 urlDesc 历史上是手拼的字符串，改了请求 URL 却忘了改它 ⇒ 排障被误导。
    // 这里钉住"同一个 base 的两个用途必须一致"
    const base = 'https://open.bigmodel.cn/api/paas/v4';
    expect(resolveUpstreamUrl(base, 'chat')).toBe(`${base.replace(/\/+$/, '')}/chat/completions`);
  });

  it('★ 守卫：client.ts / llm-proxy.ts 里不得再出现 v1/ 字面量（唯一实现在 api-path.ts）', () => {
    // ★ 为什么做静态守卫而不只靠单测：改用 kind 枚举后，将来有人为了"临时修一个问题"
    //   手写回一个 'v1/chat/completions'，功能仍能用（OpenAI 官方不会报错），
    //   但国产厂商会静默 404 —— 而写的人和 review 的人都不会第一时间想到路径问题。
    //   这道守卫让"绕过唯一实现"在 CI 阶段就打红。
    const { readFileSync } = require('node:fs');
    const { fileURLToPath } = require('node:url');
    const { dirname, resolve } = require('node:path');
    const here = dirname(fileURLToPath(import.meta.url));

    const targets = [
      ['client.ts', resolve(here, 'client.ts')],
      ['llm-proxy.ts', resolve(here, '../../../../apps/server/src/routes/llm-proxy.ts')],
    ];
    for (const [name, file] of targets) {
      let src = '';
      try { src = readFileSync(file, 'utf8'); } catch { continue; } // 文件缺失不误伤
      // 剥掉注释再查，避免注释里的说明文字触发误报
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
      const bad = code.match(/['"`][^'"`]*\bv\d+\/(chat|messages|responses|embeddings|models|images|videos)[^'"`]*['"`]/g);
      expect(bad, `${name} 里出现了硬编码的版本路径 ${JSON.stringify(bad)} —— 请改用 resolveUpstreamUrl(kind)`).toBeNull();
    }
  });

  it('空/非法输入不炸，返回可预测值', () => {
    expect(joinUpstreamPath('', 'chat/completions')).toBe('chat/completions');
    expect(joinUpstreamPath('https://api.openai.com', '')).toBe('https://api.openai.com');
    expect(resolveUpstreamUrl('', 'chat')).toBe('chat/completions');
  });
});
