/**
 * 防失控循环闸门单测（2026-10-09）。
 * 背景：浏览器助手陷入"换脚本硬试不存在入口"的死循环（browser_run_script 几十连发），
 * 提示词压不住，须在 executeTool 漏斗代码级拦截 —— 本测试锁两条触发线与不误伤线。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkToolLoop, toolCallKey, TOOL_CONSEC_LIMIT, TOOL_DUP_LIMIT } from '../src/services/tool-loop-guard.js';

describe('tool-loop-guard 防失控循环闸门', () => {
  it('key 归一化：字段顺序不同 → 同 key；字段名不同 → 不同 key', () => {
    assert.equal(toolCallKey('t', { a: 1, b: 2 }), toolCallKey('t', { b: 2, a: 1 }));
    assert.notEqual(toolCallKey('t', { a: 1 }), toolCallKey('t', { c: 1 }));
    assert.notEqual(toolCallKey('t1', { a: 1 }), toolCallKey('t2', { a: 1 }));
  });

  it('A线：同名同参第 3 次拦截（前 2 次放行，留瞬时重试余量）', () => {
    const task = {};
    const args = { script: 'return 1' };
    assert.equal(checkToolLoop(task, 'browser_run_script', args), null);
    assert.equal(checkToolLoop(task, 'browser_run_script', args), null);
    const blocked = checkToolLoop(task, 'browser_run_script', args);
    assert.ok(blocked && blocked.includes('重复调用拦截'));
  });

  it('A线：参数哪怕换一个字符也算新调用，不拦', () => {
    const task = {};
    for (let i = 0; i < TOOL_DUP_LIMIT + 1; i++) {
      assert.equal(checkToolLoop(task, 'browser_run_script', { script: `return ${i}` }), null);
    }
  });

  it('B线：同一工具严格连续达上限即拦（脚本每次都不同也拦）', () => {
    const task = {};
    let last: string | null = null;
    for (let i = 0; i < TOOL_CONSEC_LIMIT; i++) {
      last = checkToolLoop(task, 'browser_run_script', { script: `document.querySelector('#x${i}')` });
    }
    assert.ok(last && last.includes('循环失控拦截'));
  });

  it('B线不误伤：批量正流程（run_script 与 file_write 交替）永不触发', () => {
    const task = {};
    for (let i = 0; i < 30; i++) {
      assert.equal(checkToolLoop(task, 'browser_run_script', { script: `抓第${i}章` }), null);
      assert.equal(checkToolLoop(task, 'file_write', { path: `novel/ch${i}.txt` }), null);
    }
  });

  it('B线：插入一次其他工具即重置连续计数', () => {
    const task = {};
    for (let i = 0; i < TOOL_CONSEC_LIMIT - 1; i++) {
      checkToolLoop(task, 'browser_run_script', { script: `s${i}` });
    }
    checkToolLoop(task, 'browser_screenshot', {});
    assert.equal(checkToolLoop(task, 'browser_run_script', { script: 's-after' }), null);
  });

  it('历史窗口滑动：超窗口后的旧重复不再计入', () => {
    const task = {};
    const args = { script: 'return 1' };
    checkToolLoop(task, 'browser_run_script', args);
    checkToolLoop(task, 'browser_run_script', args);
    // 灌满窗口挤掉旧记录
    for (let i = 0; i < 20; i++) checkToolLoop(task, 'browser_screenshot', { i });
    assert.equal(checkToolLoop(task, 'browser_run_script', args), null);
  });

  it('不同任务（对象）历史互相隔离', () => {
    const t1 = {}; const t2 = {};
    checkToolLoop(t1, 'browser_run_script', { script: 'x' });
    checkToolLoop(t1, 'browser_run_script', { script: 'x' });
    assert.equal(checkToolLoop(t2, 'browser_run_script', { script: 'x' }), null);
  });
});
