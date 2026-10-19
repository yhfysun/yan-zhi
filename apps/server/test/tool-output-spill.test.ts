// 超大工具输出落盘单测（services/tool-output-spill.ts，2026-10-19）。
// 关键不变量：全文必须完整落盘可回读；上下文只留首尾+路径；落盘失败必须优雅回退。
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hoisted = vi.hoisted(() => ({ dir: '' }));
vi.mock('../src/services/artifact-dir.js', () => ({
  ensureArtifactDirFor: () => ({ dir: hoisted.dir }),
}));

import {
  spillOversizedToolOutput,
  gcSpillFiles,
  TOOL_SPILL_THRESHOLD_CHARS,
  TOOL_SPILL_TTL_MS,
  TOOL_SPILL_MAX_FILES,
} from '../src/services/tool-output-spill.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-spill-test-'));

beforeAll(() => { hoisted.dir = TMP; });
afterAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

describe('spillOversizedToolOutput', () => {
  it('低于阈值的输出原样返回、不落盘', () => {
    const text = 'x'.repeat(TOOL_SPILL_THRESHOLD_CHARS);
    const r = spillOversizedToolOutput({ conversationId: 'c1', toolName: 'cmd_exec', text });
    expect(r.spilled).toBe(false);
    expect(r.text).toBe(text);
    expect(fs.readdirSync(TMP).length).toBe(0);
  });

  it('★ 超过阈值：全文完整落盘，上下文只留首尾 + 路径', () => {
    const original = 'HEAD-' + 'm'.repeat(30000) + '-TAIL';
    const r = spillOversizedToolOutput({ conversationId: 'c1', toolName: 'cmd_exec', text: original });
    expect(r.spilled).toBe(true);
    expect(r.path).toBeTruthy();
    // 文件内容与原文逐字一致（信息不丢）
    expect(fs.readFileSync(r.path!, 'utf-8')).toBe(original);
    // 上下文文本：含首尾与落盘路径，且明显变短
    expect(r.text).toContain('HEAD-');
    expect(r.text).toContain('-TAIL');
    expect(r.text).toContain(r.path!);
    expect(r.text).toContain('已落盘');
    expect(r.text.length).toBeLessThan(original.length / 2);
  });

  it('无会话 id 不落盘（后台/无名调用走普通截断）', () => {
    const r = spillOversizedToolOutput({ conversationId: '', toolName: 'cmd_exec', text: 'x'.repeat(20000) });
    expect(r.spilled).toBe(false);
  });

  it('落盘失败优雅回退（返回原文，由调用方走普通截断）', () => {
    hoisted.dir = path.join(TMP, 'no-such-sub-dir', 'deeper');
    const text = 'x'.repeat(20000);
    const r = spillOversizedToolOutput({ conversationId: 'c1', toolName: 'cmd_exec', text });
    expect(r.spilled).toBe(false);
    expect(r.text).toBe(text);
    hoisted.dir = TMP; // 恢复
  });
});

describe('gcSpillFiles（自动清理）', () => {
  const GC = fs.mkdtempSync(path.join(os.tmpdir(), 'spill-gc-test-'));
  afterAll(() => { fs.rmSync(GC, { recursive: true, force: true }); });

  function makeFile(name: string, ageMs: number): string {
    const p = path.join(GC, name);
    fs.writeFileSync(p, 'x');
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(p, t, t);
    return p;
  }

  it('按 TTL 删除过期文件；新文件与非本机制文件保留', () => {
    const old = makeFile('tool-output-old.txt', TOOL_SPILL_TTL_MS + 60_000);
    const fresh = makeFile('tool-output-fresh.txt', 60_000);
    const userArtifact = makeFile('report.docx', TOOL_SPILL_TTL_MS + 60_000);
    const deleted = gcSpillFiles(GC, { now: Date.now() });
    expect(deleted).toBe(1);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(fs.existsSync(userArtifact)).toBe(true); // ★ 不碰用户产物
  });

  it('超过数量上限时从最老的删', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spill-gc-cap-'));
    try {
      for (let i = 0; i < 5; i++) {
        const p = path.join(dir, `tool-output-${i}.txt`);
        fs.writeFileSync(p, 'x');
        const t = new Date(Date.now() - (5 - i) * 60_000); // i 越小越老
        fs.utimesSync(p, t, t);
      }
      const deleted = gcSpillFiles(dir, { now: Date.now(), maxFiles: 3 });
      expect(deleted).toBe(2);
      expect(fs.existsSync(path.join(dir, 'tool-output-0.txt'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'tool-output-1.txt'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'tool-output-4.txt'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('缺省常量有界（TTL 7 天 / 每目录 200 个）', () => {
    expect(TOOL_SPILL_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(TOOL_SPILL_MAX_FILES).toBe(200);
  });
});
