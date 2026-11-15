/**
 * M1（MIFARE Classic 1K）门禁卡复制 · 教学内核
 *
 * ★ 定位：纯数据模型，不接触任何 NFC 硬件、不发射频命令、不加载外部字典。
 *   课程模拟器与真机适配层**共用本文件**：
 *     - 模拟器：注入 m1AuthenticatorFromImage / m1ReaderFromImage / m1WriterFromDump
 *     - 真机：注入 Android 插件 / PC-SC 读卡器实现的同名端口
 *   ⇒ 「哪些扇区可读、哪些块可写、复制是否算成功」只有这一处判定。
 *
 * ★ 合规边界：本内核只处理**自有或已授权卡**的教学与安全自查。
 *   内置字典只含公开的出厂默认值，用于检查「是否忘了改默认密钥」；
 *   不内置厂商私有密钥库，不提供抓包/嵌套认证等恢复未知密钥的能力。
 *
 * ★ 所有示例数据均为虚构（DEMO 前缀），不含任何真实卡号或真实门禁数据。
 */

export const M1_SECTOR_COUNT_1K = 16;
export const M1_BLOCKS_PER_SECTOR = 4;
export const M1_BLOCK_BYTES = 16;
export const M1_KEY_BYTES = 6;
export const M1_TRAILER_BLOCK = 3;
export const M1_DEFAULT_MAX_ATTEMPTS = 512;

export type M1KeySlot = 'A' | 'B';
export type M1CardPolicy = 'default' | 'weak' | 'strong';
export type M1TargetKind = 'normal' | 'uid-writable';

export type M1KeyCandidate = {
  key: string;
  label: string;
  origin: 'builtin' | 'custom';
};

/**
 * 公开的出厂/常见默认密钥。
 * ★ 只用于「自己的卡是不是还在用出厂密钥」的自查，不是攻击字典。
 */
export const M1_PUBLIC_DEFAULT_KEYS: readonly M1KeyCandidate[] = [
  { key: 'FFFFFFFFFFFF', label: '出厂默认密钥', origin: 'builtin' },
  { key: '000000000000', label: '全零密钥', origin: 'builtin' },
  { key: 'A0A1A2A3A4A5', label: '公开测试密钥 A', origin: 'builtin' },
  { key: 'B0B1B2B3B4B5', label: '公开测试密钥 B', origin: 'builtin' },
  { key: 'D3F7D3F7D3F7', label: '公开测试密钥 C', origin: 'builtin' },
  { key: '123456789ABC', label: '顺序弱密钥', origin: 'builtin' },
];

export type M1SectorState = {
  index: number;
  keyA: string;
  keyB: string;
  accessBits: string;
  blocks: string[];
};

export type M1CardImage = {
  uid: string;
  bcc: string;
  sak: string;
  atqa: string;
  sectorCount: number;
  sectors: M1SectorState[];
};

export type M1Keybook = {
  /** 是否纳入内置公开默认值 */
  useBuiltin: boolean;
  /** 用户自定义密码本（每行一个 6 字节 hex） */
  customKeys: string[];
};

export type M1RecoverOptions = {
  keybook: M1Keybook;
  /** 认证尝试总次数上限：防止字典过大把读卡流程拖死 */
  maxAttempts?: number;
  /** 每次尝试后的进度回调，返回 false 可提前中止（用户点「停止」） */
  onAttempt?: (attempt: number, sector: number, key: string, slot: M1KeySlot) => boolean | void;
};

export type M1SectorKeyResult = {
  sector: number;
  key: string | null;
  slot: M1KeySlot | null;
  attempts: number;
  hitBy: M1KeyCandidate['origin'] | null;
  hitLabel: string | null;
};

export type M1RecoverResult = {
  sectors: M1SectorKeyResult[];
  totalAttempts: number;
  capped: boolean;
  recovered: number;
  /** 未恢复扇区索引，复制流程据此判定 dump 不完整 */
  unreadableSectors: number[];
};

export type M1DumpBlock = string | null;
export type M1Dump = {
  uid: string;
  bcc: string;
  sak: string;
  atqa: string;
  sectorCount: number;
  /** 1K 卡共 64 块；未恢复扇区的块为 null */
  blocks: M1DumpBlock[];
  /** 每扇区实际用于读取的密钥，写回扇区尾时需要 */
  keys: Array<{ key: string | null; slot: M1KeySlot | null }>;
};

export type M1WritePlan = {
  targetKind: M1TargetKind;
  /** 可写入的块下标 */
  writable: number[];
  /** 被跳过的块及原因 */
  skipped: Array<{ block: number; reason: 'uid-read-only' | 'no-key' | 'empty-block' }>;
};

export type M1VerifyResult = {
  ok: boolean;
  compared: number;
  mismatches: Array<{ block: number; reason: string }>;
};

export type M1CopyResult = {
  ok: boolean;
  reason: string;
  recovery: M1RecoverResult;
  dump: M1Dump;
  plan: M1WritePlan;
  verify: M1VerifyResult;
};

/* ============================ 基础工具 ============================ */

function isHex(value: string, bytes: number): boolean {
  return new RegExp(`^[0-9A-Fa-f]{${bytes * 2}}$`).test(value);
}

/** 归一化密钥：去掉空格/冒号/连字符，转大写；非法返回 null。 */
export function m1NormalizeKey(input: string): string | null {
  const cleaned = String(input ?? '').replace(/[\s:－—–-]/g, '').toUpperCase();
  return isHex(cleaned, M1_KEY_BYTES) ? cleaned : null;
}

/** 从多行文本解析密码本，忽略注释行与非法行。 */
export function m1ParseKeybook(text: string): { keys: string[]; rejected: string[] } {
  const keys: string[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const key = m1NormalizeKey(line);
    if (!key) {
      rejected.push(line);
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return { keys, rejected };
}

/** 4 字节 UID 的 BCC = 四字节逐位异或（教学模型，便于校验块 0 一致性）。 */
export function m1ComputeBcc(uid: string): string {
  const u = m1NormalizeHex(uid, 4) || '00000000';
  let bcc = 0;
  for (let i = 0; i < 4; i += 1) bcc ^= parseInt(u.slice(i * 2, i * 2 + 2), 16);
  return bcc.toString(16).padStart(2, '0').toUpperCase();
}

export function m1NormalizeHex(value: string, bytes: number): string | null {
  const cleaned = String(value ?? '').replace(/[\s:－—–-]/g, '').toUpperCase();
  return isHex(cleaned, bytes) ? cleaned : null;
}

/** ASCII → hex（纯 JS，不依赖 Buffer，浏览器与 Node 都能跑）。 */
function asciiHex(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    out += text.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return out.toUpperCase();
}

/** 虚构示例数据块：固定、可复现、不含真实卡内容。 */
export function m1DemoBlock(sector: number, block: number): string {
  const tag = `DEMO-S${String(sector).padStart(2, '0')}-B${block}`;
  return asciiHex(tag).padEnd(M1_BLOCK_BYTES * 2, '0').slice(0, M1_BLOCK_BYTES * 2);
}

/** 扇区尾：KeyA(6) + 访问位(4) + GP(1) + KeyB(6)。 */
export function m1Trailer(keyA: string, keyB: string, accessBits = 'FF078069'): string {
  return `${keyA}${accessBits}00${keyB}`;
}

/* ============================ 教学卡构造 ============================ */

/**
 * 三种教学场景：
 *  - default：全部扇区用出厂默认密钥 → 直接可读可复制
 *  - weak：部分扇区换成内置字典里的弱密钥 → **字典恢复后仍能完整复制**
 *  - strong：两个扇区换成字典外的强密钥 → 恢复失败，复制应明确失败
 */
export function m1MakeTeachingCard(policy: M1CardPolicy): M1CardImage {
  const uid = 'DEADBEEF';
  const weakKeys = ['A0A1A2A3A4A5', 'D3F7D3F7D3F7', '000000000000', '123456789ABC'];
  const strongKeys = ['5A7C31E9B204', 'C4F0D81A63BE'];

  const sectors: M1SectorState[] = [];
  for (let s = 0; s < M1_SECTOR_COUNT_1K; s += 1) {
    let key = 'FFFFFFFFFFFF';
    if (policy === 'weak' && s >= 1 && s <= 4) key = weakKeys[(s - 1) % weakKeys.length];
    if (policy === 'strong' && (s === 7 || s === 8)) key = strongKeys[s === 7 ? 0 : 1];

    const blocks = [0, 1, 2, 3].map((b) =>
      b === M1_TRAILER_BLOCK ? m1Trailer(key, key) : m1DemoBlock(s, b),
    );
    if (s === 0) {
      blocks[0] = `${uid}${m1ComputeBcc(uid)}0804000201000000`.padEnd(32, '0').slice(0, 32);
    }
    sectors.push({
      index: s,
      keyA: key,
      keyB: key,
      accessBits: 'FF078069',
      blocks,
    });
  }

  return {
    uid,
    bcc: m1ComputeBcc(uid),
    sak: '08',
    atqa: '0400',
    sectorCount: M1_SECTOR_COUNT_1K,
    sectors,
  };
}

/** 空白目标卡：全零 UID / 全零数据块。 */
export function m1MakeBlankTarget(kind: M1TargetKind): M1Dump {
  const total = M1_SECTOR_COUNT_1K * M1_BLOCKS_PER_SECTOR;
  return {
    uid: '00000000',
    bcc: m1ComputeBcc('00000000'),
    sak: '08',
    atqa: '0400',
    sectorCount: M1_SECTOR_COUNT_1K,
    blocks: Array.from({ length: total }, () => '00'.repeat(M1_BLOCK_BYTES)),
    keys: Array.from({ length: M1_SECTOR_COUNT_1K }, () => ({ key: null, slot: null })),
  };
}

/* ============================ 可注入的硬件端口 ============================ */

/** 真机实现：拿候选密钥对某扇区做认证，成功返回 true。 */
export type M1Authenticator = (
  sector: number,
  key: string,
  slot: M1KeySlot,
) => boolean | Promise<boolean>;

/** 真机实现：用已恢复的密钥读取一块（16 字节 hex）。 */
export type M1BlockReader = (
  sector: number,
  block: number,
  key: string,
  slot: M1KeySlot,
) => string | Promise<string>;

/** 真机实现：写入一块。返回 false 表示该块写入失败（内核据此标为不一致，绝不伪造成功）。 */
export type M1BlockWriter = (
  blockIndex: number,
  data: string,
) => void | boolean | Promise<void | boolean>;

export function m1AuthenticatorFromImage(image: M1CardImage): M1Authenticator {
  return (sector, key, slot) => {
    const s = image.sectors[sector];
    if (!s) return false;
    const expected = slot === 'A' ? s.keyA : s.keyB;
    return m1NormalizeKey(key) === expected;
  };
}

export function m1ReaderFromImage(image: M1CardImage): M1BlockReader {
  return (sector, block, key, slot) => {
    const auth = m1AuthenticatorFromImage(image);
    if (!auth(sector, key, slot)) throw new Error(`扇区 ${sector} 认证失败`);
    const data = image.sectors[sector]?.blocks[block];
    if (data === undefined) throw new Error(`块 ${sector}/${block} 不存在`);
    return data;
  };
}

/* ============================ 密钥恢复（密码本 + 逐扇区尝试） ============================ */

export function m1CandidateKeys(keybook: M1Keybook): M1KeyCandidate[] {
  const out: M1KeyCandidate[] = keybook.useBuiltin
    ? M1_PUBLIC_DEFAULT_KEYS.map((item) => ({ ...item }))
    : [];
  const seen = new Set(out.map((item) => item.key));
  for (const raw of keybook.customKeys) {
    const key = m1NormalizeKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: '自定义密码本', origin: 'custom' });
  }
  return out;
}

/**
 * 逐扇区、逐槽位、逐候选密钥做认证尝试 —— 即「密码本 + 暴力尝试」。
 * ★ 尝试次数有上限、可中止；命中即停，不会无界跑。
 */
export async function m1RecoverSectorKeys(
  card: Pick<M1CardImage, 'sectorCount'>,
  options: M1RecoverOptions,
  authenticate: M1Authenticator,
): Promise<M1RecoverResult> {
  const candidates = m1CandidateKeys(options.keybook);
  const limit = Math.max(1, options.maxAttempts ?? M1_DEFAULT_MAX_ATTEMPTS);
  const sectors: M1SectorKeyResult[] = [];
  let totalAttempts = 0;
  let capped = false;
  let stopped = false;

  for (let s = 0; s < card.sectorCount; s += 1) {
    let hit: M1SectorKeyResult = {
      sector: s, key: null, slot: null, attempts: 0, hitBy: null, hitLabel: null,
    };
    outer: for (const candidate of candidates) {
      for (const slot of ['A', 'B'] as M1KeySlot[]) {
        if (totalAttempts >= limit) { capped = true; break outer; }
        totalAttempts += 1;
        hit.attempts += 1;
        if (options.onAttempt?.(totalAttempts, s, candidate.key, slot) === false) {
          stopped = true;
          break outer;
        }
        const ok = await authenticate(s, candidate.key, slot);
        if (ok) {
          hit = { ...hit, key: candidate.key, slot, hitBy: candidate.origin, hitLabel: candidate.label };
          break outer;
        }
      }
    }
    sectors.push(hit);
    if (capped || stopped) {
      // 剩余扇区统一记为未恢复，保证 dump 结构完整
      for (let rest = s + 1; rest < card.sectorCount; rest += 1) {
        sectors.push({
          sector: rest, key: null, slot: null, attempts: 0, hitBy: null, hitLabel: null,
        });
      }
      break;
    }
  }

  const recovered = sectors.filter((item) => item.key !== null).length;
  return {
    sectors,
    totalAttempts,
    capped,
    recovered,
    unreadableSectors: sectors.filter((item) => item.key === null).map((item) => item.sector),
  };
}

/* ============================ 读 dump / 写计划 / 写回 / 校验 ============================ */

export async function m1ReadDump(
  card: Pick<M1CardImage, 'uid' | 'bcc' | 'sak' | 'atqa' | 'sectorCount'>,
  recovery: M1RecoverResult,
  readBlock: M1BlockReader,
): Promise<M1Dump> {
  const blocks: M1DumpBlock[] = [];
  for (let s = 0; s < card.sectorCount; s += 1) {
    const hit = recovery.sectors[s];
    for (let b = 0; b < M1_BLOCKS_PER_SECTOR; b += 1) {
      if (!hit?.key || !hit.slot) {
        blocks.push(null);
        continue;
      }
      try {
        blocks.push(await readBlock(s, b, hit.key, hit.slot));
      } catch {
        blocks.push(null);
      }
    }
  }
  return {
    uid: card.uid,
    bcc: card.bcc,
    sak: card.sak,
    atqa: card.atqa,
    sectorCount: card.sectorCount,
    blocks,
    keys: recovery.sectors.map((hit) => ({ key: hit.key, slot: hit.slot })),
  };
}

/**
 * 写入计划：
 *  - 块 0（UID + BCC）只有 UID 可写卡能改；普通白卡写不进去。
 *  - 未恢复扇区的所有块都不能写（否则会写出半张坏卡）。
 *  - 扇区尾（每扇区第 4 块）含密钥，必须整块写回。
 */
export function m1PlanWrite(dump: M1Dump, targetKind: M1TargetKind): M1WritePlan {
  const writable: number[] = [];
  const skipped: M1WritePlan['skipped'] = [];
  for (const [index, data] of dump.blocks.entries()) {
    if (index === 0 && targetKind !== 'uid-writable') {
      skipped.push({ block: index, reason: 'uid-read-only' });
      continue;
    }
    if (data === null) {
      const sector = Math.floor(index / M1_BLOCKS_PER_SECTOR);
      skipped.push({
        block: index,
        reason: dump.keys[sector]?.key ? 'empty-block' : 'no-key',
      });
      continue;
    }
    writable.push(index);
  }
  return { targetKind, writable, skipped };
}

export async function m1WriteDump(
  dump: M1Dump,
  plan: M1WritePlan,
  writeBlock: M1BlockWriter,
): Promise<M1Dump> {
  const written = m1MakeBlankTarget(plan.targetKind);
  written.blocks = Array.from({ length: dump.blocks.length }, () => '00'.repeat(M1_BLOCK_BYTES));
  written.keys = dump.keys.map((item) => ({ ...item }));
  for (const index of plan.writable) {
    const data = dump.blocks[index];
    if (data === null) continue;
    const outcome = await writeBlock(index, data);
    // ★ 真机可能写不进（普通卡块 0、扇区尾权限、卡片中途离开）。
    //   返回 false 时保持空白内容，让后续逐块校验如实报不一致。
    if (outcome === false) continue;
    written.blocks[index] = data;
  }
  // 只有块 0 真的写成功了，目标卡的卡号才算被改写
  if (plan.writable.includes(0) && written.blocks[0] === dump.blocks[0]) {
    written.uid = dump.uid;
    written.bcc = dump.bcc;
    written.sak = dump.sak;
    written.atqa = dump.atqa;
  }
  written.sectorCount = dump.sectorCount;
  return written;
}

export function m1VerifyCopy(source: M1Dump, written: M1Dump): M1VerifyResult {
  const mismatches: M1VerifyResult['mismatches'] = [];
  const total = Math.max(source.blocks.length, written.blocks.length);
  for (let index = 0; index < total; index += 1) {
    const a = source.blocks[index];
    const b = written.blocks[index];
    if (a === null || a === undefined) {
      mismatches.push({ block: index, reason: '源卡该扇区未读出，无法比对' });
    } else if (a !== b) {
      mismatches.push({ block: index, reason: index === 0 ? '块 0 未写入（目标卡 UID 不可改）' : '写入内容不一致' });
    }
  }
  if (source.uid !== written.uid) {
    mismatches.push({ block: 0, reason: 'UID 不一致' });
  }
  return { ok: mismatches.length === 0, compared: total, mismatches };
}

/* ============================ 顶层编排（模拟器 / 真机共用） ============================ */

/**
 * 复制结论的唯一判定出口 —— 课程模拟器与真机链都调它，
 * 不允许各自拼「成功/失败」文案（否则会出现两套口径）。
 */
export function m1CopyReason(
  recovery: M1RecoverResult,
  plan: M1WritePlan,
  verify: M1VerifyResult,
): string {
  let reason = '逐块校验一致，复制完成';
  if (recovery.unreadableSectors.length > 0) {
    reason = `扇区 ${recovery.unreadableSectors.join('、')} 的密钥不在密码本中，dump 不完整，复制失败`;
  } else if (plan.skipped.some((item) => item.reason === 'uid-read-only')) {
    reason = '目标卡块 0 不可写，UID 无法复制；需使用可写 UID 的空白卡';
  } else if (!verify.ok) {
    reason = verify.mismatches.some((item) => item.block === 0)
      ? '块 0 写入失败：目标卡不支持改写卡号，或卡号校验不一致'
      : `写入后有 ${verify.mismatches.length} 块不一致，复制失败`;
  }
  if (recovery.capped) reason += '（已达到密钥尝试上限）';
  return reason;
}

/**
 * 一条链跑完：识别 → 密钥恢复 → 读 dump → 写计划 → 写回 → 逐块校验。
 * 真机只需替换 authenticate / readBlock / writeBlock 三个端口实现。
 */
export async function m1CopyCard(params: {
  card: M1CardImage;
  targetKind: M1TargetKind;
  options: M1RecoverOptions;
  authenticate: M1Authenticator;
  readBlock: M1BlockReader;
  writeBlock: M1BlockWriter;
}): Promise<M1CopyResult> {
  const recovery = await m1RecoverSectorKeys(params.card, params.options, params.authenticate);
  const dump = await m1ReadDump(params.card, recovery, params.readBlock);
  const plan = m1PlanWrite(dump, params.targetKind);
  const written = await m1WriteDump(dump, plan, params.writeBlock);
  const verify = m1VerifyCopy(dump, written);
  const reason = m1CopyReason(recovery, plan, verify);

  return { ok: verify.ok, reason, recovery, dump, plan, verify };
}
