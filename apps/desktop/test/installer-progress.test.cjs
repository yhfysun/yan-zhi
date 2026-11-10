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
  'electron-builder.shell.yml',
  // 注意：707887a8 曾在此登记 'electron-builder.lite.relocated.yml'，但该文件从未入库、
  // 全仓零脚本/文档消费（2026-11-09 全仓检索确认）——并行会话的虚胖条目，移除而非补建。
];

describe('Windows 安装器进度页', () => {
  test('安装页显示详情和进度条', () => {
    assert.match(INSTALLER, /!macro customHeader[\s\S]*?ShowInstDetails show[\s\S]*?InstProgressFlags smooth/);
  });

  test('安装开始时显示阶段一状态', () => {
    assert.match(INSTALLER, /MUI_PAGE_CUSTOMFUNCTION_SHOW yzInstallPageShow/);
    assert.match(INSTALLER, /\[1\/4\] 正在检查安装环境/);
  });

  test('空白详情区显示安装位置和四阶段说明', () => {
    assert.match(INSTALLER, /SetDetailsPrint listonly/);
    assert.match(INSTALLER, /DetailPrint "安装位置：\$INSTDIR"/);
    assert.match(INSTALLER, /\[1\/4\] 准备安装环境/);
    assert.match(INSTALLER, /\[2\/4\] 解压应用文件/);
    assert.match(INSTALLER, /\[3\/4\] 创建快捷方式/);
    assert.match(INSTALLER, /\[4\/4\] 完成安装/);
  });

  test('文件解压完成后切换到快捷方式和收尾阶段', () => {
    assert.match(INSTALLER, /!macro customFiles_x64[\s\S]*?yzMarkFilesExtracted/);
    assert.match(INSTALLER, /\[3\/4\] 应用文件已解压，正在创建快捷方式并写入安装信息/);
    assert.match(INSTALLER, /\[4\/4\] 正在完成最后设置并检查安装结果/);
  });

  test('所有 Windows NSIS 配置都接入自定义安装脚本', () => {
    for (const name of NSIS_CONFIGS) {
      const yml = fs.readFileSync(path.join(DESKTOP, name), 'utf8');
      assert.match(yml, /nsis:[\s\S]*?include:\s*build\/installer\.nsh/, `${name} 未接入安装进度脚本`);
    }
  });
});
