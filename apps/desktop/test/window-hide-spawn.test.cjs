// 静态守门：所有会拉长命子进程（后端 / shell:exec）的 spawn 必须带 windowsHide。
//
// ★ 现场（2026-10-23 用户实报）：应用主进程是无控制台的 GUI 进程，spawn 不带 windowsHide 时
//   Windows 会给控制台子系统子进程新开一个可见终端窗口（Win11 默认终端 = Windows Terminal），
//   于是任务跑起来旁边就多一个黑窗口，里面的 [tts] seg_xxx 一直刷；停掉任务后窗口还在。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'apps', 'desktop', 'main.cjs'), 'utf8');
/** 剥注释：避免断言命中注释里的说明文字（本项目踩过假绿） */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

test('shell:exec 的 execFile 必须 windowsHide（否则子进程弹黑窗口）', () => {
  const start = code.indexOf("ipcMain.handle('shell:exec'");
  assert.ok(start > 0, '未找到 shell:exec 处理器');
  const end = code.indexOf('ipcMain.handle(', start + 10);
  const handler = code.slice(start, end > 0 ? end : undefined);
  assert.match(handler, /windowsHide:\s*true/, 'shell:exec 的 execFile 缺少 windowsHide: true');
});

test('后端进程 spawn（dev / npx 回退 / 生产）都必须 windowsHide', () => {
  const blocks = [
    /spawn\(process\.execPath, \[tsxPath, 'watch', 'src\/index\.ts'\]/,
    /spawn\('npx', \['tsx', 'watch', 'src\/index\.ts'\]/,
    /spawn\(process\.execPath, \[serverPath\]/,
  ];
  for (const re of blocks) {
    const m = re.exec(code);
    assert.ok(m, `未找到后端 spawn：${re}`);
    const block = code.slice(m.index, m.index + 600);
    assert.match(block, /windowsHide:\s*true/, `后端 spawn 缺少 windowsHide: true：${re}`);
  }
});
