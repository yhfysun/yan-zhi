/**
 * 授权码加载单测。
 *
 * 为什么值得测（2026-10-12 线上故障）：安装版冷启动后用户看到「历史记录全没了」，
 * 实际根因是 keyring 首次异步读取失败时，旧实现把 `loadedFromStore` 连同
 * `memoryCode=null` 一起钉死 → 之后所有调用直接返回 null 永不重试 →
 * 整场拿不到授权码 → 所有业务请求 403（agents/conversations/spaces 静默变空）。
 *
 * 这类故障**不报错**，只是数据悄悄不见，极难排查。所以把「失败可重试」钉死在这里。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── mock 平台适配器：keyring 读写可控 ──
let keyringStore: Record<string, string> = {};
let keyringShouldThrow = false;
const keyringSetSpy = vi.fn(async (k: string, v: string) => { keyringStore[k] = v; });
const keyringGetSpy = vi.fn(async (k: string) => {
  if (keyringShouldThrow) throw new Error('keyring 服务未就绪');
  return keyringStore[k] ?? null;
});
const keyringDeleteSpy = vi.fn(async (k: string) => { delete keyringStore[k]; });

vi.mock('@yan-zhi/core', () => ({
  getPlatformAdapter: () => ({
    keyring: {
      get: (...a: unknown[]) => keyringGetSpy(...(a as [string])),
      set: (...a: unknown[]) => keyringSetSpy(...(a as [string, string])),
      delete: (...a: unknown[]) => keyringDeleteSpy(...(a as [string])),
    },
  }),
}));

import {
  loadLicenseCode,
  getLicenseCodeSync,
  setLicenseCodeSync,
  persistLicenseCode,
  clearLicenseCode,
  resetLicenseCodeCacheForTest,
} from './license-code';

const STORAGE_KEY = 'license_code';
const LEGACY_KEY = 'license_code';
const CODE = 'eyJleHBpcmVBdCI6IjIwMjctMDEtMDEifQ==.SIG';

describe('loadLicenseCode · 授权码加载', () => {
  beforeEach(() => {
    keyringStore = {};
    keyringShouldThrow = false;
    keyringSetSpy.mockClear();
    keyringGetSpy.mockClear();
    keyringDeleteSpy.mockClear();
    localStorage.clear();
    resetLicenseCodeCacheForTest();
  });
  afterEach(() => {
    localStorage.clear();
    resetLicenseCodeCacheForTest();
  });

  it('keyring 有码时读出并填充同步缓存', async () => {
    keyringStore[STORAGE_KEY] = CODE;
    expect(await loadLicenseCode()).toBe(CODE);
    // 同步缓存也要就绪：请求头构造是同步的，等不到异步 IO
    expect(getLicenseCodeSync()).toBe(CODE);
  });

  it('★ keyring 读失败后【不钉死】—— 下次调用会重试（2026-10-12 回归点）', async () => {
    keyringShouldThrow = true;
    expect(await loadLicenseCode()).toBeNull();
    // 修复前：这里 loadedFromStore 已被钉成 true，下面直接返回 null
    keyringShouldThrow = false;
    keyringStore[STORAGE_KEY] = CODE;
    expect(await loadLicenseCode()).toBe(CODE);
    expect(getLicenseCodeSync()).toBe(CODE);
  });

  it('★ keyring 返回空但没抛异常时同样不钉死（冷启动主进程未注入的另一种形态）', async () => {
    expect(await loadLicenseCode()).toBeNull(); // keyringStore 为空
    keyringStore[STORAGE_KEY] = CODE;
    expect(await loadLicenseCode()).toBe(CODE);
  });

  it('成功加载后走内存缓存，不再重复读 keyring（热路径零 IPC）', async () => {
    keyringStore[STORAGE_KEY] = CODE;
    await loadLicenseCode();
    const n = keyringGetSpy.mock.calls.length;
    expect(await loadLicenseCode()).toBe(CODE);
    expect(keyringGetSpy.mock.calls.length).toBe(n);
  });

  it('keyring 无码但 localStorage 有旧码 → 迁移进 keyring 并清掉明文', async () => {
    localStorage.setItem(LEGACY_KEY, CODE);
    expect(await loadLicenseCode()).toBe(CODE);
    expect(keyringSetSpy).toHaveBeenCalledWith(STORAGE_KEY, CODE);
    // 明文必须清掉，否则这次迁移白做
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('keyring 写失败时迁移不阻塞：继续用 localStorage 明文兜底', async () => {
    keyringSetSpy.mockImplementationOnce(async () => { throw new Error('磁盘只读'); });
    localStorage.setItem(LEGACY_KEY, CODE);
    expect(await loadLicenseCode()).toBe(CODE);
    expect(getLicenseCodeSync()).toBe(CODE);
  });

  it('persistLicenseCode 后同步缓存立即生效（激活即时可用）', async () => {
    await persistLicenseCode(CODE);
    expect(getLicenseCodeSync()).toBe(CODE);
    expect(keyringStore[STORAGE_KEY]).toBe(CODE);
  });

  it('clearLicenseCode 清掉 keyring 与缓存', async () => {
    keyringStore[STORAGE_KEY] = CODE;
    await loadLicenseCode();
    await clearLicenseCode();
    expect(getLicenseCodeSync()).toBeNull();
    expect(keyringStore[STORAGE_KEY]).toBeUndefined();
  });

  it('setLicenseCodeSync 手动置 null 后同步读回落 localStorage', async () => {
    localStorage.setItem(LEGACY_KEY, CODE);
    setLicenseCodeSync(null);
    expect(getLicenseCodeSync()).toBe(CODE);
  });
});
