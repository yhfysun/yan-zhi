// 自有资产识别（P1）。
//
// ★ 安全边界：这里的结果**由服务端计算**，绝不接受调用方传 `self: true`。
//   否则模型可以把任意外部 URL 标成"自有资产"来绕过 scope 登记。
// ★ 只认三类：仓库目录、构建产物目录、本机固定端口的运行时。
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type SelfKind = 'repo' | 'build' | 'runtime';

export interface SelfAsset {
  id: string;
  kind: SelfKind;
  /** 目录绝对路径 或 http://127.0.0.1:port */
  value: string;
  label: string;
}

/** 言智自身的本地服务端口（server 默认 3001；Vite dev 常见 5173/3000） */
export const SELF_PORTS = [3001, 5173, 3000];

const BUILD_DIRS = ['dist', 'build', 'release', 'out', 'android', 'apps/desktop/dist'];

/** 从当前目录向上找仓库根（有 pnpm-workspace.yaml 或 .git 且 package.json） */
export async function findRepoRoot(start = process.cwd()): Promise<string | null> {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    const hasPkg = await fs.stat(path.join(dir, 'package.json')).then((s) => s.isFile()).catch(() => false);
    const hasWs = await fs.stat(path.join(dir, 'pnpm-workspace.yaml')).then((s) => s.isFile()).catch(() => false);
    const hasGit = await fs.stat(path.join(dir, '.git')).then((s) => s.isDirectory()).catch(() => false);
    if (hasPkg && (hasWs || hasGit)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export async function discoverSelfAssets(start = process.cwd()): Promise<SelfAsset[]> {
  const root = await findRepoRoot(start);
  const assets: SelfAsset[] = [];
  if (root) {
    assets.push({ id: 'self_repo', kind: 'repo', value: root, label: '言智源码仓库' });
    for (const rel of BUILD_DIRS) {
      const dir = path.join(root, rel);
      const ok = await fs.stat(dir).then((s) => s.isDirectory()).catch(() => false);
      if (ok) assets.push({ id: `self_build_${rel.replace(/[\\/]/g, '_')}`, kind: 'build', value: dir, label: `构建产物 ${rel}` });
    }
  }
  for (const port of SELF_PORTS) {
    assets.push({ id: `self_runtime_${port}`, kind: 'runtime', value: `http://127.0.0.1:${port}`, label: `本机服务 :${port}` });
  }
  return assets;
}

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function localPort(target: string): number | null {
  const t = target.trim();
  // 带协议的本地 URL（允许带路径，只取端口）
  const m = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::(\d+))?/i.exec(t);
  if (m) return m[1] ? Number(m[1]) : 80;
  // 裸 host[:port]（/watch start 127.0.0.1:3001 这类写法）
  const bare = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::(\d+))?$/i.exec(t);
  if (!bare) return null;
  return bare[1] ? Number(bare[1]) : 80;
}

/** 目标是否属于已发现的自有资产（不信任调用方声明） */
export function matchSelfAsset(target: string, assets: SelfAsset[]): SelfAsset | null {
  const t = String(target || '').trim();
  if (!t) return null;
  const port = localPort(t);
  if (port !== null) {
    const hit = assets.find((a) => a.kind === 'runtime' && localPort(a.value) === port);
    return hit || null;
  }
  if (/^https?:\/\//i.test(t)) return null; // 外部 URL 一律不算自有资产
  const abs = path.resolve(t);
  const hits = assets.filter((a) => a.kind !== 'runtime' && isInside(a.value, abs));
  // 取最具体的（路径最长的）命中
  return hits.sort((a, b) => b.value.length - a.value.length)[0] || null;
}
