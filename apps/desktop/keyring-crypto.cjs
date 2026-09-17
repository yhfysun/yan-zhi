/**
 * Keyring 敏感值加密（纯逻辑，零依赖）。
 *
 * 为什么单独成文件而不是内联在 main.cjs：
 *   1) 兼容语义是这块最容易写错的地方 —— 「旧明文照常读」「密文解不开要显式失败」
 *      这两种分支在 Electron 真机上极难构造，必须能在单测里跑；
 *   2) safeStorage 由调用方注入，本模块不 require('electron')，因此裸 Node 可直接加载。
 *
 * 使用方：apps/desktop/main.cjs（CJS require）。
 * 打包：已列入 electron-builder 三份 yml 的 files 清单（漏登记会导致打包版启动即崩）。
 */

/** 加密值前缀。带此标记的才是 safeStorage 密文；无标记一律当明文（兼容旧文件）。 */
const KEYRING_ENC_PREFIX = 'enc:v1:';

/**
 * 这个键是否属于「敏感值」。
 *
 * 只加密真正的秘密，不无差别加密整个文件：settings:* 存的是主题、工作目录这类界面
 * 偏好，加密后无法人工排查配置问题，且每次读写都要过一遍 DPAPI。
 *   - license_code：授权码（绑机器，泄露价值低，但仍是凭证）
 *   - platform:<id>:apikey：上游 API Key（真正的秘密）
 */
function isSensitiveKeyringKey(key) {
  return key === 'license_code' || /^platform:.+:apikey$/.test(key);
}

/**
 * 加密明文值，返回带前缀的密文串；safeStorage 不可用或出错时返回 null（调用方降级明文）。
 *
 * 为什么要判断 isEncryptionAvailable：Linux 上缺 libsecret/gnome-keyring 时
 * encryptString 会**抛错**而不是返回密文。直接调会让「保存设置」整个失败，
 * 用户会表现为「API Key 存不进去、应用不可用」。
 */
function encryptKeyringValue(safeStorage, value) {
  if (typeof value !== 'string') return null;
  try {
    if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function') return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    return KEYRING_ENC_PREFIX + safeStorage.encryptString(value).toString('base64');
  } catch (e) {
    console.warn('[keyring] 加密失败，该值将以明文保存:', e && e.message ? e.message : e);
    return null;
  }
}

/**
 * 判断某存储值是否已是密文格式。
 *
 * 注意：**不能**用这个来决定「能不能当明文用」——判断没错但不够，
 * 真正的读取必须走 decryptKeyringValue。
 */
function isEncryptedKeyringValue(stored) {
  return typeof stored === 'string' && stored.startsWith(KEYRING_ENC_PREFIX);
}

/**
 * 解密存储值，返回 { ok, value, reason }。
 *
 * 为什么必须区分三种情况而不能返回裸值：
 *   1. 非密文（升级前的旧明文文件）→ 原样返回，老用户配置不丢；
 *   2. 密文解密成功 → 返回明文；
 *   3. 密文解密失败（换机器 / 换 Windows 账户 / 文件被拷走 / DPAPI 失效）→ ok:false。
 *
 * 第 3 种若当成「没有这个键」，用户会以为配置凭空消失；若把密文原样返回，
 * 那串 enc:v1:xxx 会被当 API Key 发到上游 → 401，且错误信息毫无指向性。
 * 所以显式标记失败，交给 IPC 层返回 null + 告警。
 */
function decryptKeyringValue(safeStorage, stored) {
  if (typeof stored !== 'string') return { ok: true, value: stored };
  if (!stored.startsWith(KEYRING_ENC_PREFIX)) return { ok: true, value: stored };

  const b64 = stored.slice(KEYRING_ENC_PREFIX.length);
  try {
    if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function') {
      return { ok: false, value: null, reason: 'safeStorage 未注入' };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, value: null, reason: 'safeStorage 当前不可用（缺系统密钥环）' };
    }
    return { ok: true, value: safeStorage.decryptString(Buffer.from(b64, 'base64')) };
  } catch (e) {
    return { ok: false, value: null, reason: e && e.message ? e.message : String(e) };
  }
}

module.exports = {
  KEYRING_ENC_PREFIX,
  isSensitiveKeyringKey,
  encryptKeyringValue,
  isEncryptedKeyringValue,
  decryptKeyringValue,
};