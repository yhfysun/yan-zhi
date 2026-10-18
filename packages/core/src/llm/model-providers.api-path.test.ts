import { describe, it, expect } from 'vitest';
import { MODEL_PROVIDER_PRESETS } from '@yan-zhi/shared';
import { resolveUpstreamUrl } from './api-path.js';

/**
 * 跨层真跑（2026-10-18）：内置厂商目录 × 路径拼接收敛。
 *
 * ★ 为什么必须这一层：方案里"URL 拼接无条件加 v1 ⇒ 火山 /api/v3、智谱 /v4、
 *   百炼 /compatible-mode/v1 全部 404"是内置目录的**前置必做项**。数据层只能
 *   检查"base 长什么样"，证明不了"拼出来对"—— 把每个预设的 base 真喂给
 *   `resolveUpstreamUrl`，断言产出路径里**没有双版本段**、且保留厂商的版本段，
 *   这才闭环。
 *
 * ★ 与 api-path.test.ts 的分工：那个文件钉"规则"（5 种 base 形态 + 静态守卫），
 *   本文件钉"数据"（15 家厂商的真实地址在规则下的产出）。改任一侧另一边都会红。
 */
describe('内置厂商目录 × resolveUpstreamUrl：拼不出双版本段', () => {
  it('15 家全部通过（含火山 /api/v3、智谱 /v4、百炼 /compatible-mode/v1）', () => {
    const offenders: string[] = [];
    for (const p of MODEL_PROVIDER_PRESETS) {
      for (const kind of ['chat', 'messages', 'responses', 'models', 'embeddings'] as const) {
        const url = resolveUpstreamUrl(p.baseUrl, kind);
        if (/\/v\d+\/v1\//.test(url)) offenders.push(`${p.name} ${kind} → ${url}`);
      }
      // 兼容端点（协议切换联动用）同样过一遍
      for (const [proto, u] of Object.entries(p.urlByProtocol || {})) {
        const url = resolveUpstreamUrl(u!, proto === 'anthropic' ? 'messages' : 'chat');
        if (/\/v\d+\/v1\//.test(url)) offenders.push(`${p.name}[${proto}] → ${url}`);
      }
    }
    expect(offenders, '★ 出现双版本段（= 旧实现 404 的形态）').toEqual([]);
  });

  it('★ 保留厂商文档的版本段（火山必须是 /api/v3/chat/completions，不是 /v1/...）', () => {
    const volces = MODEL_PROVIDER_PRESETS.find((p) => p.key === 'volces-ark')!;
    expect(resolveUpstreamUrl(volces.baseUrl, 'chat')).toBe('https://ark.cn-beijing.volces.com/api/v3/chat/completions');
    const zhipu = MODEL_PROVIDER_PRESETS.find((p) => p.key === 'zhipu-bigmodel')!;
    expect(resolveUpstreamUrl(zhipu.baseUrl, 'chat')).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
    const bailian = MODEL_PROVIDER_PRESETS.find((p) => p.key === 'aliyun-bailian')!;
    expect(resolveUpstreamUrl(bailian.baseUrl, 'chat')).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    const kimi = MODEL_PROVIDER_PRESETS.find((p) => p.key === 'moonshot-cn')!;
    expect(resolveUpstreamUrl(kimi.urlByProtocol!.anthropic!, 'messages')).toBe('https://api.moonshot.cn/anthropic/v1/messages');
  });

  it('裸域名厂商补 /v1（OpenAI 形态）', () => {
    const ds = MODEL_PROVIDER_PRESETS.find((p) => p.key === 'deepseek')!;
    expect(resolveUpstreamUrl(ds.baseUrl, 'chat')).toBe('https://api.deepseek.com/v1/chat/completions');
  });
});
