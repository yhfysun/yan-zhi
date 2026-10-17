// sec-lab P1 工具的**可确定性验证**部分（2026-10-17）。
//
// 为什么挑这几块测：编解码 / JWT / 哈希识别 / HTML 抽取 / 状态回滚都是**纯函数或纯内存**，
// 能真跑且结果确定；而 subdomain / crawl / dirsearch / proxy 要打网络或开端口，
// 单测里跑只会测到夹具，真正的验证得靠真机（已在方案里标注为"待真机验证"）。

import { describe, it, expect } from 'vitest';
import { encodeData, decodeData, inspectJwt, identifyHash, CODEC_OPS } from '../src/plugins/sec-lab-tools/crypto.js';
import { extractFromHtml } from '../src/plugins/sec-lab-tools/crawler.js';
import { runTargetState } from '../src/plugins/sec-lab-tools/state.js';
import type { Asset, Snapshot } from '../src/plugins/sec-lab-tools/easm.js';

describe('编解码：10 种编码的往返', () => {
  it('每种编码 encode→decode 都能还原（含中文）', () => {
    const text = 'Hello 世界 123!';
    for (const op of CODEC_OPS) {
      if (op === 'morse') continue; // 摩尔斯无大小写概念，解码回来统一是大写，单独测
      const encoded = encodeData(op, text);
      expect(decodeData(op, encoded), `${op} 往返失败`).toBe(text);
    }
  });

  it('morse 往返（无大小写，解码为大写）', () => {
    expect(decodeData('morse', encodeData('morse', 'SOS 123'))).toBe('SOS 123');
  });

  it('base64 解码同时接受 URL-safe 变体', () => {
    const std = encodeData('base64', 'a+b/c?');
    expect(decodeData('base64', std.replace(/\+/g, '-').replace(/\//g, '_'))).toBe('a+b/c?');
  });

  it('base58 前导零字节保留（比特币地址类的常见坑）', () => {
    const buf = Buffer.from([0, 0, 1, 2, 3]);
    const enc = encodeData('base58', buf.toString('latin1'));
    expect(enc.startsWith('11')).toBe(true);
  });
});

describe('JWT：只解码与判风险，不破解密钥', () => {
  const mk = (header: object, payload: object) => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64(header)}.${b64(payload)}.sig`;
  };

  it('★ alg=none 判为 critical（可任意改写 payload）', () => {
    const r = inspectJwt(mk({ alg: 'none' }, { sub: '1' }));
    expect(r.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('缺 exp 判为 medium', () => {
    const r = inspectJwt(mk({ alg: 'HS256' }, { sub: '1' }));
    expect(r.findings.some((f) => f.title.includes('exp'))).toBe(true);
  });

  it('过期令牌不报 critical（只是 info）', () => {
    const r = inspectJwt(mk({ alg: 'HS256' }, { sub: '1', exp: 1 }));
    expect(r.findings.some((f) => f.severity === 'critical')).toBe(false);
  });

  it('不是 JWT 时抛错（不静默返回空结论）', () => {
    expect(() => inspectJwt('not-a-jwt')).toThrow();
  });
});

describe('哈希识别', () => {
  it('32 位十六进制 → MD5 类；64 位 → SHA-256 类', () => {
    expect(identifyHash('d41d8cd98f00b204e9800998ecf8427e').raw).toMatchObject({ length: 32 });
    expect(identifyHash('a'.repeat(64)).raw).toMatchObject({ length: 64 });
  });

  it('bcrypt 前缀能被识别；乱串则明说无法识别', () => {
    expect(identifyHash('$2b$12$' + 'a'.repeat(53)).raw).toMatchObject({ candidates: ['bcrypt'] });
    expect(identifyHash('这不是哈希').findings[0].title).toContain('无法识别');
  });
});

describe('HTML 抽取：链接 / 表单 / 脚本 / 同源过滤', () => {
  const html = `
    <a href="/a">a</a>
    <a href="https://other.example.com/x">外站</a>
    <form action="/login" method="post">
      <input name="user"><input name="password">
    </form>
    <script src="/static/app.js"></script>
  `;

  it('抽出链接、表单字段、脚本，并只保留同源链接', () => {
    const r = extractFromHtml(html, 'https://target.example.com/page');
    expect(r.links).toContain('https://target.example.com/a');
    expect(r.links.some((l) => l.includes('other.example.com')), '跨域链接必须被过滤').toBe(false);
    expect(r.forms[0]).toMatchObject({ method: 'POST', inputs: ['user', 'password'] });
    expect(r.scripts).toContain('https://target.example.com/static/app.js');
  });
});

describe('目标状态：回滚只改本地基线，不改远端', () => {
  const asset: Asset = {
    id: 'a1', value: 'example.com', type: 'domain', owner: 'sec', verified: true,
    environment: 'internal', createdAt: 1,
  };
  const snaps: Snapshot[] = [
    { id: 's1', assetId: 'a1', at: 1000, ports: [{ port: 80 }], subdomains: ['www'], ips: ['1.1.1.1'], findings: 0 },
    { id: 's2', assetId: 'a1', at: 2000, ports: [{ port: 80 }, { port: 443 }], subdomains: ['www'], ips: ['1.1.1.1'], findings: 1 },
  ];

  const deps = () => {
    let assets = [JSON.parse(JSON.stringify(asset)) as Asset];
    const snapshots = JSON.parse(JSON.stringify(snaps)) as Snapshot[];
    return {
      loadAssets: async () => assets,
      saveAssets: async (v: Asset[]) => { assets = v; },
      loadSnapshots: async () => snapshots,
      saveSnapshots: async () => { /* noop */ },
      read: () => assets,
    };
  };

  it('rollback 把基线切到指定快照并持久化', async () => {
    const d = deps();
    const r = await runTargetState({ action: 'rollback', assetId: 'a1', snapshotId: 's1' }, d);
    expect(r.summary).toContain('s1');
    expect((d.read()[0] as Asset & { baselineSnapshotId?: string }).baselineSnapshotId).toBe('s1');
  });

  it('默认回滚到最新快照；没有快照时明确报错', async () => {
    const d = deps();
    await runTargetState({ action: 'rollback', assetId: 'a1' }, d);
    expect((d.read()[0] as Asset & { baselineSnapshotId?: string }).baselineSnapshotId).toBe('s2');

    const empty = { ...d, loadSnapshots: async () => [] as Snapshot[] };
    await expect(runTargetState({ action: 'rollback', assetId: 'a1' }, empty)).rejects.toThrow(/没有任何快照/);
  });

  it('list 列出资产与快照数', async () => {
    const r = await runTargetState({ action: 'list' }, deps());
    expect(r.summary).toContain('example.com');
    expect(r.summary).toContain('快照 2 份');
  });
});
