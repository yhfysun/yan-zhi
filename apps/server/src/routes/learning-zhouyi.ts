// 周易独立学科接口（docs/周易课程方案-2026-11-15.md §3.0）。
// 精读层内容在 ../learning/zhouyi/（人工预写，只读下发）；测算推演在 packages/shared/src/zhouyi/
// （纯函数，前端直算，不走此路由 —— 算法唯一实现见方案 §6）。
// 判分在前端（quickCheck 随内容包下发，对齐传统文化/英语做法）。
import { Router } from 'express';
import { authMiddleware } from '../auth.js';
import {
  ZHOUYI_TRACKS, ZHOUYI_COURSES, ZHOUYI_LESSONS, getZhouyiLesson,
  ZHOUYI_TERMS, ZHOUYI_BIBLIOGRAPHY, ZHOUYI_DISCLAIMER, ZHOUYI_CANON_WORKS,
} from '../learning/zhouyi/curriculum.js';

const router = Router();
router.use(authMiddleware);

// GET /api/learning/zhouyi/paths —— 8 路径 + 48 门课目录（ready 标记；未 ready 由前端显示「建设中」，
// 不允许进入空课页）+ 术语索引 + 参考书目 + 内容立场声明（总览层数据一次下发）
router.get('/paths', (_req, res) => {
  res.json({ data: {
    tracks: ZHOUYI_TRACKS,
    courses: ZHOUYI_COURSES.map((c) => ({
      id: c.id, code: c.code, track: c.track, name: c.name, goal: c.goal, minutes: c.minutes,
      kind: c.kind, ready: c.ready, branch: c.branch,
    })),
    terms: ZHOUYI_TERMS,
    bibliography: ZHOUYI_BIBLIOGRAPHY,
    canon: ZHOUYI_CANON_WORKS,
    disclaimer: ZHOUYI_DISCLAIMER,
  } });
});

// GET /api/learning/zhouyi/lessons/:id —— 整课下发（原文 + 注释 + 注解 + 白话 + 脉络 + 自测）
router.get('/lessons/:id', (req, res) => {
  const lesson = getZhouyiLesson(String(req.params.id));
  if (!lesson) { res.status(404).json({ error: '课时不存在' }); return; }
  res.json({ data: lesson });
});

// 课时总数（给前端进度条与 wiring 测试用；ZHOUYI_LESSONS 只含已具备内容的课）
router.get('/meta', (_req, res) => {
  res.json({ data: {
    lessonCount: ZHOUYI_LESSONS.length,
    courseCount: ZHOUYI_COURSES.length,
    trackCount: ZHOUYI_TRACKS.length,
  } });
});

export default router;
