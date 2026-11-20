const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

test('browser debug actions are implemented and exposed to the bridge allowlist', () => {
  for (const action of ['get_console_log', 'get_debug_state', 'get_page_capabilities']) {
    assert.match(MAIN, new RegExp(`case '${action}'`));
    assert.match(MAIN, new RegExp(`'${action}'`));
  }
  assert.match(MAIN, /browserDebugBuffers/);
  assert.match(MAIN, /attachBrowserDebugCollectors/);
  assert.match(MAIN, /did-fail-load/);
});

test('page capabilities exposes WebMCP detection without credential access', () => {
  assert.match(MAIN, /navigator\.modelContext/);
  assert.match(MAIN, /webmcp/);
  assert.match(MAIN, /document\.images/);
  assert.doesNotMatch(MAIN, /localStorage.*modelContext/);
});

test('page background probe keeps regex escapes inside executeJavaScript', () => {
  assert.match(MAIN, /rgba\?\\\\\(\(\\\\d\+\)/);
});
