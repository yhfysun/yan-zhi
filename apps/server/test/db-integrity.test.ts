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
/**
 * ★★★ 高危回归（2026-10-10 实测事故）：**驱动加载失败绝不能触发"隔离"**。
 *
 * 事故经过：用 Node 22（NODE_MODULE_VERSION 137）直接跑 server，而 better-sqlite3
 *   是按 130 编译的 → `ERR_DLOPEN_FAILED`（ABI 不匹配）→ 旧实现把它归为 `probe-error`
 *   → 走隔离分支 → **把一份完好、188MB、5000+ 条消息的库改名成 data.db.corrupt-***，
 *   然后以空库启动。用户视角就是"我的数据全没了"。
 *
 * 判据：探针失败必须分两类，处置**相反** ——
 *   · 库本身坏（malformed / not a database）→ 隔离（带着跑会让请求随机暴毙）
 *   · 环境/驱动问题（ABI 不匹配 / 模块加载失败）→ **不隔离**，原库保持不动
 */
describe('db-integrity · 驱动问题不得触发隔离（2026-10-10 事故回归）', () => {
  const tmpDb = () => {
    const dir = mkdtempSync(join(tmpdir(), 'yz-dbint-'));
    const p = join(dir, 'data.db');
    writeFileSync(p, 'x'.repeat(4096));
    return p;
  };

  it('★★★ ERR_DLOPEN_FAILED（ABI 不匹配）→ skipped，且原库**原封不动**', async () => {
    const { checkAndQuarantine } = await import('../src/services/db-integrity.js');
    const p = tmpDb();
    const err: any = new Error(
      "The module was compiled against a different Node.js version using NODE_MODULE_VERSION 130. This version of Node.js requires NODE_MODULE_VERSION 137.",
    );
    err.code = 'ERR_DLOPEN_FAILED';
    const r = checkAndQuarantine(p, { probe: () => { throw err; } });
    expect(r.status, '★ 驱动问题被误判为损坏 → 会隔离好库').toBe('skipped');
    expect(existsSync(p), '★ 原库被改名/删除了').toBe(true);
    // 目录里不得出现任何 .corrupt-* 隔离产物
    const siblings = readdirSync(join(p, '..'));
    expect(siblings.filter((f) => f.includes('.corrupt-')), '★ 产生了隔离文件').toEqual([]);
  });

  it('★★ 其他环境类错误（Cannot find module / dlopen）同样不隔离', async () => {
    const { checkAndQuarantine } = await import('../src/services/db-integrity.js');
    for (const msg of ['Cannot find module \'better-sqlite3\'', 'dlopen failed: invalid ELF header']) {
      const p = tmpDb();
      const r = checkAndQuarantine(p, { probe: () => { throw new Error(msg); } });
      expect(r.status, `「${msg}」被误判为损坏`).toBe('skipped');
      expect(existsSync(p)).toBe(true);
    }
  });

  it('★ 真损坏（malformed）仍必须隔离 —— 修驱动问题时不能把这条一并关掉', async () => {
    const { checkAndQuarantine } = await import('../src/services/db-integrity.js');
    const p = tmpDb();
    const r = checkAndQuarantine(p, {
      probe: () => { throw new Error('database disk image is malformed'); },
    });
    expect(r.status, '★ 真损坏未隔离 → 会带着坏库跑').toBe('corrupt');
    expect(r.backupPath, '应给出隔离路径').toBeTruthy();
    expect(existsSync(r.backupPath!), '隔离文件应存在（改名保底）').toBe(true);
    expect(existsSync(p), '主库名应已被让出').toBe(false);
  });
});
