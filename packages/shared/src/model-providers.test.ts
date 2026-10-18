import { describe, it, expect } from 'vitest';
import {
  MODEL_PROVIDER_PRESETS, findProviderPreset, resolveProtocolUrl, BEDROCK_P2_NOTE,
} from './model-providers.js';

/**
 * 内置厂商目录的守门测试（2026-10-18）。
 *
 * 钉的是**会真实咬人**的结构性问题，而不是"表里有几行"：
 * ① key 唯一（重复会让 preset_key 落库撞车、「已添加」态张冠李戴）；
 * ② baseUrl 不带版本段（带了就与 resolveUpstreamUrl 的"版本段由 base 决定"重复 ⇒ 双段 404）；
 * ③ 联动函数只在用户没手改 URL 时改写（覆盖自定义中转 = 用户地址被悄悄换掉）。
 */

describe('目录结构', () => {
  it('key 唯一', () => {
    const keys = MODEL_PROVIDER_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('名称唯一（宫格卡片按名展示，重名分不清）', () => {
    const names = MODEL_PROVIDER_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('★ baseUrl 是「基础地址」而非完整端点（不带 /chat/completions 这类尾巴）', () => {
    for (const p of MODEL_PROVIDER_PRESETS) {
      expect(p.baseUrl, `${p.name} 的 baseUrl 带了完整端点路径`).not.toMatch(
        /\/(chat\/completions|messages|responses|models|embeddings)(\/|$)/,
      );
      expect(p.baseUrl.endsWith('/'), `${p.name} 的 baseUrl 带尾斜杠`).toBe(false);
    }
  });

  it('★ baseUrl 是 https（厂商文档地址）', () => {
    for (const p of MODEL_PROVIDER_PRESETS) {
      expect(p.baseUrl.startsWith('https://'), p.name).toBe(true);
    }
  });

  it('★ 版本段只出现在 base 末段（数据面预检；真正的拼接守卫在 core 的 resolveUpstreamUrl，见 model-providers.api-path.test.ts）', () => {
    for (const p of MODEL_PROVIDER_PRESETS) {
      const base = p.baseUrl.replace(/\/+$/, '');
      // base 末段可以是版本段（v1/v3/v4 —— 厂商文档形态），但其后不得再挂路径
      const tail = base.split('/').pop() || '';
      if (/^v\d+$/.test(tail)) {
        // 形如 .../v1 或 .../api/v3：末段即版本段，前面只能是 host 或普通路径段
        expect(base, `${p.name} 版本段后还挂了东西`).not.toMatch(/\/v\d+\/.+$/);
      }
    }
  });

  it('协议取值只在三格式内（preset 不提供历史 custom）', () => {
    for (const p of MODEL_PROVIDER_PRESETS) {
      expect(['openai', 'openai-responses', 'anthropic'], p.name).toContain(p.protocol);
    }
  });

  it('每项都有 iconText / brandColor（宫格卡片渲染的必需面）', () => {
    for (const p of MODEL_PROVIDER_PRESETS) {
      expect(p.iconText.length, p.name).toBeGreaterThan(0);
      expect(p.brandColor, p.name).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('keyUrl 都是 https（填 Key 弹窗直接外跳）', () => {
    for (const p of MODEL_PROVIDER_PRESETS) {
      if (p.keyUrl) expect(p.keyUrl.startsWith('https://'), p.name).toBe(true);
    }
  });

  it('Bedrock 明确标注 P2 不做（不做成"看起来支持"的假入口）', () => {
    expect(BEDROCK_P2_NOTE).toContain('SigV4');
    expect(MODEL_PROVIDER_PRESETS.some((p) => /bedrock/i.test(p.key))).toBe(false);
  });
});

describe('resolveProtocolUrl：协议切换联动', () => {
  const ds = findProviderPreset('deepseek')!;

  it('URL 仍是默认值 ⇒ 改写成新协议端点（DeepSeek openai → anthropic）', () => {
    expect(resolveProtocolUrl(ds, 'openai', 'anthropic', 'https://api.deepseek.com'))
      .toBe('https://api.deepseek.com/anthropic');
  });

  it('★ 用户手改过 URL ⇒ 绝不动（防止覆盖自定义中转）', () => {
    expect(resolveProtocolUrl(ds, 'openai', 'anthropic', 'https://my-relay.example.com/v1'))
      .toBe('https://my-relay.example.com/v1');
  });

  it('尾斜杠等价（默认值比较先归一化）', () => {
    expect(resolveProtocolUrl(ds, 'openai', 'anthropic', 'https://api.deepseek.com/'))
      .toBe('https://api.deepseek.com/anthropic');
  });

  it('目标协议无专用端点 ⇒ 回落 baseUrl（如智谱切 Responses 仍是同一地址）', () => {
    const zhipu = findProviderPreset('zhipu-bigmodel')!;
    expect(resolveProtocolUrl(zhipu, 'openai', 'openai-responses', zhipu.baseUrl)).toBe(zhipu.baseUrl);
  });
});
