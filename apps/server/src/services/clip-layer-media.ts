// 矢量图层素材的**工程引用白名单**（P1-10 / C-1）。
//
// ★★★ 为什么需要（而不是复用现有流式端点）：
//   前端实时合成贴纸/画中画需要用 <img>/<video> 读本机文件，浏览器拿不到 file://，
//   必须走 HTTP。既有两条通道都不认「导入素材的绝对路径」：
//     · /conversations/:id/file-stream —— 只认已登记交付物 + 会话产物目录；
//     · /api/workspace/file-stream —— 只认工作区/空间/产物根，导入素材可能在任意盘位。
//   若为了播一个贴纸而放宽到"任意路径"，等于把整台机器的文件读权限开给浏览器。
//
// ★ 本白名单的边界：只放行**当前工程里真实引用到**的素材（主轨/画中画/贴纸/音频/BGM）。
//   判定是**精确路径**（规范化后相等），不是前缀/目录包含 —— 防止 ../ 或同前缀绕过。
import path from 'node:path';
import type { ClipProject } from './clip-project.js';

/** 规范化文件路径用于比较：绝对路径 + Windows 大小写不敏感。 */
export function normalizeFsPath(p: string): string {
  const abs = path.resolve(String(p || '').trim());
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

/**
 * 收集工程引用的全部本机素材路径。
 * ★ 只收**有源文件**的字段：文本没有文件、特效层由服务端生成，都不在流式白名单里。
 */
export function projectSourcePaths(project: ClipProject | null | undefined): string[] {
  if (!project) return [];
  const out: string[] = [];
  const push = (p: string | undefined | null) => {
    const s = String(p || '').trim();
    if (s) out.push(s);
  };
  for (const c of project.clips || []) {
    push(c.file);
    // 配音替换音轨也属于该段素材（属性面板试听/预览会用到）
    push(c.audioFile);
  }
  for (const o of project.overlays || []) push(o.file);
  for (const s of project.stickers || []) push(s.file);
  for (const a of project.audios || []) push(a.file);
  push(project.bgm?.file);
  return [...new Set(out)];
}

/** 该路径是否被工程真实引用（唯一判定入口，路由不得自己另写一套）。 */
export function isProjectSourcePath(project: ClipProject | null | undefined, file: string): boolean {
  const want = normalizeFsPath(file);
  return projectSourcePaths(project).some((p) => normalizeFsPath(p) === want);
}
