// 远控扫码载荷解析守门：二维码 = 带码 URL；系统相机/手滑也可能给出纯码文本。
import { describe, expect, it } from 'vitest';
import { parseRcScanPayload, normalizeHostInput } from './rcScan';

describe('parseRcScanPayload', () => {
  it('标准载荷：?code= 的裸路径 URL → origin + 授权码', () => {
    expect(parseRcScanPayload('http://192.168.1.100:3001/remote?code=abcd-2345')).toEqual({
      host: 'http://192.168.1.100:3001',
      code: 'abcd-2345',
    });
  });

  it('hash 形态（引导后的最终 URL）也能取出 code；query 与 hash 并存时以 query（原始内容）为准', () => {
    expect(parseRcScanPayload('http://192.168.1.100:3001/remote?code=x1#/remote?code=x1')).toEqual({
      host: 'http://192.168.1.100:3001',
      code: 'x1',
    });
    expect(parseRcScanPayload('https://rc.example.com/#/remote?code=zz9')).toEqual({
      host: 'https://rc.example.com',
      code: 'zz9',
    });
  });

  it('URL 里没有 code → 只填地址；纯文本 → 整串当授权码', () => {
    expect(parseRcScanPayload('http://10.0.0.5:3001/remote')).toEqual({ host: 'http://10.0.0.5:3001' });
    expect(parseRcScanPayload(' abcd-2345 ')).toEqual({ code: 'abcd-2345' });
  });

  it('空串/非 http 协议不当作地址解析', () => {
    expect(parseRcScanPayload('')).toEqual({});
    expect(parseRcScanPayload('   ')).toEqual({});
    expect(parseRcScanPayload('ftp://x/remote?code=1')).toEqual({ code: 'ftp://x/remote?code=1' });
  });

  it('code 带 URL 编码时解码', () => {
    expect(parseRcScanPayload('http://10.0.0.5:3001/remote?code=a%20b')).toEqual({
      host: 'http://10.0.0.5:3001',
      code: 'a b',
    });
  });
});

describe('normalizeHostInput', () => {
  it('粘整条邀请链接 → 拆成 origin + 授权码（不用再手填码）', () => {
    expect(normalizeHostInput('http://192.168.10.63:3001/remote?code=hc9c-hfba')).toEqual({
      host: 'http://192.168.10.63:3001',
      code: 'hc9c-hfba',
    });
  });

  it('带 hash 的最终 URL（?code= 在 query 与 hash 各一份）也拆得开', () => {
    expect(normalizeHostInput('http://192.168.10.63:3001/remote?code=hc9c-hfba#/remote?code=hc9c-hfba')).toEqual({
      host: 'http://192.168.10.63:3001',
      code: 'hc9c-hfba',
    });
  });

  it('裸 ip[:port] 补 http://；末尾斜杠去掉', () => {
    expect(normalizeHostInput('192.168.10.63:3001')).toEqual({ host: 'http://192.168.10.63:3001' });
    expect(normalizeHostInput('nas:3001/')).toEqual({ host: 'http://nas:3001' });
    expect(normalizeHostInput('rc.example.com')).toEqual({ host: 'http://rc.example.com' });
  });

  it('只带主机不带 code 的链接 → 只给地址', () => {
    expect(normalizeHostInput('http://10.0.0.5:3001/remote')).toEqual({ host: 'http://10.0.0.5:3001' });
  });

  it('纯授权码/无关文本不当地址，返回空（输入框保持原样）', () => {
    expect(normalizeHostInput('hc9c-hfba')).toEqual({});
    expect(normalizeHostInput('随便写的')).toEqual({});
    expect(normalizeHostInput('')).toEqual({});
  });
});
