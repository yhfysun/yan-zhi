/**
 * 运维会话录制内核（asciinema v2 .cast）正式测试类。
 *
 * 守护的东西：格式必须是任何 asciinema 播放器都认的 v2 —— 头行合法、事件行时间戳单调、
 * 坏行不至于让整段回放打不开；另外录制**不能反噬终端**：落盘失败要静默降级、
 * 超上限要截断而不是无限写盘、会话结束必须 flush（掉线也别丢最后一段）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TermRecorder, castEvent, castHeader, parseCast, recordingFile, recordingFileSize,
  recordingsDir, removeRecordingFile, readRecordingFile, setRecordingsDirForTest, sweepOrphanRecordings,
} from '../src/plugins/ops-recordings.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ops-rec-'));
  setRecordingsDirForTest(dir);
});
afterEach(() => {
  setRecordingsDirForTest(null);
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** 造一个可控时钟的录制器（不依赖真实时间，测试才稳定） */
function recorderAt(clock: { t: number }, over: Record<string, unknown> = {}) {
  return new TermRecorder({
    connectionId: 'ops-1', connectionName: 'web-1', transport: 'websocket',
    cols: 120, rows: 32, now: () => clock.t, ...over,
  });
}

describe('castHeader / castEvent · 格式', () => {
  it('头行是 asciinema v2，行列取整且不为 0', () => {
    const h = JSON.parse(castHeader(120.7, 0, 1750000000000));
    expect(h).toMatchObject({ version: 2, width: 120, height: 24, timestamp: 1750000000 });
    expect(h.env.TERM).toBe('xterm-256color');
  });

  it('事件行时间戳保留 3 位小数且不为负', () => {
    expect(JSON.parse(castEvent(0.248848, 'o', 'x'))[0]).toBe(0.249);
    expect(JSON.parse(castEvent(-5, 'o', 'x'))[0]).toBe(0);
  });

  it('控制字符与换行被正确转义（事件行必须是单行 NDJSON）', () => {
    const line = castEvent(1, 'o', 'a\r\nb\u001b[31m');
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd().includes('\n')).toBe(false);
    expect(JSON.parse(line)[2]).toBe('a\r\nb\u001b[31m');
  });

  it('resize 事件的 data 是 "宽x高"', () => {
    expect(JSON.parse(castEvent(2, 'r', '132x43'))).toEqual([2, 'r', '132x43']);
  });
});

describe('parseCast · 解析', () => {
  it('头行 + 事件行往返一致', () => {
    const text = castHeader(100, 40, 1750000000000) + castEvent(0.5, 'o', 'hi\r\n') + castEvent(1, 'i', 'ls\r');
    const { header, events, skipped } = parseCast(text);
    expect(header).toMatchObject({ version: 2, width: 100, height: 40 });
    expect(events).toEqual([
      { t: 0.5, type: 'o', data: 'hi\r\n' },
      { t: 1, type: 'i', data: 'ls\r' },
    ]);
    expect(skipped).toBe(0);
  });

  it('★ 坏行只计数跳过，不让整段回放失败', () => {
    const text = castHeader(80, 24, 0) + 'not json\n' + castEvent(1, 'o', 'ok') + '[1,2]\n';
    const { events, skipped } = parseCast(text);
    expect(events).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('空文本不抛错', () => {
    expect(parseCast('')).toEqual({ header: null, events: [], skipped: 0 });
  });
});

describe('TermRecorder · 录制', () => {
  it('★ 头行在构造时就落盘（会话立刻掉线也是合法 .cast，而非只有事件行的坏文件）', () => {
    const clock = { t: 1000 };
    const rec = recorderAt(clock);
    const text = rec.read()!;
    expect(text.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(text.trim()).version).toBe(2);
    rec.remove();
  });

  it('输出 / 输入 / 尺寸变更都按类型记录，时间是相对会话开始的秒数', () => {
    const clock = { t: 1000 };
    const rec = recorderAt(clock);
    rec.output(Buffer.from('total 0\r\n'));
    clock.t = 1500;
    rec.input('ls\r');
    clock.t = 2000;
    rec.resize(132, 43);
    const meta = rec.stop();

    const { events } = parseCast(rec.read()!);
    expect(events).toEqual([
      { t: 0, type: 'o', data: 'total 0\r\n' },
      { t: 0.5, type: 'i', data: 'ls\r' },
      { t: 1, type: 'r', data: '132x43' },
    ]);
    expect(meta.durationSec).toBe(1);
    expect(meta.bytes).toBeGreaterThan(0);
    expect(meta.truncated).toBe(false);
  });

  it('★ stop() 会 flush 缓冲（否则掉线时最后一段输出丢失）', () => {
    const clock = { t: 0 };
    const rec = recorderAt(clock);
    rec.output('还没到落盘阈值的一段');   // 小于落盘阈值，仍在内存里
    rec.stop();
    expect(rec.read()).toContain('还没到落盘阈值的一段');
  });

  it('★ 超过上限 → 截断标记 + 停止写入，而不是无限吃磁盘', () => {
    const clock = { t: 0 };
    const rec = recorderAt(clock, { maxBytes: 200 });
    for (let i = 0; i < 50; i++) rec.output('x'.repeat(50));
    const meta = rec.stop();
    expect(meta.truncated).toBe(true);
    expect(meta.bytes).toBeLessThanOrEqual(300);
    expect(rec.read()).toContain('录制已达上限');
  });

  it('结束时间与时长都落在元数据里', () => {
    const clock = { t: 1000 };
    const rec = recorderAt(clock);
    clock.t = 61000;
    const meta = rec.stop();
    expect(meta.startedAt).toBe(1000);
    expect(meta.endedAt).toBe(61000);
    expect(meta.durationSec).toBe(60);
  });

  it('remove() 删掉文件（淘汰 / 用户删除用）', () => {
    const rec = recorderAt({ t: 0 });
    const id = rec.meta.id;
    expect(recordingFileSize(id)).toBeGreaterThan(0);
    rec.remove();
    expect(existsSync(join(dir, `${id}.cast`))).toBe(false);
  });

  it('空输出不产生事件（避免刷出大量空帧）', () => {
    const rec = recorderAt({ t: 0 });
    rec.output(Buffer.alloc(0));
    rec.output('');
    rec.stop();
    expect(parseCast(rec.read()!).events).toHaveLength(0);
  });
});

describe('录像文件 · 路径与清理', () => {
  it('★ 路径穿越的 id 一律拒绝（文件名只认我们自己的 rec- 前缀）', () => {
    expect(recordingFile('../../etc/passwd')).toBeNull();
    expect(recordingFile('rec-ok-1')).toBe(join(dir, 'rec-ok-1.cast'));
    expect(readRecordingFile('../../etc/passwd')).toBeNull();
    expect(() => removeRecordingFile('../../etc/passwd')).not.toThrow();
  });

  it('★ sweep 清掉索引里没有的孤儿 .cast，保留在册的', () => {
    writeFileSync(join(dir, 'rec-known.cast'), 'x');
    writeFileSync(join(dir, 'rec-orphan.cast'), 'x');
    writeFileSync(join(dir, 'other.txt'), 'x');
    const removed = sweepOrphanRecordings(['rec-known']);
    expect(removed).toBe(1);
    expect(existsSync(join(dir, 'rec-known.cast'))).toBe(true);
    expect(existsSync(join(dir, 'rec-orphan.cast'))).toBe(false);
    // 非 .cast 文件不动
    expect(existsSync(join(dir, 'other.txt'))).toBe(true);
  });

  it('目录不存在时 sweep 不抛错', () => {
    setRecordingsDirForTest(join(dir, '不存在'));
    expect(sweepOrphanRecordings([])).toBe(0);
  });

  it('recordingsDir 在测试覆盖生效时指向临时目录', () => {
    expect(recordingsDir()).toBe(dir);
  });
});
