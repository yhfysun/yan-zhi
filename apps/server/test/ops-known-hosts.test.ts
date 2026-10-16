/**
 * 主机密钥校验内核（ops-known-hosts）正式测试类。
 *
 * 守护的东西：这是 SSH 的信任根 —— 判错一次，中间人就能顶替服务器，用户看到的终端、
 * 录像、跳板隧道全部不可信。所以这里把「放行 / 拒绝」的每条分支都钉死，
 * 尤其是**密钥变更必须拒绝**（最容易写成「记录一条新的就放行」）。
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  fingerprintOf, hostPortOf, mismatchMessage, outcomeAllows, parseKeyType, recordFor,
  unknownHostMessage, verifyHostKey,
} from '../src/plugins/ops-known-hosts.js';

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; };

/** 造一个真实格式的 SSH 公钥 blob：uint32 len + 类型 + uint32 len + 密钥体 */
function keyBlob(type = 'ssh-ed25519', body = Buffer.alloc(32, 7)): Buffer {
  const t = Buffer.from(type, 'utf8');
  return Buffer.concat([u32(t.length), t, u32(body.length), body]);
}

const HOST = '10.0.0.1:22';

describe('hostPortOf', () => {
  it('端口缺省按 22（免得同一台机器因写了/没写端口被记成两条）', () => {
    expect(hostPortOf('10.0.0.1')).toBe('10.0.0.1:22');
    expect(hostPortOf('10.0.0.1', 2222)).toBe('10.0.0.1:2222');
  });
});

describe('parseKeyType', () => {
  it('从 blob 里取出密钥类型', () => {
    expect(parseKeyType(keyBlob('ssh-ed25519'))).toBe('ssh-ed25519');
    expect(parseKeyType(keyBlob('ssh-rsa'))).toBe('ssh-rsa');
  });

  it('★ 畸形 blob 返回 unknown，不抛错（解析失败不该让校验流程本身崩）', () => {
    expect(parseKeyType(Buffer.alloc(0))).toBe('unknown');
    expect(parseKeyType(Buffer.from([0, 0]))).toBe('unknown');
    // 长度字段声称 999 字节，实际远不够
    const bad = Buffer.concat([u32(999), Buffer.from('ssh-ed25519')]);
    expect(parseKeyType(bad)).toBe('unknown');
  });
});

describe('fingerprintOf', () => {
  it('是 OpenSSH 口径：SHA256: + base64(sha256(key))，且去掉 = 填充', () => {
    const blob = keyBlob();
    const expected = `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`;
    expect(fingerprintOf(blob)).toBe(expected);
    expect(fingerprintOf(blob)).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);   // 32 字节 → 43 字符
    expect(fingerprintOf(blob)).not.toContain('=');
  });

  it('不同密钥 → 不同指纹；同一密钥 → 稳定', () => {
    const a = keyBlob('ssh-ed25519', Buffer.alloc(32, 1));
    const b = keyBlob('ssh-ed25519', Buffer.alloc(32, 2));
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
    expect(fingerprintOf(a)).toBe(fingerprintOf(keyBlob('ssh-ed25519', Buffer.alloc(32, 1))));
  });
});

describe('verifyHostKey · 决策', () => {
  const blob = keyBlob();

  it('mode=off → 不校验（逃生口，恢复旧行为）', () => {
    expect(verifyHostKey(undefined, HOST, blob, 'off')).toEqual({ status: 'skipped' });
    expect(outcomeAllows({ status: 'skipped' }, 'off')).toBe(true);
  });

  it('★ tofu + 首次见到 → new（记下来并放行）', () => {
    const o = verifyHostKey(undefined, HOST, blob, 'tofu');
    expect(o.status).toBe('new');
    expect(outcomeAllows(o, 'tofu')).toBe(true);
    if (o.status === 'new') {
      expect(o.record.host).toBe(HOST);
      expect(o.record.keyType).toBe('ssh-ed25519');
      expect(o.record.fingerprint).toBe(fingerprintOf(blob));
    }
  });

  it('★ strict + 未知主机 → 拒绝（skipped 在 strict 下不放行）', () => {
    const o = verifyHostKey(undefined, HOST, blob, 'strict');
    expect(outcomeAllows(o, 'strict')).toBe(false);
  });

  it('已记录且一致 → match，且保留首次记录时间', () => {
    const known = recordFor(HOST, blob, 1000);
    const o = verifyHostKey(known, HOST, blob, 'tofu', 5000);
    expect(o.status).toBe('match');
    if (o.status === 'match') expect(o.record.firstSeenAt).toBe(1000);
    expect(outcomeAllows(o, 'tofu')).toBe(true);
  });

  it('★★ 密钥变更 → changed 且拒绝（绝不能「记一条新的就放行」）', () => {
    const known = recordFor(HOST, keyBlob('ssh-ed25519', Buffer.alloc(32, 1)), 1000);
    const o = verifyHostKey(known, HOST, keyBlob('ssh-ed25519', Buffer.alloc(32, 2)), 'tofu');
    expect(o.status).toBe('changed');
    expect(outcomeAllows(o, 'tofu')).toBe(false);
    expect(outcomeAllows(o, 'strict')).toBe(false);
    if (o.status === 'changed') {
      expect(o.expected).toBe(known.fingerprint);
      expect(o.actual).toBe(fingerprintOf(keyBlob('ssh-ed25519', Buffer.alloc(32, 2))));
    }
  });

  it('★ 密钥类型变了（ed25519 → rsa）同样算变更', () => {
    const known = recordFor(HOST, keyBlob('ssh-ed25519'), 1000);
    const o = verifyHostKey(known, HOST, keyBlob('ssh-rsa'), 'tofu');
    expect(o.status).toBe('changed');
    if (o.status === 'changed') expect(o.keyType).toBe('ssh-rsa');
  });

  it('strict 下已记录且一致 → 照常放行', () => {
    const known = recordFor(HOST, blob, 1000);
    expect(outcomeAllows(verifyHostKey(known, HOST, blob, 'strict'), 'strict')).toBe(true);
  });
});

describe('报错文案 · 必须可行动', () => {
  it('★ 密钥变更的文案给出两个指纹 + 恢复路径（只说「不匹配」等于把用户卡死）', () => {
    const msg = mismatchMessage(HOST, { status: 'changed', keyType: 'ssh-ed25519', expected: 'SHA256:AAA', actual: 'SHA256:BBB' });
    expect(msg).toContain('SHA256:AAA');
    expect(msg).toContain('SHA256:BBB');
    expect(msg).toContain('ssh-ed25519');
    expect(msg).toContain('主机密钥');
    // 中间人攻击的可能性必须点到，同时给出确认后的处理方式
    expect(msg).toMatch(/中间人/);
    expect(msg).toMatch(/删除该主机记录/);
  });

  it('strict 未知主机的文案带上实际收到的指纹', () => {
    const msg = unknownHostMessage(HOST, keyBlob());
    expect(msg).toContain(HOST);
    expect(msg).toContain(fingerprintOf(keyBlob()));
    expect(msg).toMatch(/strict/);
  });
});
