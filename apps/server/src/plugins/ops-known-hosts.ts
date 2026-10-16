// 主机密钥校验（known_hosts / TOFU）。
//
// 为什么必须有：ssh2 默认**宽松接受任何主机密钥** —— 中间人可以把自己插进你和服务器
// 之间，你看到的终端、录像、跳板隧道全都不可信。SSH 的信任根就是这把主机密钥。
//
// 策略（mode）：
//   tofu（默认）—— 首次见到即记录（Trust On First Use），之后每次连接必须一致。
//                  这是升级现有用户的唯一可行路径：没有它，所有老连接都会立刻连不上。
//   strict      —— 未知主机也拒绝，只认已记录的（需要先手工导入）。
//   off         —— 完全不校验，恢复旧行为（给自建测试环境留的逃生口）。
//
// 指纹用 OpenSSH 口径（SHA256:base64），这样用户能直接和 `ssh-keygen -lf` 的输出对照。
import { createHash } from 'node:crypto';

export type KnownHostMode = 'tofu' | 'strict' | 'off';

export interface HostKeyRecord {
  /** host:port —— 跳板机与目标各自独立记录，每一跳都单独校验 */
  host: string;
  /** 密钥类型，如 ssh-ed25519 / ssh-rsa */
  keyType: string;
  /** OpenSSH 风格指纹：SHA256:xxxx */
  fingerprint: string;
  /** 原始公钥（base64），便于今后换算法时再做比对 */
  keyB64: string;
  firstSeenAt: number;
  lastSeenAt: number;
}

/** 连接的 host:port 标识（端口缺省按 22） */
export function hostPortOf(host: string, port?: number): string {
  return `${host}:${port || 22}`;
}

/**
 * 从 SSH 公钥 blob 里取出密钥类型。
 * 线上格式是 `uint32 len + "ssh-ed25519" + ...`；解析失败不该影响校验本身，返回 unknown。
 */
export function parseKeyType(blob: Buffer): string {
  try {
    if (blob.length < 4) return 'unknown';
    const len = blob.readUInt32BE(0);
    if (len <= 0 || len > blob.length - 4) return 'unknown';
    return blob.subarray(4, 4 + len).toString('utf8') || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** OpenSSH 风格指纹：SHA256: + base64(sha256(blob))，去掉 base64 末尾的 '=' 填充 */
export function fingerprintOf(blob: Buffer): string {
  const b64 = createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
  return `SHA256:${b64}`;
}

/** 由原始公钥构造一条待记录/比对的记录 */
export function recordFor(host: string, blob: Buffer, now = Date.now()): HostKeyRecord {
  return {
    host,
    keyType: parseKeyType(blob),
    fingerprint: fingerprintOf(blob),
    keyB64: blob.toString('base64'),
    firstSeenAt: now,
    lastSeenAt: now,
  };
}

export type VerifyOutcome =
  /** 与已记录的一致 */
  | { status: 'match'; record: HostKeyRecord }
  /** TOFU 首次见到（调用方应把它记下来） */
  | { status: 'new'; record: HostKeyRecord }
  /** 密钥变了 —— 调用方必须拒绝，并把两个指纹报给用户 */
  | { status: 'changed'; keyType: string; expected: string; actual: string }
  /** 未校验（mode=off，或 strict 下遇到未知主机） */
  | { status: 'skipped' };

/**
 * 纯函数决策：给定「已记录的那条（可能没有）」+ 本次拿到的公钥，判断放行与否。
 * 不做任何 IO —— 记录由调用方负责持久化。
 */
export function verifyHostKey(
  known: HostKeyRecord | undefined,
  host: string,
  blob: Buffer,
  mode: KnownHostMode,
  now = Date.now(),
): VerifyOutcome {
  if (mode === 'off') return { status: 'skipped' };
  const record = recordFor(host, blob, now);
  if (!known) {
    // strict 下未知主机不放行（skipped 也要靠调用方拒绝，见 shouldRejectUnknown）
    return mode === 'strict' ? { status: 'skipped' } : { status: 'new', record };
  }
  if (known.keyB64 === record.keyB64) {
    return { status: 'match', record: { ...record, firstSeenAt: known.firstSeenAt } };
  }
  return { status: 'changed', keyType: record.keyType, expected: known.fingerprint, actual: record.fingerprint };
}

/**
 * 该结论是否允许继续连接。
 * 注意 strict + 未知主机会走到这里：调用方必须用 `mode` 再判一次，所以这里显式收 mode。
 */
export function outcomeAllows(o: VerifyOutcome, mode: KnownHostMode): boolean {
  if (o.status === 'changed') return false;
  if (o.status === 'skipped') return mode !== 'strict';
  return true;
}

/**
 * 密钥变更时的报错文案。要给出**可行动**的信息：两个指纹 + 怎么处理。
 * 只说「主机密钥不匹配」等于把用户卡死 —— 他既不知道是不是被攻击，也不知道怎么恢复。
 */
export function mismatchMessage(host: string, o: Extract<VerifyOutcome, { status: 'changed' }>): string {
  return [
    `主机密钥校验失败：${host} 的主机密钥已变更。`,
    `  已记录：${o.expected}`,
    `  本次收到：${o.keyType} ${o.actual}`,
    '可能是服务器重装 / 换了机器，也可能是中间人攻击。',
    '若确认是合法变更，请到「运维 → 主机密钥」页删除该主机记录后重连。',
  ].join('\n');
}

/** strict 模式下未知主机的报错文案 */
export function unknownHostMessage(host: string, blob: Buffer): string {
  return `主机密钥校验失败：${host} 不在已记录的主机列表中（当前为 strict 模式）。\n  本次收到：${parseKeyType(blob)} ${fingerprintOf(blob)}`;
}
