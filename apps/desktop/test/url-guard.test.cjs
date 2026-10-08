/**
 * 外链协议白名单守门测试（2026-10-08）。
 *
 * ★★ 背景：用户报告「今天经常弹窗」——截图是 Windows 的
 *    「这一台电脑上没有可打开此链接的应用 / 在 Microsoft Store 中查找此应用」。
 *    排查结论：
 *      - yan-zhi 源码与打包版 app.asar（162MB）里搜 bitbrowser 全部 0 命中；
 *      - 注册表 HKCU/HKLM\Software\Classes\bitbrowser 不存在（本机没注册该协议）；
 *      - 本机无 BitBrowser 进程。
 *    → 弹窗不是应用主动唤起，而是**页面里的自定义协议链接被 openExternal 甩给 Shell**，
 *      Shell 找不到处理器 → 系统弹窗。触发场景是小说推文任务里打开的第三方站点页面。
 *
 * 修复：四道闸门（main.cjs）
 *   1) ipcMain 'shell:openExternal'      —— 渲染层显式请求
 *   2) 主窗口 setWindowOpenHandler       —— window.open / target=_blank
 *   3) 主窗口 'will-navigate'            —— 整页导航逃逸
 *   4) **guest 'will-navigate'**         —— ★ 关键漏点：guest 内页面自身跳转
 *      （主窗口 handler 管不到 guest，两套 webContents 隔离，这是弹窗的真正入口）
 *
 * 判据（三条一起看）：
 *   ① isSafeExternalUrl 只放行 http/https，其余（含 bitbrowser://）一律 false；
 *   ② isAllowedGuestNavigation 放行 http(s)/about/blob/data，拦截自定义协议；
 *   ③ main.cjs 四处调用点都改用了白名单函数，且不再有内联的正则裸判断。
 *
 * 运行：node --test apps/desktop/test/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const { isSafeExternalUrl, isAllowedGuestNavigation } = require(path.join(DESKTOP, 'url-guard.cjs'));

describe('isSafeExternalUrl —— openExternal 白名单', () => {
  test('放行 http/https（含大小写混写与前后空白）', () => {
    assert.equal(isSafeExternalUrl('https://kol.fanqieopen.com/'), true);
    assert.equal(isSafeExternalUrl('http://localhost:3001/api'), true);
    assert.equal(isSafeExternalUrl('HTTPS://EXAMPLE.COM'), true);
    assert.equal(isSafeExternalUrl('  https://a.com  '), true);
  });

  test('拦截自定义协议（本次弹窗元凶 + 常见同类）', () => {
    assert.equal(isSafeExternalUrl('bitbrowser://open?seq=abc'), false);
    assert.equal(isSafeExternalUrl('BITBROWSER://open'), false);
    assert.equal(isSafeExternalUrl('tel:10086'), false);
    assert.equal(isSafeExternalUrl('mailto:a@b.com'), false);
    assert.equal(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe'), false);
    assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
    assert.equal(isSafeExternalUrl('ms-windows-store://home'), false);
    assert.equal(isSafeExternalUrl('weixin://dl/chat'), false);
  });

  test('前导空白不能绕过（trim 后判定）', () => {
    assert.equal(isSafeExternalUrl('  bitbrowser://open'), false);
    assert.equal(isSafeExternalUrl('\tjavascript:alert(1)'), false);
  });

  test('非字符串与空值一律拒绝', () => {
    assert.equal(isSafeExternalUrl(''), false);
    assert.equal(isSafeExternalUrl('   '), false);
    assert.equal(isSafeExternalUrl(null), false);
    assert.equal(isSafeExternalUrl(undefined), false);
    assert.equal(isSafeExternalUrl(123), false);
    assert.equal(isSafeExternalUrl({}), false);
  });

  test('不允许无协议的裸域名（避免被当相对地址误判）', () => {
    assert.equal(isSafeExternalUrl('a.com'), false);
    assert.equal(isSafeExternalUrl('www.baidu.com'), false);
  });
});

describe('isAllowedGuestNavigation —— guest will-navigate 闸门', () => {
  test('放行 http/https（预览面板正常导航）', () => {
    assert.equal(isAllowedGuestNavigation('https://www.douyin.com/'), true);
    assert.equal(isAllowedGuestNavigation('http://192.168.10.13/'), true);
    assert.equal(isAllowedGuestNavigation('HTTPS://A.COM'), true);
  });

  test('放行页面内部机制（about/blob/data）', () => {
    assert.equal(isAllowedGuestNavigation('about:blank'), true);
    assert.equal(isAllowedGuestNavigation('blob:https://a.com/uuid'), true);
    assert.equal(isAllowedGuestNavigation('data:text/html,<h1>x</h1>'), true);
  });

  test('拦截自定义协议 —— bitbrowser:// 弹窗的真正入口', () => {
    assert.equal(isAllowedGuestNavigation('bitbrowser://open?seq=abc'), false);
    assert.equal(isAllowedGuestNavigation('tel:10086'), false);
    assert.equal(isAllowedGuestNavigation('mailto:a@b.com'), false);
    assert.equal(isAllowedGuestNavigation('weixin://dl/chat'), false);
    assert.equal(isAllowedGuestNavigation('ms-windows-store://home'), false);
  });

  test('空值不拦（交给 Electron 自处理，避免误伤）', () => {
    assert.equal(isAllowedGuestNavigation(''), true);
    assert.equal(isAllowedGuestNavigation(null), true);
    assert.equal(isAllowedGuestNavigation(undefined), true);
  });
});

describe('main.cjs 接线守门 —— 四处调用点必须用白名单，不得留内联裸判断', () => {
  const mainSrc = fs.readFileSync(path.join(DESKTOP, 'main.cjs'), 'utf8');

  test('已 require url-guard.cjs 并取到两个函数', () => {
    assert.match(
      mainSrc,
      /require\(\s*'\.\/url-guard\.cjs'\s*\)/,
      'main.cjs 必须 require ./url-guard.cjs',
    );
    assert.match(mainSrc, /isSafeExternalUrl/, '必须使用 isSafeExternalUrl');
    assert.match(mainSrc, /isAllowedGuestNavigation/, '必须使用 isAllowedGuestNavigation');
  });

  test('shell:openExternal 走白名单', () => {
    const idx = mainSrc.indexOf("ipcMain.handle('shell:openExternal'");
    assert.ok(idx > -1, '未找到 shell:openExternal handler');
    const body = mainSrc.slice(idx, idx + 500);
    assert.match(body, /isSafeExternalUrl\(/, 'shell:openExternal 必须用 isSafeExternalUrl 校验');
  });

  test('不再残留内联的 http(s) 裸判断交给 openExternal', () => {
    // 找出所有 openExternal 调用行，逐行确认不是裸正则兜着
    const lines = mainSrc.split('\n');
    const offenders = [];
    lines.forEach((line, i) => {
      if (!/shell\.openExternal\(/.test(line)) return;
      // 向上找 6 行，看是否有白名单函数的守卫
      const from = Math.max(0, i - 6);
      const ctx = lines.slice(from, i + 1).join('\n');
      if (!/isSafeExternalUrl\(/.test(ctx)) offenders.push(i + 1);
    });
    // 允许「catch 兜底」形式（try { shell.openExternal(url) } catch），但那也必须已有上游守卫。
    // 这里只保证：每个 openExternal 调用点上下文里出现过白名单函数。
    assert.deepEqual(offenders, [], `以下行的 openExternal 缺少白名单守卫: ${offenders.join(', ')}`);
  });

  test('guest 弹窗重定向函数里挂了 will-navigate 闸门', () => {
    const idx = mainSrc.indexOf('function setupGuestPopupRedirect');
    assert.ok(idx > -1, '未找到 setupGuestPopupRedirect');
    const body = mainSrc.slice(idx, idx + 1800);
    assert.match(body, /wc\.on\(\s*'will-navigate'/, 'guest 必须挂 will-navigate 拦截自定义协议');
    assert.match(body, /isAllowedGuestNavigation\(/, 'guest will-navigate 必须用 isAllowedGuestNavigation');
  });
});
