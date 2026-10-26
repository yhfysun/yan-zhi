// 图片头像注册表（utils/agentAvatarImages.ts）回归测试。
//
// 为什么值得测：
//   1) key 由文件名推导，改名/移目录会让用户已选头像静默失效 → 需要稳定格式 `img:<name>`；
//   2) avatar 字段同时承载图标 key，前缀判定错位会把图标键当图片、渲染空白；
//   3) 分组必须每类都有素材，「分好类」是用户明确要求。
import { describe, it, expect } from 'vitest';
import {
  agentAvatarGroups, resolveAgentAvatarImage, isKnownAgentAvatarImage, AGENT_AVATAR_IMAGES,
  AGENT_AVATAR_IMAGE_BY_ID, resolveAgentAvatarImageByAgentId,
} from './agentAvatarImages';

describe('图片头像 · 素材与分组', () => {
  it('每个分组都有素材（彩色3D/彩色扁平/iconfont/动物/像素/机器人/涂鸦/3D人物/摄影）', () => {
    const groups = agentAvatarGroups();
    expect(groups.length, '应有 9 个分组').toBe(9);
    for (const g of groups) {
      expect(g.items.length, `${g.label} 分组为空`).toBeGreaterThan(0);
    }
  });

  it('每个素材 key 形如 img:<name> 且唯一、都有可用 src', () => {
    expect(AGENT_AVATAR_IMAGES.length).toBeGreaterThan(12);
    const keys = AGENT_AVATAR_IMAGES.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const img of AGENT_AVATAR_IMAGES) {
      expect(img.key).toMatch(/^img:[a-z0-9-]+$/i);
      expect(img.src, `${img.key} 缺少 src`).toBeTruthy();
    }
  });

  it('分组顺序稳定（彩色图标优先，其后 动物→像素→机器人→涂鸦→3D人物→摄影）', () => {
    expect(agentAvatarGroups().map((g) => g.group))
      .toEqual(['tech', 'flat', 'iconfont', 'animal', 'pixel', 'bot', 'croodle', 'three-d', 'scene']);
  });
});

describe('内置智能体 · 默认彩色头像预设', () => {
  it('每条映射都指向真实存在的素材（写错 key = 头像静默空白）', () => {
    const broken = Object.entries(AGENT_AVATAR_IMAGE_BY_ID)
      .filter(([, key]) => !isKnownAgentAvatarImage(key))
      .map(([id, key]) => `${id} -> ${key}`);
    expect(broken, '找不到素材的映射：' + broken.join(', ')).toEqual([]);
  });

  it('resolveAgentAvatarImageByAgentId：内置 id 命中，自建/空值不命中', () => {
    expect(resolveAgentAvatarImageByAgentId('a_builtin_data_agent')).toBeTruthy();
    expect(resolveAgentAvatarImageByAgentId('user-123')).toBeUndefined();
    expect(resolveAgentAvatarImageByAgentId(null)).toBeUndefined();
    expect(resolveAgentAvatarImageByAgentId(undefined)).toBeUndefined();
  });
});

describe('resolveAgentAvatarImage · 前缀判定', () => {
  it('img:* 命中素材返回 URL', () => {
    const first = AGENT_AVATAR_IMAGES[0];
    expect(resolveAgentAvatarImage(first.key)).toBe(first.src);
    expect(isKnownAgentAvatarImage(first.key)).toBe(true);
  });

  it('图标 key / 未知 img key / 空值 / 脏 URL 一律 undefined（交回图标逻辑）', () => {
    expect(resolveAgentAvatarImage('code')).toBeUndefined();
    expect(resolveAgentAvatarImage('img:not-exist')).toBeUndefined();
    expect(resolveAgentAvatarImage('')).toBeUndefined();
    expect(resolveAgentAvatarImage(null)).toBeUndefined();
    expect(resolveAgentAvatarImage('https://example.com/a.png')).toBeUndefined();
    expect(isKnownAgentAvatarImage('https://example.com/a.png')).toBe(false);
  });
});
