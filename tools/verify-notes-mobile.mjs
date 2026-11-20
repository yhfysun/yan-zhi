import { chromium } from '../apps/server/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://127.0.0.1:5176';
const url = `${base}/?mobileRuntime=1#/notes`;
const outDir = process.argv[3] || 'tmp/notes-mobile-verify';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const reports = [];

for (const viewport of [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push({ type: message.type(), text: message.text() });
    }
  });
  page.on('pageerror', (error) => consoleMessages.push({ type: 'pageerror', text: error.message }));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.nmh-page').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(600);

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const interactive = [...document.querySelectorAll('button, input, a')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 24) || element.tagName,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    return {
      viewportWidth: innerWidth,
      htmlScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) > innerWidth + 1,
      smallTargets: interactive.filter((item) => item.width < 44 || item.height < 44).slice(0, 20),
      filterCount: document.querySelectorAll('.nmh-filter-rail button').length,
      recordCount: document.querySelectorAll('.nmh-record').length,
    };
  });

  await page.screenshot({
    path: `${outDir}/notes-${viewport.width}.png`,
    fullPage: false,
  });

  if (viewport.width === 320) {
    await page.locator('.nmh-fab').click();
    await page.locator('.nqc-sheet').waitFor({ state: 'visible' });
    await page.waitForTimeout(240);
    await page.screenshot({ path: `${outDir}/quick-picker-320.png`, fullPage: false });
    await page.locator('.nqc-template', { hasText: '记支出' }).click();
    await page.waitForTimeout(240);
    await page.screenshot({ path: `${outDir}/quick-expense-320.png`, fullPage: false });
  }

  reports.push({ viewport, layout, consoleMessages });
  await context.close();
}

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const interactionConsole = [];
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    interactionConsole.push({ type: message.type(), text: message.text() });
  }
});
page.on('pageerror', (error) => interactionConsole.push({ type: 'pageerror', text: error.message }));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.locator('.nmh-page').waitFor({ state: 'visible', timeout: 20000 });

await page.locator('.nmh-directory').click();
await page.locator('.nds-sheet').waitFor({ state: 'visible' });
await page.locator('.nds-actions .new').click();
await page.locator('.nds-editor input').fill('经营');
await page.locator('.nds-editor').evaluate((form) => form.requestSubmit());
await page.waitForTimeout(250);
await page.locator('.nds-sheet > header button[aria-label="关闭目录"]').click();
await page.locator('.nmh-directory').click();
await page.locator('.nds-row', { hasText: '经营' }).locator('button[aria-label="新建子目录"]').click();
await page.locator('.nds-editor input').fill('采购');
await page.locator('.nds-editor').evaluate((form) => form.requestSubmit());
await page.waitForTimeout(250);
await page.screenshot({ path: `${outDir}/directory-tree-390.png`, fullPage: false });
await page.locator('.nds-sheet > header button[aria-label="关闭目录"]').click();

await page.locator('.nmh-fab').click();
await page.locator('.nqc-template', { hasText: '记支出' }).click();
await page.locator('.ntf-amount input').fill('28.5');
await page.locator('.ntf-option', { hasText: '餐饮' }).click();
await page.locator('.nqc-category-field select').selectOption({ label: '经营 / 采购' });
await page.screenshot({ path: `${outDir}/quick-create-expense-390.png`, fullPage: false });
const createResponse = page.waitForResponse((response) => (
  response.url().endsWith('/api/notes/notes')
  && response.request().method() === 'POST'
));
await page.locator('.nqc-primary', { hasText: '保存记录' }).click();
const created = await createResponse;
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/notes-with-expense-390.png`, fullPage: false });

await page.locator('.nmh-fab').click();
await page.locator('.nqc-template', { hasText: '任务计划' }).click();
await page.locator('.nqc-title-field input').fill('整理采购清单');
await page.locator('.nqc-primary', { hasText: '保存记录' }).click();
await page.waitForTimeout(350);
const taskToggle = page.locator('.nmh-task-toggle').first();
await taskToggle.click();
await page.waitForTimeout(300);

const now = Date.now();
for (const payload of [
  {
    title: '苹果进货',
    kind: 'note',
    templateId: 'template.purchase',
    occurredAt: now,
    data: {
      item: '红富士苹果',
      category: 'fresh',
      quantity: 10,
      unitPrice: 5,
      total: 50,
      supplier: '果蔬市场',
      occurredAt: now,
    },
  },
  {
    title: '苹果出货',
    kind: 'note',
    templateId: 'template.sale',
    occurredAt: now,
    data: {
      item: '红富士苹果',
      quantity: 3,
      unitPrice: 8,
      total: 24,
      channel: '门店',
      occurredAt: now,
    },
  },
  {
    title: '整理货架',
    kind: 'note',
    templateId: 'template.time',
    occurredAt: now,
    data: {
      activity: '整理货架',
      category: 'business',
      durationMinutes: 90,
      occurredAt: now,
    },
  },
]) {
  const response = await page.request.post(`${base}/api/notes/notes`, { data: payload });
  if (!response.ok()) throw new Error(`seed failed: ${response.status()} ${await response.text()}`);
}
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.nmh-page').waitFor({ state: 'visible' });
await page.waitForTimeout(400);

await page.locator('.nmh-quick-head button', { hasText: '统计' }).click();
await page.locator('.nas-sheet').waitFor({ state: 'visible' });
await page.waitForTimeout(350);
await page.screenshot({ path: `${outDir}/analytics-390.png`, fullPage: false });
await page.locator('.nas-sheet > header button[aria-label="关闭报告"]').click();

await page.locator('.nmh-record').first().click();
await page.locator('.nmd-sheet').waitFor({ state: 'visible' });
await page.waitForTimeout(220);
await page.screenshot({ path: `${outDir}/record-detail-390.png`, fullPage: false });
await page.locator('.nmd-head button[aria-label="返回记录列表"]').click();

await page.locator('.nmh-manage').click();
await page.locator('.nts-shell').waitFor({ state: 'visible' });
await page.screenshot({ path: `${outDir}/template-studio-390.png`, fullPage: false });
await page.locator('button[aria-label="复制内置模板"]').first().click();
await page.locator('.nts-editor-head').waitFor({ state: 'visible' });
await page.screenshot({ path: `${outDir}/template-editor-390.png`, fullPage: false });
await page.locator('.nts-soft', { hasText: '添加字段' }).click();
await page.locator('.nfc-sheet').waitFor({ state: 'visible' });
await page.screenshot({ path: `${outDir}/field-composer-390.png`, fullPage: false });

const interaction = {
  createStatus: created.status(),
  recordCount: await page.locator('.nmh-record').count(),
  studioVisible: await page.locator('.nts-shell').isVisible(),
  fieldComposerVisible: await page.locator('.nfc-sheet').isVisible(),
  consoleMessages: interactionConsole,
};

await context.close();

const libraryContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const libraryPage = await libraryContext.newPage();
await libraryPage.goto(`${base}/?mobileRuntime=1#/learning-v2`, { waitUntil: 'domcontentloaded' });
await libraryPage.locator('.lv2').waitFor({ state: 'visible', timeout: 20000 });
await libraryPage.locator('.lv2-library-button:visible, .lv2-mobile-library-entry:visible').first().click();
await libraryPage.locator('.ll-library').waitFor({ state: 'visible' });
await libraryPage.waitForTimeout(300);
await libraryPage.screenshot({ path: `${outDir}/library-mobile-390.png`, fullPage: false });
await libraryPage.locator('.ll-mobile-filter').click();
await libraryPage.locator('.ll-filter-sheet').waitFor({ state: 'visible' });
await libraryPage.screenshot({ path: `${outDir}/library-filter-390.png`, fullPage: false });
const libraryLayout = await libraryPage.evaluate(() => ({
  horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
  categoriesVisible: getComputedStyle(document.querySelector('.ll-categories')).display !== 'none',
  filterVisible: !!document.querySelector('.ll-filter-sheet'),
}));
await libraryContext.close();
await browser.close();

console.log(JSON.stringify({ reports, interaction, libraryLayout }, null, 2));
