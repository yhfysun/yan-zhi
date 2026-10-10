/**
 * 防失控循环闸门单测（2026-10-09）。
 * 背景：浏览器助手陷入"换脚本硬试不存在入口"的死循环（browser_run_script 几十连发），
 * 提示词压不住，须在 executeTool 漏斗代码级拦截 —— 本测试锁两条触发线与不误伤线。
 */
import { describe, it, expect } from 'vitest';
import { checkToolLoop, toolCallKey, TOOL_CONSEC_LIMIT, TOOL_DUP_LIMIT } from '../src/services/tool-loop-guard.js';

describe('tool-loop-guard 防失控循环闸门', () => {
  it('key 归一化：字段顺序不同 → 同 key；字段名不同 → 不同 key', () => {
    expect(toolCallKey('t', { a: 1, b: 2 })).toBe(toolCallKey('t', { b: 2, a: 1 }));
    expect(toolCallKey('t', { a: 1 })).not.toBe(toolCallKey('t', { c: 1 }));
    expect(toolCallKey('t1', { a: 1 })).not.toBe(toolCallKey('t2', { a: 1 }));
  });

  it('A线：同名同参第 3 次拦截（前 2 次放行，留瞬时重试余量）', () => {
    const task = {};
    const args = { script: 'return 1' };
    expect(checkToolLoop(task, 'browser_run_script', args)).toBeNull();
    expect(checkToolLoop(task, 'browser_run_script', args)).toBeNull();
    const blocked = checkToolLoop(task, 'browser_run_script', args);
    expect(blocked).toBeTruthy();
    expect(blocked).toContain('重复调用拦截');
  });

  it('A线：参数哪怕换一个字符也算新调用，不拦', () => {
    const task = {};
    for (let i = 0; i < TOOL_DUP_LIMIT + 1; i++) {
      expect(checkToolLoop(task, 'browser_run_script', { script: `return ${i}` })).toBeNull();
    }
  });

  it('B线：同一工具严格连续达上限即拦（脚本每次都不同也拦）', () => {
    const task = {};
    let last: string | null = null;
    for (let i = 0; i < TOOL_CONSEC_LIMIT; i++) {
      last = checkToolLoop(task, 'browser_run_script', { script: `document.querySelector('#x${i}')` });
    }
    expect(last).toBeTruthy();
    expect(last).toContain('循环失控拦截');
  });

  it('B线不误伤：批量正流程（run_script 与 file_write 交替）永不触发', () => {
    const task = {};
    for (let i = 0; i < 30; i++) {
      expect(checkToolLoop(task, 'browser_run_script', { script: `抓第${i}章` })).toBeNull();
      expect(checkToolLoop(task, 'file_write', { path: `novel/ch${i}.txt` })).toBeNull();
    }
  });

  it('B线：插入一次其他工具即重置连续计数', () => {
    const task = {};
    for (let i = 0; i < TOOL_CONSEC_LIMIT - 1; i++) {
      checkToolLoop(task, 'browser_run_script', { script: `s${i}` });
    }
    checkToolLoop(task, 'browser_screenshot', {});
    expect(checkToolLoop(task, 'browser_run_script', { script: 's-after' })).toBeNull();
  });

  it('历史窗口滑动：超窗口后的旧重复不再计入', () => {
    const task = {};
    const args = { script: 'return 1' };
    checkToolLoop(task, 'browser_run_script', args);
    checkToolLoop(task, 'browser_run_script', args);
    // 灌满窗口挤掉旧记录
    for (let i = 0; i < 20; i++) checkToolLoop(task, 'browser_screenshot', { i });
    expect(checkToolLoop(task, 'browser_run_script', args)).toBeNull();
  });

  it('不同任务（对象）历史互相隔离', () => {
    const t1 = {}; const t2 = {};
    checkToolLoop(t1, 'browser_run_script', { script: 'x' });
    checkToolLoop(t1, 'browser_run_script', { script: 'x' });
    expect(checkToolLoop(t2, 'browser_run_script', { script: 'x' })).toBeNull();
  });
});