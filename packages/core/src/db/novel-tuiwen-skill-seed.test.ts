/**
 * novel-tuiwen skill 种子守门测试。
 *
 * ★★★ 为什么钉这些（2026-10-08 复盘）：
 *   用户报「抓章节文本不能一步到位」。查生产库实测：抓一章正文花了 **54 秒、15 次摸索调用**
 *   （browser_run_script 试选择器 8 次，还试过必然失败的 `:contains(...)`）。
 *   根因不是"知识缺失"——`fanqie-dom-samples.md` 里早写对了 `#content.chapter p`，
 *   而是**知识不在决策点上**（SKILL.md 第 2 步只说"用 get_visible_text 取整页文本"，
 *   与实际 DOM 不符 → 模型只能盲试）。
 *   同理「评论发表」实测失败（Draft.js 不认 DOM 赋值），此前 skill 只有 1 句原则、无配方。
 *
 * 本测试钉住"配方必须在正文里可直接执行"，防止后续编辑又把它降回一句泛泛的描述。
 *
 * 运行：npx vitest run src/db/novel-tuiwen-skill-seed.test.ts
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_SKILLS_SEED } from './schema.js';

describe('novel-tuiwen skill 种子（本轮补充的配方）', () => {
  const s = BUILTIN_SKILLS_SEED.find((x: any) => x.name === '小说推文视频') as any;
  it('skill 存在', () => { expect(s).toBeTruthy(); });

  it('★ 抓正文配方（含可复制脚本）在', () => {
    expect(s.bodyMd).toContain('#content.chapter p');
    expect(s.bodyMd).toContain('catalogue__item-text');
  });
  it('★ 评论区配方（Draft.js 关键发现）在', () => {
    expect(s.bodyMd).toContain('Draft.js');
    expect(s.bodyMd).toContain('public-DraftEditor-content');
    expect(s.bodyMd).toContain('comment/list');
  });
  it('★ 合成要点（ffmpeg 2019 限制）在', () => {
    expect(s.bodyMd).toContain('text_align');
    expect(s.bodyMd).toContain('链式 drawtext');
  });
  it('★ 回填配方在', () => {
    expect(s.bodyMd).toContain('promotion-list');
    expect(s.bodyMd).toContain('iesdouyin.com/share/video');
  });
  it('反引号未被双重转义；代码块完整', () => {
    expect(s.bodyMd).not.toContain('\\`');
    expect(s.bodyMd).toContain('```js');
    expect(s.bodyMd).toContain('```');
  });
});

describe('封面制作配方（2026-10-12 补：合集封面 + 每集视频封面）', () => {
  // 背景：用户实测「生成的合集封面图很糟糕」——根因是让生图模型直接画中文字（必糊）。
  // 收敛为两段式：api_image_generate 只出无字底图 → ffmpeg drawtext 烧字。
  // 这些断言钉住配方关键锚点，防止后续编辑把它降回一句泛泛描述。
  const s = BUILTIN_SKILLS_SEED.find((x: any) => x.name === '小说推文视频') as any;
  const filesJson = JSON.stringify((s as { files?: Array<{ path: string; content: string }> }).files || []);

  it('★ 封面节 + 两段式（出图只出无字底图，文字 drawtext 烧）在', () => {
    expect(s.bodyMd).toContain('## 封面制作');
    expect(s.bodyMd).toContain('api_image_generate');
    expect(s.bodyMd).toContain('drawtext');
    expect(s.bodyMd).toContain('无字底图');
  });

  it('★ 规格硬性要求：合集封面 1:1 1080×1080 JPG ≤5MB；每集封面跟成片画幅 9:16', () => {
    expect(s.bodyMd).toContain('1080×1080');
    expect(s.bodyMd).toContain('≤5MB');
    expect(s.bodyMd).toContain('1080×1920');
  });

  it('★ 书名红线同样管封面：只烧别名，禁原书名', () => {
    expect(s.bodyMd).toContain('只烧别名');
  });

  it('★ 参考文件 references/cover-recipes.md 随 skill 分发（含 ffmpeg 烧字命令）', () => {
    expect(filesJson).toContain('references/cover-recipes.md');
    const f = (s.files as Array<{ path: string; content: string }>).find((x) => x.path === 'references/cover-recipes.md');
    expect(f).toBeTruthy();
    expect(f!.content).toContain('msyh.ttc');
    expect(f!.content).toContain('5242880');
    expect(f!.content).toContain('text_align');
  });
});
