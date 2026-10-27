import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { getPluginManager, validateManifest, ManifestError } from '@yan-zhi/core';
import type { Plugin, PluginManifest } from '@yan-zhi/core';
import AdmZip from 'adm-zip';
import { promises as fs } from 'node:fs';
import { existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_TEMPLATES } from '../plugins/templates/index.js';
import { assertPluginEngine, resolveHostVersion } from '../plugins/host-version.js';
import {
  parsePackageManifest,
  packageDirsToRemove,
  resolvePackageEntryPathIn,
  scanInstalledPackages,
} from '../plugins/installed-packages.js';

const router = Router();
router.use(authMiddleware);

/** 宿主（应用）版本：engine 校验用，启动时解析一次 */
const HOST_VERSION = resolveHostVersion();

export const PLUGINS_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'plugins', 'installed');

/** 内置插件静态资源目录（皮肤壁纸/预览图等）：apps/server/assets/plugin-assets/<pluginId>/ */
// 资源位置随运行布局不同而变化：
//  - dev / 源码运行：apps/server/src/routes → 上溯到 apps/server/assets/plugin-assets
//  - 打包版（electron-builder extraResources）：resources/server/assets/plugin-assets
//    （编译产物 routes 在 resources/server/dist/apps/server/src/routes）
//  - 早期实现写死「上溯 3 级 / 5 级」猜路径，dev/打包/源码三种布局级数不同，极易 off-by-one
//    → 打包版皮肤壁纸 404（资源随包带上了，但代码解析到错误目录）。
//  现改为「从本文件逐级向上查找首个存在的 assets/plugin-assets」，无论哪种布局都能命中，
//  彻底消除对目录层级的假设，避免「dev 能、打包不能」反复出现。
function resolveBuiltinAssetsDir(): string {
  const start = path.dirname(fileURLToPath(import.meta.url));
  let cur = start;
  for (let i = 0; i < 12; i++) {
    const cand = path.join(cur, 'assets', 'plugin-assets');
    if (existsSync(cand)) return cand;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // 兜底：保持原 dev 相对路径（理论上不会走到，仅防极端布局）
  return path.resolve(start, '..', '..', '..', 'assets', 'plugin-assets');
}
export const BUILTIN_ASSETS_DIR = resolveBuiltinAssetsDir();

function toInfo(p: Plugin) {
  return { manifest: p.manifest, state: p.state, error: p.error, config: p.config, source: p.source };
}

/**
 * 从 zip buffer 解析插件包（不落盘）：单清单 / 多清单（`{ id, multi, manifests }`）都支持。
 * 逐条 validateManifest + engine 闸 —— 多清单包里任何一条不合格都拒绝整包（不能装半套）。
 */
interface ParsedZipPackage {
  zip: AdmZip;
  kind: 'single' | 'multi';
  packageId: string;
  manifests: PluginManifest[];
}

function parsePackageFromZip(buffer: Buffer): ParsedZipPackage {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((e) => e.entryName === 'manifest.json' || e.entryName.endsWith('/manifest.json'));
  if (!entry) throw new ManifestError('.yzp 缺少 manifest.json');
  const raw = zip.readAsText(entry);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new ManifestError('manifest.json 不是合法 JSON'); }
  const shape = parsePackageManifest(json);
  if (!shape.packageId) {
    throw new ManifestError(
      shape.kind === 'multi'
        ? '多清单插件包缺少包 id（manifest.json 顶层需有 id 字段；用当前构建器重新打包即可）'
        : 'manifest.json 缺少 id',
    );
  }
  const manifests = shape.rawManifests.map((m) => validateManifest(m));
  for (const m of manifests) assertPluginEngine(m, HOST_VERSION);
  return { zip, kind: shape.kind, packageId: shape.packageId, manifests };
}

/**
 * 导出源码：优先读真实源码文件，读不到再回落内嵌模板。
 *
 * ★ 为什么要有内嵌模板这一份：安装包里没有 .ts（tsc 只编 dist，extraResources 不带源码），
 *   打包版的导出功能只能读构建期内嵌的快照 —— 这是分发的需要，但不能放任两份漂移，
 *   一致性由 test/plugin-templates-sync.test.ts 钉死（改源码忘同步 → 测试直接红）。
 * ★ 为什么先读磁盘：dev 下永远导出当前源码，改完插件代码不必先跑同步脚本。
 */
function readPluginSourceFromDisk(id: string): string | null {
  const base = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'plugins');
  for (const file of [path.join(base, `${id}.ts`), path.join(base, id, 'index.ts')]) {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      /* 打包版不带源码，走内嵌回落 */
    }
  }
  return null;
}

// GET /api/plugins
router.get('/', (_req: Request, res: Response) => {
  const mgr = getPluginManager();
  // ★ 模式运行时化（P3）：聚合已启用插件的 contributes.mode 为 modeDefs 随快照下发。
  //   前端据此动态合并模式清单（基座 office + 插件模式），替代构建期硬编码的部分消费方。
  const modeDefs = mgr.list()
    .filter((p) => p.state === 'enabled' && p.manifest.contributes?.mode)
    .map((p) => ({ pluginId: p.manifest.id, ...p.manifest.contributes!.mode! }));
  res.json({ data: mgr.list().map(toInfo), modeDefs });
});

// POST /api/plugins/install/preview —— 预览 manifest（权限确认前）
router.post('/install/preview', (req: Request, res: Response) => {
  try {
    const { base64 } = req.body || {};
    if (typeof base64 !== 'string') { res.status(400).json({ error: '缺少 base64' }); return; }
    const pkg = parsePackageFromZip(Buffer.from(base64, 'base64'));
    const base = pkg.manifests[0];
    if (pkg.kind === 'single') { res.json({ data: base }); return; }
    // 多清单包：data 给一个用于展示的代表清单，multi 提供包级信息（前端据此显示"含 N 个插件"）
    res.json({
      data: { ...base, id: pkg.packageId, name: `${base.name} 等 ${pkg.manifests.length} 个插件` },
      multi: {
        packageId: pkg.packageId,
        count: pkg.manifests.length,
        ids: pkg.manifests.map((m) => m.id),
        names: pkg.manifests.map((m) => m.name),
      },
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// POST /api/plugins/install —— 安装 .yzp（body: { base64 }）；单清单与多清单包都支持
router.post('/install', async (req: Request, res: Response) => {
  try {
    const { base64 } = req.body || {};
    if (typeof base64 !== 'string') { res.status(400).json({ error: '缺少 base64' }); return; }
    const pkg = parsePackageFromZip(Buffer.from(base64, 'base64'));
    const mgr = getPluginManager();
    const conflicts = pkg.manifests.filter((m) => mgr.get(m.id)).map((m) => m.id);
    if (conflicts.length) {
      res.status(409).json({ error: `插件 ${conflicts.join('、')} 已存在，请先卸载` });
      return;
    }

    // 解压到 plugins/installed/<包 id>/（多清单包的所有插件共用一个目录）
    const dir = path.join(PLUGINS_DIR, pkg.packageId);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    const registered: string[] = [];
    try {
      pkg.zip.extractAllTo(dir, true);

      // 入口三态解析（backend/index.js | manifest.main | index.js），见 install-entry.ts
      const entryPath = resolvePackageEntryPathIn(dir, pkg.manifests);
      if (!entryPath) throw new ManifestError('插件包缺少后端入口（应有 backend/index.js 或 index.js，或在 manifest.main 中声明）');
      const entryUrl = (await import('node:url')).pathToFileURL(entryPath).href;
      for (const m of pkg.manifests) {
        await mgr.registerInstalled(m, entryUrl);
        registered.push(m.id);
      }
    } catch (e) {
      // 失败即回滚：注销已注册的 id 并删掉半成品目录（不留「DB 里没有、磁盘上有」的残局）
      for (const id of registered) await mgr.uninstall(id).catch(() => {});
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      throw e;
    }
    res.json({
      data: toInfo(mgr.get(pkg.manifests[0].id)!),
      ...(pkg.kind === 'multi'
        ? { multi: { packageId: pkg.packageId, count: registered.length, ids: registered } }
        : {}),
    });
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
      if (tpl) {
        const zip = new AdmZip();
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(tpl.manifest, null, 2), 'utf8'));
        zip.addFile('main.ts', Buffer.from(readPluginSourceFromDisk(id) ?? tpl.code, 'utf8'));
        zip.addFile('README.md', Buffer.from(tpl.readme, 'utf8'));
        res.json({
          data: { format: 'source', filename: `${id}-${ver}-source.zip`, base64: zip.toBuffer().toString('base64') },
        });
        return;
      }
      // 皮肤类声明式内置插件：打包 manifest + assets/plugin-assets/<id>/ 静态资源 + README
      const assetsDir = path.join(BUILTIN_ASSETS_DIR, id);
      if (existsSync(assetsDir)) {
        const zip = new AdmZip();
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(p.manifest, null, 2), 'utf8'));
        zip.addLocalFolder(assetsDir, 'assets');
        zip.addFile(
          'README.md',
          Buffer.from(
            `# ${p.manifest.name}（皮肤包）\n\n${p.manifest.description || ''}\n\n` +
            '## 自定义\n\n1. 替换 assets/ 下的壁纸图片（建议 2560×1600 WebP，单张 ≤800KB）\n' +
            '2. 修改 manifest.json 中 contributes.themes 的配色/遮罩/名称\n' +
            '3. 将整个目录打成 .zip，改后缀为 .yzp，在「插件管理」页安装即可生效\n',
            'utf8',
          ),
        );
        res.json({
          data: { format: 'source', filename: `${id}-${ver}-source.zip`, base64: zip.toBuffer().toString('base64') },
        });
        return;
      }
      // 直接读取实际源码文件（ops-shell / cicd-pipeline / java-suite 等未维护模板副本的内置插件）
      const srcFile = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'plugins', `${id}.ts`);
      if (existsSync(srcFile)) {
        const zip = new AdmZip();
        zip.addFile('manifest.json', Buffer.from(JSON.stringify(p.manifest, null, 2), 'utf8'));
        zip.addFile(`${id}.ts`, Buffer.from(readFileSync(srcFile, 'utf8'), 'utf8'));
        zip.addFile('README.md', Buffer.from(
          `# ${p.manifest.name}\n\n${p.manifest.description || ''}\n\n` +
          `## 源码\n\n入口文件：${id}.ts\n\n` +
          '## 二次开发\n\n1. 修改源码后重新构建项目\n2. 重启服务生效\n',
          'utf8',
        ));
        res.json({
          data: { format: 'source', filename: `${id}-${ver}-source.zip`, base64: zip.toBuffer().toString('base64') },
        });
        return;
      }
      res.status(404).json({ error: '该内置插件暂无源码模板' });
      return;
    }
    // 已安装插件：安装目录打回 .yzp
    const dir = path.join(PLUGINS_DIR, id);
    const zip = new AdmZip();
    zip.addLocalFolder(dir);
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(p.manifest, null, 2), 'utf8'));
    res.json({
      data: { format: 'yzp', filename: `${id}-${ver}.yzp`, base64: zip.toBuffer().toString('base64') },
    });
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
    const mgr = getPluginManager();
    const before = mgr.get(req.params.id);
    await mgr.uninstall(req.params.id);
    // 已安装插件的目录随之删除；多清单包共用目录 —— 包里还有别的已注册插件就保留
    // （内置插件不碰磁盘：它的目录属于应用包）
    if (before?.source === 'installed') {
      const dirs = packageDirsToRemove(scanInstalledPackages(PLUGINS_DIR), req.params.id, (id) => !!mgr.get(id));
      if (dirs.length) {
        for (const d of dirs) await fs.rm(d, { recursive: true, force: true });
      } else {
        // 目录布局不认识（清单损坏/已被手工删）时的兜底：按旧约定删同名目录
        await fs.rm(path.join(PLUGINS_DIR, req.params.id), { recursive: true, force: true });
      }
    }
    res.json({ data: { ok: true } });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;

// ===== 插件静态资源：GET /api/plugin-assets/:pluginId 下的子路径 =====
// 皮肤壁纸/预览图等二进制资源不走 manifest（避免 base64 膨胀），按插件 id 从磁盘直读：
//  - 已安装插件 → plugins/installed/<id>/
//  - 内置插件   → assets/plugin-assets/<id>/（随安装包 extraResources 分发）
// 本地模式 authMiddleware 无 token 也放行（回退本地身份），<img>/CSS url() 可直接引用。
export const pluginAssetsRouter = Router();
pluginAssetsRouter.use(authMiddleware);

const MIME: Record<string, string> = {
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.ico': 'image/x-icon',
};

pluginAssetsRouter.get('/:pluginId/*', (req: Request, res: Response) => {
  const { pluginId } = req.params;
  // req.params['0'] 为通配段（Express 4）；拼接前逐段校验，杜绝路径穿越
  const relParts = String(req.params[0] || '').split('/').filter(Boolean);
  if (!/^[a-z][a-z0-9-]*$/i.test(pluginId) || relParts.some((s) => s === '.' || s === '..' || s.includes('\\'))) {
    res.status(400).json({ error: '非法资源路径' });
    return;
  }
  const candidates = [path.join(PLUGINS_DIR, pluginId), path.join(BUILTIN_ASSETS_DIR, pluginId)];
  for (const base of candidates) {
    const file = path.join(base, ...relParts);
    if (!file.startsWith(base)) continue; // 双保险：解析后必须仍落在插件目录内
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext]) { res.status(415).json({ error: '不支持的资源类型' }); return; }
    res.setHeader('Content-Type', MIME[ext]);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(file);
    return;
  }
  res.status(404).json({ error: '资源不存在' });
});