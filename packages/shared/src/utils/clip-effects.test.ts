/**
 * 剪辑效果库单测（@yan-zhi/shared/utils/clip-effects）。
 *
 * ★★★ 为什么必须钉住（2026-10-07 的真实缺陷）：
 *   效果库此前**散在三处**：实现（api-tool-executor 的 COLOR_PRESETS）、
 *   工具 schema 的 enum（packages/core 手写）、字幕动画（subtitle-style）+ UI 又各一份。
 *   三份手工清单必然漂移，症状是「模型传了某预设但实现不认」或「实现了但模型不知道有」，
 *   **两边都不报错**。本测试确保：
 *   ① 一份注册表 + 从它派生的 enum/catalog/分组 —— 三者永远一致；
 *   ② 效果 id 唯一、非空、不含会破坏 filtergraph 的字符（`:` / `,` / `'`）；
 *   ③ 真实存在的效果能被查到、查不到的返回 null（不许静默当"原片"）。
 *
 * ★ ffmpeg 层面"这些滤镜真的能用"由 tools/verify-effects.cjs 实跑核验（64/64）。
 *   本文件只保证**数据契约**正确 —— 两者互补，都不能省。
 */
import { describe, it, expect } from 'vitest';
import {
  COLOR_EFFECTS, TRANSITIONS, TEXT_ANIMATIONS, AUDIO_EFFECTS,
  effectIds, effectFilter, effectCatalogText, groupEffects,
  type EffectPreset,
} from '../utils/clip-effects';

const TABLES: Array<[string, EffectPreset[]]> = [
  ['COLOR_EFFECTS', COLOR_EFFECTS],
  ['TRANSITIONS', TRANSITIONS],
  ['TEXT_ANIMATIONS', TEXT_ANIMATIONS],
  ['AUDIO_EFFECTS', AUDIO_EFFECTS],
];

describe('效果库 · 数据契约', () => {
  it('★ id 在各自表内唯一（重复 id 会让 enum 与实现指向不同效果）', () => {
    for (const [name, table] of TABLES) {
      const ids = table.map((e) => e.id);
      expect(new Set(ids).size, `${name} 有重复 id`).toBe(ids.length);
    }
  });

  it('★ 每项都有 id/label/desc/group（UI 与工具描述都依赖它们）', () => {
    for (const [name, table] of TABLES) {
      for (const e of table) {
        expect(e.id, `${name} 有项缺 id`).toBeTruthy();
        expect(e.label, `${name}:${e.id} 缺 label`).toBeTruthy();
        expect(e.desc, `${name}:${e.id} 缺 desc`).toBeTruthy();
        expect(e.group, `${name}:${e.id} 缺 group`).toBeTruthy();
      }
    }
  });

  it('★★ 效果 id 不得含会破坏 filtergraph 的字符（冒号/逗号/引号/空格）', () => {
    // 这些 id 会作为工具参数值回填到 ffmpeg 参数位，带分隔符会让滤镜串解析错位
    for (const [name, table] of TABLES) {
      for (const e of table) {
        expect(e.id, `${name}:${e.id} 含非法字符`).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it('★ 滤镜串里不得出现未转义的单引号（会提前闭合 filtergraph 的引号）', () => {
    for (const [name, table] of TABLES) {
      for (const e of table) {
        expect(e.filter, `${name}:${e.id} 的 filter 含单引号`).not.toContain("'");
      }
    }
  });

  it('调色表里必须有 none（原片），且它与"未设置"语义一致（filter 为空串）', () => {
    const none = COLOR_EFFECTS.find((e) => e.id === 'none');
    expect(none).toBeTruthy();
    expect(none!.filter).toBe('');
  });

  it('效果数量达到商用软件的可选规模（回归：曾是 7 项，太少用户会觉得"没效果可用"）', () => {
    expect(COLOR_EFFECTS.length).toBeGreaterThanOrEqual(25);
    expect(TRANSITIONS.length).toBeGreaterThanOrEqual(20);
    expect(AUDIO_EFFECTS.length).toBeGreaterThanOrEqual(6);
    expect(TEXT_ANIMATIONS.length).toBeGreaterThanOrEqual(8);
  });
});

describe('效果库 · 派生工具的一致性', () => {
  it('★★ effectIds 必须与表内 id 顺序一致（schema enum 直接用它，错序会让 UI 与模型选到不同效果）', () => {
    for (const [, table] of TABLES) {
      expect(effectIds(table)).toEqual(table.map((e) => e.id));
    }
  });

  it('★ effectFilter：命中返回滤镜串，未命中返回 null（不得静默回落成原片）', () => {
    expect(effectFilter('cinema', COLOR_EFFECTS)).toContain('colorbalance');
    expect(effectFilter('none', COLOR_EFFECTS)).toBe('');
    expect(effectFilter('不存在的效果', COLOR_EFFECTS)).toBeNull();
  });

  it('★ catalog 文本含全部 id 与中文名（模型据此知道有哪些可选）', () => {
    const text = effectCatalogText(COLOR_EFFECTS, ['none']);
    for (const e of COLOR_EFFECTS) {
      if (e.id === 'none') continue;
      expect(text).toContain(e.id);
      expect(text).toContain(e.label);
    }
    expect(text).not.toContain('none=');   // 排除项不出现在清单里
  });

  it('★ groupEffects 不丢项：分组后总数 == 原表数（UI 下拉不会漏效果）', () => {
    for (const [, table] of TABLES) {
      const grouped = groupEffects(table);
      const total = grouped.reduce((n, g) => n + g.items.length, 0);
      expect(total).toBe(table.length);
      // 分组名不重复、组内不为空
      const names = grouped.map((g) => g.group);
      expect(new Set(names).size).toBe(names.length);
      for (const g of grouped) expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it('★★ 排除项语义：groupEffects(COLOR, [none]) 用于 UI 下拉（"原片"由空值表示）', () => {
    const grouped = groupEffects(COLOR_EFFECTS, ['none']);
    const flat = grouped.flatMap((g) => g.items.map((e) => e.id));
    expect(flat).not.toContain('none');
    expect(flat.length).toBe(COLOR_EFFECTS.length - 1);
  });
});
// ===== 关键帧表达式 / 画中画锚点（2026-10-08 关键帧动画 + 画中画落地时补） =====
//
// ★ buildPiecewiseExpr 的输出**直接进 ffmpeg 表达式**：语法错了 ffmpeg 不报错、只静默不生效
//   （本仓库已多次踩"命令成功 ≠ 效果生效"），所以把字符串形状锁死在单测里。
import { buildPiecewiseExpr, OVERLAY_POSITIONS, overlayAnchorOf } from '../utils/clip-effects';

describe('buildPiecewiseExpr · 分段线性表达式', () => {
  it('两点：中段是线性插值，首前/末后 clamp 到端点值（嵌套 if 形状）', () => {
    expect(buildPiecewiseExpr([{ t: 0, v: 1 }, { t: 1, v: 2 }], 'x')).toBe('if(lt(x,1),(1+1*(x-0)/1),2)');
  });

  it('空数组给常量 0、单点给常量值（ffmpeg 表达式不允许空）', () => {
    expect(buildPiecewiseExpr([], 'x')).toBe('0');
    expect(buildPiecewiseExpr([{ t: 0.4, v: 1.5 }], 'x')).toBe('1.5');
  });

  it('t 超出 0~1 被钳制（脏数据不产生非法表达式）', () => {
    // t=1.5 → 钳到 1，两点 {0,1} 与 {1,9} 去掉 span0 后仍然两点：表达式必须合法
    const expr = buildPiecewiseExpr([{ t: 0, v: 1 }, { t: 1.5, v: 9 }], 'x');
    expect(expr).toBe('if(lt(x,1),(1+8*(x-0)/1),9)');
  });

  it('同 t 点去重（保留后者）：不产生除零 span', () => {
    const expr = buildPiecewiseExpr([{ t: 0, v: 1 }, { t: 0.5, v: 2 }, { t: 0.5, v: 3 }, { t: 1, v: 4 }], 'x');
    // 精确断言"除零"：/0 后面不能紧跟数字（/0.5 是合法除数，不能误伤）
    expect(expr).not.toMatch(/\/0(?![.\d])/);
    expect(expr).toContain('3'); // 后者覆盖前者
  });

  it('多点嵌套：内层 if 的 else 就是后一段（保证分段顺序正确）', () => {
    const expr = buildPiecewiseExpr([{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }], 'T');
    expect(expr).toBe('if(lt(T,0.5),(0+1*(T-0)/0.5),if(lt(T,1),(1+-1*(T-0.5)/0.5),0))');
  });
});

describe('OVERLAY_POSITIONS · 画中画锚点', () => {
  it('9 宫格 id 唯一且覆盖四角/边中/中心', () => {
    const ids = OVERLAY_POSITIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(9);
    for (const must of ['topleft', 'topright', 'bottomleft', 'bottomright', 'center']) {
      expect(ids).toContain(must);
    }
  });

  it('overlayAnchorOf：未知 id 回落 bottomright（与 ClipOverlay.pos 缺省一致）', () => {
    expect(overlayAnchorOf('nope')).toEqual(overlayAnchorOf('bottomright'));
    expect(overlayAnchorOf(undefined)).toEqual(overlayAnchorOf('bottomright'));
  });
});
