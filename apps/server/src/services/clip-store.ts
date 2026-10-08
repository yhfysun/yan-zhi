// 剪辑工程文件读写 —— 单一出口。
//
// ★ 为什么必须只有一处目录解析：书签
//   · clip_project 工具（智能体路径）
//   · routes/clip.ts（UI 路径）
//   两条入口若各自拼路径，必然会漂移 —— 表现为「AI 改的工程 UI 看不到」，
//   而两边都不报错（都在"成功地"读写两个不同的文件）。

import fs from 'node:fs';
import path from 'node:path';
import { resolveArtifactDirFor } from './artifact-dir.js';
import type { ClipProject } from './clip-project.js';

export const CLIP_PROJECT_FILE = 'clip-project.json';

/** 工程文件目录：会话的**中间目录**（内部工作文件，不污染交付区）。 */
export function clipProjectPath(conversationId?: string): { dir: string; file: string } {
  const dir = conversationId
    ? resolveArtifactDirFor({ conversationId, category: 'intermediate' }).dir
    : resolveArtifactDirFor({ category: 'intermediate' }).dir;
  return { dir, file: path.join(dir, CLIP_PROJECT_FILE) };
}

/** 读工程；不存在或损坏返回 null（调用方按"还没有工程"处理，不抛错）。 */
export function readClipProject(conversationId?: string): ClipProject | null {
  try {
    const { file } = clipProjectPath(conversationId);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as ClipProject;
    if (!parsed || !Array.isArray(parsed.clips) || !Array.isArray(parsed.texts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 写工程（目录不存在则创建）；返回落盘路径。 */
export function writeClipProject(conversationId: string | undefined, project: ClipProject): string {
  const { dir, file } = clipProjectPath(conversationId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(project, null, 2), 'utf8');
  return file;
}