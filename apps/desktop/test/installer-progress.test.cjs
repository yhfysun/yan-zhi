/**
 * Windows 安装器进度页守门（2026-11-15 改造后）。
 *
 * 旧实现靠「打开详情面板 + 四阶段中文日志」补偿 electron-builder 隐藏详情的行为，
 * 用户看到的是一整块滚动文字；现在是极简单行「当前动作」+ 平滑着色进度条。
 * 本测试钉住新结构、静默安装保护与品牌位图的真实尺寸。
 *
 * 运行：node --test apps/desktop/test/installer-progress.test.cjs
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DESKTOP = path.resolve(__dirname, '..');
const INSTALLER = fs.readFileSync(path.join(DESKTOP, 'build', 'installer.nsh'), 'utf8');
const NSIS_CONFIGS = [
  'electron-builder.full.yml',
  'electron-builder.lite.yml',
  'electron-builder.shell.yml',
];

function bmpHeader(file) {
  const b = fs.readFileSync(file);
  assert.strictEqual(b.toString('ascii', 0, 2), 'BM', `${file} 不是合法 BMP`);
  return {
    width: b.readInt32LE(18),
    height: b.readInt32LE(22),
    bits: b.readUInt16LE(28),
  };
}

describe('Windows 安装器进度页', () => {
  test('隐藏滚动详情列表，保留平滑进度条', () => {
    assert.match(INSTALLER, /!macro customHeader[\s\S]*?ShowInstDetails nevershow[\s\S]*?InstProgressFlags smooth/);
    assert.doesNotMatch(INSTALLER, /DetailPrint/, '详情已隐藏，DetailPrint 属于无效噪音');
  });

  test('★ 进度条着色为品牌绿（PBM_SETBARCOLOR + COLORREF）', () => {
    assert.match(INSTALLER, /\$\{PBM_SETBARCOLOR\}/);
    assert.match(INSTALLER, /0x004AA316/, '品牌绿 #16a34a 的 COLORREF 是 0x004AA316');
    assert.match(INSTALLER, /GetDlgItem \$2 \$1 1004/, '进度条控件 1004');
  });

  test('★ 静默安装 /S 跳过所有 UI 操作，且保持栈平衡', () => {
    assert.match(INSTALLER, /Function yzInstallPageShow[\s\S]*?IfSilent yzInstallPageDone/);
    assert.match(INSTALLER, /Function yzSetInstallStatus[\s\S]*?IfSilent yzStatusDone/);
    // Exch/Pop 必须在 IfSilent 之外，否则调用方 Push 的参数会留在栈上
    assert.match(INSTALLER, /Function yzSetInstallStatus[\s\S]*?Exch \$0[\s\S]*?IfSilent[\s\S]*?Pop \$0/);
  });

  test('★ 状态行是一句当前动作，不再用 [n/4] 步骤编号', () => {
    assert.match(INSTALLER, /MUI_PAGE_CUSTOMFUNCTION_SHOW yzInstallPageShow/);
    assert.match(INSTALLER, /Push "正在解压缩应用文件，请稍等…"/);
    // 只检查真正下发到状态行的文案；注释里描述旧实现不算回归
    const pushes = [...INSTALLER.matchAll(/Push\s+"([^"]*)"/g)].map((m) => m[1]);
    assert.ok(pushes.length >= 3, '找不到状态行文案');
    for (const text of pushes) {
      assert.doesNotMatch(text, /\[\d\/4\]/, `状态行仍带步骤编号：${text}`);
    }
    assert.doesNotMatch(INSTALLER, /DetailPrint|yzWriteInstallOverview/, '四阶段日志总览已移除');
  });

  test('★ 覆盖安装前杀掉旧版主程序与 detached 后端', () => {
    assert.match(
      INSTALLER,
      /!macro customCheckAppRunning[\s\S]*?taskkill \/F \/T \/IM "yan-zhi\.exe"[\s\S]*?Sleep 1200/,
      '升级前必须结束 yan-zhi.exe，否则旧后端会继续占用 3001',
    );
  });

  test('解压完成与收尾阶段都更新状态行', () => {
    for (const arch of ['x64', 'arm64', 'ia32']) {
      assert.match(INSTALLER, new RegExp(`!macro customFiles_${arch}[\\s\\S]*?yzMarkFilesExtracted`));
    }
    assert.match(INSTALLER, /Push "应用文件已解压，正在创建快捷方式…"/);
    assert.match(INSTALLER, /Push "正在完成最后设置…"/);
    assert.match(INSTALLER, /ie4uinit\.exe -ClearIconCache/, '覆盖升级后必须刷新图标缓存');
  });

  test('★ 品牌位图放对默认路径且尺寸合法（electron-builder 自动检测）', () => {
    // 依据 app-builder-lib/out/targets/nsis/NsisTarget.js:396/404：
    // getResource(options.installerSidebar, "installerSidebar.bmp")，未配置时默认就在 build/ 下找。
    // 纯色位图覆盖 NSIS 默认蓝色渐变向导图 —— 减元素，不是加装饰。
    const buildDir = path.join(DESKTOP, 'build');
    const sidebar = bmpHeader(path.join(buildDir, 'installerSidebar.bmp'));
    assert.strictEqual(sidebar.width, 164);
    assert.strictEqual(sidebar.height, 314);
    assert.strictEqual(sidebar.bits, 24);
    const header = bmpHeader(path.join(buildDir, 'installerHeader.bmp'));
    assert.strictEqual(header.width, 150);
    assert.strictEqual(header.height, 57);
    assert.strictEqual(header.bits, 24);
  });

  test('★ 品牌位图已放行 .gitignore（漏放行 = CI 静默退回默认蓝色向导图）', () => {
    const ignore = fs.readFileSync(path.resolve(DESKTOP, '..', '..', '.gitignore'), 'utf8');
    assert.match(ignore, /!apps\/desktop\/build\/installerSidebar\.bmp/);
    assert.match(ignore, /!apps\/desktop\/build\/installerHeader\.bmp/);
  });

  test('header 改中文产品名，安装中隐藏上一步/下一步且离开时恢复', () => {
    // 1037/1038 是 MUI2 header 的标题/副标题控件，位于外层窗口
    assert.match(INSTALLER, /GetDlgItem \$1 \$HWNDPARENT 1037/);
    assert.match(INSTALLER, /STR:言智 正在安装到您的电脑中，请稍等。/);
    // 按钮 1=Next、3=Back；0=SW_HIDE
    assert.match(INSTALLER, /GetDlgItem \$1 \$HWNDPARENT 3[\s\S]*?ShowWindow \$1 0/);
    assert.match(INSTALLER, /GetDlgItem \$1 \$HWNDPARENT 1[\s\S]*?ShowWindow \$1 0/);
    // ★ 离开安装页必须显式恢复，否则完成页没有「完成」按钮
    assert.match(INSTALLER, /MUI_PAGE_CUSTOMFUNCTION_LEAVE yzInstFilesLeave/);
    assert.match(INSTALLER, /Function yzInstFilesLeave[\s\S]*?ShowWindow \$1 1[\s\S]*?ShowWindow \$1 1/);
  });

  test('底部 branding 留空（极简，不再显示 yan-zhi <版本>）', () => {
    assert.match(INSTALLER, /BrandingText " "/);
  });

  test('所有 Windows NSIS 配置都接入自定义安装脚本', () => {
    for (const name of NSIS_CONFIGS) {
      const yml = fs.readFileSync(path.join(DESKTOP, name), 'utf8');
      assert.match(yml, /nsis:[\s\S]*?include:\s*build\/installer\.nsh/, `${name} 未接入安装进度脚本`);
    }
  });

  test('卸载器不注入安装页 UI', () => {
    assert.match(INSTALLER, /!ifndef BUILD_UNINSTALLER[\s\S]*?!endif\s*$/);
  });
});
