import { Router, type Request, type Response } from 'express';
import { NEWS_CATEGORIES, type NewsCategory } from '@yan-zhi/shared';
import { getNewsArticle, getNewsFeed, getNewsMarket } from '../services/news-service.js';

const router = Router();

function isNewsCategory(value: unknown): value is NewsCategory {
  return typeof value === 'string' && NEWS_CATEGORIES.includes(value as NewsCategory);
}

router.get('/feed', async (req: Request, res: Response) => {
  const category = isNewsCategory(req.query.category) ? req.query.category : 'top';
  try {
    res.json({ data: await getNewsFeed(category, req.query.refresh === '1') });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : '资讯加载失败' });
  }
});

router.get('/article', async (req: Request, res: Response) => {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  try {
    res.json({ data: await getNewsArticle(url, req.query.refresh === '1') });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : '正文加载失败' });
  }
});

router.get('/market', async (req: Request, res: Response) => {
  try {
    res.json({ data: await getNewsMarket(req.query.refresh === '1') });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : '行情加载失败' });
  }
});

export default router;
