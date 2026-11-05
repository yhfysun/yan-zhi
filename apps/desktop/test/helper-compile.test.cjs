const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.resolve(__dirname, '../main.cjs'), 'utf8');

test('桌面 C# helper 编译走通用 ensureHelperExe，GDI 只做薄封装', () => {
  assert.match(MAIN, /async function ensureHelperExe\(/);
  assert.match(MAIN, /helperExePaths/);
  assert.match(MAIN, /async function ensureGdiCapExe\(\)\s*\{[\s\S]*?ensureHelperExe\(/);
  assert.match(MAIN, /'yan-zhi-screencap-v2'/);
});
