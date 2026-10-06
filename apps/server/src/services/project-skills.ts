// 项目级技能目录 `.yan-zhi/skills` 下的 .md（P2-8，2026-10-04）
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
import { dirEntryFingerprint, makeFingerprintCache } from './fs-fingerprint.js';
import { createLogger } from './logger.js';
const logger = createLogger('project-skills');

export interface ProjectSkill {
  name: string;
  description: string;
  triggers: string[];
  /** 已按 DB skill 同口径截断（2000 字）的正文 */
  body: string;
  /** 来源标注（提示词里让模型知道可以从工作目录直接读到完整文件） */
  source: string;
}

// 缓存 = mtime+size 指纹（唯一实现在 fs-fingerprint.ts；loadProjectRules 同款共用）：
// 提示词每一轮 ReAct 都要构建，不能每次重读盘。
const CACHE = makeFingerprintCache<ProjectSkill[]>();
/** 与 DB skill 的 body 注入截断同口径（buildSystemPromptForBackend 技能段） */
export const PROJECT_SKILL_BODY_MAX_CHARS = 2000;
export const PROJECT_SKILLS_MAX_COUNT = 20;

/** 技能正文截断的唯一实现（DB 技能与项目技能共用）——口径与文案不允许两处各写一份：
 *  此前半角 `...(...)` 与全角 `…（…）` 刚写就漂移过，改口径时只改一处必然漏另一处。 */
export function truncateSkillBody(body: string, max = PROJECT_SKILL_BODY_MAX_CHARS): string {
  const text = (body || '').trim();
  return text.length > max ? `${text.slice(0, max)}\n…（流程过长已截断）` : text;
}

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
  // 目录式项目技能（2026-10-06，对齐 .claude/skills 标准）：<名>/SKILL.md + 子目录文件。
  // SKILL.md 为主文注入；子目录文件不注入提示词，模型按需 file_read
  // （source 即目录路径，模型看到 source 就知道去哪读）。
  const dirSkills: Array<{ key: string; dir: string }> = [];
  try {
    for (const name of readdirSync(skillsDir)) {
      const dir = path.join(skillsDir, name);
      try {
        if (statSync(dir).isDirectory() && existsSync(path.join(dir, 'SKILL.md'))) {
          dirSkills.push({ key: name + '/SKILL.md', dir });
        }
      } catch { /* 跳过不可读条目 */ }
    }
  } catch { /* readdir 失败已在上方兜底 */ }
  if (!files.length && !dirSkills.length) return [];
  const fingerprint = dirEntryFingerprint(
    [...files.map((f) => ({ key: f, path: path.join(skillsDir, f) })),
     ...dirSkills.map((d) => ({ key: d.key, path: path.join(d.dir, 'SKILL.md') }))],
  );
  return CACHE.get(workspaceDir, fingerprint, () => {
    const skills: ProjectSkill[] = [];
    const pushSkill = (parsed: { frontmatter: any; body: string }, source: string, fallbackName: string) => {
      const name = String(parsed.frontmatter.name || '').trim() || fallbackName;
      const body = truncateSkillBody(parsed.body || '');
      if (!name && !body) return;
      skills.push({
        name,
        description: String(parsed.frontmatter.description || '').trim(),
        triggers: Array.isArray(parsed.frontmatter.triggers) ? parsed.frontmatter.triggers.map(String) : [],
        body,
        source,
      });
    };
    for (const f of files) {
      const filePath = path.join(skillsDir, f);
      try {
        pushSkill(parseSkillMd(readFileSync(filePath, 'utf-8')), `.yan-zhi/skills/${f}`, f.replace(/\.md$/i, ''));
        if (skills.length >= PROJECT_SKILLS_MAX_COUNT) {
          logger.warn(`[project-skills] ${workspaceDir} 技能文件超过 ${PROJECT_SKILLS_MAX_COUNT} 个，其余未注入`);
          break;
        }
      } catch (e: any) {
        logger.warn(`[project-skills] 解析失败（已跳过）${filePath}:`, e?.message || e);
      }
    }
    for (const d of dirSkills) {
      try {
        pushSkill(parseSkillMd(readFileSync(path.join(d.dir, 'SKILL.md'), 'utf-8')), `.yan-zhi/skills/${d.key.replace('/SKILL.md', '')}/`, d.key.replace('/SKILL.md', ''));
        if (skills.length >= PROJECT_SKILLS_MAX_COUNT) {
          logger.warn(`[project-skills] ${workspaceDir} 技能文件超过 ${PROJECT_SKILLS_MAX_COUNT} 个，其余未注入`);
          break;
        }
      } catch (e: any) {
        logger.warn(`[project-skills] 解析失败（已跳过）${d.dir}:`, e?.message || e);
      }
    }
    return skills;
  });
}