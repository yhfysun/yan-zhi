// skill 子目录文件落盘（2026-10-06）—— DB files_json → <工作目录>/.yan-zhi/skills/<skill名>/
//
// ★ 为什么落盘：skill 的子目录文件（references/*.md 等）要能被 agent 的 file_read
//   读到，必须以真实层级目录存在于工作目录。DB files_json 是真相源（管理/导入导出/
//   换设备不丢），磁盘是运行时投影。
//
// 写入策略：内容与磁盘一致则跳过（幂等，任务每轮构建提示词时都可安全调用）；
// skill 的 files 为空时不动磁盘（不删除历史落盘 —— 用户可能已改动）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('skill-files');

export interface SkillFileEntry {
  path: string;
  content: string;
}

/** path 安全校验：只允许相对路径（禁绝对路径 / 盘符 / ..） */
export function isSafeSkillFilePath(p: string): boolean {
  if (!p || typeof p !== 'string') return false;
  const norm = p.replace(/\\/g, '/').trim();
  if (!norm || norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) return false;
  if (norm.split('/').some((seg) => seg === '..' || seg === '' || seg === '.')) return false;
  return true;
}

/** 解析 files_json；非法条目跳过（path 不安全/无 content），返回空数组表示无子文件 */
export function parseSkillFiles(filesJson: unknown): SkillFileEntry[] {
  if (typeof filesJson !== 'string' || !filesJson.trim()) return [];
  try {
    const arr = JSON.parse(filesJson);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f: any) => f && isSafeSkillFilePath(f.path) && typeof f.content === 'string')
      .map((f: any) => ({ path: String(f.path).replace(/\\/g, '/').trim(), content: f.content }));
  } catch {
    return [];
  }
}

/** skill 名 → 安全目录名（Windows 非法字符替换） */
export function skillDirName(name: string): string {
  return (name || 'skill').replace(/[\\/:*?"<>|]/g, '_').trim() || 'skill';
}

/**
 * 把一个 skill 的 body（SKILL.md）+ 子目录文件落到工作目录。
 * 幂等：磁盘内容一致则跳过写。返回实际写入的文件数。
 */
export function writeSkillToWorkspace(
  workspaceDir: string,
  skillName: string,
  body: string,
  files: SkillFileEntry[],
): number {
  if (!workspaceDir || !workspaceDir.trim()) return 0;
  const root = path.join(workspaceDir, '.yan-zhi', 'skills', skillDirName(skillName));
  let written = 0;
  const entries: Array<{ rel: string; content: string }> = [
    { rel: 'SKILL.md', content: body || '' },
    ...files.map((f) => ({ rel: f.path, content: f.content })),
  ];
  for (const { rel, content } of entries) {
    try {
      const abs = path.join(root, ...rel.split('/'));
      if (existsSync(abs) && readFileSync(abs, 'utf-8') === content) continue;
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf-8');
      written++;
    } catch (e: any) {
      logger.warn(`skill 文件落盘失败 ${skillName}/${rel}: ${e?.message || e}`);
    }
  }
  return written;
}

/**
 * 批量同步一批 skill（任务启动/构建提示词时调用）。
 * files 为空的 skill 也落 SKILL.md（保持层级目录约定一致）。
 */
export function syncSkillsToWorkspace(
  workspaceDir: string,
  skills: Array<{ name: string; body: string; filesJson: unknown }>,
): number {
  let n = 0;
  for (const sk of skills) {
    try {
      n += writeSkillToWorkspace(workspaceDir, sk.name, sk.body, parseSkillFiles(sk.filesJson));
    } catch (e: any) {
      logger.warn(`skill 同步失败 ${sk.name}: ${e?.message || e}`);
    }
  }
  return n;
}
