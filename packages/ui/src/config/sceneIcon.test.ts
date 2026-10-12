// 场景图标解析（config/sceneIcon.ts）回归测试。
//
// 为什么值得测：场景配置 2026-10-12 起存后端 scene_config 表，icon 列是**字符串**
// （element-plus 组件名）。字符串 → Component 的映射漏一个名字不会报错，只会静默退化成
// 兜底图标（Suitcase）——「抖音运营」显示成公文包就是这类故障。后端种子
// apps/server/src/builtin-scene-defs.ts 用到的每个名字，这里都必须能解析。
import { describe, it, expect } from 'vitest';
import { resolveSceneIcon, isKnownSceneIcon, SCENE_FALLBACK_ICON } from './sceneIcon';

/** 后端 builtin-scene-defs.ts 的 icon 列实际用到的名字（双源守门：加场景必须同步这里） */
const BACKEND_USED_ICONS = [
  'Suitcase', 'Monitor', 'Brush', 'Coin', 'TrendCharts', 'Promotion', 'User', 'Sell',
  'ScaleToOriginal', 'DataAnalysis', 'Service', 'Connection', 'Notebook', 'Shop', 'VideoCamera',
];

describe('场景图标解析', () => {
  it('后端种子用到的每个图标名都已登记（漏一个 = 静默退化兜底图标）', () => {
    // ★ 用 isKnownSceneIcon 成员判定而不是「不是兜底」：Suitcase 同时是兜底图标，
    //   「resolveSceneIcon(x) !== SCENE_FALLBACK_ICON」对 Suitcase 自身会误判为未登记。
    for (const name of BACKEND_USED_ICONS) {
      expect(isKnownSceneIcon(name), `icon=${name} 未登记`).toBe(true);
      expect(resolveSceneIcon(name)).toBeTruthy();
    }
  });

  it('抖音运营用 VideoCamera（与后端 douyin 行的 icon 列一致）', () => {
    expect(isKnownSceneIcon('VideoCamera')).toBe(true);
  });

  it('未知名字 / 空值走兜底（不抛错）', () => {
    expect(resolveSceneIcon('NoSuchIcon')).toBe(SCENE_FALLBACK_ICON);
    expect(resolveSceneIcon('')).toBe(SCENE_FALLBACK_ICON);
    expect(resolveSceneIcon(null)).toBe(SCENE_FALLBACK_ICON);
    expect(resolveSceneIcon(undefined)).toBe(SCENE_FALLBACK_ICON);
    expect(isKnownSceneIcon('NoSuchIcon')).toBe(false);
    expect(isKnownSceneIcon(null)).toBe(false);
  });
});
