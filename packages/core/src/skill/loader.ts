// Skill 加载与解析
import type { SkillFrontmatter } from '@yan-zhi/shared';

/** 解析结果 */
export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

/** 从 Skill Markdown 文本解析出 frontmatter 和 body
 *  支持 YAML frontmatter（--- 包裹），无 frontmatter 时返回空元数据 */
export function parseSkillMd(md: string): ParsedSkill {
  const fmMatch = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: { name: '' }, body: md };
  }
  const [, fmRaw, body] = fmMatch;
  return { frontmatter: parseYamlFrontmatter(fmRaw), body: body.trim() };
}

/** 简单 YAML frontmatter 解析（不引入额外依赖）
 *  支持：key: value、key: [a, b]、多行列表（- item） */
function parseYamlFrontmatter(raw: string): SkillFrontmatter {
  const fm: SkillFrontmatter = { name: '' };
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!m) { i++; continue; }
    const [, key, value] = m;
    if (value === '') {
      // 多行列表
      const items: string[] = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s+/)) {
        const itemMatch = lines[i].match(/^\s+-\s+(.*)$/);
        if (itemMatch) items.push(itemMatch[1].trim());
        i++;
      }
      if (key === 'triggers' || key === 'tools') {
        (fm as any)[key] = items;
      } else {
        (fm as any)[key] = items;
      }
      continue;
    }
    // 单行值
    if (value.startsWith('[') && value.endsWith(']')) {
      // 数组字面量
      const items = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
      (fm as any)[key] = items;
    } else {
      (fm as any)[key] = value;
    }
    i++;
  }
  return fm;
}
