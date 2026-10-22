/**
 * 授权弹窗失败归因：用户「停止」≠ 前端不可达（2026-10-21 修，根因）。
 *
 * ★ 现场（conv 6aaa59f5，live DB 侧证）：
 *   13:38:03 模型发 `cmd_exec`（dir /s /b …）→ 弹授权卡；
 *   13:38:54 用户点停止 → `abortTask()` 以 `DOMException('Aborted','AbortError')` reject 所有 pending；
 *   授权 catch 一律按「授权确认失败（前端不可达）：Aborted。…请稍后重试」回给模型。
 *   于是：用户明明点了停止，助手却说前端坏了，还劝模型重试；重试又被 abort ——
 *   界面上就是「同一个授权卡反复弹 / 一直卡着」。
 *
 * 本测试钉住：abort 必须被识别成 abort，其它错误才归为前端不可达。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isTaskAbort } from '../src/llm-task-manager.js';

describe('isTaskAbort：区分用户终止与前端故障', () => {
  it('DOMException AbortError（abortTask 的 reject 形态）→ true', () => {
    expect(isTaskAbort(new DOMException('Aborted', 'AbortError'))).toBe(true);
  });

  it('普通 Error 但 name=AbortError → true', () => {
    const e = new Error('whatever');
    e.name = 'AbortError';
    expect(isTaskAbort(e)).toBe(true);
  });

  it('message 恰为 Aborted 文案 → true', () => {
    expect(isTaskAbort(new Error('Aborted'))).toBe(true);
    expect(isTaskAbort('Aborted')).toBe(true);
  });

  it('信号已 abort → true（即使错误本身看不出）', () => {
    const ac = new AbortController();
    ac.abort();
    expect(isTaskAbort(new Error('socket hang up'), ac.signal)).toBe(true);
  });

  it('真·前端故障（超时/断连）→ false，仍按不可达处理', () => {
    expect(isTaskAbort(new Error('前端工具执行超时（120s）'))).toBe(false);
    expect(isTaskAbort(new Error('ECONNREFUSED'))).toBe(false);
    expect(isTaskAbort(null)).toBe(false);
  });

  it('★ 两处授权 catch 都必须先判 abort（不能被改回一律"前端不可达"）', () => {
    const src = readFileSync(resolve(__dirname, '..', 'src', 'llm-task-manager.ts'), 'utf8');
    const hits = src.match(/if \(isTaskAbort\(e, task\.abortController\.signal\)\)/g) || [];
    expect(hits.length, 'requestPathAuthorization / requestToolAuthorization 两处都要判').toBe(2);
    expect(src).toMatch(/任务已被用户终止，授权未完成/);
  });
});
