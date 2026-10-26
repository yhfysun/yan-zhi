// 自定义文档类型路由（文档 D1/D2）：列表 / 保存 / 删除 / YAML 导入导出。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import {
  deleteDocumentType,
  exportDocumentTypeYaml,
  importDocumentTypeYaml,
  listDocumentTypes,
  normalizeDocumentType,
  saveDocumentType,
} from '../services/document-type.js';
import { stringify as stringifyYaml } from 'yaml';

const router = Router();
router.use(authMiddleware);

function fail(res: Response, err: unknown): void {
  res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
}

router.get('/', (req: Request, res: Response) => {
  try {
    res.json({ data: listDocumentTypes(req.user!.userId) });
  } catch (err) { fail(res, err); }
});

router.post('/', (req: Request, res: Response) => {
  try {
    res.json({ data: saveDocumentType(req.user!.userId, req.body || {}) });
  } catch (err) { fail(res, err); }
});

router.delete('/:code', (req: Request, res: Response) => {
  try {
    deleteDocumentType(req.user!.userId, req.params.code);
    res.json({ data: { ok: true } });
  } catch (err) { fail(res, err); }
});

router.get('/:code/yaml', (req: Request, res: Response) => {
  try {
    res.json({ data: { yaml: exportDocumentTypeYaml(req.user!.userId, req.params.code) } });
  } catch (err) { fail(res, err); }
});

router.post('/import-yaml', (req: Request, res: Response) => {
  try {
    res.json({ data: importDocumentTypeYaml(req.user!.userId, String(req.body?.yaml || '')) });
  } catch (err) { fail(res, err); }
});

// 把前端编辑器里的定义（含内置模板）转成 YAML —— 内置类型不落库，不能走 GET :code/yaml
router.post('/export-yaml', (req: Request, res: Response) => {
  try {
    const def = normalizeDocumentType(req.body?.type || {});
    res.json({ data: { yaml: stringifyYaml({ version: 1, ...def }) } });
  } catch (err) { fail(res, err); }
});

export default router;
