import { describe, expect, it } from 'vitest';
import {
  buildPowerShellFileArgs,
  buildWindowsUiActionScript,
  buildWindowsUiTreeScript,
  parseUiActionOutput,
  uiTreeRevision,
  type UiNode,
} from '../src/plugins/computer-ui';

describe('computer UI Automation helpers', () => {
  it('passes a PowerShell script path as one argv without literal quotes', () => {
    const file = 'C:\\Users\\test user\\AppData\\Local\\Temp\\yz-cu.ps1';
    const args = buildPowerShellFileArgs(file);
    expect(args).toEqual([
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', file,
    ]);
    expect(args.at(-1)).not.toContain('"');
  });

  it('generates a bounded UIA tree script with stable refs and revision', () => {
    const script = buildWindowsUiTreeScript({ pid: 42, titleContains: '记事本', maxDepth: 99, maxNodes: 9999 });
    expect(script).toContain('UIAutomationClient');
    expect(script).toContain('GetRuntimeId');
    expect(script).toContain('maxDepth');
    expect(script).toContain('revision');
    expect(script).not.toContain('"maxNodes":9999');
  });

  it('generates semantic click/set-value script with coordinate fallback', () => {
    const script = buildWindowsUiActionScript({
      action: 'click',
      pid: 42,
      ref: 'uia:1.2.3',
    });
    expect(script).toContain('InvokePattern');
    expect(script).toContain('ValuePattern');
    expect(script).toContain('coordinate-fallback');
    expect(script).toContain('SetCursorPos');
  });

  it('parses UIA JSON and keeps actionable errors', () => {
    expect(parseUiActionOutput('{"ok":true,"method":"InvokePattern"}')).toMatchObject({
      ok: true,
      method: 'InvokePattern',
    });
    expect(parseUiActionOutput('未找到匹配元素')).toEqual({ error: '未找到匹配元素' });
  });

  it('revision changes when the semantic tree changes', () => {
    const base: UiNode = {
      ref: 'uia:1', runtimeId: '1', name: '保存', automationId: 'save',
      controlType: 'Button', className: 'Button', value: '', depth: 1,
      enabled: true, offscreen: false, keyboardFocusable: true, focused: false,
      x: 10, y: 20, width: 80, height: 30,
    };
    expect(uiTreeRevision([base])).not.toBe(uiTreeRevision([{ ...base, name: '发布' }]));
    expect(uiTreeRevision([base])).not.toBe(uiTreeRevision([{ ...base, value: 'hello' }]));
  });
});
