import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACK_SIGNAL_COALESCE_MS, createHistoryBackGuard } from './back-navigation';

describe('Android 预测返回去重', () => {
  it('WebView 历史回退后忽略同一手势触发的原生 backButton', () => {
    let now = 1000;
    const guard = createHistoryBackGuard(() => now);

    guard.noteHistoryPop();
    now += 120;

    expect(guard.shouldIgnoreNativeBack()).toBe(true);
  });

  it('去重窗口结束后，后续独立返回操作必须重新交给应用处理', () => {
    let now = 1000;
    const guard = createHistoryBackGuard(() => now);

    guard.noteHistoryPop();
    now += BACK_SIGNAL_COALESCE_MS + 1;

    expect(guard.shouldIgnoreNativeBack()).toBe(false);
  });

  it('连续历史回退会刷新去重时间', () => {
    let now = 1000;
    const guard = createHistoryBackGuard(() => now);

    guard.noteHistoryPop();
    now += 600;
    guard.noteHistoryPop();
    now += 600;

    expect(guard.shouldIgnoreNativeBack()).toBe(true);
  });

  it('Android 工程的预处理脚本显式启用预测返回回调', () => {
    const patchScript = readFileSync(
      resolve(__dirname, '../scripts/apply-native-permissions.cjs'),
      'utf8',
    );

    expect(patchScript).toContain('android:enableOnBackInvokedCallback');
    expect(patchScript).toContain('android:enableOnBackInvokedCallback="true"');
  });
});
