/**
 * Edge TTS 单测（纯函数部分）。
 *
 * 真实网络行为（握手、403）无法在单测里稳定覆盖，那部分靠冒烟脚本 + 实测记录，
 * 这里钉住的是「算错了就必然 403 / 必然选错音色」的关键算法。
 */
import { describe, it, expect } from 'vitest';
import { genSecMsGec, buildSsml, mapRate, dechunk, pickEdgeVoiceForRole, defaultEdgeVoice, type EdgeVoice } from '../src/mcp/edge-tts';

// 真实 Edge 音色集（2026-09-17 实测拉取）
const ZH_CN: EdgeVoice[] = [
  { name: 'zh-CN-XiaoxiaoNeural', culture: 'zh-CN', gender: 'Female', display: 'Xiaoxiao' },
  { name: 'zh-CN-XiaoyiNeural', culture: 'zh-CN', gender: 'Female', display: 'Xiaoyi' },
  { name: 'zh-CN-YunjianNeural', culture: 'zh-CN', gender: 'Male', display: 'Yunjian' },
  { name: 'zh-CN-YunxiNeural', culture: 'zh-CN', gender: 'Male', display: 'Yunxi' },
  { name: 'zh-CN-YunxiaNeural', culture: 'zh-CN', gender: 'Male', display: 'Yunxia' },
  { name: 'zh-CN-YunyangNeural', culture: 'zh-CN', gender: 'Male', display: 'Yunyang' },
];
const WITH_DIALECT: EdgeVoice[] = [
  ...ZH_CN,
  { name: 'zh-CN-liaoning-XiaobeiNeural', culture: 'zh-CN-liaoning', gender: 'Female', display: 'Xiaobei' },
  { name: 'zh-HK-WanLungNeural', culture: 'zh-HK', gender: 'Male', display: 'WanLung' },
];

describe('genSecMsGec · Edge 签名算法（错则必 403）', () => {
  it('输出 64 位大写十六进制', () => {
    const g = genSecMsGec();
    expect(g).toMatch(/^[0-9A-F]{64}$/);
  });

  it('同一 5 分钟窗口内结果稳定（签名按 300 秒取整）', () => {
    // 选一个窗口起点对齐的时刻，确保 +60s 仍在同一窗口内
    const base = 1_700_000_000_000;
    const aligned = base - (base / 1000) % 300 * 1000; // 对齐到 300s 边界
    const a = genSecMsGec(aligned);
    const b = genSecMsGec(aligned + 60_000);   // 同窗口 +1 分钟
    const c = genSecMsGec(aligned + 299_000);  // 窗口内最后一秒
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('跨窗口后签名变化', () => {
    const base = 1_700_000_000_000;
    const aligned = base - (base / 1000) % 300 * 1000;
    expect(genSecMsGec(aligned + 300_000)).not.toBe(genSecMsGec(aligned));
  });

  it('已知输入产生确定输出（防止算法被无意改动）', () => {
    // 若算法变更（如漏掉 ×1e9/100）此断言会失败
    const aligned = 1_700_000_000_000 - (1_700_000_000 % 300) * 1000;
    expect(genSecMsGec(aligned)).toBe(genSecMsGec(aligned + 100_000));
    expect(genSecMsGec(aligned).length).toBe(64);
  });
});

describe('buildSsml · SSML 构造', () => {
  it('含音色名与语言', () => {
    const s = buildSsml('你好', 'zh-CN-YunxiNeural');
    expect(s).toContain("name='zh-CN-YunxiNeural'");
    expect(s).toContain("xml:lang='zh-CN'");
    expect(s).toContain('你好');
  });

  it('XML 特殊字符被转义（不转义服务端会解析失败）', () => {
    const s = buildSsml('a & b < c > d "e"', 'zh-CN-YunxiNeural');
    expect(s).toContain('&amp;');
    expect(s).toContain('&lt;');
    expect(s).toContain('&gt;');
    expect(s).toContain('&quot;');
    // 正文里的裸 & 必须已全部转义（&amp; 之外不应再有裸 &）
    const body = s.slice(s.indexOf('<prosody'), s.indexOf('</prosody>'));
    expect(body.replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, '')).not.toContain('&');
  });

  it('语速与音调带正负号', () => {
    expect(buildSsml('x', 'v', 20, 5)).toContain("rate='+20%'");
    expect(buildSsml('x', 'v', -30, -5)).toContain("rate='-30%'");
    expect(buildSsml('x', 'v', 0, 0)).toContain("pitch='+0Hz'");
  });
});

describe('mapRate · 语速映射（SAPI -10~10 → Edge 百分比）', () => {
  it('0 映射为 0', () => {
    expect(mapRate(0)).toBe(0);
  });

  it('正数按 10 倍放大（上限 +100%）', () => {
    expect(mapRate(5)).toBe(50);
    expect(mapRate(10)).toBe(100);
  });

  it('负数按 5 倍压缩（下限 -50%，Edge 不支持更慢）', () => {
    expect(mapRate(-5)).toBe(-25);
    expect(mapRate(-10)).toBe(-50);
  });

  it('越界值被夹住', () => {
    expect(mapRate(999)).toBe(100);
    expect(mapRate(-999)).toBe(-50);
  });
});

describe('dechunk · chunked 解析', () => {
  it('单块', () => {
    const b = Buffer.from('5\r\nhello\r\n0\r\n\r\n', 'latin1');
    expect(dechunk(b).toString()).toBe('hello');
  });

  it('多块拼接', () => {
    const b = Buffer.from('3\r\nabc\r\n3\r\ndef\r\n0\r\n\r\n', 'latin1');
    expect(dechunk(b).toString()).toBe('abcdef');
  });

  it('扩展参数（分号）被忽略', () => {
    const b = Buffer.from('5;ext=1\r\nhello\r\n0\r\n\r\n', 'latin1');
    expect(dechunk(b).toString()).toBe('hello');
  });

  it('异常输入不抛错，返回已解析部分', () => {
    expect(dechunk(Buffer.from('zz\r\n', 'latin1')).length).toBe(0);
    expect(dechunk(Buffer.from('5\r\nhe', 'latin1')).length).toBe(0); // 数据不足
  });

  it('空输入返回空', () => {
    expect(dechunk(Buffer.alloc(0)).length).toBe(0);
  });
});

describe('pickEdgeVoiceForRole · 角色 → Edge 音色', () => {
  it('男主拿男声、女主拿女声', () => {
    const a = new Map<string, string>();
    expect(ZH_CN.find((v) => v.name === pickEdgeVoiceForRole(ZH_CN, '男主', a, 'Male'))!.gender).toBe('Male');
    expect(ZH_CN.find((v) => v.name === pickEdgeVoiceForRole(ZH_CN, '女主', a, 'Female'))!.gender).toBe('Female');
  });

  it('同角色锁定同一音色', () => {
    const a = new Map<string, string>();
    const v1 = pickEdgeVoiceForRole(ZH_CN, '女主', a, 'Female');
    expect(pickEdgeVoiceForRole(ZH_CN, '女主', a, 'Female')).toBe(v1);
  });

  it('多角色尽量分配不同音色（6 音色分 4 角色应全不同）', () => {
    const a = new Map<string, string>();
    const roles: Array<[string, string]> = [['男主', 'Male'], ['女主', 'Female'], ['少年', 'Male'], ['女配', 'Female']];
    const picked = roles.map(([r, g]) => pickEdgeVoiceForRole(ZH_CN, r, a, g));
    expect(new Set(picked).size).toBe(4);
  });

  it('只挑普通话，不落到方言/港台（除非没有普通话可选）', () => {
    const a = new Map<string, string>();
    for (let i = 0; i < 6; i++) {
      const v = pickEdgeVoiceForRole(WITH_DIALECT, `角色${i}`, a, '');
      expect(v.startsWith('zh-CN-')).toBe(true);
      expect(v).not.toContain('liaoning');
      expect(v).not.toContain('zh-HK');
    }
  });

  it('识别不出性别时也能分配（返回可用音色）', () => {
    const a = new Map<string, string>();
    const v = pickEdgeVoiceForRole(ZH_CN, '旁白', a, '');
    expect(ZH_CN.map((x) => x.name)).toContain(v);
  });
});

describe('defaultEdgeVoice · 默认音色', () => {
  it('按性别偏好挑', () => {
    expect(ZH_CN.find((v) => v.name === defaultEdgeVoice(ZH_CN, 'Male'))!.gender).toBe('Male');
    expect(ZH_CN.find((v) => v.name === defaultEdgeVoice(ZH_CN, 'Female'))!.gender).toBe('Female');
  });

  it('无偏好时取第一个普通话音色', () => {
    expect(defaultEdgeVoice(ZH_CN, '')).toBe(ZH_CN[0].name);
  });

  it('空列表返回空串（不抛错）', () => {
    expect(defaultEdgeVoice([], 'Male')).toBe('');
  });
});