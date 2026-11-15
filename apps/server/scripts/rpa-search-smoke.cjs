/**
 * RPA 固定脚本「自动搜索」真浏览器自测（独立 node 进程，手动跑，不进 CI）
 *
 *   node apps/server/scripts/rpa-search-smoke.cjs
 *   node apps/server/scripts/rpa-search-smoke.cjs --only=baidu --keyword=自动化测试
 *   node apps/server/scripts/rpa-search-smoke.cjs --only=taobao --headed
 *
 * 跑的是**产品里真正的执行器**：packages/core/src/automation/runner.ts 的
 * runAutomationScript + apps/server/src/services/automation-browser-adapter.ts 的
 * BrowserAutomationAdapter。用 esbuild 把这两个 TS 模块现打成 CJS，再把 adapter 的
 * call 桥接到真 Playwright page（不启 Electron、不连后端、不连 db/LLM）。
 *
 * 三条用例：
 *   ① local  —— 本机假搜索页，验证执行器本身（navigate→type→pressEnter→waitFor→assertText→extractText）
 *   ② baidu  —— 真实 https://www.baidu.com/ 搜索
 *   ③ taobao —— 真实 https://www.taobao.com/ 搜索
 * ① 必须过；②③ 若被反爬/登录墙拦下会如实打印最终 URL 与页面片段并判 FAIL，
 * 这样「执行器坏了」和「站点拦了」能一眼分开。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { loadPlaywright, findChromium } = require(path.join(__dirname, '..', '..', '..', 'scripts', 'find-chromium.cjs'));

const REPO = path.resolve(__dirname, '..', '..', '..');
// bundle 是跑一次就丢的构建产物，放系统临时目录，别污染工作区 git status。
const BUNDLE = process.env.RPA_SMOKE_BUNDLE || path.join(os.tmpdir(), `yz-rpa-smoke-${process.pid}.cjs`);
const { chromium } = loadPlaywright(REPO);

const argv = process.argv.slice(2);
const argOf = (k, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : dflt;
};
const ONLY = argOf('only', 'all');
const KEYWORD = argOf('keyword', '自动化测试');
const HEADED = argv.includes('--headed');
const NAV_TIMEOUT = Number(argOf('timeout', '30000'));

function loadEsbuild() {
  const store = path.join(REPO, 'node_modules', '.pnpm');
  const dirs = fs.readdirSync(store).filter((d) => /^esbuild@\d/.test(d)).sort().reverse();
  for (const d of dirs) {
    const p = path.join(store, d, 'node_modules', 'esbuild');
    try { return require(p); } catch { /* 换下一个版本 */ }
  }
  throw new Error('找不到 esbuild（node_modules/.pnpm/esbuild@*），请先 pnpm install');
}

function buildBundle() {
  const esbuild = loadEsbuild();
  const rel = (p) => './' + path.relative(__dirname, p).replace(/\\/g, '/');
  esbuild.buildSync({
    stdin: {
      contents: [
        `export { runAutomationScript } from ${JSON.stringify(rel(path.join(REPO, 'packages/core/src/automation/runner.ts')))};`,
        `export { BrowserAutomationAdapter } from ${JSON.stringify(rel(path.join(REPO, 'apps/server/src/services/automation-browser-adapter.ts')))};`,
      ].join('\n'),
      resolveDir: __dirname,
      sourcefile: 'rpa-smoke-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: BUNDLE,
    logLevel: 'warning',
  });
  const mod = require(BUNDLE);
  if (!process.env.RPA_SMOKE_BUNDLE) { try { fs.unlinkSync(BUNDLE); } catch { /* 忽略清理失败 */ } }
  return mod;
}

// ── 本机假搜索页：与真站点同样的「输入框 → 回车 → 结果页」形态 ──
function startLocalSite() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (u.pathname === '/search') {
      const q = u.searchParams.get('q') || '';
      res.end(`<!doctype html><html><body><h1>搜索结果</h1><div id="results">为你找到「${q}」的 3 条结果</div></body></html>`);
    } else {
      res.end('<!doctype html><html><body><form action="/search"><input id="kw" name="q"><button type="submit">搜索</button></form></body></html>');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

// ── adapter 的 call → 真 Playwright page ──
function resolveLocator(page, args) {
  if (args.selector) return page.locator(String(args.selector)).first();
  if (args.index !== undefined) return page.locator('input, textarea, button, a').nth(Number(args.index));
  const t = args.target;
  if (t) {
    if (t.label) return page.getByLabel(String(t.label), { exact: !!t.exact }).first();
    if (t.text) return page.getByText(String(t.text), { exact: !!t.exact }).first();
    if (t.role) return page.getByRole(String(t.role), t.name ? { name: String(t.name), exact: !!t.exact } : {}).first();
  }
  return null;
}

function makeCall(page) {
  return async (tool, args, timeoutMs) => {
    const t = Math.min(Math.max(Number(timeoutMs) || 30000, 1000), NAV_TIMEOUT);
    switch (tool) {
      case 'browser_navigate': {
        const resp = await page.goto(String(args.url), { waitUntil: 'domcontentloaded', timeout: t });
        return { url: page.url(), status: resp ? resp.status() : null, title: await page.title() };
      }
      case 'browser_type': {
        const loc = resolveLocator(page, args);
        if (!loc) return { error: 'browser_type 缺少可用定位参数' };
        await loc.fill(String(args.text), { timeout: t });
        if (args.pressEnter) {
          const before = page.url();
          await loc.press('Enter', { timeout: t });
          // 回车会触发导航；不等落稳就进下一步 waitFor，会拿到旧页面（百度/淘宝都踩过）。
          await page.waitForURL((u) => u.href !== before, { timeout: Math.min(t, 10000) }).catch(() => {});
        }
        return { typed: String(args.text).length, enter: !!args.pressEnter };
      }
      case 'browser_click': {
        const loc = resolveLocator(page, args);
        if (!loc) return { error: 'browser_click 缺少可用定位参数' };
        await loc.click({ timeout: t });
        return { clicked: true };
      }
      case 'browser_press_key':
        await page.keyboard.press(String(args.key));
        return { pressed: args.key };
      case 'browser_wait':
        await page.waitForTimeout(Math.min(Number(args.ms) || 0, 60000));
        return { waited: args.ms };
      case 'browser_wait_for': {
        const wt = Math.min(Number(args.timeoutMs) || t, NAV_TIMEOUT);
        if (args.selector) await page.locator(String(args.selector)).first().waitFor({ state: 'visible', timeout: wt });
        if (args.text) await page.getByText(String(args.text), { exact: false }).first().waitFor({ state: 'visible', timeout: wt });
        return { matched: true, url: page.url() };
      }
      // adapter 的 browser.assertText / extractText 读的是 result.text（经 this.call 包成 output）
      case 'browser_get_visible_text':
        return { text: await page.locator('body').innerText({ timeout: t }) };
      case 'browser_get_text':
        return { text: await page.locator(String(args.selector)).first().innerText({ timeout: t }) };
      default:
        return { error: `自测桥未实现的工具：${tool}` };
    }
  };
}

function draft(name, url, steps) {
  return {
    schemaVersion: 1,
    name,
    description: 'RPA 搜索自测（真执行器 + 真浏览器）',
    kind: 'browser',
    params: [{ key: 'keyword', label: '关键词', type: 'string', required: true, defaultValue: KEYWORD }],
    steps,
  };
}

const s = (id, type, extra) => ({ id, type, ...extra });

function scriptsFor(localPort) {
  return [
    {
      key: 'local', label: '本机假搜索页（执行器基线）', expectUrl: /\/search\?q=/,
      script: draft('本地搜索', `http://127.0.0.1:${localPort}/`, [
        s('s1', 'browser.navigate', { url: `http://127.0.0.1:${localPort}/` }),
        s('s2', 'browser.type', { target: { by: 'css', selector: '#kw' }, text: '{{keyword}}', pressEnter: true }),
        s('s3', 'browser.waitFor', { selector: '#results', timeoutMs: 10000 }),
        s('s4', 'browser.assertText', { text: '{{keyword}}' }),
        s('s5', 'browser.extractText', { target: { by: 'css', selector: '#results' }, saveAs: 'resultText' }),
      ]),
    },
    {
      key: 'baidu', label: '百度搜索', expectUrl: /baidu\.com\/s/,
      // ★ 百度首页已改版：#kw 仍在 DOM 里但被隐藏，唯一可见输入框是 #chat-textarea。
      //   固定脚本写死 #kw 会卡在「element is not visible」——用 :visible 候选才稳。
      script: draft('百度搜索', 'https://www.baidu.com/', [
        s('s1', 'browser.navigate', { url: 'https://www.baidu.com/' }),
        s('s2', 'browser.type', { target: { by: 'css', selector: '#chat-textarea:visible, #kw:visible' }, text: '{{keyword}}', pressEnter: true }),
        s('s3', 'browser.waitFor', { text: '{{keyword}}', timeoutMs: 15000 }),
        s('s4', 'browser.assertText', { text: '{{keyword}}' }),
        s('s5', 'browser.extractText', { saveAs: 'resultText' }),
      ]),
    },
    {
      key: 'taobao', label: '淘宝搜索', expectUrl: /s\.taobao\.com|taobao\.com\/search|search\.htm/,
      // 结果页是 SPA：商品接口在 headless 下常停在「加载中」，故断言只要求结果页框架出现，
      // 「商品列表是否渲染」单独在脚本层如实报告，不伪装成执行器失败。
      softResults: true,
      script: draft('淘宝搜索', 'https://www.taobao.com/', [
        s('s1', 'browser.navigate', { url: 'https://www.taobao.com/' }),
        s('s2', 'browser.type', { target: { by: 'css', selector: '#q' }, text: '{{keyword}}', pressEnter: true }),
        s('s3', 'browser.waitFor', { text: '综合', timeoutMs: 15000 }),
        s('s4', 'browser.assertText', { text: '综合' }),
        s('s5', 'browser.extractText', { saveAs: 'resultText' }),
      ]),
    },
  ];
}

function check(label, cond, detail) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
  return cond;
}

(async () => {
  const { runAutomationScript, BrowserAutomationAdapter } = buildBundle();
  const { server, port } = await startLocalSite();
  const browser = await chromium.launch({
    headless: !HEADED,
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    timeout: 30000,
  });
  const results = [];
  try {
    const all = scriptsFor(port).filter((c) => ONLY === 'all' || ONLY.split(',').includes(c.key));
    for (const c of all) {
      const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 900 },
      });
      console.log(`\n=== ${c.label} ===`);
      const adapter = new BrowserAutomationAdapter({ call: makeCall(page), defaultTimeoutMs: NAV_TIMEOUT });
      const started = Date.now();
      let run;
      try {
        run = await runAutomationScript(c.script, { keyword: KEYWORD }, {
          runId: `smoke_${c.key}_${Date.now()}`,
          userId: 'guest',
          adapter,
          onStep: (e) => {
            if (e.type === 'finish') {
              console.log(`  ${e.status === 'completed' ? '✓' : '✗'} ${e.stepId} ${e.stepType}` +
                (e.error ? `  ${String(e.error).slice(0, 160)}` : ''));
            }
          },
        });
      } catch (e) {
        run = { status: 'failed', steps: [], error: String(e && e.message || e), startedAt: started, finishedAt: Date.now() };
      }
      const url = page.url();
      const title = await page.title().catch(() => '');
      const text = await page.locator('body').innerText().catch(() => '');
      const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 180);
      const ms = run.finishedAt - run.startedAt;
      console.log(`  status=${run.status}  steps=${run.steps.length}  ${ms}ms`);
      console.log(`  url=${url}`);
      console.log(`  title=${title}`);
      if (run.status !== 'completed') console.log(`  error=${run.error || ''}`);
      console.log(`  pageText=${snippet || '(空)'}`);
      let sent = false;
      try {
        const u = new URL(url);
        const q = u.searchParams.get('wd') || u.searchParams.get('q') || u.searchParams.get('keyword') || '';
        sent = q === KEYWORD || url.includes(encodeURIComponent(KEYWORD));
      } catch { /* 非 http URL 忽略 */ }
      const rendered = run.status === 'completed' && !text.includes('加载中') && text.includes(KEYWORD);
      check(`${c.label}：执行器步骤全完成`, run.status === 'completed', run.error || '');
      check(`${c.label}：落到结果页且关键词已送出`, c.expectUrl.test(url) && sent, `url=${url}`);
      if (c.softResults) {
        console.log(`  ${rendered ? 'INFO' : 'WARN'}  商品结果列表${rendered ? '已渲染' : '未渲染（页面停在「加载中」，headless 被站点限流或需登录）'}`);
      } else {
        check(`${c.label}：结果内容已渲染`, rendered);
      }
      const ok = run.status === 'completed' && c.expectUrl.test(url) && sent && (c.softResults || rendered);
      results.push({ key: c.key, ok, status: run.status, url, error: run.error || '', ms, rendered });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log('\n=== 汇总 ===');
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.key.padEnd(7)} ${r.status.padEnd(10)} ${String(r.ms).padStart(6)}ms  结果渲染=${r.rendered ? '是' : '否'}  ${r.url}`);
  console.log(results.some((r) => !r.ok) ? '\n有失败项（外部站点可能是反爬/登录墙，看上面的 url/pageText）' : '\n全部通过');
})().catch((e) => {
  console.error('SMOKE ERROR', e && e.stack || e);
  process.exit(1);
});
