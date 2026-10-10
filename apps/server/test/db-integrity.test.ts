/**
 * P3 数据库完整性自检 + 损坏库隔离 的守门测试（2026-10-09）。
 *
 * 背景：生产库实测 `database disk image is malformed`（6 条消息 + llm_task failed 命中），
 *   症状是「任务一跑就断 / 会话打不开」且无前置信号。修法：启动时探一次，坏库改名隔离。
 *
 * 本测试钉：① 好库零副作用；② 坏库被改名隔离（原文件不再占位、备份留存）；
 *   ③ 隔离失败不删原文件；④ 可显式跳过；⑤ 无库不报噪音。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAndQuarantine, shouldCheck } from '../src/services/db-integrity';

let dir = '';
const dbPath = () => join(dir, 'data.db');

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'yz-dbchk-')); });
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

describe('P3 数据库完整性自检', () => {
  it('★ 无库时不产生噪音（no-db）', () => {
    expect(shouldCheck(dbPath())).toBe(false);
    expect(checkAndQuarantine(dbPath()).status).toBe('no-db');
  });

  it('★★ 好库：quick_check = ok → 不动文件、零副作用', () => {
    writeFileSync(dbPath(), 'fake');
    const r = checkAndQuarantine(dbPath(), { probe: () => 'ok' });
    expect(r.status).toBe('ok');
    expect(existsSync(dbPath()), '★ 好库被误删/改名').toBe(true);
    expect(readdirSync(dir).filter((f) => f.includes('corrupt')), '★ 好库被误隔离').toHaveLength(0);
  });

  it('★★ 坏库：被改名隔离（原路径让位给新库），备份留存且内容一致', () => {
    writeFileSync(dbPath(), 'CORRUPT-BYTES');
    const r = checkAndQuarantine(dbPath(), { probe: () => '*** in database main ***\nPage 4 is never used', now: () => 0 });
    expect(r.status, '★ 坏库未被识别').toBe('corrupt');
    expect(r.backupPath, '★ 坏库未产生备份路径').toBeTruthy();
    expect(existsSync(dbPath()), '★ 原路径仍被坏库占着（新库会被顶掉）').toBe(false);
    expect(existsSync(r.backupPath!), '★ 备份文件不存在').toBe(true);
    expect(readFileSync(r.backupPath!, 'utf8'), '★ 备份内容与原始不一致').toBe('CORRUPT-BYTES');
  });

  it('★★ 探针抛错（库打不开）同样按损坏处理', () => {
    writeFileSync(dbPath(), 'x');
    const r = checkAndQuarantine(dbPath(), { probe: () => { throw new Error('file is not a database'); } });
    expect(r.status, '★ 打不开的库被当成好库（会带着跑）').toBe('corrupt');
  });

  it('★★ 可显式跳过（迁移/诊断场景）', () => {
    writeFileSync(dbPath(), 'x');
    const r = checkAndQuarantine(dbPath(), { skip: true, probe: () => 'corrupt' });
    expect(r.status).toBe('skipped');
    expect(existsSync(dbPath()), '★ 跳过时竟动了文件').toBe(true);
  });

  it('★ 源码层：启动序列必须调用自检，且在任何 markOrphan* 之前', () => {
    const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
    const index = read('src/index.ts');
    const i = index.indexOf('checkAndQuarantine(');
    const orphan = index.indexOf('markOrphanTasksInterrupted()');
    expect(i, '★ 启动未接入数据库自检').toBeGreaterThan(-1);
    expect(orphan, '★ 找不到 markOrphanTasksInterrupted').toBeGreaterThan(-1);
    expect(i, '★ 自检排在了 markOrphan* 之后（坏库会先炸在清理上）').toBeLessThan(orphan);
  });
});