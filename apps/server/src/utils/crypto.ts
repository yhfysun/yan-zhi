// 密码加密工具 —— AES-256-GCM，主密钥存 app_config（首次随机生成、机器绑定）
// 桌面端 server 独立进程无法直接用 Electron safeStorage，统一用 node crypto AES-GCM，
// 密钥与 data.db 同目录绑定，安全性等同本地加密存储。
import crypto from 'node:crypto';
import { db } from '../db.js';

const KEY_CONFIG_KEY = 'saved_password_master_key';
let cachedKey: Buffer | null = null;

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
  return newKey;
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

/** 解密 iv:tag:ciphertext，返回明文 */
export function decrypt(payload: string): string {
  const key = getMasterKey();
  const parts = payload.split(':');
  if (parts.length !== 3) throw new Error('密文格式无效');
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}