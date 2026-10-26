// 裸路径 → hash 引导判定守门：远控邀请/二维码给的是 http://ip:port/remote 形态裸路径，
// hash 路由下不带引导会落到首页而不是远控页（2026-10-25 修）。
import { describe, expect, it } from 'vitest';
import { barePathHashTarget } from './barePathHash';

describe('barePathHashTarget', () => {
  it('裸 /remote（含尾斜杠）→ 引导到 #/remote', () => {
    expect(barePathHashTarget('/remote', '')).toBe('/remote');
    expect(barePathHashTarget('/remote/', '')).toBe('/remote');
  });

  it('已带 hash 或其它路径不动（交给 vue-router）', () => {
    expect(barePathHashTarget('/remote', '#/settings')).toBeNull();
    expect(barePathHashTarget('/', '')).toBeNull();
    expect(barePathHashTarget('/settings', '')).toBeNull();
    expect(barePathHashTarget('', '')).toBeNull();
  });
});
