// @vitest-environment jsdom
/**
 * Android M1 NFC 接线契约测试
 *
 * ★ 本机是 Windows，没有 Android 真机 / NFC 读卡器，Java 代码无法在此编译验证。
 *   所以这里把「接线不能漏」的静态契约钉死：独立包目录、权限、插件注册、
 *   构建链、机型降级、块 0 不伪造成功；真机链路仍需 Android 设备实测。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isAndroidM1NfcPlatform,
  registerAndroidM1NfcDriver,
} from './m1-nfc';
import { m1NfcDriver, m1RegisterNfcDriver, m1NfcCapability } from '@yan-zhi/shared';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('平台降级', () => {
  it('★ 非 Android 原生壳不注册真机驱动，能力探测明确不可用', async () => {
    m1RegisterNfcDriver(null);
    expect(isAndroidM1NfcPlatform()).toBe(false);
    registerAndroidM1NfcDriver();
    expect(m1NfcDriver()).toBeNull();
    const cap = await m1NfcCapability();
    expect(cap.available).toBe(false);
    expect(cap.reason).toContain('课程模拟器');
  });
});

describe('原生插件接线契约', () => {
  it('构建链包含 M1 NFC 幂等脚本，且排在 cap sync 之前', () => {
    const pkg = JSON.parse(read('package.json'));
    const chain: string = pkg.scripts['build:android'];
    expect(chain).toContain('apply-native-m1nfc.cjs');
    expect(chain.indexOf('apply-native-m1nfc.cjs')).toBeLessThan(chain.indexOf('cap sync android'));
  });

  it('★ 幂等脚本使用独立 native 目录，不会把 m1nfc 包混进 sms 包', () => {
    const script = read('scripts/apply-native-m1nfc.cjs');
    expect(script).toContain("'native', 'android-m1nfc'");
    expect(script).not.toContain("'native', 'android'");
    expect(script).toContain("'yanzhi', 'mobile', 'm1nfc'");
    expect(script).toContain('android.permission.NFC');
    expect(script).toContain('android.hardware.nfc');
    expect(script).toContain('registerPlugin(M1NfcPlugin.class)');
    expect(script).toContain('super.onCreate(');
  });

  it('Java 插件声明了 M1Nfc、能力降级与扇区认证/读写', () => {
    const java = read('native/android-m1nfc/M1NfcPlugin.java');
    expect(java).toContain('package com.yanzhi.mobile.m1nfc;');
    expect(java).toContain('@CapacitorPlugin(');
    expect(java).toContain('name = "M1Nfc"');
    expect(java).toContain('MifareClassic.get(currentTag)');
    expect(java).toContain('authenticateSectorWithKeyA');
    expect(java).toContain('authenticateSectorWithKeyB');
    expect(java).toContain('enableReaderMode');
    expect(java).toContain('sectorToBlock');
    // ★ 贴卡是异步的：插件必须挂起 waitForTag 等 onTagDiscovered，不能立刻回 NO_TAG
    expect(java).toContain('public void waitForTag(PluginCall call)');
    expect(java).toContain('call.getString("requireNew", "false")');
    expect(java).toContain('TAG_TIMEOUT');
    expect(java).toContain('closeMifare()');
    // ★ 换目标卡：写入前必须等新 tag，否则源卡会被写回自己
    expect(java).toContain('waiting.resolve(ready)');
    // 机型不支持时如实返回 false，不假装读到卡
    expect(java).toContain('out.put("mifareClassic", false)');
    // ★ 裸 NfcA 回退：MifareClassic.get 为 null 时用 MIFARE 裸指令探测（60=认证 30=读 A0=写），
    //   Crypto1 由芯片硬件执行——部分「未提供 MIFARE Classic 实现」的机型靠这条路径救回来
    expect(java).toContain('resolveRawFallback');
    expect(java).toContain('slotA ? 0x60 : 0x61');
    expect(java).toContain('(byte) 0x30');
    expect(java).toContain('(byte) 0xA0');
    expect(java).toContain('rawReadBlock');
    expect(java).toContain('rawWriteBlock');
    // 诊断字段：失败分支也带 techList/sak/atqa，区分「芯片不支持」和「卡不是 M1」
    expect(java).toContain('techListOf(currentTag)');
    expect(java).toContain('isM1Sak');
    // 块 0 写不进时如实返回 ok=false
    expect(java).toContain('out.put("ok", false)');
  });

  it('JS 桥在机型不支持 M1 时抛明确错误，由 UI 降级', () => {
    const bridge = read('src/m1-nfc.ts');
    expect(bridge).toContain('该机型不支持 MIFARE Classic');
    expect(bridge).toContain('isAndroidM1NfcPlatform');
    expect(bridge).toContain('m1RegisterNfcDriver(driver)');
    // ★ 读卡前先等贴卡；写入前必须换目标卡并重连新 tag
    expect(bridge).toContain("waitForTag({ requireNew: 'false'");
    expect(bridge).toContain("waitForTag({ requireNew: 'true'");
    expect(bridge).toContain('awaitTargetCard: async ()');
  });

  it('移动端入口在挂载前注册真机驱动', () => {
    const main = read('src/main.ts');
    expect(main).toContain('registerAndroidM1NfcDriver()');
    expect(main.indexOf('registerAndroidM1NfcDriver()')).toBeLessThan(main.indexOf('mountApp()'));
  });
});
