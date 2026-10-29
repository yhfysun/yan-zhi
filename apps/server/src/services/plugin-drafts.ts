/**
 * 插件草稿（P2 代码组件审核流）—— 隔离目录 + 人工审核。
 *
 * ★ 铁律：草稿只写 `plugins/drafts/<id>/`，这个目录**不被任何装载器扫描**；
 *   审核通过 = 把目录**移动**到 `plugins/installed/<id>/` 并注册。
 *   ⇒ 「未审核不可执行」是**物理保证**（位置决定），不是某个 enabled 标志的自觉。
 * ★ 模型/智能体只能创建草稿；通过需要显式确认串 `approve <id>`（审核按钮生成），
 *   工具面不提供 approve。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '@yan-zhi/core';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 隔离目录（默认 apps/server/plugins/drafts；测试可用 YZ_DRAFTS_DIR 覆盖） */
export function draftsDir(): string {
  return process.env.YZ_DRAFTS_DIR
    ? path.resolve(process.env.YZ_DRAFTS_DIR)
    : path.resolve(here, '..', '..', '..', 'plugins', 'drafts');
}

/** 已安装目录（与 routes/plugins.ts 的 PLUGINS_DIR 同口径；测试可用 YZ_INSTALLED_DIR 覆盖） */
export function installedDir(): string {
  return process.env.YZ_INSTALLED_DIR
    ? path.resolve(process.env.YZ_INSTALLED_DIR)
    : path.resolve(here, '..', '..', '..', 'plugins', 'installed');
}

const ID_RE = /^[a-z][a-z0-9-]*$/;
const META_FILE = '.draft.json';
const MAX_FILES = 50;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;

export interface DraftMeta {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  source: string;
  permissions: string[];
  files: string[];
}

export interface DraftInput {
  manifest?: unknown;
  files?: Record<string, string>;
  source?: string;
}

function safeRel(rel: string): string | null {
  if (!rel || path.isAbsolute(rel)) return null;
  const clean = rel.replace(/\\/g, '/');
  if (clean.split('/').some((seg) => seg === '..' || seg === '' || seg === '.')) return null;
  if (clean === META_FILE || clean.endsWith('/' + META_FILE)) return null;
  if (clean.startsWith('node_modules/')) return null;
  return clean;
}

export async function createDraft(input: DraftInput): Promise<DraftMeta> {
  const manifest = validateManifest(input.manifest);
  if (!ID_RE.test(manifest.id)) throw new Error('插件 id 非法');
  const filesIn = input.files && typeof input.files === 'object' ? input.files : {};
  const entries = Object.entries(filesIn);
  if (entries.length === 0) throw new Error('files 不能为空');
  if (entries.length > MAX_FILES) throw new Error(`文件数超过上限（${MAX_FILES}）`);

  let total = 0;
  const files: Record<string, string> = {};
  for (const [relRaw, contentRaw] of entries) {
    const rel = safeRel(String(relRaw));
    if (!rel) throw new Error(`非法文件路径：${relRaw}`);
    const content = String(contentRaw);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_FILE_BYTES) throw new Error(`文件过大（>${MAX_FILE_BYTES} 字节）：${rel}`);
    total += bytes;
    files[rel] = content;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error(`草稿总大小超过上限（${MAX_TOTAL_BYTES} 字节）`);

  const main = manifest.main || 'index.js';
  if (!files[main.replace(/\\/g, '/')]) {
    throw new Error(`入口文件缺失：${main}（manifest.main）`);
  }

  const dir = path.join(draftsDir(), manifest.id);
  if (fs.existsSync(dir)) throw new Error(`草稿已存在：${manifest.id}（请先删除或改名）`);
  await fsp.mkdir(dir, { recursive: true });

  await fsp.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    if (!full.startsWith(path.join(dir) + path.sep)) throw new Error(`路径越界：${rel}`);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, content, 'utf8');
  }

  const meta: DraftMeta = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    createdAt: new Date().toISOString(),
    source: String(input.source || 'manual'),
    permissions: Array.isArray(manifest.permissions) ? manifest.permissions : [],
    files: Object.keys(files).sort(),
  };
  await fsp.writeFile(path.join(dir, META_FILE), JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

export async function listDrafts(): Promise<Array<{ meta: DraftMeta; manifest: unknown }>> {
  const root = draftsDir();
  let names: string[] = [];
  try {
    names = (await fsp.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && ID_RE.test(d.name))
      .map((d) => d.name);
  } catch {
    return [];
  }
  const out: Array<{ meta: DraftMeta; manifest: unknown }> = [];
  for (const name of names) {
    try {
      const meta = JSON.parse(await fsp.readFile(path.join(root, name, META_FILE), 'utf8')) as DraftMeta;
      const manifest = JSON.parse(await fsp.readFile(path.join(root, name, 'manifest.json'), 'utf8'));
      out.push({ meta, manifest });
    } catch {
      /* 损坏草稿跳过，不阻断列表 */
    }
  }
  return out.sort((a, b) => b.meta.createdAt.localeCompare(a.meta.createdAt));
}

export async function getDraft(id: string): Promise<{ meta: DraftMeta; manifest: unknown; files: Record<string, string> } | null> {
  if (!ID_RE.test(id)) return null;
  const dir = path.join(draftsDir(), id);
  try {
    const meta = JSON.parse(await fsp.readFile(path.join(dir, META_FILE), 'utf8')) as DraftMeta;
    const manifest = JSON.parse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    const files: Record<string, string> = {};
    for (const rel of meta.files) {
      const full = path.join(dir, rel);
      if (!full.startsWith(dir + path.sep)) continue;
      try { files[rel] = await fsp.readFile(full, 'utf8'); } catch { /* 缺文件跳过 */ }
    }
    return { meta, manifest, files };
  } catch {
    return null;
  }
}

export async function deleteDraft(id: string): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  const dir = path.join(draftsDir(), id);
  if (!fs.existsSync(dir)) return false;
  await fsp.rm(dir, { recursive: true, force: true });
  return true;
}

/**
 * 审核通过：显式确认串 + 移动到已安装目录。返回注册所需信息（注册在调用方做）。
 * 不做「只改标志位」的近似 —— 草稿与已安装必须是两个物理位置。
 */
export async function approveDraft(
  id: string,
  confirmation: string,
): Promise<{ ok: true; pluginId: string; manifest: { id: string; main?: string }; destDir: string; entryPath: string } | { ok: false; error: string }> {
  if (!ID_RE.test(id)) return { ok: false, error: 'invalid-id' };
  if (String(confirmation) !== `approve ${id}`) {
    return { ok: false, error: 'missing-confirmation' };
  }
  const src = path.join(draftsDir(), id);
  if (!fs.existsSync(src)) return { ok: false, error: 'draft-not-found' };
  const dest = path.join(installedDir(), id);
  if (fs.existsSync(dest)) return { ok: false, error: 'already-installed' };

  let manifest: { id: string; main?: string };
  try {
    manifest = validateManifest(JSON.parse(await fsp.readFile(path.join(src, 'manifest.json'), 'utf8')));
  } catch (e) {
    return { ok: false, error: 'bad-manifest: ' + (e as Error).message };
  }

  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.rename(src, dest);
  try { await fsp.rm(path.join(dest, META_FILE), { force: true }); } catch { /* ignore */ }

  const entryPath = path.join(dest, manifest.main || 'index.js');
  if (!fs.existsSync(entryPath)) return { ok: false, error: 'entry-missing-after-move' };
  return { ok: true, pluginId: id, manifest, destDir: dest, entryPath };
}
