// 运维插件：SFTP 备份辅助函数 + 管理类工具注册完整性。
//
// 注意：必须 mock crypto —— 否则 import ops-shell 会连带加载 db → better-sqlite3，
// 本机 ABI 不匹配（NODE_MODULE_VERSION 130 vs 127）会让整个 suite 直接挂掉。
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/utils/crypto.js', () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => String(s).replace(/^enc:/, ''),
}));

import { backupRemoteName, copyRemoteFile, makeTools } from '../src/plugins/ops-shell.js';

describe('backupRemoteName', () => {
  it('在同目录生成 .bak-YYYYMMDD-HHmmss 副本名', () => {
    const at = new Date(2026, 8, 11, 17, 5, 9); // 2026-09-11 17:05:09
    expect(backupRemoteName('/etc/nginx/nginx.conf', at)).toBe('/etc/nginx/nginx.conf.bak-20260911-170509');
  });

  it('月/日/时/分/秒都补零', () => {
    const at = new Date(2026, 0, 2, 3, 4, 5);
    expect(backupRemoteName('/a/b.txt', at)).toBe('/a/b.txt.bak-20260102-030405');
  });

  it('路径尾部多余斜杠不会带进备份名', () => {
    const at = new Date(2026, 8, 11, 0, 0, 0);
    expect(backupRemoteName('/a/b/', at)).toBe('/a/b.bak-20260911-000000');
  });

  it('同一路径同一时刻结果稳定', () => {
    const at = new Date(2026, 8, 11, 17, 5, 9);
    expect(backupRemoteName('/x/y', at)).toBe(backupRemoteName('/x/y', at));
  });
});

describe('copyRemoteFile', () => {
  /** 最小的 SFTP 假实现：只暴露 createReadStream / createWriteStream 与事件触发 */
  function fakeSftp() {
    const handlers: Record<string, Array<(...a: unknown[]) => void>> = {};
    const on = (key: string) => (ev: string, cb: (...a: unknown[]) => void) => {
      (handlers[`${key}:${ev}`] ||= []).push(cb);
      return target;
    };
    const rs: Record<string, unknown> = {};
    const ws: Record<string, unknown> = {};
    const target = rs;
    rs.on = on('rs');
    rs.pipe = () => ws;
    ws.on = on('ws');
    return {
      sftp: { createReadStream: () => rs, createWriteStream: () => ws } as never,
      emit: (k: string, ...a: unknown[]) => (handlers[k] || []).forEach((f) => f(...a)),
    };
  }

  it('写入流 close 后 resolve', async () => {
    const f = fakeSftp();
    const p = copyRemoteFile(f.sftp, '/a', '/a.bak');
    f.emit('ws:close');
    await expect(p).resolves.toBeUndefined();
  });

  it('读流报错 → reject', async () => {
    const f = fakeSftp();
    const p = copyRemoteFile(f.sftp, '/a', '/a.bak');
    f.emit('rs:error', new Error('boom'));
    await expect(p).rejects.toThrow('boom');
  });

  it('写流报错 → reject', async () => {
    const f = fakeSftp();
    const p = copyRemoteFile(f.sftp, '/a', '/a.bak');
    f.emit('ws:error', new Error('disk full'));
    await expect(p).rejects.toThrow('disk full');
  });

  it('先报错后 close 不会被当成成功', async () => {
    const f = fakeSftp();
    const p = copyRemoteFile(f.sftp, '/a', '/a.bak');
    f.emit('ws:error', new Error('nope'));
    f.emit('ws:close');
    await expect(p).rejects.toThrow('nope');
  });
});

describe('管理类工具注册完整性', () => {
  // 与 db.ts 的 OPS_AGENT_BUILTIN_TOOLS 一一对应：挂载了就必须真的注册，否则委派时才报错
  const expected = [
    'conn_list', 'conn_create', 'conn_update', 'conn_delete', 'conn_move',
    'group_create', 'group_rename', 'group_delete',
    'sftp_list', 'sftp_mkdir', 'sftp_rename', 'sftp_backup', 'sftp_delete',
  ];

  it('新增的管理类工具都已注册', () => {
    const names = makeTools().map((t) => t.name);
    for (const n of expected) expect(names, `缺少工具 ${n}`).toContain(n);
  });

  it('每个工具都带 description 与 inputSchema', () => {
    for (const t of makeTools()) {
      expect(t.description, t.name).toBeTruthy();
      expect((t as { inputSchema?: unknown }).inputSchema, t.name).toBeTruthy();
    }
  });
});
