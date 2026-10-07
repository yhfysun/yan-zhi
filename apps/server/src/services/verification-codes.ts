// 短信验证码中继服务。
// ------------------------------------------------------------------
// 场景：桌面端需要短信验证码（登录/支付/二次校验），手机同网且移动端在运行。
// 链路：Android 端收到短信 → 提取验证码 → POST /api/verification-codes →
//       桌面端 UI 轮询最新一条（或 Agent 调 api_verification_code_latest）。
//
// 设计取舍（见 db.ts 建表注释）：
//   1) 落库 + TTL 过滤，不靠内存 Map（重启不丢、可回看最近几条）。
//   2) 验证码提取「尽力而为」：提不出时仍保留全文本体，人工可读。
//   3) 敏感信息：不写日志、不进 LLM 上下文（工具返回给模型时也只在用户明确要求时）。
//   4) 去重：同一验证码 + 同一短文本体在短时间内重复上报（部分 ROM 会重复派发广播）
//      只保留最新一条，避免桌面端看到一串重复。
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';

/** 默认有效期 5 分钟（多数验证码短信的有效期区间下限） */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;
/** 落库保留上限：超过则清理（避免旧码无限堆积） */
const MAX_KEEP = 200;

export interface VerificationCode {
  id: string;
  code: string;
  body: string;
  sender: string;
  source: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;
  /** 距过期的剩余毫秒（负数=已过期，读取侧已过滤，正常不会返回负数） */
  remainingMs: number;
}

/**
 * 从短信文本中提取验证码。
 * 规则（按优先级）：
 *   1) 「验证码/校验码/动态码/验证口令」等关键词后紧跟的 4-8 位数字（最常见格式）；
 *   2) 文本中独立的 4-8 位数字（排除看起来像手机号/年份/金额的长串）；
 *   3) 提不出 → 返回空串（调用方保留全文本体）。
 *
 * ★ 只做「尽力而为」的启发式，不追求 100% —— 提取失败时桌面端仍能看到全文人工读数。
 */
export function extractVerificationCode(text: string): string {
  const s = String(text || '').trim();
  if (!s) return '';

  // 1) 关键词 + 数字。中英文关键词都覆盖（国际短信 / 英文 App）。
  //    例：「您的验证码是 123456」「验证码：9876」「code: 4321」"[Code] 556677"
  const kw = /(?:验证码|校验码|动态码|验证口令|短信码|verification\s*code|verify\s*code|code|otp|pin)\D{0,8}(\d{4,8})/i;
  const m1 = s.match(kw);
  if (m1) return m1[1];

  // 2) 兜底：取全文里第一个 4-8 位独立数字串（两侧不能紧邻其他数字）。
  //    先剔除手机号/长数字（11 位及以上）以免把手机号当验证码。
  const stripped = s.replace(/\d{9,}/g, ' ');
  const m2 = stripped.match(/(?<!\d)(\d{4,8})(?!\d)/);
  if (m2) return m2[1];

  return '';
}

function rowToCode(r: any, now = Date.now()): VerificationCode {
  return {
    id: r.id,
    code: r.code,
    body: r.body || '',
    sender: r.sender || '',
    source: r.source || 'sms',
    deviceName: r.device_name || '',
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    remainingMs: Math.max(0, r.expires_at - now),
  };
}

/** 顺手清理：过期行 + 超过 MAX_KEEP 的旧行。删除失败不影响主流程。 */
function cleanup(now: number) {
  try {
    db.prepare('DELETE FROM verification_code WHERE expires_at < ?').run(now);
    db.prepare(
      `DELETE FROM verification_code WHERE id IN (
         SELECT id FROM verification_code ORDER BY created_at DESC LIMIT -1 OFFSET ?
       )`,
    ).run(MAX_KEEP);
  } catch { /* 清理失败无关紧要 */ }
}

export interface RecordVerificationInput {
  userId: string;
  /** 已提取的验证码；为空时由 body 现场提取 */
  code?: string;
  /** 短信全文本体 */
  body?: string;
  sender?: string;
  source?: string;
  deviceName?: string;
  ttlMs?: number;
}

/**
 * 记录一条验证码（移动端上报入口）。
 * 返回落库后的记录；若既无 code 又提不出（body 也空）→ 抛错。
 */
export function recordVerificationCode(input: RecordVerificationInput): VerificationCode {
  const now = Date.now();
  const body = String(input.body || '').trim();
  const code = (String(input.code || '').trim() || extractVerificationCode(body)).slice(0, 16);
  if (!code) throw new Error('未能提取验证码（code 与 body 均为空）');

  const ttl = Math.min(Math.max(Number(input.ttlMs) || DEFAULT_TTL_MS, 10_000), 30 * 60 * 1000);
  const expiresAt = now + ttl;

  // 去重：同 user + 同 code + 同 body 且仍在有效期内 → 只刷新时间，不新增行。
  // 依据：部分 ROM 会把同一条短信派发多次广播，或因 App 重启重放最近短信。
  const dup = db.prepare(
    'SELECT * FROM verification_code WHERE user_id = ? AND code = ? AND COALESCE(body, \'\') = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
  ).get(input.userId, code, body, now) as any;
  if (dup) {
    db.prepare('UPDATE verification_code SET expires_at = ?, created_at = ? WHERE id = ?').run(expiresAt, now, dup.id);
    cleanup(now);
    return rowToCode(db.prepare('SELECT * FROM verification_code WHERE id = ?').get(dup.id), now);
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO verification_code
      (id, user_id, code, body, sender, source, device_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.userId, code, body || null, input.sender || null, input.source || 'sms', input.deviceName || null, now, expiresAt);

  cleanup(now);
  return rowToCode(db.prepare('SELECT * FROM verification_code WHERE id = ?').get(id), now);
}

/** 取最新一条未过期验证码；没有则返回 null。 */
export function getLatestVerificationCode(userId: string): VerificationCode | null {
  const now = Date.now();
  const row = db.prepare(
    'SELECT * FROM verification_code WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
  ).get(userId, now) as any;
  return row ? rowToCode(row, now) : null;
}

/** 列出最近未过期验证码（默认 10 条），供 UI 回看。 */
export function listVerificationCodes(userId: string, limit = 10): VerificationCode[] {
  const now = Date.now();
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const rows = db.prepare(
    'SELECT * FROM verification_code WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT ?',
  ).all(userId, now, safeLimit) as any[];
  return rows.map((r) => rowToCode(r, now));
}

/** 清空（用户手动「清除」时用）。返回删除行数。 */
export function clearVerificationCodes(userId: string): number {
  const r = db.prepare('DELETE FROM verification_code WHERE user_id = ?').run(userId);
  return r.changes || 0;
}

// ===== 设备配对令牌 =====
// 为什么需要：验证码上报接口必须验一验「是谁在报」，否则同网任何设备都能往里灌数据。
// 本节点是本地单用户（auth 恒 guest），没有账号体系可依托，所以用一个自签的随机令牌，
// 桌面端生成、展示给用户，用户手动填进移动端一次即完成配对。
// ★ 存 app_config（与平台无关的全局配置表），不存内存 —— 重启后移动端不必重新配对。
const PAIR_KEY = 'verification_code_pair_token';

/** 取（首次自动生成）配对令牌。 */
export function getOrCreatePairToken(): string {
  try {
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get(PAIR_KEY) as { value?: string } | undefined;
    if (row?.value && row.value.length >= 8) return row.value;
  } catch { /* 表未就绪时走生成分支 */ }
  return resetPairToken();
}

/** 重新生成配对令牌（用户「重新配对」时用），旧令牌立即失效。 */
export function resetPairToken(): string {
  const token = uuid().replace(/-/g, '') + Math.random().toString(36).slice(2, 10);
  try {
    db.prepare('INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)').run(PAIR_KEY, token, Date.now());
  } catch { /* 忽略：极端情况下才失败 */ }
  return token;
}

/** 校验上报方令牌。恒定长度比对，避免早退带来的时序侧信道（虽在本机场景意义有限）。 */
export function verifyPairToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = getOrCreatePairToken();
  const a = String(token);
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}