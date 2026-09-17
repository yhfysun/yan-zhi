// 授权码的内存缓存 + 安全持久化。
//
// 为什么需要这个模块：授权码原先存 localStorage（明文，同机任意脚本可读）。改存
// keyring（桌面端底层是 DPAPI/Keychain）后读写都变成异步，但 `buildRequestHeaders()`
// 必须在发请求的瞬间同步拿到它 —— 它被所有直连请求（SSE 流、终端流）调用。
//
// 所以做成两级：**异步持久化到 keyring + 同步内存缓存供请求头读取**。
// 内存缓存由 useLicenseStore 在启动时填充（路由守卫里 init() 必然先跑），
// 请求发出时缓存已就绪。localStorage 仅作迁移期兜底。
import { getPlatformAdapter } from '@yan-zhi/core';

const STORAGE_KEY = 'license_code';
const LEGACY_LOCALSTORAGE_KEY = 'license_code';

let memoryCode: string | null = null;
/** 是否已从 keyring 读过一次。避免 init 被调多次时重复 IO。 */
let loadedFromStore = false;

/** 同步取码。请求头构造用这个 —— 不等待 IO。 */
export function getLicenseCodeSync(): string | null {
  if (memoryCode !== null) return memoryCode;
  // 缓存未就绪时兜底读 localStorage：兼容首次启动 init 尚未完成就发出请求的情况，
  // 以及迁移前就已激活的老用户（其码还在 localStorage 里）。
  try {
    return localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  } catch {
    return null;
  }
}

/** 更新内存缓存（激活/停用后调用）。 */
export function setLicenseCodeSync(code: string | null): void {
  memoryCode = code;
}

/** 从 keyring 载入并填充缓存；顺带把 localStorage 里的旧码迁移过来。
 *
 * 迁移逻辑：keyring 里没有、localStorage 里有 → 写入 keyring 并清掉 localStorage 副本。
 * 清掉是必须的，否则明文副本一直留在 localStorage，这次迁移就白做了。
 * 返回最终生效的码（可能为 null）。 */
export async function loadLicenseCode(): Promise<string | null> {
  if (loadedFromStore) return memoryCode;
  let stored: string | null = null;
  try {
    stored = await getPlatformAdapter().keyring.get(STORAGE_KEY);
  } catch {
    // keyring 不可用（未注入/初始化失败）时退回 localStorage，保证应用仍可用
  }

  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  } catch {
    legacy = null;
  }

  if (!stored && legacy) {
    // 老用户的码：先落到 keyring，成功后再删本地明文
    try {
      await getPlatformAdapter().keyring.set(STORAGE_KEY, legacy);
      try {
        localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
      } catch {
        // 清理失败不影响功能，下次启动会再试
      }
      stored = legacy;
    } catch {
      stored = legacy; // 迁移失败则继续用明文，不让用户掉授权
    }
  }

  memoryCode = stored;
  loadedFromStore = true;
  return memoryCode;
}

/** 持久化授权码（激活时）。同时更新内存缓存。 */
export async function persistLicenseCode(code: string): Promise<void> {
  memoryCode = code;
  loadedFromStore = true;
  try {
    await getPlatformAdapter().keyring.set(STORAGE_KEY, code);
    try {
      localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
    } catch {
      // 忽略：本地副本清理失败不影响授权生效
    }
  } catch {
    // keyring 写入失败（如 Web 端配额满）时退回 localStorage，保证本次会话可用
    try {
      localStorage.setItem(LEGACY_LOCALSTORAGE_KEY, code);
    } catch {
      // 两者都写不进：内存缓存仍持有本次会话的码，不阻断使用
    }
  }
}

/** 清除授权码（停用/校验失败时）。 */
export async function clearLicenseCode(): Promise<void> {
  memoryCode = null;
  loadedFromStore = true;
  try {
    await getPlatformAdapter().keyring.delete(STORAGE_KEY);
  } catch {
    // 忽略：删不掉也不该阻断停用流程
  }
  try {
    localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
  } catch {
    // 忽略
  }
}

/** 仅供测试：复位模块级状态。 */
export function resetLicenseCodeCacheForTest(): void {
  memoryCode = null;
  loadedFromStore = false;
}