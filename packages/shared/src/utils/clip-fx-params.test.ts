import { describe, it, expect } from 'vitest';
import { FX_EFFECTS, fxFilter, fxParamsOf, fxParamCatalogText } from './clip-effects';

describe('FX 参数化（注册表自洽）', () => {
  it('filter 里引用的每个 {key} 都在 params 里声明过', () => {
    for (const e of FX_EFFECTS) {
      for (const m of e.filter.matchAll(/\{([a-zA-Z]+)\}/g)) {
        const key = m[1];
        if (key === 'W' || key === 'H') continue;
        const declared = new Set((e.params || []).map((p) => p.key));
        expect(declared.has(key), `${e.id} 的 {${key}} 没在 params 声明（渲染会留下原样占位符）`).toBe(true);
      }
    }
  });

  it('每个声明的参数都真的出现在 filter 里（否则滑杆拉了也没用）', () => {
    for (const e of FX_EFFECTS) {
      for (const p of e.params || []) {
        expect(e.filter.includes(`{${p.key}}`), `${e.id} 声明了 ${p.key} 但 filter 里没用到`).toBe(true);
      }
    }
  });

  it('默认值替换后与旧固定串等价（shake）', () => {
    const s = fxFilter('shake', 1080, 1920)!;
    expect(s).toContain('iw*0.006*sin(t*23)');
    expect(s).not.toContain('{');
  });

  it('传参生效，越界按注册表钳制', () => {
    expect(fxFilter('pixelate', 1080, 1920, { blocks: 24 })).toContain('iw/24');
    expect(fxFilter('pixelate', 1080, 1920, { blocks: 999 })).toContain('iw/48');
    expect(fxFilter('pixelate', 1080, 1920, { blocks: 0 })).toContain('iw/4');
  });

  it('未知键被忽略；无参数特效原样返回', () => {
    expect(fxFilter('mirror', 1080, 1920, { anything: 1 })).toBe('hflip');
    expect(fxParamsOf('mirror')).toEqual([]);
  });

  it('参数目录文本覆盖全部可调键（工具描述用）', () => {
    const t = fxParamCatalogText();
    for (const e of FX_EFFECTS) for (const p of e.params || []) expect(t).toContain(p.key);
  });
});
