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
 * ★★★ 2026-10-16 改口径（skill 单一真相源）：
 *   这三条曾各自维护、双向分叉（仓库树独有快手文档；种子独有封面配方）。
 *   现在 **`.claude/skills/novel-tuiwen/` 是唯一真相源**，种子由它生成。
 *   同时知识不再只堆在 SKILL.md 里 —— 页面级内容搬进 `references/pages/**`。
 *   ⇒ 断言对象从 `bodyMd` 换成**整体**（正文 + 全部参考文件），
 *     因为那才是 agent 实际拿到的东西；只盯 bodyMd 会让"搬进 references"被误判成丢失。
 *
 * 运行：npx vitest run src/db/novel-tuiwen-skill-seed.test.ts
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_SKILLS_SEED } from './schema.js';

const SKILL_DIR = fileURLToPath(new URL('../../../../.claude/skills/novel-tuiwen/', import.meta.url));

/** 换行统一成 LF：git 入库本就把 CRLF 归一成 LF，种子存的是 LF
 *  ⇒ 比对面必须同样归一，否则 Windows（CRLF 工作区）能过、Linux/CI 会误报。 */
function toLF(s: string): string { return s.split('\r\n').join('\n'); }

/** 读 A 树（唯一真相源）的全部 references 文件，路径相对 skill 根 */
function readSourceFiles(): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  (function walk(dir: string, rel: string) {
    for (const name of readdirSync(dir).sort()) {
      const abs = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(abs).isDirectory()) walk(abs, r);
      else if (name.endsWith('.md')) out.push({ path: `references/${r}`, content: toLF(readFileSync(abs, 'utf-8')) });
    }
  })(path.join(SKILL_DIR, 'references'), '');
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

describe('novel-tuiwen skill 种子（本轮补充的配方）', () => {
  const s = BUILTIN_SKILLS_SEED.find((x: any) => x.name === '小说推文视频') as any;
  const files: Array<{ path: string; content: string }> = s?.files || [];
  /** 整体 = 正文 + 全部参考文件（agent 实际拿到的全部内容） */
  const all = (s?.bodyMd || '') + '\n' + files.map((f) => f.content).join('\n');

  it('skill 存在', () => { expect(s).toBeTruthy(); });

  it('★ 抓正文配方（含可复制脚本）在', () => {
    expect(all).toContain('#content.chapter p');
    expect(all).toContain('catalogue__item-text');
  });
  it('★ 评论区配方（Draft.js 关键发现）在', () => {
    expect(all).toContain('Draft.js');
    expect(all).toContain('public-DraftEditor-content');
    expect(all).toContain('comment/list');
  });
  it('★ 评论只发不置顶：Web 端无置顶入口的事实写在正文（2026-10-14 穷尽验证）', () => {
    // 2026-10-14 实跑：评论能发出（创作者后台互动评论页），但置顶在 Web 端无入口
    // （后台只有回复/删除/举报，公开页「…」菜单无置顶项，is_pinned 恒 0）→ 配方已删，
    // 只留「别再找入口」的事实。防止后续编辑又把「选「置顶」」这步加回来。
    expect(all).toContain('置顶 Web 端做不到');
    expect(all).not.toContain('菜单里选「置顶」');
  });
  it('★ 合成要点（ffmpeg 2019 限制）在', () => {
    expect(all).toContain('text_align');
    expect(all).toContain('链式 drawtext');
  });
  it('★ 回填配方在（含抖音作品链接形态与「1 条即生效」）', () => {
    expect(all).toContain('promotion-list');
    expect(all).toContain('iesdouyin.com/share/video');
    // ★ 2026-10-16：用户点名「回填链接一次就好了」——这条规矩必须在，且要在显眼处
    expect(all).toContain('1 条链接即生效');
  });
  it('★ 系列任务首集发布前必先建合集（2026-10-23）', () => {
    // 用户实报：第一集没进合集 → 「第N集」从开头就断，后续只能逐条补归集。
    expect(all).toContain('第一集发布前就要把合集建好并勾选');
    expect(all).toContain('首集前必做');
  });
  it('反引号未被双重转义；代码块完整', () => {
    // ★ 转义正确性的**强判据**是下面「与仓库树逐字一致」那条（种子解出来必须与 A 树字节相同）。
    //   这里只做粗筛，且**只对正文**（模板字面量）—— 不要套在整体上：
    //   参考资料里 `C:\APP\EVCapture\` 这种「反斜杠结尾的路径」是正文内容，会误报。
    expect(s.bodyMd).not.toContain('\\`');
    expect(all).toContain('```js');
    expect(all).toContain('```');
  });
});

describe('封面制作配方（2026-10-12 补：合集封面 + 每集视频封面）', () => {
  // 背景：用户实测「生成的合集封面图很糟糕」——根因是让生图模型直接画中文字（必糊）。
  // 收敛为两段式：api_image_generate 只出无字底图 → ffmpeg drawtext 烧字。
  // 这些断言钉住配方关键锚点，防止后续编辑把它降回一句泛泛描述。
  const s = BUILTIN_SKILLS_SEED.find((x: any) => x.name === '小说推文视频') as any;
  const files: Array<{ path: string; content: string }> = s?.files || [];
  const all = (s?.bodyMd || '') + '\n' + files.map((f) => f.content).join('\n');
  const filesJson = JSON.stringify(files);

  it('★ 封面节 + 两段式（出图只出无字底图，文字 drawtext 烧）在', () => {
    expect(all).toContain('封面制作');
    expect(all).toContain('api_image_generate');
    expect(all).toContain('drawtext');
    expect(all).toContain('无字底图');
  });

  it('★ 规格硬性要求：合集封面 1:1 1080×1080 JPG ≤5MB；每集封面跟成片画幅 9:16', () => {
    expect(all).toContain('1080×1080');
    expect(all).toContain('≤5MB');
    expect(all).toContain('1080×1920');
  });

  it('★ 书名红线同样管封面：只烧别名，禁原书名', () => {
    expect(all).toContain('只烧别名');
  });

  it('★ 参考文件 references/cover-recipes.md 随 skill 分发（含 ffmpeg 烧字命令）', () => {
    expect(filesJson).toContain('references/cover-recipes.md');
    const f = files.find((x) => x.path === 'references/cover-recipes.md');
    expect(f).toBeTruthy();
    expect(f!.content).toContain('msyh.ttc');
    expect(f!.content).toContain('5242880');
    expect(f!.content).toContain('text_align');
  });
});

describe('★ 单一真相源一致性（2026-10-16）', () => {
  // 背景：skill 曾经在「仓库树 / core 种子 / 服务端种子」三处各自维护，
  // 结果**双向分叉**（仓库树独有快手文档；种子独有封面配方）——改了一边等于没改。
  // 现在仓库树是真相源，种子由 `node scripts/sync-novel-skill-seed.cjs`（仓库根执行）生成。
  // 本测试钉住"种子必须与仓库树逐字一致"，防止再次分叉。
  const s = BUILTIN_SKILLS_SEED.find((x: any) => x.name === '小说推文视频') as any;
  const files: Array<{ path: string; content: string }> = s?.files || [];
  const srcFiles = readSourceFiles();

  it('种子参考文件集合 == 仓库树 references 集合（不多不少）', () => {
    expect(files.map((f) => f.path).sort()).toEqual(srcFiles.map((f) => f.path).sort());
  });

  it('每个参考文件的内容与仓库树逐字一致（含换行符）', () => {
    const byPath = new Map(srcFiles.map((f) => [f.path, f.content]));
    const mismatched = files.filter((f) => byPath.get(f.path) !== f.content).map((f) => f.path);
    expect(mismatched, `与仓库树不一致的文件: ${mismatched.join(', ')}`).toEqual([]);
  });

  it('正文（bodyMd）== 仓库树 SKILL.md 去掉 frontmatter', () => {
    const skillMd = toLF(readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf-8'));
    const stripped = skillMd.replace(/^---\n[\s\S]*?\n---\n/, '');
    expect(s.bodyMd).toBe(stripped);
  });

  it('快手知识确实随 skill 分发（2026-10-16 补齐：此前三份副本全都没有）', () => {
    expect(s.bodyMd + files.map((f) => f.content).join('')).toContain('cp.kuaishou.com');
    expect(files.some((f) => f.path.includes('kuaishou'))).toBe(true);
  });
});
