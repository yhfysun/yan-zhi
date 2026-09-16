/**
 * 模型可见性闸门单测（平台级 llm_enabled + 模型级 visible）。
 *
 * 背景：有的平台一个账号几百个模型，全铺进模型下拉没法用。两级开关的语义是：
 *   - platform.llm_enabled = 0 → 该平台下**所有**模型对下拉与智能体动态选型不可见
 *   - model.visible = 0        → 单个模型不可见
 *   - 两者都是**使用偏好**：不动远端同步结果（enabled 会被拉取模型时改写，故不复用）
 *
 * 这里用内存 mock 的 db 钉住 SQL 闸门形态 + 真库拷贝上验证迁移幂等。
 * 真实 query 形态与 llm-task-manager.listAvailableModels / scheduled-tasks.findDefaultModel 一致。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const hoisted = vi.hoisted(() => {
  /** 平台：llm_enabled 控制整平台可见性 */
  const platforms = [
    { id: 'p_big', user_id: 'u1', name: '百炼', protocol: 'openai', is_builtin: 0, llm_enabled: 1 },
    { id: 'p_hidden', user_id: 'u1', name: 'agness', protocol: 'openai', is_builtin: 0, llm_enabled: 0 },
    { id: 'p_other', user_id: 'u2', name: '别人的', protocol: 'openai', is_builtin: 0, llm_enabled: 1 },
  ];
  const models = [
    { id: 'm1', platform_id: 'p_big', user_id: 'u1', model_id: 'qwen-max', alias: '千问', type: 'llm', enabled: 1, visible: 1, is_default: 1 },
    { id: 'm2', platform_id: 'p_big', user_id: 'u1', model_id: 'qwen-turbo', alias: null, type: 'llm', enabled: 1, visible: 0, is_default: 0 },
    { id: 'm3', platform_id: 'p_hidden', user_id: 'u1', model_id: 'agnes-3.0-flash', alias: 'flash', type: 'llm', enabled: 1, visible: 1, is_default: 0 },
    { id: 'm4', platform_id: 'p_big', user_id: 'u1', model_id: 'embed-x', alias: null, type: 'embedding', enabled: 1, visible: 1, is_default: 0 },
    { id: 'm5', platform_id: 'p_other', user_id: 'u2', model_id: 'gpt-4o', alias: null, type: 'llm', enabled: 1, visible: 1, is_default: 0 },
  ];

  /** 极简 SQL 求值器：只认本测试用到的几种形态，够钉住闸门语义 */
  function queryModels(userId: string, opts: { platformId?: string; typeLlmOnly?: boolean } = {}) {
    return models.filter((m) => {
      if (m.user_id !== userId) return false;
      if (m.enabled !== 1) return false;
      if (m.visible !== 1) return false;
      const p = platforms.find((x) => x.id === m.platform_id);
      if (!p || p.llm_enabled !== 1) return false;
      if (opts.platformId && m.platform_id !== opts.platformId) return false;
      if (opts.typeLlmOnly && m.type !== 'llm') return false;
      return true;
    });
  }

  return { platforms, models, queryModels };
});

afterEach(() => vi.restoreAllMocks());

describe('可见性闸门语义', () => {
  it('平台总开关关闭 → 该平台下模型全部不可见（即使模型自身 visible=1）', () => {
    const visible = hoisted.queryModels('u1');
    expect(visible.some((m) => m.platform_id === 'p_hidden')).toBe(false);
    // m3 在关闭的平台上，尽管 visible=1 也不该出现
    expect(visible.find((m) => m.id === 'm3')).toBeUndefined();
  });

  it('模型自身 visible=0 → 单个模型不可见（同平台其他模型不受影响）', () => {
    const visible = hoisted.queryModels('u1');
    expect(visible.find((m) => m.id === 'm2')).toBeUndefined();
    expect(visible.find((m) => m.id === 'm1')).toBeDefined();
  });

  it('两个开关都开才可见：默认模型在可见集合里', () => {
    const def = hoisted.queryModels('u1', { typeLlmOnly: true }).find((m) => m.is_default === 1);
    expect(def?.id).toBe('m1');
  });

  it('用户隔离：别人的模型不会被闸门放行到当前用户', () => {
    expect(hoisted.queryModels('u1').find((m) => m.id === 'm5')).toBeUndefined();
  });

  it('隐藏整个平台后，默认模型回退不会选中它的模型', () => {
    // 关闭 p_big（原本默认模型 m1 所在平台）
    const p = hoisted.platforms.find((x) => x.id === 'p_big')!;
    const backup = p.llm_enabled;
    p.llm_enabled = 0;
    const def = hoisted.queryModels('u1', { typeLlmOnly: true }).find((m) => m.is_default === 1);
    expect(def).toBeUndefined();
    p.llm_enabled = backup;
  });

  it('embedding 等非对话模型不进对话选型（type 过滤仍生效）', () => {
    const llmOnly = hoisted.queryModels('u1', { typeLlmOnly: true });
    expect(llmOnly.some((m) => m.type === 'embedding')).toBe(false);
    expect(llmOnly.some((m) => m.id === 'm4')).toBe(false);
  });

  it('恢复可见后模型重新出现在可选集合', () => {
    const m = hoisted.models.find((x) => x.id === 'm2')!;
    m.visible = 1;
    expect(hoisted.queryModels('u1').find((x) => x.id === 'm2')).toBeDefined();
    m.visible = 0;
  });
});

describe('可见性列迁移（真库拷贝上验证幂等）', () => {
  let tmpDir = '';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-visibility-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('两列可加且重复执行安全（对应 db.ts 里的 try/catch ALTER）', async () => {
    // 用 createRequire 直接拿内置模块：vite/vitest 的解析器不认 'node:sqlite' 这个新内置名
    const { createRequire } = await import('node:module');
    const require_ = createRequire(import.meta.url);
    const { DatabaseSync } = require_('node:sqlite') as typeof import('node:sqlite');
    const dbPath = path.join(tmpDir, 't.db');
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE platform (id TEXT PRIMARY KEY, name TEXT, is_builtin INTEGER DEFAULT 0)`);
    db.exec(`CREATE TABLE model (id TEXT PRIMARY KEY, platform_id TEXT, model_id TEXT, enabled INTEGER DEFAULT 1)`);
    db.prepare('INSERT INTO platform (id, name) VALUES (?, ?)').run('p1', '平台一');
    db.prepare('INSERT INTO model (id, platform_id, model_id) VALUES (?, ?, ?)').run('m1', 'p1', 'mm');

    // 与 db.ts 新增的两条迁移一致
    db.exec('ALTER TABLE platform ADD COLUMN llm_enabled INTEGER NOT NULL DEFAULT 1');
    db.exec('ALTER TABLE model ADD COLUMN visible INTEGER NOT NULL DEFAULT 1');
    // 幂等：重复执行应抛错（代码里被 try/catch 吞掉）
    expect(() => db.exec('ALTER TABLE platform ADD COLUMN llm_enabled INTEGER NOT NULL DEFAULT 1')).toThrow();
    expect(() => db.exec('ALTER TABLE model ADD COLUMN visible INTEGER NOT NULL DEFAULT 1')).toThrow();

    // 既有行必须默认可见 —— 迁移不能把老用户模型一下全隐藏
    expect((db.prepare('SELECT llm_enabled FROM platform WHERE id = ?').get('p1') as any).llm_enabled).toBe(1);
    expect((db.prepare('SELECT visible FROM model WHERE id = ?').get('m1') as any).visible).toBe(1);

    // 闸门查询可执行（形态与 listAvailableModels 一致）
    const rows = db.prepare(
      `SELECT m.id FROM model m JOIN platform p ON p.id = m.platform_id
        WHERE m.enabled = 1 AND m.visible = 1 AND p.llm_enabled = 1`,
    ).all();
    expect(rows.length).toBe(1);
    db.close();
  });
});