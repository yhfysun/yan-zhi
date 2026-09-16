/**
 * 产物目录解析（artifact-dir service）单测 —— 方案 A「会话 id 主规则」的服务端行为钉死。
 *
 * 覆盖三条硬约定：
 *   1. 写入口径（ensureArtifactDirFor）：永远落 .yan-zhi/tasks/<conversationId>/<category>/，
 *      不做历史回退 —— 否则「改名 404」会以另一种形式复活
 *   2. 读取口径（resolveArtifactDirFor）：id 目录还没建、旧「日期-标题」目录真实有货 → 回退旧目录
 *      （历史产物零搬运可读）；id 目录一旦有内容 → 永远以 id 目录为准
 *   3. 会话改名后读取落点不变（回归本次修复的根因）
 *
 * db 与 serverState 用内存 mock（同 memory-inject.test.ts 套路），磁盘用临时目录真建真探。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hoisted = vi.hoisted(() => {
  const conversations: Record<string, { title: string; created_at: number; space_id?: string | null }> = {
    conv_renamed: { title: '运维控制台', created_at: new Date(2026, 8, 10, 9, 0, 0).getTime() },
    conv_plain: { title: '销售报表', created_at: new Date(2026, 8, 15, 10, 0, 0).getTime() },
    conv_rename_me: { title: '运维控制台', created_at: new Date(2026, 8, 10, 9, 0, 0).getTime() },
  };
  const spaces: Record<string, { dir_path: string }> = {};
  const db = {
    prepare(sql: string): any {
      if (/FROM\s+conversation\s+c/i.test(sql)) {
        return {
          get: (id: string) => {
            const c = conversations[id];
            if (!c) return undefined;
            const space = c.space_id ? spaces[c.space_id] : undefined;
            return { title: c.title, created_at: c.created_at, space_dir: space?.dir_path || '' };
          },
          all: () => [],
          run: () => {},
        };
      }
      return { get: () => undefined, all: () => [], run: () => {} };
    },
    exec: () => {},
    pragma: () => {},
  };
  return { db, conversations, spaces, serverState: { workspaceDir: '' } };
});

vi.mock('../src/db.js', () => ({
  db: hoisted.db,
  hasSqliteVec: false,
  // resolveArtifactRoot 的最终兜底根：与真实 db.ts 的 dataDir 同口径（读 DATA_DIR，绝对路径）
  get dataDir() { return process.env.DATA_DIR || ''; },
}));
vi.mock('../src/state.js', () => ({ serverState: hoisted.serverState }));

import {
  resolveArtifactDirFor,
  ensureArtifactDirFor,
  findArtifactFileInDirs,
} from '../src/services/artifact-dir.js';
import { buildArtifactRelDir, joinArtifactPath } from '@yan-zhi/shared';

const CID = 'conv_renamed';
const CREATED = new Date(2026, 8, 10, 9, 0, 0).getTime();
const LEGACY_TASK = '2026-09-10-运维控制台';
let tmpRoot = '';

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-artifact-'));
  process.env.DATA_DIR = tmpRoot;
  hoisted.serverState.workspaceDir = '';
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

/** 在给定根下按旧命名建目录并放入一个文件，模拟改名前落盘的历史产物 */
function seedLegacy(category: 'upload' | 'intermediate' | 'deliverable', fileName: string, root = tmpRoot): string {
  const rel = buildArtifactRelDir({ title: hoisted.conversations[CID].title, createdAt: CREATED, category });
  const dir = joinArtifactPath(root, rel);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, fileName);
  fs.writeFileSync(file, 'legacy');
  return file;
}

describe('ensureArtifactDirFor 写入口径', () => {
  it('永远落会话 id 目录，不做历史回退（即使旧目录存在且 id 目录为空）', () => {
    seedLegacy('deliverable', 'image-1.png');
    const info = ensureArtifactDirFor({ conversationId: CID, category: 'deliverable' });
    expect(info.relDir).toBe(`.yan-zhi/tasks/${CID}/deliverables`);
    expect(info.dir).toBe(joinArtifactPath(tmpRoot, info.relDir));
    expect(fs.existsSync(info.dir)).toBe(true);
  });

  it('mkdir -p：三级目录一次建齐', () => {
    const info = ensureArtifactDirFor({ conversationId: CID, category: 'intermediate' });
    expect(fs.existsSync(path.join(info.dir))).toBe(true);
  });

  it('conversationId 缺失 → 退回日期-未命名任务目录（产物有归档位）', () => {
    const info = ensureArtifactDirFor({ category: 'upload' });
    expect(info.relDir).toContain('未命名任务');
    expect(fs.existsSync(info.dir)).toBe(true);
  });
});

describe('resolveArtifactDirFor 读取口径', () => {
  it('id 目录为空 + 旧目录有货 → 回退旧目录（历史产物可读）', () => {
    seedLegacy('deliverable', 'image-old.png');
    const info = resolveArtifactDirFor({ conversationId: CID, category: 'deliverable' });
    expect(info.relDir).toBe(`.yan-zhi/tasks/${LEGACY_TASK}/deliverables`);
  });

  it('id 目录一旦有内容 → 以 id 目录为准，不再回退（写读一致）', () => {
    seedLegacy('deliverable', 'image-old.png');
    ensureArtifactDirFor({ conversationId: CID, category: 'deliverable' }); // 新产物落 id 目录
    fs.writeFileSync(path.join(tmpRoot, '.yan-zhi', 'tasks', CID, 'deliverables', 'image-new.png'), 'new');
    const info = resolveArtifactDirFor({ conversationId: CID, category: 'deliverable' });
    expect(info.relDir).toBe(`.yan-zhi/tasks/${CID}/deliverables`);
  });

  it('会话改名后读取落点不变（回归根因：标题参与命名导致 404）', () => {
    // 用独立会话，避免污染共享 mock 的标题状态
    const cid = 'conv_rename_me';
    // 改名前：旧目录有历史产物 → 回退旧目录（改名前场景可读）
    const legacyRel = buildArtifactRelDir({ title: hoisted.conversations[cid].title, createdAt: CREATED, category: 'deliverable' });
    const legacyDir = joinArtifactPath(tmpRoot, legacyRel);
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'image-old.png'), 'legacy');
    const before = resolveArtifactDirFor({ conversationId: cid, category: 'deliverable' }).relDir;
    expect(before).toBe(legacyRel);

    // 改名后：标题不再是目录键，落点锚定在 id 目录，不再随标题漂移
    hoisted.conversations[cid].title = '运维平台 V2';
    const after = resolveArtifactDirFor({ conversationId: cid, category: 'deliverable' }).relDir;
    expect(after).toBe(`.yan-zhi/tasks/${cid}/deliverables`);
    // 稳定键生效：同会话继续解析永远是这个目录
    expect(resolveArtifactDirFor({ conversationId: cid, category: 'deliverable' }).relDir).toBe(after);
  });

  it('旧目录不存在时直接给 id 主目录（不误回落点）', () => {
    const info = resolveArtifactDirFor({ conversationId: 'conv_plain', category: 'deliverable' });
    expect(info.relDir).toBe('.yan-zhi/tasks/conv_plain/deliverables');
  });

  it('会话不存在于库 → 按 id 归档不散落（id 仍是稳定键）', () => {
    const info = resolveArtifactDirFor({ conversationId: 'conv_ghost', category: 'upload' });
    expect(info.relDir).toBe('.yan-zhi/tasks/conv_ghost/uploads');
  });

  it('空间目录优先于工作目录与 DATA_DIR 作为根', () => {
    const spaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-space-'));
    try {
      hoisted.spaces['s1'] = { dir_path: spaceRoot };
      hoisted.conversations[CID].space_id = 's1';
      const info = resolveArtifactDirFor({ conversationId: CID, category: 'deliverable' });
      expect(info.root).toBe(spaceRoot);
      expect(info.dir.startsWith(spaceRoot)).toBe(true);
      delete hoisted.conversations[CID].space_id;
      delete hoisted.spaces['s1'];
    } finally {
      fs.rmSync(spaceRoot, { recursive: true, force: true });
    }
  });
});

describe('findArtifactFileInDirs 候选探测', () => {
  it('按候选顺序命中：id 目录优先，miss 再落旧目录', () => {
    const legacyFile = seedLegacy('deliverable', 'image-old.png');
    const candidates = [
      `.yan-zhi/tasks/${CID}/deliverables`,
      `.yan-zhi/tasks/${LEGACY_TASK}/deliverables`,
    ];
    const hit = findArtifactFileInDirs(candidates, tmpRoot, 'image-old.png');
    // 命中路径统一为正斜杠风格（joinArtifactPath 的跨平台约定）
    expect(hit?.replace(/\\/g, '/')).toBe(legacyFile.replace(/\\/g, '/'));
  });

  it('id 目录有同名文件时优先命中 id 目录（新产物不被旧产物遮蔽）', () => {
    seedLegacy('deliverable', 'image-x.png');
    fs.mkdirSync(path.join(tmpRoot, '.yan-zhi', 'tasks', CID, 'deliverables'), { recursive: true });
    const newFile = path.join(tmpRoot, '.yan-zhi', 'tasks', CID, 'deliverables', 'image-x.png');
    fs.writeFileSync(newFile, 'new');
    const hit = findArtifactFileInDirs(
      [`.yan-zhi/tasks/${CID}/deliverables`, `.yan-zhi/tasks/${LEGACY_TASK}/deliverables`],
      tmpRoot,
      'image-x.png',
    );
    expect(hit).toBe(newFile);
    expect(fs.readFileSync(hit!, 'utf8')).toBe('new');
  });

  it('全 miss 返回 null', () => {
    expect(findArtifactFileInDirs([`.yan-zhi/tasks/${CID}/deliverables`], tmpRoot, 'nope.png')).toBeNull();
  });
});
