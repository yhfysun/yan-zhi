/**
 * CSP 的 WebSocket 放行守门测试（2026-10-16）。
 *
 * ★★★ 为什么必须钉住（实测故障）：CSP 的 `http:`/`https:` 源**不匹配** `ws://` ——
 *   只写 `http://127.0.0.1:3001` 时，运维终端的
 *   `ws://127.0.0.1:3001/api/plugin/ops-shell/term/ws?...` 会被直接拦掉：
 *     ① 渲染进程控制台每次刷新一条 `violates the following Content Security Policy
 *        directive`（用户实测日志里 15:03 / 15:16 / 16:03 各一次）；
 *     ② 终端的 `openWsTermTransport` 失败后**静默降级成 SSE**，功能看着还能用
 *        → 只表现为"WS 老是连不上"，是那种查半天查不到的 bug。
 *
 * 判据（缺一不可）：
 *   ① 存在 `wsOrigins` 常量，且**跟随 API_PORT**（临时用 YANZHI_API_PORT 错开端口时要一起动）
 *      —— 写死 3001 会在换端口时重新变回"全被拦"；
 *   ② dev 与 prod **两支** connect-src 都带上它（只补一支 = 打包版照旧连不上）。
 *
 * 为什么用「读源码断言」而不是起 Electron：main.cjs 顶层 require electron，
 *   `node --test` 里直接 require 会失败；而这些点的本质是"策略串里有没有这段"。
 *   同口径见 test/data-dir-injection.test.cjs 顶部说明。
 *
 * 运行：node --test apps/desktop/test/csp-ws-origins.test.cjs
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

/** CSP 构造段：从 `const csp = isDev` 到注入响应头那行之前。 */
const CSP_BLOCK = MAIN.slice(
  MAIN.indexOf('const csp = isDev'),
  MAIN.indexOf('session.defaultSession.webRequest.onHeadersReceived'),
);
/** wsOrigins 常量所在行。 */
const WS_CONST_LINE = MAIN.split('\n').find((l) => l.includes('const wsOrigins')) || '';
/**
 * 每一支 connect-src 指令（模板串整段）。
 * ★ 2026-10-29：必须锚 `connect-src 'self'`，不能只锚 `connect-src` ——
 *   CSP 块里有一句注释 `// connect-src 不放行就会 "Couldn't load texture"`，
 *   只锚指令名会把注释当第三支指令 ⇒ 数量 3≠2、且该"指令"不含 ${wsOrigins}（假红）。
 *   真实指令一律以 `'self'` 开头（改策略时若真去掉 'self'，这条同时会喊出来，不放水）。
 *   ★ 不要改成"按行剥注释"：块里是模板串，`http://…` 的 `//` 会被误剥。
 */
const CONNECT_DIRECTIVES = CSP_BLOCK.match(/connect-src 'self'[^`]*`/g) || [];

describe('CSP · WebSocket 源', () => {
  test('① ws 源跟随 API_PORT，不写死端口', () => {
    assert.ok(WS_CONST_LINE, '找不到 wsOrigins 常量（CSP 里没有显式放行 ws://）');
    assert.match(WS_CONST_LINE, /ws:\/\/127\.0\.0\.1:\$\{API_PORT\}/, 'ws 源未跟随 API_PORT（127.0.0.1 那侧）');
    assert.match(WS_CONST_LINE, /ws:\/\/localhost:\$\{API_PORT\}/, 'ws 源未跟随 API_PORT（localhost 那侧）');
    assert.ok(!/3001/.test(WS_CONST_LINE), 'ws 源里写死了 3001：换端口（YANZHI_API_PORT）时会重新被 CSP 拦掉');
  });

  test('② dev 与 prod 两支 connect-src 都放行 ws', () => {
    assert.strictEqual(CONNECT_DIRECTIVES.length, 2, `应有 dev/prod 两支 connect-src，实际 ${CONNECT_DIRECTIVES.length} 支`);
    for (const d of CONNECT_DIRECTIVES) {
      assert.ok(d.includes('${wsOrigins}'), `某支 connect-src 没带 wsOrigins：${d.slice(0, 60)}…`);
    }
  });

  test('③ 回归哨兵：策略里必须真的有 ws:// 源', () => {
    // 旧写法（被拦的那版）里 connect-src 完全不含 ws:// —— 上面两条已能咬住删常量，
    // 这条再兜一层：确保 ws:// 真的是被放行的源，而不只是声明了个没人用的常量。
    assert.ok(/ws:\/\//.test(WS_CONST_LINE), 'wsOrigins 里没有 ws:// 源');
    assert.ok(
      CONNECT_DIRECTIVES.every((d) => d.includes('${wsOrigins}')),
      'CSP 策略里没有 ws:// 源',
    );
  });
});
