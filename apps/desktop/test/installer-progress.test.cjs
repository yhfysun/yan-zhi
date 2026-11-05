/**
 * Windows 安装器进度与阶段提示守门。
 *
 * electron-builder 的默认 NSIS 模板会隐藏安装详情，并在安装阶段禁止
 * DetailPrint 输出，用户只能看到进度条移动。本测试确保所有 Windows
 * 安装档都接入同一份自定义脚本，且关键阶段提示不会被后续改动静默移除。
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
  'electron-builder.lite.relocated.yml',
  'electron-builder.shell.yml',
];

describe('Windows 安装器进度页', () => {
  test('安装页显示详情和进度条', () => {
    assert.match(INSTALLER, /!macro customHeader[\s\S]*?ShowInstDetails show[\s\S]*?InstProgressFlags smooth/);
  });

  test('安装开始时显示“准备安装并解压”状态', () => {
    assert.match(INSTALLER, /MUI_PAGE_CUSTOMFUNCTION_SHOW yzInstallPageShow/);
    assert.match(INSTALLER, /正在准备安装并解压应用文件/);
  });

  test('文件解压完成后切换到快捷方式和收尾阶段', () => {
    assert.match(INSTALLER, /!macro customFiles_x64[\s\S]*?yzMarkFilesExtracted/);
    assert.match(INSTALLER, /应用文件已解压，正在创建快捷方式并完成安装/);
    assert.match(INSTALLER, /正在完成系统设置/);
  });

  test('所有 Windows NSIS 配置都接入自定义安装脚本', () => {
    for (const name of NSIS_CONFIGS) {
      const yml = fs.readFileSync(path.join(DESKTOP, name), 'utf8');
      assert.match(yml, /nsis:[\s\S]*?include:\s*build\/installer\.nsh/, `${name} 未接入安装进度脚本`);
    }
  });
});
