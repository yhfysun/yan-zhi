// 项目技能目录（P2-8）：`.yan-zhi/skills/*.md` 的发现/解析/缓存/容错。
// 守住的语义：
//   1) 无目录 = 常态，静默空数组不报错；
//   2) frontmatter（name/description/triggers）解析 + 无 frontmatter 时文件名兜底；
//   3) 正文按 DB skill 同口径截断（2000 字 + 截断标注）；
//   4) mtime+size 指纹缓存：内容未变返回同一引用（省盘），文件变更后重读；
//   5) 非 .md 文件不加载；数量上限 20。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProjectSkills, clearProjectSkillsCache, PROJECT_SKILL_BODY_MAX_CHARS, PROJECT_SKILLS_MAX_COUNT } from '../src/services/project-skills.js';

let dir: string;

function writeSkill(name: string, content: string) {
  const skillsDir = path.join(dir, '.yan-zhi', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.writeFileSync(path.join(skillsDir, name), content, 'utf-8');
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yz-proj-skills-'));
  clearProjectSkillsCache();
});

afterEach(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 清理失败不影响断言 */ }
});

describe('loadProjectSkills', () => {
  it('无 .yan-zhi/skills 目录 → 空数组（常态静默）', () => {
    expect(loadProjectSkills(dir)).toEqual([]);
  });

  it('frontmatter 解析：name/description/triggers + 正文', () => {
    writeSkill('review.md', [
      '---',
      'name: 代码评审规范',
      'description: 本项目 PR 评审的固定检查项',
      'triggers: [评审, review]',
      '---',
      '',
      '## 流程',
      '1. 先跑 code_diagnostics',
    ].join('\n'));
    const skills = loadProjectSkills(dir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('代码评审规范');
    expect(skills[0].description).toContain('PR 评审');
    expect(skills[0].triggers).toEqual(['评审', 'review']);
    expect(skills[0].body).toContain('code_diagnostics');
    expect(skills[0].source).toBe('.yan-zhi/skills/review.md');
  });

  it('无 frontmatter → 文件名作 name，全文作正文', () => {
    writeSkill('deploy.md', '先 build 再发版。');
    const skills = loadProjectSkills(dir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('deploy');
    expect(skills[0].triggers).toEqual([]);
    expect(skills[0].body).toBe('先 build 再发版。');
  });

  it('正文超长截断并带标注（与 DB skill 同口径）', () => {
    writeSkill('long.md', '---\nname: 长文\n---\n' + 'x'.repeat(PROJECT_SKILL_BODY_MAX_CHARS + 500));
    const skills = loadProjectSkills(dir);
    expect(skills[0].body.length).toBeLessThan(PROJECT_SKILL_BODY_MAX_CHARS + 100);
    expect(skills[0].body).toContain('流程过长已截断');
  });

  it('指纹缓存：内容未变返回同一引用；文件变更后重读', () => {
    writeSkill('a.md', '---\nname: A\n---\nv1');
    const first = loadProjectSkills(dir);
    const second = loadProjectSkills(dir);
    expect(second).toBe(first); // 同一引用 = 走了缓存
    // 变更内容（写前把 mtime 推后 1s，规避文件系统 mtime 精度）
    const p = path.join(dir, '.yan-zhi', 'skills', 'a.md');
    fs.writeFileSync(p, '---\nname: A\n---\nv2-longer', 'utf-8');
    const future = new Date(Date.now() + 2000);
    fs.utimesSync(p, future, future);
    const third = loadProjectSkills(dir);
    expect(third[0].body).toBe('v2-longer');
  });

  it('只加载 .md；数量上限', () => {
    writeSkill('readme.txt', '不是技能');
    for (let i = 0; i < PROJECT_SKILLS_MAX_COUNT + 3; i++) {
      writeSkill(`s${String(i).padStart(2, '0')}.md`, `---\nname: S${i}\n---\nbody${i}`);
    }
    const skills = loadProjectSkills(dir);
    expect(skills.every((s) => !s.name.includes('readme'))).toBe(true);
    expect(skills.length).toBe(PROJECT_SKILLS_MAX_COUNT);
  });
});