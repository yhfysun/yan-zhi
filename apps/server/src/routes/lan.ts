// 局域网节点发现路由：扫描本机所在 /24 私网段上的其他言智节点。
// 供设置页「局域网访问」使用 —— 移动端一键「设为后端」、桌面/Web 复制地址互联。
// 扫描在后端做（移动端 WebView https origin 直连 http 内网地址会被混合内容拦截）。
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../auth.js';
import { discoverLanNodes } from '../services/lan-nodes.js';

const router = Router();

// 扫描是重操作（/24 × 连接超时），同一时刻只放一个，避免连点叠扫
let scanning = false;

// POST /api/lan/discover-nodes —— body 可选 { port }（默认 3001）
router.post('/discover-nodes', authMiddleware, async (req: Request, res: Response) => {
  if (scanning) {
    res.status(429).json({ error: '已有扫描在进行，请稍候' });
    return;
  }
  scanning = true;
  try {
    const port = Number((req.body as any)?.port) || undefined;
    const result = await discoverLanNodes({ port });
    res.json({ data: result });
  } catch (e: any) {
    res.status(500).json({ error: `扫描失败: ${e?.message || e}` });
  } finally {
    scanning = false;
  }
});

export default router;
