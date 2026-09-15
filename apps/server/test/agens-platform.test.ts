/**
 * agnes 平台默认参数配置单测 —— 钉死三条硬约定：
 *
 *   1. 媒体能力按模型名自动带上（大小写不敏感）：名字含 image → image；含 video → video。
 *      平台目录接口不返回 capabilities，靠命名规律兜底，免去逐个手勾。
 *   2. 默认上下文窗口 = 1M（前后端同一常量口径）。
 *   3. 上下文窗口一次性迁移：< 1M 的提到 1M，**本机平台（Ollama 等）跳过**
 *      （本地小模型真实窗口只有 32K/64K，强抬到 1M 会让压缩不触发而直接超限）。
 *
 * db 用内存 mock（同 memory-inject.test.ts 套路），SQL 与参数全部记录后断言。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const sqlLog: { sql: string; params: any[] }[] = [];
  const config: Record<string, string> = {};
  /** 预置模型行，key = `${platformId}:${modelId}` */
  const models: Record<string, any> = {};

  function record(sql: string, params: any[]) {
    sqlLog.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
  }
  function lastMatching(re: RegExp) {
    return [...sqlLog].reverse().find((e) => re.test(e.sql));
  }
  function allMatching(re: RegExp) {
    return sqlLog.filter((e) => re.test(e.sql));
  }

  const db = {
    prepare(sql: string): any {
      const s = sql.replace(/\s+/g, ' ').trim();
      const run = (...p: any[]) => { record(s, p); return { changes: 4 }; };

      if (/app_config/i.test(s)) {
        return {
          get: (key: string) => { record(s, [key]); return config[key] !== undefined ? { value: config[key] } : undefined; },
          all: () => [],
          run: (...p: any[]) => {
            record(s, p);
            // INSERT ... ON CONFLICT(key) DO UPDATE：参数顺序 key, value, updated_at
            if (/^INSERT/i.test(s)) config[String(p[0])] = String(p[1]);
            return { changes: 1 };
          },
        };
      }
      // 目录补齐：查已存在模型的当前能力
      if (/^SELECT id, capabilities_json FROM model/i.test(s)) {
        return {
          get: (platformId: string, modelId: string) => {
            record(s, [platformId, modelId]);
            const row = models[`${platformId}:${modelId}`];
            return row ? { id: row.id, capabilities_json: row.capabilities_json } : undefined;
          },
          all: () => [],
          run,
        };
      }
      if (/^UPDATE model SET capabilities_json/i.test(s)) return { get: () => undefined, all: () => [], run };
      if (/^UPDATE model SET context_window/i.test(s)) return { get: () => undefined, all: () => [], run };
      if (/^INSERT OR IGNORE INTO model/i.test(s)) return { get: () => undefined, all: () => [], run };
      if (/^INSERT INTO model/i.test(s)) return { get: () => undefined, all: () => [], run };
      // user / platform / 其它未覆盖语句：空结果，但同样记录
      return {
        get: (...p: any[]) => { record(s, p); return undefined; },
        all: (...p: any[]) => { record(s, p); return []; },
        run,
      };
    },
    transaction(fn: any) { return () => fn(); },
    pragma() {},
  };

  return { db, sqlLog, config, models, lastMatching, allMatching };
});

vi.mock('../src/db.js', () => ({ db: hoisted.db }));

import {
  inferCapabilitiesFromModelId,
  DEFAULT_CONTEXT_WINDOW,
  bumpModelContextWindowToDefault,
  syncAgensModelCatalog,
} from '../src/agens-platform/service.js';

beforeEach(() => {
  hoisted.sqlLog.length = 0;
  for (const k of Object.keys(hoisted.config)) delete hoisted.config[k];
  for (const k of Object.keys(hoisted.models)) delete hoisted.models[k];
});

describe('媒体能力按模型名自动带上（大小写不敏感）', () => {
  it('名字含 image → 图片生成能力', () => {
    expect(inferCapabilitiesFromModelId('agnes-image-2.5-flash')).toEqual(['image']);
    expect(inferCapabilitiesFromModelId('agnes-image-2.1-flash')).toEqual(['image']);
  });

  it('名字含 video → 视频生成能力', () => {
    expect(inferCapabilitiesFromModelId('agnes-video-2.5')).toEqual(['video']);
    expect(inferCapabilitiesFromModelId('agnes-video-v2.0')).toEqual(['video']);
  });

  it('不区分大小写', () => {
    expect(inferCapabilitiesFromModelId('AGNES-Image-2.1-Flash')).toEqual(['image']);
    expect(inferCapabilitiesFromModelId('Agnes-VIDEO-2.5-Flash')).toEqual(['video']);
  });

  it('同时含 image 与 video → 两项都带上', () => {
    expect(inferCapabilitiesFromModelId('combo-Image-Video-v1').sort()).toEqual(['image', 'video']);
  });

  it('纯文本模型不带媒体能力', () => {
    expect(inferCapabilitiesFromModelId('agnes-3.0-flash')).toEqual([]);
    expect(inferCapabilitiesFromModelId('agnes-2.5-pro-alpha')).toEqual([]);
  });

  it('空值安全', () => {
    expect(inferCapabilitiesFromModelId('')).toEqual([]);
    expect(inferCapabilitiesFromModelId(undefined as any)).toEqual([]);
  });
});

describe('默认上下文窗口 = 1M', () => {
  it('服务端默认值 1048576（1M）', () => {
    expect(DEFAULT_CONTEXT_WINDOW).toBe(1048576);
  });
});

describe('上下文窗口一次性迁移到 1M', () => {
  it('把 < 1M 的模型提到 1M，并排除本机平台', () => {
    const changed = bumpModelContextWindowToDefault();
    expect(changed).toBe(4);

    const upd = hoisted.lastMatching(/^UPDATE model SET context_window/i);
    expect(upd).toBeDefined();
    // 目标值 + 阈值都是 1M
    expect(upd!.params.slice(0, 2)).toEqual([1048576, 1048576]);
    // 排除本机平台（Ollama / LM Studio 等）
    expect(upd!.sql).toMatch(/NOT IN \(SELECT id FROM platform/);
    expect(upd!.sql).toMatch(/api_url LIKE \?/);
    expect(upd!.params).toContain('%127.0.0.1%');
    expect(upd!.params).toContain('%localhost%');
  });

  it('打过标记后不再重复执行（用户后续调小的窗口不被回退）', () => {
    expect(bumpModelContextWindowToDefault()).toBe(4);
    hoisted.sqlLog.length = 0;
    expect(bumpModelContextWindowToDefault()).toBe(0);
    expect(hoisted.allMatching(/^UPDATE model SET context_window/i)).toHaveLength(0);
  });

  it('迁移标记使用 v2 key（v1 的 256K 迁移不会挡住本次 1M 迁移）', () => {
    bumpModelContextWindowToDefault();
    expect(hoisted.config['model_ctx_default_1m_v2']).toBe('4');
  });
});

describe('目录补齐时按名称补媒体能力', () => {
  it('已存在但能力为空 → 补上 image', () => {
    hoisted.models['p1:agnes-image-2.5-flash'] = { id: 'm1', capabilities_json: '[]' };
    const r = syncAgensModelCatalog('u1', 'p1');

    expect(r.capsFilled).toContain('agnes-image-2.5-flash');
    const upd = hoisted.lastMatching(/^UPDATE model SET capabilities_json = \? WHERE id = \?/i);
    expect(upd).toBeDefined();
    expect(upd!.params[0]).toBe('["image"]');
    expect(upd!.params[1]).toBe('m1');
  });

  it('已有该能力 → 不重复写', () => {
    hoisted.models['p1:agnes-video-2.5'] = { id: 'm2', capabilities_json: '["video"]' };
    const r = syncAgensModelCatalog('u1', 'p1');
    expect(r.capsFilled).not.toContain('agnes-video-2.5');
    expect(hoisted.allMatching(/capabilities_json = \? WHERE id = \?/i)).toHaveLength(0);
  });

  it('用户手动勾过的其它能力保留（只增不减）', () => {
    hoisted.models['p1:agnes-image-2.1-flash'] = { id: 'm3', capabilities_json: '["vision"]' };
    syncAgensModelCatalog('u1', 'p1');
    const upd = hoisted.lastMatching(/^UPDATE model SET capabilities_json = \? WHERE id = \?/i);
    expect(JSON.parse(upd!.params[0])).toEqual(['vision', 'image']);
  });

  it('新插入的模型同样带上按名字推断的能力', () => {
    hoisted.models['p1:agnes-image-2.5-flash'] = { id: 'm1', capabilities_json: '[]' };
    syncAgensModelCatalog('u1', 'p1');
    const inserts = hoisted.allMatching(/^INSERT OR IGNORE INTO model/i);
    const video = inserts.find((e) => e.params[3] === 'agnes-video-2.5');
    expect(video).toBeDefined();
    expect(JSON.parse(video!.params[7])).toEqual(['video']);
    expect(video!.params[6]).toBe(1048576); // 新模型默认窗口 = 1M
  });
});
