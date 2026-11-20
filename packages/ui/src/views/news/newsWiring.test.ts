import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UI_ROOT = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(UI_ROOT, path), 'utf8');

describe('资讯中心导航接线', () => {
  it('注册移动端与桌面端共用的 /news 路由', () => {
    const router = read('router/index.ts');
    expect(router).toContain("path: '/news'");
    expect(router).toContain("component: () => import('../views/News.vue')");
  });

  it('移动端资讯位于学习右侧、我的左侧', () => {
    const sideNav = read('components/SideNav.vue');
    const start = sideNav.indexOf('const mobilePrimaryItems');
    const mobileBlock = sideNav.slice(start, sideNav.indexOf(']);', start));
    const learning = mobileBlock.indexOf("label: '学习'");
    const news = mobileBlock.indexOf("label: '资讯'");
    const me = mobileBlock.indexOf("label: '我的'");
    expect(learning).toBeGreaterThan(0);
    expect(news).toBeGreaterThan(learning);
    expect(me).toBeGreaterThan(news);
    expect(sideNav).toContain("path: '/news'");
  });

  it('桌面顶栏提供直接资讯入口', () => {
    const topBar = read('components/WebTopBar.vue');
    expect(topBar).toContain("router.push('/news')");
    expect(topBar).toContain('资讯');
  });

  it('桌面顶栏新增资讯后仍保留直接浏览器入口', () => {
    const topBar = read('components/WebTopBar.vue');
    expect(topBar).toContain('aria-label="浏览器"');
    expect(topBar).toContain("router.push('/browser')");
  });

  it('桌面顶栏宽屏保留中文，空间不足时自动收成图标并保留悬停提示', () => {
    const topBar = read('components/WebTopBar.vue');
    expect(topBar).toContain('title="浏览器"');
    expect(topBar).toContain('title="资讯"');
    expect(topBar).toMatch(/title="浏览器"[\s\S]{0,220}<span>浏览器<\/span>/);
    expect(topBar).toMatch(/title="资讯"[\s\S]{0,220}<span>资讯<\/span>/);
    expect(topBar).toMatch(/@media \(max-width: 1180px\)[\s\S]*?\.title-nav-item > span\s*\{\s*display:\s*none/);
  });
});
