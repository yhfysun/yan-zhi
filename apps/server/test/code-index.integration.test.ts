// code-index 集成自测 —— 真实 sqlite（隔离 DATA_DIR）+ embedding 不可用的降级路径
// 守住的语义：
//   1) 表懒创建成功（code_index_file / code_index_chunk 存在）；
//   2) embedding 不可用时 build/search 返回**明确原因**而不是静默空结果；
//   3) 空工作区 / 非代码文件正确处理。
// ★ DATA_DIR 必须在 import db 前设置 —— 全部用动态 import。
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fsp from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DATA = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-codeidx-data-'));
const WS = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-codeidx-ws-'));

process.env.DATA_DIR = DATA;

let buildCodeIndex: typeof import('../src/services/code-index.js').buildCodeIndex;
let searchWorkspaceCode: typeof import('../src/services/code-index.js').searchWorkspaceCode;
let db: typeof import('../src/db.js').db;

beforeAll(async () => {
  ({ db } = await import('../src/db.js'));
  ({ buildCodeIndex, searchWorkspaceCode } = await import('../src/services/code-index.js'));
  fsSync.writeFileSync(path.join(WS, 'app.ts'), 'export function alpha() {\n  return 1;\n}\n');
  fsSync.writeFileSync(path.join(WS, 'readme.md'), '# not code\n');
});

afterAll(async () => {
  await fsp.rm(DATA, { recursive: true, force: true });
  await fsp.rm(WS, { recursive: true, force: true });
});

describe('code-index（真实 sqlite + 无 embedding 环境）', () => {
  it('表懒创建成功（首次调用 build 后存在）', async () => {
    await buildCodeIndex(WS); // ensureTables 在此触发
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'code_index%'").all() as any[];
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(['code_index_chunk', 'code_index_file']);
  });

  it('embedding 不可用 → build 返回明确原因（不静默）', async () => {
    const r = await buildCodeIndex(WS);
    // 测试环境的 app_config 无 embedding 配置、Ollama 兜底大概率也不在 —— 两种结果都合法：
    // 有 embedding 时会真实建索引；没有时必须带 reason。
    if (!r.ok) {
      expect(r.reason).toContain('embedding');
    } else {
      expect(r.indexedFiles).toBeGreaterThanOrEqual(1);
    }
  });

  it('search 同样给出明确原因或真实结果', async () => {
    const r = await searchWorkspaceCode(WS, 'alpha function');
    if (!r.ok) {
      expect(r.reason!.length).toBeGreaterThan(0);
    } else {
      expect(r.hits.length).toBeGreaterThan(0);
      expect(r.hits[0].path).toContain('app.ts');
    }
  });

  it('空工作区 → 明确原因（无 embedding 时先报 embedding；有 embedding 时报索引为空）', async () => {
    const empty = fsSync.mkdtempSync(path.join(os.tmpdir(), 'yz-codeidx-empty-'));
    try {
      const r = await searchWorkspaceCode(empty, 'anything');
      expect(r.ok).toBe(false);
      expect((r.reason || '').length).toBeGreaterThan(0);
      // 有 embedding 时走到"索引为空"分支才报这个 —— 无 embedding 环境下两条都算正确降级
      expect(r.reason).toMatch(/embedding|没有可索引的代码文件/);
    } finally {
      await fsp.rm(empty, { recursive: true, force: true });
    }
  });
});
