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
  TOOL_SPILL_THRESHOLD_CHARS,
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
