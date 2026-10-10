/**
 * @vitest-environment jsdom
 *
 * 可见性感知轮询 —— 回归测试
 *
 * 背景（用户实报，2026-10-11）：
 *   「轮询？这个不是早就去掉了？…轮询效率肯定差啊」「轮询都去掉啊记得」
 *
 * 项目里仍有多处**必要轮询**（外部 IM 拉取 / 节点消息 / 运维指标 / 模型市场进度），
 * 它们暂时无法改成推送（服务端无对应通道）。但有个共同的浪费：
 *   **用户切到别的标签页/最小化时它们仍在跑** —— 白占主线程 + 网络 + 电池。
 *
 * 本工具的统一约定（本文件钉住）：
 *   ① 页面可见 → 按 interval 轮询；
 *   ② 页面隐藏 → **不安排下一次**（真正零唤醒，而不是"唤醒了再 return"）；
 *   ③ 恢复可见 → **立即补一次**（切回来数据就是新的，不用等一个周期）；
 *   ④ `runWhenHidden: true` 的场景（如心跳）即使隐藏也继续；
 *   ⑤ 停止函数必须能清干净定时器与监听器（不泄漏）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startVisiblePolling } from './visible-polling';

/** 简单可控的 visibilityState 替身 */
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('startVisiblePolling：可见性感知轮询', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    setHidden(false);
  });

  it('★ 可见时按 interval 轮询', () => {
    const fn = vi.fn();
    const stop = startVisiblePolling(fn, { intervalMs: 1000, immediate: false });
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
  });

  it('★ immediate=true（默认）挂载即执行一次', () => {
    const fn = vi.fn();
    const stop = startVisiblePolling(fn, { intervalMs: 1000 });
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    stop();
  });

  it('★★★ 隐藏时**不再唤醒**（零唤醒，不是"唤醒了再 return"）', () => {
    const fn = vi.fn();
    const stop = startVisiblePolling(fn, { intervalMs: 1000, immediate: false });
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);

    setHidden(true);                       // 转入隐藏
    vi.advanceTimersByTime(10000);         // 跑 10 个周期
    expect(fn, '★ 隐藏期间仍在轮询 → 白耗主线程/网络').toHaveBeenCalledTimes(1);
    stop();
  });

  it('★★★ **在隐藏状态下启动**也不得轮询（schedule 自身必须判隐藏，不能只靠 visibilitychange）', () => {
    const fn = vi.fn();
    setHidden(true);                       // ★ 先隐藏，再启动（不触发 visibilitychange 的清理路径）
    const stop = startVisiblePolling(fn, { intervalMs: 1000, immediate: false });
    vi.advanceTimersByTime(10000);
    expect(fn, '★ 隐藏时仍安排了定时器 → schedule 缺隐藏判定（白唤醒）').toHaveBeenCalledTimes(0);

    setHidden(false);                      // 恢复可见 → 应立刻补一次
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
    stop();
  });

  it('★★★ immediate=true 但在隐藏状态下启动时**不应立即执行**', () => {
    const fn = vi.fn();
    setHidden(true);
    const stop = startVisiblePolling(fn, { intervalMs: 1000, immediate: true });
    expect(fn, '★ 隐藏时仍立即跑了 → 无谓唤醒').toHaveBeenCalledTimes(0);
    stop();
  });

  it('★★★ 恢复可见时**立即补一次**（不用等一个周期）', () => {
    const fn = vi.fn();
    const stop = startVisiblePolling(fn, { intervalMs: 1000, immediate: false });
    setHidden(true);
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(0);

    setHidden(false);                      // 切回来
    expect(fn, '★ 恢复可见未立即补 → 用户要干等一个周期才看到新数据').toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);   // 之后恢复常规节奏
    stop();
  });

  it('★★ runWhenHidden=true 时隐藏也继续（心跳维持在线）', () => {
    const fn = vi.fn();
    const stop = startVisiblePolling(fn, { intervalMs: 1000, immediate: false, runWhenHidden: true });
    setHidden(true);
    vi.advanceTimersByTime(3000);
    expect(fn, '★ 心跳被可见性停掉 → 节点被判离线').toHaveBeenCalledTimes(3);
    stop();
  });

  it('★★★ stop() 必须清干净（不再 tick，也不留监听器）', () => {
    const fn = vi.fn();
    const stop = startVisiblePolling(fn, { intervalMs: 1000, immediate: false });
    vi.advanceTimersByTime(1000);
    const before = fn.mock.calls.length;
    stop();
    vi.advanceTimersByTime(10000);
    expect(fn, '★ 停止后仍在轮询 → 组件卸载后泄漏').toHaveBeenCalledTimes(before);
    // 隐藏→恢复也不应再触发（监听器已摘）
    setHidden(true);
    setHidden(false);
    expect(fn).toHaveBeenCalledTimes(before);
  });

  it('★ fn 抛异常不中断轮询（单次失败不该停掉整条链）', () => {
    let n = 0;
    const fn = vi.fn(() => {
      n++;
      if (n === 1) throw new Error('boom');
    });
    const stop = startVisiblePolling(fn, { intervalMs: 1000, immediate: false });
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
  });

  it('★ fn 返回 rejected Promise 同样不中断', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('async boom')));
    const stop = startVisiblePolling(fn, { intervalMs: 1000, immediate: false });
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
  });
});
