/**
 * M1 门禁卡复制教学内核 · 正式单测
 *
 * ★ 覆盖四条真实路径（不是只断言函数存在）：
 *   ① 出厂默认密钥 + UID 可写卡 → 完整复制成功
 *   ② 简单加密（弱密钥扇区）+ 内置密码本 → 字典恢复后仍完整复制成功
 *   ③ 字典外强密钥 → dump 不完整 → 复制失败并给出扇区号
 *   ④ 普通白卡 → 块 0 不可写 → UID 复制失败
 *   另有：自定义密码本生效、尝试上限、提前中止、浏览器无 Buffer 依赖。
 */
import { describe, expect, it } from 'vitest';
import {
  M1_BLOCKS_PER_SECTOR,
  M1_PUBLIC_DEFAULT_KEYS,
  M1_SECTOR_COUNT_1K,
  m1AuthenticatorFromImage,
  m1ComputeBcc,
  m1CopyCard,
  m1DemoBlock,
  m1MakeBlankTarget,
  m1MakeTeachingCard,
  m1NormalizeKey,
  m1ParseKeybook,
  m1PlanWrite,
  m1ReadDump,
  m1ReaderFromImage,
  m1RecoverSectorKeys,
  m1VerifyCopy,
  type M1CardImage,
  type M1Keybook,
  type M1TargetKind,
} from './core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KEYBOOK: M1Keybook = { useBuiltin: true, customKeys: [] };

function ports(card: M1CardImage) {
  const target = m1MakeBlankTarget('uid-writable');
  const blocks = [...target.blocks];
  return {
    authenticate: m1AuthenticatorFromImage(card),
    readBlock: m1ReaderFromImage(card),
    writeBlock: (index: number, data: string) => { blocks[index] = data; },
    blocks,
  };
}

async function copy(policy: 'default' | 'weak' | 'strong', targetKind: M1TargetKind = 'uid-writable', keybook = KEYBOOK) {
  const card = m1MakeTeachingCard(policy);
  const p = ports(card);
  const result = await m1CopyCard({
    card,
    targetKind,
    options: { keybook },
    authenticate: p.authenticate,
    readBlock: p.readBlock,
    writeBlock: p.writeBlock,
  });
  return { card, ...p, result };
}

describe('基础工具', () => {
  it('密钥归一化接受空格/冒号/连字符，非法值返回 null', () => {
    expect(m1NormalizeKey('ff:ff:ff:ff:ff:ff')).toBe('FFFFFFFFFFFF');
    expect(m1NormalizeKey('A0 A1 A2 A3 A4 A5')).toBe('A0A1A2A3A4A5');
    expect(m1NormalizeKey('123456')).toBe(null);
    expect(m1NormalizeKey('ZZZZZZZZZZZZ')).toBe(null);
  });

  it('密码本解析去重、忽略注释、报告非法行', () => {
    const parsed = m1ParseKeybook('# 注释\nFFFFFFFFFFFF\nff:ff:ff:ff:ff:ff\n// skip\nA0A1A2A3A4A5\nbad\n');
    expect(parsed.keys).toEqual(['FFFFFFFFFFFF', 'A0A1A2A3A4A5']);
    expect(parsed.rejected).toEqual(['bad']);
  });

  it('BCC 为 UID 四字节异或，示例块可复现且长度恰好 16 字节', () => {
    expect(m1ComputeBcc('DEADBEEF')).toBe('22');
    expect(m1ComputeBcc('00000000')).toBe('00');
    expect(m1DemoBlock(3, 1)).toHaveLength(32);
    expect(m1DemoBlock(3, 1)).toBe(m1DemoBlock(3, 1));
  });

  it('教学卡是 1K 结构：16 扇区 × 4 块，且数据全是虚构 DEMO 值', () => {
    const card = m1MakeTeachingCard('weak');
    expect(card.sectors).toHaveLength(M1_SECTOR_COUNT_1K);
    for (const sector of card.sectors) expect(sector.blocks).toHaveLength(M1_BLOCKS_PER_SECTOR);
    expect(card.uid).toBe('DEADBEEF');
    expect(card.sectors[0].blocks[0].startsWith('DEADBEEF22')).toBe(true);
  });
});

describe('密钥恢复（密码本 + 逐扇区认证尝试）', () => {
  it('出厂默认密钥：每扇区第一次尝试就命中', async () => {
    const card = m1MakeTeachingCard('default');
    const result = await m1RecoverSectorKeys(card, { keybook: KEYBOOK }, m1AuthenticatorFromImage(card));
    expect(result.recovered).toBe(M1_SECTOR_COUNT_1K);
    expect(result.unreadableSectors).toEqual([]);
    expect(result.totalAttempts).toBe(M1_SECTOR_COUNT_1K);
    expect(result.sectors[0].key).toBe('FFFFFFFFFFFF');
  });

  it('★ 简单加密：弱密钥扇区靠内置密码本恢复，全部 16 扇区可读', async () => {
    const card = m1MakeTeachingCard('weak');
    const result = await m1RecoverSectorKeys(card, { keybook: KEYBOOK }, m1AuthenticatorFromImage(card));
    expect(result.recovered).toBe(M1_SECTOR_COUNT_1K);
    expect(result.unreadableSectors).toEqual([]);
    expect(result.sectors[1].hitBy).toBe('builtin');
    expect(result.sectors[1].key).toBe('A0A1A2A3A4A5');
    expect(result.totalAttempts).toBeLessThan(M1_PUBLIC_DEFAULT_KEYS.length * 2 * M1_SECTOR_COUNT_1K);
  });

  it('字典外强密钥：7/8 扇区未恢复，结果明确列出扇区号', async () => {
    const card = m1MakeTeachingCard('strong');
    const result = await m1RecoverSectorKeys(card, { keybook: KEYBOOK }, m1AuthenticatorFromImage(card));
    expect(result.unreadableSectors).toEqual([7, 8]);
    expect(result.recovered).toBe(14);
  });

  it('★ 自定义密码本生效：把强密钥加进密码本后即可恢复', async () => {
    const card = m1MakeTeachingCard('strong');
    const keybook: M1Keybook = {
      useBuiltin: true,
      customKeys: ['5A7C31E9B204', 'C4F0D81A63BE'],
    };
    const result = await m1RecoverSectorKeys(card, { keybook }, m1AuthenticatorFromImage(card));
    expect(result.unreadableSectors).toEqual([]);
    expect(result.sectors[7].hitBy).toBe('custom');
    expect(result.sectors[8].hitBy).toBe('custom');
  });

  it('尝试次数有硬上限，不会因大字典无界跑', async () => {
    const card = m1MakeTeachingCard('strong');
    const result = await m1RecoverSectorKeys(
      card,
      { keybook: KEYBOOK, maxAttempts: 5 },
      m1AuthenticatorFromImage(card),
    );
    expect(result.capped).toBe(true);
    expect(result.totalAttempts).toBe(5);
    expect(result.unreadableSectors.length).toBeGreaterThan(0);
  });

  it('onAttempt 返回 false 可提前中止', async () => {
    const card = m1MakeTeachingCard('default');
    const result = await m1RecoverSectorKeys(
      card,
      { keybook: KEYBOOK, onAttempt: (attempt) => attempt < 3 },
      m1AuthenticatorFromImage(card),
    );
    expect(result.totalAttempts).toBe(3);
    expect(result.recovered).toBe(2);
  });
});

describe('完整复制链路', () => {
  it('① 默认密钥 + UID 可写卡 → 逐块校验一致，复制成功', async () => {
    const { result } = await copy('default');
    expect(result.ok).toBe(true);
    expect(result.verify.ok).toBe(true);
    expect(result.verify.compared).toBe(64);
    expect(result.verify.mismatches).toEqual([]);
    expect(result.plan.skipped).toEqual([]);
    expect(result.reason).toContain('复制完成');
  });

  it('★ ② 简单加密卡 → 字典恢复后完整复制成功（本需求的核心验收）', async () => {
    const { result } = await copy('weak');
    expect(result.recovery.unreadableSectors).toEqual([]);
    expect(result.plan.skipped).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.verify.ok).toBe(true);
    expect(result.reason).toContain('复制完成');
  });

  it('③ 强加密卡 → dump 不完整，复制失败且不假装成功', async () => {
    const { result } = await copy('strong');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('7、8');
    expect(result.dump.blocks[7 * 4]).toBe(null);
    expect(result.plan.skipped.some((item) => item.reason === 'no-key')).toBe(true);
  });

  it('④ 普通白卡 → 块 0 不可写，UID 复制失败并说明需要可写 UID 卡', async () => {
    const { result } = await copy('default', 'normal');
    expect(result.ok).toBe(false);
    expect(result.plan.skipped[0]).toEqual({ block: 0, reason: 'uid-read-only' });
    expect(result.reason).toContain('块 0 不可写');
    expect(result.verify.mismatches.some((item) => item.block === 0)).toBe(true);
  });

  it('自定义密码本 + 强密钥卡：补上密钥后整条链路也能复制成功', async () => {
    const { result } = await copy('strong', 'uid-writable', {
      useBuiltin: true,
      customKeys: ['5A7C31E9B204', 'C4F0D81A63BE'],
    });
    expect(result.ok).toBe(true);
    expect(result.verify.mismatches).toEqual([]);
  });

  it('写计划与校验可单独使用：未恢复扇区的块一律不写', async () => {
    const card = m1MakeTeachingCard('strong');
    const recovery = await m1RecoverSectorKeys(card, { keybook: KEYBOOK }, m1AuthenticatorFromImage(card));
    const dump = await m1ReadDump(card, recovery, m1ReaderFromImage(card));
    const plan = m1PlanWrite(dump, 'uid-writable');
    expect(plan.writable).not.toContain(7 * 4);
    expect(plan.writable).not.toContain(8 * 4 + 3);
    expect(m1VerifyCopy(dump, m1MakeBlankTarget('uid-writable')).ok).toBe(false);
  });
});

describe('跨环境约束', () => {
  it('★ 内核不得依赖 Node Buffer（课程模拟器跑在浏览器 WebView 里）', () => {
    const source = readFileSync(fileURLToPath(new URL('./core.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/\bBuffer\./);
    expect(source).not.toMatch(/from ['"]node:/);
  });
});
