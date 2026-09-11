// PDF 高保真预览通道：把 PDF 栅格化为 PNG（PyMuPDF），作为纯文本提取（unpdf）的升级渲染。
// 仅在服务端调用 Python 桥（桌面/服务端自带打包 Python；浏览器端经此 HTTP 接口复用）。
// 当打包 Python 不可用或缺少 PyMuPDF 时返回 501，前端自动降级为文本预览。
import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { authMiddleware } from '../auth.js';
import { runPythonScript, getPythonScript } from '@yan-zhi/core';

const router = Router();
router.use(authMiddleware);

// POST /api/preview/pdf  body: { b64: string, dpi?: number }
// 返回: { data: { images: string[] (base64 PNG), count: number } } 或 { error }
router.post('/pdf', async (req: Request, res: Response) => {
  const { b64, dpi } = (req.body || {}) as { b64?: string; dpi?: number };
  if (!b64) {
    res.status(400).json({ error: 'b64 为必填项' });
    return;
  }
  const script = getPythonScript('pdf_preview/pdf2img.py');
  if (!script) {
    res.status(501).json({ error: 'PDF 高保真渲染不可用（缺少 pdf2img.py 脚本）' });
    return;
  }
  const tmp = path.join(os.tmpdir(), `yz_pdf_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const outDir = `${tmp}_out`;
  const pdfPath = `${tmp}.pdf`;
  try {
    fs.mkdirSync(tmp, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(pdfPath, Buffer.from(b64, 'base64'));

    const r = await runPythonScript(script, [
      '--pdf', pdfPath,
      '--out-dir', outDir,
      '--dpi', String(Math.min(Math.max(dpi || 110, 40), 200)),
      '--max-pages', '30',
    ], { timeout: 120000 });

    if (r.exitCode !== 0) {
      const msg = (r.stderr || r.stdout || '').slice(0, 500);
      res.status(501).json({ error: `PDF 渲染失败: ${msg}` });
      return;
    }
    const parsed = JSON.parse(r.stdout.trim().split('\n').pop() || '{}') as { count?: number; pages?: string[] };
    const pages = (parsed.pages || []).slice(0, 30);
    const images = pages.map((p) => fs.readFileSync(p).toString('base64'));
    res.json({ data: { images, count: images.length } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(501).json({ error: `PDF 渲染异常: ${msg}` });
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    try { fs.rmSync(`${tmp}.pdf`, { force: true }); } catch { /* ignore */ }
  }
});

export default router;
