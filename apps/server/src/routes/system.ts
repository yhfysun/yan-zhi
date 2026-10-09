// 系统信息路由 —— 把「跑在哪套数据上」暴露成可见信息。
//
// ★★★ 为什么需要（issues/双库数据隔离造成丢失误判-20260919.md 的真痛点）：
//   该 issue 原话：「真正的痛点是『不可见』，而不是『有两套』」。
//   实测现场：用户配好百炼平台、生成产物后切到打包版，看到的是**另一套库**
//   → 产生「我的数据丢了 / 平台没了」的错误判断，反复排查不存在的故障。
//   dev 与安装版各自独立库是**有意设计**（避免调试污染真实数据），所以不该改数据位置；
//   要解决的是「让用户知道当前跑在哪套数据上」——本接口就提供这个答案。
//
// ★ 与 db.ts 的关系：`dataDir` 是**唯一真相源**（db.ts 导出），这里只做只读转达，
//   不在本文件重算路径 —— 重算必然漂移（同一件事两个出口）。
import { Router, Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { dataDir } from '../db.js';

const router = Router();

/** 判断当前实例类型：dev（开发实例）还是 packaged（安装版）。 */
function instanceKind(): { kind: 'dev' | 'packaged' | 'unknown'; note: string } {
  // dev 编排器注入 YANZHI_DEV_INSTANCE=1（见 apps/desktop/instance.cjs）
  if (String(process.env.YANZHI_DEV_INSTANCE || '') === '1') {
    return { kind: 'dev', note: '开发实例（与安装版使用各自独立的数据目录，互不影响）' };
  }
  // 打包版由 main.cjs 注入 DATA_DIR 指向 userData/server-data
  const d = (process.env.DATA_DIR || '').replace(/\\/g, '/');
  if (d.includes('/server-data')) return { kind: 'packaged', note: '安装版' };
  if (d) return { kind: 'unknown', note: '自定义数据目录（由 DATA_DIR 指定）' };
  return { kind: 'unknown', note: '未显式指定 DATA_DIR（退回默认目录）' };
}

// GET /api/system/data-dir —— 当前数据目录（含库文件与体积，供「关于」页展示）
//
// ★ 为什么连体积一起给：用户排障时最常问的两个问题就是
//   「数据在哪」与「数据是不是这套」——路径 + 库体积能同时回答。
router.get('/data-dir', (_req: Request, res: Response) => {
  const dbFile = path.join(dataDir, 'data.db');
  let bytes = 0;
  let exists = false;
  try {
    exists = fs.existsSync(dbFile);
    if (exists) bytes = fs.statSync(dbFile).size;
  } catch { /* 读不到就报 0，不因此让接口失败 */ }

  const inst = instanceKind();
  res.json({
    data: {
      /** 数据目录绝对路径（复制给用户排障用） */
      dir: dataDir,
      /** 库文件绝对路径 */
      dbFile,
      dbExists: exists,
      dbBytes: bytes,
      /** dev / packaged / unknown —— 前端据此说明「你在跑哪套」 */
      instance: inst.kind,
      instanceNote: inst.note,
    },
  });
});

export default router;