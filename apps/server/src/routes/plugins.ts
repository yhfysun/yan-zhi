import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { getPluginManager, validateManifest, ManifestError } from '@yan-zhi/core';
import type { Plugin, PluginManifest } from '@yan-zhi/core';
import AdmZip from 'adm-zip';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_TEMPLATES } from '../plugins/templates/index.js';

const router = Router();
router.use(authMiddleware);

const PLUGINS_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'plugins', 'installed');

function toInfo(p: Plugin) {
  return { manifest: p.manifest, state: p.state, error: p.error, config: p.config, source: p.source };
}

/** 从 zip buffer 解析 manifest（不落盘） */
function parseManifestFromZip(buffer: Buffer): PluginManifest {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((e) => e.entryName === 'manifest.json' || e.entryName.endsWith('/manifest.json'));
  if (!entry) throw new ManifestError('.yzp 缺少 manifest.json');
  const raw = zip.readAsText(entry);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new ManifestError('manifest.json 不是合法 JSON'); }
  return validateManifest(json);
}

// GET /api/plugins
router.get('/', (_req: Request, res: Response) => {
  res.json({ data: getPluginManager().list().map(toInfo) });
});

// POST /api/plugins/install/preview —— 预览 manifest（权限确认前）
router.post('/install/preview', (req: Request, res: Response) => {
  try {
    const { base64 } = req.body || {};
    if (typeof base64 !== 'string') { res.status(400).json({ error: '缺少 base64' }); return; }
    const manifest = parseManifestFromZip(Buffer.from(base64, 'base64'));
    res.json({ data: manifest });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/plugins/install —— 安装 .yzp（body: { base64 }）
router.post('/install', async (req: Request, res: Response) => {
  try {
    const { base64 } = req.body || {};
    if (typeof base64 !== 'string') { res.status(400).json({ error: '缺少 base64' }); return; }
    const buffer = Buffer.from(base64, 'base64');
    const manifest = parseManifestFromZip(buffer);
    const mgr = getPluginManager();
    if (mgr.get(manifest.id)) { res.status(409).json({ error: `插件 ${manifest.id} 已存在，请先卸载` }); return; }

    // 解压到 plugins/installed/<id>/
    const dir = path.join(PLUGINS_DIR, manifest.id);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    const zip = new AdmZip(buffer);
    zip.extractAllTo(dir, true);

    const entryFile = manifest.main || 'index.js';
    const entryPath = path.join(dir, entryFile);
    const entryUrl = (await import('node:url')).pathToFileURL(entryPath).href;
    await mgr.registerInstalled(manifest, entryUrl);
    res.json({ data: toInfo(mgr.get(manifest.id)!) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /api/plugins/template —— 插件开发脚手架（manifest + 源码 + README + 打包 zip）
router.get('/template', (_req: Request, res: Response) => {
  const t = PLUGIN_TEMPLATES.template;
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(t.manifest, null, 2), 'utf8'));
  zip.addFile('main.ts', Buffer.from(t.code, 'utf8'));
  zip.addFile('README.md', Buffer.from(t.readme, 'utf8'));
  res.json({
    data: {
      manifest: t.manifest,
      code: t.code,
      readme: t.readme,
      filename: 'plugin-template.zip',
      base64: zip.toBuffer().toString('base64'),
    },
  });
});

// GET /api/plugins/:id/export —— 导出插件
// 内置插件：manifest + 源码模板打包 zip（format=source，供阅读学习/二改）
// 已安装插件：安装目录打回 .yzp（format=yzp，可直接重装）
router.get('/:id/export', (req: Request, res: Response) => {
  const p = getPluginManager().get(req.params.id);
  if (!p) { res.status(404).json({ error: '插件不存在' }); return; }
  const id = p.manifest.id;
  const ver = p.manifest.version || '0.0.0';
  try {
    if (p.source === 'builtin') {
      const tpl = PLUGIN_TEMPLATES[id];
      if (!tpl) { res.status(404).json({ error: '该内置插件暂无源码模板' }); return; }
      const zip = new AdmZip();
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(tpl.manifest, null, 2), 'utf8'));
      zip.addFile('main.ts', Buffer.from(tpl.code, 'utf8'));
      zip.addFile('README.md', Buffer.from(tpl.readme, 'utf8'));
      res.json({
        data: { format: 'source', filename: `${id}-${ver}-source.zip`, base64: zip.toBuffer().toString('base64') },
      });
    } else {
      const dir = path.join(PLUGINS_DIR, id);
      const zip = new AdmZip();
      zip.addLocalFolder(dir);
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(p.manifest, null, 2), 'utf8'));
      res.json({
        data: { format: 'yzp', filename: `${id}-${ver}.yzp`, base64: zip.toBuffer().toString('base64') },
      });
    }
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /api/plugins/:id
router.get('/:id', (req: Request, res: Response) => {
  const p = getPluginManager().get(req.params.id);
  if (!p) { res.status(404).json({ error: '插件不存在' }); return; }
  res.json({ data: toInfo(p) });
});

// POST /api/plugins/:id/enable
router.post('/:id/enable', async (req: Request, res: Response) => {
  try {
    await getPluginManager().enable(req.params.id);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/plugins/:id/disable
router.post('/:id/disable', async (req: Request, res: Response) => {
  try {
    await getPluginManager().disable(req.params.id);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// PUT /api/plugins/:id/config
router.put('/:id/config', async (req: Request, res: Response) => {
  try {
    await getPluginManager().setConfig(req.params.id, req.body || {});
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// DELETE /api/plugins/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await getPluginManager().uninstall(req.params.id);
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;