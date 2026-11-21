// 真机调试桥路由 —— device_* 工具家族的服务端入口（/api/device-debug）
// 三条端点：列 WebView（读）/ 读 console（读）/ 页面内 eval（写，readonly 会话由 tool-permission 拦）
// 移动端（MOBILE_MODE）没有 adb：路由照常注册，服务端给出明确错误（工具结果里模型可见），
// 不走 501 分支 —— 错误文案本身包含"仅桌面端支持"的引导，比 404 更可解释。
import { Router, Request, Response } from 'express';
import { optionalAuth } from '../auth.js';
import {
  listDeviceWebviews,
  readDeviceConsole,
  evalInDeviceWebview,
} from '../services/device-debug.js';

const router = Router();
router.use(optionalAuth);

/** GET /api/device-debug/webviews —— 枚举设备与可调试 WebView */
router.get('/webviews', async (_req: Request, res: Response) => {
  try {
    const data = await listDeviceWebviews();
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '真机 WebView 枚举失败' });
  }
});

/** POST /api/device-debug/console —— 读目标 WebView 的 console 缓冲 */
router.post('/console', async (req: Request, res: Response) => {
  try {
    const { targetKey, lines, clear, waitMs } = (req.body || {}) as {
      targetKey?: string; lines?: number; clear?: boolean; waitMs?: number;
    };
    if (!targetKey) {
      res.status(400).json({ error: 'targetKey 必填（先调 device_webview_list 获取）' });
      return;
    }
    const data = await readDeviceConsole(targetKey, { lines, clear, waitMs });
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '读取真机 console 失败' });
  }
});

/** POST /api/device-debug/eval —— 在目标 WebView 页面里执行 JS */
router.post('/eval', async (req: Request, res: Response) => {
  try {
    const { targetKey, expression, timeoutMs } = (req.body || {}) as {
      targetKey?: string; expression?: string; timeoutMs?: number;
    };
    if (!targetKey) {
      res.status(400).json({ error: 'targetKey 必填（先调 device_webview_list 获取）' });
      return;
    }
    if (!expression || !String(expression).trim()) {
      res.status(400).json({ error: 'expression 必填' });
      return;
    }
    const data = await evalInDeviceWebview(targetKey, expression, timeoutMs);
    res.json({ data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '真机 WebView eval 失败' });
  }
});

export default router;
