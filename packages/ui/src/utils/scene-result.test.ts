// 场景结算围栏解析回归（utils/scene-result.ts）。
// 为什么值得测：陪练输出是模型自由文本，缺字段/NaN/格式坏都会让卡片静默不渲染；
// 且 [SCENE_END] 与围栏必须从正文剥离，否则用户看到裸 JSON。
import { describe, it, expect } from 'vitest';
import { extractSceneResultBlocks, stripSceneResultBlocks } from './scene-result';

const GOOD = `\`\`\`scene_result
{"score":88,"stars":2,"keyPhrases":["I'd like to check in","Here's my passport"],"corrections":[{"wrong":"I have seen him yesterday","right":"I saw him yesterday","why":"过去时间点用过去时","grammarPoint":"g_past_simple"}]}
\`\`\``;

describe('extractSceneResultBlocks', () => {
  it('正常解析：score/stars/句型/纠错全保留', () => {
    const blocks = extractSceneResultBlocks(GOOD);
    expect(blocks.length).toBe(1);
    const b = blocks[0];
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.result.score).toBe(88);
      expect(b.result.stars).toBe(2);
      expect(b.result.keyPhrases).toEqual(["I'd like to check in", "Here's my passport"]);
      expect(b.result.corrections[0].grammarPoint).toBe('g_past_simple');
    }
  });

  it('★ 评分与星级钳位到 [0,100] / [0,3]（防模型给 999 分刷屏）', () => {
    const b = extractSceneResultBlocks('```scene_result\n{"score":999,"stars":9}\n```')[0];
    expect(b.ok).toBe(true);
    if (b.ok) {
      expect(b.result.score).toBe(100);
      expect(b.result.stars).toBe(3);
      expect(b.result.keyPhrases).toEqual([]);
      expect(b.result.corrections).toEqual([]);
    }
  });

  it('缺 score/stars 或缺数组时降级 ok:false，不抛', () => {
    expect(extractSceneResultBlocks('```scene_result\n{"keyPhrases":["a"]}\n```')[0].ok).toBe(false);
    expect(extractSceneResultBlocks('```scene_result\n{oops}\n```')[0].ok).toBe(false);
  });

  it('无围栏时返回空数组（普通聊天消息零成本）', () => {
    expect(extractSceneResultBlocks('Nice work! See you tomorrow.')).toEqual([]);
  });
});

describe('stripSceneResultBlocks', () => {
  it('★ 同时剥离围栏与 [SCENE_END] 标记行，正文保留', () => {
    const md = `Let's wrap up here. Good job!\n[SCENE_END]\n${GOOD}\nSee you next time.`;
    const s = stripSceneResultBlocks(md);
    expect(s).toContain("Let's wrap up here");
    expect(s).toContain('See you next time.');
    expect(s).not.toContain('[SCENE_END]');
    expect(s).not.toContain('scene_result');
    expect(s).not.toContain('"score"');
  });

  it('普通文本不变（除多余空行收敛）', () => {
    expect(stripSceneResultBlocks('  Hello there.  ')).toBe('Hello there.');
  });
});
