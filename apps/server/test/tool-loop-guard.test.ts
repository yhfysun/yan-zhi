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
/**
 * 循环闸门**硬停**（2026-10-10 新增）：拦到阈值后带 FORCE_STOP_MARKER，调用方据此终止内层循环。
 *
 * 背景（实测）：server.log 里某会话 15 分钟内 6 次「循环拦截」
 * （browser_get_page_content×3 / browser_navigate×2 / browser_run_script×1），
 * 任务在「等超时 → 被拦 → 换参数再试」里空转，用户等不下去只能手动 abort。
 * 原实现「只拦不罚」压不住 —— 模型看到指引文本仍继续换花样试探。
 */
describe('循环闸门硬停（FORCE_STOP）', () => {
  it('★ 同一工具被拦到 TOOL_BLOCK_HARD_LIMIT 次后，返回串带 FORCE_STOP_MARKER', async () => {
    const { checkToolLoop: check, TOOL_BLOCK_HARD_LIMIT: LIMIT, FORCE_STOP_MARKER: MARK } =
      await import('../src/services/tool-loop-guard.js');
    const task = {};
    const seen: Array<string | null> = [];
    // 每次换参数（避开 A 线"同参"判定），但都让同名工具连续触发 → 走 B 线累计
    for (let i = 0; i < 40; i++) {
      seen.push(check(task, 'browser_run_script', { script: `return ${i}` }));
    }
    const blocked = seen.filter((s) => s)!;
    expect(blocked.length, '★ 应至少被拦一次').toBeGreaterThan(0);
    // 前 (LIMIT-1) 次拦截不带硬停标记
    const withoutMark = blocked.filter((s) => !String(s).startsWith(MARK));
    const withMark = blocked.filter((s) => String(s).startsWith(MARK));
    expect(withMark.length, `★ 拦到第 ${LIMIT} 次仍未硬停`).toBeGreaterThan(0);
    expect(withoutMark.length, '★ 硬停前应仍有"只拦不罚"的普通拦截').toBeGreaterThan(0);
    expect(String(withMark[0])).toContain('立即停止所有工具调用');
  });

  it('★ toolBlockCount 记录累计拦截次数（与滑动的历史窗口无关）', async () => {
    const { checkToolLoop: check, toolBlockCount } = await import('../src/services/tool-loop-guard.js');
    const task = {};
    expect(toolBlockCount(task, 'browser_x')).toBe(0);
    // 同参三次 → 第三次起被拦
    for (let i = 0; i < 3; i++) check(task, 'browser_x', { a: 1 });
    expect(toolBlockCount(task, 'browser_x')).toBe(1);
    // 继续同参 → 每次都拦，计数递增
    check(task, 'browser_x', { a: 1 });
    check(task, 'browser_x', { a: 1 });
    expect(toolBlockCount(task, 'browser_x')).toBe(3);
  });

  it('★ 硬停阈值常量与标记名稳定（调用方按标记名识别，改名会静默失效）', async () => {
    const m = await import('../src/services/tool-loop-guard.js');
    expect(m.TOOL_BLOCK_HARD_LIMIT).toBe(3);
    expect(m.FORCE_STOP_MARKER).toBe('[FORCE_STOP]');
  });
});
