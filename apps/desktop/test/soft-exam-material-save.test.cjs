const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const mainCjs = fs.readFileSync(path.join(root, 'apps', 'desktop', 'main.cjs'), 'utf8');
const preloadCjs = fs.readFileSync(path.join(root, 'apps', 'desktop', 'preload.cjs'), 'utf8');
const learningVue = fs.readFileSync(path.join(root, 'packages', 'ui', 'src', 'views', 'Learning.vue'), 'utf8');

test('软考学习清单保存到默认下载目录，不经过系统另存为对话框', () => {
  const start = mainCjs.indexOf("ipcMain.handle('learning:save-soft-material'");
  const end = mainCjs.indexOf("ipcMain.handle('fs:readFile'", start);
  assert.ok(start > 0 && end > start, '缺少软考学习清单保存处理器');
  const handler = mainCjs.slice(start, end);
  assert.match(handler, /app\.getPath\('downloads'\)/);
  assert.match(handler, /言智资料/);
  assert.match(handler, /软考/);
  assert.match(handler, /uniqueDownloadPath/);
  assert.match(handler, /fsp\.writeFile/);
  assert.doesNotMatch(handler, /showSaveDialog/);
});

test('preload 暴露直接保存桥，页面优先调用它而不是创建下载链接触发弹窗', () => {
  assert.match(preloadCjs, /softExam:\s*\{[\s\S]*saveMaterial/);
  assert.match(preloadCjs, /learning:save-soft-material/);
  assert.match(learningVue, /electronAPI\?\.softExam\?\.saveMaterial/);
  assert.match(learningVue, /已保存到 \$\{saved\.path\}/);
});

test('下载文案明确 Markdown 是自编学习清单，官方教材走官方入口', () => {
  assert.match(learningVue, /不是官方教材或官方原题/);
  assert.match(learningVue, /下载学习清单（\.md）/);
  assert.match(learningVue, /官方考试用书/);
  assert.match(learningVue, /ruankao\.org\.cn\/book\/main\.html/);
});
