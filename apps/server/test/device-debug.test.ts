// device-debug 纯解析函数单测 —— adb devices / /proc/net/unix / CDP 参数 / targetKey
// 真机集成路径（forward/CDP WebSocket）需要实体设备，不在单测覆盖范围（见工具描述的排查引导）。
import { describe, it, expect } from 'vitest';
import {
  parseAdbDevices,
  extractDevtoolsSockets,
  formatCdpArgs,
  parseTargetKey,
} from '../src/services/device-debug.js';

describe('parseAdbDevices', () => {
  it('解析标准 devices 输出（跳过表头与 * 行）', () => {
    const out = parseAdbDevices(
      [
        'List of devices attached',
        'ABC123\tdevice',
        'emulator-5554\toffline',
        '* daemon started successfully',
        '',
      ].join('\n'),
    );
    expect(out).toEqual([
      { serial: 'ABC123', state: 'device' },
      { serial: 'emulator-5554', state: 'offline' },
    ]);
  });

  it('无线调试序列号带空格时按状态词定位分界（android-mirror 同判据）', () => {
    const out = parseAdbDevices('adb-192.168.1.5:37891 (2)._adb-tls-connect._tcp\tdevice');
    expect(out).toHaveLength(1);
    expect(out[0].serial).toBe('adb-192.168.1.5:37891 (2)._adb-tls-connect._tcp');
    expect(out[0].state).toBe('device');
  });

  it('空输入返回空数组', () => {
    expect(parseAdbDevices('')).toEqual([]);
    expect(parseAdbDevices('List of devices attached\n')).toEqual([]);
  });
});

describe('extractDevtoolsSockets', () => {
  it('提取 webview/chrome devtools socket（去重）', () => {
    const procNet = [
      '0000000000000000: 00000002 00000000 00010000 00000001 0 1 5 @webview_devtools_remote_12345',
      '0000000000000000: 00000002 00000000 00010000 00000001 0 2 6 @chrome_devtools_remote',
      '0000000000000000: 00000002 00000000 00010000 00000001 0 3 7 @webview_devtools_remote_12345',
      '0000000000000000: 00000002 00000000 00010000 00000001 0 4 8 @com.example.app_devtools_remote',
      '0000000000000000: 00000002 00000000 00010000 00000001 0 5 9 @distributor',
    ].join('\n');
    expect(extractDevtoolsSockets(procNet)).toEqual([
      'webview_devtools_remote_12345',
      'chrome_devtools_remote',
      'com.example.app_devtools_remote',
    ]);
  });

  it('无 devtools socket 返回空数组', () => {
    expect(extractDevtoolsSockets('@distributor\n@jdwp-control')).toEqual([]);
    expect(extractDevtoolsSockets('')).toEqual([]);
  });
});

describe('formatCdpArgs', () => {
  it('string 直接取值', () => {
    expect(formatCdpArgs([{ type: 'string', value: 'hello' }])).toBe('hello');
  });

  it('number/boolean 序列化', () => {
    expect(formatCdpArgs([{ type: 'number', value: 42 }, { type: 'boolean', value: true }])).toBe('42 true');
  });

  it('object 取 description（JSON.stringify 失败的循环引用兜底）', () => {
    expect(formatCdpArgs([{ type: 'object', description: 'Object {a: 1}' }])).toBe('Object {a: 1}');
  });

  it('undefined 值取 type', () => {
    expect(formatCdpArgs([{ type: 'undefined' }])).toBe('undefined');
  });

  it('多参数空格拼接', () => {
    expect(formatCdpArgs([{ type: 'string', value: 'a' }, { type: 'number', value: 1 }])).toBe('a 1');
  });
});

describe('parseTargetKey', () => {
  it('合法 targetKey 拆出三段', () => {
    expect(parseTargetKey('ABC123|webview_devtools_remote_1|PAGE-ABCD')).toEqual({
      serial: 'ABC123',
      socket: 'webview_devtools_remote_1',
      targetId: 'PAGE-ABCD',
    });
  });

  it('targetId 本身可含分隔符外的内容（重组保护）', () => {
    expect(parseTargetKey('S|sk|a|b').targetId).toBe('a|b');
  });

  it('非法格式抛错并提示先调 device_webview_list', () => {
    expect(() => parseTargetKey('')).toThrow(/device_webview_list/);
    expect(() => parseTargetKey('only-serial')).toThrow(/device_webview_list/);
    expect(() => parseTargetKey('a|b')).toThrow(/device_webview_list/);
  });
});
