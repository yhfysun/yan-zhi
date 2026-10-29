// 保活判据的守门测试：游戏页 / 相似域名 / 路径边界 / scope。
// 判据错了的代价是"游戏页被休眠 → 重载 → 报废"，所以边界必须逐个钉住。
const test = require('node:test');
const assert = require('node:assert');
const { isProtectedGameUrl, keepAliveOf } = require('../tab-keepalive.cjs');

test('protects wanyiwan game pages (host + /game/ prefix)', () => {
  assert.equal(isProtectedGameUrl('https://wanyiwan.top/game/sc33t'), true);
  assert.equal(isProtectedGameUrl('https://www.wanyiwan.top/game/sc33t?from=alipay'), true);
  assert.equal(isProtectedGameUrl('https://WANYIWAN.TOP/game/sc33t'), true);
  assert.equal(isProtectedGameUrl('http://wanyiwan.top:8080/game/a/b'), true);
});

test('does not protect lookalike hosts or non-game paths', () => {
  assert.equal(isProtectedGameUrl('https://evilwanyiwan.top/game/x'), false);
  assert.equal(isProtectedGameUrl('https://wanyiwan.top.evil.com/game/x'), false);
  assert.equal(isProtectedGameUrl('https://wanyiwan.top/x/game/x'), false);
  assert.equal(isProtectedGameUrl('https://wanyiwan.top/'), false);
  assert.equal(isProtectedGameUrl('https://wanyiwan.top/game'), false);
  assert.equal(isProtectedGameUrl('about:blank'), false);
  assert.equal(isProtectedGameUrl(''), false);
  assert.equal(isProtectedGameUrl(null), false);
});

test('scope=game is always kept alive; other scopes fall back to URL rules', () => {
  assert.equal(keepAliveOf({ scope: 'game', url: 'https://example.com' }), true);
  assert.equal(keepAliveOf({ scope: 'page', url: 'https://example.com' }), false);
  assert.equal(keepAliveOf({ scope: 'page', url: 'https://wanyiwan.top/game/a' }), true);
  assert.equal(keepAliveOf({ scope: 'preview', url: '' }), false);
  assert.equal(keepAliveOf(null), false);
});
