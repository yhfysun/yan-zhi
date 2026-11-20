import { describe, expect, it } from 'vitest';
import { actionToBrowserToolName, toolNameToAction } from '../src/browser-bridge.js';

describe('浏览器桥 action 映射', () => {
  it('把服务端 action 映射为桥工具名', () => {
    expect(actionToBrowserToolName('navigate')).toBe('browser_navigate');
    expect(actionToBrowserToolName('click')).toBe('browser_click');
    expect(actionToBrowserToolName('press')).toBe('browser_press_key');
    expect(actionToBrowserToolName('get_debug_state')).toBe('browser_get_debug_state');
  });

  it('与工具名到 action 的映射保持可逆', () => {
    for (const action of ['navigate', 'click', 'press', 'get_debug_state', 'get_page_capabilities']) {
      expect(toolNameToAction(actionToBrowserToolName(action))).toBe(action);
    }
  });
});
