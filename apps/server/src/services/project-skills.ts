// 项目级技能目录 `.yan-zhi/skills/*.md`（P2-8，2026-10-04）
//
// 对齐 CLAUDE.md / CodeBuddy 生态的「项目自带方法论」：团队把项目专属 SOP
// （评审规范/部署流程/接口约定）放进工作目录，进入该目录的会话自动发现并按
// DB skill 同一套格式注入。**不写 skill 表** —— 目录就是真相源，会话结束不持久化；
// 同名时覆盖挂载的 DB 技能（项目 SOP 比通用/商城技能更贴近当前仓库）。
//
// 解析复用 core 的 parseSkillMd（与商城 .yzp / 技能提炼同一套 frontmatter 口径）。
// 缓存 = mtime+size 指纹（与 llm-task-manager 的 loadProjectRules 同款模式）：
// 提示词每一轮 ReAct 都要构建，不能每次重读盘。
// 容错 = 单文件解析/读取失败只 warn 跳过 —— 一个坏文件不能废掉整批。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseSkillMd } from '@yan-zhi/core';

export interface ProjectSkill {
  name: string;
  description: string;
  triggers: string[];
  /** 已按 DB skill 同口径截断（2000 字）的正文 */
  body: string;
  /** 来源标注（提示词里让模型知道可以从工作目录直接读到完整文件） */
  source: string;
}

const CACHE = new Map<string, { fingerprint: string; skills: ProjectSkill[] }>();
/** 与 DB skill 的 body 注入截断同口径（buildSystemPromptForBackend 技能段） */
export const PROJECT_SKILL_BODY_MAX_CHARS = 2000;
export const PROJECT_SKILLS_MAX_COUNT = 20;

/** 清空缓存（测试用；正常运行靠指纹自然失效） */
export function clearProjectSkillsCache(): void {
  CACHE.clear();
}

/**
 * 读取工作目录下的项目技能。目录不存在/不可读是常态（多数项目没有），静默返回空数组。
 */
export function loadProjectSkills(workspaceDir: string): ProjectSkill[] {
  if (!workspaceDir || !workspaceDir.trim()) return [];
  const skillsDir = path.join(workspaceDir, '.yan-zhi', 'skills');
  let files: string[] = [];
  try {
    if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) return [];
    files = readdirSync(skillsDir).filter((n) => n.toLowerCase().endsWith('.md')).sort();
  } catch {
    return [];
  }
  if (!files.length) return [];
  const fingerprint = files.map((f) => {
    try {
      const st = statSync(path.join(skillsDir, f));
      return `${f}:${st.mtimeMs}:${st.size}`;
    } catch {
      return `${f}:missing`;
    }
  }).join('|');
  const cached = CACHE.get(workspaceDir);
  if (cached && cached.fingerprint === fingerprint) return cached.skills;

  const skills: ProjectSkill[] = [];
  for (const f of files) {
    const filePath = path.join(skillsDir, f);
    try {
      const parsed = parseSkillMd(readFileSync(filePath, 'utf-8'));
      const name = String(parsed.frontmatter.name || '').trim() || f.replace(/\.md$/i, '');
      let body = (parsed.body || '').trim();
      if (!name && !body) continue;
      if (body.length > PROJECT_SKILL_BODY_MAX_CHARS) {
        body = `${body.slice(0, PROJECT_SKILL_BODY_MAX_CHARS)}\n…（流程过长已截断）`;
      }
      skills.push({
        name,
        description: String(parsed.frontmatter.description || '').trim(),
        triggers: Array.isArray(parsed.frontmatter.triggers) ? parsed.frontmatter.triggers.map(String) : [],
        body,
        source: `.yan-zhi/skills/${f}`,
      });
      if (skills.length >= PROJECT_SKILLS_MAX_COUNT) {
        console.warn(`[project-skills] ${workspaceDir} 技能文件超过 ${PROJECT_SKILLS_MAX_COUNT} 个，其余未注入`);
        break;
      }
    } catch (e: any) {
      console.warn(`[project-skills] 解析失败（已跳过）${filePath}:`, e?.message || e);
    }
  }
  CACHE.set(workspaceDir, { fingerprint, skills });
  return skills;
}