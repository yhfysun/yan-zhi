// 内置系列皮肤部件图的 CSS 值形态契约（2026-10-17 修「浏览器皮肤效果没了」回归钉死）
//
// 根因回顾：部件图曾以**裸 data URI**（data:image/svg+xml;charset=utf-8,...）透传给
// CSS 自定义属性，两个叠加的坑（Chromium 152 / Electron 44 起暴露，33 时代被容忍）：
//   ① 值里 `;charset=utf-8` 的分号在声明值**顶层** → CSSOM setProperty 整条静默丢弃；
//   ② 裸 data URI 不是合法 <image> → background-image: var(--x) 计算为 none。
// 修法：skinSeries.uriOf 统一包成 url("data:...") —— 分号进字符串 token，两个坑一起消失。
//
// 本测试钉两类不变量（与运行环境无关，不依赖浏览器行为）：
//   A. 部件图必须是 url("...") 完整 CSS 值，且引号外无顶层分号；
//   B. 壁纸 / 预览图保持裸 data URI —— 它们的消费方各自包 url()（settings.applySkin）
//      或直接当 <img src>（Settings.vue），包两层会得到 url("url(...)") 非法值。
import { describe, it, expect } from 'vitest';
import { BUILTIN_SKIN_SERIES } from './skinSeries';

/** 声明值里是否存在**引号外的顶层分号**（CSSOM setProperty 会整条丢弃这种值） */
function hasTopLevelSemicolon(v: string): boolean {
  let inQuotes = false;
  for (const ch of v) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ';' && !inQuotes) return true;
  }
  return false;
}

const PATTERN_FIELDS = [
  'catTagPattern',
  'inputPattern',
  'buttonPattern',
  'buttonPatternDark',
  'dialogPattern',
  'dialogPatternDark',
  'menuPattern',
  'menuPatternDark',
  'codePattern',
  'browserPattern',
  'browserPatternDark',
] as const;

/** ★ 刻意不下发的字段：
 *  · taskListPattern：.sidebar/.conv-list/.fs-panel 消费它做 cover 大图底，
 *    内置系列的纹样贴片在竖条容器上会被放大 ~2.7 倍裁切、并盖住 3D 壁纸
 *    （2026-10-17 用户实报「任务侧栏被你弄坏了」）。
 *  · titlebarPattern：弹窗标题栏专用的「主色→深色渐变带 + 白母题」，是弹窗
 *    顶部与窗体割裂的「突兀」根因（2026-10-17 用户第 2 轮反馈）。停发后
 *    .el-dialog__header 透明，弹窗底图从标题区一路贯通到底栏。
 *  （button/dialog/menu 图不再自绘，直接复用 wallpaper() 的 3D 场景图 ——
 *   用户「不是光影啊，你仔细看看背景的冰块？都不是 3D 效果啊」，见 skinSeries.ts 第六轮注释。） */
const FORBIDDEN_FIELDS = ['taskListPattern', 'titlebarPattern'] as const;

describe('内置系列皮肤 · 部件图 CSS 值形态', () => {
  for (const s of BUILTIN_SKIN_SERIES) {
    describe(s.id, () => {
      for (const field of PATTERN_FIELDS) {
        it(`${field} 是 url("data:...") 完整值且无顶层分号`, () => {
          const v = s.surface[field];
          expect(typeof v).toBe('string');
          // url("data:image/svg+xml;charset=utf-8,<percent-encoded>") —— 唯一分号在字符串内
          expect(v).toMatch(/^url\("data:image\/svg\+xml;charset=utf-8,[^"]*"\)$/);
          expect(hasTopLevelSemicolon(v)).toBe(false);
        });
      }

      it('壁纸 / 预览图保持裸 data URI（消费方各自包 url()，禁双层嵌套）', () => {
        for (const wp of [s.wallpaper.light, s.wallpaper.dark, s.preview]) {
          expect(wp.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
          expect(wp.startsWith('url(')).toBe(false);
        }
      });

      it('★ 不下发被禁字段（taskListPattern → 侧栏透出 3D 壁纸，见 buildSeries 注释）', () => {
        for (const field of FORBIDDEN_FIELDS) {
          expect((s.surface as Record<string, unknown>)[field], `${field} 应当不存在`).toBeUndefined();
        }
      });
    });
  }
});
