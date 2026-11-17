const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAIN = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const CORE_BROWSER = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'packages', 'core', 'src', 'tool', 'builtin', 'browser', 'index.ts'),
  'utf8',
);

test('浏览器批注 V2 注入层保留人机互斥且支持文字、多选和语义锚点', () => {
  assert.match(MAIN, /function yzAnnotationBootstrap\(config\)/);
  assert.match(MAIN, /selectionSnapshot\(window, 0\)/);
  assert.match(MAIN, /data-yz-annotate-id/);
  assert.match(MAIN, /additionalAnchors/);
  assert.match(MAIN, /annotation_set_mode/);
  assert.match(MAIN, /annotation_focus/);
  assert.match(MAIN, /suspendAnnotationOn\(wc\)/);
  assert.match(MAIN, /resumeAnnotationOn\(wc\)/);
});

test('批注不暴露为 agent 工具，截图支持按视口坐标裁剪', () => {
  assert.doesNotMatch(CORE_BROWSER, /name\s*=\s*['"]browser_annotation/);
  assert.match(MAIN, /args\s*&&\s*args\.crop/);
  assert.match(MAIN, /image\.crop\(\{\s*x,\s*y,\s*width,\s*height\s*\}\)/);
});
