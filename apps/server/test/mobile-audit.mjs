import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.MOBILE_AUDIT_URL || 'http://127.0.0.1:5174';
const CHROME_PATH = process.env.MOBILE_AUDIT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUTPUT_DIR = path.resolve('artifacts/mobile-audit-2026-11-24');
const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '375x812', width: 375, height: 812 },
];

await mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME_PATH,
});

const results = [];

function now() {
  return new Date().toISOString();
}

function shortConsoleEntry(entry) {
  return `${entry.type}: ${entry.text}`;
}

async function createAuditPage(viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: 'zh-CN',
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const consoleEntries = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleEntries.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    consoleEntries.push({
      type: 'pageerror',
      text: error.message,
      stack: error.stack || '',
    });
  });
  return { context, page, consoleEntries };
}

async function navigate(page, route, readySelector, timeout = 25000) {
  await page.goto(`${BASE_URL}/#${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.app-shell').waitFor({ state: 'visible', timeout });
  await page.waitForFunction(() => document.body.innerText.trim().length > 20, undefined, { timeout });
  if (readySelector) {
    await page.locator(readySelector).first().waitFor({ state: 'visible', timeout });
  }
  await page.waitForTimeout(800);
}

async function readLayout(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const doc = document.documentElement;
    const body = document.body;
    const tab = document.querySelector('.tab-bar');
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.top < window.innerHeight;
    };
    const tabRect = tab instanceof HTMLElement ? tab.getBoundingClientRect() : null;
    const tabCenter = tabRect
      ? {
          x: Math.min(window.innerWidth - 1, Math.max(0, tabRect.left + tabRect.width / 2)),
          y: Math.min(window.innerHeight - 1, Math.max(0, tabRect.top + tabRect.height / 2)),
        }
      : null;
    const tabHit = tabCenter
      ? document.elementFromPoint(tabCenter.x, tabCenter.y)?.closest('.tab-bar') === tab
      : false;
    const overflowing = [...document.querySelectorAll('body *')]
      .filter((element) => {
        if (!(element instanceof HTMLElement) || !visible(element)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.left >= -1 && rect.right <= viewportWidth + 1) return false;
        let parent = element.parentElement;
        while (parent) {
          const style = getComputedStyle(parent);
          if (style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden') {
            return false;
          }
          parent = parent.parentElement;
        }
        return true;
      })
      .slice(0, 5)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
        rect: (() => {
          const rect = element.getBoundingClientRect();
          return {
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })(),
      }));
    return {
      viewportWidth,
      viewportHeight: window.innerHeight,
      docScrollWidth: doc.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyTextLength: body.innerText.trim().length,
      tabBar: {
        exists: !!tab,
        visible: visible(tab),
        rect: tabRect ? {
          top: Math.round(tabRect.top),
          bottom: Math.round(tabRect.bottom),
          left: Math.round(tabRect.left),
          right: Math.round(tabRect.right),
          height: Math.round(tabRect.height),
        } : null,
        hitTestAtCenter: tabHit,
        shellInert: !!document.querySelector('.app-shell[inert]'),
      },
      globalNavigation: {
        appMobileTopbarVisible: visible(document.querySelector('.mobile-topbar')),
        webTopbarVisible: visible(document.querySelector('.title-bar')),
        globalTabBarVisible: visible(tab),
      },
      overflowing,
    };
  });
}

async function tabItemState(page, label) {
  return page.evaluate((targetLabel) => {
    const tab = document.querySelector('.tab-bar');
    const items = [...document.querySelectorAll('.tab-bar-item')];
    const item = items.find((candidate) => candidate.textContent?.trim() === targetLabel);
    if (!(item instanceof HTMLElement)) {
      return { exists: false, visible: false, hitTest: false, inertAncestor: false };
    }
    const rect = item.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    const style = getComputedStyle(item);
    let inertAncestor = false;
    let parent = item.parentElement;
    while (parent) {
      if (parent.hasAttribute('inert')) inertAncestor = true;
      parent = parent.parentElement;
    }
    return {
      exists: true,
      visible: style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0
        && rect.width > 0
        && rect.height > 0,
      hitTest: !!hit && !!item.contains(hit),
      hitTarget: hit instanceof HTMLElement
        ? `${hit.tagName.toLowerCase()}.${typeof hit.className === 'string' ? hit.className : ''}`
        : '',
      inertAncestor: inertAncestor || (tab?.parentElement?.hasAttribute('inert') ?? false),
      rect: {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      },
    };
  }, label);
}

async function clickTabExpect(page, label, expectedPath, timeout = 2500) {
  const item = page.locator('.tab-bar-item').filter({ hasText: label }).first();
  const state = await tabItemState(page, label);
  if (!state.exists || !state.visible || !state.hitTest) {
    return { ok: false, reason: 'not-hit-testable', state };
  }
  try {
    await item.click({ timeout });
    await page.waitForFunction(
      (expected) => window.location.hash.startsWith(`#${expected}`),
      expectedPath,
      { timeout: 5000 },
    );
    return { ok: true, state, hash: await page.evaluate(() => window.location.hash) };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      state,
      hash: await page.evaluate(() => window.location.hash),
    };
  }
}

async function recordCase(viewport, name, route, run, options = {}) {
  const { context, page, consoleEntries } = await createAuditPage(viewport);
  const startedAt = now();
  const result = {
    viewport: viewport.name,
    name,
    route,
    startedAt,
    status: 'fail',
    steps: [],
    console: [],
    initialLayout: null,
    layout: null,
    screenshots: [],
  };
  try {
    await navigate(page, route, options.readySelector);
    result.steps.push({ step: 'page-loaded', ok: true });
    result.initialLayout = await readLayout(page);
    await captureState(page, result, `${name}-初始`);
    if (run) await run({ page, result });
    result.layout = await readLayout(page);
    result.status = result.steps.every((step) => step.ok) ? 'pass' : 'fail';
  } catch (error) {
    result.steps.push({
      step: 'audit-exception',
      ok: false,
      actual: error instanceof Error ? error.message : String(error),
    });
    try {
      result.layout = await readLayout(page);
    } catch {
      result.layout = null;
    }
  } finally {
    result.console = consoleEntries.map((entry) => ({
      ...entry,
      text: entry.text.slice(0, 4000),
    }));
    if (result.status !== 'pass') {
      const screenshotPath = path.join(
        OUTPUT_DIR,
        `${viewport.name}-${name.replace(/[^\p{L}\p{N}._-]+/gu, '-')}.png`,
      );
      try {
        await page.screenshot({ path: screenshotPath, fullPage: false });
        result.screenshots.push(screenshotPath);
      } catch {
        // The JSON report remains the primary artifact when screenshot navigation fails.
      }
    }
    result.finishedAt = now();
    results.push(result);
    await context.close();
  }
}

async function captureState(page, result, label) {
  const screenshotPath = path.join(
    OUTPUT_DIR,
    `${result.viewport}-${label.replace(/[^\p{L}\p{N}._-]+/gu, '-')}.png`,
  );
  await page.screenshot({ path: screenshotPath, fullPage: false });
  result.screenshots.push(screenshotPath);
}

async function expectNonEmpty(page, result, label) {
  const textLength = await page.locator('body').innerText().then((text) => text.trim().length);
  const ok = textLength > 20;
  result.steps.push({
    step: `${label}: non-empty`,
    ok,
    expected: '页面正文长度 > 20',
    actual: `正文长度 ${textLength}`,
  });
  return ok;
}

async function expectTabClickable(page, result, label, expectedPath) {
  const state = await tabItemState(page, label);
  const direct = state.exists && state.visible && state.hitTest && !state.inertAncestor;
  result.steps.push({
    step: `${label}: hit-testable before retry`,
    ok: direct,
    expected: 'TabBar 项可见、未被 inert/浮层阻挡',
    actual: JSON.stringify(state),
  });
  const clicked = await clickTabExpect(page, label, expectedPath);
  result.steps.push({
    step: `${label}: click navigates`,
    ok: clicked.ok,
    expected: `点击后到 #${expectedPath}`,
    actual: JSON.stringify(clicked),
  });
  return direct && clicked.ok;
}

async function expectTabHidden(page, result, label) {
  const layout = await readLayout(page);
  const hidden = !layout.tabBar.visible;
  result.steps.push({
    step: `${label}: global TabBar hidden`,
    ok: hidden,
    expected: '沉浸学习态隐藏全局 TabBar',
    actual: JSON.stringify(layout.tabBar),
  });
  return hidden;
}

async function expectNoHorizontalOverflow(page, result, label) {
  const layout = await readLayout(page);
  const ok = layout.docScrollWidth <= layout.viewportWidth + 1
    && layout.bodyScrollWidth <= layout.viewportWidth + 1
    && layout.overflowing.length === 0;
  result.steps.push({
    step: `${label}: no horizontal overflow`,
    ok,
    expected: `scrollWidth <= ${layout.viewportWidth + 1}px`,
    actual: JSON.stringify({
      docScrollWidth: layout.docScrollWidth,
      bodyScrollWidth: layout.bodyScrollWidth,
      overflowing: layout.overflowing,
    }),
  });
  return ok;
}

async function expectLearningTopbarLayout(page, result, label) {
  const metrics = await page.evaluate(() => {
    const bar = document.querySelector('.lv2-mobile-topbar');
    const subject = document.querySelector('.lv2-mobile-subject');
    const buttons = [...document.querySelectorAll('.lv2-mobile-topbar .lv2-topbar-actions button')];
    const rect = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const value = element.getBoundingClientRect();
      return {
        text: element.textContent?.trim() || '',
        width: Math.round(value.width),
        height: Math.round(value.height),
      };
    };
    return {
      bar: rect(bar),
      subject: rect(subject),
      textButtons: buttons.map(rect).filter((item) => item?.text),
    };
  });
  const crowded = !metrics.bar
    || metrics.bar.height > 72
    || metrics.textButtons.some((button) => button.height > 56);
  result.steps.push({
    step: `${label}: 移动顶栏不挤压换行`,
    ok: !crowded,
    expected: '学习顶栏高度 <= 72px，含文字操作保持单行或进入折叠菜单',
    actual: JSON.stringify(metrics),
  });
}

async function expectLearningMoreMenu(page, result, label, exerciseAction = false) {
  const trigger = page.locator('[data-mobile-more-trigger]');
  await trigger.click();
  const menu = page.locator('[data-mobile-more-menu]');
  await menu.waitFor({ state: 'visible', timeout: 5000 });
  const metrics = await page.evaluate(() => {
    const trigger = document.querySelector('[data-mobile-more-trigger]');
    const menu = document.querySelector('[data-mobile-more-menu]');
    const items = [...(menu?.querySelectorAll('[role="menuitem"]') || [])];
    const triggerRect = trigger?.getBoundingClientRect();
    return {
      expanded: trigger?.getAttribute('aria-expanded'),
      triggerSize: triggerRect
        ? { width: Math.round(triggerRect.width), height: Math.round(triggerRect.height) }
        : null,
      labels: items.map((item) => item.textContent?.trim() || ''),
      heights: items.map((item) => Math.round(item.getBoundingClientRect().height)),
      focusedAction: document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.mobileAction || ''
        : '',
    };
  });
  const expectedLabels = ['实践', '练习', '陪练', '科目数据', '图书馆'];
  const touchTargetsOk = metrics.triggerSize?.width >= 44
    && metrics.triggerSize?.height >= 44
    && metrics.heights.every((height) => height >= 44);
  result.steps.push({
    step: `${label}: 更多菜单与触摸目标`,
    ok: metrics.expanded === 'true'
      && touchTargetsOk
      && JSON.stringify(metrics.labels) === JSON.stringify(expectedLabels),
    expected: '更多菜单包含五个二级入口，触发器与菜单项均 >=44px',
    actual: JSON.stringify(metrics),
  });
  await captureState(page, result, `${label}-更多菜单`);

  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached', timeout: 3000 });
  const focusRestored = await page.evaluate(() => document.activeElement?.hasAttribute('data-mobile-more-trigger') === true);
  result.steps.push({
    step: `${label}: Escape 关闭更多菜单并恢复焦点`,
    ok: focusRestored,
    expected: 'Escape 关闭菜单，焦点回到更多按钮',
    actual: `focusRestored=${focusRestored}`,
  });

  if (!exerciseAction) return;
  await trigger.click();
  await menu.waitFor({ state: 'visible', timeout: 5000 });
  await menu.locator('[data-mobile-action="practice"]').click();
  await page.locator('[data-learning-session][data-stage="practice"]').waitFor({
    state: 'visible',
    timeout: 10000,
  });
  await expectTabHidden(page, result, `${label}：更多菜单进入练习`);
  await page.locator('.session-back').click();
  await page.locator('.lv2-mobile-overview').waitFor({ state: 'visible', timeout: 10000 });
  result.steps.push({
    step: `${label}: 更多菜单进入练习后可退出`,
    ok: true,
    expected: '五入口菜单中的“练习”可进入沉浸态，返回教材后恢复总览',
    actual: await page.evaluate(() => window.location.hash),
  });
}

async function clickFirstVisible(page, selector) {
  const candidates = page.locator(selector);
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible()) {
      await candidate.click();
      return candidate;
    }
  }
  throw new Error(`No visible candidate for ${selector}`);
}

async function openLearningOverview(page) {
  await navigate(page, '/learning-v2', '.lv2-mobile-overview');
}

function runPrimary(route, readySelector, expectedTabLabel, expectedPath) {
  return async ({ page, result }) => {
    await expectNonEmpty(page, result, '页面');
    await expectNoHorizontalOverflow(page, result, '页面');
    if (route === '/learning-v2') {
      await expectLearningTopbarLayout(page, result, '学习总览');
      await expectLearningMoreMenu(page, result, '学习总览', true);
    }
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
    await expectTabClickable(page, result, expectedTabLabel, expectedPath);
  };
}

function runScrollTab(route, readySelector) {
  return async ({ page, result }) => {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(500);
    const click = await clickTabExpect(page, '笔记', '/notes');
    result.steps.push({
      step: '滚动后切换 TabBar',
      ok: click.ok,
      expected: '页面滚动后点击「笔记」仍到 #/notes',
      actual: JSON.stringify(click),
    });
  };
}

function runNewsCategory() {
  return async ({ page, result }) => {
    const category = page.locator('.news-category').filter({ hasText: '国内' }).first();
    await category.click();
    await page.waitForFunction(() => {
      const active = document.querySelector('.news-category.active');
      const stories = document.querySelectorAll('.news-feed-story').length;
      const empty = document.querySelector('.news-empty');
      return active?.textContent?.includes('国内') && (stories > 0 || !!empty);
    }, undefined, { timeout: 15000 });
    const activeText = await page.locator('.news-category.active').innerText();
    const storyCount = await page.locator('.news-feed-story').count();
    result.steps.push({
      step: '切换资讯分类「国内」',
      ok: activeText.includes('国内') && storyCount > 0,
      expected: '国内分类激活且资讯列表非空',
      actual: JSON.stringify({ activeText, storyCount }),
    });
    await captureState(page, result, '资讯分类-国内');
    await expectNoHorizontalOverflow(page, result, '资讯分类');
  };
}

function runNewsDetail() {
  return async ({ page, result }) => {
    const openReader = async () => {
      await clickFirstVisible(page, '.news-feed-story');
      await page.locator('.news-mobile-reader').waitFor({ state: 'visible', timeout: 15000 });
    };

    await openReader();
    await expectNonEmpty(page, result, '新闻详情');
    await captureState(page, result, '新闻详情-已打开');
    const tab = await tabItemState(page, '笔记');
    result.steps.push({
      step: '新闻详情：底部菜单可见可点',
      ok: tab.exists && tab.visible && tab.hitTest && !tab.inertAncestor,
      expected: '新闻详情打开后仍可直接切换底部菜单',
      actual: JSON.stringify(tab),
    });

    const back = page.locator('.news-reader-back');
    await back.click();
    await page.locator('.news-mobile-reader').waitFor({ state: 'detached', timeout: 5000 });
    result.steps.push({
      step: '新闻详情：返回资讯',
      ok: (await page.locator('.news-mobile-reader').count()) === 0,
      expected: '返回按钮关闭新闻详情并保留资讯路由',
      actual: JSON.stringify({
        readerCount: await page.locator('.news-mobile-reader').count(),
        hash: await page.evaluate(() => window.location.hash),
      }),
    });

    await openReader();
    const click = await clickTabExpect(page, '笔记', '/notes');
    result.steps.push({
      step: '新闻详情：点击「笔记」切换',
      ok: click.ok,
      expected: '从新闻详情直接切换 #/notes',
      actual: JSON.stringify(click),
    });
  };
}

function runStockDetail() {
  return async ({ page, result }) => {
    const openQuote = async () => {
      const market = page.locator('.news-market-panel');
      await market.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const row = page.locator('.market-quote-row').first();
      await row.waitFor({ state: 'visible', timeout: 15000 });
      await row.click();
      await page.locator('.news-quote-overlay').waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('.news-quote-price, .news-quote-error').first().waitFor({
        state: 'visible',
        timeout: 20000,
      });
    };

    await openQuote();
    await expectNonEmpty(page, result, '股票详情');
    const quoteErrorCount = await page.locator('.news-quote-error').count();
    result.steps.push({
      step: '股票详情：行情数据到达',
      ok: quoteErrorCount === 0,
      expected: '显示真实行情快照或 K 线，而不是永久加载',
      actual: quoteErrorCount
        ? await page.locator('.news-quote-error').innerText()
        : '已显示 .news-quote-price',
    });
    await captureState(page, result, '股票详情-已打开');
    const tab = await tabItemState(page, '笔记');
    result.steps.push({
      step: '股票详情：底部菜单可见可点',
      ok: tab.exists && tab.visible && tab.hitTest && !tab.inertAncestor,
      expected: '股票详情打开后仍可直接切换底部菜单',
      actual: JSON.stringify(tab),
    });

    const back = page.locator('.news-quote-overlay .news-quote-back');
    await back.click();
    await page.locator('.news-quote-overlay').waitFor({ state: 'detached', timeout: 5000 });
    result.steps.push({
      step: '股票详情：返回资讯',
      ok: (await page.locator('.news-quote-overlay').count()) === 0,
      expected: '返回按钮关闭股票详情并保留资讯路由',
      actual: JSON.stringify({
        quoteOverlayCount: await page.locator('.news-quote-overlay').count(),
        hash: await page.evaluate(() => window.location.hash),
      }),
    });

    await openQuote();
    const click = await clickTabExpect(page, '笔记', '/notes');
    result.steps.push({
      step: '股票详情：点击「笔记」切换',
      ok: click.ok,
      expected: '从股票详情直接切换 #/notes',
      actual: JSON.stringify(click),
    });
  };
}

function runCourseDetail() {
  return async ({ page, result }) => {
    await page.locator('.lv2-mobile-subject').click();
    await page.locator('.lv2-mobile-subject-sheet').waitFor({ state: 'visible', timeout: 5000 });
    const entry = page.locator('.lv2-mobile-subject-sheet button').filter({ hasText: '编程通识' }).first();
    await entry.waitFor({ state: 'visible', timeout: 10000 });
    await entry.click();
    await page.locator('.programming-hub').waitFor({ state: 'visible', timeout: 15000 });

    if (!(await page.locator('.programming-course-head').count())) {
      await page.locator('.programming-course-card').first().click();
    }
    await page.locator('.programming-course-head').waitFor({ state: 'visible', timeout: 15000 });
    const title = await page.locator('.programming-course-title-block h1').innerText();
    await captureState(page, result, '课程详情-已打开');
    result.steps.push({
      step: '课程详情：打开',
      ok: title.trim().length > 0,
      expected: '课程详情标题非空',
      actual: title,
    });
    await expectLearningTopbarLayout(page, result, '课程详情');
    await expectLearningMoreMenu(page, result, '课程详情');
    await expectNoHorizontalOverflow(page, result, '课程详情');

    const back = page.locator('.programming-back');
    if (await back.isVisible()) {
      await back.click();
      await page.waitForTimeout(500);
      result.steps.push({
        step: '课程详情：返回全部课程',
        ok: (await page.locator('.programming-course-head').count()) === 0,
        expected: '返回课程列表',
        actual: `courseHeadCount=${await page.locator('.programming-course-head').count()}`,
      });
    }
  };
}

function runLearningSession() {
  return async ({ page, result }) => {
    await page.locator('.lv2-mobile-continue').click();
    await page.locator('[data-learning-session]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('yz-learning-study'));
    await captureState(page, result, '学习阶段');
    await expectTabHidden(page, result, '学习阶段');
    await expectNonEmpty(page, result, '学习阶段');
    const sessionHash = await page.evaluate(() => window.location.hash);
    result.steps.push({
      step: '学习阶段：被全局导航污染',
      ok: sessionHash === '#/learning-v2'
        && !(await page.locator('.mobile-topbar').isVisible().catch(() => false))
        && !(await page.locator('.tab-bar').isVisible().catch(() => false)),
      expected: '沉浸学习保留当前 hash，隐藏应用顶栏和 TabBar',
      actual: JSON.stringify({
        sessionHash,
        mobileTopbarVisible: await page.locator('.mobile-topbar').isVisible().catch(() => false),
        tabBarVisible: await page.locator('.tab-bar').isVisible().catch(() => false),
      }),
    });

    await page.locator('[data-session-stage="practice"]').click();
    await page.locator('[data-learning-session][data-stage="practice"]').waitFor({ state: 'visible', timeout: 10000 });
    await captureState(page, result, '练习阶段');
    await expectTabHidden(page, result, '练习阶段');
    await expectNonEmpty(page, result, '练习阶段');

    await page.locator('[data-session-stage="apply"]').click();
    await page.locator('[data-learning-session][data-stage="apply"]').waitFor({ state: 'visible', timeout: 10000 });
    await captureState(page, result, '实践阶段');
    await expectTabHidden(page, result, '实践阶段');
    await expectNonEmpty(page, result, '实践阶段');

    await page.locator('.session-back').click();
    await page.locator('.lv2-mobile-overview').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => !document.documentElement.classList.contains('yz-learning-study'));
    const state = await tabItemState(page, '笔记');
    result.steps.push({
      step: '退出学习：恢复全局 TabBar',
      ok: state.exists && state.visible && state.hitTest && !state.inertAncestor,
      expected: '返回教材后 TabBar 恢复可点',
      actual: JSON.stringify(state),
    });
  };
}

for (const viewport of VIEWPORTS) {
  await recordCase(viewport, '工作', '/chat', runPrimary('/chat', '.chat-page', '笔记', '/notes'));
  await recordCase(viewport, '笔记', '/notes', runPrimary('/notes', '.nmh-page', '资讯', '/news'));
  await recordCase(viewport, '学习总览', '/learning-v2', runPrimary('/learning-v2', '.lv2-mobile-overview', '资讯', '/news'));
  await recordCase(viewport, '课程详情', '/learning-v2', runCourseDetail(), { readySelector: '.lv2-mobile-overview' });
  await recordCase(viewport, '学习练习实践', '/learning-v2', runLearningSession(), { readySelector: '.lv2-mobile-overview' });
  await recordCase(viewport, '资讯首页', '/news', runPrimary('/news', '.news-feed-list', '笔记', '/notes'));
  await recordCase(viewport, '资讯分类', '/news', runNewsCategory(), { readySelector: '.news-feed-list' });
  await recordCase(viewport, '新闻详情', '/news', runNewsDetail(), { readySelector: '.news-feed-list' });
  await recordCase(viewport, '股票详情', '/news', runStockDetail(), { readySelector: '.news-feed-list' });
  await recordCase(viewport, '资讯滚动后切页', '/news', runScrollTab('/news', '.news-feed-list'), {
    readySelector: '.news-feed-list',
  });
  await recordCase(viewport, '我的', '/settings', runPrimary('/settings', null, '笔记', '/notes'));

  for (const result of results.filter((entry) => entry.viewport === viewport.name)) {
    const layout = result.layout;
    if (!layout) continue;
    const overflowOk = layout.docScrollWidth <= layout.viewportWidth + 1
      && layout.bodyScrollWidth <= layout.viewportWidth + 1
      && layout.overflowing.length === 0;
    if (!overflowOk) {
      result.steps.push({
        step: '收尾检查：横向溢出',
        ok: false,
        expected: `scrollWidth <= ${layout.viewportWidth + 1}px`,
        actual: JSON.stringify({
          docScrollWidth: layout.docScrollWidth,
          bodyScrollWidth: layout.bodyScrollWidth,
          overflowing: layout.overflowing,
        }),
      });
      result.status = 'fail';
    }
  }
}

await browser.close();

const report = {
  generatedAt: now(),
  baseUrl: BASE_URL,
  viewports: VIEWPORTS,
  totals: {
    cases: results.length,
    pass: results.filter((entry) => entry.status === 'pass').length,
    fail: results.filter((entry) => entry.status === 'fail').length,
  },
  results,
};

const reportPath = path.join(OUTPUT_DIR, 'report.json');
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify({
  reportPath,
  totals: report.totals,
  failures: results
    .filter((entry) => entry.status !== 'pass')
    .map((entry) => ({
      viewport: entry.viewport,
      name: entry.name,
      failedSteps: entry.steps.filter((step) => !step.ok),
      console: entry.console.slice(0, 3).map(shortConsoleEntry),
      screenshots: entry.screenshots,
    })),
}, null, 2));
