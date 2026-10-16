// 密码加密工具 —— AES-256-GCM，主密钥存 app_config（首次随机生成、机器绑定）
// 桌面端 server 独立进程无法直接用 Electron safeStorage，统一用 node crypto AES-GCM，
// 密钥与 data.db 同目录绑定，安全性等同本地加密存储。
import crypto from 'node:crypto';
import { db } from '../db.js';

const KEY_CONFIG_KEY = 'saved_password_master_key';
let cachedKey: Buffer | null = null;

export type DecryptFailureReason = 'format' | 'key-mismatch';

const FORMAT_MESSAGE = '凭证密文格式无效或已损坏（应为 iv:tag:ciphertext 三段 base64）。请重新填写该凭证。';

/**
 * 密钥不匹配时的文案。
 *
 * ★★★ 必须翻译，不能把 OpenSSL 原文抛给上层（2026-10-16 实据）：
 *   AES-GCM 是**认证加密**，密钥不对时 `decipher.final()` 不返回乱码，而是抛
 *   `Unsupported state or unable to authenticate data`。这句话对用户等于零信息 ——
 *   此前它被原样透传到运维连接弹窗的「测试连接」结果里（用户看到 `❌ Unsupported state…`
 *   根本无从下手）。实测成因只有一个：密文是用**另一份数据库的主密钥**加密的，典型是
 *   dev 库并入生产库时 `scripts/merge-dev-db.py` 逐表搬了数据行，而 `app_config` 的密钥行
 *   被 `INSERT OR IGNORE` 跳过（生产侧已有同名 key，冲突跳过），于是搬过来的密文用生产
 *   主密钥永远解不开。所以文案必须直接指向「重新填写」这个唯一可行动作。
 */
const KEY_MISMATCH_MESSAGE =
  '凭证解密失败：密文与当前主密钥不匹配，无法恢复。常见成因是数据来自另一份数据库'
  + '（例如开发库并入生产库时只搬了数据行、主密钥行被跳过），这类密文用本机主密钥永远解不开。'
  + '请重新填写该凭证。';

/** 解密失败。调用方若要分辨原因请读 `reason`，不要去匹配文案；原始错误保留在 `cause` 上。 */
export class CredentialDecryptError extends Error {
  readonly reason: DecryptFailureReason;
  constructor(reason: DecryptFailureReason, message: string, cause?: unknown) {
    super(message);
    this.name = 'CredentialDecryptError';
    this.reason = reason;
    if (cause !== undefined) (this as unknown as { cause?: unknown }).cause = cause;
  }
}

function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(KEY_CONFIG_KEY) as any;
  if (row?.value) {
    cachedKey = Buffer.from(row.value, 'base64');
    return cachedKey;
  }
  const newKey = crypto.randomBytes(32);
  db.prepare('INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)')
    .run(KEY_CONFIG_KEY, newKey.toString('base64'), Date.now());
  cachedKey = newKey;
  // ★ 全新库首次生成密钥是可预期的；但**库里已有加密数据而密钥行丢失**时，这里会静默换钥，
  //   把既有密文全部作废且不报错 —— 这是"迁移后密码没了"的第二条通路。故必须留痕，
  //   与 services/credential-audit.ts 的启动自检配合看。
  console.warn(
    '[crypto] app_config 中未找到 saved_password_master_key，已生成新主密钥。'
    + '若这是已有的库（而非全新安装），说明密钥行丢失，此前加密的所有凭证都将无法解密。',
  );
  return newKey;
}

/** 主密钥指纹（sha256 前 16 位 hex）。只用于诊断与跨库比对，不足以反推密钥。 */
export function masterKeyFingerprint(): string {
  return crypto.createHash('sha256').update(getMasterKey()).digest('hex').slice(0, 16);
}

/** 加密明文，返回 iv:tag:ciphertext（均 base64） */
export function encrypt(plain: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** 解密 iv:tag:ciphertext，返回明文；失败抛 CredentialDecryptError（含可行动文案）。 */
export function decrypt(payload: string): string {
  const key = getMasterKey();
  const parts = String(payload ?? '').split(':');
  if (parts.length !== 3) throw new CredentialDecryptError('format', FORMAT_MESSAGE);
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (e) {
    // IV / 认证标签长度不对 = 密文本身损坏；一路走到 final() 才失败 = 密钥不匹配。
    // 两者处置相同（都要重填），但分开报更利于排查。
    const msg = String((e as Error)?.message || e);
    const reason: DecryptFailureReason = /initialization vector|auth tag|Invalid/i.test(msg) ? 'format' : 'key-mismatch';
    throw new CredentialDecryptError(reason, reason === 'format' ? FORMAT_MESSAGE : KEY_MISMATCH_MESSAGE, e);
  }
}

/** 这段密文能否用当前主密钥解开（**不抛异常**）。自检与迁移校验用。 */
export function canDecrypt(payload: string): boolean {
  try {
    decrypt(payload);
    return true;
  } catch {
    return false;
  }
}
