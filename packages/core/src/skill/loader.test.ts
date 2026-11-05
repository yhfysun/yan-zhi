import { describe, expect, it } from 'vitest';
import { parseSkillMd } from './loader';

describe('parseSkillMd page asset references', () => {
  it('parses pageAssets and capabilities from skill frontmatter', () => {
    const parsed = parseSkillMd(`---
name: 多平台内容发布
description: 用同一套能力发布到不同平台
pageAssets:
  - social.douyin.creator
  - social.kuaishou.creator
capabilities:
  - social.content.publish.video
---

# 发布
`);
    expect(parsed.frontmatter.pageAssets).toEqual([
      'social.douyin.creator',
      'social.kuaishou.creator',
    ]);
    expect(parsed.frontmatter.capabilities).toEqual(['social.content.publish.video']);
    expect(parsed.body).toContain('# 发布');
  });
});
